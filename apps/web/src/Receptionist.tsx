import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import { usePreferences } from "./preferences";

type Window = { day: number; startMinute: number; endMinute: number };
type Staff = { id: string; name: string; windows: Window[]; viewingEnabled?: boolean };
type Config = { timeZone: string; openingHours: Window[]; staff: Staff[] };
type Appointment = { _id: string; staffId: string; startAt: string; endAt: string; status: string };
type Customer = { _id: string; name: string; contact: string; request: string; updatedAt: string };
type Action = { _id: string; name: string; status: string; createdAt: string;
  result?: { listingTitle?: string; staffName?: string; startAt?: string; durationMinutes?: number } };
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const minute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const errorText = (error: unknown) => error instanceof Error ? error.message : "Something went wrong";

function WindowEditor({ value, onChange }: { value: Window[]; onChange: (next: Window[]) => void }) {
  const { t } = usePreferences();
  return <div>
    {value.map((window, index) => <div className="schedule-row" key={index}>
      <select aria-label={t("Day")} value={window.day} onChange={(event) => onChange(value.map((item, i) => i === index ? { ...item, day: Number(event.target.value) } : item))}>
        {days.map((day, i) => <option value={i} key={day}>{t(day)}</option>)}
      </select>
      <input aria-label={t("Opens")} type="time" step={900} value={clock(window.startMinute)} onChange={(event) => onChange(value.map((item, i) => i === index ? { ...item, startMinute: minute(event.target.value) } : item))} />
      <input aria-label={t("Closes")} type="time" step={900} value={clock(window.endMinute)} onChange={(event) => onChange(value.map((item, i) => i === index ? { ...item, endMinute: minute(event.target.value) } : item))} />
      <button type="button" className="secondary" onClick={() => onChange(value.filter((_, i) => i !== index))}>{t("Remove")}</button>
    </div>)}
    <button type="button" className="secondary" onClick={() => onChange([...value, { day: 1, startMinute: 540, endMinute: 1020 }])}>{t("Add hours")}</button>
  </div>;
}

