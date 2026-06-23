import enum
from datetime import date, datetime, time, timedelta
from decimal import Decimal as PyDecimal

from mongoengine import (
    BooleanField,
    DateTimeField,
    DecimalField,
    DictField,
    Document,
    EmailField,
    FloatField,
    IntField,
    ListField,
    StringField,
    URLField,
)
from mongoengine.errors import ValidationError as MongoValidationError


# ═══════════════════════════════════════════════════════════════════════════
#  ENUMS (converted from Django TextChoices)
# ═══════════════════════════════════════════════════════════════════════════

class SchoolStatusEnum(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"

class SaaSPlanCode(str, enum.Enum):
    BASIC = "basic"
    STANDARD = "standard"
    PREMIUM = "premium"
    ENTERPRISE = "enterprise"

class SubscriptionStatusEnum(str, enum.Enum):
    TRIAL = "trial"
    ACTIVE = "active"
    GRACE = "grace"
    EXPIRED = "expired"
    CANCELLED = "cancelled"

class BillingCycleEnum(str, enum.Enum):
    MONTHLY = "monthly"
    ANNUAL = "annual"
    CUSTOM = "custom"

class InvoiceStatusEnum(str, enum.Enum):
    DRAFT = "draft"
    ISSUED = "issued"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"

class EnterprisePaymentStatusEnum(str, enum.Enum):
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    REFUNDED = "refunded"

class JobStatusEnum(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"

class BackupTypeEnum(str, enum.Enum):
    FULL_DATABASE = "full_database"
    SCHOOL_DATA = "school_data"
    FILES = "files"
    PAYMENT_LOGS = "payment_logs"
    AUDIT_LOGS = "audit_logs"

class HealthStatusEnum(str, enum.Enum):
    OK = "ok"
    WARNING = "warning"
    CRITICAL = "critical"

class AdmissionApplicationStatusEnum(str, enum.Enum):
    NEW = "new"
    UNDER_REVIEW = "under_review"
    INTERVIEW_SCHEDULED = "interview_scheduled"
    APPROVED = "approved"
    REJECTED = "rejected"
    WAITLISTED = "waitlisted"
    ADMITTED = "admitted"

class TransportAttendanceStatusEnum(str, enum.Enum):
    PRESENT = "present"
    ABSENT = "absent"
    MAINTENANCE = "maintenance"
    REPLACED = "replaced"

class TransportTripTypeEnum(str, enum.Enum):
    PICKUP = "pickup"
    DROP = "drop"

class TransportTripStatusEnum(str, enum.Enum):
    SCHEDULED = "scheduled"
    RUNNING = "running"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class LibraryRequestStatusEnum(str, enum.Enum):
    REQUESTED = "requested"
    APPROVED = "approved"
    REJECTED = "rejected"
    ISSUED = "issued"
    CANCELLED = "cancelled"

class AssetCategoryEnum(str, enum.Enum):
    COMPUTER = "computer"
    LAB_EQUIPMENT = "lab_equipment"
    FURNITURE = "furniture"
    SMART_BOARD = "smart_board"
    PROJECTOR = "projector"
    OTHER = "other"

class AssetStatusEnum(str, enum.Enum):
    AVAILABLE = "available"
    ALLOCATED = "allocated"
    MAINTENANCE = "maintenance"
    RETIRED = "retired"
    LOST = "lost"

class WebsiteContentTypeEnum(str, enum.Enum):
    PAGE = "page"
    NEWS = "news"
    NOTICE = "notice"
    GALLERY = "gallery"
    EVENT = "event"
    ADMISSION = "admission"
    CONTACT = "contact"

class PushPlatformEnum(str, enum.Enum):
    ANDROID = "android"
    IOS = "ios"
    WEB = "web"

class PushNotificationStatusEnum(str, enum.Enum):
    QUEUED = "queued"
    SENT = "sent"
    FAILED = "failed"
    READ = "read"

class MarketplacePluginTypeEnum(str, enum.Enum):
    BIOMETRIC = "biometric"
    SMS = "sms"
    WHATSAPP = "whatsapp"
    PAYMENT = "payment"
    AI = "ai"
    STORAGE = "storage"
    CUSTOM = "custom"

class AccountingEntryTypeEnum(str, enum.Enum):
    INCOME = "income"
    EXPENSE = "expense"
    GST_OUTPUT = "gst_output"
    GST_INPUT = "gst_input"
    LEDGER_ADJUSTMENT = "ledger_adjustment"

class ReportDefinitionTypeEnum(str, enum.Enum):
    ATTENDANCE = "attendance"
    FEES = "fees"
    STUDENT = "student"
    STAFF = "staff"
    ACCOUNTING = "accounting"
    CUSTOM = "custom"

class SecurityEventTypeEnum(str, enum.Enum):
    LOGIN = "login"
    LOGOUT = "logout"
    FORCE_LOGOUT = "force_logout"
    TWO_FACTOR = "two_factor"
    IP_BLOCKED = "ip_blocked"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"
    SERVER_ERROR = "server_error"
    CLIENT_ERROR = "client_error"

class ProductionAuditStatusEnum(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    WARNING = "warning"

class StudentStatusEnum(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ALUMNI = "alumni"

class AttendanceStatusEnum(str, enum.Enum):
    PRESENT = "present"
    ABSENT = "absent"
    LATE = "late"
    HALF_DAY = "half_day"
    ON_DUTY = "on_duty"

class FeeStatusEnum(str, enum.Enum):
    PENDING = "pending"
    PARTIAL = "partial"
    PAID = "paid"
    OVERDUE = "overdue"

class PaymentMethodEnum(str, enum.Enum):
    CASH = "cash"
    CARD = "card"
    BANK = "bank"
    ONLINE = "online"
    UPI = "upi"
    NET_BANKING = "net_banking"
    WALLET = "wallet"

class GatewayProviderEnum(str, enum.Enum):
    RAZORPAY = "razorpay"
    UPI = "upi"
    CARD = "card"
    NET_BANKING = "net_banking"
    WALLET = "wallet"

class FinanceEventTypeEnum(str, enum.Enum):
    FEE_PAID = "fee_paid"
    PAYMENT_FAILED = "payment_failed"
    OFFLINE_PAYMENT_ADDED = "offline_payment_added"
    RECEIPT_GENERATED = "receipt_generated"
    SALARY_PAID = "salary_paid"
    FEE_REMINDER_SENT = "fee_reminder_sent"

class CampusMemberRoleEnum(str, enum.Enum):
    IT_ADMIN = "it_admin"
    FINANCE_ADMIN = "finance_admin"
    TEACHER = "teacher"
    SUPPORT = "support"

class AttendanceCaptureMethodEnum(str, enum.Enum):
    MANUAL = "manual"
    FACE_RECOGNITION = "face_recognition"
    FINGERPRINT = "fingerprint"
    CARD_SCAN = "card_scan"

class DeviceStatusEnum(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    MAINTENANCE = "maintenance"

class RS485FunctionEnum(str, enum.Enum):
    SOFTWARE = "software"
    HARDWARE = "hardware"
    DISABLED = "disabled"

class StaffAttendanceStatusEnum(str, enum.Enum):
    PRESENT = "present"
    ABSENT = "absent"
    LATE = "late"
    HALF_DAY = "half_day"
    ON_LEAVE = "on_leave"

class StaffEmploymentTypeEnum(str, enum.Enum):
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACT = "contract"

class StaffProfileStatusEnum(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    EXITED = "exited"

class WeekdayEnum(int, enum.Enum):
    MONDAY = 1
    TUESDAY = 2
    WEDNESDAY = 3
    THURSDAY = 4
    FRIDAY = 5
    SATURDAY = 6
    SUNDAY = 7

class LibraryBookStatusEnum(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    LOST = "lost"

class LibraryLoanStatusEnum(str, enum.Enum):
    ISSUED = "issued"
    RETURNED = "returned"
    OVERDUE = "overdue"

class ApprovalStatusEnum(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class AnnouncementAudienceEnum(str, enum.Enum):
    ALL = "all"
    ADMINS = "admins"
    STAFF = "staff"
    LEARNERS = "learners"

class SupportTicketStatusEnum(str, enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"

class SupportTicketPriorityEnum(str, enum.Enum):
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"

class AuditActionEnum(str, enum.Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    LOGIN = "login"
    EXPORT = "export"

class AcademicWorkStatusEnum(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CLOSED = "closed"

class AssignmentSubmissionStatusEnum(str, enum.Enum):
    PENDING = "pending"
    CHECKED = "checked"

class ResultReviewStatusEnum(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"

class AcademicEventTypeEnum(str, enum.Enum):
    ATTENDANCE_MARKED = "attendance_marked"
    NOTES_UPLOADED = "notes_uploaded"
    ASSIGNMENT_UPLOADED = "assignment_uploaded"
    ASSIGNMENT_PUBLISHED = "assignment_published"
    ASSIGNMENT_SUBMITTED = "assignment_submitted"
    MARKS_UPLOADED = "marks_uploaded"
    RESULT_PUBLISHED = "result_published"
    NOTICE_PUBLISHED = "notice_published"
    PAYMENT_UPDATED = "payment_updated"
    DEVICE_SYNCED = "device_synced"
    SCHOOL_STATUS_CHANGED = "school_status_changed"

class ResourceTypeEnum(str, enum.Enum):
    NOTES = "notes"
    SYLLABUS = "syllabus"
    ASSIGNMENT_HELP = "assignment_help"
    REFERENCE = "reference"

class AdmitCardStatusEnum(str, enum.Enum):
    DRAFT = "draft"
    ISSUED = "issued"
    BLOCKED = "blocked"

class ExamScheduleStatusEnum(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"

class TransactionStatusEnum(str, enum.Enum):
    CREATED = "created"
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    REFUNDED = "refunded"

class SalaryPaymentStatusEnum(str, enum.Enum):
    DRAFT = "draft"
    PAYABLE = "payable"
    PAID = "paid"
    HOLD = "hold"

class MessageChannelEnum(str, enum.Enum):
    EMAIL = "email"
    SMS = "sms"
    WHATSAPP = "whatsapp"

class DeviceSyncStatusEnum(str, enum.Enum):
    SUCCESS = "success"
    FAILED = "failed"
    RETRYING = "retrying"

class MessageStatusEnum(str, enum.Enum):
    DRAFT = "draft"
    QUEUED = "queued"
    SENT = "sent"
    FAILED = "failed"

class RecordStatusEnum(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"


# ═══════════════════════════════════════════════════════════════════════════
#  BASE DOCUMENT
# ═══════════════════════════════════════════════════════════════════════════

class AuditDocument(Document):
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)

    meta = {"abstract": True, "allow_inheritance": True, "auto_create_index": False}

    # ── Auto-resolve `*_id` StringFields to their referenced documents ────
    REFERENCE_MODELS: dict[str, type["Document"]] | None = None

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        if not cls._meta.get("abstract"):
            _register_model(cls)

    def __getattr__(self, name):
        """Auto-resolve ``obj.campus`` → Campus document from ``campus_id``."""
        cache_key = f"_ref_{name}"
        if cache_key in self.__dict__:
            return self.__dict__[cache_key]
        id_attr = f"{name}_id"
        cls = type(self)
        if id_attr in cls._fields:
            ref_id = self.__dict__.get(id_attr) or getattr(self, id_attr, None)
            if not ref_id:
                self.__dict__[cache_key] = None
                return None
            model_cls = _resolve_target_model(cls, name)
            if model_cls:
                try:
                    doc = model_cls.objects.filter(id=ref_id).first()
                    self.__dict__[cache_key] = doc
                    return doc
                except Exception:
                    self.__dict__[cache_key] = None
                    return None
        raise AttributeError(f"'{cls.__name__}' object has no attribute '{name}'")


# Module-level registry for reference resolution
_MODEL_REGISTRY: dict[str, type[Document]] = {}


def _resolve_target_model(source_cls, ref_name: str) -> type[Document] | None:
    """Resolve the target Document class for a reference by name."""
    # 1. Check explicit REFERENCE_MODELS dict on the source class
    explicit = getattr(source_cls, "REFERENCE_MODELS", None) or {}
    if ref_name in explicit:
        return explicit[ref_name]
    # 2. Common name → model mappings (e.g. configured_by → User)
    _COMMON_REF_MAP = {
        "configured_by": "User",
        "created_by": "User",
        "updated_by": "User",
        "reviewed_by": "User",
        "checked_by": "User",
        "marked_by": "User",
        "recorded_by": "User",
        "assigned_by": "User",
        "collected_by": "User",
        "submitted_by": "User",
        "uploaded_by": "User",
        "approved_by": "User",
        "registered_by": "User",
        "authorized_by": "User",
        "resolved_by": "User",
        "campus": "Campus",
        "user": "User",
        "staff_user": "User",
        "teacher": "User",
        "class_teacher": "User",
        "actor": "User",
    }
    mapped = _COMMON_REF_MAP.get(ref_name)
    if mapped and mapped in _MODEL_REGISTRY:
        return _MODEL_REGISTRY[mapped]
    # 3. Exact / CamelCase match (e.g. exam_type → ExamType)
    camel = ref_name.replace("_", " ").title().replace(" ", "")
    for key in (ref_name, ref_name.lower(), camel):
        if key in _MODEL_REGISTRY:
            return _MODEL_REGISTRY[key]
    # 4. Unique suffix match (e.g. section → ClassSection, session → AcademicSession).
    #    Dedupe by class — the registry holds both ``Name`` and ``name`` keys.
    candidates = {
        model_cls
        for model_name, model_cls in _MODEL_REGISTRY.items()
        if model_name.lower().endswith(ref_name.lower())
    }
    if len(candidates) == 1:
        return next(iter(candidates))
    return None


def _register_model(cls):
    """Register a Document class for reference resolution."""
    name = cls.__name__
    _MODEL_REGISTRY[name] = cls
    _MODEL_REGISTRY[name.lower()] = cls
    # Build _resolved_attrs set for efficient __getattr__ lookups.
    # Include all `*_id` fields — __getattr__ will gracefully handle
    # fields whose target model isn't registered yet (e.g., User).
    resolved = set()
    for field_name in cls._fields:
        if field_name.endswith("_id"):
            base = field_name[:-3]
            resolved.add(base)
    cls._resolved_attrs = frozenset(resolved)
    return cls


# ═══════════════════════════════════════════════════════════════════════════
#  CAMPUS / TENANCY
# ═══════════════════════════════════════════════════════════════════════════

class Campus(AuditDocument):
    name = StringField(max_length=120, required=True)
    code = StringField(max_length=20, unique=True, required=True)
    address = StringField(default="")
    city = StringField(max_length=100, default="")
    state = StringField(max_length=100, default="")
    pincode = StringField(max_length=20, default="")
    contact_email = StringField(default="")
    contact_phone = StringField(max_length=40, default="")
    website = StringField(default="")
    principal_name = StringField(max_length=120, default="")
    logo_url = StringField(default="")
    logo_alt_text = StringField(max_length=160, default="")
    banner_url = StringField(default="")
    status = StringField(max_length=20, choices=[e.value for e in SchoolStatusEnum], default=SchoolStatusEnum.ACTIVE.value)
    subscription_plan = StringField(max_length=80, default="Standard")
    subscription_status = StringField(max_length=40, default="active")
    monthly_subscription_amount = DecimalField(precision=10, rounding="ROUND_HALF_UP", default=0)
    billing_due_date = StringField(default="")
    academic_year_label = StringField(max_length=80, default="")
    enabled_modules = DictField(default=dict)
    payment_gateway_settings = DictField(default=dict)
    messaging_settings = DictField(default=dict)
    attendance_hardware_settings = DictField(default=dict)
    created_by_id = IntField(null=True)
    database_alias = StringField(max_length=64, default="")
    database_name = StringField(max_length=128, default="")

    meta = {
        "collection": "campuses",
        "ordering": ["name"],
        "indexes": [("code", "status"), "subscription_status"],
    }

    def __str__(self):
        return self.name

    @property
    def tenant_id(self):
        return self.database_alias or self.code


class SaaSPlan(AuditDocument):
    code = StringField(max_length=32, choices=[e.value for e in SaaSPlanCode], required=True, unique=True)
    name = StringField(max_length=80, required=True)
    description = StringField(default="")
    monthly_price = DecimalField(precision=12, rounding="ROUND_HALF_UP", default=0)
    annual_price = DecimalField(precision=12, rounding="ROUND_HALF_UP", default=0)
    custom_pricing_enabled = BooleanField(default=False)
    student_limit = IntField(default=0)
    teacher_limit = IntField(default=0)
    storage_limit_mb = IntField(default=0)
    ai_monthly_limit = IntField(default=0)
    whatsapp_monthly_limit = IntField(default=0)
    sms_monthly_limit = IntField(default=0)
    modules = DictField(default=dict)
    is_active = BooleanField(default=True)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "saas_plans",
        "ordering": ["monthly_price", "name"],
        "indexes": [("code", "is_active")],
    }

    def __str__(self):
        return f"{self.name} ({self.code})"

    def module_enabled(self, module_key):
        return bool((self.modules or {}).get(module_key))

    def limit_for(self, metric):
        return int(getattr(self, f"{metric}_limit", 0) or 0)


class SchoolSubscription(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    plan_id = StringField(max_length=24, required=True)
    status = StringField(max_length=20, choices=[e.value for e in SubscriptionStatusEnum], default=SubscriptionStatusEnum.ACTIVE.value)
    billing_cycle = StringField(max_length=20, choices=[e.value for e in BillingCycleEnum], default=BillingCycleEnum.MONTHLY.value)
    start_date = StringField(default="")
    end_date = StringField(required=True)
    grace_period_days = IntField(default=7)
    next_billing_date = StringField(default="")
    custom_price = DecimalField(precision=12, rounding="ROUND_HALF_UP", null=True)
    currency = StringField(max_length=8, default="INR")
    gst_number = StringField(max_length=40, default="")
    auto_disable_on_expiry = BooleanField(default=True)
    last_alert_at = DateTimeField(null=True)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "school_subscriptions",
        "ordering": ["-end_date"],
        "indexes": [("campus_id", "status"), ("plan_id", "status"), ("end_date", "status")],
    }

    def __str__(self):
        return f"{self.campus_id} {self.plan_id} {self.status}"


class SubscriptionInvoice(AuditDocument):
    subscription_id = StringField(max_length=24, required=True)
    campus_id = StringField(max_length=24, required=True)
    invoice_number = StringField(max_length=80, unique=True, required=True)
    billing_period_start = StringField(default="")
    billing_period_end = StringField(default="")
    base_amount = DecimalField(precision=12, rounding="ROUND_HALF_UP", required=True)
    discount_amount = DecimalField(precision=12, rounding="ROUND_HALF_UP", default=0)
    gst_rate = DecimalField(precision=5, rounding="ROUND_HALF_UP", default=18)
    gst_amount = DecimalField(precision=12, rounding="ROUND_HALF_UP", default=0)
    total_amount = DecimalField(precision=12, rounding="ROUND_HALF_UP", default=0)
    currency = StringField(max_length=8, default="INR")
    status = StringField(max_length=20, choices=[e.value for e in InvoiceStatusEnum], default=InvoiceStatusEnum.ISSUED.value)
    due_date = StringField(default="")
    paid_at = DateTimeField(null=True)
    pdf_url = StringField(default="")
    created_by_id = IntField(null=True)

    meta = {
        "collection": "subscription_invoices",
        "ordering": ["-created_at"],
        "indexes": [("campus_id", "status", "due_date"), ("subscription_id", "status"), "invoice_number"],
    }

    def __str__(self):
        return f"{self.invoice_number} {self.status}"


class SubscriptionPayment(AuditDocument):
    invoice_id = StringField(max_length=24, required=True)
    campus_id = StringField(max_length=24, required=True)
    amount = DecimalField(precision=12, rounding="ROUND_HALF_UP", required=True)
    payment_mode = StringField(max_length=32, default="online")
    provider = StringField(max_length=80, default="")
    transaction_id = StringField(max_length=120, default="")
    payment_status = StringField(max_length=20, choices=[e.value for e in EnterprisePaymentStatusEnum], default=EnterprisePaymentStatusEnum.SUCCESS.value)
    paid_at = DateTimeField(default=datetime.utcnow)
    raw_payload = DictField(default=dict)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "subscription_payments",
        "ordering": ["-paid_at", "-created_at"],
        "indexes": [("campus_id", "payment_status", "paid_at"), ("invoice_id", "payment_status"), "transaction_id"],
    }

    def __str__(self):
        return f"{self.invoice_id} {self.amount}"


class WhiteLabelConfig(AuditDocument):
    campus_id = StringField(max_length=24, unique=True, required=True)
    is_enabled = BooleanField(default=False)
    custom_logo_url = StringField(default="")
    custom_domain = StringField(max_length=180, default="")
    primary_color = StringField(max_length=20, default="")
    secondary_color = StringField(max_length=20, default="")
    accent_color = StringField(max_length=20, default="")
    login_heading = StringField(max_length=160, default="")
    login_subheading = StringField(max_length=240, default="")
    login_background_url = StringField(default="")
    email_template_header = StringField(default="")
    email_template_footer = StringField(default="")
    report_logo_url = StringField(default="")
    report_footer = StringField(default="")
    created_by_id = IntField(null=True)

    meta = {
        "collection": "white_label_configs",
        "indexes": ["custom_domain", "is_enabled"],
    }

    def __str__(self):
        return f"Whitelabel {self.campus_id}"


class UserActivityLog(AuditDocument):
    campus_id = StringField(max_length=24, null=True)
    user_id = IntField(null=True)
    activity_type = StringField(max_length=80, required=True)
    summary = StringField(max_length=255, required=True)
    request_path = StringField(max_length=255, default="")
    method = StringField(max_length=12, default="")
    ip_address = StringField(default="")
    user_agent = StringField(default="")
    metadata = DictField(default=dict)

    meta = {
        "collection": "user_activity_logs",
        "ordering": ["-created_at"],
        "indexes": [("campus_id", "activity_type", "created_at"), ("user_id", "created_at")],
    }

    def __str__(self):
        return f"{self.activity_type}: {self.summary}"


class DocumentAccessLog(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    document_id = StringField(max_length=24, null=True)
    user_id = IntField(null=True)
    student_id = StringField(max_length=24, null=True)
    access_type = StringField(max_length=40, default="download")
    file_name = StringField(max_length=180, default="")
    granted = BooleanField(default=True)
    reason = StringField(max_length=255, default="")
    ip_address = StringField(default="")
    metadata = DictField(default=dict)

    meta = {
        "collection": "document_access_logs",
        "ordering": ["-created_at"],
        "indexes": [("campus_id", "access_type", "created_at"), ("document_id", "created_at"), ("user_id", "created_at")],
    }

    def __str__(self):
        return f"{self.access_type} {self.file_name}"


class EnterpriseUsageMetric(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    metric_type = StringField(max_length=80, required=True)
    period_start = StringField(default="")
    period_end = StringField(default="")
    quantity = DecimalField(precision=14, rounding="ROUND_HALF_UP", default=0)
    metadata = DictField(default=dict)

    meta = {
        "collection": "enterprise_usage_metrics",
        "ordering": ["-period_start"],
        "indexes": [("campus_id", "metric_type", "period_start")],
    }

    def __str__(self):
        return f"{self.metric_type} {self.campus_id}"


class BackupPolicy(AuditDocument):
    campus_id = StringField(max_length=24, null=True)
    backup_type = StringField(max_length=40, choices=[e.value for e in BackupTypeEnum], required=True)
    frequency = StringField(max_length=40, default="daily")
    retention_days = IntField(default=30)
    destination = StringField(max_length=255, default="")
    encryption_required = BooleanField(default=True)
    is_active = BooleanField(default=True)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "backup_policies",
        "indexes": [("campus_id", "backup_type", "is_active")],
    }

    def __str__(self):
        return f"{self.backup_type} {self.campus_id or 'global'}"


class BackupJob(AuditDocument):
    policy_id = StringField(max_length=24, null=True)
    campus_id = StringField(max_length=24, null=True)
    backup_type = StringField(max_length=40, choices=[e.value for e in BackupTypeEnum], required=True)
    status = StringField(max_length=20, choices=[e.value for e in JobStatusEnum], default=JobStatusEnum.QUEUED.value)
    started_at = DateTimeField(null=True)
    completed_at = DateTimeField(null=True)
    storage_location = StringField(max_length=255, default="")
    size_bytes = IntField(default=0)
    checksum = StringField(max_length=128, default="")
    error_message = StringField(default="")
    metadata = DictField(default=dict)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "backup_jobs",
        "ordering": ["-created_at"],
        "indexes": [("campus_id", "backup_type", "status"), ("status", "created_at")],
    }

    def __str__(self):
        return f"{self.backup_type} {self.status}"


class QueueJob(AuditDocument):
    campus_id = StringField(max_length=24, null=True)
    job_type = StringField(max_length=80, required=True)
    status = StringField(max_length=20, choices=[e.value for e in JobStatusEnum], default=JobStatusEnum.QUEUED.value)
    priority = IntField(default=5)
    payload = DictField(default=dict)
    attempts = IntField(default=0)
    max_attempts = IntField(default=3)
    scheduled_at = DateTimeField(default=datetime.utcnow)
    started_at = DateTimeField(null=True)
    completed_at = DateTimeField(null=True)
    error_message = StringField(default="")
    created_by_id = IntField(null=True)

    meta = {
        "collection": "queue_jobs",
        "ordering": ["priority", "scheduled_at", "created_at"],
        "indexes": [("status", "scheduled_at", "priority"), ("campus_id", "job_type", "status")],
    }

    def __str__(self):
        return f"{self.job_type} #{self.id}"


class SystemHealthSnapshot(AuditDocument):
    campus_id = StringField(max_length=24, null=True)
    component = StringField(max_length=80, required=True)
    status = StringField(max_length=20, choices=[e.value for e in HealthStatusEnum], default=HealthStatusEnum.OK.value)
    latency_ms = IntField(default=0)
    metric_value = DecimalField(precision=14, rounding="ROUND_HALF_UP", null=True)
    message = StringField(max_length=255, default="")
    metadata = DictField(default=dict)
    checked_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "system_health_snapshots",
        "ordering": ["-checked_at"],
        "indexes": [("component", "status", "checked_at"), ("campus_id", "component", "checked_at")],
    }

    def __str__(self):
        return f"{self.component} {self.status}"


class SecureAPIToken(AuditDocument):
    campus_id = StringField(max_length=24, null=True)
    name = StringField(max_length=120, required=True)
    prefix = StringField(max_length=16, required=True)
    token_hash = StringField(max_length=128, required=True)
    scopes = ListField(StringField(), default=list)
    expires_at = DateTimeField(null=True)
    last_used_at = DateTimeField(null=True)
    is_active = BooleanField(default=True)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "secure_api_tokens",
        "indexes": [("campus_id", "is_active"), "prefix"],
    }

    def __str__(self):
        return f"{self.name} ({self.prefix})"


class AcademicSession(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    name = StringField(max_length=120, required=True)
    start_date = StringField(default="")
    end_date = StringField(default="")
    is_active = BooleanField(default=True)

    meta = {
        "collection": "academic_sessions",
        "ordering": ["-start_date"],
        "indexes": ["campus_id"],
    }

    def __str__(self):
        return self.name


class ClassSection(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    session_id = StringField(max_length=24, required=True)
    grade_name = StringField(max_length=50, required=True)
    section_name = StringField(max_length=20, required=True)
    class_teacher_id = IntField(null=True)

    meta = {
        "collection": "class_sections",
        "ordering": ["grade_name", "section_name"],
        "indexes": [("session_id", "grade_name", "section_name")],
    }

    def __str__(self):
        return f"{self.grade_name} - {self.section_name}"


class TeacherSubjectAllocation(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    section_id = StringField(max_length=24, required=True)
    teacher_id = IntField(required=True)
    subject = StringField(max_length=80, required=True)
    weekly_periods = IntField(default=0)
    is_active = BooleanField(default=True)

    meta = {
        "collection": "teacher_subject_allocations",
        "indexes": [("teacher_id", "is_active"), ("campus_id", "subject")],
    }

    def __str__(self):
        return f"{self.teacher_id} -> {self.subject}"


class Subject(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    name = StringField(max_length=100, required=True)
    code = StringField(max_length=40, default="")
    grade_name = StringField(max_length=50, default="")
    description = StringField(default="")
    is_active = BooleanField(default=True)

    meta = {
        "collection": "subjects",
        "ordering": ["grade_name", "name"],
        "indexes": [("campus_id", "is_active"), ("campus_id", "code")],
    }

    def __str__(self):
        return self.name


class AuditEvent(AuditDocument):
    actor_id = IntField(null=True)
    action = StringField(max_length=20, choices=[e.value for e in AuditActionEnum], required=True)
    entity_type = StringField(max_length=80, required=True)
    entity_id = StringField(max_length=80, default="")
    summary = StringField(max_length=255, default="")
    ip_address = StringField(default="")
    metadata = DictField(default=dict)

    meta = {
        "collection": "audit_events",
        "ordering": ["-created_at"],
        "indexes": [("entity_type", "entity_id"), ("actor_id", "created_at")],
    }

    def __str__(self):
        return f"{self.action} {self.entity_type}#{self.entity_id}"


class CampusMembership(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    user_id = IntField(required=True)
    role = StringField(max_length=32, choices=[e.value for e in CampusMemberRoleEnum], required=True)
    is_primary = BooleanField(default=False)
    can_manage_users = BooleanField(default=False)
    can_configure_attendance = BooleanField(default=False)

    meta = {
        "collection": "campus_memberships",
        "indexes": [("campus_id", "user_id", "role"), ("campus_id", "role"), ("user_id", "is_primary")],
    }

    def __str__(self):
        return f"{self.user_id} @ {self.campus_id}"


class AttendanceDevice(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    name = StringField(max_length=120, required=True)
    device_code = StringField(max_length=60, unique=True, required=True)
    device_type = StringField(max_length=32, choices=[e.value for e in AttendanceCaptureMethodEnum], required=True)
    location = StringField(max_length=160, default="")
    provider = StringField(max_length=120, default="")
    status = StringField(max_length=20, choices=[e.value for e in DeviceStatusEnum], default=DeviceStatusEnum.ACTIVE.value)
    is_enabled_for_students = BooleanField(default=True)
    is_enabled_for_staff = BooleanField(default=True)
    server_required = BooleanField(default=True)
    use_domain_name = BooleanField(default=True)
    domain_name = StringField(max_length=180, default="")
    server_ip = StringField(max_length=45, default="")
    server_port = IntField(default=7743)
    heartbeat_seconds = IntField(default=3)
    server_approval_required = BooleanField(default=False)
    device_numeric_id = IntField(default=1)
    local_port = IntField(default=5005)
    baud_rate = IntField(default=38400)
    rs485_function = StringField(max_length=32, choices=[e.value for e in RS485FunctionEnum], default=RS485FunctionEnum.SOFTWARE.value)
    last_seen_at = DateTimeField(null=True)
    configured_by_id = IntField(null=True)

    meta = {
        "collection": "attendance_devices",
        "indexes": [("campus_id", "device_type"), "status", "device_code"],
    }

    def __str__(self):
        return self.name


class Student(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    section_id = StringField(max_length=24, required=True)
    user_id = IntField(null=True, unique=True)
    admission_number = StringField(max_length=40, unique=True, default="")
    first_name = StringField(max_length=80, required=True)
    last_name = StringField(max_length=80, default="")
    date_of_birth = StringField(default="")
    photo_url = StringField(default="")
    father_name = StringField(max_length=120, default="")
    mother_name = StringField(max_length=120, default="")
    contact_email = StringField(default="")
    phone_number = StringField(max_length=20, default="")
    alternate_phone_number = StringField(max_length=20, default="")
    address = StringField(default="")
    blood_group = StringField(max_length=8, default="")
    medical_notes = StringField(default="")
    status = StringField(max_length=20, choices=[e.value for e in StudentStatusEnum], default=StudentStatusEnum.ACTIVE.value)

    meta = {
        "collection": "students",
        "ordering": ["first_name", "last_name"],
        "indexes": [("campus_id", "status"), ("section_id", "status"), "admission_number"],
    }

    def __str__(self):
        return self.full_name

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()


class StudentGuardian(AuditDocument):
    student_id = StringField(max_length=24, required=True)
    guardian_id = IntField(required=True)
    relationship = StringField(max_length=40, default="Guardian")

    meta = {
        "collection": "student_guardians",
        "indexes": [("student_id", "guardian_id")],
    }

    def __str__(self):
        return f"{self.guardian_id} -> {self.student_id}"


class AttendanceRecord(AuditDocument):
    student_id = StringField(max_length=24, required=True)
    section_id = StringField(max_length=24, required=True)
    date = StringField(required=True)
    subject = StringField(max_length=80, default="")
    status = StringField(max_length=20, choices=[e.value for e in AttendanceStatusEnum], required=True)
    marked_by_id = IntField(null=True)
    capture_method = StringField(max_length=32, choices=[e.value for e in AttendanceCaptureMethodEnum], default=AttendanceCaptureMethodEnum.MANUAL.value)
    device_id = StringField(max_length=24, null=True)
    source_reference = StringField(max_length=120, default="")
    confidence_score = FloatField(null=True)

    meta = {
        "collection": "attendance_records",
        "ordering": ["-date"],
        "indexes": [("section_id", "date", "subject"), ("student_id", "date"), ("date", "status")],
    }

    def __str__(self):
        return f"{self.student_id} {self.date} {self.status}"


class StaffAttendanceRecord(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    staff_user_id = IntField(required=True)
    date = StringField(required=True)
    clock_in = StringField(default="")
    clock_out = StringField(default="")
    status = StringField(max_length=20, choices=[e.value for e in StaffAttendanceStatusEnum], default=StaffAttendanceStatusEnum.PRESENT.value)
    capture_method = StringField(max_length=32, choices=[e.value for e in AttendanceCaptureMethodEnum], default=AttendanceCaptureMethodEnum.MANUAL.value)
    device_id = StringField(max_length=24, null=True)
    marked_by_id = IntField(null=True)
    source_reference = StringField(max_length=120, default="")
    confidence_score = FloatField(null=True)
    notes = StringField(default="")

    meta = {
        "collection": "staff_attendance_records",
        "ordering": ["-date"],
        "indexes": [("campus_id", "date"), ("staff_user_id", "date")],
    }

    def __str__(self):
        return f"{self.staff_user_id} {self.date} {self.status}"


class StaffProfile(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    user_id = IntField(required=True, unique=True)
    employee_code = StringField(max_length=40, unique=True, default="")
    designation = StringField(max_length=120, required=True)
    department = StringField(max_length=120, default="")
    photo_url = StringField(default="")
    employment_type = StringField(max_length=20, choices=[e.value for e in StaffEmploymentTypeEnum], default=StaffEmploymentTypeEnum.FULL_TIME.value)
    joining_date = StringField(default="")
    qualification = StringField(max_length=180, default="")
    emergency_contact = StringField(max_length=40, default="")
    status = StringField(max_length=20, choices=[e.value for e in StaffProfileStatusEnum], default=StaffProfileStatusEnum.ACTIVE.value)

    meta = {
        "collection": "staff_profiles",
        "indexes": [("campus_id", "status"), "department", "employee_code"],
    }

    def __str__(self):
        return f"{self.employee_code}"


class TimetableSlot(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    section_id = StringField(max_length=24, required=True)
    teacher_id = IntField(null=True)
    subject = StringField(max_length=80, required=True)
    day_of_week = IntField(choices=[(e.value, e.name) for e in WeekdayEnum], required=True)
    start_time = StringField(required=True)
    end_time = StringField(required=True)
    room = StringField(max_length=80, default="")
    effective_from = StringField(default="")
    effective_to = StringField(default="")

    meta = {
        "collection": "timetable_slots",
        "indexes": [("section_id", "day_of_week", "start_time"), ("campus_id", "day_of_week"), ("teacher_id", "day_of_week")],
    }

    def __str__(self):
        return f"{self.subject} {self.day_of_week} {self.start_time}"


class ExamType(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    name = StringField(max_length=120, required=True)
    description = StringField(default="")
    is_active = BooleanField(default=True)

    meta = {
        "collection": "exam_types",
        "ordering": ["name"],
        "indexes": [("campus_id", "is_active")],
    }

    def __str__(self):
        return self.name


class ExamSubjectSetup(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    exam_type_id = StringField(max_length=24, required=True)
    section_id = StringField(max_length=24, required=True)
    subject_id = StringField(max_length=24, required=True)
    max_marks = DecimalField(precision=6, rounding="ROUND_HALF_UP", default=100)
    pass_marks = DecimalField(precision=6, rounding="ROUND_HALF_UP", default=33)
    weightage = DecimalField(precision=5, rounding="ROUND_HALF_UP", default=100)
    is_active = BooleanField(default=True)

    meta = {
        "collection": "exam_subject_setups",
        "indexes": [("exam_type_id", "section_id", "subject_id"), ("campus_id", "is_active")],
    }

    def __str__(self):
        return f"{self.exam_type_id} {self.subject_id}"


class ExamSchedule(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    exam_type_id = StringField(max_length=24, required=True)
    section_id = StringField(max_length=24, required=True)
    subject_id = StringField(max_length=24, required=True)
    title = StringField(max_length=160, required=True)
    exam_date = StringField(required=True)
    start_time = StringField(required=True)
    end_time = StringField(required=True)
    max_marks = DecimalField(precision=6, rounding="ROUND_HALF_UP", default=100)
    venue = StringField(max_length=160, default="")
    instructions = StringField(default="")
    status = StringField(max_length=20, choices=[e.value for e in ExamScheduleStatusEnum], default=ExamScheduleStatusEnum.DRAFT.value)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "exam_schedules",
        "indexes": [("campus_id", "exam_date", "status")],
    }

    def __str__(self):
        return self.title


class LibraryBook(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    accession_number = StringField(max_length=60, unique=True, required=True)
    title = StringField(max_length=180, required=True)
    author = StringField(max_length=160, default="")
    isbn = StringField(max_length=40, default="")
    category = StringField(max_length=80, default="")
    total_copies = IntField(default=1)
    available_copies = IntField(default=1)
    shelf_location = StringField(max_length=80, default="")
    status = StringField(max_length=20, choices=[e.value for e in LibraryBookStatusEnum], default=LibraryBookStatusEnum.ACTIVE.value)

    meta = {
        "collection": "library_books",
        "indexes": [("campus_id", "status"), "category", "accession_number"],
    }

    def __str__(self):
        return self.title


class LibraryLoan(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    book_id = StringField(max_length=24, required=True)
    student_id = StringField(max_length=24, null=True)
    staff_user_id = IntField(null=True)
    issued_on = StringField(default="")
    due_on = StringField(required=True)
    returned_on = StringField(default="")
    fine_amount = DecimalField(precision=8, rounding="ROUND_HALF_UP", default=0)
    status = StringField(max_length=20, choices=[e.value for e in LibraryLoanStatusEnum], default=LibraryLoanStatusEnum.ISSUED.value)

    meta = {
        "collection": "library_loans",
        "indexes": [("campus_id", "status"), ("student_id", "status"), ("staff_user_id", "status")],
    }

    def __str__(self):
        return f"{self.book_id} -> {self.student_id or self.staff_user_id}"


class TransportRoute(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    name = StringField(max_length=120, required=True)
    route_code = StringField(max_length=40, unique=True, required=True)
    start_point = StringField(max_length=120, required=True)
    end_point = StringField(max_length=120, required=True)
    stops = ListField(StringField(), default=list)
    is_active = BooleanField(default=True)

    meta = {
        "collection": "transport_routes",
        "indexes": [("campus_id", "is_active"), "route_code"],
    }

    def __str__(self):
        return self.name


class TransportVehicle(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    route_id = StringField(max_length=24, null=True)
    vehicle_number = StringField(max_length=40, unique=True, required=True)
    driver_name = StringField(max_length=120, required=True)
    driver_phone = StringField(max_length=40, default="")
    capacity = IntField(default=1)
    gps_device_id = StringField(max_length=80, default="")
    is_active = BooleanField(default=True)

    meta = {
        "collection": "transport_vehicles",
        "indexes": [("campus_id", "is_active"), "vehicle_number"],
    }

    def __str__(self):
        return self.vehicle_number


class StudentTransportAssignment(AuditDocument):
    student_id = StringField(max_length=24, required=True)
    route_id = StringField(max_length=24, required=True)
    vehicle_id = StringField(max_length=24, null=True)
    pickup_stop = StringField(max_length=120, required=True)
    drop_stop = StringField(max_length=120, required=True)
    start_date = StringField(default="")
    end_date = StringField(default="")
    fee_amount = DecimalField(precision=10, rounding="ROUND_HALF_UP", default=0)
    is_active = BooleanField(default=True)

    meta = {
        "collection": "student_transport_assignments",
        "indexes": [("route_id", "is_active")],
    }

    def __str__(self):
        return f"{self.student_id} -> {self.route_id}"


class HostelRoom(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    hostel_name = StringField(max_length=120, required=True)
    room_number = StringField(max_length=40, required=True)
    floor = StringField(max_length=40, default="")
    capacity = IntField(default=1)
    is_active = BooleanField(default=True)

    meta = {
        "collection": "hostel_rooms",
        "indexes": [("campus_id", "is_active")],
    }

    def __str__(self):
        return f"{self.hostel_name} {self.room_number}"


class HostelAllocation(AuditDocument):
    student_id = StringField(max_length=24, required=True)
    room_id = StringField(max_length=24, required=True)
    bed_number = StringField(max_length=40, required=True)
    start_date = StringField(default="")
    end_date = StringField(default="")
    fee_amount = DecimalField(precision=10, rounding="ROUND_HALF_UP", default=0)
    is_active = BooleanField(default=True)

    meta = {
        "collection": "hostel_allocations",
        "indexes": [("room_id", "is_active"), ("student_id", "is_active")],
    }

    def __str__(self):
        return f"{self.student_id} -> {self.room_id}"


class AssignedWork(AuditDocument):
    section_id = StringField(max_length=24, required=True)
    assigned_by_id = IntField(null=True)
    title = StringField(max_length=160, required=True)
    subject = StringField(max_length=80, required=True)
    description = StringField(default="")
    due_date = StringField(required=True)
    status = StringField(max_length=20, choices=[e.value for e in AcademicWorkStatusEnum], default=AcademicWorkStatusEnum.PUBLISHED.value)
    file_url = StringField(default="")
    file_name = StringField(max_length=180, default="")
    file_content_type = StringField(max_length=100, default="")
    published_on = StringField(default="")

    meta = {
        "collection": "assigned_work",
        "ordering": ["due_date", "subject", "title"],
    }

    def __str__(self):
        return self.title


class LearningResource(AuditDocument):
    section_id = StringField(max_length=24, required=True)
    uploaded_by_id = IntField(null=True)
    title = StringField(max_length=160, required=True)
    subject = StringField(max_length=80, required=True)
    resource_type = StringField(max_length=32, choices=[e.value for e in ResourceTypeEnum], default=ResourceTypeEnum.NOTES.value)
    description = StringField(default="")
    file_url = StringField(default="")
    file_name = StringField(max_length=180, default="")
    file_content_type = StringField(max_length=100, default="")
    published_on = StringField(default="")
    is_published = BooleanField(default=True)

    meta = {
        "collection": "learning_resources",
        "ordering": ["-published_on", "subject", "title"],
    }

    def __str__(self):
        return self.title


class ResultRecord(AuditDocument):
    student_id = StringField(max_length=24, required=True)
    recorded_by_id = IntField(null=True)
    exam_name = StringField(max_length=120, required=True)
    subject = StringField(max_length=80, required=True)
    score = DecimalField(precision=6, rounding="ROUND_HALF_UP", required=True)
    max_score = DecimalField(precision=6, rounding="ROUND_HALF_UP", default=100)
    grade = StringField(max_length=12, default="")
    remarks = StringField(default="")
    published_on = StringField(default="")
    is_published = BooleanField(default=True)
    review_status = StringField(max_length=20, choices=[e.value for e in ResultReviewStatusEnum], default=ResultReviewStatusEnum.DRAFT.value)
    marks_file_url = StringField(default="")
    marks_file_name = StringField(max_length=180, default="")
    marks_file_content_type = StringField(max_length=100, default="")
    reviewed_by_id = IntField(null=True)
    reviewed_at = DateTimeField(null=True)
    review_note = StringField(default="")

    meta = {
        "collection": "result_records",
        "ordering": ["-published_on", "exam_name", "subject"],
        "indexes": [("student_id", "exam_name", "subject")],
    }

    def __str__(self):
        return f"{self.exam_name} {self.subject} {self.score}"


class AssignmentSubmission(AuditDocument):
    assignment_id = StringField(max_length=24, required=True)
    student_id = StringField(max_length=24, required=True)
    submitted_by_id = IntField(null=True)
    file_url = StringField(default="")
    file_name = StringField(max_length=180, default="")
    file_content_type = StringField(max_length=100, default="")
    notes = StringField(default="")
    status = StringField(max_length=20, choices=[e.value for e in AssignmentSubmissionStatusEnum], default=AssignmentSubmissionStatusEnum.PENDING.value)
    remarks = StringField(default="")
    checked_by_id = IntField(null=True)
    checked_at = DateTimeField(null=True)
    submitted_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "assignment_submissions",
        "ordering": ["-submitted_at"],
        "indexes": [("assignment_id", "status"), ("student_id", "status")],
    }

    def __str__(self):
        return f"{self.assignment_id} {self.student_id}"


class AdmitCard(AuditDocument):
    student_id = StringField(max_length=24, required=True)
    issued_by_id = IntField(null=True)
    exam_name = StringField(max_length=120, required=True)
    roll_number = StringField(max_length=40, required=True)
    exam_date = StringField(required=True)
    reporting_time = StringField(required=True)
    venue = StringField(max_length=160, required=True)
    instructions = StringField(default="")
    status = StringField(max_length=20, choices=[e.value for e in AdmitCardStatusEnum], default=AdmitCardStatusEnum.ISSUED.value)
    issued_on = StringField(default="")

    meta = {
        "collection": "admit_cards",
        "ordering": ["-exam_date", "exam_name"],
        "indexes": [("student_id", "exam_name")],
    }

    def __str__(self):
        return f"{self.roll_number} {self.exam_name}"


class FeeStructure(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    section_id = StringField(max_length=24, null=True)
    title = StringField(max_length=140, required=True)
    description = StringField(default="")
    amount = DecimalField(precision=10, rounding="ROUND_HALF_UP", required=True)
    late_fee = DecimalField(precision=10, rounding="ROUND_HALF_UP", default=0)
    discount_amount = DecimalField(precision=10, rounding="ROUND_HALF_UP", default=0)
    due_day = IntField(default=10)
    is_active = BooleanField(default=True)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "fee_structures",
        "indexes": [("campus_id", "is_active"), ("section_id", "is_active"), ("due_day", "is_active")],
    }

    def __str__(self):
        return self.title


class PaymentGatewayConfig(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    provider = StringField(max_length=32, choices=[e.value for e in GatewayProviderEnum], default=GatewayProviderEnum.RAZORPAY.value)
    api_key = StringField(default="")
    api_secret = StringField(default="")
    webhook_secret = StringField(default="")
    is_active = BooleanField(default=True)
    config = DictField(default=dict)

    meta = {
        "collection": "payment_gateway_configs",
        "indexes": [("campus_id", "provider", "is_active")],
    }

    def __str__(self):
        return f"{self.provider} {self.campus_id}"


class FeeAssignment(AuditDocument):
    student_id = StringField(max_length=24, required=True)
    fee_structure_id = StringField(max_length=24, required=True)
    due_date = StringField(required=True)
    amount = DecimalField(precision=10, rounding="ROUND_HALF_UP", required=True)
    late_fee = DecimalField(precision=10, rounding="ROUND_HALF_UP", default=0)
    discount_amount = DecimalField(precision=10, rounding="ROUND_HALF_UP", default=0)
    paid_amount = DecimalField(precision=10, rounding="ROUND_HALF_UP", default=0)
    status = StringField(max_length=20, choices=[e.value for e in FeeStatusEnum], default=FeeStatusEnum.PENDING.value)
    created_by_id = IntField(null=True)

    @property
    def payable_amount(self):
        return (self.amount or PyDecimal("0")) + (self.late_fee or PyDecimal("0")) - (self.discount_amount or PyDecimal("0"))

    meta = {
        "collection": "fee_assignments",
        "indexes": [("student_id", "status"), ("fee_structure_id", "status"), ("due_date", "status")],
    }

    def __str__(self):
        return f"{self.student_id} {self.fee_structure_id}"


class Payment(AuditDocument):
    fee_assignment_id = StringField(max_length=24, required=True)
    student_id = StringField(max_length=24, required=True)
    campus_id = StringField(max_length=24, required=True)
    amount = DecimalField(precision=10, rounding="ROUND_HALF_UP", required=True)
    payment_mode = StringField(max_length=20, choices=[e.value for e in PaymentMethodEnum], default=PaymentMethodEnum.ONLINE.value)
    transaction_id = StringField(max_length=120, default="")
    gateway = StringField(max_length=32, choices=[e.value for e in GatewayProviderEnum], default="")
    receipt_number = StringField(max_length=80, default="")
    status = StringField(max_length=20, choices=[e.value for e in TransactionStatusEnum], default=TransactionStatusEnum.SUCCESS.value)
    paid_at = DateTimeField(default=datetime.utcnow)
    recorded_by_id = IntField(null=True)
    gateway_response = DictField(default=dict)
    notes = StringField(default="")

    meta = {
        "collection": "payments",
        "ordering": ["-paid_at", "-created_at"],
        "indexes": [("student_id", "status", "paid_at"), ("fee_assignment_id", "status"), "transaction_id"],
    }

    def __str__(self):
        return f"{self.receipt_number} {self.amount}"


class FinanceEvent(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    event_type = StringField(max_length=40, choices=[e.value for e in FinanceEventTypeEnum], required=True)
    student_id = StringField(max_length=24, null=True)
    payment_id = StringField(max_length=24, null=True)
    amount = DecimalField(precision=12, rounding="ROUND_HALF_UP", default=0)
    balance_before = DecimalField(precision=12, rounding="ROUND_HALF_UP", default=0)
    balance_after = DecimalField(precision=12, rounding="ROUND_HALF_UP", default=0)
    summary = StringField(max_length=255, default="")
    metadata = DictField(default=dict)

    meta = {
        "collection": "finance_events",
        "ordering": ["-created_at"],
        "indexes": [("campus_id", "event_type", "created_at")],
    }

    def __str__(self):
        return f"{self.event_type} {self.amount}"


class SchoolDocument(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    student_id = StringField(max_length=24, null=True)
    staff_user_id = IntField(null=True)
    uploaded_by_id = IntField(null=True)
    title = StringField(max_length=160, required=True)
    document_type = StringField(max_length=80, default="")
    file_url = StringField(required=True)
    status = StringField(
        max_length=20,
        choices=[e.value for e in RecordStatusEnum],
        default=RecordStatusEnum.ACTIVE.value,
    )
    created_by_id = IntField(null=True)

    meta = {
        "collection": "documents",
        "ordering": ["-created_at"],
        "indexes": [
            ("campus_id", "document_type", "status"),
            ("student_id", "document_type"),
            ("staff_user_id", "document_type"),
        ],
    }

    def __str__(self):
        return self.title


class PaymentTransaction(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    student_id = StringField(max_length=24, null=True)
    fee_assignment_id = StringField(max_length=24, null=True)
    payment_id = StringField(max_length=24, null=True)
    provider = StringField(max_length=40, default="razorpay")
    method = StringField(
        max_length=32,
        choices=[e.value for e in PaymentMethodEnum],
        default=PaymentMethodEnum.ONLINE.value,
    )
    amount = DecimalField(precision=10, rounding="ROUND_HALF_UP", required=True)
    discount_amount = DecimalField(precision=10, rounding="ROUND_HALF_UP", default=0)
    late_fee = DecimalField(precision=10, rounding="ROUND_HALF_UP", default=0)
    pending_amount = DecimalField(precision=10, rounding="ROUND_HALF_UP", default=0)
    currency = StringField(max_length=8, default="INR")
    status = StringField(
        max_length=20,
        choices=[e.value for e in TransactionStatusEnum],
        default=TransactionStatusEnum.CREATED.value,
    )
    gateway_name = StringField(max_length=40, default="")
    gateway_order_id = StringField(max_length=120, default="")
    gateway_payment_id = StringField(max_length=120, default="")
    gateway_signature = StringField(max_length=255, default="")
    transaction_id = StringField(max_length=120, default="")
    receipt_number = StringField(max_length=80, null=True)
    invoice_number = StringField(max_length=80, default="")
    webhook_verified = BooleanField(default=False)
    paid_at = DateTimeField(null=True)
    raw_payload = DictField(default=dict)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "payment_transactions",
        "ordering": ["-created_at"],
        "indexes": [
            ("campus_id", "status", "created_at"),
            ("student_id", "status"),
            "gateway_order_id",
            "receipt_number",
            "transaction_id",
        ],
    }

    def __str__(self):
        return f"{self.receipt_number or self.transaction_id} {self.amount}"


class CommunicationSetting(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    channel = StringField(max_length=20, choices=[e.value for e in MessageChannelEnum], required=True)
    provider = StringField(max_length=80, default="")
    api_key = StringField(default="")
    sender_id = StringField(max_length=40, default="")
    is_active = BooleanField(default=True)
    config = DictField(default=dict)

    meta = {
        "collection": "communication_settings",
        "indexes": [("campus_id", "channel", "is_active")],
    }

    def __str__(self):
        return f"{self.channel} {self.campus_id}"


class MessageTemplate(AuditDocument):
    campus_id = StringField(max_length=24, null=True)
    channel = StringField(max_length=20, choices=[e.value for e in MessageChannelEnum], required=True)
    template_key = StringField(max_length=80, required=True)
    subject = StringField(max_length=200, default="")
    body = StringField(required=True)
    variables = DictField(default=dict)
    is_active = BooleanField(default=True)

    meta = {
        "collection": "message_templates",
        "indexes": [("campus_id", "channel", "template_key")],
    }

    def __str__(self):
        return self.template_key


class MessageLog(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    channel = StringField(max_length=20, choices=[e.value for e in MessageChannelEnum], required=True)
    recipient = StringField(max_length=200, required=True)
    subject = StringField(max_length=200, default="")
    body = StringField(default="")
    status = StringField(max_length=20, choices=[e.value for e in MessageStatusEnum], default=MessageStatusEnum.QUEUED.value)
    provider_message_id = StringField(max_length=120, default="")
    error_message = StringField(default="")
    sent_at = DateTimeField(null=True)
    metadata = DictField(default=dict)

    meta = {
        "collection": "message_logs",
        "ordering": ["-created_at"],
        "indexes": [("campus_id", "status"), ("channel", "status", "created_at")],
    }

    def __str__(self):
        return f"{self.channel} {self.recipient} {self.status}"


class ApprovalRequest(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    requested_by_id = IntField(required=True)
    approved_by_id = IntField(null=True)
    request_type = StringField(max_length=80, required=True)
    title = StringField(max_length=160, required=True)
    description = StringField(default="")
    status = StringField(max_length=20, choices=[e.value for e in ApprovalStatusEnum], default=ApprovalStatusEnum.PENDING.value)
    decided_at = DateTimeField(null=True)
    decision_note = StringField(default="")
    metadata = DictField(default=dict)

    meta = {
        "collection": "approval_requests",
        "ordering": ["-created_at"],
        "indexes": [("campus_id", "status"), ("requested_by_id", "status")],
    }

    def __str__(self):
        return f"{self.request_type}: {self.title}"


class Announcement(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    created_by_id = IntField(null=True)
    title = StringField(max_length=160, required=True)
    body = StringField(required=True)
    audience = StringField(max_length=20, choices=[e.value for e in AnnouncementAudienceEnum], default=AnnouncementAudienceEnum.ALL.value)
    priority = StringField(max_length=10, default="normal")
    is_published = BooleanField(default=True)
    published_at = DateTimeField(default=datetime.utcnow)
    expires_at = DateTimeField(null=True)
    attachments = DictField(default=dict)

    meta = {
        "collection": "announcements",
        "ordering": ["-published_at"],
        "indexes": [("campus_id", "audience", "is_published"), ("campus_id", "priority", "published_at")],
    }

    def __str__(self):
        return self.title


class SupportTicket(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    created_by_id = IntField(required=True)
    assigned_to_id = IntField(null=True)
    title = StringField(max_length=160, required=True)
    description = StringField(default="")
    category = StringField(max_length=80, default="")
    priority = StringField(max_length=20, choices=[e.value for e in SupportTicketPriorityEnum], default=SupportTicketPriorityEnum.NORMAL.value)
    status = StringField(max_length=20, choices=[e.value for e in SupportTicketStatusEnum], default=SupportTicketStatusEnum.OPEN.value)
    resolved_at = DateTimeField(null=True)
    resolution_note = StringField(default="")
    metadata = DictField(default=dict)

    meta = {
        "collection": "support_tickets",
        "ordering": ["-created_at"],
        "indexes": [("campus_id", "status", "priority"), ("assigned_to_id", "status")],
    }

    def __str__(self):
        return f"#{self.id} {self.title}"


class PlatformSetting(AuditDocument):
    campus_id = StringField(max_length=24, null=True)
    key = StringField(max_length=80, required=True)
    value = StringField(default="")
    value_json = DictField(default=dict)
    data_type = StringField(max_length=20, default="string")
    is_encrypted = BooleanField(default=False)

    meta = {
        "collection": "platform_settings",
        "indexes": [("campus_id", "key")],
    }

    def __str__(self):
        return self.key


class AILog(AuditDocument):
    campus_id = StringField(max_length=24, null=True)
    user_id = IntField(null=True)
    model = StringField(max_length=80, default="")
    prompt_tokens = IntField(default=0)
    completion_tokens = IntField(default=0)
    total_tokens = IntField(default=0)
    latency_ms = IntField(default=0)
    prompt = StringField(default="")
    response = StringField(default="")
    metadata = DictField(default=dict)

    meta = {
        "collection": "ai_logs",
        "ordering": ["-created_at"],
        "indexes": [("campus_id", "created_at"), ("user_id", "created_at")],
    }

    def __str__(self):
        return f"{self.model} {self.total_tokens}t"


class AdmissionFormTemplate(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    academic_session_id = StringField(max_length=24, required=True)
    title = StringField(max_length=160, required=True)
    form_fields = DictField(default=dict)
    is_active = BooleanField(default=True)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "admission_form_templates",
        "indexes": [("campus_id", "is_active")],
    }

    def __str__(self):
        return self.title


class AdmissionApplication(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    form_template_id = StringField(max_length=24, null=True)
    student_id = StringField(max_length=24, null=True)
    applicant_name = StringField(max_length=160, required=True)
    date_of_birth = StringField(default="")
    contact_email = StringField(default="")
    phone_number = StringField(max_length=20, default="")
    address = StringField(default="")
    applying_for_grade = StringField(max_length=50, default="")
    previous_school = StringField(max_length=160, default="")
    status = StringField(max_length=20, choices=[e.value for e in AdmissionApplicationStatusEnum], default=AdmissionApplicationStatusEnum.NEW.value)
    reviewed_by_id = IntField(null=True)
    reviewed_at = DateTimeField(null=True)
    review_notes = StringField(default="")
    form_data = DictField(default=dict)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "admission_applications",
        "ordering": ["-created_at"],
        "indexes": [("campus_id", "status", "created_at"), ("applicant_name", "status")],
    }

    def __str__(self):
        return f"{self.applicant_name} ({self.status})"


class AdmissionDocument(AuditDocument):
    application_id = StringField(max_length=24, required=True)
    document_type = StringField(max_length=80, required=True)
    file_name = StringField(max_length=180, default="")
    file_url = StringField(default="")
    uploaded_by_id = IntField(null=True)

    meta = {
        "collection": "admission_documents",
        "indexes": [("application_id", "document_type")],
    }

    def __str__(self):
        return f"{self.document_type} {self.file_name}"


class TransportDriver(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    user_id = IntField(null=True)
    name = StringField(max_length=120, required=True)
    phone = StringField(max_length=20, required=True)
    license_number = StringField(max_length=80, default="")
    alternate_phone = StringField(max_length=20, default="")
    address = StringField(default="")
    is_active = BooleanField(default=True)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "transport_drivers",
        "indexes": [("campus_id", "is_active")],
    }

    def __str__(self):
        return self.name


class TransportVehicleAttendance(AuditDocument):
    vehicle_id = StringField(max_length=24, required=True)
    driver_id = StringField(max_length=24, null=True)
    date = StringField(required=True)
    trip_type = StringField(max_length=20, choices=[e.value for e in TransportTripTypeEnum], required=True)
    status = StringField(max_length=20, choices=[e.value for e in TransportAttendanceStatusEnum], default=TransportAttendanceStatusEnum.PRESENT.value)
    odometer_start = IntField(default=0)
    odometer_end = IntField(default=0)
    route_id = StringField(max_length=24, null=True)
    notes = StringField(default="")
    marked_by_id = IntField(null=True)

    meta = {
        "collection": "transport_vehicle_attendance",
        "indexes": [("vehicle_id", "date"), ("driver_id", "date")],
    }

    def __str__(self):
        return f"{self.vehicle_id} {self.date} {self.status}"


class TransportTripLog(AuditDocument):
    vehicle_id = StringField(max_length=24, required=True)
    driver_id = StringField(max_length=24, null=True)
    trip_type = StringField(max_length=20, choices=[e.value for e in TransportTripTypeEnum], required=True)
    status = StringField(max_length=20, choices=[e.value for e in TransportTripStatusEnum], default=TransportTripStatusEnum.SCHEDULED.value)
    start_time = DateTimeField(null=True)
    end_time = DateTimeField(null=True)
    start_odometer = IntField(default=0)
    end_odometer = IntField(default=0)
    route_id = StringField(max_length=24, null=True)
    notes = StringField(default="")
    created_by_id = IntField(null=True)

    meta = {
        "collection": "transport_trip_logs",
        "ordering": ["-start_time"],
        "indexes": [("vehicle_id", "status"), ("driver_id", "status")],
    }

    def __str__(self):
        return f"{self.vehicle_id} {self.trip_type} {self.status}"


class DigitalLibraryResource(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    title = StringField(max_length=180, required=True)
    author = StringField(max_length=160, default="")
    resource_type = StringField(max_length=40, default="ebook")
    file_url = StringField(default="")
    isbn = StringField(max_length=40, default="")
    category = StringField(max_length=80, default="")
    description = StringField(default="")
    is_active = BooleanField(default=True)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "digital_library_resources",
        "indexes": [("campus_id", "is_active"), ("campus_id", "category")],
    }

    def __str__(self):
        return self.title


class LibraryBookRequest(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    staff_user_id = IntField(required=True)
    book_title = StringField(max_length=180, required=True)
    author = StringField(max_length=160, default="")
    isbn = StringField(max_length=40, default="")
    reason = StringField(default="")
    status = StringField(max_length=20, choices=[e.value for e in LibraryRequestStatusEnum], default=LibraryRequestStatusEnum.REQUESTED.value)
    decided_by_id = IntField(null=True)
    decided_at = DateTimeField(null=True)
    decision_note = StringField(default="")

    meta = {
        "collection": "library_book_requests",
        "indexes": [("campus_id", "status")],
    }

    def __str__(self):
        return self.book_title


class InventoryAsset(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    asset_tag = StringField(max_length=60, unique=True, required=True)
    name = StringField(max_length=120, required=True)
    category = StringField(max_length=40, choices=[e.value for e in AssetCategoryEnum], default=AssetCategoryEnum.OTHER.value)
    model = StringField(max_length=120, default="")
    serial_number = StringField(max_length=80, default="")
    purchase_date = StringField(default="")
    purchase_cost = DecimalField(precision=12, rounding="ROUND_HALF_UP", default=0)
    warranty_until = StringField(default="")
    location = StringField(max_length=120, default="")
    status = StringField(max_length=20, choices=[e.value for e in AssetStatusEnum], default=AssetStatusEnum.AVAILABLE.value)
    allocated_to_user_id = IntField(null=True)
    notes = StringField(default="")
    created_by_id = IntField(null=True)

    meta = {
        "collection": "inventory_assets",
        "indexes": [("campus_id", "status", "category"), "asset_tag"],
    }

    def __str__(self):
        return f"{self.asset_tag} {self.name}"


class AssetMaintenanceLog(AuditDocument):
    asset_id = StringField(max_length=24, required=True)
    maintenance_date = StringField(required=True)
    description = StringField(required=True)
    cost = DecimalField(precision=12, rounding="ROUND_HALF_UP", default=0)
    performed_by = StringField(max_length=120, default="")
    notes = StringField(default="")
    created_by_id = IntField(null=True)

    meta = {
        "collection": "asset_maintenance_logs",
        "indexes": [("asset_id", "maintenance_date")],
    }

    def __str__(self):
        return f"{self.asset_id} {self.maintenance_date}"


class SchoolWebsiteContent(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    content_type = StringField(max_length=20, choices=[e.value for e in WebsiteContentTypeEnum], required=True)
    title = StringField(max_length=160, default="")
    slug = StringField(max_length=160, default="")
    body = StringField(default="")
    meta_data = DictField(default=dict)
    is_published = BooleanField(default=False)
    published_at = DateTimeField(null=True)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "school_website_contents",
        "indexes": [("campus_id", "content_type", "is_published"), ("campus_id", "slug")],
    }

    def __str__(self):
        return self.title or self.slug


class PushNotificationDevice(AuditDocument):
    campus_id = StringField(max_length=24, null=True)
    user_id = IntField(required=True)
    device_token = StringField(required=True)
    platform = StringField(max_length=20, choices=[e.value for e in PushPlatformEnum], default=PushPlatformEnum.ANDROID.value)
    is_active = BooleanField(default=True)
    last_seen_at = DateTimeField(default=datetime.utcnow)

    meta = {
        "collection": "push_notification_devices",
        "indexes": [("user_id", "is_active"), "device_token"],
    }

    def __str__(self):
        return f"{self.platform} {self.user_id}"


class PushNotificationLog(AuditDocument):
    campus_id = StringField(max_length=24, null=True)
    user_id = IntField(null=True)
    title = StringField(max_length=160, default="")
    body = StringField(default="")
    status = StringField(max_length=20, choices=[e.value for e in PushNotificationStatusEnum], default=PushNotificationStatusEnum.QUEUED.value)
    sent_at = DateTimeField(null=True)
    read_at = DateTimeField(null=True)
    metadata = DictField(default=dict)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "push_notification_logs",
        "indexes": [("user_id", "status"), ("campus_id", "status")],
    }

    def __str__(self):
        return self.title


class MarketplacePlugin(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    plugin_type = StringField(max_length=40, choices=[e.value for e in MarketplacePluginTypeEnum], required=True)
    name = StringField(max_length=120, required=True)
    provider = StringField(max_length=120, default="")
    version = StringField(max_length=20, default="")
    config = DictField(default=dict)
    is_active = BooleanField(default=False)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "marketplace_plugins",
        "indexes": [("campus_id", "plugin_type", "is_active")],
    }

    def __str__(self):
        return f"{self.name} {self.plugin_type}"


class SchoolPluginConfig(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    plugin_id = StringField(max_length=24, required=True)
    config = DictField(default=dict)
    is_enabled = BooleanField(default=True)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "school_plugin_configs",
        "indexes": [("campus_id", "plugin_id")],
    }

    def __str__(self):
        return f"{self.campus_id} {self.plugin_id}"


class AccountingLedgerEntry(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    entry_type = StringField(max_length=40, choices=[e.value for e in AccountingEntryTypeEnum], required=True)
    description = StringField(max_length=255, required=True)
    amount = DecimalField(precision=12, rounding="ROUND_HALF_UP", required=True)
    transaction_date = StringField(required=True)
    reference_type = StringField(max_length=80, default="")
    reference_id = StringField(max_length=80, default="")
    gst_rate = DecimalField(precision=5, rounding="ROUND_HALF_UP", default=0)
    gst_amount = DecimalField(precision=12, rounding="ROUND_HALF_UP", default=0)
    metadata = DictField(default=dict)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "accounting_ledger_entries",
        "ordering": ["-transaction_date"],
        "indexes": [("campus_id", "transaction_date"), ("campus_id", "entry_type")],
    }

    def __str__(self):
        return f"{self.entry_type} {self.amount} {self.transaction_date}"


class ReportDefinition(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    report_type = StringField(max_length=40, choices=[e.value for e in ReportDefinitionTypeEnum], required=True)
    name = StringField(max_length=120, required=True)
    description = StringField(default="")
    config = DictField(default=dict)
    is_active = BooleanField(default=True)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "report_definitions",
        "indexes": [("campus_id", "report_type", "is_active")],
    }

    def __str__(self):
        return self.name


class SecurityPolicy(AuditDocument):
    campus_id = StringField(max_length=24, null=True)
    policy_type = StringField(max_length=80, required=True)
    name = StringField(max_length=120, required=True)
    description = StringField(default="")
    rules = DictField(default=dict)
    is_active = BooleanField(default=True)
    priority = IntField(default=5)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "security_policies",
        "indexes": [("campus_id", "policy_type", "is_active")],
    }

    def __str__(self):
        return self.name


class SecurityEvent(AuditDocument):
    campus_id = StringField(max_length=24, null=True)
    user_id = IntField(null=True)
    event_type = StringField(max_length=40, choices=[e.value for e in SecurityEventTypeEnum], required=True)
    severity = StringField(max_length=20, default="info")
    ip_address = StringField(default="")
    user_agent = StringField(default="")
    description = StringField(default="")
    metadata = DictField(default=dict)
    resolved_by_id = IntField(null=True)
    resolved_at = DateTimeField(null=True)
    resolution = StringField(default="")

    meta = {
        "collection": "security_events",
        "ordering": ["-created_at"],
        "indexes": [("campus_id", "event_type", "created_at"), ("user_id", "created_at")],
    }

    def __str__(self):
        return f"{self.event_type} {self.severity}"


class DeviceSyncLog(AuditDocument):
    device_id = StringField(max_length=24, required=True)
    campus_id = StringField(max_length=24, required=True)
    sync_type = StringField(max_length=40, default="attendance")
    status = StringField(max_length=20, choices=[e.value for e in DeviceSyncStatusEnum], default=DeviceSyncStatusEnum.SUCCESS.value)
    records_synced = IntField(default=0)
    records_failed = IntField(default=0)
    error_message = StringField(default="")
    started_at = DateTimeField(default=datetime.utcnow)
    completed_at = DateTimeField(null=True)
    metadata = DictField(default=dict)

    meta = {
        "collection": "device_sync_logs",
        "indexes": [("device_id", "status"), ("campus_id", "status")],
    }

    def __str__(self):
        return f"{self.device_id} {self.sync_type} {self.status}"


class DeviceLoginSession(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    user_id = IntField(required=True)
    device_id = StringField(max_length=24, required=True)
    login_token = StringField(max_length=256, required=True)
    is_active = BooleanField(default=True)
    logged_in_at = DateTimeField(default=datetime.utcnow)
    last_heartbeat_at = DateTimeField(null=True)
    logged_out_at = DateTimeField(null=True)
    ip_address = StringField(default="")
    metadata = DictField(default=dict)

    meta = {
        "collection": "device_login_sessions",
        "indexes": [("user_id", "device_id", "is_active"), "login_token"],
    }

    def __str__(self):
        return f"{self.user_id} @ {self.device_id}"


class ProductionAuditRun(AuditDocument):
    campus_id = StringField(max_length=24, null=True)
    audit_type = StringField(max_length=80, required=True)
    status = StringField(max_length=20, choices=[e.value for e in ProductionAuditStatusEnum], default=ProductionAuditStatusEnum.QUEUED.value)
    started_at = DateTimeField(null=True)
    completed_at = DateTimeField(null=True)
    summary = StringField(default="")
    details = DictField(default=dict)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "production_audit_runs",
        "ordering": ["-created_at"],
        "indexes": [("campus_id", "audit_type", "status")],
    }

    def __str__(self):
        return f"{self.audit_type} {self.status}"


class SalaryStructure(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    staff_profile_id = StringField(max_length=24, required=True)
    basic_pay = DecimalField(precision=12, rounding="ROUND_HALF_UP", default=0)
    allowances = DictField(default=dict)
    deductions = DictField(default=dict)
    gross_pay = DecimalField(precision=12, rounding="ROUND_HALF_UP", default=0)
    net_pay = DecimalField(precision=12, rounding="ROUND_HALF_UP", default=0)
    effective_from = StringField(default="")
    is_active = BooleanField(default=True)
    created_by_id = IntField(null=True)

    meta = {
        "collection": "salary_structures",
        "indexes": [("campus_id", "staff_profile_id", "is_active")],
    }

    def __str__(self):
        return f"{self.staff_profile_id} {self.net_pay}"


class SalaryPayment(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    staff_profile_id = StringField(max_length=24, required=True)
    salary_structure_id = StringField(max_length=24, null=True)
    month = IntField(required=True)
    year = IntField(required=True)
    gross_pay = DecimalField(precision=12, rounding="ROUND_HALF_UP", default=0)
    deductions = DecimalField(precision=12, rounding="ROUND_HALF_UP", default=0)
    net_pay = DecimalField(precision=12, rounding="ROUND_HALF_UP", default=0)
    status = StringField(max_length=20, choices=[e.value for e in SalaryPaymentStatusEnum], default=SalaryPaymentStatusEnum.DRAFT.value)
    paid_at = DateTimeField(null=True)
    transaction_id = StringField(max_length=120, default="")
    notes = StringField(default="")
    created_by_id = IntField(null=True)

    meta = {
        "collection": "salary_payments",
        "indexes": [("campus_id", "month", "year"), ("staff_profile_id", "status")],
    }

    def __str__(self):
        return f"{self.staff_profile_id} {self.month}/{self.year}"


class AcademicEvent(AuditDocument):
    campus_id = StringField(max_length=24, required=True)
    student_id = StringField(max_length=24, null=True)
    event_type = StringField(max_length=40, choices=[e.value for e in AcademicEventTypeEnum], required=True)
    summary = StringField(max_length=255, required=True)
    metadata = DictField(default=dict)

    meta = {
        "collection": "academic_events",
        "ordering": ["-created_at"],
        "indexes": [("campus_id", "event_type", "created_at"), ("student_id", "created_at")],
    }

    def __str__(self):
        return f"{self.event_type}: {self.summary}"


# ═══════════════════════════════════════════════════════════════════════════
#  BACKWARD-COMPATIBILITY ALIASES
#  Map old Django TextChoices & model names → new mongoengine equivalents.
#  Imported by apps.core.models re-export layer so existing code continues
#  to resolve symbols without changes.
# ═══════════════════════════════════════════════════════════════════════════

# -- Enum aliases (Django TextChoices → Python enum) --
SchoolStatus = SchoolStatusEnum
SubscriptionStatus = SubscriptionStatusEnum
BillingCycle = BillingCycleEnum
InvoiceStatus = InvoiceStatusEnum
EnterprisePaymentStatus = EnterprisePaymentStatusEnum
JobStatus = JobStatusEnum
BackupType = BackupTypeEnum
HealthStatus = HealthStatusEnum
AdmissionApplicationStatus = AdmissionApplicationStatusEnum
TransportAttendanceStatus = TransportAttendanceStatusEnum
TransportTripType = TransportTripTypeEnum
TransportTripStatus = TransportTripStatusEnum
LibraryRequestStatus = LibraryRequestStatusEnum
AssetCategory = AssetCategoryEnum
AssetStatus = AssetStatusEnum
WebsiteContentType = WebsiteContentTypeEnum
PushPlatform = PushPlatformEnum
PushNotificationStatus = PushNotificationStatusEnum
MarketplacePluginType = MarketplacePluginTypeEnum
AccountingEntryType = AccountingEntryTypeEnum
ReportDefinitionType = ReportDefinitionTypeEnum
SecurityEventType = SecurityEventTypeEnum
ProductionAuditStatus = ProductionAuditStatusEnum
StudentStatus = StudentStatusEnum
AttendanceStatus = AttendanceStatusEnum
FeeStatus = FeeStatusEnum
PaymentMethod = PaymentMethodEnum
GatewayProvider = GatewayProviderEnum
FinanceEventType = FinanceEventTypeEnum
CampusMemberRole = CampusMemberRoleEnum
AttendanceCaptureMethod = AttendanceCaptureMethodEnum
DeviceStatus = DeviceStatusEnum
RS485Function = RS485FunctionEnum
StaffAttendanceStatus = StaffAttendanceStatusEnum
StaffEmploymentType = StaffEmploymentTypeEnum
StaffProfileStatus = StaffProfileStatusEnum
Weekday = WeekdayEnum
LibraryBookStatus = LibraryBookStatusEnum
LibraryLoanStatus = LibraryLoanStatusEnum
ApprovalStatus = ApprovalStatusEnum
AnnouncementAudience = AnnouncementAudienceEnum
SupportTicketStatus = SupportTicketStatusEnum
SupportTicketPriority = SupportTicketPriorityEnum
AuditAction = AuditActionEnum
AcademicWorkStatus = AcademicWorkStatusEnum
AssignmentSubmissionStatus = AssignmentSubmissionStatusEnum
ResultReviewStatus = ResultReviewStatusEnum
AcademicEventType = AcademicEventTypeEnum
ResourceType = ResourceTypeEnum
AdmitCardStatus = AdmitCardStatusEnum
ExamScheduleStatus = ExamScheduleStatusEnum
TransactionStatus = TransactionStatusEnum
SalaryPaymentStatus = SalaryPaymentStatusEnum
MessageChannel = MessageChannelEnum
DeviceSyncStatus = DeviceSyncStatusEnum
MessageStatus = MessageStatusEnum
RecordStatus = RecordStatusEnum

# -- Model aliases (renamed or structurally different) --
# Document → SchoolDocument (avoids shadowing mongoengine.Document)
Document = SchoolDocument

# SalarySetup → SalaryStructure (renamed)
SalarySetup = SalaryStructure

# SalaryRecord → SalaryPayment (renamed)
SalaryRecord = SalaryPayment

# OutboundMessage → MessageLog (renamed)
OutboundMessage = MessageLog
