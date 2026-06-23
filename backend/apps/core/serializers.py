import secrets
from decimal import Decimal

from django.db.models import Q, Sum
from django.conf import settings
from django.db import connections
from rest_framework import serializers
from rest_framework_mongoengine.serializers import DocumentSerializer


# ─── Mongo relation-field compatibility shim ─────────────────────────────────
# Many serializers list bare relation names (e.g. "campus", "section", "user",
# "created_by") in Meta.fields. The Mongo models store these as ``<name>_id``
# StringFields and resolve ``obj.campus`` lazily via AuditDocument.__getattr__.
# rest_framework_mongoengine can't introspect those at field-build time and
# raises ImproperlyConfigured, so we map any such bare relation to a read-only
# field that emits the underlying ``<name>_id`` value (or null when absent).
class _RelationIdField(serializers.Field):
    """Read/write a bare relation name (``campus``) via its ``campus_id`` column."""

    def __init__(self, id_source, **kwargs):
        kwargs["source"] = id_source
        kwargs.setdefault("required", False)
        kwargs.setdefault("allow_null", True)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        return None if data in (None, "") else str(data)

    def to_representation(self, value):
        return None if value is None else str(value)


class _NullField(serializers.Field):
    """Unknown non-relation field (a Django-era rename with no Mongo column).

    Renders ``null`` and is ignored on write, so it never crashes the endpoint.
    Such fields should be renamed to their Mongo equivalent for real data.
    """

    def __init__(self, **kwargs):
        kwargs["read_only"] = True
        kwargs["source"] = "*"
        super().__init__(**kwargs)

    def to_representation(self, value):
        return None


def _build_unknown_field(self, field_name, model_class):
    id_field = f"{field_name}_id"
    if id_field in getattr(model_class, "_fields", {}):
        return (_RelationIdField, {"id_source": id_field})
    return (_NullField, {})


DocumentSerializer.build_unknown_field = _build_unknown_field


def _normalize_relation_data(model, data):
    """Normalize validated_data before a mongoengine save.

    Views frequently pass relation objects (``serializer.save(created_by=user)``)
    or bare relation names that the Mongo model stores as ``<name>_id``.
    rest_framework_mongoengine's ``recursive_save`` can't map those, so we
    convert model instances to their pk, rename ``<name>`` → ``<name>_id`` and
    drop keys the model doesn't have.
    """
    me_fields = getattr(model, "_fields", {})
    out = {}
    for key, value in data.items():
        if hasattr(value, "pk") and hasattr(value, "_meta"):
            value = str(value.pk)
        if key in me_fields:
            out[key] = value
        elif f"{key}_id" in me_fields:
            out[f"{key}_id"] = value
        # else: drop a field the Mongo model doesn't define
    return out


_orig_ds_create = DocumentSerializer.create
_orig_ds_update = DocumentSerializer.update


def _ds_create(self, validated_data):
    return _orig_ds_create(self, _normalize_relation_data(self.Meta.model, validated_data))


def _ds_update(self, instance, validated_data):
    return _orig_ds_update(self, instance, _normalize_relation_data(self.Meta.model, validated_data))


DocumentSerializer.create = _ds_create
DocumentSerializer.update = _ds_update

from apps.accounts.models import User, UserRole

from .attendance_rules import ensure_attendance_date_is_editable
from .models import (
    AcademicSession,
    AcademicEvent,
    AccountingLedgerEntry,
    AdmitCard,
    AILog,
    AdmissionApplication,
    AdmissionDocument,
    AdmissionFormTemplate,
    AssetMaintenanceLog,
    AssignmentSubmission,
    AssignedWork,
    ApprovalRequest,
    Announcement,
    AttendanceDevice,
    AttendanceRecord,
    AuditEvent,
    BackupJob,
    BackupPolicy,
    Campus,
    CampusMembership,
    ClassSection,
    CommunicationSetting,
    DeviceSyncLog,
    Document,
    DocumentAccessLog,
    DeviceLoginSession,
    DigitalLibraryResource,
    EnterpriseUsageMetric,
    InventoryAsset,
    FeeAssignment,
    FeeStructure,
    FinanceEvent,
    HostelAllocation,
    HostelRoom,
    LibraryBook,
    LibraryBookRequest,
    LibraryLoan,
    LearningResource,
    MarketplacePlugin,
    MessageTemplate,
    OutboundMessage,
    Payment,
    PaymentGatewayConfig,
    PaymentTransaction,
    PlatformSetting,
    ProductionAuditRun,
    PushNotificationDevice,
    PushNotificationLog,
    QueueJob,
    ReportDefinition,
    ResultRecord,
    SaaSPlan,
    SalaryRecord,
    SalarySetup,
    SchoolPluginConfig,
    SchoolSubscription,
    SecureAPIToken,
    SecurityEvent,
    SecurityPolicy,
    SubscriptionInvoice,
    SubscriptionPayment,
    SystemHealthSnapshot,
    ExamSchedule,
    ExamSubjectSetup,
    ExamType,
    StaffAttendanceRecord,
    StaffProfile,
    Student,
    StudentTransportAssignment,
    Subject,
    SupportTicket,
    TeacherSubjectAllocation,
    TimetableSlot,
    TransportRoute,
    TransportDriver,
    TransportTripLog,
    TransportVehicle,
    TransportVehicleAttendance,
    UserActivityLog,
    WhiteLabelConfig,
    SchoolWebsiteContent,
)


