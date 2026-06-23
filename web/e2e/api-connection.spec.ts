import { test, expect } from "@playwright/test";

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://localhost:8000/api/v1";

test.describe("API Connection - Health Check", () => {
  test("health endpoint returns 200 with correct status", async ({ request }) => {
    const res = await request.get(`${API_BASE}/health/`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", service: "mentriq360-api" });
  });

  test("health endpoint responds under 5 seconds", async ({ request }) => {
    const start = Date.now();
    await request.get(`${API_BASE}/health/`);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  test("health endpoint returns JSON content-type", async ({ request }) => {
    const res = await request.get(`${API_BASE}/health/`);
    expect(res.headers()["content-type"]).toContain("application/json");
  });
});

test.describe("API Connection - Captcha Endpoint", () => {
  test("captcha endpoint returns 200 with challenge fields", async ({ request }) => {
    const res = await request.get(`${API_BASE}/auth/captcha/`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("challenge_id");
    expect(body).toHaveProperty("question");
    expect(body).toHaveProperty("expires_in");
    expect(body).not.toHaveProperty("code");
  });

  test("captcha question is a non-empty string", async ({ request }) => {
    const res = await request.get(`${API_BASE}/auth/captcha/`);
    const body = await res.json();
    expect(typeof body.question).toBe("string");
    expect(body.question.length).toBeGreaterThan(0);
  });

  test("captcha challenge_id is a non-empty string", async ({ request }) => {
    const res = await request.get(`${API_BASE}/auth/captcha/`);
    const body = await res.json();
    expect(typeof body.challenge_id).toBe("string");
    expect(body.challenge_id.length).toBeGreaterThan(0);
  });
});

test.describe("API Connection - Error Handling", () => {
  test("unknown endpoint returns 404", async ({ request }) => {
    const res = await request.get(`${API_BASE}/nonexistent-path/`);
    expect(res.status()).toBe(404);
  });

  test("unauthenticated protected endpoint returns 401", async ({ request }) => {
    const res = await request.get(`${API_BASE}/auth/me/`);
    expect(res.status()).toBe(401);
  });

  test("login with invalid credentials returns error", async ({ request }) => {
    const captchaRes = await request.get(`${API_BASE}/auth/captcha/`);
    const captcha = await captchaRes.json();
    const res = await request.post(`${API_BASE}/auth/token/`, {
      data: {
        username: "nonexistent",
        password: "wrong",
        captcha_id: captcha.challenge_id,
        captcha_answer: "wrong",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("CORS headers are present on API response", async ({ request }) => {
    const res = await request.get(`${API_BASE}/health/`);
    const headers = res.headers();
    const corsHeaders = ["access-control-allow-origin", "access-control-allow-credentials"];
    const hasCors = corsHeaders.some((h) => h in headers);
    // CORS is acceptable as wildcard or specific origin
    expect(hasCors || headers["access-control-allow-origin"] === "*").toBeTruthy();
  });
});

test.describe("API Connection - Token Auth Flow", () => {
  test("login with empty body returns validation error", async ({ request }) => {
    const res = await request.post(`${API_BASE}/auth/token/`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("token refresh with invalid token returns 401", async ({ request }) => {
    const res = await request.post(`${API_BASE}/auth/token/refresh/`, {
      data: { refresh: "invalid-token" },
    });
    expect(res.status()).toBe(401);
  });
});
