"""
Initialise MongoDB collections and indexes for all registered documents.

Usage::

    python manage.py init_mongodb
    python manage.py init_mongodb --drop    # re-create indexes from scratch
"""

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create all MongoDB collections and ensure indexes are in place."

    def add_arguments(self, parser):
        parser.add_argument(
            "--drop",
            action="store_true",
            help="Drop existing indexes before re-creating them.",
        )

    def handle(self, **options):
        from django.conf import settings

        if not settings.MONGODB_CLIENT:
            raise CommandError("MongoDB is not configured. Set MONGODB_URI in .env")

        from apps.core.mongo_models import _MODEL_REGISTRY
        from apps.accounts.mongo_models import UserProfile

        all_models = dict(_MODEL_REGISTRY)
        all_models["UserProfile"] = UserProfile

        drop = options["drop"]
        created = 0
        indexed = 0

        from mongoengine import Document as MongoDocument

        for name, cls in sorted(all_models.items()):
            if not isinstance(cls, type) or not issubclass(cls, MongoDocument):
                self.stdout.write(f"  [SKIP] {name:45s} -> Django model, skipping")
                continue

            collection_name = cls._get_collection_name()
            try:
                if drop:
                    cls.drop_indexes()
                    self.stdout.write(f"  Dropped indexes for  {name}")

                cls.ensure_indexes()
                indexed += 1
                self.stdout.write(
                    self.style.SUCCESS(f"  [OK] {name:45s} -> {collection_name}")
                )
            except Exception as e:
                self.stderr.write(
                    self.style.WARNING(f"  [WARN] {name:45s} -> {e}")
                )

        self.stdout.write(self.style.SUCCESS(
            f"\nDone. {indexed} model(s) processed."
        ))
