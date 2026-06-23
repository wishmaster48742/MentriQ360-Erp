from __future__ import annotations

import logging
import re
import time
from collections import defaultdict
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.http import HttpRequest, HttpResponse
from django.utils import timezone

from .tenant import activate_campus_tenant, reset_campus_tenant


RESERVED_TENANT_HOSTS = {"admin", "app", "erp", "login", "portal", "www"}

logger = logging.getLogger("mentriq.security")

# ─── Bot / known-scraper User-Agent patterns ─────────────────────────────
_BOT_USER_AGENTS: list[re.Pattern[str]] = [
    re.compile(p, re.I)
    for p in [
        r"^$",                                        # empty UA
        r"ahrefsbot",
        r"amazonbot",
        r"anthropic-ai",
        r"archivebot",
        r"baiduspider",
        r"bytespider",
        r"claudebot",
        r"claude-web",
        r"datadog",
        r"dotbot",
        r"facebot",
        r"facebookexternalhit",
        r"googlebot",
        r"google-extended",
        r"gptbot",
        r"imagesiftbot",
        r"magestic",
        r"masscan",
        r"mj12bot",
        r"nmap",
        r"openai",
        r"petalbot",
        r"scrapy",
        r"semrushbot",
        r"seznambot",
        r"slurp",
        r"sqlmap",
        r"zgrab",
    ]
]

# ─── IP blocklist management ──────────────────────────────────────────────
_BLOCKLIST_PREFIX = "abuse:blocked:"
_BLOCKLIST_TTL_KEY = "abuse:blocked_ttl:"
_ESCALATION_STAGES = [300, 1800, 7200, 86400]  # 5min → 30min → 2hr → 24hr

# ─── Scraping detection ───────────────────────────────────────────────────
_LIST_ENDPOINT_PATTERNS = re.compile(
    r"/api/v1/\w+/(\?|$)"
)
_PAGINATION_PARAM = re.compile(r"[?&]page=(\d+)")
_SCRAPE_WINDOW = 10          # seconds
_SCRAPE_PAGE_LIMIT = 5       # sequential pages within window = scraping

# ─── Velocity / distributed-attack detection ──────────────────────────────
_VELOCITY_WINDOW = 60        # seconds
_MAX_USERNAMES_PER_IP = 5    # distinct usernames attempting login from one IP
_MAX_IPS_PER_USERNAME = 3    # distinct IPs for same username (within window)

# ─── Rapid-request auto-block thresholds (overrides security middleware) ──
_AUTO_BLOCK_RAPID_TRIGGER = 50   # requests/5s
_AUTO_BLOCK_404_TRIGGER = 30     # 404s/60s


def _ban_ip(ip: str, reason: str, escalate: bool = False) -> None:
    """
    Place an IP in the blocklist cache.
    If ``escalate`` is ``True``, increase the block duration from the
    previous stage; otherwise start at the first (shortest) stage.
    """
    stage_key = f"{_BLOCKLIST_PREFIX}stage:{ip}"
    current_stage = cache.get(stage_key, -1)
    next_stage = min(current_stage + 1, len(_ESCALATION_STAGES) - 1)
    ttl = _ESCALATION_STAGES[next_stage] if escalate else _ESCALATION_STAGES[0]

    cache.set(f"{_BLOCKLIST_PREFIX}{ip}", "1", timeout=ttl)
    cache.set(stage_key, next_stage, timeout=ttl + 60)
    logger.warning(
        "IP_BLOCKED %s stage=%d ttl=%ds reason=%s",
        ip, next_stage, ttl, reason,
    )


def _is_ip_blocked(ip: str) -> bool:
    return bool(cache.get(f"{_BLOCKLIST_PREFIX}{ip}"))


def _is_known_bot(ua: str) -> bool:
    return any(pattern.search(ua) for pattern in _BOT_USER_AGENTS)


