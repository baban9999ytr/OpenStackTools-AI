import nodemailer from "nodemailer";
import { env } from "../config/env.js";

type Purpose = "verify" | "reset" | "invite";
type Mail = { to: string; purpose: Purpose; token: string };
export const accountLink = (purpose: Purpose, token: string) =>
  `${env.dashboardOrigin}/app/#${purpose}=${encodeURIComponent(token)}`;
const labels = {
  verify: { subject: "Verify your email", action: "verify your email" },
  reset: { subject: "Reset your password", action: "reset your password" },
  invite: { subject: "Accept your invitation", action: "accept your invitation" },
} as const;
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character,
  );
export const accountMailContent = (purpose: Purpose, token: string) => {
  const link = accountLink(purpose, token);
  const action = labels[purpose].action;
  return {
    subject: `OpenStackTools AI — ${labels[purpose].subject}`,
    text: `Open this link to ${action}: ${link}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Open this link to ${action}:</p><p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p><p>If you did not request this, you can ignore this email.</p>`,
  };
};
const transport = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: env.smtpPort === 465,
  requireTLS: env.smtpRequireTls && env.smtpPort !== 465,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
  auth:
    env.smtpUser && env.smtpPassword
      ? { user: env.smtpUser, pass: env.smtpPassword }
      : undefined,
});
let send = async ({ to, purpose, token }: Mail) => {
  await transport.sendMail({
    from: env.smtpFrom,
    to,
    ...accountMailContent(purpose, token),
  });
};
export const sendAccountMail = (mail: Mail) => send(mail);
export const setMailSenderForTests = (sender: typeof send) => {
  send = sender;
};
