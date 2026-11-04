import nodemailer from "nodemailer";
import { env } from "../config/env.js";

type Purpose = "verify" | "reset" | "invite";
type Mail = { to: string; purpose: Purpose; token: string };
const transport = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: env.smtpPort === 465,
  auth:
    env.smtpUser && env.smtpPassword
      ? { user: env.smtpUser, pass: env.smtpPassword }
      : undefined,
});
let send = async ({ to, purpose, token }: Mail) => {
  const action =
    purpose === "verify" ? "verify" : purpose === "reset" ? "reset" : "invite";
  const link = `${env.dashboardOrigin}/#${action}=${encodeURIComponent(token)}`;
  await transport.sendMail({
    from: env.smtpFrom,
    to,
    subject: `OpenStackTools AI ${purpose === "invite" ? "invitation" : purpose === "reset" ? "password reset" : "email verification"}`,
    text: `Open this link to ${purpose === "invite" ? "accept your invitation" : purpose === "reset" ? "reset your password" : "verify your email"}: ${link}\n\nIf you did not request this, you can ignore this email.`,
  });
};
export const sendAccountMail = (mail: Mail) => send(mail);
export const setMailSenderForTests = (sender: typeof send) => {
  send = sender;
};
