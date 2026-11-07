import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const me = { user: { id: "u1", name: "Pilot Owner", email: "owner@example.test" }, organizations: [{ id: "org1", name: "Pilot Business", role: "owner" }] };
async function mockDashboard(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/me", route => route.fulfill({ json: me }));
  await page.route("**/api/organizations/org1/assistants", route => route.fulfill({ json: { assistants: [] } }));
  await page.route("**/api/organizations/org1/conversations", route => route.fulfill({ json: { conversations: [] } }));
  await page.route("**/api/auth/sessions", route => route.fulfill({ json: { sessions: [] } }));
}

test("direct app route, theme and Turkish navigation remain accessible", async ({ page }) => {
  await mockDashboard(page);
  await page.goto("http://127.0.0.1:5173/app");
  await expect(page.getByRole("heading", { name: "Assistants", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByRole("heading", { name: "Asistanlar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Görüşmeler" }).click();
  await expect(page.getByRole("heading", { name: "Görüşmeler" }).first()).toBeVisible();
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(a11y.violations).toEqual([]);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
});

test("mobile menu works by keyboard without hiding sign out", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDashboard(page);
  await page.goto("http://127.0.0.1:5173/app");
  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toBeVisible();
  await menu.focus();
  await menu.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Conversations" }).click();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("email verification link works under /app and clears token fragment", async ({ page }) => {
  let verified = false;
  let token = "";
  await page.route("**/api/auth/me", route => route.fulfill(verified ? { json: me } : { status: 401, json: { error: "Authentication required" } }));
  await page.route("**/api/auth/verify-email", route => {
    token = (route.request().postDataJSON() as { token: string }).token;
    verified = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/organizations/org1/assistants", route => route.fulfill({ json: { assistants: [] } }));
  await page.route("**/api/organizations/org1/conversations", route => route.fulfill({ json: { conversations: [] } }));
  await page.goto("http://127.0.0.1:5173/app/#verify=pilot-token");
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Assistants", exact: true })).toBeVisible();
  expect(token).toBe("pilot-token");
  expect(new URL(page.url()).hash).toBe("");
});

test("light sign-in remains accessible on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/auth/me", route => route.fulfill({ status: 401, json: { error: "Authentication required" } }));
  await page.goto("http://127.0.0.1:5173/app");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(a11y.violations).toEqual([]);
});

test("receptionist dashboard works on mobile in Turkish and dark theme", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDashboard(page);
  await page.route("**/api/organizations/org1/receptionist/config", route => route.fulfill({ json: {
    timeZone: "Europe/Istanbul", openingHours: [{ day: 1, startMinute: 540, endMinute: 1020 }],
    staff: [{ id: "staff1", name: "Pilot Staff", windows: [{ day: 1, startMinute: 540, endMinute: 1020 }] }],
  } }));
  await page.route("**/api/organizations/org1/receptionist/appointments", route => route.fulfill({ json: { appointments: [] } }));
  await page.route("**/api/organizations/org1/receptionist/customers", route => route.fulfill({ json: { customers: [] } }));
  await page.route("**/api/organizations/org1/receptionist/actions", route => route.fulfill({ json: { actions: [] } }));
  await page.goto("http://127.0.0.1:5173/app");
  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: "Resepsiyon" }).click();
  await expect(page.getByRole("heading", { name: "Randevular" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Çalışma saatleri" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Personel müsaitliği" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(a11y.violations).toEqual([]);
});
