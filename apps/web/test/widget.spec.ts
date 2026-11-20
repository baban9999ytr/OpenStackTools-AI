import { test, expect } from "@playwright/test";

test("widget restores messages after reload and retries one idempotent request", async ({
  page,
}) => {
  const sentIds: string[] = [];
  let failOnce = true;
  const messages: Array<{ _id: string; role: string; text: string }> = [];
  await page.route("**/pilot-page.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body><script src="http://127.0.0.1:5173/embed.js" data-ost-assistant="ost_test" data-ost-api="http://127.0.0.1:5173"></script></body></html>',
    }),
  );
  await page.route("**/api/widget/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/widget/sessions" && route.request().method() === "POST")
      return route.fulfill({
        status: 201,
        json: {
          token: "test-token",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          assistant: { name: "Pilot helper" },
        },
      });
    if (path === "/api/widget/sessions/current")
      return route.fulfill({
        json: {
          assistant: { name: "Pilot helper" },
          conversationId: messages.length ? "conversation-1" : null,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      });
    if (path.endsWith("/messages") && route.request().method() === "GET")
      return route.fulfill({
        json: { conversation: { status: "bot" }, messages },
      });
    if (path === "/api/widget/messages") {
      const body = route.request().postDataJSON() as {
        text: string;
        clientMessageId: string;
      };
      sentIds.push(body.clientMessageId);
      if (failOnce) {
        failOnce = false;
        return route.abort("failed");
      }
      if (!messages.length)
        messages.push(
          { _id: "customer-1", role: "customer", text: body.text },
          { _id: "assistant-1", role: "assistant", text: "Pilot answer" },
        );
      return route.fulfill({
        status: 201,
        json: {
          conversationId: "conversation-1",
          status: "completed",
          requestId: "request-1",
          reply: messages[1],
        },
      });
    }
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  await page.goto("http://127.0.0.1:5173/pilot-page.html");
  const shadow = page.locator("[id^=openstacktools-widget-]");
  await shadow.getByRole("button", { name: "Chat with us" }).click();
  await expect(shadow.getByLabel("Business chat")).toBeVisible();
  await shadow
    .getByRole("textbox", { name: "Your message" })
    .fill("Hello pilot");
  await shadow.getByRole("button", { name: "Send" }).click();
  await expect(shadow.getByRole("alert")).toBeVisible();
  await shadow.getByRole("button", { name: "Retry message safely" }).click();
  await expect(shadow.getByText("Pilot answer")).toBeVisible();
  expect(sentIds).toHaveLength(2);
  expect(sentIds[0]).toBe(sentIds[1]);
  messages[1]!.text = '<img src=x onerror=alert(1)> Pilot answer';
  await page.reload();
  await shadow.getByRole("button", { name: "Chat with us" }).click();
  await expect(shadow.getByText("Pilot answer")).toBeVisible();
  await expect(shadow.locator("img")).toHaveCount(0);
  await shadow.getByRole("button", { name: "Clear this chat session" }).click();
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
});

test("widget follows Turkish page language and explicit dark theme", async ({ page }) => {
  await page.route("**/pilot-page.html", route => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html lang="tr"><head><meta charset="utf-8"></head><body><script src="http://127.0.0.1:5173/embed.js" data-ost-assistant="ost_test" data-ost-api="http://127.0.0.1:5173" data-ost-theme="dark"></script></body></html>',
  }));
  await page.route("**/api/widget/sessions", route => route.fulfill({ status: 201, json: { token: "test-token", expiresAt: new Date(Date.now() + 60_000).toISOString(), assistant: { name: "Pilot yardımcısı" } } }));
  await page.route("**/api/widget/sessions/current", route => route.fulfill({ json: { assistant: { name: "Pilot yardımcısı" }, conversationId: null } }));
  await page.goto("http://127.0.0.1:5173/pilot-page.html");
  const host = page.locator("[id^=openstacktools-widget-]");
  await expect(host).toHaveAttribute("data-theme", "dark");
  await host.getByRole("button", { name: "Bizimle sohbet edin" }).click();
  await expect(host.getByLabel("İşletme sohbeti")).toBeVisible();
  await expect(host.getByText("Mesajlarınız bu işletmeyle paylaşılır.")).toBeVisible();
  await expect(host.getByRole("textbox", { name: "Mesajınız" })).toBeVisible();
  await expect(host.getByRole("button", { name: "Gönder" })).toBeVisible();
});

