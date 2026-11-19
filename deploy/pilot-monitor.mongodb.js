// Run with mongosh against the application database using a read-only operator account.
// Counts and ages only. No tenant IDs, messages, contact records or provider bodies.
const now = new Date();
const hourAgo = new Date(now.getTime() - 3_600_000);
const fifteenMinutesAgo = new Date(now.getTime() - 900_000);
const requests = db.getCollection("widgetrequests");
const failedInLastHour = (filter) =>
  requests.countDocuments({ status: "failed", updatedAt: { $gte: hourAgo }, ...filter });
const oldest = requests.find({ status: { $in: ["queued", "processing"] } }, { createdAt: 1, _id: 0 })
  .sort({ createdAt: 1 }).limit(1).toArray()[0];
print(JSON.stringify({
  observedAt: now,
  queued: requests.countDocuments({ status: "queued" }),
  processing: requests.countDocuments({ status: "processing" }),
  oldestActiveSeconds: oldest ? Math.max(0, Math.floor((now - oldest.createdAt) / 1000)) : null,
  expiredProcessingLeases: requests.countDocuments({ status: "processing", leaseUntil: { $lt: now } }),
  failedWithRetainedReservation: requests.countDocuments({ status: "failed", reservedMicros: { $gt: 0 } }),
  providerFailuresLastHour: failedInLastHour({ errorCode: /^provider_/ }),
  budgetFailuresLastHour: failedInLastHour({ errorCode: "budget_exhausted" }),
  websiteFailuresLastHour: failedInLastHour({ channel: "web" }),
  inactiveHandoffsOver15Minutes: db.getCollection("conversations").countDocuments({
    status: "handoff", updatedAt: { $lt: fifteenMinutesAgo },
  }),
}));
