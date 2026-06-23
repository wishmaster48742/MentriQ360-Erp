from .base import *  # noqa: F403,F401

DEBUG = True

ALLOWED_HOSTS = ["*"]  # Local dev must support localhost, LAN IPs, and mobile devices.
CORS_ALLOW_ALL_ORIGINS = True

if not env.bool("DJANGO_LOCAL_USE_REDIS", default=False):  # noqa: F405
    CACHES = {  # noqa: F405
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "mentriq360-local-dev",
        }
    }

# Local dev: disable API rate limiting so the frontend's frequent polling
# (e.g. /auth/me, /auth/users) doesn't trip 429 Too Many Requests.
REST_FRAMEWORK = {  # noqa: F405
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {
        key: None for key in REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {})  # noqa: F405
    },
}

# Local dev: drop the IP abuse-guard. It auto-bans IPs on rapid/bursty traffic
# (the frontend's polling looks like scraping), returning 429 for minutes — the
# real cause of "Too Many Requests" while developing.
MIDDLEWARE = [m for m in MIDDLEWARE if "AbuseGuardMiddleware" not in m]  # noqa: F405

# Security logger uses console only in development
import logging  # noqa: F811
logging.getLogger("mentriq.security").handlers.clear()
logging.getLogger("mentriq.security").addHandler(logging.StreamHandler())
