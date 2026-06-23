from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase


# Use a dummy cache so AbuseGuardMiddleware & DRF throttling are no-ops.
_DUMMY_CACHE = {
    "default": {
        "BACKEND": "django.core.cache.backends.dummy.DummyCache",
    }
}

_COMMON = {
    "SECRET_KEY": "test-secret-key-for-api-connection-tests-123456",
    "CACHES": _DUMMY_CACHE,
}


@override_settings(**_COMMON)
class HealthCheckTests(APITestCase):
    def test_health_endpoint_returns_200(self):
        response = self.client.get("/api/v1/health/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_health_endpoint_returns_correct_json(self):
        response = self.client.get("/api/v1/health/")
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["service"], "mentriq360-api")

    def test_health_endpoint_content_type(self):
        response = self.client.get("/api/v1/health/")
        self.assertTrue(response.headers["Content-Type"].startswith("application/json"))

    def test_health_endpoint_allows_any_user(self):
        response = self.client.get("/api/v1/health/")
        self.assertEqual(response.status_code, 200)


@override_settings(**_COMMON)
class CaptchaEndpointTests(APITestCase):
    def test_captcha_endpoint_returns_200(self):
        response = self.client.get("/api/v1/auth/captcha/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_captcha_returns_required_fields(self):
        response = self.client.get("/api/v1/auth/captcha/")
        self.assertIn("challenge_id", response.data)
        self.assertIn("question", response.data)
        self.assertIn("expires_in", response.data)

    def test_captcha_does_not_expose_code(self):
        response = self.client.get("/api/v1/auth/captcha/")
        self.assertNotIn("code", response.data)

    def test_captcha_question_is_non_empty_string(self):
        response = self.client.get("/api/v1/auth/captcha/")
        self.assertIsInstance(response.data["question"], str)
        self.assertGreater(len(response.data["question"]), 0)

    def test_captcha_challenge_id_is_non_empty_string(self):
        response = self.client.get("/api/v1/auth/captcha/")
        self.assertIsInstance(response.data["challenge_id"], str)
        self.assertGreater(len(response.data["challenge_id"]), 0)

    def test_captcha_expires_in_is_positive_int(self):
        response = self.client.get("/api/v1/auth/captcha/")
        self.assertIsInstance(response.data["expires_in"], int)
        self.assertGreater(response.data["expires_in"], 0)

    def test_captcha_produces_different_challenges(self):
        challenges = set()
        for _ in range(5):
            response = self.client.get("/api/v1/auth/captcha/")
            challenges.add(response.data["challenge_id"])
        self.assertGreaterEqual(len(challenges), 2)


@override_settings(**_COMMON)
class ErrorHandlingTests(APITestCase):
    def test_unknown_endpoint_returns_404(self):
        response = self.client.get("/api/v1/nonexistent-path/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unauthenticated_protected_endpoint_returns_401(self):
        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_invalid_login_returns_400(self):
        captcha_response = self.client.get("/api/v1/auth/captcha/")
        captcha_data = captcha_response.json()
        response = self.client.post(
            "/api/v1/auth/token/",
            {
                "username": "nonexistent",
                "password": "wrong",
                "captcha_id": captcha_data["challenge_id"],
                "captcha_answer": "wrong",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_empty_login_body_returns_400(self):
        response = self.client.post(
            "/api/v1/auth/token/",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_token_refresh_returns_401(self):
        response = self.client.post(
            "/api/v1/auth/token/refresh/",
            {"refresh": "invalid-token"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


@override_settings(
    **_COMMON,
    CORS_ALLOW_ALL_ORIGINS=True,
)
class CORSTests(APITestCase):
    def test_cors_headers_present_with_origin(self):
        response = self.client.get(
            "/api/v1/health/",
            HTTP_ORIGIN="https://example.com",
        )
        self.assertIn("Access-Control-Allow-Origin", response.headers)

    def test_cors_allows_wildcard_or_specific_origin(self):
        response = self.client.get(
            "/api/v1/health/",
            HTTP_ORIGIN="https://example.com",
        )
        origin = response.headers.get("Access-Control-Allow-Origin", "")
        self.assertTrue(origin == "*" or origin == "https://example.com")


@override_settings(**_COMMON)
class APITimeoutResponseTests(APITestCase):
    def test_health_responds_under_5_seconds(self):
        import time
        start = time.time()
        self.client.get("/api/v1/health/")
        elapsed = time.time() - start
        self.assertLess(elapsed, 5)

    def test_multiple_rapid_requests_succeed(self):
        for _ in range(10):
            response = self.client.get("/api/v1/health/")
            self.assertEqual(response.status_code, 200)


@override_settings(**_COMMON)
class APIEndpointDiscoveryTests(APITestCase):
    def test_root_requires_authentication(self):
        response = self.client.get("/api/v1/")
        self.assertEqual(response.status_code, 401)

    def test_unknown_resource_returns_401_when_unauthenticated(self):
        response = self.client.get("/api/v1/schools/999999/")
        self.assertEqual(response.status_code, 401)
