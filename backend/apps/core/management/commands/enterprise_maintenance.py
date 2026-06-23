from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import connection
from django.utils import timezone

from apps.core.models import (
    BackupJob,
    BackupPolicy,
    HealthStatus,
    JobStatus,
    SaaSPlan,
    SchoolSubscription,
    SubscriptionStatus,
    SystemHealthSnapshot,
)


DEFAULT_SAAS_PLANS = {
    "basic": {
        "name": "Basic",
        "monthly_price": Decimal("4999.00"),
        "annual_price": Decimal("49999.00"),
        "student_limit": 500,
        "teacher_limit": 40,
        "storage_limit_mb": 5120,
        "ai_monthly_limit": 500,
        "whatsapp_monthly_limit": 1000,
        "sms_monthly_limit": 2500,
        "custom_pricing_enabled": False,
        "modules": {"academics": True, "finance": True, "teacherPortal": True, "studentPortal": True},
    },
    "standard": {
        "name": "Standard",
        "monthly_price": Decimal("9999.00"),
        "annual_price": Decimal("99999.00"),
        "student_limit": 1500,
        "teacher_limit": 120,
        "storage_limit_mb": 20480,
        "ai_monthly_limit": 2500,
        "whatsapp_monthly_limit": 5000,
        "sms_monthly_limit": 15000,
        "custom_pricing_enabled": False,
        "modules": {"academics": True, "finance": True, "teacherPortal": True, "studentPortal": True, "communication": True, "ai": True, "hardwareAttendance": True},
    },
    "premium": {
        "name": "Premium",
        "monthly_price": Decimal("19999.00"),
        "annual_price": Decimal("199999.00"),
        "student_limit": 5000,
        "teacher_limit": 400,
        "storage_limit_mb": 102400,
        "ai_monthly_limit": 20000,
        "whatsapp_monthly_limit": 10000,
        "sms_monthly_limit": 50000,
        "custom_pricing_enabled": True,
        "modules": {"academics": True, "finance": True, "teacherPortal": True, "studentPortal": True, "communication": True, "ai": True, "hardwareAttendance": True, "whiteLabel": True, "advancedAnalytics": True},
    },
    "enterprise": {
        "name": "Enterprise",
        "monthly_price": Decimal("49999.00"),
        "annual_price": Decimal("499999.00"),
        "student_limit": 0,
        "teacher_limit": 0,
        "storage_limit_mb": 0,
        "ai_monthly_limit": 0,
        "whatsapp_monthly_limit": 0,
        "sms_monthly_limit": 0,
        "custom_pricing_enabled": True,
        "modules": {"academics": True, "finance": True, "teacherPortal": True, "studentPortal": True, "communication": True, "ai": True, "hardwareAttendance": True, "whiteLabel": True, "advancedAnalytics": True},
    },
}


class Command(BaseCommand):
    help = "Run enterprise SaaS maintenance tasks for subscriptions, backups, and health snapshots."

    def add_arguments(self, parser):
        parser.add_argument("--seed-plans", action="store_true", help="Create or update Basic, Standard, Premium, and Enterprise plans.")
        parser.add_argument("--expire-subscriptions", action="store_true", help="Move ended subscriptions into grace or expired status.")
        parser.add_argument("--queue-backups", action="store_true", help="Queue due backup jobs from active backup policies.")
        parser.add_argument("--health-snapshot", action="store_true", help="Record database, API, queue, storage, and payment health snapshots.")
        parser.add_argument("--all", action="store_true", help="Run every enterprise maintenance task.")

    def handle(self, *args, **options):
        run_all = options["all"]
        if options["seed_plans"] or run_all:
            self.seed_plans()
        if options["expire_subscriptions"] or run_all:
            self.expire_subscriptions()
        if options["queue_backups"] or run_all:
            self.queue_backups()
        if options["health_snapshot"] or run_all:
            self.health_snapshot()
        if not any((run_all, options["seed_plans"], options["expire_subscriptions"], options["queue_backups"], options["health_snapshot"])):
            self.stdout.write(self.style.WARNING("No task selected. Use --all or a specific maintenance flag."))

    def seed_plans(self):
        created = 0
        updated = 0
        for code, defaults in DEFAULT_SAAS_PLANS.items():
            _, was_created = SaaSPlan.objects.update_or_create(code=code, defaults={**defaults, "is_active": True})
            created += int(was_created)
            updated += int(not was_created)
        self.stdout.write(self.style.SUCCESS(f"SaaS plans ready. Created {created}, updated {updated}."))

    def expire_subscriptions(self):
        today = timezone.localdate()
        changed = 0
        for subscription in SchoolSubscription.objects.select_related("campus", "plan").filter(
            status__in=[SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE],
            end_date__lt=today,
        ):
            subscription.status = SubscriptionStatus.GRACE if today <= subscription.grace_ends_on else SubscriptionStatus.EXPIRED
            subscription.sync_campus_fields()
            changed += 1
        self.stdout.write(self.style.SUCCESS(f"Subscription expiry scan completed. Updated {changed}."))

    def queue_backups(self):
        now = timezone.now()
        queued = 0
        for policy in BackupPolicy.objects.filter(is_active=True).select_related("campus"):
            recent_job = BackupJob.objects.filter(policy=policy, created_at__date=now.date()).exists()
            if recent_job:
                continue
            BackupJob.objects.create(
                policy=policy,
                campus=policy.campus,
                backup_type=policy.backup_type,
                status=JobStatus.QUEUED,
                metadata={"frequency": policy.frequency, "destination": policy.destination, "retentionDays": policy.retention_days},
            )
            queued += 1
        self.stdout.write(self.style.SUCCESS(f"Queued {queued} backup jobs."))

    def health_snapshot(self):
        now = timezone.now()
        snapshots = []
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            db_status = HealthStatus.OK
            db_details = {"database": connection.alias}
        except Exception as exc:  # pragma: no cover - defensive operational path
            db_status = HealthStatus.CRITICAL
            db_details = {"error": str(exc)}

        snapshots.append(SystemHealthSnapshot(component="database", status=db_status, checked_at=now, metadata=db_details))
        snapshots.append(SystemHealthSnapshot(component="api", status=HealthStatus.OK, checked_at=now, metadata={"source": "enterprise_maintenance"}))
        snapshots.append(SystemHealthSnapshot(component="queue", status=HealthStatus.OK, checked_at=now, metadata={"queuedJobs": QueueCount.queued()}))
        snapshots.append(SystemHealthSnapshot(component="storage", status=HealthStatus.OK, checked_at=now, metadata={"provider": "configured"}))
        snapshots.append(SystemHealthSnapshot(component="payment", status=HealthStatus.OK, checked_at=now, metadata={"provider": "school-specific"}))
        SystemHealthSnapshot.objects.bulk_create(snapshots)
        self.stdout.write(self.style.SUCCESS(f"Recorded {len(snapshots)} platform health snapshots."))


class QueueCount:
    @staticmethod
    def queued() -> int:
        from apps.core.models import QueueJob

        return QueueJob.objects.filter(status=JobStatus.QUEUED).count()
