"""Exactly one opt-in OpenAI conversation through the local HTTPS application."""

import json
import os
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from decimal import Decimal, ROUND_CEILING

from smoke import BASE, Client, PASSWORD, expect, mail_token

HERE = Path(__file__).resolve().parent
if os.getenv("OPENAI_LIVE_TEST") != "1" or os.getenv("LIVE_SPEND_APPROVED") != "1" or os.getenv("LIVE_PRICES_VERIFIED") != "1":
    raise SystemExit("Live test requires OPENAI_LIVE_TEST=1, LIVE_SPEND_APPROVED=1, and LIVE_PRICES_VERIFIED=1")

settings = dict(
    line.split("=", 1) for line in (HERE / ".secrets/api.env").read_text().splitlines()
    if line and not line.startswith("#") and "=" in line
)
if settings.get("OPENAI_API_KEY", "").startswith(("local-", "replace-")) or not settings.get("OPENAI_API_KEY"):
    raise SystemExit("Configure a dedicated provider key in the ignored local API environment first")
if settings.get("OPENAI_MODEL", "").startswith(("local-", "replace-")) or not settings.get("OPENAI_MODEL"):
    raise SystemExit("Configure a supported inexpensive chat model first")
if settings["OPENAI_MODEL"] != "gpt-6-luna" or settings.get("OPENAI_REASONING_EFFORT") != "none":
    raise SystemExit("This Phase 4B check requires GPT-6 Luna with reasoning effort none")
if int(settings.get("OPENAI_MAX_COMPLETION_TOKENS", "800")) > 128:
    raise SystemExit("Set OPENAI_MAX_COMPLETION_TOKENS to at most 128 for this test")
if float(settings.get("DEFAULT_DAILY_BUDGET_USD", "1")) > 0.10 or float(settings.get("DEFAULT_MONTHLY_BUDGET_USD", "1")) > 0.50:
    raise SystemExit("Keep local live-test organization budgets at or below $0.10 daily and $0.50 monthly")


def widget_request(client, method, path, token, body=None):
    headers = {"Origin": BASE, "Authorization": "Bearer " + token}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
        method=method,
    )
    try:
        response = client.http.open(request, timeout=45)
    except urllib.error.HTTPError as error:
        response = error
    return response.status, json.load(response)


