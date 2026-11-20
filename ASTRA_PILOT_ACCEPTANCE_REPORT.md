# ASTRA private supervised pilot acceptance

## Independent review of the live Turkish turns

I reviewed both raw structured plans against the latest customer message, the server decision, and the final reply. This was an independent analysis of the recorded evidence by Codex. A human reviewer has yet to sign off.

| Customer request | Raw Luna decision | Application and customer-visible result |
| --- | --- | --- |
| “İkinci evin depozitosunu ve aidatını ayrı ayrı söyler misin?” | Correctly identified the second listing, deposit, and maintenance fee. It also repeated a comparison request from the previous turn and marked that extra intent ambiguous. The extra intent had no evidence in the current turn. **Rejected.** | The application recovered both facts from the current request. “Synthetic Garden Flat — aidat: 0 TL. depozito bilgisi kayıtlarda yok ve doğrulanmamış.” The two facts were grounded and separate. “Depozito” should start with a capital letter for polish. |
| “Eşyalı mı, hafta sonu görebilir miyim?” | Identified both furnishing and viewing, retained the focused listing, and represented the missing time. **Accepted.** | The answer reported that the listing was unfurnished, then offered three verified Saturday slots and asked which worked. Repeating the listing name made the reply less fluid but did not obscure the result. Offering times did not create a booking. |

The original **10/10 live application checkpoints** and **1/2 accepted raw plans** stand. The first call counts as successful application recovery. Two turns do not establish a production accuracy rate. Both provider calls completed with no errors or retries.

The earlier live suite **bypassed the newer contact-intake policy**. Its synthetic assistant explicitly set `bookingNameRequired: false` and left `bookingContactMethod` unset. The live suite tested explicit confirmation, persistence and idempotency under that configuration. It did not test mandatory name, a contact method, or booking-specific permission.

## Isolated HTTPS rehearsal

- The application source manifest recomputed to `62484deb41b3462a5fdbca843d86cc3d38658cee07c7b089511854013fd741c7`, matching the live candidate. The production build completed, and the compiled dashboard and widget were served with the current API source and its normal routes on `https://127.0.0.1:5299`. The dashboard index SHA-256 was `b18e159f216b976b517ac45fb1fa7d809ccd9717267e3ce7222e39340fefaf47` and the widget bundle SHA-256 was `e77e3967b4f1ce45525cd87ada621fe328647983945c1b68b2cbdea0828ae25e`.
- The disposable stage used the existing synthetic real-estate seed, a new MongoDB 8.0.12 replica set, fixture responses, and an HTTPS wrapper for the existing offline launcher. Chromium trusted only the disposable CA added to its isolated NSS profile. Certificate verification stayed enabled. An independent curl check returned HTTP 200 for `/app` with TLS verification result 0. The logged-in dashboard session cookie had the Secure and HttpOnly flags.
- The assistant required a name and one valid phone or email with `bookingNameRequired=true` and `bookingContactMethod=either`. The existing intake and action controls required explicit booking-contact permission and separate final confirmation. Manual handoff was enabled. The rehearsal used synthetic names and contact values only.

| Browser check | Observed evidence |
| --- | --- |
| Deferral and reload | Selected a verified slot and deferred in the same message. The widget said the slot was not reserved. Reload preserved that reply. Explicit resumption started the name step. |
| Required details and separate consent | A premature booking confirmation still asked for a name. Supplying a name prompted for one contact method. A supplied email prompted for permission. “Tamam” failed to grant it. Explicit booking permission staged a pending proposal. The appointment count stayed at its seeded baseline. |
| Final confirmation and reload | Reload preserved the pending proposal and kept the submitted email out of the widget history. Clicking the visible confirm button created one appointment. Repeating the same confirmation endpoint returned the same appointment ID. The operator’s authorized dashboard showed the synthetic appointment with its name and contact. |
| Refusal | A separate visitor refused contact permission. ASTRA told the visitor the appointment was not created and handed the conversation to the team. The appointment count was unchanged. |

The browser rehearsal kept the existing checkout and the running demo configuration unchanged. It exercised local HTTPS and real persistence. The disposable wrapper did not exercise the production Caddy/Nginx images, public TLS, email delivery, external alerting, or a backup-restore incident. The source match establishes application code parity with the live candidate and the isolated stage, while image and deployment parity need separate sign-off.

### Staff takeover and operator recovery

A third synthetic visitor reached a pending booking proposal. The owner opened the exact conversation in the dashboard and clicked **Take over**. Confirming that proposal during takeover returned HTTP 403. The operator posted a staff reply through the dashboard and the visitor saw it after reloading the widget. A subsequent visitor confirmation message stayed in the staff-controlled conversation and cleared its intake draft without creating an appointment. The operator clicked **Return to bot**. The old proposal still returned HTTP 403, a fresh business contact question got a bot reply, and the appointment count did not increase. The run recorded zero external browser requests. This rehearsal covers the exercised recovery sequence, including a visitor message during takeover.

The synthetic seed had existing appointments. Assertions measured deltas from that baseline. The booking and refusal checks passed in one run. A subsequent takeover attempt hit the normal shared-IP rate limit; the recovery checks passed in a separate paced browser run. No rate limits were changed. The disposable stage was stopped after verification.

- Live plans and customer-visible checkpoints are in the [private live transcript](/tmp/astra-luna-TP4J7t/luna.json).
- The browser scripts and sanitized milestone logs are in the disposable staging evidence directory. The recorded account credentials and private TLS material are outside the repository. The ledger still shows **$0.199493** available, **$0.000507** in prior internal estimated cost, and no pending or uncertain reservation. This acceptance work made zero paid calls.

## Decision

**NO-GO for a supervised pilot with real business visitors. GO for a private, operator-led rehearsal with synthetic data.** The local application, booking policy and operator controls passed the scope above. The remaining real-visitor gates are:

1. A named business operator and backup must complete staff acceptance and own live supervision. Business and data owners must approve the notices, contact handling, retention and escalation procedure.
2. Obtain human Turkish-language sign-off on the live evidence, including the rejected plan and recovery. Keep raw model acceptance separate from application outcomes.
3. Pin the actual release images and ingress against this candidate, then verify the intended private access path, monitoring and alert ownership, rollback and restore readiness on that stack.

No real customer accounts were used and nothing was deployed publicly.

Rehearsal scripts and milestone logs: `/tmp/astra-pilot-https.xeD1x4`.
