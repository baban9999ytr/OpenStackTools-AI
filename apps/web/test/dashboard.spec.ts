import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const me = { user: { id: "u1", name: "Pilot Owner", email: "owner@example.test" }, organizations: [{ id: "org1", name: "Pilot Business", role: "owner" }] };
const modelOptions = { models: {
  "gpt-6-luna": { name: "Luna", efforts: ["none", "low", "medium"], defaultEffort: "medium", tiers: ["default"], prices: { input: 100000, output: 500000 } },
  "gpt-6.1-terra": { name: "Terra", efforts: ["none", "low", "medium"], defaultEffort: "medium", tiers: ["default"], prices: { input: 1000000, output: 5000000 } },
  "gpt-6.1-sol": { name: "Sol", efforts: ["low", "medium"], defaultEffort: "medium", tiers: ["default"], prices: { input: 2000000, output: 10000000 } },
}, enabled: ["gpt-6-luna", "gpt-6.1-terra", "gpt-6.1-sol"], maxReasoningEffort: "medium",
  pricingVersion: "test-v1", pricingSource: "https://developers.openai.com/api/docs/pricing",
  defaultSelection: { mode: "preset", profile: "balanced" } };
test.beforeEach(async ({ page }) => { await page.route("**/api/organizations/org1/model-options",
  route => route.fulfill({ json: modelOptions })); });
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

test("assistant response length is accessible and persists through editing in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/auth/me", route => route.fulfill({ json: me }));
  const assistant = { _id: "a1", name: "Demo assistant", instructions: "Help visitors with verified information.",
    responseLength: "balanced", tone: "warm", bookingNameRequired: false, defaultAppointmentDurationMinutes: 30,
    publicKey: "ost_test", allowedOrigins: ["http://127.0.0.1:5173"], active: true };
  await page.route("**/api/organizations/org1/assistants**", route => {
    if (route.request().method() === "PATCH") {
      Object.assign(assistant, route.request().postDataJSON());
      return route.fulfill({ json: { assistant } });
    }
    return route.fulfill({ json: { assistants: [assistant] } });
  });
  await page.route("**/api/organizations/org1/conversations", route => route.fulfill({ json: { conversations: [] } }));
  await page.goto("http://127.0.0.1:5173/app");
  await page.getByRole("button", { name: "Edit settings" }).click();
  const select = page.getByRole("combobox", { name: /AI response length/ });
  await expect(select).toHaveValue("balanced");
  await select.selectOption("detailed");
  await page.getByRole("combobox", { name: "Conversation strategy" }).selectOption("real_estate");
  await page.getByRole("combobox", { name: "Tone" }).selectOption("concierge");
  await page.getByRole("combobox", { name: "Default viewing duration" }).selectOption("60");
  await page.getByRole("combobox", { name: "Ask for a booking name" }).selectOption("yes");
  await page.getByRole("combobox", { name: "Booking contact method" }).selectOption("email");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(() => (assistant as typeof assistant & { bookingContactMethod?: string }).bookingContactMethod).toBe("email");
  await expect.poll(() => assistant.responseLength).toBe("detailed");
  await expect.poll(() => (assistant as typeof assistant & {conversationStrategy?: string}).conversationStrategy).toBe("real_estate");
  await expect.poll(() => assistant.tone).toBe("concierge");
  await expect.poll(() => assistant.defaultAppointmentDurationMinutes).toBe(60);
  await expect.poll(() => assistant.bookingNameRequired).toBe(true);
  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("button", { name: "Ayarları düzenle" }).click();
  await expect(page.getByRole("combobox", { name: /Yapay zekâ yanıt uzunluğu/ })).toHaveValue("detailed");
  await expect(page.getByRole("combobox", { name: "Üslup" })).toHaveValue("concierge");
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(a11y.violations).toEqual([]);
});

test("model profiles and advanced settings save a validated custom choice on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDashboard(page);
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/organizations/org1/assistants", route => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 201, json: { assistant: { _id: "new", ...saved } } });
    }
    return route.fulfill({ json: { assistants: [] } });
  });
  await page.goto("http://127.0.0.1:5173/app");
  await expect(page.getByRole("radio", { name: /Balanced profile/ })).toBeChecked();
  await page.getByRole("radio", { name: /Advanced profile/ }).check();
  await page.getByText("Advanced Settings").click();
  await expect(page.getByRole("combobox", { name: "Reasoning level" })).toHaveValue("medium");
  await page.getByRole("combobox", { name: "Reasoning level" }).selectOption("low");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Synthetic assistant");
  await page.getByRole("textbox", { name: "Instructions" }).fill("Help visitors with verified information only.");
  await page.getByRole("button", { name: "Create assistant" }).click();
  await expect.poll(() => saved?.modelSelection).toEqual({ mode: "custom", profile: "advanced", model: "gpt-6.1-sol",
    reasoningEffort: "low", processingTier: "default" });
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.getByText("Yapay zekâ model profili")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(a11y.violations).toEqual([]);
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