nonce = uuid.uuid4().hex[:12]
email = f"live-openai-{nonce}@example.test"
owner, widget = Client(), Client()
organization_id = None
try:
    registration, _ = expect(owner, "POST", "/api/auth/register", {
        "organizationName": "One Call Provider Test", "name": "Synthetic Operator",
        "email": email, "password": PASSWORD,
    }, 201)
    organization_id = registration["organization"]["id"]
    expect(owner, "POST", "/api/auth/verify-email", {"token": mail_token(email, "verify")}, 200)
    assistant, _ = expect(owner, "POST", f"/api/organizations/{organization_id}/assistants", {
        "name": "One Call Assistant", "instructions": "Answer in one brief sentence. Do not use tools or personal data.",
        "allowedOrigins": [BASE], "active": True,
    }, 201)
    session, _ = expect(widget, "POST", "/api/widget/sessions", {
        "publicKey": assistant["assistant"]["publicKey"],
    }, 201)
    bearer = session["token"]
    started = time.perf_counter()
    status, result = widget_request(widget, "POST", "/api/widget/messages", bearer, {
        "text": "Reply with a short greeting for a synthetic integration test.",
        "clientMessageId": str(uuid.uuid4()),
    })
    if status not in (201, 202):
        raise AssertionError(f"Provider conversation failed with HTTP {status}; no automatic replay was attempted")
    request_id = result["requestId"]
    for _ in range(40):
        if result["status"] in ("completed", "failed"):
            break
        time.sleep(1)
        status, result = widget_request(widget, "GET", f"/api/widget/requests/{request_id}", bearer)
        assert status == 200
    assert result["status"] == "completed" and result["reply"], "One live request did not complete"
    latency_ms = round((time.perf_counter() - started) * 1000)
    conversation_id = result["conversationId"]
    status, persisted = widget_request(widget, "GET", f"/api/widget/conversations/{conversation_id}/messages", bearer)
    assert status == 200
    assert any(message["role"] == "customer" for message in persisted["messages"])
    assert any(message["role"] == "assistant" for message in persisted["messages"])

    usage, _ = expect(owner, "GET", f"/api/organizations/{organization_id}/export/usage", None, 200)
    assert len(usage["items"]) == 1, "Expected exactly one measured usage event"
    event = usage["items"][0]
    assert event["model"] == settings["OPENAI_MODEL"]
    assert event["inputTokens"] > 0 and event["outputTokens"] > 0
    assert event["estimatedCostMicros"] > 0 and event["billingStatus"] == "measured"
    assert 0 <= event["cachedInputTokens"] + event["cacheWriteTokens"] <= event["inputTokens"]
    assert 0 <= event["reasoningTokens"] <= event["outputTokens"]
    price = lambda key: Decimal(settings[key])
    ceil = lambda tokens, rate: int((Decimal(tokens) * rate).to_integral_value(rounding=ROUND_CEILING))
    if event["usageBreakdownKnown"]:
        input_cost = (
            ceil(event["inputTokens"] - event["cachedInputTokens"] - event["cacheWriteTokens"], price("OPENAI_INPUT_USD_PER_MILLION_TOKENS")) +
            ceil(event["cachedInputTokens"], price("OPENAI_CACHED_INPUT_USD_PER_MILLION_TOKENS")) +
            ceil(event["cacheWriteTokens"], price("OPENAI_CACHE_WRITE_USD_PER_MILLION_TOKENS"))
        )
    else:
        input_cost = ceil(event["inputTokens"], max(price("OPENAI_INPUT_USD_PER_MILLION_TOKENS"), price("OPENAI_CACHED_INPUT_USD_PER_MILLION_TOKENS"), price("OPENAI_CACHE_WRITE_USD_PER_MILLION_TOKENS")))
    expected_cost = input_cost + ceil(event["outputTokens"], price("OPENAI_OUTPUT_USD_PER_MILLION_TOKENS"))
    assert expected_cost == event["estimatedCostMicros"], "Recorded cost did not match configured prices"
    budgets, _ = expect(owner, "GET", f"/api/organizations/{organization_id}/budgets", None, 200)
    assert len(budgets["windows"]) == 2
    assert all(window["spentMicros"] == event["estimatedCostMicros"] and window["reservedMicros"] == 0 for window in budgets["windows"])

    expect(owner, "PATCH", f"/api/organizations/{organization_id}/budgets", {"dailyUsd": "0", "monthlyUsd": "0"}, 200)
    status, _ = widget_request(widget, "POST", "/api/widget/messages", bearer, {
        "text": "This must be blocked before another provider call.",
        "conversationId": conversation_id,
        "clientMessageId": str(uuid.uuid4()),
    })
    assert status == 402, f"Budget exhaustion returned HTTP {status}"
    usage_after, _ = expect(owner, "GET", f"/api/organizations/{organization_id}/export/usage", None, 200)
    assert len(usage_after["items"]) == 1, "Budget test unexpectedly made another provider call"
    logs = subprocess.check_output([
        "docker", "compose", "-f", str(HERE / "compose.yaml"), "logs", "--no-color", "api",
    ], text=True)
    assert settings["OPENAI_API_KEY"] not in logs and settings["SESSION_SECRET"] not in logs
    print(json.dumps({
        "status": "PASS-LIVE", "providerCalls": 1, "model": event["model"],
        "latencyMs": latency_ms,
        "inputTokens": event["inputTokens"], "outputTokens": event["outputTokens"],
        "cachedInputTokens": event["cachedInputTokens"], "cacheWriteTokens": event["cacheWriteTokens"],
        "reasoningTokens": event["reasoningTokens"], "usageBreakdownKnown": event["usageBreakdownKnown"],
        "estimatedCostMicros": event["estimatedCostMicros"],
        "conversationPersisted": True, "budgetExhaustionBlocked": True,
    }))
finally:
    if organization_id:
        status, _, _ = owner.request("DELETE", f"/api/organizations/{organization_id}/tenant", {
            "organizationName": "One Call Provider Test", "password": PASSWORD,
        })
        if status != 200:
            raise AssertionError(f"Synthetic test tenant cleanup requires attention: HTTP {status}")