class CampusSerializer(DocumentSerializer):
    class Meta:
        model = Campus
        fields = (
            "id",
            "name",
            "code",
            "address",
            "city",
            "state",
            "pincode",
            "contact_email",
            "contact_phone",
            "website",
            "principal_name",
            "logo_url",
            "logo_alt_text",
            "banner_url",
            "status",
            "subscription_plan",
            "subscription_status",
            "monthly_subscription_amount",
            "billing_due_date",
            "academic_year_label",
            "enabled_modules",
            "payment_gateway_settings",
            "messaging_settings",
            "attendance_hardware_settings",
            "created_by",
            "database_alias",
            "database_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")

    def validate_logo_url(self, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            return ""
        allowed_prefixes = ("https://", "http://", "data:image/png;", "data:image/jpeg;", "data:image/webp;", "data:image/svg+xml;")
        if not cleaned.startswith(allowed_prefixes):
            raise serializers.ValidationError("Use an http(s) URL or an uploaded PNG, JPG, WEBP, or SVG logo.")
        if len(cleaned) > 750_000:
            raise serializers.ValidationError("Logo is too large. Use an image below 500 KB.")
        return cleaned

    def validate_banner_url(self, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            return ""
        allowed_prefixes = ("https://", "http://", "data:image/png;", "data:image/jpeg;", "data:image/webp;")
        if not cleaned.startswith(allowed_prefixes):
            raise serializers.ValidationError("Use an http(s) URL or an uploaded PNG, JPG, or WEBP banner.")
        if len(cleaned) > 1_500_000:
            raise serializers.ValidationError("Banner is too large. Use an image below 1 MB.")
        return cleaned


def school_connection_status(campus: Campus) -> dict:
    alias = (campus.database_alias or "").strip()
    if not alias:
        return {
            "mode": "single_database",
            "alias": "default",
            "databaseName": str(campus.database_name or settings.DATABASES["default"].get("NAME", "")),
            "configured": True,
            "connected": True,
            "detail": "Using default database with strict schoolId filtering.",
        }

    if alias not in settings.DATABASES:
        return {
            "mode": "separate_database",
            "alias": alias,
            "databaseName": campus.database_name,
            "configured": False,
            "connected": False,
            "detail": "Database alias is not configured.",
        }

    try:
        connections[alias].ensure_connection()
    except Exception as exc:
        return {
            "mode": "separate_database",
            "alias": alias,
            "databaseName": str(campus.database_name or settings.DATABASES[alias].get("NAME", "")),
            "configured": True,
            "connected": False,
            "detail": str(exc),
        }

    return {
        "mode": "separate_database",
        "alias": alias,
        "databaseName": str(campus.database_name or settings.DATABASES[alias].get("NAME", "")),
        "configured": True,
        "connected": True,
        "detail": "Database connection is available.",
    }


class SchoolSerializer(DocumentSerializer):
    schoolId = serializers.CharField(source="id", read_only=True)
    schoolCode = serializers.CharField(source="code", required=False)
    schoolName = serializers.CharField(source="name")
    logo = serializers.CharField(source="logo_url", required=False, allow_blank=True)
    bannerImage = serializers.CharField(source="banner_url", required=False, allow_blank=True)
    contactNumber = serializers.CharField(source="contact_phone", required=False, allow_blank=True)
    email = serializers.EmailField(source="contact_email", required=False, allow_blank=True)
    principalName = serializers.CharField(source="principal_name", required=False, allow_blank=True)
    subscriptionStatus = serializers.CharField(source="subscription_status", required=False, allow_blank=True)
    databaseName = serializers.CharField(source="database_name", required=False, allow_blank=True)
    tenantId = serializers.CharField(source="database_alias", required=False, allow_blank=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)
    totalStudents = serializers.SerializerMethodField()
    totalTeachers = serializers.SerializerMethodField()
    totalStaff = serializers.SerializerMethodField()
    schoolAdmins = serializers.SerializerMethodField()
    databaseConnectionStatus = serializers.SerializerMethodField()

    class Meta:
        model = Campus
        fields = (
            "schoolId",
            "schoolCode",
            "schoolName",
            "logo",
            "bannerImage",
            "address",
            "city",
            "state",
            "pincode",
            "contactNumber",
            "email",
            "website",
            "principalName",
            "status",
            "subscriptionStatus",
            "databaseName",
            "tenantId",
            "createdAt",
            "updatedAt",
            "totalStudents",
            "totalTeachers",
            "totalStaff",
            "schoolAdmins",
            "databaseConnectionStatus",
        )

    def get_totalStudents(self, obj: Campus) -> int:
        from apps.core.models import Student
        return Student.objects.filter(campus_id=obj.id).count()

    def validate_logo(self, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            return ""
        allowed_prefixes = ("https://", "http://", "data:image/png;", "data:image/jpeg;", "data:image/webp;", "data:image/svg+xml;")
        if not cleaned.startswith(allowed_prefixes):
            raise serializers.ValidationError("Use an http(s) URL or an uploaded PNG, JPG, WEBP, or SVG logo.")
        if len(cleaned) > 750_000:
            raise serializers.ValidationError("Logo is too large. Use an image below 500 KB.")
        return cleaned

    def validate_bannerImage(self, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            return ""
        allowed_prefixes = ("https://", "http://", "data:image/png;", "data:image/jpeg;", "data:image/webp;")
        if not cleaned.startswith(allowed_prefixes):
            raise serializers.ValidationError("Use an http(s) URL or an uploaded PNG, JPG, or WEBP banner.")
        if len(cleaned) > 1_500_000:
            raise serializers.ValidationError("Banner is too large. Use an image below 1 MB.")
        return cleaned

    def scoped_user_ids(self, obj: Campus) -> set:
        from apps.core.models import CampusMembership, StaffProfile, Student

        member_ids = CampusMembership.objects.filter(campus_id=obj.id).values_list("user_id", flat=True)
        staff_ids = StaffProfile.objects.filter(campus_id=obj.id).values_list("user_id", flat=True)
        student_ids = Student.objects.filter(campus_id=obj.id).values_list("user_id", flat=True)
        return set(member_ids) | set(staff_ids) | set(student_ids)

    def get_totalTeachers(self, obj: Campus) -> int:
        return User.objects.filter(pk__in=list(self.scoped_user_ids(obj)), role=UserRole.TEACHER).count()

    def get_totalStaff(self, obj: Campus) -> int:
        return (
            User.objects.filter(pk__in=list(self.scoped_user_ids(obj)))
            .exclude(role__in=[UserRole.STUDENT, UserRole.SUPER_ADMIN])
            .count()
        )

    def get_schoolAdmins(self, obj: Campus) -> int:
        return User.objects.filter(pk__in=list(self.scoped_user_ids(obj)), role=UserRole.SCHOOL_ADMIN).count()

    def get_databaseConnectionStatus(self, obj: Campus) -> dict:
        request = self.context.get("request")
        if request and getattr(request.user, "role", None) != UserRole.SUPER_ADMIN:
            return {}
        return school_connection_status(obj)


class SchoolProfileSerializer(SchoolSerializer):
    class Meta(SchoolSerializer.Meta):
        fields = tuple(
            field
            for field in SchoolSerializer.Meta.fields
            if field not in {"databaseName", "tenantId", "databaseConnectionStatus"}
        )


class CampusMembershipSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    user_name = serializers.SerializerMethodField()
    user_role = serializers.CharField(source="user.role", read_only=True)

    class Meta:
        model = CampusMembership
        fields = (
            "id",
            "campus",
            "campus_name",
            "user",
            "user_name",
            "user_role",
            "role",
            "is_primary",
            "can_manage_users",
            "can_configure_attendance",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def get_user_name(self, obj: CampusMembership) -> str:
        return (obj.user.get_full_name() or obj.user.username) if obj.user else ""

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        user = attrs.get("user", getattr(self.instance, "user", None))
        if user and user.role == UserRole.SUPER_ADMIN:
            raise serializers.ValidationError({"user": "Super Admin accounts are global and cannot be assigned to a school."})
        if user and campus:
            existing = CampusMembership.objects.filter(user_id=user.pk).exclude(pk=getattr(self.instance, "pk", None))
            if existing.exclude(campus=campus).exists() or (user.school_id and user.school_id != campus.id):
                raise serializers.ValidationError({"campus": "Every user can belong to only one school."})
        return attrs


class AttendanceDeviceSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    configured_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceDevice
        fields = (
            "id",
            "campus",
            "campus_name",
            "name",
            "device_code",
            "device_type",
            "location",
            "provider",
            "status",
            "is_enabled_for_students",
            "is_enabled_for_staff",
            "server_required",
            "use_domain_name",
            "domain_name",
            "server_ip",
            "server_port",
            "heartbeat_seconds",
            "server_approval_required",
            "device_numeric_id",
            "local_port",
            "baud_rate",
            "rs485_function",
            "last_seen_at",
            "configured_by",
            "configured_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("configured_by", "created_at", "updated_at")

    def get_configured_by_name(self, obj: AttendanceDevice) -> str:
        if not obj.configured_by:
            return ""
        return (obj.configured_by.get_full_name() or obj.configured_by.username) if obj.configured_by else ""

    def validate(self, attrs):
        instance = self.instance
        default_domain_name = AttendanceDevice._fields["domain_name"].default
        default_server_ip = AttendanceDevice._fields["server_ip"].default
        server_required = attrs.get("server_required", getattr(instance, "server_required", True))
        use_domain_name = attrs.get("use_domain_name", getattr(instance, "use_domain_name", True))
        domain_name = attrs.get("domain_name", getattr(instance, "domain_name", default_domain_name)).strip()
        server_ip = attrs.get("server_ip", getattr(instance, "server_ip", default_server_ip)).strip()

        if server_required and use_domain_name and not domain_name:
            raise serializers.ValidationError({"domain_name": "Domain name is required when domain mode is enabled."})
        if server_required and not use_domain_name and not server_ip:
            raise serializers.ValidationError({"server_ip": "Server IP is required when domain mode is disabled."})
        attrs["domain_name"] = domain_name
        attrs["server_ip"] = server_ip
        return attrs


class AcademicSessionSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = AcademicSession
        fields = (
            "id",
            "campus",
            "campus_name",
            "name",
            "start_date",
            "end_date",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")


class ClassSectionSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    class_teacher_name = serializers.SerializerMethodField()
    label = serializers.SerializerMethodField()

    class Meta:
        model = ClassSection
        fields = (
            "id",
            "campus",
            "campus_name",
            "session",
            "grade_name",
            "section_name",
            "label",
            "class_teacher",
            "class_teacher_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def get_label(self, obj: ClassSection) -> str:
        return f"{obj.grade_name} - {obj.section_name}"

    def get_class_teacher_name(self, obj: ClassSection) -> str:
        if not obj.class_teacher:
            return ""
        return (obj.class_teacher.get_full_name() or obj.class_teacher.username) if obj.class_teacher else ""

    def validate(self, attrs):
        session = attrs.get("session", getattr(self.instance, "session", None))
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        if session and campus and session.campus_id != campus.id:
            raise serializers.ValidationError({"session": "Session must belong to the selected campus."})
        return attrs


class TeacherSubjectAllocationSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    section_label = serializers.SerializerMethodField()
    teacher_name = serializers.SerializerMethodField()

    class Meta:
        model = TeacherSubjectAllocation
        fields = (
            "id",
            "campus",
            "campus_name",
            "section",
            "section_label",
            "teacher",
            "teacher_name",
            "subject",
            "weekly_periods",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def get_section_label(self, obj: TeacherSubjectAllocation) -> str:
        return f"{obj.section.grade_name} - {obj.section.section_name}"

    def get_teacher_name(self, obj: TeacherSubjectAllocation) -> str:
        return (obj.teacher.get_full_name() or obj.teacher.username) if obj.teacher else ""

    def validate_subject(self, value: str) -> str:
        subject = (value or "").strip()
        if not subject:
            raise serializers.ValidationError("Subject is required.")
        return subject

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        section = attrs.get("section", getattr(self.instance, "section", None))
        teacher = attrs.get("teacher", getattr(self.instance, "teacher", None))
        if campus and section and section.campus_id != campus.id:
            raise serializers.ValidationError({"section": "Section must belong to the selected campus."})
        if teacher and teacher.role != UserRole.TEACHER:
            raise serializers.ValidationError({"teacher": "Select a user with the teacher role."})
        return attrs


class SubjectSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = Subject
        fields = (
            "id",
            "campus",
            "campus_name",
            "name",
            "code",
            "grade_name",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def validate_name(self, value: str) -> str:
        name = (value or "").strip()
        if not name:
            raise serializers.ValidationError("Subject name is required.")
        return name

    def validate_code(self, value: str) -> str:
        return (value or "").strip().upper()


class StudentSerializer(DocumentSerializer):
    full_name = serializers.ReadOnlyField()
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    section_label = serializers.SerializerMethodField()
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = (
            "id",
            "campus",
            "campus_name",
            "section",
            "section_label",
            "user",
            "user_name",
            "admission_number",
            "first_name",
            "last_name",
            "full_name",
            "date_of_birth",
            "photo_url",
            "father_name",
            "mother_name",
            "contact_email",
            "phone_number",
            "alternate_phone_number",
            "address",
            "blood_group",
            "medical_notes",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def get_section_label(self, obj: Student) -> str:
        return f"{obj.section.grade_name} - {obj.section.section_name}"

    def get_user_name(self, obj: Student) -> str:
        if not obj.user:
            return ""
        return (obj.user.get_full_name() or obj.user.username) if obj.user else ""

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        section = attrs.get("section", getattr(self.instance, "section", None))
        user = attrs.get("user", getattr(self.instance, "user", None))
        if campus and section and section.campus_id != campus.id:
            raise serializers.ValidationError({"section": "Section must belong to the selected campus."})
        if user and user.role != UserRole.STUDENT:
            raise serializers.ValidationError({"user": "Linked login user must have the student role."})
        return attrs


class AttendanceRecordSerializer(DocumentSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    section_label = serializers.SerializerMethodField()
    device_name = serializers.CharField(source="device.name", read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = (
            "id",
            "student",
            "student_name",
            "section",
            "section_label",
            "date",
            "subject",
            "status",
            "marked_by",
            "capture_method",
            "device",
            "device_name",
            "source_reference",
            "confidence_score",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("marked_by", "created_at", "updated_at")

    def get_section_label(self, obj: AttendanceRecord) -> str:
        return f"{obj.section.grade_name} - {obj.section.section_name}"

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        student = attrs.get("student", getattr(self.instance, "student", None))
        section = attrs.get("section", getattr(self.instance, "section", None))
        attendance_date = attrs.get("date", getattr(self.instance, "date", None))
        if attendance_date:
            ensure_attendance_date_is_editable(attendance_date)
        if student and section and student.section_id != section.id:
            raise serializers.ValidationError({"section": "Attendance section must match the student's section."})
        subject = (attrs.get("subject", getattr(self.instance, "subject", "")) or "").strip()
        attrs["subject"] = subject
        if user and getattr(user, "role", None) == UserRole.TEACHER and section:
            is_class_teacher = section.class_teacher_id == user.id
            has_subject_access = bool(subject) and TeacherSubjectAllocation.objects.filter(
                section=section,
                teacher=user,
                subject__iexact=subject,
                is_active=True,
            ).exists()
            if not (is_class_teacher or has_subject_access):
                raise serializers.ValidationError(
                    {"section": "Teachers can mark attendance only for assigned class sections or allotted subjects."}
                )
        device = attrs.get("device", getattr(self.instance, "device", None))
        if device and student and device.campus_id != student.campus_id:
            raise serializers.ValidationError({"device": "Attendance device must belong to the student's campus."})
        return attrs


class StaffAttendanceRecordSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    staff_name = serializers.SerializerMethodField()
    staff_role = serializers.CharField(source="staff_user.role", read_only=True)
    marked_by_name = serializers.SerializerMethodField()
    device_name = serializers.CharField(source="device.name", read_only=True)

    class Meta:
        model = StaffAttendanceRecord
        fields = (
            "id",
            "campus",
            "campus_name",
            "staff_user",
            "staff_name",
            "staff_role",
            "date",
            "clock_in",
            "clock_out",
            "status",
            "capture_method",
            "device",
            "device_name",
            "marked_by",
            "marked_by_name",
            "source_reference",
            "confidence_score",
            "notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("marked_by", "created_at", "updated_at")

    def get_staff_name(self, obj: StaffAttendanceRecord) -> str:
        return (obj.staff_user.get_full_name() or obj.staff_user.username) if obj.staff_user else ""

    def get_marked_by_name(self, obj: StaffAttendanceRecord) -> str:
        if not obj.marked_by:
            return ""
        return (obj.marked_by.get_full_name() or obj.marked_by.username) if obj.marked_by else ""

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        staff_user = attrs.get("staff_user", getattr(self.instance, "staff_user", None))
        device = attrs.get("device", getattr(self.instance, "device", None))
        attendance_date = attrs.get("date", getattr(self.instance, "date", None))
        if attendance_date:
            ensure_attendance_date_is_editable(attendance_date)
        if staff_user and staff_user.role == UserRole.STUDENT:
            raise serializers.ValidationError({"staff_user": "Staff attendance cannot be recorded for student users."})
        if device and campus and device.campus_id != campus.id:
            raise serializers.ValidationError({"device": "Attendance device must belong to the selected campus."})
        return attrs


class StaffProfileSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    user_name = serializers.SerializerMethodField()
    user_role = serializers.CharField(source="user.role", read_only=True)

    class Meta:
        model = StaffProfile
        fields = (
            "id",
            "campus",
            "campus_name",
            "user",
            "user_name",
            "user_role",
            "employee_code",
            "designation",
            "department",
            "photo_url",
            "employment_type",
            "joining_date",
            "qualification",
            "emergency_contact",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def get_user_name(self, obj: StaffProfile) -> str:
        return (obj.user.get_full_name() or obj.user.username) if obj.user else ""

    def validate(self, attrs):
        user = attrs.get("user", getattr(self.instance, "user", None))
        if user and user.role == UserRole.STUDENT:
            raise serializers.ValidationError({"user": "Staff profile users must be administrators or teachers."})
        return attrs


class TimetableSlotSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    section_label = serializers.SerializerMethodField()
    teacher_name = serializers.SerializerMethodField()
    day_name = serializers.CharField(source="get_day_of_week_display", read_only=True)

    class Meta:
        model = TimetableSlot
        fields = (
            "id",
            "campus",
            "campus_name",
            "section",
            "section_label",
            "teacher",
            "teacher_name",
            "subject",
            "day_of_week",
            "day_name",
            "start_time",
            "end_time",
            "room",
            "effective_from",
            "effective_to",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def get_section_label(self, obj: TimetableSlot) -> str:
        return f"{obj.section.grade_name} - {obj.section.section_name}"

    def get_teacher_name(self, obj: TimetableSlot) -> str:
        if not obj.teacher:
            return ""
        return (obj.teacher.get_full_name() or obj.teacher.username) if obj.teacher else ""

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        section = attrs.get("section", getattr(self.instance, "section", None))
        teacher = attrs.get("teacher", getattr(self.instance, "teacher", None))
        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        effective_from = attrs.get("effective_from", getattr(self.instance, "effective_from", None))
        effective_to = attrs.get("effective_to", getattr(self.instance, "effective_to", None))
        subject = (attrs.get("subject", getattr(self.instance, "subject", "")) or "").strip()
        attrs["subject"] = subject
        if campus and section and section.campus_id != campus.id:
            raise serializers.ValidationError({"section": "Section must belong to the selected campus."})
        if teacher and teacher.role != UserRole.TEACHER:
            raise serializers.ValidationError({"teacher": "Timetable teacher must be a teacher user."})
        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError({"end_time": "End time must be after start time."})
        if effective_from and effective_to and effective_to < effective_from:
            raise serializers.ValidationError({"effective_to": "End date must be on or after the effective from date."})
        if not subject:
            raise serializers.ValidationError({"subject": "Subject is required."})
        return attrs


class ExamTypeSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = ExamType
        fields = (
            "id",
            "campus",
            "campus_name",
            "name",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def validate_name(self, value: str) -> str:
        name = (value or "").strip()
        if not name:
            raise serializers.ValidationError("Exam type name is required.")
        return name


class ExamSubjectSetupSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    exam_type_name = serializers.CharField(source="exam_type.name", read_only=True)
    section_label = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source="subject.name", read_only=True)

    class Meta:
        model = ExamSubjectSetup
        fields = (
            "id",
            "campus",
            "campus_name",
            "exam_type",
            "exam_type_name",
            "section",
            "section_label",
            "subject",
            "subject_name",
            "max_marks",
            "pass_marks",
            "weightage",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def get_section_label(self, obj: ExamSubjectSetup) -> str:
        return f"{obj.section.grade_name} - {obj.section.section_name}"

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        exam_type = attrs.get("exam_type", getattr(self.instance, "exam_type", None))
        section = attrs.get("section", getattr(self.instance, "section", None))
        subject = attrs.get("subject", getattr(self.instance, "subject", None))
        max_marks = attrs.get("max_marks", getattr(self.instance, "max_marks", None))
        pass_marks = attrs.get("pass_marks", getattr(self.instance, "pass_marks", None))
        weightage = attrs.get("weightage", getattr(self.instance, "weightage", None))
        if campus and exam_type and exam_type.campus_id != campus.id:
            raise serializers.ValidationError({"exam_type": "Exam type must belong to the selected campus."})
        if campus and section and section.campus_id != campus.id:
            raise serializers.ValidationError({"section": "Section must belong to the selected campus."})
        if campus and subject and subject.campus_id != campus.id:
            raise serializers.ValidationError({"subject": "Subject must belong to the selected campus."})
        if max_marks is not None and max_marks <= 0:
            raise serializers.ValidationError({"max_marks": "Max marks must be greater than zero."})
        if pass_marks is not None and max_marks is not None and (pass_marks < 0 or pass_marks > max_marks):
            raise serializers.ValidationError({"pass_marks": "Pass marks must be between zero and max marks."})
        if weightage is not None and (weightage <= 0 or weightage > 100):
            raise serializers.ValidationError({"weightage": "Weightage must be between 0 and 100."})
        return attrs


class ExamScheduleSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    exam_type_name = serializers.CharField(source="exam_type.name", read_only=True)
    section_label = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ExamSchedule
        fields = (
            "id",
            "campus",
            "campus_name",
            "exam_type",
            "exam_type_name",
            "section",
            "section_label",
            "subject",
            "subject_name",
            "title",
            "exam_date",
            "start_time",
            "end_time",
            "max_marks",
            "venue",
            "instructions",
            "status",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_section_label(self, obj: ExamSchedule) -> str:
        return f"{obj.section.grade_name} - {obj.section.section_name}"

    def get_created_by_name(self, obj: ExamSchedule) -> str:
        if not obj.created_by:
            return ""
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else ""

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        exam_type = attrs.get("exam_type", getattr(self.instance, "exam_type", None))
        section = attrs.get("section", getattr(self.instance, "section", None))
        subject = attrs.get("subject", getattr(self.instance, "subject", None))
        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        max_marks = attrs.get("max_marks", getattr(self.instance, "max_marks", None))
        title = (attrs.get("title", getattr(self.instance, "title", "")) or "").strip()
        attrs["title"] = title
        if campus and exam_type and exam_type.campus_id != campus.id:
            raise serializers.ValidationError({"exam_type": "Exam type must belong to the selected campus."})
        if campus and section and section.campus_id != campus.id:
            raise serializers.ValidationError({"section": "Section must belong to the selected campus."})
        if campus and subject and subject.campus_id != campus.id:
            raise serializers.ValidationError({"subject": "Subject must belong to the selected campus."})
        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError({"end_time": "End time must be after start time."})
        if max_marks is not None and max_marks <= 0:
            raise serializers.ValidationError({"max_marks": "Max marks must be greater than zero."})
        if not title:
            raise serializers.ValidationError({"title": "Exam schedule title is required."})
        return attrs


class LibraryBookSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = LibraryBook
        fields = (
            "id",
            "campus",
            "campus_name",
            "accession_number",
            "title",
            "author",
            "isbn",
            "category",
            "total_copies",
            "available_copies",
            "shelf_location",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def validate(self, attrs):
        total = attrs.get("total_copies", getattr(self.instance, "total_copies", 1))
        available = attrs.get("available_copies", getattr(self.instance, "available_copies", 1))
        if available > total:
            raise serializers.ValidationError({"available_copies": "Available copies cannot exceed total copies."})
        return attrs


class LibraryLoanSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    book_title = serializers.CharField(source="book.title", read_only=True)
    borrower_name = serializers.SerializerMethodField()

    class Meta:
        model = LibraryLoan
        fields = (
            "id",
            "campus",
            "campus_name",
            "book",
            "book_title",
            "student",
            "staff_user",
            "borrower_name",
            "issued_on",
            "due_on",
            "returned_on",
            "fine_amount",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def get_borrower_name(self, obj: LibraryLoan) -> str:
        if obj.student_id:
            return obj.student.full_name
        if obj.staff_user_id:
            return (obj.staff_user.get_full_name() or obj.staff_user.username) if obj.staff_user else ""
        return ""

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        book = attrs.get("book", getattr(self.instance, "book", None))
        student = attrs.get("student", getattr(self.instance, "student", None))
        staff_user = attrs.get("staff_user", getattr(self.instance, "staff_user", None))
        issued_on = attrs.get("issued_on", getattr(self.instance, "issued_on", None))
        due_on = attrs.get("due_on", getattr(self.instance, "due_on", None))
        returned_on = attrs.get("returned_on", getattr(self.instance, "returned_on", None))
        fine_amount = attrs.get("fine_amount", getattr(self.instance, "fine_amount", 0))
        if bool(student) == bool(staff_user):
            raise serializers.ValidationError({"student": "Select exactly one borrower: student or staff user."})
        if campus and book and book.campus_id != campus.id:
            raise serializers.ValidationError({"book": "Book must belong to the selected campus."})
        if campus and student and student.campus_id != campus.id:
            raise serializers.ValidationError({"student": "Student must belong to the selected campus."})
        if staff_user and staff_user.role == UserRole.STUDENT:
            raise serializers.ValidationError({"staff_user": "Use the student borrower field for student users."})
        if issued_on and due_on and due_on < issued_on:
            raise serializers.ValidationError({"due_on": "Due date must be on or after issue date."})
        if issued_on and returned_on and returned_on < issued_on:
            raise serializers.ValidationError({"returned_on": "Return date must be on or after issue date."})
        if fine_amount < 0:
            raise serializers.ValidationError({"fine_amount": "Fine amount cannot be negative."})
        return attrs


class TransportRouteSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = TransportRoute
        fields = (
            "id",
            "campus",
            "campus_name",
            "name",
            "route_code",
            "start_point",
            "end_point",
            "stops",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")


class TransportVehicleSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    route_name = serializers.CharField(source="route.name", read_only=True)

    class Meta:
        model = TransportVehicle
        fields = (
            "id",
            "campus",
            "campus_name",
            "route",
            "route_name",
            "vehicle_number",
            "driver_name",
            "driver_phone",
            "capacity",
            "gps_device_id",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        route = attrs.get("route", getattr(self.instance, "route", None))
        if campus and route and route.campus_id != campus.id:
            raise serializers.ValidationError({"route": "Route must belong to the selected campus."})
        return attrs


class StudentTransportAssignmentSerializer(DocumentSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    route_name = serializers.CharField(source="route.name", read_only=True)
    vehicle_number = serializers.CharField(source="vehicle.vehicle_number", read_only=True)

    class Meta:
        model = StudentTransportAssignment
        fields = (
            "id",
            "student",
            "student_name",
            "route",
            "route_name",
            "vehicle",
            "vehicle_number",
            "pickup_stop",
            "drop_stop",
            "start_date",
            "end_date",
            "fee_amount",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def validate(self, attrs):
        student = attrs.get("student", getattr(self.instance, "student", None))
        route = attrs.get("route", getattr(self.instance, "route", None))
        vehicle = attrs.get("vehicle", getattr(self.instance, "vehicle", None))
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        fee_amount = attrs.get("fee_amount", getattr(self.instance, "fee_amount", 0))
        if student and route and student.campus_id != route.campus_id:
            raise serializers.ValidationError({"route": "Route must belong to the student's campus."})
        if vehicle and route and vehicle.campus_id != route.campus_id:
            raise serializers.ValidationError({"vehicle": "Vehicle must belong to the route campus."})
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({"end_date": "End date must be on or after start date."})
        if fee_amount < 0:
            raise serializers.ValidationError({"fee_amount": "Transport fee cannot be negative."})
        return attrs


class HostelRoomSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = HostelRoom
        fields = (
            "id",
            "campus",
            "campus_name",
            "hostel_name",
            "room_number",
            "floor",
            "capacity",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")


class HostelAllocationSerializer(DocumentSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    room_label = serializers.SerializerMethodField()

    class Meta:
        model = HostelAllocation
        fields = (
            "id",
            "student",
            "student_name",
            "room",
            "room_label",
            "bed_number",
            "start_date",
            "end_date",
            "fee_amount",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def get_room_label(self, obj: HostelAllocation) -> str:
        return f"{obj.room.hostel_name} {obj.room.room_number}"

    def validate(self, attrs):
        student = attrs.get("student", getattr(self.instance, "student", None))
        room = attrs.get("room", getattr(self.instance, "room", None))
        start_date = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        fee_amount = attrs.get("fee_amount", getattr(self.instance, "fee_amount", 0))
        if student and room and student.campus_id != room.campus_id:
            raise serializers.ValidationError({"room": "Hostel room must belong to the student's campus."})
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({"end_date": "End date must be on or after start date."})
        if fee_amount < 0:
            raise serializers.ValidationError({"fee_amount": "Hostel fee cannot be negative."})
        return attrs


class AssignedWorkSerializer(DocumentSerializer):
    section_label = serializers.SerializerMethodField()
    assigned_by_name = serializers.SerializerMethodField()
    submission_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = AssignedWork
        fields = (
            "id",
            "section",
            "section_label",
            "assigned_by",
            "assigned_by_name",
            "title",
            "subject",
            "description",
            "due_date",
            "status",
            "file_url",
            "file_name",
            "file_content_type",
            "published_on",
            "submission_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("assigned_by", "file_url", "file_name", "file_content_type", "submission_count", "created_at", "updated_at")

    def get_section_label(self, obj: AssignedWork) -> str:
        return f"{obj.section.grade_name} - {obj.section.section_name}"

    def get_assigned_by_name(self, obj: AssignedWork) -> str:
        if not obj.assigned_by:
            return ""
        return (obj.assigned_by.get_full_name() or obj.assigned_by.username) if obj.assigned_by else ""

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        section = attrs.get("section", getattr(self.instance, "section", None))
        subject = (attrs.get("subject", getattr(self.instance, "subject", "")) or "").strip()
        attrs["subject"] = subject
        if user and getattr(user, "role", None) == UserRole.TEACHER and section:
            is_class_teacher = section.class_teacher_id == user.id
            has_subject_access = bool(subject) and TeacherSubjectAllocation.objects.filter(
                section=section,
                teacher=user,
                subject__iexact=subject,
                is_active=True,
            ).exists()
            if not (is_class_teacher or has_subject_access):
                raise serializers.ValidationError(
                    {"section": "Teachers can assign work only for assigned sections or allotted subjects."}
                )
        return attrs


class AssignmentSubmissionSerializer(DocumentSerializer):
    assignment_title = serializers.CharField(source="assignment.title", read_only=True)
    assignment_subject = serializers.CharField(source="assignment.subject", read_only=True)
    section_label = serializers.SerializerMethodField()
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    admission_number = serializers.CharField(source="student.admission_number", read_only=True)
    submitted_by_name = serializers.SerializerMethodField()
    checked_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AssignmentSubmission
        fields = (
            "id",
            "assignment",
            "assignment_title",
            "assignment_subject",
            "section_label",
            "student",
            "student_name",
            "admission_number",
            "submitted_by",
            "submitted_by_name",
            "file_url",
            "file_name",
            "file_content_type",
            "notes",
            "status",
            "remarks",
            "checked_by",
            "checked_by_name",
            "checked_at",
            "submitted_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "submitted_by",
            "file_url",
            "file_name",
            "file_content_type",
            "status",
            "remarks",
            "checked_by",
            "checked_at",
            "created_at",
            "updated_at",
        )

    def get_section_label(self, obj: AssignmentSubmission) -> str:
        return f"{obj.assignment.section.grade_name} - {obj.assignment.section.section_name}"

    def get_submitted_by_name(self, obj: AssignmentSubmission) -> str:
        if not obj.submitted_by:
            return ""
        return (obj.submitted_by.get_full_name() or obj.submitted_by.username) if obj.submitted_by else ""

    def get_checked_by_name(self, obj: AssignmentSubmission) -> str:
        if not obj.checked_by:
            return ""
        return (obj.checked_by.get_full_name() or obj.checked_by.username) if obj.checked_by else ""

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        assignment = attrs.get("assignment", getattr(self.instance, "assignment", None))
        student = attrs.get("student", getattr(self.instance, "student", None))
        if assignment and student and assignment.section_id != student.section_id:
            raise serializers.ValidationError({"student": "Submission student must belong to the assignment section."})
        if user and getattr(user, "role", None) == UserRole.STUDENT and student and student.user_id != user.id:
            raise serializers.ValidationError({"student": "Students can submit only their own assignments."})
        return attrs


class LearningResourceSerializer(DocumentSerializer):
    section_label = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LearningResource
        fields = (
            "id",
            "section",
            "section_label",
            "uploaded_by",
            "uploaded_by_name",
            "title",
            "subject",
            "resource_type",
            "description",
            "file_url",
            "file_name",
            "file_content_type",
            "published_on",
            "is_published",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("uploaded_by", "file_url", "file_name", "file_content_type", "created_at", "updated_at")

    def get_section_label(self, obj: LearningResource) -> str:
        return f"{obj.section.grade_name} - {obj.section.section_name}"

    def get_uploaded_by_name(self, obj: LearningResource) -> str:
        if not obj.uploaded_by:
            return ""
        return (obj.uploaded_by.get_full_name() or obj.uploaded_by.username) if obj.uploaded_by else ""

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        section = attrs.get("section", getattr(self.instance, "section", None))
        subject = (attrs.get("subject", getattr(self.instance, "subject", "")) or "").strip()
        attrs["subject"] = subject
        if user and getattr(user, "role", None) == UserRole.TEACHER and section:
            is_class_teacher = section.class_teacher_id == user.id
            has_subject_access = bool(subject) and TeacherSubjectAllocation.objects.filter(
                section=section,
                teacher=user,
                subject__iexact=subject,
                is_active=True,
            ).exists()
            if not (is_class_teacher or has_subject_access):
                raise serializers.ValidationError(
                    {"section": "Teachers can upload resources only for assigned sections or allotted subjects."}
                )
        return attrs


class ResultRecordSerializer(DocumentSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    section_label = serializers.SerializerMethodField()
    recorded_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    percentage = serializers.SerializerMethodField()

    class Meta:
        model = ResultRecord
        fields = (
            "id",
            "student",
            "student_name",
            "section_label",
            "recorded_by",
            "recorded_by_name",
            "exam_name",
            "subject",
            "score",
            "max_score",
            "percentage",
            "grade",
            "remarks",
            "published_on",
            "is_published",
            "review_status",
            "marks_file_url",
            "marks_file_name",
            "marks_file_content_type",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "review_note",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "recorded_by",
            "marks_file_url",
            "marks_file_name",
            "marks_file_content_type",
            "reviewed_by",
            "reviewed_at",
            "review_note",
            "created_at",
            "updated_at",
        )

    def get_section_label(self, obj: ResultRecord) -> str:
        return f"{obj.student.section.grade_name} - {obj.student.section.section_name}"

    def get_recorded_by_name(self, obj: ResultRecord) -> str:
        if not obj.recorded_by:
            return ""
        return (obj.recorded_by.get_full_name() or obj.recorded_by.username) if obj.recorded_by else ""

    def get_reviewed_by_name(self, obj: ResultRecord) -> str:
        if not obj.reviewed_by:
            return ""
        return (obj.reviewed_by.get_full_name() or obj.reviewed_by.username) if obj.reviewed_by else ""

    def get_percentage(self, obj: ResultRecord) -> str:
        if not obj.max_score:
            return "0"
        return str(round((obj.score / obj.max_score) * 100, 2))

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        student = attrs.get("student", getattr(self.instance, "student", None))
        score = attrs.get("score", getattr(self.instance, "score", None))
        max_score = attrs.get("max_score", getattr(self.instance, "max_score", None))
        subject = (attrs.get("subject", getattr(self.instance, "subject", "")) or "").strip()
        attrs["subject"] = subject
        if user and getattr(user, "role", None) == UserRole.TEACHER and student:
            is_class_teacher = student.section.class_teacher_id == user.id
            has_subject_access = bool(subject) and TeacherSubjectAllocation.objects.filter(
                section=student.section,
                teacher=user,
                subject__iexact=subject,
                is_active=True,
            ).exists()
            if not (is_class_teacher or has_subject_access):
                raise serializers.ValidationError(
                    {"student": "Teachers can record results only for assigned sections or allotted subjects."}
                )
        if score is not None and score < 0:
            raise serializers.ValidationError({"score": "Score cannot be negative."})
        if max_score is not None and max_score <= 0:
            raise serializers.ValidationError({"max_score": "Max score must be greater than zero."})
        if score is not None and max_score is not None and score > max_score:
            raise serializers.ValidationError({"score": "Score cannot exceed max score."})
        return attrs


class AdmitCardSerializer(DocumentSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    admission_number = serializers.CharField(source="student.admission_number", read_only=True)
    section_label = serializers.SerializerMethodField()
    issued_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AdmitCard
        fields = (
            "id",
            "student",
            "student_name",
            "admission_number",
            "section_label",
            "issued_by",
            "issued_by_name",
            "exam_name",
            "roll_number",
            "exam_date",
            "reporting_time",
            "venue",
            "instructions",
            "status",
            "issued_on",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("issued_by", "created_at", "updated_at")

    def get_section_label(self, obj: AdmitCard) -> str:
        return f"{obj.student.section.grade_name} - {obj.student.section.section_name}"

    def get_issued_by_name(self, obj: AdmitCard) -> str:
        if not obj.issued_by:
            return ""
        return (obj.issued_by.get_full_name() or obj.issued_by.username) if obj.issued_by else ""

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        student = attrs.get("student", getattr(self.instance, "student", None))
        if user and getattr(user, "role", None) == UserRole.TEACHER and student and student.section.class_teacher_id != user.id:
            raise serializers.ValidationError({"student": "Teachers can issue admit cards only for assigned sections."})
        return attrs


class FeeStructureSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    section_label = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FeeStructure
        fields = (
            "id",
            "campus",
            "campus_name",
            "section",
            "section_label",
            "title",
            "description",
            "amount",
            "late_fee",
            "discount_amount",
            "due_day",
            "is_active",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_section_label(self, obj: FeeStructure) -> str:
        if not obj.section:
            return "All sections"
        return f"{obj.section.grade_name} - {obj.section.section_name}"

    def get_created_by_name(self, obj: FeeStructure) -> str:
        if not obj.created_by:
            return ""
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else ""

    def validate(self, attrs):
        amount = attrs.get("amount", getattr(self.instance, "amount", 0))
        late_fee = attrs.get("late_fee", getattr(self.instance, "late_fee", 0))
        discount_amount = attrs.get("discount_amount", getattr(self.instance, "discount_amount", 0))
        if amount is not None and amount <= 0:
            raise serializers.ValidationError({"amount": "Fee structure amount must be greater than zero."})
        if late_fee is not None and late_fee < 0:
            raise serializers.ValidationError({"late_fee": "Late fee cannot be negative."})
        if discount_amount is not None and discount_amount < 0:
            raise serializers.ValidationError({"discount_amount": "Discount cannot be negative."})
        if amount is not None and late_fee is not None and discount_amount is not None and discount_amount > amount + late_fee:
            raise serializers.ValidationError({"discount_amount": "Discount cannot exceed payable fee."})
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        section = attrs.get("section", getattr(self.instance, "section", None))
        if campus and section and section.campus_id != campus.id:
            raise serializers.ValidationError({"section": "Section must belong to the selected campus."})
        return attrs


class PaymentGatewayConfigSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    masked_key_id = serializers.SerializerMethodField()
    key_secret = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)
    webhook_secret = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PaymentGatewayConfig
        fields = (
            "id",
            "campus",
            "campus_name",
            "provider",
            "key_id",
            "masked_key_id",
            "key_secret",
            "webhook_secret",
            "upi_id",
            "allowed_methods",
            "is_active",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_masked_key_id(self, obj: PaymentGatewayConfig) -> str:
        if not obj.key_id:
            return ""
        return f"{obj.key_id[:4]}...{obj.key_id[-4:]}" if len(obj.key_id) > 8 else "****"

    def get_created_by_name(self, obj: PaymentGatewayConfig) -> str:
        if not obj.created_by:
            return ""
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else ""

    def create(self, validated_data):
        key_secret = validated_data.pop("key_secret", "")
        webhook_secret = validated_data.pop("webhook_secret", "")
        instance = super().create(validated_data)
        changed = []
        if key_secret:
            instance.set_key_secret(key_secret)
            changed.append("key_secret_encrypted")
        if webhook_secret:
            instance.set_webhook_secret(webhook_secret)
            changed.append("webhook_secret_encrypted")
        if changed:
            instance.save()
        return instance

    def update(self, instance, validated_data):
        key_secret = validated_data.pop("key_secret", "")
        webhook_secret = validated_data.pop("webhook_secret", "")
        instance = super().update(instance, validated_data)
        changed = []
        if key_secret:
            instance.set_key_secret(key_secret)
            changed.append("key_secret_encrypted")
        if webhook_secret:
            instance.set_webhook_secret(webhook_secret)
            changed.append("webhook_secret_encrypted")
        if changed:
            instance.save()
        return instance


class FeeAssignmentSerializer(DocumentSerializer):
    fee_structure_title = serializers.CharField(source="fee_structure.title", read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    section_label = serializers.SerializerMethodField()
    amount_paid = serializers.SerializerMethodField()
    outstanding_amount = serializers.SerializerMethodField()
    payable_amount = serializers.SerializerMethodField()

    class Meta:
        model = FeeAssignment
        fields = (
            "id",
            "fee_structure",
            "fee_structure_title",
            "student",
            "student_name",
            "section_label",
            "title",
            "amount",
            "discount_amount",
            "late_fee",
            "payable_amount",
            "amount_paid",
            "outstanding_amount",
            "due_date",
            "invoice_number",
            "invoice_generated_at",
            "reminder_count",
            "last_reminder_at",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("status", "invoice_generated_at", "reminder_count", "last_reminder_at")

    def get_section_label(self, obj: FeeAssignment) -> str:
        return f"{obj.student.section.grade_name} - {obj.student.section.section_name}"

    def get_amount_paid(self, obj: FeeAssignment) -> str:
        from apps.core.models import Payment
        paid = Payment.objects.filter(fee_assignment_id=obj.id).aggregate(total=Sum("amount")).get("total") or 0
        return str(paid)

    def get_outstanding_amount(self, obj: FeeAssignment) -> str:
        from apps.core.models import Payment
        paid = Payment.objects.filter(fee_assignment_id=obj.id).aggregate(total=Sum("amount")).get("total") or 0
        return str(max(obj.payable_amount - paid, 0))

    def get_payable_amount(self, obj: FeeAssignment) -> str:
        return str(obj.payable_amount)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Fee amount must be greater than zero.")
        return value

    def validate(self, attrs):
        student = attrs.get("student", getattr(self.instance, "student", None))
        fee_structure = attrs.get("fee_structure", getattr(self.instance, "fee_structure", None))
        if student and fee_structure and fee_structure.campus_id != student.campus_id:
            raise serializers.ValidationError({"fee_structure": "Fee structure must belong to the student's campus."})
        amount = attrs.get("amount", getattr(self.instance, "amount", 0))
        late_fee = attrs.get("late_fee", getattr(self.instance, "late_fee", 0))
        discount_amount = attrs.get("discount_amount", getattr(self.instance, "discount_amount", 0))
        if discount_amount is not None and discount_amount > amount + late_fee:
            raise serializers.ValidationError({"discount_amount": "Discount cannot exceed payable fee."})
        return attrs


class PaymentSerializer(DocumentSerializer):
    campus = serializers.CharField(source="campus_id", read_only=True)
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    fee_title = serializers.SerializerMethodField()
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    outstanding_after_payment = serializers.SerializerMethodField()
    # Django-era field names mapped to Mongo model equivalents.
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, source="amount")
    payment_method = serializers.CharField(source="payment_mode", required=False)
    payment_status = serializers.CharField(source="status", required=False)
    gateway_name = serializers.CharField(source="gateway", required=False, allow_blank=True)

    def get_fee_title(self, obj) -> str:
        fee_assignment = getattr(obj, "fee_assignment", None)
        fee_structure = getattr(fee_assignment, "fee_structure", None) if fee_assignment else None
        return getattr(fee_structure, "title", "") or ""

    class Meta:
        model = Payment
        fields = (
            "id",
            "campus",
            "campus_name",
            "fee_assignment",
            "fee_title",
            "student_name",
            "amount_paid",
            "discount_amount",
            "late_fee",
            "pending_amount",
            "paid_on",
            "payment_method",
            "reference_number",
            "payment_status",
            "gateway_name",
            "gateway_order_id",
            "transaction_id",
            "receipt_number",
            "invoice_number",
            "webhook_verified",
            "paid_at",
            "receipt_pdf_url",
            "outstanding_after_payment",
            "collected_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "campus",
            "pending_amount",
            "receipt_number",
            "invoice_number",
            "webhook_verified",
            "paid_at",
            "receipt_pdf_url",
            "outstanding_after_payment",
            "collected_by",
            "created_at",
            "updated_at",
        )

    def get_outstanding_after_payment(self, obj: Payment) -> str:
        return str(getattr(obj, "pending_amount", None) or Decimal("0"))

    def validate_amount_paid(self, value):
        if value <= 0:
            raise serializers.ValidationError("Payment amount must be greater than zero.")
        return value

    def validate(self, attrs):
        fee_assignment = attrs.get("fee_assignment", getattr(self.instance, "fee_assignment", None))
        amount_paid = attrs.get("amount_paid", getattr(self.instance, "amount_paid", None))
        if fee_assignment and amount_paid:
            existing_total = (
                fee_assignment.payments.exclude(pk=getattr(self.instance, "pk", None))
                .aggregate(total=Sum("amount_paid"))
                .get("total")
                or 0
            )
            if existing_total + amount_paid > fee_assignment.payable_amount:
                raise serializers.ValidationError({"amount_paid": "Payment cannot exceed the fee outstanding amount."})
        return attrs


class PaymentTransactionSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    fee_title = serializers.CharField(source="fee_assignment.title", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PaymentTransaction
        fields = (
            "id",
            "campus",
            "campus_name",
            "student",
            "student_name",
            "fee_assignment",
            "fee_title",
            "payment",
            "provider",
            "method",
            "amount",
            "discount_amount",
            "late_fee",
            "pending_amount",
            "currency",
            "status",
            "gateway_name",
            "gateway_order_id",
            "gateway_payment_id",
            "gateway_signature",
            "transaction_id",
            "receipt_number",
            "invoice_number",
            "webhook_verified",
            "paid_at",
            "raw_payload",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "payment",
            "gateway_order_id",
            "receipt_number",
            "invoice_number",
            "webhook_verified",
            "paid_at",
            "created_by",
            "created_at",
            "updated_at",
        )

    def get_created_by_name(self, obj: PaymentTransaction) -> str:
        if not obj.created_by:
            return ""
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else ""

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        student = attrs.get("student", getattr(self.instance, "student", None))
        fee_assignment = attrs.get("fee_assignment", getattr(self.instance, "fee_assignment", None))
        amount = attrs.get("amount", getattr(self.instance, "amount", None))
        if amount is not None and amount <= 0:
            raise serializers.ValidationError({"amount": "Transaction amount must be greater than zero."})
        if campus and student and student.campus_id != campus.id:
            raise serializers.ValidationError({"student": "Student must belong to the selected campus."})
        if campus and fee_assignment and fee_assignment.student.campus_id != campus.id:
            raise serializers.ValidationError({"fee_assignment": "Fee assignment must belong to the selected campus."})
        return attrs


class SalarySetupSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    staff_name = serializers.SerializerMethodField()
    staff_role = serializers.CharField(source="staff_user.role", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SalarySetup
        fields = (
            "id",
            "campus",
            "campus_name",
            "staff_user",
            "staff_name",
            "staff_role",
            "gross_salary",
            "default_deductions",
            "default_bonus",
            "is_active",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_staff_name(self, obj: SalarySetup) -> str:
        return (obj.staff_user.get_full_name() or obj.staff_user.username) if obj.staff_user else ""

    def get_created_by_name(self, obj: SalarySetup) -> str:
        if not obj.created_by:
            return ""
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else ""

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        staff_user = attrs.get("staff_user", getattr(self.instance, "staff_user", None))
        if staff_user and staff_user.role == UserRole.STUDENT:
            raise serializers.ValidationError({"staff_user": "Salary setup cannot be created for student users."})
        if campus and staff_user and getattr(staff_user, "school_id", None) and staff_user.school_id != campus.id:
            raise serializers.ValidationError({"staff_user": "Staff user must belong to the selected campus."})
        for field in ("gross_salary", "default_deductions", "default_bonus"):
            value = attrs.get(field, getattr(self.instance, field, 0))
            if value is not None and value < 0:
                raise serializers.ValidationError({field: "Value cannot be negative."})
        if attrs.get("gross_salary", getattr(self.instance, "gross_salary", 0)) <= 0:
            raise serializers.ValidationError({"gross_salary": "Gross salary must be greater than zero."})
        return attrs


class SalaryRecordSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    staff_name = serializers.SerializerMethodField()
    staff_role = serializers.CharField(source="staff_user.role", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SalaryRecord
        fields = (
            "id",
            "campus",
            "campus_name",
            "salary_setup",
            "staff_user",
            "staff_name",
            "staff_role",
            "month",
            "year",
            "present_days",
            "absent_days",
            "leave_days",
            "half_days",
            "gross_salary",
            "deductions",
            "bonus",
            "final_salary",
            "payment_status",
            "paid_on",
            "slip_url",
            "slip_number",
            "payment_reference",
            "paid_by",
            "status",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("paid_by", "created_by", "created_at", "updated_at")

    def get_staff_name(self, obj: SalaryRecord) -> str:
        return (obj.staff_user.get_full_name() or obj.staff_user.username) if obj.staff_user else ""

    def get_created_by_name(self, obj: SalaryRecord) -> str:
        if not obj.created_by:
            return ""
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else ""

    def validate(self, attrs):
        staff_user = attrs.get("staff_user", getattr(self.instance, "staff_user", None))
        if staff_user and staff_user.role == UserRole.STUDENT:
            raise serializers.ValidationError({"staff_user": "Salary records cannot be created for student users."})
        money_fields = ("gross_salary", "deductions", "bonus", "final_salary")
        day_fields = ("present_days", "absent_days", "leave_days", "half_days")
        for field in money_fields + day_fields:
            value = attrs.get(field, getattr(self.instance, field, 0))
            if value is not None and value < 0:
                raise serializers.ValidationError({field: "Value cannot be negative."})
        return attrs


class FinanceEventSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FinanceEvent
        fields = (
            "id",
            "campus",
            "campus_name",
            "event_type",
            "payload",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_created_by_name(self, obj: FinanceEvent) -> str:
        if not obj.created_by:
            return ""
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else ""


class AcademicEventSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    teacher_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AcademicEvent
        fields = (
            "id",
            "campus",
            "campus_name",
            "event_type",
            "payload",
            "student",
            "student_name",
            "teacher",
            "teacher_name",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_teacher_name(self, obj: AcademicEvent) -> str:
        if not obj.teacher:
            return ""
        return (obj.teacher.get_full_name() or obj.teacher.username) if obj.teacher else ""

    def get_created_by_name(self, obj: AcademicEvent) -> str:
        if not obj.created_by:
            return ""
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else ""


class MessageTemplateSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MessageTemplate
        fields = (
            "id",
            "campus",
            "campus_name",
            "name",
            "trigger",
            "channel",
            "subject",
            "body",
            "variables",
            "status",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_created_by_name(self, obj: MessageTemplate) -> str:
        if not obj.created_by:
            return ""
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else ""


class CommunicationSettingSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    has_api_key = serializers.SerializerMethodField()
    has_api_secret = serializers.SerializerMethodField()
    has_smtp_password = serializers.SerializerMethodField()

    class Meta:
        model = CommunicationSetting
        fields = (
            "id",
            "campus",
            "campus_name",
            "channel",
            "provider_name",
            "sender_id",
            "api_url",
            "api_key",
            "api_secret",
            "smtp_host",
            "smtp_port",
            "smtp_username",
            "smtp_password",
            "whatsapp_phone_number_id",
            "is_active",
            "has_api_key",
            "has_api_secret",
            "has_smtp_password",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")
        extra_kwargs = {
            "api_key": {"write_only": True, "required": False, "allow_blank": True},
            "api_secret": {"write_only": True, "required": False, "allow_blank": True},
            "smtp_password": {"write_only": True, "required": False, "allow_blank": True},
        }

    def get_created_by_name(self, obj: CommunicationSetting) -> str:
        if not obj.created_by:
            return ""
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else ""

    def get_has_api_key(self, obj: CommunicationSetting) -> bool:
        return bool(obj.api_key)

    def get_has_api_secret(self, obj: CommunicationSetting) -> bool:
        return bool(obj.api_secret)

    def get_has_smtp_password(self, obj: CommunicationSetting) -> bool:
        return bool(obj.smtp_password)

    def create(self, validated_data):
        api_key = validated_data.pop("api_key", "")
        api_secret = validated_data.pop("api_secret", "")
        smtp_password = validated_data.pop("smtp_password", "")
        instance = super().create(validated_data)
        changed = []
        if api_key:
            instance.set_api_key(api_key)
            changed.append("api_key")
        if api_secret:
            instance.set_api_secret(api_secret)
            changed.append("api_secret")
        if smtp_password:
            instance.set_smtp_password(smtp_password)
            changed.append("smtp_password")
        if changed:
            instance.save()
        return instance

    def update(self, instance, validated_data):
        api_key = validated_data.pop("api_key", "")
        api_secret = validated_data.pop("api_secret", "")
        smtp_password = validated_data.pop("smtp_password", "")
        instance = super().update(instance, validated_data)
        changed = []
        if api_key:
            instance.set_api_key(api_key)
            changed.append("api_key")
        if api_secret:
            instance.set_api_secret(api_secret)
            changed.append("api_secret")
        if smtp_password:
            instance.set_smtp_password(smtp_password)
            changed.append("smtp_password")
        if changed:
            instance.save()
        return instance


class OutboundMessageSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    template_name = serializers.CharField(source="template.name", read_only=True)
    recipient_user_name = serializers.SerializerMethodField()
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = OutboundMessage
        fields = (
            "id",
            "campus",
            "campus_name",
            "template",
            "template_name",
            "recipient_user",
            "recipient_user_name",
            "student",
            "student_name",
            "channel",
            "recipient",
            "subject",
            "body",
            "status",
            "provider",
            "provider_reference",
            "error_message",
            "sent_at",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "sent_at", "created_at", "updated_at")

    def get_recipient_user_name(self, obj: OutboundMessage) -> str:
        if not obj.recipient_user:
            return ""
        return (obj.recipient_user.get_full_name() or obj.recipient_user.username) if obj.recipient_user else ""

    def get_created_by_name(self, obj: OutboundMessage) -> str:
        if not obj.created_by:
            return ""
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else ""

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        student = attrs.get("student", getattr(self.instance, "student", None))
        template = attrs.get("template", getattr(self.instance, "template", None))
        if campus and student and student.campus_id != campus.id:
            raise serializers.ValidationError({"student": "Student must belong to the selected campus."})
        if campus and template and template.campus_id and template.campus_id != campus.id:
            raise serializers.ValidationError({"template": "Template must belong to the selected campus or be global."})
        return attrs


class DeviceSyncLogSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    device_name = serializers.CharField(source="device.name", read_only=True)
    device_code = serializers.CharField(source="device.device_code", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DeviceSyncLog
        fields = (
            "id",
            "campus",
            "campus_name",
            "device",
            "device_name",
            "device_code",
            "status",
            "log_type",
            "payload",
            "error_message",
            "attempt_count",
            "synced_at",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_created_by_name(self, obj: DeviceSyncLog) -> str:
        if not obj.created_by:
            return ""
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else ""

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        device = attrs.get("device", getattr(self.instance, "device", None))
        if campus and device and device.campus_id != campus.id:
            raise serializers.ValidationError({"device": "Device must belong to the selected campus."})
        return attrs


class AILogSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    user_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AILog
        fields = (
            "id",
            "campus",
            "campus_name",
            "user",
            "user_name",
            "role",
            "feature",
            "prompt",
            "response",
            "metadata",
            "status",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_user_name(self, obj: AILog) -> str:
        if not obj.user:
            return ""
        return (obj.user.get_full_name() or obj.user.username) if obj.user else ""

    def get_created_by_name(self, obj: AILog) -> str:
        if not obj.created_by:
            return ""
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else ""


class DocumentSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    staff_user_name = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = (
            "id",
            "campus",
            "campus_name",
            "student",
            "student_name",
            "staff_user",
            "staff_user_name",
            "uploaded_by",
            "uploaded_by_name",
            "title",
            "document_type",
            "file_url",
            "status",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("uploaded_by", "created_by", "created_at", "updated_at")

    def get_uploaded_by_name(self, obj: Document) -> str:
        if not obj.uploaded_by:
            return ""
        return (obj.uploaded_by.get_full_name() or obj.uploaded_by.username) if obj.uploaded_by else ""

    def get_staff_user_name(self, obj: Document) -> str:
        if not obj.staff_user:
            return ""
        return (obj.staff_user.get_full_name() or obj.staff_user.username) if obj.staff_user else ""

    def get_created_by_name(self, obj: Document) -> str:
        if not obj.created_by:
            return ""
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else ""

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        student = attrs.get("student", getattr(self.instance, "student", None))
        staff_user = attrs.get("staff_user", getattr(self.instance, "staff_user", None))
        if campus and student and student.campus_id != campus.id:
            raise serializers.ValidationError({"student": "Student must belong to the selected campus."})
        if staff_user and staff_user.role == UserRole.STUDENT:
            raise serializers.ValidationError({"staff_user": "Staff document cannot be linked to a student user."})
        if campus and staff_user and staff_user.school_id and staff_user.school_id != campus.id:
            raise serializers.ValidationError({"staff_user": "Staff user must belong to the selected campus."})
        return attrs


class SaaSPlanSerializer(DocumentSerializer):
    enabled_module_count = serializers.SerializerMethodField()

    class Meta:
        model = SaaSPlan
        fields = (
            "id",
            "code",
            "name",
            "description",
            "monthly_price",
            "annual_price",
            "custom_pricing_enabled",
            "student_limit",
            "teacher_limit",
            "storage_limit_mb",
            "ai_monthly_limit",
            "whatsapp_monthly_limit",
            "sms_monthly_limit",
            "modules",
            "enabled_module_count",
            "is_active",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_enabled_module_count(self, obj: SaaSPlan) -> int:
        return sum(1 for value in (obj.modules or {}).values() if value)


class SchoolSubscriptionSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    campus_code = serializers.CharField(source="campus.code", read_only=True)
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    plan_code = serializers.CharField(source="plan.code", read_only=True)
    effective_price = serializers.SerializerMethodField()
    grace_ends_on = serializers.SerializerMethodField()
    access_allowed = serializers.SerializerMethodField()

    class Meta:
        model = SchoolSubscription
        fields = (
            "id",
            "campus",
            "campus_name",
            "campus_code",
            "plan",
            "plan_name",
            "plan_code",
            "status",
            "billing_cycle",
            "start_date",
            "end_date",
            "grace_period_days",
            "grace_ends_on",
            "next_billing_date",
            "custom_price",
            "effective_price",
            "currency",
            "gst_number",
            "auto_disable_on_expiry",
            "access_allowed",
            "last_alert_at",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "last_alert_at", "created_at", "updated_at")

    def get_effective_price(self, obj: SchoolSubscription) -> str:
        return str(obj.effective_price)

    def get_grace_ends_on(self, obj: SchoolSubscription):
        return obj.grace_ends_on

    def get_access_allowed(self, obj: SchoolSubscription) -> bool:
        return obj.is_access_allowed

    def validate(self, attrs):
        plan = attrs.get("plan", getattr(self.instance, "plan", None))
        custom_price = attrs.get("custom_price", getattr(self.instance, "custom_price", None))
        if custom_price is not None and plan and not plan.custom_pricing_enabled:
            raise serializers.ValidationError({"custom_price": "Custom pricing is not enabled for this plan."})
        return attrs


class SubscriptionInvoiceSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    plan_name = serializers.CharField(source="subscription.plan.name", read_only=True)
    paid_amount = serializers.SerializerMethodField()
    outstanding_amount = serializers.SerializerMethodField()

    class Meta:
        model = SubscriptionInvoice
        fields = (
            "id",
            "subscription",
            "campus",
            "campus_name",
            "plan_name",
            "invoice_number",
            "billing_period_start",
            "billing_period_end",
            "base_amount",
            "discount_amount",
            "gst_rate",
            "gst_amount",
            "total_amount",
            "paid_amount",
            "outstanding_amount",
            "currency",
            "status",
            "due_date",
            "paid_at",
            "pdf_url",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("gst_amount", "total_amount", "paid_at", "created_by", "created_at", "updated_at")

    def get_paid_amount(self, obj: SubscriptionInvoice) -> str:
        from apps.core.models import SubscriptionPayment
        total = SubscriptionPayment.objects.filter(invoice_id=obj.id, payment_status="success").aggregate(total=Sum("amount")).get("total") or Decimal("0")
        return str(total)

    def get_outstanding_amount(self, obj: SubscriptionInvoice) -> str:
        from apps.core.models import SubscriptionPayment
        total = SubscriptionPayment.objects.filter(invoice_id=obj.id, payment_status="success").aggregate(total=Sum("amount")).get("total") or Decimal("0")
        return str(max(obj.total_amount - total, Decimal("0")))


class SubscriptionPaymentSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)

    class Meta:
        model = SubscriptionPayment
        fields = (
            "id",
            "invoice",
            "invoice_number",
            "campus",
            "campus_name",
            "amount",
            "payment_mode",
            "provider",
            "transaction_id",
            "payment_status",
            "paid_at",
            "raw_payload",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")


class WhiteLabelConfigSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    plan_code = serializers.SerializerMethodField()

    class Meta:
        model = WhiteLabelConfig
        fields = (
            "id",
            "campus",
            "campus_name",
            "plan_code",
            "is_enabled",
            "custom_logo_url",
            "custom_domain",
            "primary_color",
            "secondary_color",
            "accent_color",
            "login_heading",
            "login_subheading",
            "login_background_url",
            "email_template_header",
            "email_template_footer",
            "report_logo_url",
            "report_footer",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_plan_code(self, obj: WhiteLabelConfig) -> str:
        subscription = obj.campus.subscriptions.select_related("plan").order_by("-end_date", "-created_at").first()
        return subscription.plan.code if subscription else (obj.campus.subscription_plan or "").lower()

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        enabled = attrs.get("is_enabled", getattr(self.instance, "is_enabled", False))
        if campus and enabled:
            subscription = campus.subscriptions.select_related("plan").order_by("-end_date", "-created_at").first()
            plan_code = subscription.plan.code if subscription else (campus.subscription_plan or "").strip().lower()
            if plan_code not in {"premium", "enterprise"}:
                raise serializers.ValidationError({"is_enabled": "White label is available only for Premium and Enterprise schools."})
        return attrs


class UserActivityLogSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = UserActivityLog
        fields = (
            "id",
            "campus",
            "campus_name",
            "user",
            "user_name",
            "activity_type",
            "summary",
            "request_path",
            "method",
            "ip_address",
            "user_agent",
            "metadata",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_user_name(self, obj: UserActivityLog) -> str:
        if not obj.user:
            return ""
        return (obj.user.get_full_name() or obj.user.username) if obj.user else ""


class DocumentAccessLogSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    user_name = serializers.SerializerMethodField()
    student_name = serializers.CharField(source="student.full_name", read_only=True)

    class Meta:
        model = DocumentAccessLog
        fields = (
            "id",
            "campus",
            "campus_name",
            "document",
            "user",
            "user_name",
            "student",
            "student_name",
            "access_type",
            "file_name",
            "granted",
            "reason",
            "ip_address",
            "metadata",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_user_name(self, obj: DocumentAccessLog) -> str:
        if not obj.user:
            return ""
        return (obj.user.get_full_name() or obj.user.username) if obj.user else ""


class EnterpriseUsageMetricSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = EnterpriseUsageMetric
        fields = ("id", "campus", "campus_name", "metric_type", "period_start", "period_end", "quantity", "metadata", "created_at", "updated_at")


class BackupPolicySerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = BackupPolicy
        fields = ("id", "campus", "campus_name", "backup_type", "frequency", "retention_days", "destination", "encryption_required", "is_active", "created_by", "created_at", "updated_at")
        read_only_fields = ("created_by", "created_at", "updated_at")


class BackupJobSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    policy_label = serializers.CharField(source="policy.backup_type", read_only=True)

    class Meta:
        model = BackupJob
        fields = ("id", "policy", "policy_label", "campus", "campus_name", "backup_type", "status", "started_at", "completed_at", "storage_location", "size_bytes", "checksum", "error_message", "metadata", "created_by", "created_at", "updated_at")
        read_only_fields = ("created_by", "created_at", "updated_at")


class QueueJobSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = QueueJob
        fields = ("id", "campus", "campus_name", "job_type", "status", "priority", "payload", "attempts", "max_attempts", "scheduled_at", "started_at", "completed_at", "error_message", "created_by", "created_at", "updated_at")
        read_only_fields = ("created_by", "created_at", "updated_at")


class SystemHealthSnapshotSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = SystemHealthSnapshot
        fields = ("id", "campus", "campus_name", "component", "status", "latency_ms", "metric_value", "message", "metadata", "checked_at", "created_at", "updated_at")


class SecureAPITokenSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    raw_token = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = SecureAPIToken
        fields = ("id", "campus", "campus_name", "name", "prefix", "raw_token", "scopes", "expires_at", "last_used_at", "is_active", "created_by", "created_at", "updated_at")
        read_only_fields = ("prefix", "last_used_at", "created_by", "created_at", "updated_at")

    def create(self, validated_data):
        raw_token = validated_data.pop("raw_token", "") or secrets.token_urlsafe(32)
        validated_data["prefix"] = raw_token[:12]
        validated_data["token_hash"] = SecureAPIToken.hash_token(raw_token)
        instance = super().create(validated_data)
        instance._raw_token = raw_token
        return instance


class PlatformSettingSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PlatformSetting
        fields = (
            "id",
            "campus",
            "campus_name",
            "key",
            "value",
            "status",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_created_by_name(self, obj: PlatformSetting) -> str:
        if not obj.created_by:
            return ""
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else ""


class AuditEventSerializer(DocumentSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditEvent
        fields = (
            "id",
            "actor",
            "actor_name",
            "action",
            "entity_type",
            "entity_id",
            "summary",
            "ip_address",
            "metadata",
            "created_at",
        )
        read_only_fields = fields

    def get_actor_name(self, obj: AuditEvent) -> str:
        if not obj.actor:
            return ""
        return (obj.actor.get_full_name() or obj.actor.username) if obj.actor else ""


class ApprovalRequestSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ApprovalRequest
        fields = (
            "id",
            "campus",
            "campus_name",
            "title",
            "entity_type",
            "entity_id",
            "description",
            "payload",
            "status",
            "requested_by",
            "requested_by_name",
            "reviewed_by",
            "reviewed_by_name",
            "decided_at",
            "decision_note",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "status",
            "requested_by",
            "reviewed_by",
            "decided_at",
            "decision_note",
            "created_at",
            "updated_at",
        )

    def get_requested_by_name(self, obj: ApprovalRequest) -> str:
        if not obj.requested_by:
            return ""
        return (obj.requested_by.get_full_name() or obj.requested_by.username) if obj.requested_by else ""

    def get_reviewed_by_name(self, obj: ApprovalRequest) -> str:
        if not obj.reviewed_by:
            return ""
        return (obj.reviewed_by.get_full_name() or obj.reviewed_by.username) if obj.reviewed_by else ""


class AnnouncementSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    # Django-era field names mapped to their Mongo model equivalents.
    message = serializers.CharField(source="body")
    is_active = serializers.BooleanField(source="is_published", required=False)
    publish_on = serializers.DateTimeField(source="published_at", required=False)

    class Meta:
        model = Announcement
        fields = (
            "id",
            "campus",
            "campus_name",
            "title",
            "message",
            "audience",
            "created_by",
            "created_by_name",
            "is_active",
            "publish_on",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_created_by_name(self, obj: Announcement) -> str:
        if not obj.created_by:
            return "Admin team"
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else ""

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        if user and getattr(user, "role", None) == UserRole.SCHOOL_ADMIN and campus is None:
            if getattr(user, "school_id", None):
                attrs["campus"] = user.school
        return attrs


class SupportTicketSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    created_by_role = serializers.CharField(source="created_by.role", read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = SupportTicket
        fields = (
            "id",
            "campus",
            "campus_name",
            "created_by",
            "created_by_name",
            "created_by_role",
            "reviewed_by",
            "reviewed_by_name",
            "subject",
            "message",
            "category",
            "priority",
            "status",
            "response_note",
            "resolved_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "created_by",
            "created_by_name",
            "created_by_role",
            "reviewed_by",
            "reviewed_by_name",
            "resolved_at",
            "created_at",
            "updated_at",
        )

    def get_created_by_name(self, obj: SupportTicket) -> str:
        return (obj.created_by.get_full_name() or obj.created_by.username) if obj.created_by else ""

    def get_reviewed_by_name(self, obj: SupportTicket) -> str:
        if not obj.reviewed_by:
            return ""
        return (obj.reviewed_by.get_full_name() or obj.reviewed_by.username) if obj.reviewed_by else ""


class AdmissionFormTemplateSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = AdmissionFormTemplate
        fields = (
            "id",
            "campus",
            "campus_name",
            "name",
            "academic_year",
            "form_schema",
            "admission_fee",
            "is_public",
            "status",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_by", "created_at", "updated_at")

    def validate_admission_fee(self, value):
        if value < 0:
            raise serializers.ValidationError("Admission fee cannot be negative.")
        return value


class AdmissionApplicationSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    form_name = serializers.CharField(source="form_template.name", read_only=True)
    section_label = serializers.SerializerMethodField()
    applicant_name = serializers.CharField(read_only=True)
    document_count = serializers.IntegerField(source="documents.count", read_only=True)

    class Meta:
        model = AdmissionApplication
        fields = (
            "id",
            "campus",
            "campus_name",
            "form_template",
            "form_name",
            "target_section",
            "section_label",
            "application_number",
            "tracking_code",
            "applicant_first_name",
            "applicant_last_name",
            "applicant_name",
            "date_of_birth",
            "guardian_name",
            "contact_email",
            "contact_phone",
            "form_data",
            "status",
            "admission_fee_amount",
            "payment_status",
            "payment_reference",
            "interview_at",
            "decision_note",
            "admitted_student",
            "reviewed_by",
            "created_by",
            "document_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("application_number", "tracking_code", "reviewed_by", "created_by", "created_at", "updated_at")

    def get_section_label(self, obj: AdmissionApplication) -> str:
        if not obj.target_section:
            return ""
        return f"{obj.target_section.grade_name} - {obj.target_section.section_name}"

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        form_template = attrs.get("form_template", getattr(self.instance, "form_template", None))
        target_section = attrs.get("target_section", getattr(self.instance, "target_section", None))
        admitted_student = attrs.get("admitted_student", getattr(self.instance, "admitted_student", None))
        fee = attrs.get("admission_fee_amount", getattr(self.instance, "admission_fee_amount", Decimal("0")))
        if campus and form_template and form_template.campus_id != campus.id:
            raise serializers.ValidationError({"form_template": "Admission form must belong to the selected campus."})
        if campus and target_section and target_section.campus_id != campus.id:
            raise serializers.ValidationError({"target_section": "Target class must belong to the selected campus."})
        if campus and admitted_student and admitted_student.campus_id != campus.id:
            raise serializers.ValidationError({"admitted_student": "Admitted student must belong to the selected campus."})
        if fee < 0:
            raise serializers.ValidationError({"admission_fee_amount": "Admission fee cannot be negative."})
        return attrs


class AdmissionDocumentSerializer(DocumentSerializer):
    application_number = serializers.CharField(source="application.application_number", read_only=True)
    campus = serializers.CharField(source="application.campus_id", read_only=True)
    campus_name = serializers.CharField(source="application.campus.name", read_only=True)

    class Meta:
        model = AdmissionDocument
        fields = (
            "id",
            "application",
            "application_number",
            "campus",
            "campus_name",
            "title",
            "document_type",
            "file_url",
            "file_name",
            "file_content_type",
            "uploaded_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("uploaded_by", "created_at", "updated_at")


class TransportDriverSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = TransportDriver
        fields = ("id", "campus", "campus_name", "user", "user_name", "full_name", "phone", "license_number", "emergency_contact", "status", "created_by", "created_at", "updated_at")
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_user_name(self, obj: TransportDriver) -> str:
        if not obj.user:
            return ""
        return (obj.user.get_full_name() or obj.user.username) if obj.user else ""

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        user = attrs.get("user", getattr(self.instance, "user", None))
        if campus and user and user.school_id and user.school_id != campus.id:
            raise serializers.ValidationError({"user": "Driver user must belong to the selected campus."})
        return attrs


class TransportVehicleAttendanceSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    vehicle_number = serializers.CharField(source="vehicle.vehicle_number", read_only=True)
    driver_name = serializers.CharField(source="driver.full_name", read_only=True)

    class Meta:
        model = TransportVehicleAttendance
        fields = ("id", "campus", "campus_name", "vehicle", "vehicle_number", "driver", "driver_name", "date", "status", "odometer_reading", "notes", "marked_by", "created_at", "updated_at")
        read_only_fields = ("marked_by", "created_at", "updated_at")

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        vehicle = attrs.get("vehicle", getattr(self.instance, "vehicle", None))
        driver = attrs.get("driver", getattr(self.instance, "driver", None))
        if campus and vehicle and vehicle.campus_id != campus.id:
            raise serializers.ValidationError({"vehicle": "Vehicle must belong to the selected campus."})
        if campus and driver and driver.campus_id != campus.id:
            raise serializers.ValidationError({"driver": "Driver must belong to the selected campus."})
        return attrs


class TransportTripLogSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    route_name = serializers.CharField(source="route.name", read_only=True)
    vehicle_number = serializers.CharField(source="vehicle.vehicle_number", read_only=True)
    driver_name = serializers.CharField(source="driver.full_name", read_only=True)

    class Meta:
        model = TransportTripLog
        fields = ("id", "campus", "campus_name", "route", "route_name", "vehicle", "vehicle_number", "driver", "driver_name", "trip_date", "trip_type", "status", "scheduled_time", "started_at", "completed_at", "gps_payload", "pickup_drop_report", "created_by", "created_at", "updated_at")
        read_only_fields = ("created_by", "created_at", "updated_at")

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        route = attrs.get("route", getattr(self.instance, "route", None))
        vehicle = attrs.get("vehicle", getattr(self.instance, "vehicle", None))
        driver = attrs.get("driver", getattr(self.instance, "driver", None))
        if campus and route and route.campus_id != campus.id:
            raise serializers.ValidationError({"route": "Route must belong to the selected campus."})
        if campus and vehicle and vehicle.campus_id != campus.id:
            raise serializers.ValidationError({"vehicle": "Vehicle must belong to the selected campus."})
        if campus and driver and driver.campus_id != campus.id:
            raise serializers.ValidationError({"driver": "Driver must belong to the selected campus."})
        return attrs


class DigitalLibraryResourceSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    book_title = serializers.CharField(source="book.title", read_only=True)

    class Meta:
        model = DigitalLibraryResource
        fields = ("id", "campus", "campus_name", "book", "book_title", "title", "resource_type", "file_url", "file_name", "file_content_type", "status", "created_by", "created_at", "updated_at")
        read_only_fields = ("created_by", "created_at", "updated_at")

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        book = attrs.get("book", getattr(self.instance, "book", None))
        if campus and book and book.campus_id != campus.id:
            raise serializers.ValidationError({"book": "Book must belong to the selected campus."})
        return attrs


class LibraryBookRequestSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    book_title = serializers.CharField(source="book.title", read_only=True)
    requester_name = serializers.SerializerMethodField()

    class Meta:
        model = LibraryBookRequest
        fields = ("id", "campus", "campus_name", "book", "book_title", "student", "staff_user", "requester_name", "status", "request_note", "decision_note", "decided_by", "created_at", "updated_at")
        read_only_fields = ("decided_by", "created_at", "updated_at")

    def get_requester_name(self, obj: LibraryBookRequest) -> str:
        if obj.student_id:
            return obj.student.full_name
        if obj.staff_user_id:
            return (obj.staff_user.get_full_name() or obj.staff_user.username) if obj.staff_user else ""
        return ""

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        book = attrs.get("book", getattr(self.instance, "book", None))
        student = attrs.get("student", getattr(self.instance, "student", None))
        staff_user = attrs.get("staff_user", getattr(self.instance, "staff_user", None))
        if bool(student) == bool(staff_user):
            raise serializers.ValidationError({"student": "Select exactly one requester: student or staff user."})
        if campus and book and book.campus_id != campus.id:
            raise serializers.ValidationError({"book": "Book must belong to the selected campus."})
        if campus and student and student.campus_id != campus.id:
            raise serializers.ValidationError({"student": "Student must belong to the selected campus."})
        if staff_user and staff_user.role == UserRole.STUDENT:
            raise serializers.ValidationError({"staff_user": "Use the student requester field for student users."})
        return attrs


class InventoryAssetSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    allocated_to_user_name = serializers.SerializerMethodField()
    allocated_to_student_name = serializers.CharField(source="allocated_to_student.full_name", read_only=True)

    class Meta:
        model = InventoryAsset
        fields = ("id", "campus", "campus_name", "asset_code", "name", "category", "serial_number", "location", "allocated_to_user", "allocated_to_user_name", "allocated_to_student", "allocated_to_student_name", "purchase_date", "purchase_cost", "current_value", "depreciation_rate", "status", "metadata", "created_by", "created_at", "updated_at")
        read_only_fields = ("created_by", "created_at", "updated_at")

    def get_allocated_to_user_name(self, obj: InventoryAsset) -> str:
        if not obj.allocated_to_user:
            return ""
        return (obj.allocated_to_user.get_full_name() or obj.allocated_to_user.username) if obj.allocated_to_user else ""

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        user = attrs.get("allocated_to_user", getattr(self.instance, "allocated_to_user", None))
        student = attrs.get("allocated_to_student", getattr(self.instance, "allocated_to_student", None))
        if campus and user and user.school_id and user.school_id != campus.id:
            raise serializers.ValidationError({"allocated_to_user": "Allocated user must belong to the selected campus."})
        if campus and student and student.campus_id != campus.id:
            raise serializers.ValidationError({"allocated_to_student": "Allocated student must belong to the selected campus."})
        return attrs


class AssetMaintenanceLogSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    asset_code = serializers.CharField(source="asset.asset_code", read_only=True)

    class Meta:
        model = AssetMaintenanceLog
        fields = ("id", "campus", "campus_name", "asset", "asset_code", "issue", "service_provider", "maintenance_date", "cost", "status", "notes", "created_by", "created_at", "updated_at")
        read_only_fields = ("created_by", "created_at", "updated_at")

    def validate(self, attrs):
        campus = attrs.get("campus", getattr(self.instance, "campus", None))
        asset = attrs.get("asset", getattr(self.instance, "asset", None))
        if campus and asset and asset.campus_id != campus.id:
            raise serializers.ValidationError({"asset": "Asset must belong to the selected campus."})
        return attrs


class SchoolWebsiteContentSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = SchoolWebsiteContent
        fields = ("id", "campus", "campus_name", "content_type", "title", "slug", "body", "summary", "media_url", "metadata", "publish_at", "is_published", "sort_order", "created_by", "created_at", "updated_at")
        read_only_fields = ("created_by", "created_at", "updated_at")


class PushNotificationDeviceSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = PushNotificationDevice
        fields = ("id", "campus", "campus_name", "user", "user_name", "platform", "device_id", "token", "is_active", "last_seen_at", "created_at", "updated_at")
        read_only_fields = ("last_seen_at", "created_at", "updated_at")
        extra_kwargs = {"token": {"write_only": True}}

    def get_user_name(self, obj: PushNotificationDevice) -> str:
        return (obj.user.get_full_name() or obj.user.username) if obj.user else ""


class PushNotificationLogSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    user_name = serializers.SerializerMethodField()
    student_name = serializers.CharField(source="student.full_name", read_only=True)

    class Meta:
        model = PushNotificationLog
        fields = ("id", "campus", "campus_name", "user", "user_name", "student", "student_name", "event_type", "title", "body", "payload", "status", "sent_at", "error_message", "created_by", "created_at", "updated_at")
        read_only_fields = ("sent_at", "created_by", "created_at", "updated_at")

    def get_user_name(self, obj: PushNotificationLog) -> str:
        if not obj.user:
            return ""
        return (obj.user.get_full_name() or obj.user.username) if obj.user else ""


class MarketplacePluginSerializer(DocumentSerializer):
    class Meta:
        model = MarketplacePlugin
        fields = ("id", "code", "name", "plugin_type", "provider_name", "description", "config_schema", "is_enabled", "created_by", "created_at", "updated_at")
        read_only_fields = ("created_by", "created_at", "updated_at")


class SchoolPluginConfigSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    plugin_name = serializers.CharField(source="plugin.name", read_only=True)
    plugin_type = serializers.CharField(source="plugin.plugin_type", read_only=True)

    class Meta:
        model = SchoolPluginConfig
        fields = ("id", "campus", "campus_name", "plugin", "plugin_name", "plugin_type", "is_enabled", "config", "created_by", "created_at", "updated_at")
        read_only_fields = ("created_by", "created_at", "updated_at")


class AccountingLedgerEntrySerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = AccountingLedgerEntry
        fields = ("id", "campus", "campus_name", "entry_type", "ledger_name", "reference_type", "reference_id", "amount", "tax_rate", "gst_amount", "entry_date", "notes", "created_by", "created_at", "updated_at")
        read_only_fields = ("created_by", "created_at", "updated_at")


class ReportDefinitionSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = ReportDefinition
        fields = ("id", "campus", "campus_name", "name", "report_type", "description", "columns", "filters", "sort", "chart_config", "is_public_to_school", "created_by", "created_at", "updated_at")
        read_only_fields = ("created_by", "created_at", "updated_at")


class SecurityPolicySerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = SecurityPolicy
        fields = ("id", "campus", "campus_name", "two_factor_required", "allowed_ip_ranges", "blocked_ip_ranges", "max_active_sessions", "force_password_change_days", "suspicious_login_threshold", "created_by", "created_at", "updated_at")
        read_only_fields = ("created_by", "created_at", "updated_at")


class DeviceLoginSessionSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = DeviceLoginSession
        fields = ("id", "campus", "campus_name", "user", "user_name", "device_id", "ip_address", "user_agent", "login_at", "logout_at", "is_active", "forced_logout", "risk_score", "event_type", "metadata", "created_at", "updated_at")
        read_only_fields = ("created_at", "updated_at")

    def get_user_name(self, obj: DeviceLoginSession) -> str:
        return (obj.user.get_full_name() or obj.user.username) if obj.user else ""


class SecurityEventSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = SecurityEvent
        fields = ("id", "campus", "campus_name", "user", "user_name", "event_type", "severity", "summary", "ip_address", "metadata", "resolved_at", "resolved_by", "created_at", "updated_at")
        read_only_fields = ("resolved_at", "resolved_by", "created_at", "updated_at")

    def get_user_name(self, obj: SecurityEvent) -> str:
        if not obj.user:
            return ""
        return (obj.user.get_full_name() or obj.user.username) if obj.user else ""


class ProductionAuditRunSerializer(DocumentSerializer):
    campus_name = serializers.CharField(source="campus.name", read_only=True)

    class Meta:
        model = ProductionAuditRun
        fields = ("id", "campus", "campus_name", "status", "checks", "summary", "report_url", "started_at", "completed_at", "created_by", "created_at", "updated_at")
        read_only_fields = ("status", "checks", "summary", "report_url", "started_at", "completed_at", "created_by", "created_at", "updated_at")

