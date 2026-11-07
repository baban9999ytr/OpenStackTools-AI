// Uses the production HTTPS image and Chromium's user trust store. No TLS bypass.
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";

const base = "https://ai.localhost";
const email = `browser-${randomBytes(6).toString("hex")}@example.test`;
const password = "LocalBrowserPassword123!";
const orgName = "Local Browser Test";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
let organizationId;
try {
  const app = await page.goto(`${base}/app`, { waitUntil: "networkidle" });
  expect(app?.status()).toBe(200);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Organization name").fill(orgName);
  await page.getByLabel("Your name").fill("Synthetic Browser Owner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");

  let token;
  for (let attempt = 0; attempt < 30 && !token; attempt++) {
    const list = await (await fetch("http://127.0.0.1:8026/api/v1/messages")).json();
    const message = list.messages.find((item) =>
      item.Subject.endsWith("Verify your email") &&
      item.To.some((recipient) => recipient.Address === email),
    );
    if (message) {
      const detail = await (await fetch(`http://127.0.0.1:8026/api/v1/message/${message.ID}`)).json();
      token = detail.Text.match(/#verify=([A-Za-z0-9_-]+)/)?.[1];
    }
    if (!token) await new Promise((resolve) => setTimeout(resolve, 200));
  }
  expect(token).toBeTruthy();
  await page.goto(`${base}/app/#verify=${token}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Assistants", exact: true })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  const cookie = (await context.cookies()).find((item) => item.name === "ost_session");
  expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: "Lax", domain: "ai.localhost" });

  const me = await page.evaluate(async () => {
    const response = await fetch("/api/auth/me", { headers: { Origin: location.origin } });
    return response.json();
  });
  organizationId = me.organizations[0].id;
  const menu = page.getByRole("button", { name: "Menu" });
  await menu.focus();
  await menu.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByRole("heading", { name: "Asistanlar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Görüşmeler" }).click();
  await expect(page.getByRole("heading", { name: "Görüşmeler" }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await page.getByRole("button", { name: "Çıkış yap" }).click();
  await expect(page.getByRole("heading", { name: "Tekrar hoş geldiniz" })).toBeVisible();
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.getByRole("heading", { name: "Asistanlar", exact: true })).toBeVisible();
  console.log("PASS: Chromium trusted HTTPS, registration/verification, login/logout, cookie flags, mobile keyboard navigation, EN/TR, light/dark, accessibility");
} finally {
  if (organizationId) {
    let status = await page.evaluate(async ({ id, name, password: pass }) => {
      const response = await fetch(`/api/organizations/${id}/tenant`, {
        method: "DELETE", credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ organizationName: name, password: pass }),
      });
      return response.status;
    }, { id: organizationId, name: orgName, password });
    if (status === 401) {
      await page.evaluate(async ({ email: address, password: pass }) => {
        await fetch("/api/auth/login", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify({ email: address, password: pass }),
        });
      }, { email, password });
      status = await page.evaluate(async ({ id, name, password: pass }) => {
        const response = await fetch(`/api/organizations/${id}/tenant`, {
          method: "DELETE", credentials: "include",
          headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
          body: JSON.stringify({ organizationName: name, password: pass }),
        });
        return response.status;
      }, { id: organizationId, name: orgName, password });
    }
    if (status !== 200) {
      console.error(`Synthetic browser tenant cleanup requires attention: HTTP ${status}`);
      process.exitCode = 1;
    }
  }
  await browser.close();
}
