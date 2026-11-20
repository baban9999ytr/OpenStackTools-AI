// Run with mongosh against the application database using a read-only operator account.
// Counts, ages and aggregate USD microdollars only. No tenant IDs, messages, contact records or provider bodies.
const now = new Date();
const hourAgo = new Date(now.getTime() - 3_600_000);
const fifteenMinutesAgo = new Date(now.getTime() - 900_000);
const requests = db.getCollection("widgetrequests");
const failedInLastHour = (filter) =>
  requests.countDocuments({ status: "failed", updatedAt: { $gte: hourAgo }, ...filter });
const oldest = requests.find({ status: { $in: ["queued", "processing"] } }, { createdAt: 1, _id: 0 })
  .sort({ createdAt: 1 }).limit(1).toArray()[0];
const chargeTotal = (filter, amount, bucket) => [
  { $match: filter },
  { $group: { _id: bucket, count: { $sum: 1 }, micros: { $sum: amount } } },
];
// Read both charge buckets at the same point in time. Finalization can move
// a reservation into usageevents between two separate collection reads.
const totals = requests.aggregate([
  ...chargeTotal({ status: { $in: ["queued", "processing"] }, reservedMicros: { $gt: 0 } }, "$reservedMicros", "active"),
  { $unionWith: { coll: "usageevents", pipeline: chargeTotal({ billingStatus: "uncertain" }, "$estimatedCostMicros", "uncertain") } },
], { readConcern: { level: "snapshot" } }).toArray();
const active = totals.find(({ _id }) => _id === "active") ?? { count: 0, micros: 0 };
const uncertain = totals.find(({ _id }) => _id === "uncertain") ?? { count: 0, micros: 0 };
print(JSON.stringify({
  observedAt: now,
  queued: requests.countDocuments({ status: "queued" }),
  processing: requests.countDocuments({ status: "processing" }),
  oldestActiveSeconds: oldest ? Math.max(0, Math.floor((now - oldest.createdAt) / 1000)) : null,
  expiredProcessingLeases: requests.countDocuments({ status: "processing", leaseUntil: { $lt: now } }),
  activeReservations: active.count,
  activeReservationMicros: active.micros,
  uncertainUsageEvents: uncertain.count,
  uncertainCostMicros: uncertain.micros,
  alerts: uncertain.count ? [{ code: "uncertain_ai_charges", count: uncertain.count, estimatedCostMicros: uncertain.micros }] : [],
  providerFailuresLastHour: failedInLastHour({ errorCode: /^provider_/ }),
  budgetFailuresLastHour: failedInLastHour({ errorCode: "budget_exhausted" }),
  websiteFailuresLastHour: failedInLastHour({ channel: "web" }),
  inactiveHandoffsOver15Minutes: db.getCollection("conversations").countDocuments({
    status: "handoff", updatedAt: { $lt: fifteenMinutesAgo },
  }),
}));