def _check_scraping_pattern(ip: str, path: str) -> str | None:
    """
    Detect rapid sequential page-based scraping of list endpoints.

    Returns ``"block"``, ``"warn"``, or ``None``.
    """
    if not _LIST_ENDPOINT_PATTERNS.match(path):
        return None
    m = _PAGINATION_PARAM.search(path)
    if not m:
        return None
    page = int(m.group(1))
    key = f"{_RATE_LIMIT_PREFIX}scrape:{ip}"
    now = time.time()
    pages = cache.get(key, [])
    pages = [(p, t) for p, t in pages if now - t < _SCRAPE_WINDOW]
    pages.append((page, now))
    cache.set(key, pages, timeout=_SCRAPE_WINDOW + 1)

    if len(pages) >= _SCRAPE_PAGE_LIMIT:
        # check sequentiality
        seen = sorted(set(p for p, _ in pages))
        if len(seen) >= 3 and max(seen) - min(seen) + 1 == len(seen):
            return "block"
    return None


def _check_login_velocity(ip: str, username: str) -> str | None:
    """
    Detect two abuse patterns:
      1. Same IP trying many different usernames (credential stuffing).
      2. Same username attempted from many different IPs (distributed attack).

    Returns ``"block"`` if either threshold is exceeded, ``None`` otherwise.
    """
    now = time.time()
    ip_key = f"{_RATE_LIMIT_PREFIX}vel_ip:{ip}"
    users_for_ip = cache.get(ip_key, {"usernames": set(), "updated": now})
    users_for_ip["usernames"].add(username)
    users_for_ip["updated"] = now
    cache.set(ip_key, users_for_ip, timeout=_VELOCITY_WINDOW + 1)
    if len(users_for_ip["usernames"]) > _MAX_USERNAMES_PER_IP:
        _ban_ip(ip, f"credential-stuffing ({len(users_for_ip['usernames'])} usernames)", escalate=True)
        return "block"

    user_key = f"{_RATE_LIMIT_PREFIX}vel_user:{username}"
    ips_for_user = cache.get(user_key, {"ips": set(), "updated": now})
    ips_for_user["ips"].add(ip)
    ips_for_user["updated"] = now
    cache.set(user_key, ips_for_user, timeout=_VELOCITY_WINDOW + 1)
    if len(ips_for_user["ips"]) > _MAX_IPS_PER_USERNAME:
        _ban_ip(ip, f"distributed-attack ({len(ips_for_user['ips'])} IPs for {username})", escalate=True)
        return "block"

    return None


def _check_auto_block(ip: str) -> None:
    """
    Escalate detection to active blocking if short-burst or 404 rates
    exceed aggressive thresholds.
    """
    rapid_key = f"{_RATE_LIMIT_PREFIX}rapid:{ip}"
    now = time.time()
    window = cache.get(rapid_key, [])
    window = [t for t in window if now - t < 5]
    if len(window) > _AUTO_BLOCK_RAPID_TRIGGER:
        _ban_ip(ip, f"auto-block rapid ({len(window)}/5s)", escalate=True)
        cache.delete(rapid_key)

    four_oh_four_key = f"{_RATE_LIMIT_PREFIX}404:{ip}"
    window404 = cache.get(four_oh_four_key, [])
    window404 = [t for t in window404 if now - t < 60]
    if len(window404) > _AUTO_BLOCK_404_TRIGGER:
        _ban_ip(ip, f"auto-block 404 ({len(window404)}/60s)", escalate=True)
        cache.delete(four_oh_four_key)

SENSITIVE_URL_PATTERNS = [
    r"^/api/v1/auth/token/",
    r"^/api/v1/auth/change-password/",
    r"^/api/v1/auth/password-reset/",
    r"^/api/v1/auth/users/",
    r"^/api/v1/enterprise/",
]

# ─── Anomaly detection thresholds ───────────────────────────────────────────
_RAPID_REQUESTS_WINDOW = 5       # seconds
_RAPID_REQUESTS_LIMIT = 30       # requests per window
_HIGH_404_WINDOW = 60            # seconds
_HIGH_404_LIMIT = 20             # 404s per window
_RATE_LIMIT_PREFIX = "secmon:"


def _client_ip(request) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.META.get("REMOTE_ADDR", "0.0.0.0")


def _is_sensitive_path(path: str) -> bool:
    return any(re.search(p, path) for p in SENSITIVE_URL_PATTERNS)