test("terminal provider failure allows a new message without unsafe replay", async ({ page }) => {
  await page.route("**/pilot-page.html", route => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><script src="http://127.0.0.1:5173/embed.js" data-ost-assistant="ost_test" data-ost-api="http://127.0.0.1:5173"></script></body></html>',
  }));
  await page.route("**/api/widget/sessions", route => route.fulfill({ status: 201, json: { token: "test-token", expiresAt: new Date(Date.now() + 60_000).toISOString(), assistant: { name: "Pilot helper" } } }));
  await page.route("**/api/widget/sessions/current", route => route.fulfill({ json: { assistant: { name: "Pilot helper" }, conversationId: null } }));
  await page.route("**/api/widget/messages", route => route.fulfill({ status: 502, json: { error: "Assistant temporarily unavailable", errorCode: "provider_model_unavailable" } }));
  await page.goto("http://127.0.0.1:5173/pilot-page.html");
  const host = page.locator("[id^=openstacktools-widget-]");
  await host.getByRole("button", { name: "Chat with us" }).click();
  await host.getByRole("textbox", { name: "Your message" }).fill("Hello");
  await host.getByRole("button", { name: "Send" }).click();
  await expect(host.getByRole("status")).toContainText("No AI reply was sent");
  await expect(host.getByRole("alert")).toContainText("AI model is unavailable");
  await expect(host.getByRole("button", { name: "Retry message safely" })).toHaveCount(0);
  await expect(host.getByRole("textbox", { name: "Your message" })).toBeEnabled();
});

test("widget requires a visible confirmation before booking and persists the result", async ({ page }) => {
  let pending = false;
  let booked = false;
  const messages: Array<{ _id: string; role: string; text: string }> = [];
  await page.route("**/pilot-page.html", (route) => route.fulfill({ contentType: "text/html",
    body: '<!doctype html><html lang="en"><body><script src="http://127.0.0.1:5173/embed.js" data-ost-assistant="ost_test" data-ost-api="http://127.0.0.1:5173"></script></body></html>',
  }));
  await page.route("**/api/widget/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/widget/sessions") return route.fulfill({ status: 201, json: { token: "test-token", expiresAt: new Date(Date.now() + 60_000).toISOString(), assistant: { name: "Receptionist" } } });
    if (path === "/api/widget/sessions/current") return route.fulfill({ json: { assistant: { name: "Receptionist" }, conversationId: messages.length ? "conversation-1" : null } });
    if (path === "/api/widget/messages" && route.request().method() === "POST") {
      pending = true;
      messages.push({ _id: "customer", role: "customer", text: "Book this" }, { _id: "proposal", role: "assistant", text: "Please review and confirm this appointment request. No booking has been made yet." });
      return route.fulfill({ status: 201, json: { status: "completed", conversationId: "conversation-1", requestId: "request-1", action: { id: "action-1", status: "pending" } } });
    }
    if (path === "/api/widget/conversations/conversation-1/messages") return route.fulfill({ json: { conversation: { status: "bot" }, messages } });
    if (path === "/api/widget/actions/pending") return route.fulfill({ json: { actions: pending ? [{ id: "action-1", name: "create_appointment", arguments: { startAt: "2027-02-01T09:00:00Z", durationMinutes: 30 }, expiresAt: new Date(Date.now() + 60_000).toISOString() }] : [] } });
    if (path === "/api/widget/actions/action-1/confirm") {
      pending = false; booked = true;
      messages.push({ _id: "confirmed", role: "assistant", text: "Your appointment is confirmed." });
      return route.fulfill({ json: { action: { status: "completed" }, message: "Your appointment is confirmed." } });
    }
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  await page.goto("http://127.0.0.1:5173/pilot-page.html");
  const host = page.locator("[id^=openstacktools-widget-]");
  await host.getByRole("button", { name: "Chat with us" }).click();
  await host.getByRole("textbox", { name: "Your message" }).fill("Book this");
  await host.getByRole("button", { name: "Send" }).click();
  await expect(host.getByRole("button", { name: "Confirm action" })).toBeVisible();
  expect(booked).toBe(false);
  await host.getByRole("button", { name: "Confirm action" }).click();
  await expect(host.getByText("Your appointment is confirmed.")).toBeVisible();
  expect(booked).toBe(true);
  await page.reload();
  await host.getByRole("button", { name: "Chat with us" }).click();
  await expect(host.getByText("Your appointment is confirmed.")).toBeVisible();
});

