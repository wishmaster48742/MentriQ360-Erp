from __future__ import annotations

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Run Django migrations for every configured campus database alias."

    def add_arguments(self, parser):
        parser.add_argument(
            "--database",
            dest="database",
            help="Run migrations for one campus database alias instead of all configured campus databases.",
        )

    def handle(self, *args, **options):
        requested_database = options.get("database")
        configured = sorted(getattr(settings, "CAMPUS_DATABASE_ALIAS_SET", set()))
        aliases = [requested_database] if requested_database else configured

        if requested_database and requested_database not in settings.DATABASES:
            raise CommandError(f"Unknown database alias: {requested_database}")

        if not aliases:
            self.stdout.write(self.style.WARNING("No campus databases are configured. Set CAMPUS_DATABASE_URLS first."))
            return

        for alias in aliases:
            if alias == "default":
                continue
            self.stdout.write(f"Running migrations for campus database '{alias}'...")
            call_command("migrate", database=alias, interactive=False, verbosity=options["verbosity"])
            self.stdout.write(self.style.SUCCESS(f"Campus database migrated: {alias}"))
