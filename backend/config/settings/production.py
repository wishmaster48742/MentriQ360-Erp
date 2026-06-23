from .base import *  # noqa: F403,F401

DEBUG = False

# ─── HTTPS & SSL ────────────────────────────────────────────────────────────
USE_X_FORWARDED_HOST = env.bool("DJANGO_USE_X_FORWARDED_HOST", default=True)  # noqa: F405
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=True)  # noqa: F405
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_REFERRER_POLICY = "same-origin"

# ─── Cookies ────────────────────────────────────────────────────────────────
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = "Lax"

# ─── Browser-level Protections ──────────────────────────────────────────────
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# ─── Security Event Logging ─────────────────────────────────────────────────
import logging
_security_logger = logging.getLogger("mentriq.security")
_security_logger.setLevel(logging.INFO)
try:
    from logging.handlers import RotatingFileHandler
    _handler = RotatingFileHandler(
        env("DJANGO_SECURITY_LOG_FILE", default="/var/log/mentriq/security.log"),  # noqa: F405
        maxBytes=10485760,
        backupCount=5,
    )
    _handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)s %(message)s [security]"
    ))
    _security_logger.addHandler(_handler)
except (OSError, PermissionError):
    _security_logger.addHandler(logging.StreamHandler())
