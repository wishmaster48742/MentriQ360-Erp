import os
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.vercel")

import django  # noqa: E402

django.setup()


def _bootstrap_sqlite_if_needed() -> None:
    from django.conf import settings

    db_cfg = settings.DATABASES.get("default", {})
    if "sqlite3" not in db_cfg.get("ENGINE", ""):
        return

    db_path = str(db_cfg.get("NAME", ""))
    if not db_path or db_path == ":memory:" or os.path.exists(db_path):
        return

    try:
        from django.core.management import call_command

        call_command("migrate", "--noinput", verbosity=0)
    except Exception as exc:
        print(f"[vercel_wsgi] DB bootstrap error: {exc}", file=sys.stderr)


_bootstrap_sqlite_if_needed()

from django.core.wsgi import get_wsgi_application  # noqa: E402

application = get_wsgi_application()