export function Receptionist({ organizationId, role }: { organizationId: string; role: string }) {
  const { t, locale } = usePreferences();
  const canManage = role === "owner" || role === "admin";
  const canAct = canManage || role === "agent";
  const [config, setConfig] = useState<Config | null>(null);
  const [hours, setHours] = useState<Window[]>([]);
  const [timeZone, setTimeZone] = useState("UTC");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [available, setAvailable] = useState<Array<{ startAt: string; endAt: string }>>([]);
  const [selectedStart, setSelectedStart] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const base = `/organizations/${organizationId}/receptionist`;
  async function load() {
    try {
      const [configuration, bookingData] = await Promise.all([
        api<Config>(`${base}/config`), api<{ appointments: Appointment[] }>(`${base}/appointments`),
      ]);
      setConfig(configuration); setHours(configuration.openingHours); setTimeZone(configuration.timeZone);
      setStaffId((previous) => previous || configuration.staff[0]?.id || "");
      setAppointments(bookingData.appointments);
      if (canAct) {
        const [customerData, actionData] = await Promise.all([
          api<{ customers: Customer[] }>(`${base}/customers`), api<{ actions: Action[] }>(`${base}/actions`),
        ]);
        setCustomers(customerData.customers); setActions(actionData.actions);
      }
      setError("");
    } catch (caught) { setError(t(errorText(caught))); }
  }
  useEffect(() => { void load(); }, [organizationId]);
  async function saveHours(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api(`${base}/hours`, { method: "PATCH", body: JSON.stringify({ timeZone, openingHours: hours }) }); setNotice(t("Business hours saved.")); await load(); }
    catch (caught) { setError(t(errorText(caught))); } finally { setBusy(false); }
  }
  async function saveStaff(staff: Staff) {
    setBusy(true); setError("");
    try { await api(`${base}/staff/${staff.id}/availability`, { method: "PUT", body: JSON.stringify({ windows: staff.windows, viewingEnabled: staff.viewingEnabled ?? false }) }); setNotice(t("Staff availability saved.")); await load(); }
    catch (caught) { setError(t(errorText(caught))); } finally { setBusy(false); }
  }
  function clearTimes() {
    setAvailable([]); setSelectedStart(""); setConfirmed(false);
  }
  async function search(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); clearTimes();
    try {
      const query = new URLSearchParams({ staffId, date, durationMinutes: String(durationMinutes) });
      const data = await api<{ available: typeof available }>(`${base}/availability?${query}`);
      setAvailable(data.available);
    } catch (caught) { setError(t(errorText(caught))); } finally { setBusy(false); }
  }
  async function book(event: FormEvent) {
    event.preventDefault(); if (!confirmed || !selectedStart) return;
    setBusy(true); setError("");
    try { await api(`${base}/actions`, { method: "POST", body: JSON.stringify({ name: "create_appointment",
      arguments: { staffId, startAt: selectedStart, durationMinutes }, confirmed: true, idempotencyKey: crypto.randomUUID(),
    }) }); setNotice(t("Appointment confirmed.")); setConfirmed(false); setAvailable([]); await load(); }
    catch (caught) { setError(t(errorText(caught))); } finally { setBusy(false); }
  }
  async function cancel(appointmentId: string) {
    if (!window.confirm(t("Confirm cancellation?"))) return;
    setBusy(true); setError("");
    try { await api(`${base}/actions`, { method: "POST", body: JSON.stringify({ name: "cancel_appointment",
      arguments: { appointmentId }, confirmed: true, idempotencyKey: crypto.randomUUID(),
    }) }); setNotice(t("Appointment cancelled.")); await load(); }
    catch (caught) { setError(t(errorText(caught))); } finally { setBusy(false); }
  }
  return <div className="receptionist-grid">
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status" className="notice">{notice}</p>}
    <section className="card"><h2>{t("Appointments")}</h2>
      {appointments.length === 0 && <p className="muted">{t("No appointments yet.")}</p>}
      {appointments.map((item) => <div className="list-item" key={item._id}>
        <strong>{new Date(item.startAt).toLocaleString(locale, { timeZone, timeZoneName: "shortOffset" })}</strong>
        <span>{config?.staff.find((staff) => staff.id === item.staffId)?.name ?? t("Staff")} · {t(item.status)}</span>
        {canAct && item.status === "booked" && <button className="secondary" disabled={busy} onClick={() => void cancel(item._id)}>{t("Cancel appointment")}</button>}
      </div>)}
    </section>
    <section className="card"><h2>{t("Find appointment times")}</h2>
      <form onSubmit={search}>
        <label>{t("Staff")}<select value={staffId} disabled={busy} onChange={(event) => { setStaffId(event.target.value); clearTimes(); }}>{config?.staff.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}</select></label>
        <label>{t("Date")}<input type="date" required value={date} disabled={busy} onChange={(event) => { setDate(event.target.value); clearTimes(); }} /></label>
        <label>{t("Duration (minutes)")}<select value={durationMinutes} disabled={busy} onChange={(event) => { setDurationMinutes(Number(event.target.value)); clearTimes(); }}>{[15,30,45,60,90,120].map((value) => <option key={value}>{value}</option>)}</select></label>
        <button disabled={busy || !staffId}>{t("Check availability")}</button>
      </form>
      {available.length === 0 && <p className="muted">{t("No available times shown.")}</p>}
      {canAct && available.length > 0 && <form onSubmit={book}>
        <label>{t("Available time")}<select required value={selectedStart} onChange={(event) => { setSelectedStart(event.target.value); setConfirmed(false); }}><option value="">{t("Select a time")}</option>{available.map((slot) => <option key={slot.startAt} value={slot.startAt}>{new Date(slot.startAt).toLocaleString(locale, { timeZone, timeZoneName: "shortOffset" })}</option>)}</select></label>
        <label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />{t("I confirm this booking")}</label>
        <button disabled={busy || !confirmed || !selectedStart}>{t("Book appointment")}</button>
      </form>}
    </section>
    {canManage && <section className="card"><h2>{t("Business hours")}</h2>
      <form onSubmit={saveHours}><label>{t("Time zone")}<input required value={timeZone} onChange={(event) => setTimeZone(event.target.value)} /></label>
        <WindowEditor value={hours} onChange={setHours} /><button disabled={busy}>{t("Save business hours")}</button></form>
    </section>}
    {canManage && <section className="card"><h2>{t("Staff availability")}</h2>
      {config?.staff.map((staff) => <div key={staff.id}><h3>{staff.name}</h3>
        <label className="checkbox-label"><input type="checkbox" checked={staff.viewingEnabled ?? false}
          onChange={(event) => setConfig({ ...config, staff: config.staff.map((item) => item.id === staff.id ? { ...item, viewingEnabled: event.target.checked } : item) })} />{t("Can host property viewings")}</label>
        <WindowEditor value={staff.windows} onChange={(windows) => setConfig((current) => current ? { ...current, staff: current.staff.map((item) => item.id === staff.id ? { ...item, windows } : item) } : current)} />
        <button disabled={busy} onClick={() => void saveStaff(staff)}>{t("Save availability")}</button></div>)}
    </section>}
    {canAct && <section className="card"><h2>{t("Customer requests")}</h2>{customers.length === 0 && <p className="muted">{t("No customer requests yet.")}</p>}
      {customers.map((item) => <div className="list-item" key={item._id}><strong>{item.name}</strong><span>{item.contact}</span><p>{item.request}</p></div>)}
    </section>}
    {canAct && <section className="card"><h2>{t("Action history")}</h2>{actions.length === 0 && <p className="muted">{t("No actions yet.")}</p>}
      {actions.map((item) => <div className="list-item" key={item._id}><strong>{t(item.name)}</strong><span>{t(item.status)}</span><small>{new Date(item.createdAt).toLocaleString(locale)}</small>
        {["create_appointment", "reschedule_appointment", "cancel_appointment"].includes(item.name) && item.result?.startAt &&
          <span>{[item.result.listingTitle, item.result.staffName,
            new Date(item.result.startAt).toLocaleString(locale, { timeZone, timeZoneName: "shortOffset" }),
            typeof item.result.durationMinutes === "number" ? `${item.result.durationMinutes} ${t("minutes")}` : undefined].filter(Boolean).join(" · ")}</span>}
      </div>)}
    </section>}
  </div>;
}