test("widget honors Retry-After without losing an idempotent message", async ({ page }) => {
  const ids: string[] = [];
  let attempts = 0;
  const messages: Array<{ _id: string; role: string; text: string }> = [];
  await page.route("**/pilot-page.html", route => route.fulfill({ contentType: "text/html",
    body: '<!doctype html><html lang="tr"><head><meta charset="utf-8"></head><body><script src="http://127.0.0.1:5173/embed.js" data-ost-assistant="ost_test" data-ost-api="http://127.0.0.1:5173"></script></body></html>' }));
  await page.route("**/api/widget/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/widget/sessions") return route.fulfill({ status: 201, json: { token: "test-token", expiresAt: new Date(Date.now() + 60_000).toISOString(), assistant: { name: "Test" } } });
    if (path === "/api/widget/sessions/current") return route.fulfill({ json: { assistant: { name: "Test" }, conversationId: messages.length ? "conversation-1" : null } });
    if (path === "/api/widget/messages" && route.request().method() === "POST") {
      ids.push((route.request().postDataJSON() as { clientMessageId: string }).clientMessageId);
      attempts++;
      if (attempts === 1) return route.fulfill({ status: 429, headers: { "Retry-After": "1" }, json: { error: "Rate limit exceeded" } });
      messages.push({ _id: "one", role: "customer", text: "Merhaba" }, { _id: "two", role: "assistant", text: "Merhaba!" });
      return route.fulfill({ status: 201, json: { status: "completed", conversationId: "conversation-1", requestId: "request-1" } });
    }
    if (path.endsWith("/messages") && route.request().method() === "GET") return route.fulfill({ json: { conversation: { status: "bot" }, messages } });
    if (path === "/api/widget/actions/pending") return route.fulfill({ json: { actions: [] } });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  await page.goto("http://127.0.0.1:5173/pilot-page.html");
  const host = page.locator("[id^=openstacktools-widget-]");
  await host.getByRole("button", { name: "Bizimle sohbet edin" }).click();
  await host.getByRole("textbox", { name: "Mesajınız" }).fill("Merhaba");
  await host.getByRole("button", { name: "Gönder" }).click();
  await expect(host.getByRole("alert")).toContainText("Yeniden denemeden önce bekleyin");
  const retry = host.getByRole("button", { name: "Mesajı güvenle yeniden dene" });
  await expect(retry).toBeDisabled();
  await expect(retry).toBeEnabled({ timeout: 3000 });
  await retry.click();
  await expect(host.getByText("Merhaba!", { exact: true })).toBeVisible();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});

test("same-origin assistant preview loads the real widget bundle", async ({ page }) => {
  await page.route("**/api/widget/sessions", route => route.fulfill({ status: 201,
    json: { token: "test-token", expiresAt: new Date(Date.now() + 60_000).toISOString(), assistant: { name: "Preview" } } }));
  await page.route("**/api/widget/sessions/current", route => route.fulfill({ json: { assistant: { name: "Preview" }, conversationId: null } }));
  await page.goto("http://127.0.0.1:5173/assistant-preview.html?assistant=ost_preview123&lang=tr&theme=dark");
  const host = page.locator("[id^=openstacktools-widget-]");
  await expect(host).toHaveAttribute("data-theme", "dark");
  await host.getByRole("button", { name: "Bizimle sohbet edin" }).click();
  await expect(host.getByLabel("İşletme sohbeti")).toBeVisible();
});

