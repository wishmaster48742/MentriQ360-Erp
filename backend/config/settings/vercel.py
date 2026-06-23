from .production import *  # noqa: F403,F401

ALLOWED_HOSTS = env.list(  # noqa: F405
    "DJANGO_ALLOWED_HOSTS",
    default=[],
)
CORS_ALLOWED_ORIGINS = env.list("DJANGO_CORS_ALLOWED_ORIGINS", default=[])  # noqa: F405
CSRF_TRUSTED_ORIGINS = env.list("DJANGO_CSRF_TRUSTED_ORIGINS", default=[])  # noqa: F405

SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=False)  # noqa: F405

# SQLite in /tmp for Django internals (auth, sessions, admin)
# MONGODB_URI should be set in Vercel env vars for application data
_vercel_db = env("DATABASE_URL", default="").strip()  # noqa: F405
if not _vercel_db:
    DATABASES = {  # noqa: F405
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": "/tmp/mentriq360.db",
        }
    }
