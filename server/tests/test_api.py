import os
import tempfile
import time
import unittest
from pathlib import Path

os.environ["JWT_SECRET"] = "test-jwt-secret-" + "x" * 40
os.environ["MEDICAL_DATA_KEY"] = "test-medical-key-" + "y" * 40
os.environ["DATABASE_PATH"] = str(Path(tempfile.gettempdir()) / f"dc-test-{os.getpid()}.sqlite")
os.environ["CORS_ORIGIN"] = "http://127.0.0.1:5500"
os.environ["NODE_ENV"] = "test"
Path(os.environ["DATABASE_PATH"]).unlink(missing_ok=True)

import pyotp
from fastapi.testclient import TestClient

import main
from database import connect_database


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        main.rate_windows.clear()
        cls.client = TestClient(main.app)
        cls.client.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)
        connection = connect_database()
        try:
            connection.close()
        finally:
            Path(os.environ["DATABASE_PATH"]).unlink(missing_ok=True)
            Path(os.environ["DATABASE_PATH"] + "-wal").unlink(missing_ok=True)
            Path(os.environ["DATABASE_PATH"] + "-shm").unlink(missing_ok=True)

    def request(self, method, path, *, body=None, token=None):
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return self.client.request(method, path, json=body, headers=headers)

    def setUp(self):
        main.rate_windows.clear()

    def register_and_enroll(self, slug, username):
        registered = self.request(
            "POST",
            "/api/units/register",
            body={
                "name": f"Unit {slug}",
                "slug": slug,
                "username": username,
                "password": "Strong-Unit-Password-2026",
            },
        )
        self.assertEqual(registered.status_code, 201, registered.text)
        secret = registered.json()["secret"]
        enrollment_code = pyotp.TOTP(secret).now()
        enrolled = self.request(
            "POST",
            "/api/units/mfa/confirm",
            body={
                "setupToken": registered.json()["setupToken"],
                "code": enrollment_code,
            },
        )
        self.assertEqual(enrolled.status_code, 200, enrolled.text)
        return enrolled.json(), secret, enrollment_code

    def test_registration_mfa_login_and_replay_protection(self):
        user, secret, enrollment_code = self.register_and_enroll("unit-one", "unit.admin")
        self.assertEqual(len(user["recoveryCodes"]), 10)

        replayed = self.request(
            "POST",
            "/api/units/login",
            body={
                "slug": "unit-one",
                "username": "unit.admin",
                "password": "Strong-Unit-Password-2026",
                "code": enrollment_code,
            },
        )
        self.assertEqual(replayed.status_code, 401)

        next_code = pyotp.TOTP(secret).at(int(time.time()) + 30)
        login = self.request(
            "POST",
            "/api/units/login",
            body={
                "slug": "unit-one",
                "username": "unit.admin",
                "password": "Strong-Unit-Password-2026",
                "code": next_code,
            },
        )
        self.assertEqual(login.status_code, 200, login.text)
        self.assertEqual(login.json()["user"]["role"], "admin")

    def test_encrypted_records_are_isolated_and_roles_are_enforced(self):
        admin, _, _ = self.register_and_enroll("unit-two", "unit.admin")
        token = admin["token"]
        created = self.request(
            "POST",
            "/api/units/records",
            token=token,
            body={"id": "patient-1", "name": "Private Test Patient"},
        )
        self.assertEqual(created.status_code, 201, created.text)
        listed = self.request("GET", "/api/units/records", token=token)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()["records"][0]["record"]["name"], "Private Test Patient")

        imported = self.request(
            "POST",
            "/api/units/records/import",
            token=token,
            body={"records": [{"id": "legacy-record", "record": {"name": "Imported"}}]},
        )
        self.assertEqual(imported.json(), {"imported": 1, "skipped": 0})
        duplicate_import = self.request(
            "POST",
            "/api/units/records/import",
            token=token,
            body={"records": [{"id": "legacy-record", "record": {"name": "Imported"}}]},
        )
        self.assertEqual(duplicate_import.json(), {"imported": 0, "skipped": 1})

        connection = connect_database()
        try:
            ciphertext = connection.execute(
                "SELECT ciphertext FROM patient_records WHERE id = 'patient-1'"
            ).fetchone()["ciphertext"]
            self.assertNotIn("Private Test Patient", ciphertext)
        finally:
            connection.close()

        added = self.request(
            "POST",
            "/api/units/users",
            token=token,
            body={
                "username": "read.only",
                "password": "Strong-Viewer-Password-2026",
                "role": "viewer",
            },
        )
        self.assertEqual(added.status_code, 201, added.text)
        setup = self.request(
            "POST",
            "/api/units/login",
            body={"slug": "unit-two", "username": "read.only", "password": "Strong-Viewer-Password-2026"},
        )
        self.assertTrue(setup.json()["mfaSetupRequired"])
        viewer = self.request(
            "POST",
            "/api/units/mfa/confirm",
            body={
                "setupToken": setup.json()["setupToken"],
                "code": pyotp.TOTP(setup.json()["secret"]).now(),
            },
        )
        self.assertEqual(viewer.status_code, 200, viewer.text)
        forbidden = self.request(
            "POST",
            "/api/units/records",
            token=viewer.json()["token"],
            body={"name": "Must not save"},
        )
        self.assertEqual(forbidden.status_code, 403)

        other, _, _ = self.register_and_enroll("unit-three", "other.admin")
        isolated = self.request("GET", "/api/units/records", token=other["token"])
        self.assertEqual(isolated.json()["records"], [])
        cross_unit_import = self.request(
            "POST",
            "/api/units/records/import",
            token=other["token"],
            body={"records": [{"id": "patient-1", "record": {"name": "Cross-unit"}}]},
        )
        self.assertEqual(cross_unit_import.status_code, 409)

        audit = self.request("GET", "/api/units/audit", token=token)
        self.assertEqual(audit.status_code, 200)
        self.assertNotIn("Private Test Patient", audit.text)

        deactivated = self.request(
            "DELETE",
            f"/api/units/users/{viewer.json()['user']['id']}",
            token=token,
        )
        self.assertEqual(deactivated.status_code, 204)
        revoked = self.request("GET", "/api/units/records", token=viewer.json()["token"])
        self.assertEqual(revoked.status_code, 401)

    def test_recovery_codes_are_single_use(self):
        user, _secret, _enrollment_code = self.register_and_enroll("unit-four", "unit.admin")
        code = user["recoveryCodes"][0]
        body = {
            "slug": "unit-four",
            "username": "unit.admin",
            "password": "Strong-Unit-Password-2026",
            "code": code,
        }
        self.assertEqual(self.request("POST", "/api/units/login", body=body).status_code, 200)
        self.assertEqual(self.request("POST", "/api/units/login", body=body).status_code, 401)

    def test_password_change_revokes_existing_token(self):
        admin, _, _ = self.register_and_enroll("unit-five", "unit.admin")
        changed = self.request(
            "PUT",
            "/api/units/me/password",
            token=admin["token"],
            body={
                "currentPassword": "Strong-Unit-Password-2026",
                "newPassword": "Another-Strong-Password-2026",
            },
        )
        self.assertEqual(changed.status_code, 204)
        revoked = self.request("GET", "/api/units/records", token=admin["token"])
        self.assertEqual(revoked.status_code, 401)

    def test_health_and_cors(self):
        self.assertEqual(self.request("GET", "/api/health").json(), {"status": "ok"})
        response = self.client.options(
            "/api/units/register",
            headers={
                "Origin": "http://127.0.0.1:5500",
                "Access-Control-Request-Method": "POST",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["access-control-allow-origin"], "http://127.0.0.1:5500"
        )

    def test_production_requires_https_behind_configured_proxy(self):
        previous_env = main.config.NODE_ENV
        previous_proxy_hops = main.config.TRUST_PROXY_HOPS
        try:
            main.config.NODE_ENV = "production"
            main.config.TRUST_PROXY_HOPS = 1
            insecure = self.client.get("/api/units/me")
            self.assertEqual(insecure.status_code, 426)
            forwarded_https = self.client.get(
                "/api/units/me",
                headers={"x-forwarded-proto": "https"},
            )
            self.assertEqual(forwarded_https.status_code, 401)
        finally:
            main.config.NODE_ENV = previous_env
            main.config.TRUST_PROXY_HOPS = previous_proxy_hops


if __name__ == "__main__":
    unittest.main()