class AbuseGuardMiddleware:
    """
    Active abuse protection middleware that:

    * Blocks known-bad IPs from the blocklist cache.
    * Detects and blocks known bot/scraper User-Agents (configurable).
    * Detects rapid sequential page scraping of list endpoints.
    * Detects credential-stuffing (many usernames from same IP) and
      distributed attacks (same username from many IPs).
    * Auto-blocks IPs that exceed aggressive rapid-request or 404 thresholds.

    MUST be placed near the top of the MIDDLEWARE stack (before any
    tenant-resolution or authentication middleware) so that abusive
    traffic is rejected with minimal overhead.

    Block durations escalate through stages: 5min → 30min → 2hr → 24hr.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        ip = _client_ip(request)
        path = request.path
        method = request.method

        # ── IP blocklist check (fast-path reject) ──────────────────────────
        if _is_ip_blocked(ip):
            logger.info("ABUSE_BLOCKED %s %s %s", ip, method, path)
            return HttpResponse(
                "Too many requests",
                content_type="text/plain",
                status=429,
            )

        # ── Bot User-Agent check ──────────────────────────────────────────
        ua = request.META.get("HTTP_USER_AGENT", "")
        if _is_known_bot(ua):
            scrape_result = _check_scraping_pattern(ip, path)
            if scrape_result == "block":
                _ban_ip(ip, f"bot-scraper UA={ua[:60]}", escalate=True)
                logger.info("ABUSE_BOT_BLOCKED %s %s %s", ip, method, path)
                return HttpResponse(
                    "Too many requests",
                    content_type="text/plain",
                    status=429,
                )

        # ── Process request ───────────────────────────────────────────────
        response = self.get_response(request)
        status = response.status_code

        # ── Post-response checks (only for auth-related failures) ─────────
        if path.startswith("/api/v1/auth/token/") and status in (400, 401):
            username = ""
            try:
                if request.content_type and "json" in request.content_type:
                    import json as _json
                    try:
                        body = _json.loads(request.body) if request.body else {}
                        username = body.get("username", "")
                    except Exception:
                        username = request.POST.get("username", "")
                else:
                    username = request.POST.get("username", "")
            except Exception:
                username = ""
            if username:
                velocity_result = _check_login_velocity(ip, username)
                if velocity_result == "block":
                    logger.info("ABUSE_VELOCITY_BLOCKED %s %s", ip, username)

        # ── Auto-block if post-response metrics exceed aggressive limits ──
        if status not in (429, 403):
            _check_auto_block(ip)

        return response


class SecurityLoggingMiddleware:
    """
    Logs authentication attempts, API errors, and detects unusual traffic
    patterns (rapid-fire requests, high 404 rate, sensitive-path scanning)
    to aid intrusion detection and forensic analysis.

    MUST be placed after AuthenticationMiddleware in the MIDDLEWARE stack
    so that ``request.user`` is available.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        ip = _client_ip(request)
        path = request.path
        method = request.method
        start = time.time()

        self._check_rapid_requests(ip, path)
        self._check_sensitive_access(request, ip, path)

        response = self.get_response(request)

        status = response.status_code
        duration = time.time() - start

        # ── Log 4xx client errors ────────────────────────────────────────
        if 400 <= status < 500 and status not in (401,):
            logger.warning(
                "CLIENT_ERROR %s %s %s %.3fs %s",
                method, path, status, duration, ip,
            )
            if status == 404:
                self._check_high_404_rate(ip, path)

        # ── Log 5xx server errors ────────────────────────────────────────
        if 500 <= status < 600:
            logger.error(
                "SERVER_ERROR %s %s %s %.3fs %s",
                method, path, status, duration, ip,
            )
            self._create_security_event(
                request, ip, "server_error",
                f"HTTP {status} on {method} {path}",
                severity="high",
            )

        # ── Log auth endpoint outcomes ────────────────────────────────────
        if path.startswith("/api/v1/auth/") and status in (200, 201, 400, 401, 403, 429):
            _log_auth_event(method, path, status, ip, request.user)

        return response

    # ── Anomaly detection ────────────────────────────────────────────────

    def _check_rapid_requests(self, ip: str, path: str) -> None:
        key = f"{_RATE_LIMIT_PREFIX}rapid:{ip}"
        now = time.time()
        window = cache.get(key, [])
        window = [t for t in window if now - t < _RAPID_REQUESTS_WINDOW]
        window.append(now)
        cache.set(key, window, timeout=_RAPID_REQUESTS_WINDOW + 1)
        if len(window) > _RAPID_REQUESTS_LIMIT:
            logger.critical(
                "RAPID_REQUESTS %s — %d requests in %ds to %s",
                ip, len(window), _RAPID_REQUESTS_WINDOW, path,
            )

    def _check_high_404_rate(self, ip: str, path: str) -> None:
        key = f"{_RATE_LIMIT_PREFIX}404:{ip}"
        now = time.time()
        window = cache.get(key, [])
        window = [t for t in window if now - t < _HIGH_404_WINDOW]
        window.append(now)
        cache.set(key, window, timeout=_HIGH_404_WINDOW + 1)
        if len(window) == _HIGH_404_LIMIT:
            logger.warning(
                "HIGH_404_RATE %s — %d 404s in %ds",
                ip, _HIGH_404_LIMIT, _HIGH_404_WINDOW,
            )

    def _check_sensitive_access(self, request, ip: str, path: str) -> None:
        if not _is_sensitive_path(path):
            return
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            return
        logger.info(
            "UNAUTH_SENSITIVE %s %s %s", ip, request.method, path,
        )

    def _create_security_event(self, request, ip: str, event_type: str, description: str, severity: str = "medium") -> None:
        try:
            from apps.core.models import SecurityEvent
            SecurityEvent.objects.create(
                ip_address=ip,
                event_type=event_type,
                severity=severity,
                description=description,
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
        except Exception:
            logger.exception("Failed to create SecurityEvent for %s", event_type)


def _log_auth_event(method: str, path: str, status: int, ip: str, user) -> None:
    is_auth = getattr(user, "is_authenticated", False)
    username = getattr(user, "username", "anonymous") if is_auth else "anonymous"
    outcome = "SUCCESS" if status in (200, 201) else "FAILURE"
    logger.info(
        "AUTH %s %s %s %s %s %s",
        outcome, method, path, status, username, ip,
    )


class CampusTenantMiddleware:
    """
    Resolves the active campus code from X-Campus-Code header, query param,
    or subdomain. Sets the campus context for MongoDB document scoping.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        campus_code = self._campus_code_from_request(request)
        token = None

        if campus_code:
            token = activate_campus_tenant(campus_code)
            request.campus_code = campus_code

        try:
            response = self.get_response(request)
            if campus_code:
                response["X-Campus-Code"] = campus_code
            return response
        finally:
            reset_campus_tenant(token)

    def _campus_code_from_request(self, request) -> str:
        header_name = getattr(settings, "TENANT_CAMPUS_HEADER", "HTTP_X_CAMPUS_CODE")
        value = request.META.get(header_name) or request.GET.get("campus_code", "")
        campus_code = self._normalize_campus_code(value)
        if campus_code:
            return campus_code
        return self._campus_code_from_host(request)

    def _campus_code_from_host(self, request) -> str:
        suffix = getattr(settings, "TENANT_DOMAIN_SUFFIX", "")
        if not suffix:
            return ""

        forwarded_host = request.META.get("HTTP_X_FORWARDED_HOST") if getattr(settings, "USE_X_FORWARDED_HOST", False) else ""
        raw_host = forwarded_host or request.META.get("HTTP_HOST") or request.META.get("SERVER_NAME", "")
        host = raw_host.split(",", 1)[0].split(":", 1)[0].strip().lower().rstrip(".")
        suffix = suffix.strip().lower().strip(".")
        if not host.endswith(f".{suffix}"):
            return ""

        tenant_host = host[: -(len(suffix) + 1)].split(".")[-1]
        if not tenant_host or tenant_host in RESERVED_TENANT_HOSTS:
            return ""
        return self._normalize_campus_code(tenant_host)

    def _normalize_campus_code(self, value: str) -> str:
        return re.sub(r"[^a-zA-Z0-9_-]+", "", (value or "").strip()).upper()
