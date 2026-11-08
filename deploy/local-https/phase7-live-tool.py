"""Opt-in, at-most-one-successful-request GPT-6 Luna tool check with synthetic data.

Never run without a dedicated project, verified current prices and explicit spend approval.
"""
import json
import os
import subprocess
import time
import uuid
import urllib.error
import urllib.request
from decimal import Decimal, ROUND_CEILING
from pathlib import Path

from smoke import BASE, Client, PASSWORD, expect, mail_token

HERE = Path(__file__).resolve().parent
required = ["OPENAI_LIVE_TEST", "LIVE_SPEND_APPROVED", "LIVE_PRICES_VERIFIED",
            "PHASE7_TOOL_TEST", "PHASE7_DEDICATED_PROJECT_CONFIRMED"]
if any(os.getenv(name) != "1" for name in required):
    raise SystemExit("Live tool test requires explicit project, price and spending opt-ins; no request sent")
settings = dict(line.split("=", 1) for line in (HERE / ".secrets/api.env").read_text().splitlines()
                if line and not line.startswith("#") and "=" in line)
key = settings.get("OPENAI_API_KEY", "")
if not key or key.startswith(("local-", "replace-")):
    raise SystemExit("Dedicated non-placeholder OpenAI project key is required; no request sent")
if settings.get("OPENAI_MODEL") != "gpt-6-luna" or settings.get("OPENAI_REASONING_EFFORT") != "none":
    raise SystemExit("GPT-6 Luna with reasoning effort none is required; no request sent")
if int(settings.get("OPENAI_MAX_COMPLETION_TOKENS", "800")) > 128:
    raise SystemExit("Limit completion tokens to 128; no request sent")
if Decimal(settings.get("DEFAULT_DAILY_BUDGET_USD", "1")) > Decimal("0.10") or Decimal(settings.get("DEFAULT_MONTHLY_BUDGET_USD", "1")) > Decimal("0.50"):
    raise SystemExit("Set new-organization budget at most $0.10 daily/$0.50 monthly; no request sent")
container_id = subprocess.check_output(["docker", "compose", "-f", str(HERE / "compose.yaml"), "ps", "-q", "api"], text=True).strip()
if not container_id:
    raise SystemExit("Normal local HTTPS API container must be running; no request sent")
command = subprocess.check_output(["docker", "inspect", "--format", "{{json .Config.Cmd}}", container_id], text=True)
if "phase7-fixture-server" in command or "start" not in command:
    raise SystemExit("Synthetic fixture is running; live-provider test requires the normal API entry point")


