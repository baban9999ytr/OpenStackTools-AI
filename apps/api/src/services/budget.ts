import mongoose from "mongoose";
import { BudgetWindow, Organization, WidgetRequest } from "../models/index.js";
import { env } from "../config/env.js";
import { MAX_COMPLETION_TOKENS, type Turn } from "./ai.js";
import { costMicros } from "./money.js";
import type { EffectiveModel } from "./model-config.js";

export class BudgetExceeded extends Error {
  constructor() {
    super("Organization AI budget exhausted");
  }
}
export const utcPeriods = (now = new Date()) => ({
  day: new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ),
  month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
});
export const measuredCostMicros = (
  inputTokens: number,
  outputTokens: number,
  details: {
    cachedInputTokens?: number;
    cacheWriteTokens?: number;
    usageBreakdownKnown?: boolean;
  } = {},
  configuration?: EffectiveModel,
) => {
  const prices = configuration?.prices ?? { input: env.inputPriceMicrosPerMillion,
    cachedInput: env.cachedInputPriceMicrosPerMillion, cacheWrite: env.cacheWritePriceMicrosPerMillion,
    output: env.outputPriceMicrosPerMillion };
  const cached = details.cachedInputTokens ?? 0;
  const written = details.cacheWriteTokens ?? 0;
  if (
    ![inputTokens, outputTokens, cached, written].every(
      (count) => Number.isSafeInteger(count) && count >= 0,
    ) || cached + written > inputTokens
  ) throw new Error("Invalid provider token breakdown");
  const inputCost = details.usageBreakdownKnown
    ? costMicros(inputTokens - cached - written, prices.input) +
      costMicros(cached, prices.cachedInput) +
      costMicros(written, prices.cacheWrite)
    : costMicros(
        inputTokens,
        Math.max(
          prices.input,
          prices.cachedInput,
          prices.cacheWrite,
        ),
      );
  const total = inputCost + costMicros(outputTokens, prices.output);
  if (!Number.isSafeInteger(total)) throw new Error("Estimated cost is too large");
  return total;
};

// Deliberately conservative: byte count is multiplied before adding a fixed
// allowance for message framing. Actual provider usage is reconciled afterward.
export const maximumReservationMicros = (
  instructions: string,
  history: Turn[],
  configuration?: EffectiveModel,
) => {
  const bytes =
    Buffer.byteLength(instructions) +
    history.reduce((sum, turn) => sum + Buffer.byteLength(turn.text), 0);
  const upperInputTokens = bytes * 4 + 4096;
  if (!Number.isSafeInteger(upperInputTokens))
    throw new Error("Context too large");
  if (configuration?.mode === "product" && upperInputTokens > 272_000)
    throw new Error("Context exceeds verified short-context pricing boundary");
  // A cache write can cost more than ordinary input. Reserve for that worst
  // case; three microdollars cover per-category rounding on settlement.
  return measuredCostMicros(upperInputTokens, MAX_COMPLETION_TOKENS, {}, configuration) + 3;
};

const ensureWindow = async (
  organizationId: mongoose.Types.ObjectId,
  kind: "day" | "month",
  periodStart: Date,
  limitMicros: number,
) => {
  try {
    await BudgetWindow.updateOne(
      { organizationId, kind, periodStart },
      { $setOnInsert: { spentMicros: 0, reservedMicros: 0, limitMicros } },
      { upsert: true },
    );
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
};

export const reserveBudget = async (
  requestId: mongoose.Types.ObjectId,
  amount: number,
) => {
  const request = await WidgetRequest.findById(requestId).lean();
  if (!request || request.status !== "processing") return false;
  const organization = await Organization.findById(
    request.organizationId,
  ).lean();
  if (
    !organization ||
    !Number.isSafeInteger(organization.dailyBudgetMicros) ||
    !Number.isSafeInteger(organization.monthlyBudgetMicros)
  ) {
    throw new Error(
      "Organization budget is not configured; run the pilot migration",
    );
  }
  const periods = utcPeriods();
  await ensureWindow(
    request.organizationId,
    "day",
    periods.day,
    organization.dailyBudgetMicros,
  );
  await ensureWindow(
    request.organizationId,
    "month",
    periods.month,
    organization.monthlyBudgetMicros,
  );
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const fresh = await WidgetRequest.findOne({
        _id: requestId,
        status: "processing",
        reservedMicros: 0,
      }).session(session);
      if (!fresh) throw new Error("Request lease was lost");
      for (const [kind, periodStart, limitMicros] of [
        ["day", periods.day, organization.dailyBudgetMicros],
        ["month", periods.month, organization.monthlyBudgetMicros],
      ] as const) {
        const updated = await BudgetWindow.findOneAndUpdate(
          {
            organizationId: request.organizationId,
            kind,
            periodStart,
            $expr: {
              $lte: [
                { $add: ["$spentMicros", "$reservedMicros", amount] },
                limitMicros,
              ],
            },
          },
          { $inc: { reservedMicros: amount }, $set: { limitMicros } },
          { session, returnDocument: "after" },
        );
        if (!updated) throw new BudgetExceeded();
      }
      await WidgetRequest.updateOne(
        { _id: requestId, status: "processing" },
        {
          $set: {
            reservedMicros: amount,
            reservedDay: periods.day,
            reservedMonth: periods.month,
          },
        },
        { session },
      );
    });
    return true;
  } finally {
    await session.endSession();
  }
};

export const settleWindows = async (
  request: {
    organizationId: mongoose.Types.ObjectId;
    reservedMicros: number;
    reservedDay?: Date | null;
    reservedMonth?: Date | null;
  },
  actualMicros: number,
  session: mongoose.ClientSession,
) => {
  if (!request.reservedMicros || !request.reservedDay || !request.reservedMonth)
    return;
  for (const [kind, periodStart] of [
    ["day", request.reservedDay],
    ["month", request.reservedMonth],
  ] as const) {
    const result = await BudgetWindow.updateOne(
      {
        organizationId: request.organizationId,
        kind,
        periodStart,
        reservedMicros: { $gte: request.reservedMicros },
      },
      {
        $inc: {
          reservedMicros: -request.reservedMicros,
          spentMicros: actualMicros,
        },
      },
      { session },
    );
    if (result.modifiedCount !== 1)
      throw new Error("Budget reservation missing");
  }
};
