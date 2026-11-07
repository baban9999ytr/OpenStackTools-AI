# Local HTTPS staging runbook

This is an isolated, loopback-only staging exercise at `https://ai.localhost`. It uses the production Node API image and static Nginx web image, a Caddy TLS edge, an authenticated single-node MongoDB replica set, and a STARTTLS Mailpit sandbox. It is not a public deployment or evidence that public TLS, deliverability, or provider billing works.

## Start

From the repository root:

```bash
deploy/local-https/setup.sh
deploy/local-https/trust-browser-ca.sh
docker compose -f deploy/local-https/compose.yaml up -d --build
```

`setup.sh` generates an ignored `.secrets` directory with a local CA, hostname-matched leaf certificates, a MongoDB replica-set keyfile, dedicated random database credentials, a session secret, and `api.env`. It preserves existing secrets on repeat runs. The generated OpenAI key/model and prices are inert placeholders. **Do not send a live AI request until a dedicated key, supported model, verified prices, and a low spending target are configured and approved.** The stack's Mailpit accepts only `@example.test` recipients and requires STARTTLS, so synthetic account tests cannot send to customers.

The browser trust script adds only this local CA to the current user's Chromium NSS database. It does not turn off certificate validation or install a system-wide CA. `curl` should use the explicit CA file:

```bash
curl --cacert deploy/local-https/.secrets/root-ca.crt -I https://ai.localhost/app
curl --cacert deploy/local-https/.secrets/root-ca.crt -I https://ai.localhost/embed.js
curl -I http://ai.localhost/app
```

Expect HTTPS 200 for `/app` and `/embed.js`, a 301 HTTP redirect, and a certificate with `DNS:ai.localhost`. The edge binds ports 80 and 443 to `127.0.0.1` only. The Mailpit UI/API is at `http://127.0.0.1:8026`; the API, MongoDB, and web image have no host port. Keep `.secrets` private and never attach its contents to a ticket. The Docker build context excludes it.

## Verify

```bash
docker compose -f deploy/local-https/compose.yaml config --quiet
python3 deploy/local-https/smoke.py
node deploy/local-https/browser.mjs
docker compose -f deploy/local-https/compose.yaml exec -T mongo bash /run/local-config/backup-restore.sh
```

`smoke.py` verifies TLS through the local CA, sandbox account mail links, secure host-only cookies, CSRF rejection, two-tenant authorization, widget origin restrictions, zero-budget rejection before OpenAI, reset/session behavior, and logout. It deletes its synthetic organizations through the API. `browser.mjs` uses Chromium without a TLS bypass and checks the production dashboard, account flow, mobile keyboard navigation, English/Turkish, both themes, and accessibility; it deletes its synthetic organization. `backup-restore.sh` takes a full archive of the authenticated local application database after inserting two marked synthetic tenants, restores into a uniquely named isolated database, verifies records and an index, then removes only its marked source records and isolated target. It does not prove backup encryption or recovery time at production scale.

The auth rate limit is 15 requests per IP per 15-minute window. Run the smoke and browser scripts serially; repeating them in the same window may correctly return 429. Do not relax or bypass the limiter for tests.

Check `/health/live` through the edge. `/health/ready` is deliberately blocked at the public edge; query it only from within the API container when testing a MongoDB outage. Confirm unauthenticated MongoDB reads fail and the dedicated `local_app` user can authenticate. Use `docker compose -f deploy/local-https/compose.yaml ps` to confirm only loopback ports are published.

## Certificates and cleanup

The CA certificate is generated for one year and leaf certificates for 30 days on a fresh setup. To renew only leaf certificates while preserving database credentials and browser trust, run `deploy/local-https/renew-certs.sh`, then restart `edge` and `mailpit`. For an expired or replaced CA, remove the old browser trust entry first and deliberately create a new CA; replacing the whole `.secrets` directory also changes MongoDB and session credentials and requires a separate data migration or isolated volume reset. Do not casually delete it.

Stop containers without deleting the local database volume:

```bash
docker compose -f deploy/local-https/compose.yaml down
deploy/local-https/untrust-browser-ca.sh
```

The untrust command removes only the named local CA from this user's Chromium trust store. Stop the stack before removing trust. The ignored `.secrets` directory and isolated MongoDB volume remain on disk for an intentional later cleanup. Never use this stack with production customer data.
