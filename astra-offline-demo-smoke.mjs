import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const origin = "http://127.0.0.1:5198";
const loginFile = process.argv[2];
assert.ok(loginFile, "Pass the private owner.txt file path printed by the demo");
const login = (await readFile(loginFile, "utf8")).trimEnd().split("\n");
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const external = new Set();
  await context.route("**/*", (route) => {
    const targetOrigin = new URL(route.request().url()).origin;
    if (targetOrigin === origin) return route.continue();
    external.add(targetOrigin);
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto(origin);
  await expect(page.getByRole("heading", { name: "ASTRA · Özel çevrimdışı demo" })).toBeVisible();
  await page.getByRole("link", { name: "Sohbet demosunu aç" }).click();
  const widget = page.locator("[id^=openstacktools-widget-]");
  const launcher = widget.getByRole("button", { name: "Bizimle sohbet edin" });
  await launcher.click();

  const send = async (text, expected) => {
    await widget.getByRole("textbox", { name: "Mesajınız" }).fill(text);
    const response = page.waitForResponse((res) =>
      res.request().method() === "POST" && new URL(res.url()).pathname === "/api/widget/messages");
    await widget.getByRole("button", { name: "Gönder" }).click();
    const res = await response;
    assert.equal(res.status(), 201);
    const body = await res.json();
    assert.match(body.reply.text, expected);
    await expect(widget.getByText(expected).last()).toBeVisible();
    return body;
  };

  await send("Bursa Nilüfer'de 30.000 TL altında kiralık 3+1 daire arıyorum.", /Örnek Park Dairesi.*27\.500 TL.*Örnek Bahçe Dairesi.*29\.000 TL/s);
  await send("İki ilanı karşılaştır, hangisini önerirsin?", /1\.500 TL/);
  await send("İkinci evin depozitosunu ve aidatını ayrı ayrı söyler misin?", /0 TL.*depozito .*doğrulanmamış/s);
  const compound = await send("Eşyalı mı, hafta sonu görebilir miyim?", /eşyasız.*gösterim saatleri/is);
  const months = "Ocak Şubat Mart Nisan Mayıs Haziran Temmuz Ağustos Eylül Ekim Kasım Aralık".split(" ");
  const match = compound.reply.text.match(new RegExp(`(\\d{1,2}) (${months.join("|")}) (?:Cumartesi|Pazar) saat 14\\.00`, "u"));
  assert.ok(match);
  const month = months.indexOf(match[2]) + 1;
  const now = new Date();
  const year = now.getUTCFullYear() + Number(now.getUTCMonth() + 1 > month);
  const date = `${year}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  await send(`${date} saat 14:00`, /Adınız ve soyadınız/);
  await send("Örnek Ziyaretçi", /telefon numaranızı veya e-posta adresinizi/);
  await send("ziyaretci@example.test", /randevu onayı değildir/);
  const proposal = await send("İletişime izin veriyorum.", /onay/i);
  assert.equal(proposal.action.status, "pending");
  await send("Olur gibi ama kesinleştirmeyelim.", /şimdilik kesinleştirmiyoruz/);
  await page.reload();
  const input = widget.getByRole("textbox", { name: "Mesajınız" });
  await expect(launcher.or(input).first()).toBeVisible();
  if (await launcher.isVisible()) await launcher.click();
  await expect(widget.getByText(/şimdilik kesinleştirmiyoruz/)).toBeVisible();
  const booked = await send("Evet, randevuyu onaylıyorum.", /Randevunuz oluşturuldu/);
  assert.equal(booked.action.status, "completed");

  await page.goto(origin + "/app");
  await page.locator('input[name="email"]').fill(login[0].slice("E-posta: ".length));
  await page.locator('input[type="password"]').fill(login[1].slice("Parola: ".length));
  await page.getByRole("button", { name: /^(Sign in|Giriş yap)$/i }).click();
  await expect(page.locator("select option:checked").filter({ hasText: "DEMO — Nilüfer Demo Emlak" })).toHaveCount(1);
  await page.getByRole("button", { name: /^(Receptionist|Resepsiyon)$/i }).click();
  await expect(page.getByRole("heading", { name: /^(Appointments|Randevular)$/i })).toBeVisible();
  const { appointments } = await page.evaluate(async () => {
    const id = document.querySelector("select option:checked").value;
    return (await fetch(`/api/organizations/${id}/receptionist/appointments`)).json();
  });
  assert.ok(appointments.some((item) => item._id === booked.action.result.appointmentId && item.status === "booked" &&
    item.visitorName === "Örnek Ziyaretçi" && item.contact === "ziyaretci@example.test"));
  assert.deepEqual([...external], []);
  console.log("PASS: Chromium widget, reload, explicit booking, dashboard login and appointment, zero external requests.");
} finally {
  await browser.close();
}
