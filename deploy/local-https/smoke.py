"""Synthetic, TLS-verified local staging smoke test. Never contacts OpenAI."""

import http.cookiejar
import json
import re
import ssl
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = "https://ai.localhost"
MAILPIT = "http://127.0.0.1:8026/api/v1"
TLS = ssl.create_default_context(cafile=str(HERE / ".secrets/root-ca.crt"))
PASSWORD = "LocalStagingPassword123!"


class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.http = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=TLS),
            urllib.request.HTTPCookieProcessor(self.jar),
        )

    def request(self, method, path, body=None, *, origin=BASE, csrf=True):
        headers = {"Origin": origin}
        if body is not None:
            headers["Content-Type"] = "application/json"
        if csrf:
            headers["X-Requested-With"] = "XMLHttpRequest"
        req = urllib.request.Request(
            BASE + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers=headers,
            method=method,
        )
        try:
            response = self.http.open(req, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        raw = response.read()
        result = json.loads(raw) if raw else {}
        return response.status, result, response.headers


def verify_health_boundary():
    for path in ("/health/live", "/app"):
        with urllib.request.urlopen(BASE + path, context=TLS, timeout=10) as res:
            assert res.status == 200
            assert res.headers.get_all("Strict-Transport-Security") == ["max-age=300"], path
    try:
        urllib.request.urlopen(BASE + "/health/ready", context=TLS, timeout=10)
    except urllib.error.HTTPError as error:
        assert error.code == 404
    else:
        raise AssertionError("Readiness is reachable at the public edge")


verify_health_boundary()

def mail_token(email, purpose):
    subject = {"verify": "Verify your email", "reset": "Reset your password", "invite": "Accept your invitation"}[purpose]
    for _ in range(30):
        with urllib.request.urlopen(MAILPIT + "/messages", timeout=3) as response:
            messages = json.load(response)["messages"]
        for item in messages:
            if item["Subject"].endswith(subject) and any(
                recipient["Address"] == email for recipient in item["To"]
            ):
                with urllib.request.urlopen(MAILPIT + "/message/" + item["ID"], timeout=3) as response:
                    detail = json.load(response)
                match = re.search(r"https://ai\.localhost/app/#" + purpose + r"=([A-Za-z0-9_-]+)", detail["Text"])
                assert match, "Expected HTTPS account link is missing"
                return match.group(1)
        time.sleep(0.2)
    raise AssertionError("Sandbox email did not arrive")


def expect(client, method, path, body, status, **kwargs):
    actual, payload, headers = client.request(method, path, body, **kwargs)
    assert actual == status, (method, path, actual, payload)
    return payload, headers


def main():
    for path, expected in (("/app/assistants", 200), ("/embed.js", 200), ("/embed.css", 200), ("/health/live", 200), ("/health/ready", 404)):
        request = urllib.request.Request(BASE + path, method="GET")
        try:
            response = urllib.request.urlopen(request, context=TLS, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        assert response.status == expected, (path, response.status)
    status, _, headers = Client().request("GET", "/api/auth/me")
    assert status == 401 and headers.get("Cache-Control") == "no-store"
    assert headers.get("X-Request-ID"), "Missing request correlation ID"
    nonce = uuid.uuid4().hex[:12]
    owner_a, owner_b, invited = [Client() for _ in range(3)]
    emails = [f"local-{part}-{nonce}@example.test" for part in ("a", "b", "invite")]
    organizations = []
    password_a = PASSWORD
    try:
        for client, email, name in ((owner_a, emails[0], "TLS Test A"), (owner_b, emails[1], "TLS Test B")):
            payload, _ = expect(client, "POST", "/api/auth/register", {
                "organizationName": name, "name": "Synthetic Owner", "email": email, "password": PASSWORD,
            }, 201)
            organizations.append((client, payload["organization"]["id"], name))
            token = mail_token(email, "verify")
            _, headers = expect(client, "POST", "/api/auth/verify-email", {"token": token}, 200)
            cookie = headers.get("Set-Cookie", "")
            assert all(flag in cookie for flag in ("ost_session=", "Secure", "HttpOnly", "SameSite=Lax")), cookie
            assert "Domain=" not in cookie, "Session cookie must be host-only"
            expect(client, "POST", "/api/auth/verify-email", {"token": token}, 400)

        org_a, org_b = organizations[0][1], organizations[1][1]
        expect(owner_a, "GET", f"/api/organizations/{org_b}/budgets", None, 403)
        expect(owner_b, "GET", f"/api/organizations/{org_a}/assistants", None, 403)
        expect(owner_a, "POST", "/api/auth/logout", {}, 403, origin="https://foreign.example.test")
        expect(owner_a, "POST", "/api/auth/logout", {}, 403, csrf=False)

        payload, _ = expect(owner_a, "POST", f"/api/organizations/{org_a}/assistants", {
            "name": "Local HTTPS Assistant", "instructions": "Reply only to synthetic local staging checks.",
            "allowedOrigins": [BASE], "active": True,
        }, 201)
        public_key = payload["assistant"]["publicKey"]
        expect(owner_a, "POST", f"/api/organizations/{org_a}/invitations", {"email": emails[2], "role": "viewer"}, 201)
        invite = mail_token(emails[2], "invite")
        expect(invited, "POST", "/api/auth/accept-invitation", {
            "token": invite, "name": "Synthetic Viewer", "password": PASSWORD,
        }, 201)
        expect(invited, "POST", "/api/auth/accept-invitation", {
            "token": invite, "name": "Synthetic Viewer", "password": PASSWORD,
        }, 400)
        expect(invited, "GET", f"/api/organizations/{org_a}/budgets", None, 403)

        expect(owner_a, "PATCH", f"/api/organizations/{org_a}/budgets", {"dailyUsd": "0", "monthlyUsd": "0"}, 200)
        expect(owner_a, "PATCH", f"/api/organizations/{org_a}/retention", {"days": 1}, 200)
        expect(owner_b, "GET", f"/api/organizations/{org_a}/export/conversations", None, 403)
        expect(owner_a, "POST", "/api/widget/sessions", {"publicKey": public_key}, 403, origin="https://foreign.example.test")
        widget = Client()
        session, _ = expect(widget, "POST", "/api/widget/sessions", {"publicKey": public_key}, 201)
        token = session["token"]
        req = urllib.request.Request(BASE + "/api/widget/messages", data=json.dumps({
            "text": "Synthetic budget check", "clientMessageId": str(uuid.uuid4()),
        }).encode(), headers={"Content-Type": "application/json", "Origin": BASE, "Authorization": "Bearer " + token}, method="POST")
        try:
            response = widget.http.open(req, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        assert response.status == 402, (response.status, response.read())

        expect(owner_a, "POST", "/api/auth/request-password-reset", {"email": emails[0]}, 200)
        reset = mail_token(emails[0], "reset")
        expect(owner_a, "POST", "/api/auth/reset-password", {"token": reset, "password": PASSWORD + "New"}, 200)
        password_a = PASSWORD + "New"
        expect(owner_a, "GET", "/api/auth/me", None, 401)
        expect(owner_a, "POST", "/api/auth/reset-password", {"token": reset, "password": PASSWORD + "Other"}, 400)
        expect(owner_a, "POST", "/api/auth/login", {"email": emails[0], "password": PASSWORD + "New"}, 200)
        expect(owner_a, "GET", "/api/auth/sessions", None, 200)
        expect(owner_b, "POST", "/api/auth/logout", {}, 200)
        expect(owner_b, "GET", "/api/auth/me", None, 401)
        print("PASS: TLS account links, STARTTLS mail, cookies, CSRF, roles, tenant isolation, widget origin, zero budget, reset, sessions, logout")
    finally:
        for client, organization_id, name in organizations:
            password = password_a if client is owner_a else PASSWORD
            status, _, _ = client.request("DELETE", f"/api/organizations/{organization_id}/tenant", {
                "organizationName": name, "password": password,
            })
            if status == 401:
                email = emails[0] if client is owner_a else emails[1]
                login_status, _, _ = client.request("POST", "/api/auth/login", {"email": email, "password": password})
                if login_status == 200:
                    status, _, _ = client.request("DELETE", f"/api/organizations/{organization_id}/tenant", {
                        "organizationName": name, "password": password,
                    })
            if status != 200:
                raise AssertionError(f"Cleanup requires attention for organization {organization_id}: HTTP {status}")


if __name__ == "__main__":
    main()
