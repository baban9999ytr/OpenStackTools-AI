# ASTRA Phase 2H pilot readiness

**Offline engineering: PASS**  
**Operational readiness: PARTIAL**  
**Live model quality: NOT REVERIFIED**  
**Supervised pilot: NO-GO**

The dashboard now supports the listing, inbox, and scheduling tasks a real-estate employee needs for a supervised rehearsal. The integrated synthetic business day ran through the Express API, durable queue, and a MongoDB replica set with a deterministic provider. The booking race yielded one confirmed appointment and one conflict. The latest candidate still needs fresh model-quality evidence, trained staff, and a monitored deployment before real customer traffic.

## Implemented changes

- **Listings.** Authorized staff can edit title, description, price, currency, location, property type, sale or rental, rooms, availability, maintenance fee, deposit, and furnishing. Blank optional facts remain unknown. A zero fee and explicit unfurnished status remain verified values. New listings require an entered price and area. Changing currency clears fee and deposit so staff verify the amounts in the new currency. Staff can clear rooms and the public link. Existing tenant and role checks remain enforced.
- **Front desk.** The tenant-scoped inbox shows current customer property preferences, the latest 200 messages, and up to five recent sanitized failure categories with time. Staff can refresh, take over, and reply. The panels discard conversation details when switching organizations.
- **Scheduling.** An owner or administrator can enable property viewings for an eligible consultant through Receptionist. Changing a slot or search criteria clears staff-side selection and confirmation. The action history surfaces property, consultant, time and duration when present.
- **Availability changes.** A slot disappearing between offer and selection now returns a request for another time. An unavailable property clears the stale viewing and prompts for another property or staff support. Both cases previously returned an inaccurate failure or left stale workflow state. An offered time remains provisional until backend confirmation.

## Readiness matrix

| Area | Evidence | Remaining gate |
| --- | --- | --- |
| AI quality | Frozen Luna replay passed all 7 delivered model-turn reply checks and all 4 conversations. Raw tool selection stayed at 3/7. | Independent Turkish review and a fresh, separately approved release-candidate verification |
| Listing management | Real tenant-scoped API persistence and validation, browser editing, unavailable inventory rejection, and restore of optional verified facts | Authorized staff acceptance and real inventory verification before onboarding |
| Appointment safety | Explicit confirmation, consultant/viewing schedule, Istanbul time conversion, duration, expiry, conflicts, idempotency, permitted changes, handoff and persistence exercised | Business schedule and staff ownership verified on the actual candidate environment |
| Customer privacy | Tenant boundaries, secure sessions, CSRF, phone refusal, retention, tenant export/deletion and audited staff actions exercised locally | Staff privacy sign-off, named data owner and approved retention/export/backup handling |
| Human takeover | Staff reply and audit persisted and following visitor input did not trigger another bot reply | Named duty person, response expectations and acknowledgement drill |
| Channel delivery | Local HTTPS website ingress and widget tests; channel regressions used controlled fixtures | Launch with the approved website origin only after staging acceptance. Each external channel requires its own live ingress and delivery acceptance. |
| Monitoring | Local health endpoints and staff-visible failure categories verified | Metrics, alert delivery, escalation and acknowledgement drill on the candidate |
| Recovery | Authenticated backup and isolated restore passed with booking and listing records | Encrypted off-host backup, timed restore objectives and rehearsed candidate rollback |
| Staff usability | Listing, inbox and confirmation controls exercised in browser, along with accessible mobile, themes and EN/TR regressions | Nontechnical staff walkthrough with the runbook and documented acceptance |
| Operating cost | Existing Luna policy and budgets retained, with historical usage and local enforcement evidence | Revalidate entitlement, current pricing, provider controls and cost monitoring for the actual project |

## Historical model evidence and cost

| Experiment | Completed provider responses | Provider-reported input / output / reasoning tokens | Internal estimate |
| --- | ---: | ---: | ---: |
| Phase 2F Milestone B, full run | 9 | 15,866 / 413 / 0 | $0.004179 |
| Phase 2F, seven matched turns | 7 | 12,572 / 365 / 0 | $0.003330 |
| Phase 2G, single-call diagnostic | 1 | 1,797 / 84 / 0 | $0.000492 |
| Phase 2G, completed seven-call run | 7 | 13,332 / 348 / 0 | $0.003512 |
| Earlier Phase 2G uncertain attempt | 0 | Unavailable | $0.005304 retained reservation |

The historical seven-turn comparison scored raw tool selection at 2/7 for 2F when rescored under the 2G contract and 3/7 for fresh 2G. Customer-visible reply checks were 4/7 on the matched 2F turns and 6/7 on fresh 2G. Fresh 2G passed 3/4 conversations. The subsequent offline replay preserved the raw result and passed 7/7 model-turn customer replies and 4/4 conversations after application corrections. It exercised 8 fixture turns in total, including one deterministic setup turn. Application-rendered replies and saved state earn application credit only.

The seven-call 2G sample implies about $0.50 in internal model estimates per 1,000 comparable successful provider calls. Conversation length, model-call frequency, and failures will affect the total. The historical fixed envelope reserved up to $0.010259 per approved call or $0.071813 across seven calls. Reservation is an admission ceiling. Provider invoice charges, current provider pricing and hosting, staff time, backup, and messaging costs were not measured in this phase. Existing Luna defaults and premium-routing controls were retained. Phase 2H made zero paid requests.

## Independent Turkish-language review

Use the private Phase 2F and 2G transcripts and the [Phase 2G review worksheet](ASTRA_PHASE_2G_MILESTONE_B_REVIEW_TEMPLATE.md). Review the seven shared turns separately from the full nine-call 2F run. For each turn, capture the raw model decision, server action or correction, and final delivered reply. Record separate numerators and denominators for natural Turkish, relevance, reference retention, appropriate tool or no-tool decision, grounded claims, helpful clarification, and multi-intent completeness. Assess compound completeness on the two D turns. Mark missing or inapplicable evidence unscored and record the reason. Review phone refusal and field-specific consent, comparable prices, corrected listing references, unverified property facts, and safe viewing guidance explicitly.

Raw misrouting, contact-field scope, weak reference correction, and incomplete answers to compound requests remain risks. Responses involving live inventory, booking status, or buyer information need hard factual and safety checks. Reviewer identity, narrative comments, and scores await independent review.

## Decision references

[Operational tests](ASTRA_PHASE_2H_OPERATIONAL_TEST_RESULTS.md) · [Staff runbook](ASTRA_PHASE_2H_PILOT_RUNBOOK.md) · [Remaining blockers](ASTRA_PHASE_2H_REMAINING_BLOCKERS.md)
