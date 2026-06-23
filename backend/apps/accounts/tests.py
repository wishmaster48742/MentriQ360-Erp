import time
from datetime import timedelta
from unittest.mock import patch

from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.captcha import make_captcha_token
from apps.accounts.models import User, UserRole
from apps.accounts.serializers import _FAIL_PREFIX, _FAIL_IP_PREFIX, _MAX_FAILURES, _LOCKOUT_SECONDS
from apps.core.models import Campus, CampusMembership


@override_settings(
    SECRET_KEY="test-secret-key-that-is-at-least-32-bytes-long",
    REST_FRAMEWORK={
        "DEFAULT_AUTHENTICATION_CLASSES": [
            "rest_framework_simplejwt.authentication.JWTAuthentication",
        ],
        "DEFAULT_THROTTLE_CLASSES": [],
        "DEFAULT_THROTTLE_RATES": {},
    },
)
class LoginCaptchaTests(APITestCase):
    def setUp(self):
        from rest_framework.settings import api_settings
        if hasattr(api_settings, '_user_settings'):
            del api_settings._user_settings
        from django.core.cache import cache
        cache.clear()
        self.school = Campus.objects.create(name="Login Test School", code="LOGIN")
        self.user = User.objects.create_user(
            username="login.admin",
            password="Passw0rd!Admin1",
            role=UserRole.SCHOOL_ADMIN,
            school=self.school,
            is_staff=True,
        )
        CampusMembership.objects.create(
            campus=self.school,
            user=self.user,
            role="it_admin",
            is_primary=True,
            can_manage_users=True,
            can_configure_attendance=True,
        )

    # ── Captcha endpoint ──────────────────────────────────────────────────────

    def test_captcha_challenge_is_public_and_contains_question(self):
        response = self.client.get("/api/v1/auth/captcha/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("challenge_id", response.data)
        self.assertIn("expires_in", response.data)
        self.assertIn("question", response.data)
        # Plaintext code must NOT be present in the response.
        self.assertNotIn("code", response.data)
        # Question should look like "23 + 47 = ?" or "50 - 12 = ?"
        self.assertRegex(response.data["question"], r"^\d+ [+\-] \d+ = \?$")

    def test_captcha_does_not_expose_answer(self):
        """The numeric answer must not appear anywhere in the API response."""
        response = self.client.get("/api/v1/auth/captcha/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        question = response.data["question"]
        # Parse the question to find the expected answer.
        import re
        m = re.match(r"(\d+) ([+\-]) (\d+) = \?", question)
        self.assertIsNotNone(m)
        a, op, b = int(m.group(1)), m.group(2), int(m.group(3))
        answer = str(a + b) if op == "+" else str(a - b)
        # The raw answer string must not appear in challenge_id or expires_at.
        self.assertNotIn(answer, str(response.data.get("challenge_id", "")))

    # ── Login validation ──────────────────────────────────────────────────────

    def test_login_requires_valid_captcha(self):
        missing = self.client.post(
            "/api/v1/auth/token/",
            {"username": "login.admin", "password": "Passw0rd!Admin1"},
            format="json",
        )
        invalid = self.client.post(
            "/api/v1/auth/token/",
            {
                "username": "login.admin",
                "password": "Passw0rd!Admin1",
                "captcha_id": make_captcha_token("25"),
                "captcha_answer": "999",
            },
            format="json",
        )

        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_accepts_valid_captcha(self):
        response = self.client.post(
            "/api/v1/auth/token/",
            {
                "username": "login.admin",
                "password": "Passw0rd!Admin1",
                "captcha_id": make_captcha_token("25"),
                "captcha_answer": "25",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertEqual(response.data["user"]["username"], "login.admin")

    def test_captcha_token_cannot_be_reused(self):
        """A valid captcha token is consumed after one successful use."""
        token = make_captcha_token("25")
        payload = {
            "username": "login.admin",
            "password": "Passw0rd!Admin1",
            "captcha_id": token,
            "captcha_answer": "25",
        }
        first = self.client.post("/api/v1/auth/token/", payload, format="json")
        second = self.client.post("/api/v1/auth/token/", payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        # Second attempt must fail because the captcha token was already consumed.
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_rejects_inactive_school(self):
        self.school.status = "inactive"
        self.school.save(update_fields=["status", "updated_at"])

        response = self.client.post(
            "/api/v1/auth/token/",
            {
                "username": "login.admin",
                "password": "Passw0rd!Admin1",
                "captcha_id": make_captcha_token("25"),
                "captcha_answer": "25",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_inactive_school_error_does_not_reveal_school_name(self):
        """Error message must not expose the school name or status."""
        self.school.status = "inactive"
        self.school.save(update_fields=["status", "updated_at"])

        response = self.client.post(
            "/api/v1/auth/token/",
            {
                "username": "login.admin",
                "password": "Passw0rd!Admin1",
                "captcha_id": make_captcha_token("25"),
                "captcha_answer": "25",
            },
            format="json",
        )

        error_text = str(response.data)
        self.assertNotIn(self.school.name, error_text)
        self.assertNotIn("inactive", error_text)

    # ── Brute-force lockout ───────────────────────────────────────────────────

    def test_account_locked_after_max_failures(self):
        from django.core.cache import cache

        cache.clear()
        username = "login.admin"

        for _ in range(_MAX_FAILURES):
            self.client.post(
                "/api/v1/auth/token/",
                {
                    "username": username,
                    "password": "WrongPassword!1",
                    "captcha_id": make_captcha_token("25"),
                    "captcha_answer": "25",
                },
                format="json",
            )

        # The next attempt should be refused due to lockout.
        locked_response = self.client.post(
            "/api/v1/auth/token/",
            {
                "username": username,
                "password": "Passw0rd!Admin1",
                "captcha_id": make_captcha_token("25"),
                "captcha_answer": "25",
            },
            format="json",
        )
        self.assertEqual(locked_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("locked", str(locked_response.data).lower())

        cache.clear()

    def test_successful_login_clears_failure_counter(self):
        from django.core.cache import cache

        cache.clear()
        username = "login.admin"

        # Two failures
        for _ in range(2):
            self.client.post(
                "/api/v1/auth/token/",
                {
                    "username": username,
                    "password": "WrongPassword!1",
                    "captcha_id": make_captcha_token("25"),
                    "captcha_answer": "25",
                },
                format="json",
            )
        self.assertEqual(int(cache.get(f"{_FAIL_PREFIX}{username}") or 0), 2)

        # Successful login clears the counter
        self.client.post(
            "/api/v1/auth/token/",
            {
                "username": username,
                "password": "Passw0rd!Admin1",
                "captcha_id": make_captcha_token("25"),
                "captcha_answer": "25",
            },
            format="json",
        )
        self.assertEqual(int(cache.get(f"{_FAIL_PREFIX}{username}") or 0), 0)

        cache.clear()

    # ── Logout ────────────────────────────────────────────────────────────────

    def test_logout_blacklists_refresh_token(self):
        login = self.client.post(
            "/api/v1/auth/token/",
            {
                "username": "login.admin",
                "password": "Passw0rd!Admin1",
                "captcha_id": make_captcha_token("25"),
                "captcha_answer": "25",
            },
            format="json",
        )
        self.assertEqual(login.status_code, status.HTTP_200_OK)
        access = login.data["access"]
        refresh = login.data["refresh"]

        # Logout
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        logout_response = self.client.post(
            "/api/v1/auth/logout/",
            {"refresh": refresh},
            format="json",
        )
        self.assertEqual(logout_response.status_code, status.HTTP_200_OK)

        # The blacklisted refresh token must no longer produce new access tokens.
        refresh_response = self.client.post(
            "/api/v1/auth/token/refresh/",
            {"refresh": refresh},
            format="json",
        )
        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_requires_authentication(self):
        response = self.client.post(
            "/api/v1/auth/logout/",
            {"refresh": "invalid-token"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class SuperAdminProtectionTests(APITestCase):
    def setUp(self):
        self.super_admin = User.objects.create_user(
            username="protected.super",
            password="Passw0rd!Admin1",
            role=UserRole.SUPER_ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(user=self.super_admin)

    def test_super_admin_cannot_be_disabled_or_deleted(self):
        disable_response = self.client.patch(
            f"/api/v1/auth/users/{self.super_admin.id}/",
            {"is_active": False},
            format="json",
        )
        delete_response = self.client.delete(f"/api/v1/auth/users/{self.super_admin.id}/")

        self.assertEqual(disable_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(delete_response.status_code, status.HTTP_403_FORBIDDEN)

        self.super_admin.refresh_from_db()
        self.assertTrue(self.super_admin.is_active)
        self.assertEqual(self.super_admin.role, UserRole.SUPER_ADMIN)

    def test_super_admin_cannot_be_modified_by_another_user(self):
        other_super_admin = User.objects.create_user(
            username="other.super",
            password="Passw0rd!Admin1",
            role=UserRole.SUPER_ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        self.client.force_authenticate(user=other_super_admin)

        response = self.client.patch(
            f"/api/v1/auth/users/{self.super_admin.id}/",
            {"first_name": "Tampered"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.super_admin.refresh_from_db()
        self.assertEqual(self.super_admin.first_name, "")


class PasswordPolicyTests(APITestCase):
    def setUp(self):
        self.super_admin = User.objects.create_user(
            username="pw.policy.super",
            password="Passw0rd!Admin1",
            role=UserRole.SUPER_ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        self.school = Campus.objects.create(name="PW Test School", code="PWTEST")
        self.client.force_authenticate(user=self.super_admin)

    def _create_payload(self, password: str) -> dict:
        return {
            "username": "newuser.test",
            "password": password,
            "role": "school_admin",
            "school": str(self.school.id),
            "campus_ids": [str(self.school.id)],
        }

    def test_rejects_short_password(self):
        response = self.client.post(
            "/api/v1/auth/users/",
            self._create_payload("Short1!"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_password_without_uppercase(self):
        response = self.client.post(
            "/api/v1/auth/users/",
            self._create_payload("nouppercase1!"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_password_without_special_char(self):
        response = self.client.post(
            "/api/v1/auth/users/",
            self._create_payload("NoSpecial1234"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_accepts_strong_password(self):
        response = self.client.post(
            "/api/v1/auth/users/",
            self._create_payload("Str0ng!Pass#2"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


# ── Security: Password Reset ────────────────────────────────────────────────

@override_settings(
    SECRET_KEY="test-secret-key-that-is-at-least-32-bytes-long",
    MENTRIQ_PASSWORD_RESET_TOKEN_MINUTES=30,
    REST_FRAMEWORK={
        "DEFAULT_AUTHENTICATION_CLASSES": [
            "rest_framework_simplejwt.authentication.JWTAuthentication",
        ],
        "DEFAULT_THROTTLE_CLASSES": [],
        "DEFAULT_THROTTLE_RATES": {},
    },
)
class PasswordResetTests(APITestCase):
    def setUp(self):
        throttling_patcher = patch(
            "apps.accounts.views.PasswordResetRequestView.get_throttles",
            return_value=[],
        )
        throttling_patcher.start()
        self.addCleanup(throttling_patcher.stop)
        throttling_confirm_patcher = patch(
            "apps.accounts.views.PasswordResetConfirmView.get_throttles",
            return_value=[],
        )
        throttling_confirm_patcher.start()
        self.addCleanup(throttling_confirm_patcher.stop)
        self.user = User.objects.create_user(
            username="reset.user",
            password="Passw0rd!Admin1",
            email="reset@example.com",
            role=UserRole.SCHOOL_ADMIN,
        )

    def test_password_reset_request_with_valid_email(self):
        response = self.client.post(
            "/api/v1/auth/password-reset/request/",
            {"email": "reset@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("token", response.data)
        self.assertIn("expires_in_minutes", response.data)

    def test_password_reset_request_with_unknown_email(self):
        response = self.client.post(
            "/api/v1/auth/password-reset/request/",
            {"email": "unknown@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_password_reset_confirm_with_valid_token(self):
        request_resp = self.client.post(
            "/api/v1/auth/password-reset/request/",
            {"email": "reset@example.com"},
            format="json",
        )
        token = request_resp.data["token"]

        response = self.client.post(
            "/api/v1/auth/password-reset/confirm/",
            {"token": token, "new_password": "NewStr0ng!Pass1"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify the new password works
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewStr0ng!Pass1"))

    def test_password_reset_confirm_rejects_malformed_token(self):
        response = self.client.post(
            "/api/v1/auth/password-reset/confirm/",
            {"token": "not-a-valid-token", "new_password": "NewStr0ng!Pass1"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_password_reset_confirm_rejects_weak_password(self):
        request_resp = self.client.post(
            "/api/v1/auth/password-reset/request/",
            {"email": "reset@example.com"},
            format="json",
        )
        token = request_resp.data["token"]

        response = self.client.post(
            "/api/v1/auth/password-reset/confirm/",
            {"token": token, "new_password": "short1!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_password_reset_updates_password_changed_at(self):
        request_resp = self.client.post(
            "/api/v1/auth/password-reset/request/",
            {"email": "reset@example.com"},
            format="json",
        )
        token = request_resp.data["token"]
        self.client.post(
            "/api/v1/auth/password-reset/confirm/",
            {"token": token, "new_password": "NewStr0ng!Pass2"},
            format="json",
        )
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.password_changed_at)


# ── Security: IP-based Brute-force Lockout ────────────────────────────────────

@override_settings(
    SECRET_KEY="test-secret-key-that-is-at-least-32-bytes-long",
    REST_FRAMEWORK={
        "DEFAULT_AUTHENTICATION_CLASSES": [
            "rest_framework_simplejwt.authentication.JWTAuthentication",
        ],
        "DEFAULT_THROTTLE_CLASSES": [],
        "DEFAULT_THROTTLE_RATES": {},
    },
)
class IPBruteForceLockoutTests(APITestCase):
    def setUp(self):
        from rest_framework.settings import api_settings
        if hasattr(api_settings, '_user_settings'):
            del api_settings._user_settings
        from django.core.cache import cache
        cache.clear()
        self.school = Campus.objects.create(name="IP Lock School", code="IPLOCK")
        self.user = User.objects.create_user(
            username="ip.lock.user",
            password="Passw0rd!Admin1",
            role=UserRole.SCHOOL_ADMIN,
            school=self.school,
            is_staff=True,
        )
        CampusMembership.objects.create(
            campus=self.school,
            user=self.user,
            role="it_admin",
            is_primary=True,
            can_manage_users=True,
            can_configure_attendance=True,
        )

    def test_ip_is_tracked_on_failed_login(self):
        from django.core.cache import cache
        cache.clear()
        for _ in range(3):
            self.client.post(
                "/api/v1/auth/token/",
                {
                    "username": "ip.lock.user",
                    "password": "WrongPassword!1",
                    "captcha_id": make_captcha_token("25"),
                    "captcha_answer": "25",
                },
                format="json",
                REMOTE_ADDR="10.0.0.99",
            )
        ip_key = f"{_FAIL_IP_PREFIX}10.0.0.99"
        self.assertGreaterEqual(int(cache.get(ip_key) or 0), 3)

    def test_ip_lockout_after_excessive_failures(self):
        from django.core.cache import cache
        cache.clear()
        # Exceed IP threshold (2 * _MAX_FAILURES)
        for _ in range(_MAX_FAILURES * 2 + 1):
            self.client.post(
                "/api/v1/auth/token/",
                {
                    "username": "ip.lock.user",
                    "password": "WrongPassword!1",
                    "captcha_id": make_captcha_token("25"),
                    "captcha_answer": "25",
                },
                format="json",
                REMOTE_ADDR="10.0.0.100",
            )

        response = self.client.post(
            "/api/v1/auth/token/",
            {
                "username": "ip.lock.user",
                "password": "Passw0rd!Admin1",
                "captcha_id": make_captcha_token("25"),
                "captcha_answer": "25",
            },
            format="json",
            REMOTE_ADDR="10.0.0.100",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("locked", str(response.data).lower())
        cache.clear()


# ── Security: Email Verification ──────────────────────────────────────────────

@override_settings(
    SECRET_KEY="test-secret-key-that-is-at-least-32-bytes-long",
    MENTRIQ_VERIFICATION_TOKEN_HOURS=48,
    REST_FRAMEWORK={
        "DEFAULT_AUTHENTICATION_CLASSES": [
            "rest_framework_simplejwt.authentication.JWTAuthentication",
        ],
        "DEFAULT_THROTTLE_CLASSES": [],
        "DEFAULT_THROTTLE_RATES": {},
    },
)
class EmailVerificationTests(APITestCase):
    def setUp(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        throttling_patcher = patch(
            "apps.accounts.views.EmailVerificationSendView.get_throttles",
            return_value=[],
        )
        throttling_patcher.start()
        self.addCleanup(throttling_patcher.stop)
        self.user = User.objects.create_user(
            username="verify.user",
            password="Passw0rd!Admin1",
            email="verify@example.com",
            role=UserRole.SCHOOL_ADMIN,
        )
        self.refresh = RefreshToken.for_user(self.user)
        self.access = str(self.refresh.access_token)

    def test_send_verification_returns_token(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access}")
        response = self.client.post("/api/v1/auth/email-verification/send/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("token", response.data)
        self.assertIn("expires_in_hours", response.data)

    def test_verify_email_with_valid_token(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access}")
        send_resp = self.client.post("/api/v1/auth/email-verification/send/")
        token = send_resp.data["token"]

        self.client.credentials()
        response = self.client.post(
            "/api/v1/auth/email-verification/confirm/",
            {"token": token},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_email_verified)

    def test_verify_email_rejects_invalid_token(self):
        response = self.client.post(
            "/api/v1/auth/email-verification/confirm/",
            {"token": "invalid-token"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_already_verified_returns_error(self):
        self.user.is_email_verified = True
        self.user.save(update_fields=["is_email_verified"])
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access}")
        response = self.client.post("/api/v1/auth/email-verification/send/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ── Security: Password Change session invalidation ────────────────────────────

@override_settings(
    SECRET_KEY="test-secret-key-that-is-at-least-32-bytes-long",
    REST_FRAMEWORK={
        "DEFAULT_AUTHENTICATION_CLASSES": [
            "rest_framework_simplejwt.authentication.JWTAuthentication",
        ],
        "DEFAULT_THROTTLE_CLASSES": [],
        "DEFAULT_THROTTLE_RATES": {},
    },
)
class PasswordChangeSecurityTests(APITestCase):
    def setUp(self):
        from rest_framework.settings import api_settings
        if hasattr(api_settings, '_user_settings'):
            del api_settings._user_settings
        self.school = Campus.objects.create(name="PW Change School", code="PWCHG")
        self.user = User.objects.create_user(
            username="pwchange.user",
            password="Passw0rd!Admin1",
            role=UserRole.SCHOOL_ADMIN,
            school=self.school,
            is_staff=True,
        )
        CampusMembership.objects.create(
            campus=self.school,
            user=self.user,
            role="it_admin",
            is_primary=True,
            can_manage_users=True,
            can_configure_attendance=True,
        )

    def test_password_change_updates_password_changed_at(self):
        self.assertIsNone(self.user.password_changed_at)
        login = self.client.post(
            "/api/v1/auth/token/",
            {
                "username": "pwchange.user",
                "password": "Passw0rd!Admin1",
                "captcha_id": make_captcha_token("25"),
                "captcha_answer": "25",
            },
            format="json",
        )
        access = login.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

        response = self.client.post(
            "/api/v1/auth/change-password/",
            {"current_password": "Passw0rd!Admin1", "new_password": "N3wStr0ng!Pass"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.password_changed_at)

    def test_password_change_rejects_wrong_current_password(self):
        login = self.client.post(
            "/api/v1/auth/token/",
            {
                "username": "pwchange.user",
                "password": "Passw0rd!Admin1",
                "captcha_id": make_captcha_token("25"),
                "captcha_answer": "25",
            },
            format="json",
        )
        access = login.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

        response = self.client.post(
            "/api/v1/auth/change-password/",
            {"current_password": "WrongPass!1", "new_password": "N3wStr0ng!Pass"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_password_change_rejects_weak_password(self):
        login = self.client.post(
            "/api/v1/auth/token/",
            {
                "username": "pwchange.user",
                "password": "Passw0rd!Admin1",
                "captcha_id": make_captcha_token("25"),
                "captcha_answer": "25",
            },
            format="json",
        )
        access = login.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

        response = self.client.post(
            "/api/v1/auth/change-password/",
            {"current_password": "Passw0rd!Admin1", "new_password": "short1!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ── Security: Argon2 Password Hasher ─────────────────────────────────────────

class Argon2PasswordHasherTests(APITestCase):
    def test_argon2_is_default_hasher(self):
        from django.conf import settings
        self.assertEqual(
            settings.PASSWORD_HASHERS[0],
            "django.contrib.auth.hashers.Argon2PasswordHasher",
        )