test("slow message reads do not create overlapping poll requests", async ({ page }) => {
  let inFlight = 0;
  let maximum = 0;
  let reads = 0;
  await page.route("**/pilot-page.html", route => route.fulfill({ contentType: "text/html",
    body: '<!doctype html><html lang="en"><body><script src="http://127.0.0.1:5173/embed.js" data-ost-assistant="ost_test" data-ost-api="http://127.0.0.1:5173"></script></body></html>' }));
  await page.route("**/api/widget/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/widget/sessions") return route.fulfill({ status: 201, json: { token: "test-token", expiresAt: new Date(Date.now() + 60_000).toISOString(), assistant: { name: "Test" } } });
    if (path === "/api/widget/sessions/current") return route.fulfill({ json: { assistant: { name: "Test" }, conversationId: "conversation-1" } });
    if (path === "/api/widget/conversations/conversation-1/messages") {
      inFlight++; reads++; maximum = Math.max(maximum, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 3500));
      inFlight--;
      return route.fulfill({ json: { conversation: { status: "bot" }, messages: [] } });
    }
    if (path === "/api/widget/actions/pending") return route.fulfill({ json: { actions: [] } });
    return route.fulfill({ status: 404, json: { error: "Not found" } });
  });
  await page.goto("http://127.0.0.1:5173/pilot-page.html");
  const host = page.locator("[id^=openstacktools-widget-]");
  await host.getByRole("button", { name: "Chat with us" }).click();
  await expect.poll(() => reads, { timeout: 9000 }).toBeGreaterThanOrEqual(2);
  expect(maximum).toBe(1);
});

test("widget styles load in Shadow DOM under a strict host CSP", async ({ page }) => {
  const widgetOrigin = "http://127.0.0.1:5173";
  await page.setViewportSize({ width: 320, height: 640 });
  await page.route(`${widgetOrigin}/strict-widget.html`, (route) => route.fulfill({
    contentType: "text/html",
    headers: { "Content-Security-Policy": `default-src 'none'; script-src ${widgetOrigin}; style-src ${widgetOrigin}; connect-src ${widgetOrigin}` },
    body: `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script defer src="${widgetOrigin}/embed.js" data-ost-assistant="ost_test" data-ost-api="${widgetOrigin}" data-ost-theme="dark"></script></html>`,
  }));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      document.documentElement.dataset.cspViolation = event.violatedDirective;
    });
  });
  await page.route("**/api/widget/sessions", (route) => route.fulfill({
    status: 201,
    json: { token: "synthetic", expiresAt: new Date(Date.now() + 60_000).toISOString(), assistant: { name: "Test" } },
  }));
  await page.route("**/api/widget/sessions/current", (route) => route.fulfill({
    json: { assistant: { name: "Test" }, conversationId: null, expiresAt: new Date(Date.now() + 60_000).toISOString() },
  }));
  await page.goto(`${widgetOrigin}/strict-widget.html`);
  const widget = page.locator("[id^=openstacktools-widget-]");
  const launch = widget.getByRole("button", { name: "Bizimle sohbet edin" });
  await expect(launch).toHaveCSS("position", "fixed");
  await expect(launch).toHaveCSS("right", "24px");
  await launch.click();
  const panel = widget.getByRole("region", { name: "İşletme sohbeti" });
  await expect(panel).toHaveCSS("position", "fixed");
  await expect(panel).toHaveCSS("background-color", "rgb(24, 24, 27)");
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await expect(widget.getByRole("textbox")).toBeEnabled();
  expect(await page.locator("html").getAttribute("data-csp-violation")).toBeNull();
});