test("Channels onboarding is accessible on mobile and distinguishes unsupported providers", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/auth/me", route => route.fulfill({ json: me }));
  await page.route("**/api/organizations/org1/assistants", route => route.fulfill({ json: { assistants: [{
    _id: "a1", name: "Pilot assistant", instructions: "Verified business answers only.",
    publicKey: "ost_pilot", allowedOrigins: [], active: true,
  }] } }));
  await page.route("**/api/organizations/org1/conversations", route => route.fulfill({ json: { conversations: [] } }));
  let connection: Record<string, unknown> | null = null;
  let submittedToken = "";
  await page.route("**/api/organizations/org1/channels**", route => {
    if (route.request().method() === "POST" && route.request().url().endsWith("/telegram")) {
      submittedToken = (route.request().postDataJSON() as { botToken: string }).botToken;
      connection = { id: "c1", channel: "telegram", assistantId: "a1", providerName: "Pilot Bot",
        providerUsername: "PilotDemoBot", credentialSource: "managed", status: "connected", webhookState: "verified",
        active: true, verifiedAt: new Date().toISOString(), lastSuccessfulCheckAt: new Date().toISOString(), lastErrorCategory: null };
      return route.fulfill({ status: 201, json: { connection } });
    }
    return route.fulfill({ json: { telegramSelfServiceAvailable: true, connections: connection ? [connection] : [] } });
  });
  await page.goto("http://127.0.0.1:5173/app");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Channels" }).click();
  await expect(page.getByRole("heading", { name: "Connect Telegram bot" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "WhatsApp" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Instagram" })).toBeVisible();
  await expect(page.getByText("Coming soon")).toHaveCount(2);
  await page.getByRole("combobox", { name: "Assistant", exact: true }).selectOption("a1");
  await page.getByLabel("BotFather token").fill("123456:synthetic-test-token-abcdefghi");
  await page.getByRole("button", { name: "Verify and connect" }).click();
  await expect(page.getByText("Pilot Bot · @PilotDemoBot")).toBeVisible();
  expect(submittedToken).toBe("123456:synthetic-test-token-abcdefghi");
  await expect(page.getByLabel("BotFather token")).toHaveValue("");
  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.getByRole("heading", { name: "Telegram botu bağla" })).toBeVisible();
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(a11y.violations).toEqual([]);
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
  await page.getByRole("button", { name: "Emlak şablonunu kullan" }).click();
  await expect(page.getByRole("textbox", { name: "Talimatlar" })).toHaveValue(/search_listings/);
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: "Resepsiyon" }).click();
  await expect(page.getByRole("heading", { name: "Randevular" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Çalışma saatleri" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Personel müsaitliği" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(a11y.violations).toEqual([]);
});

test("business knowledge and listings work on mobile in Turkish and dark theme", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDashboard(page);
  let saved: Record<string, unknown> | null = null;
  await page.route("**/api/organizations/org1/knowledge", route => {
    if (route.request().method() === "PUT") { saved = route.request().postDataJSON() as Record<string, unknown>; return route.fulfill({ json: { knowledge: saved } }); }
    return route.fulfill({ json: { knowledge: { _id: "knowledge1", profile: "Old profile",
      services: [{ _id: "service1", name: "Viewing", description: "Guided", price: "No charge" }],
      faqs: [], policies: [], facts: [], contact: { _id: "contact1", email: "", phone: "", address: "", website: "" },
    } } });
  });
  await page.route("**/api/organizations/org1/listings**", route => route.fulfill({ json: { listings: [] } }));
  await page.route("**/api/organizations/org1/conversation-summaries", route => route.fulfill({ json: { summaries: [] } }));
  await page.route("**/api/organizations/org1/receptionist/customers", route => route.fulfill({ json: { customers: [] } }));
  await page.route("**/api/organizations/org1/receptionist/config", route => route.fulfill({ json: { staff: [] } }));
  await page.route("**/api/organizations/org1/leads/follow-up", route => route.fulfill({ json: { customers: [] } }));
  await page.goto("http://127.0.0.1:5173/app");
  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("button", { name: "Menü" }).click();
  await page.getByRole("button", { name: "İşletme" }).click();
  await expect(page.getByRole("heading", { name: "İşletme bilgileri" })).toBeVisible();
  await page.getByRole("textbox", { name: "İşletme profili" }).fill("Sentetik emlak ofisi");
  await page.getByRole("button", { name: "Bilgileri kaydet" }).click();
  await expect.poll(() => saved?.profile).toBe("Sentetik emlak ofisi");
  expect(saved).not.toHaveProperty("_id");
  expect((saved?.services as Array<Record<string, unknown>>)[0]).not.toHaveProperty("_id");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(a11y.violations).toEqual([]);
});

test("four model modes persist without changing legacy profiles and expose unavailable choices", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDashboard(page);
  const assistant: Record<string, unknown> = { _id: "a1", name: "Mode fixture", instructions: "Verified business facts only.",
    publicKey: "ost_test", allowedOrigins: ["http://127.0.0.1:5173"], active: true, modelSelection: { mode: "preset", profile: "balanced" } };
  await page.route("**/api/organizations/org1/model-options", route => route.fulfill({ json: { ...modelOptions,
    productModes: [
      { choice: "normal", model: "gpt-6-luna", available: true, reason: "", reasoningEffort: "medium" },
      { choice: "powerful", model: "gpt-6.1-sol", available: true, reason: "", reasoningEffort: "medium" },
      { choice: "very_powerful", model: "gpt-6-astra", available: false, reason: "Project access has not been verified", reasoningEffort: "medium" },
      { choice: "automatic", model: "gpt-6-luna", available: true, reason: "", reasoningEffort: "medium" },
    ] } }));
  await page.route("**/api/organizations/org1/assistants**", route => {
    if (route.request().method() === "PATCH") {
      Object.assign(assistant, route.request().postDataJSON());
      return route.fulfill({ json: { assistant } });
    }
    return route.fulfill({ json: { assistants: [assistant] } });
  });
  await page.goto("http://127.0.0.1:5173/app");
  await page.getByRole("button", { name: "Edit settings" }).click();
  await expect(page.getByRole("radio", { name: /Balanced profile/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /^Very Powerful/ })).toBeDisabled();
  for (const [label, choice] of [["Normal", "normal"], ["Powerful", "powerful"], ["Automatic", "automatic"]]) {
    await page.getByRole("radio", { name: new RegExp(`^${label}`) }).check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect.poll(() => assistant.modelSelection).toEqual({ mode: "product", choice });
    await expect(page.getByRole("heading", { name: "Create assistant" })).toBeVisible();
    await page.getByRole("button", { name: "Edit settings" }).click();
    await expect(page.getByRole("radio", { name: new RegExp(`^${label}`) })).toBeChecked();
  }
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("button", { name: "Tema" }).click();
  await expect(page.getByRole("radio", { name: /^Otomatik/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /^Çok güçlü/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
});

test("pilot listing editor renders verified zero and false, clears facts and edits availability", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDashboard(page);
  const item: Record<string, unknown> = { _id: "pilot-flat", title: "Pilot Flat", description: "Verified listing", price: 12345.50,
    currency: "TRY", location: "Görükle", propertyType: "apartment", listingType: "rent", availability: "available",
    areaSqm: 80, facts: { maintenanceFee: 0, furnished: false }, updatedAt: "2026-11-18T14:00:00Z" };
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/organizations/org1/knowledge", route => route.fulfill({ json: { knowledge: null } }));
  await page.route("**/api/organizations/org1/listings**", route => {
    if (route.request().method() === "PATCH") {
      saved = route.request().postDataJSON() as Record<string, unknown>;
      Object.assign(item, saved);
      return route.fulfill({ json: { listing: item } });
    }
    return route.fulfill({ json: { listings: [item] } });
  });
  for (const [path, json] of [["conversation-summaries", { summaries: [] }], ["receptionist/customers", { customers: [] }],
    ["receptionist/config", { staff: [] }], ["leads/follow-up", { customers: [] }]] as const)
    await page.route(`**/api/organizations/org1/${path}`, route => route.fulfill({ json }));
  await page.goto("http://127.0.0.1:5173/app");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Business", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: /^Maintenance fee/ })).toHaveValue("0");
  await expect(page.getByRole("spinbutton", { name: /^Deposit/ })).toHaveValue("");
  await expect(page.getByLabel("Furnishing status")).toHaveValue("false");
  await expect(page.getByRole("spinbutton", { name: "Rooms" })).toHaveValue("");
  await page.getByLabel("Availability").selectOption("sold");
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect.poll(() => saved?.facts).toEqual({ maintenanceFee: 0, furnished: false });
  expect(saved).toMatchObject({ availability: "sold", rooms: null, price: 12345.50 });
  await expect(page.getByRole("heading", { name: "Add listing" })).toBeVisible();
  for (const name of ["Price", "Area (m²)"]) {
    const field = page.getByRole("spinbutton", { name, exact: true });
    await expect(field).toHaveValue("");
    expect(await field.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  }
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("spinbutton", { name: /^Maintenance fee/ }).clear();
  await page.getByLabel("Furnishing status").selectOption("");
  await page.getByRole("button", { name: "Save listing" }).click();
  await expect.poll(() => saved?.facts).toEqual({});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
});

test("pilot inbox presents preferences and safe failure categories before staff takeover", async ({ page }) => {
  await mockDashboard(page);
  const conversation = { _id: "pilot-chat", assistantId: "pilot-assistant", status: "bot", updatedAt: "2026-11-18T14:00:00Z" };
  await page.route("**/api/organizations/org1/conversations", route => route.fulfill({ json: { conversations: [conversation] } }));
  await page.route("**/api/organizations/org1/conversations/pilot-chat/messages", route => route.fulfill({ json: {
    messages: [{ _id: "pilot-msg", role: "customer", text: "I would like a viewing." }],
    preferences: { locations: ["Görükle", "Özlüce"], rooms: [2, 3], budgetUnknown: true },
    recentFailures: [{ category: "provider", createdAt: "2026-11-18T14:00:00Z" }],
  } }));
  await page.route("**/api/organizations/org1/conversations/pilot-chat/status", route => {
    conversation.status = route.request().postDataJSON().status;
    return route.fulfill({ json: { conversation } });
  });
  await page.goto("http://127.0.0.1:5173/app");
  await page.getByRole("button", { name: "Conversations", exact: true }).click();
  await page.getByRole("button", { name: /Assistant.*bot/ }).click();
  await expect(page.getByText("I would like a viewing.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Saved preferences" })).toContainText("Görükle / Özlüce");
  await expect(page.getByRole("region", { name: "Saved preferences" })).toContainText("2+1 / 3+1");
  await expect(page.getByRole("region", { name: "Recent reply failures" })).toContainText("The AI provider could not complete a reply.");
  await page.getByRole("button", { name: "Take over" }).click();
  await expect(page.getByRole("textbox", { name: "Reply as staff" })).toBeVisible();
  expect(conversation.status).toBe("handoff");
});

test("pilot receptionist requires fresh confirmation when time or search criteria change", async ({ page }) => {
  await mockDashboard(page);
  const base = "**/api/organizations/org1/receptionist";
  let changed = false;
  await page.route(`${base}/config`, route => route.fulfill({ json: {
    timeZone: "Europe/Istanbul", openingHours: [], staff: [{ id: "pilot-staff", name: "Pilot Agent", windows: [], viewingEnabled: changed }],
  } }));
  await page.route(`${base}/staff/pilot-staff/availability`, route => {
    changed = route.request().postDataJSON().viewingEnabled;
    return route.fulfill({ json: { ok: true } });
  });
  for (const [name, response] of [["appointments", { appointments: [] }], ["customers", { customers: [] }],
    ["actions", { actions: [] }]] as const)
    await page.route(`${base}/${name}`, route => route.fulfill({ json: response }));
  await page.route(`${base}/availability?**`, route => route.fulfill({ json: { available: [
    { startAt: "2026-12-10T11:00:00Z", endAt: "2026-12-10T11:30:00Z" },
    { startAt: "2026-12-10T12:00:00Z", endAt: "2026-12-10T12:30:00Z" },
  ] } }));
  await page.goto("http://127.0.0.1:5173/app");
  await page.getByRole("button", { name: "Receptionist", exact: true }).click();
  await page.getByLabel("Can host property viewings").check();
  await page.getByRole("button", { name: "Save availability", exact: true }).click();
  await expect(page.getByText("Staff availability saved.")).toBeVisible();
  expect(changed).toBe(true);
  await page.getByLabel("Date", { exact: true }).fill("2026-12-10");
  await page.getByRole("button", { name: "Check availability" }).click();
  const availableTime = page.getByRole("combobox", { name: "Available time", exact: true });
  await availableTime.selectOption("2026-12-10T11:00:00Z");
  await page.getByLabel("I confirm this booking").check();
  await expect(page.getByRole("button", { name: "Book appointment" })).toBeEnabled();
  await availableTime.selectOption("2026-12-10T12:00:00Z");
  await expect(page.getByRole("button", { name: "Book appointment" })).toBeDisabled();
  await page.getByLabel("I confirm this booking").check();
  await page.getByRole("combobox", { name: "Duration (minutes)", exact: true }).selectOption("45");
  await expect(page.getByRole("button", { name: "Book appointment" })).toHaveCount(0);
});