def widget(client, token, method, path, body=None):
    headers = {"Origin": BASE, "Authorization": "Bearer " + token}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(BASE + "/api/widget" + path,
        data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
    try:
        response = client.http.open(request, timeout=45)
    except urllib.error.HTTPError as error:
        response = error
    raw = response.read()
    return response.status, json.loads(raw) if raw else {}


def ceil(tokens, rate):
    return int((Decimal(tokens) * Decimal(rate)).to_integral_value(rounding=ROUND_CEILING))


owner, visitor = Client(), Client()
email = f"phase7-live-{uuid.uuid4().hex[:10]}@example.test"
organization_id = None
started = None
try:
    registration, _ = expect(owner, "POST", "/api/auth/register", {
        "organizationName": "Phase 7 Live Synthetic", "name": "Synthetic Operator",
        "email": email, "password": PASSWORD,
    }, 201)
    organization_id = registration["organization"]["id"]
    expect(owner, "POST", "/api/auth/verify-email", {"token": mail_token(email, "verify")}, 200)
    base = f"/api/organizations/{organization_id}"
    listing, _ = expect(owner, "POST", base + "/listings", {
        "title": "Synthetic pilot apartment", "description": "Synthetic data for one provider check",
        "location": "Istanbul", "price": 100000, "currency": "USD", "propertyType": "apartment",
        "rooms": 2, "areaSqm": 90, "availability": "available",
        "publicUrl": "https://example.test/synthetic-pilot-apartment",
    }, 201)
    assistant, _ = expect(owner, "POST", base + "/assistants", {
        "name": "Synthetic real-estate assistant",
        "instructions": "For property questions use search_listings. Report only backend results. Keep the answer brief.",
        "allowedOrigins": [BASE], "active": True,
    }, 201)
    session, _ = expect(visitor, "POST", "/api/widget/sessions", {"publicKey": assistant["assistant"]["publicKey"]}, 201)
    started = time.perf_counter()
    status, result = widget(visitor, session["token"], "POST", "/messages", {
        "text": "Use search_listings for available apartments in Istanbul with at least 2 rooms and 80 m2, maximum 120000 USD. Show only the backend result.",
        "clientMessageId": str(uuid.uuid4()),
    })
    if status not in (201, 202):
        raise AssertionError(f"Provider request returned HTTP {status}; do not replay automatically")
    for _ in range(40):
        if result["status"] in ("completed", "failed"):
            break
        time.sleep(1)
        _, result = widget(visitor, session["token"], "GET", "/requests/" + result["requestId"])
    if result["status"] != "completed" or (result.get("action") or {}).get("name") != "search_listings":
        raise AssertionError("Expected a successful search_listings function call; no automatic replay")
    action_id = result["action"]["id"]
    assert result["action"]["result"]["listings"][0]["_id"] == listing["listing"]["_id"]
    assert result["action"]["result"]["listings"][0]["price"] == 100000
    actions, _ = expect(owner, "GET", base + "/export/agentActions", None, 200)
    matched = [item for item in actions["items"] if item["_id"] == action_id]
    assert len(matched) == 1 and matched[0]["name"] == "search_listings"
    args = matched[0]["arguments"]
    assert args["currency"] == "USD" and args["budgetMax"] <= 120000 and args["minRooms"] >= 2
    usage, _ = expect(owner, "GET", base + "/export/usage", None, 200)
    assert len(usage["items"]) == 1
    event = usage["items"][0]
    assert event["model"] == "gpt-6-luna" and event["billingStatus"] == "measured"
    assert event["inputTokens"] > 0 and event["outputTokens"] > 0
    if event["usageBreakdownKnown"]:
        input_cost = (ceil(event["inputTokens"] - event["cachedInputTokens"] - event["cacheWriteTokens"], settings["OPENAI_INPUT_USD_PER_MILLION_TOKENS"]) +
                      ceil(event["cachedInputTokens"], settings["OPENAI_CACHED_INPUT_USD_PER_MILLION_TOKENS"]) +
                      ceil(event["cacheWriteTokens"], settings["OPENAI_CACHE_WRITE_USD_PER_MILLION_TOKENS"]))
    else:
        input_cost = ceil(event["inputTokens"], max(Decimal(settings[name]) for name in (
            "OPENAI_INPUT_USD_PER_MILLION_TOKENS", "OPENAI_CACHED_INPUT_USD_PER_MILLION_TOKENS", "OPENAI_CACHE_WRITE_USD_PER_MILLION_TOKENS")))
    assert event["estimatedCostMicros"] == input_cost + ceil(event["outputTokens"], settings["OPENAI_OUTPUT_USD_PER_MILLION_TOKENS"])
    budgets, _ = expect(owner, "GET", base + "/budgets", None, 200)
    assert all(item["spentMicros"] == event["estimatedCostMicros"] and item["reservedMicros"] == 0 for item in budgets["windows"])
    logs = subprocess.check_output(["docker", "compose", "-f", str(HERE / "compose.yaml"), "logs", "--no-color", "api"], text=True)
    assert key not in logs and settings["SESSION_SECRET"] not in logs
    print(json.dumps({"status": "PASS-LIVE", "model": event["model"], "tool": matched[0]["name"],
                      "latencyMs": round((time.perf_counter() - started) * 1000),
                      "inputTokens": event["inputTokens"], "outputTokens": event["outputTokens"],
                      "estimatedCostMicros": event["estimatedCostMicros"], "listingMatched": True}))
finally:
    if organization_id:
        status, _, _ = owner.request("DELETE", f"/api/organizations/{organization_id}/tenant", {
            "organizationName": "Phase 7 Live Synthetic", "password": PASSWORD,
        })
        if status != 200:
            raise AssertionError(f"Synthetic tenant cleanup requires attention: HTTP {status}")
