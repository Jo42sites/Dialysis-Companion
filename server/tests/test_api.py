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
os.environ["SITE_ADMIN_EMAIL"] = "site-admin@example.test"
os.environ["SITE_ADMIN_PASSWORD"] = "Strong-Site-Admin-Password-2026"
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

    def test_patient_account_and_card_storage_api_is_disabled(self):
        registration = self.request(
            "POST",
            "/api/accounts/register",
            body={
                "email": "Patient@example.test",
                "password": "Strong-Patient-Password-2026",
            },
        )
        self.assertEqual(registration.status_code, 404)
        login = self.request(
            "POST",
            "/api/accounts/login",
            body={"email": "patient@example.test", "password": "Strong-Patient-Password-2026"},
        )
        self.assertEqual(login.status_code, 404)
        saved = self.request(
            "PUT",
            "/api/accounts/me/data",
            body={"card": {"name": "Must not be stored"}},
        )
        self.assertEqual(saved.status_code, 404)
        restored = self.request("GET", "/api/accounts/me/data")
        self.assertEqual(restored.status_code, 404)

        connection = connect_database()
        try:
            account_count = connection.execute(
                "SELECT count(*) AS total FROM guide_accounts"
            ).fetchone()["total"]
            self.assertEqual(account_count, 0)
        finally:
            connection.close()

    def test_site_admin_manages_cross_unit_records_and_revokes_access(self):
        denied = self.request("GET", "/api/site-admin/units")
        self.assertEqual(denied.status_code, 401)
        bad_login = self.request(
            "POST",
            "/api/site-admin/login",
            body={"email": "site-admin@example.test", "password": "wrong"},
        )
        self.assertEqual(bad_login.status_code, 401)
        login = self.request(
            "POST",
            "/api/site-admin/login",
            body={
                "email": "SITE-ADMIN@example.test",
                "password": "Strong-Site-Admin-Password-2026",
            },
        )
        self.assertEqual(login.status_code, 200, login.text)
        admin_token = login.json()["token"]

        first, _, _ = self.register_and_enroll("admin-unit-one", "unit.admin")
        second, _, _ = self.register_and_enroll("admin-unit-two", "unit.admin")
        first_record = self.request(
            "POST",
            "/api/units/records",
            token=first["token"],
            body={"id": "admin-patient-one", "name": "Admin Visible One"},
        )
        second_record = self.request(
            "POST",
            "/api/units/records",
            token=second["token"],
            body={"id": "admin-patient-two", "name": "Admin Visible Two"},
        )
        self.assertEqual(first_record.status_code, 201)
        self.assertEqual(second_record.status_code, 201)

        units = self.request("GET", "/api/site-admin/units", token=admin_token).json()["units"]
        first_unit = next(unit for unit in units if unit["slug"] == "admin-unit-one")
        second_unit = next(unit for unit in units if unit["slug"] == "admin-unit-two")
        for unit, record_id, expected_name in (
            (first_unit, "admin-patient-one", "Admin Visible One"),
            (second_unit, "admin-patient-two", "Admin Visible Two"),
        ):
            listed = self.request(
                "GET",
                f"/api/site-admin/units/{unit['id']}/records",
                token=admin_token,
            )
            self.assertEqual(listed.status_code, 200, listed.text)
            self.assertEqual(listed.json()["records"][0]["patientName"], expected_name)
            viewed = self.request(
                "GET",
                f"/api/site-admin/units/{unit['id']}/records/{record_id}",
                token=admin_token,
            )
            self.assertEqual(viewed.status_code, 200, viewed.text)

        changed = self.request(
            "PUT",
            f"/api/site-admin/units/{first_unit['id']}/records/admin-patient-one",
            token=admin_token,
            body={"name": "Admin Updated Record"},
        )
        self.assertEqual(changed.status_code, 200, changed.text)
        created = self.request(
            "POST",
            f"/api/site-admin/units/{first_unit['id']}/records",
            token=admin_token,
            body={"id": "admin-created", "record": {"name": "Created by Admin"}},
        )
        self.assertEqual(created.status_code, 201, created.text)
        deleted_record = self.request(
            "DELETE",
            f"/api/site-admin/units/{first_unit['id']}/records/admin-created",
            token=admin_token,
        )
        self.assertEqual(deleted_record.status_code, 204)

        suspended = self.request(
            "PATCH",
            f"/api/site-admin/units/{first_unit['id']}",
            token=admin_token,
            body={"active": False},
        )
        self.assertEqual(suspended.status_code, 200)
        revoked_unit_token = self.request(
            "GET", "/api/units/records", token=first["token"]
        )
        self.assertEqual(revoked_unit_token.status_code, 401)

        audit = self.request("GET", "/api/site-admin/audit", token=admin_token)
        self.assertEqual(audit.status_code, 200)
        actions = {event["action"] for event in audit.json()["events"]}
        self.assertIn("record.read", actions)
        self.assertIn("record.update", actions)
        self.assertIn("unit.status", actions)

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
