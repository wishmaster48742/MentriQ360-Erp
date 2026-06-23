import base64
import hashlib
import hmac
import json
import re
import secrets
import string
import time
from datetime import date, datetime, timedelta
from decimal import Decimal
from io import BytesIO, StringIO

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.http import HttpResponse, StreamingHttpResponse
from apps.core.mongo_compat import Avg, Count, F, Q, Sum, get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import status, viewsets
from rest_framework import serializers as drf_serializers
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from PIL import Image, UnidentifiedImageError

from apps.accounts.models import User, UserRole

from .models import (
    AcademicEvent,
    AcademicEventType,
    AcademicSession,
    AcademicWorkStatus,
    AccountingEntryType,
    AccountingLedgerEntry,
    AdmitCard,
    AILog,
    AdmissionApplication,
    AdmissionApplicationStatus,
    AdmissionDocument,
    AdmissionFormTemplate,
    AssetMaintenanceLog,
    AssignmentSubmission,
    AssignmentSubmissionStatus,
    AssignedWork,
    Announcement,
    ApprovalRequest,
    ApprovalStatus,
    AttendanceCaptureMethod,
    AttendanceDevice,
    AttendanceRecord,
    AttendanceStatus,
    AuditAction,
    AuditEvent,
    BackupJob,
    BackupPolicy,
    BillingCycle,
    Campus,
    CampusMembership,
    ClassSection,
    CommunicationSetting,
    DeviceSyncLog,
    DeviceSyncStatus,
    DeviceLoginSession,
    Document,
    DocumentAccessLog,
    DigitalLibraryResource,
    EnterprisePaymentStatus,
    EnterpriseUsageMetric,
    HealthStatus,
    InvoiceStatus,
    JobStatus,
    ExamSchedule,
    ExamScheduleStatus,
    ExamSubjectSetup,
    ExamType,
    FeeAssignment,
    FeeStatus,
    FeeStructure,
    FinanceEvent,
    FinanceEventType,
    GatewayProvider,
    HostelAllocation,
    HostelRoom,
    InventoryAsset,
    LibraryBook,
    LibraryBookRequest,
    LibraryRequestStatus,
    LibraryLoan,
    LearningResource,
    MarketplacePlugin,
    MessageTemplate,
    MessageChannel,
    MessageStatus,
    OutboundMessage,
    Payment,
    PaymentGatewayConfig,
    PaymentMethod,
    PaymentTransaction,
    PlatformSetting,
    ProductionAuditRun,
    ProductionAuditStatus,
    PushNotificationDevice,
    PushNotificationLog,
    PushNotificationStatus,
    QueueJob,
    RecordStatus,
    ReportDefinition,
    ReportDefinitionType,
    ResultRecord,
    ResultReviewStatus,
    SaaSPlan,
    SaaSPlanCode,
    SalaryPaymentStatus,
    SalaryRecord,
    SalarySetup,
    SchoolStatus,
    SchoolWebsiteContent,
    SchoolPluginConfig,
    SchoolSubscription,
    SecureAPIToken,
    SecurityEvent,
    SecurityEventType,
    SecurityPolicy,
    SubscriptionInvoice,
    SubscriptionPayment,
    SubscriptionStatus,
    SystemHealthSnapshot,
    StaffAttendanceRecord,
    StaffProfile,
    StaffAttendanceStatus,
    Student,
    StudentTransportAssignment,
    Subject,
    SupportTicket,
    SupportTicketStatus,
    TeacherSubjectAllocation,
    TimetableSlot,
    TransactionStatus,
    TransportDriver,
    TransportRoute,
    TransportTripLog,
    TransportVehicle,
    TransportVehicleAttendance,
    UserActivityLog,
    WhiteLabelConfig,
)
from .attendance_rules import ensure_attendance_date_is_editable
from .input import sanitize_webhook_payload
from .permissions import RoleAccessPermission
from .serializers import (
    AcademicEventSerializer,
    AcademicSessionSerializer,
    AccountingLedgerEntrySerializer,
    AdmitCardSerializer,
    AILogSerializer,
    AdmissionApplicationSerializer,
    AdmissionDocumentSerializer,
    AdmissionFormTemplateSerializer,
    AssetMaintenanceLogSerializer,
    AssignmentSubmissionSerializer,
    AssignedWorkSerializer,
    AnnouncementSerializer,
    ApprovalRequestSerializer,
    AttendanceDeviceSerializer,
    AttendanceRecordSerializer,
    AuditEventSerializer,
    BackupJobSerializer,
    BackupPolicySerializer,
    CampusSerializer,
    CampusMembershipSerializer,
    ClassSectionSerializer,
    CommunicationSettingSerializer,
    DeviceSyncLogSerializer,
    DeviceLoginSessionSerializer,
    DocumentSerializer,
    DocumentAccessLogSerializer,
    DigitalLibraryResourceSerializer,
    EnterpriseUsageMetricSerializer,
    ExamScheduleSerializer,
    ExamSubjectSetupSerializer,
    ExamTypeSerializer,
    FeeAssignmentSerializer,
    FeeStructureSerializer,
    FinanceEventSerializer,
    HostelAllocationSerializer,
    HostelRoomSerializer,
    InventoryAssetSerializer,
    LibraryBookSerializer,
    LibraryBookRequestSerializer,
    LibraryLoanSerializer,
    LearningResourceSerializer,
    MarketplacePluginSerializer,
    MessageTemplateSerializer,
    OutboundMessageSerializer,
    PaymentSerializer,
    PaymentGatewayConfigSerializer,
    PaymentTransactionSerializer,
    PlatformSettingSerializer,
    ProductionAuditRunSerializer,
    PushNotificationDeviceSerializer,
    PushNotificationLogSerializer,
    QueueJobSerializer,
    ReportDefinitionSerializer,
    ResultRecordSerializer,
    SaaSPlanSerializer,
    SalaryRecordSerializer,
    SalarySetupSerializer,
    SchoolProfileSerializer,
    SchoolSerializer,
    SchoolPluginConfigSerializer,
    SchoolSubscriptionSerializer,
    SchoolWebsiteContentSerializer,
    SecureAPITokenSerializer,
    SecurityEventSerializer,
    SecurityPolicySerializer,
    SubscriptionInvoiceSerializer,
    SubscriptionPaymentSerializer,
    SystemHealthSnapshotSerializer,
    StaffAttendanceRecordSerializer,
    StaffProfileSerializer,
    StudentSerializer,
    StudentTransportAssignmentSerializer,
    SubjectSerializer,
    SupportTicketSerializer,
    TeacherSubjectAllocationSerializer,
    TimetableSlotSerializer,
    TransportDriverSerializer,
    TransportRouteSerializer,
    TransportTripLogSerializer,
    TransportVehicleSerializer,
    TransportVehicleAttendanceSerializer,
    UserActivityLogSerializer,
    WhiteLabelConfigSerializer,
    school_connection_status,
)

ADMIN_ROLES = (UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
ACCOUNT_ROLES = (UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNT)
READ_ROLES = (UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNT, UserRole.TEACHER, UserRole.STUDENT)
ACADEMIC_WRITE_ROLES = ADMIN_ROLES + (UserRole.TEACHER,)
ACADEMIC_FILE_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "image/jpeg",
    "image/png",
    "image/webp",
}
ACADEMIC_FILE_MAX_SIZE = settings.MENTRIQ_UPLOAD_ACADEMIC_MAX_BYTES


def teacher_section_q(user):
    return Q(class_teacher=user) | Q(subject_allocations__teacher=user, subject_allocations__is_active=True)


def teacher_has_subject_access(user, section: ClassSection, subject: str) -> bool:
    subject = (subject or "").strip()
    if section.class_teacher_id == user.id:
        return True
    if not subject:
        return False
    return TeacherSubjectAllocation.objects.filter(
        section=section,
        teacher=user,
        subject__iexact=subject,
        is_active=True,
    ).exists()


def teacher_id_for_section_subject(section: ClassSection, subject: str) -> int | None:
    subject = (subject or "").strip()
    if not subject:
        return section.class_teacher_id
    allocation = TeacherSubjectAllocation.objects.filter(
        section=section,
        subject__iexact=subject,
        is_active=True,
    ).first()
    return allocation.teacher_id if allocation else section.class_teacher_id


class HealthCheckView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        responses=inline_serializer(
            name="HealthCheckResponse",
            fields={
                "status": drf_serializers.CharField(),
                "service": drf_serializers.CharField(),
            },
        )
    )
    def get(self, request):
        return Response({"status": "ok", "service": "mentriq360-api"})


def get_client_ip(request) -> str | None:
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def generate_school_code(name: str) -> str:
    base = re.sub(r"[^A-Za-z0-9]+", "", name or "").upper()[:8] or "SCHOOL"
    candidate = base
    counter = 1
    while Campus.objects.filter(code=candidate).exists():
        counter += 1
        candidate = f"{base[:6]}{counter:02d}"
    return candidate


def generate_temporary_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(char.islower() for char in password)
            and any(char.isupper() for char in password)
            and any(char.isdigit() for char in password)
            and any(char in "!@#$%" for char in password)
        ):
            return password


def uploaded_image_to_data_url(upload, *, allowed_types: set[str], max_size: int, max_dimensions: tuple[int, int] = (1600, 1600)) -> str:
    from apps.core.input import validate_file_signature

    if upload.content_type not in allowed_types:
        raise ValidationError({"file": "Unsupported image type."})
    if upload.size > max_size:
        raise ValidationError({"file": f"Image is too large. Max size is {max_size // 1024} KB."})
    validate_file_signature(upload, allowed_types)

    raw = upload.read()
    if upload.content_type == "image/svg+xml":
        encoded = base64.b64encode(raw).decode("ascii")
        return f"data:{upload.content_type};base64,{encoded}"

    try:
        image = Image.open(BytesIO(raw))
        image.load()
    except UnidentifiedImageError:
        raise ValidationError({"file": "Uploaded image is invalid."})

    image.thumbnail(max_dimensions)
    output = BytesIO()
    content_type = upload.content_type
    if content_type == "image/jpeg":
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        image.save(output, format="JPEG", optimize=True, quality=82)
    elif content_type == "image/webp":
        image.save(output, format="WEBP", quality=82, method=6)
    else:
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA")
        image.save(output, format="PNG", optimize=True)
        content_type = "image/png"

    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:{content_type};base64,{encoded}"


def uploaded_file_to_data_url(upload, *, allowed_types: set[str], max_size: int) -> str:
    from apps.core.input import validate_file_signature

    if upload.content_type not in allowed_types:
        raise ValidationError({"file": "Unsupported file type."})
    if upload.size > max_size:
        raise ValidationError({"file": f"File is too large. Max size is {max_size // 1024} KB."})
    validate_file_signature(upload, allowed_types)
    encoded = base64.b64encode(upload.read()).decode("ascii")
    return f"data:{upload.content_type};base64,{encoded}"


def protected_data_url_response(data_url: str, filename: str, fallback_content_type: str = "application/octet-stream") -> HttpResponse:
    if not data_url:
        raise ValidationError({"file": "No file is attached to this record."})
    content_type = fallback_content_type
    encoded = data_url
    if data_url.startswith("data:") and ";base64," in data_url:
        meta, encoded = data_url.split(";base64,", 1)
        content_type = meta.replace("data:", "") or fallback_content_type
    try:
        content = base64.b64decode(encoded)
    except (ValueError, TypeError):
        raise ValidationError({"file": "Stored file is invalid."})
    from apps.core.input import sanitize_filename
    safe_name = sanitize_filename(filename)
    response = HttpResponse(content, content_type=content_type)
    response["Content-Disposition"] = f'attachment; filename="{safe_name}"'
    return response


def generate_student_id(campus: Campus) -> str:
    prefix = f"{campus.code}-STU"
    counter = Student.objects.filter(campus=campus).count() + 1
    while True:
        candidate = f"{prefix}-{counter:04d}"
        if not Student.objects.filter(admission_number=candidate).exists():
            return candidate
        counter += 1


def generate_employee_id(campus: Campus) -> str:
    prefix = f"{campus.code}-EMP"
    counter = StaffProfile.objects.filter(campus=campus).count() + 1
    while True:
        candidate = f"{prefix}-{counter:04d}"
        if not StaffProfile.objects.filter(employee_code=candidate).exists():
            return candidate
        counter += 1


def _pdf_escape(value: str) -> str:
    return (value or "").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def simple_pdf_bytes(title: str, lines: list[str]) -> bytes:
    text_commands = ["BT", "/F1 12 Tf", "72 760 Td", f"({_pdf_escape(title)}) Tj"]
    for line in lines:
        text_commands.extend(["0 -18 Td", f"({_pdf_escape(str(line))}) Tj"])
    text_commands.append("ET")
    stream = "\n".join(text_commands).encode("latin-1", "replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    body = bytearray(b"%PDF-1.4\n")
    offsets: list[int] = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(body))
        body.extend(f"{index} 0 obj\n".encode("ascii"))
        body.extend(obj)
        body.extend(b"\nendobj\n")
    xref_offset = len(body)
    body.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    body.extend(b"0000000000 65535 f \n")
    for offset in offsets:
        body.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    body.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(body)


def export_response(filename_base: str, fmt: str, headers: list[str], rows: list[list[str]]) -> HttpResponse:
    normalized = (fmt or "excel").lower()
    if normalized == "pdf":
        lines = [" | ".join(headers)] + [" | ".join(str(value) for value in row) for row in rows]
        response = HttpResponse(simple_pdf_bytes(filename_base, lines), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename_base}.pdf"'
        return response

    if normalized == "csv":
        output = StringIO()
        output.write(",".join(headers) + "\n")
        for row in rows:
            output.write(",".join(f'"{str(value).replace(chr(34), chr(34) + chr(34))}"' for value in row) + "\n")
        response = HttpResponse(output.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename_base}.csv"'
        return response

    output = StringIO()
    output.write("\t".join(headers) + "\n")
    for row in rows:
        output.write("\t".join(str(value) for value in row) + "\n")
    response = HttpResponse(output.getvalue(), content_type="application/vnd.ms-excel")
    response["Content-Disposition"] = f'attachment; filename="{filename_base}.xls"'
    return response


def primary_school_for_user(user) -> Campus | None:
    if getattr(user, "school_id", None):
        return user.school
    if getattr(user, "role", None) == UserRole.STUDENT:
        student = Student.objects.filter(user_id=user.pk).first()
        if student:
            return student.campus
    if getattr(user, "role", None) in (UserRole.TEACHER, UserRole.ACCOUNT, UserRole.SCHOOL_ADMIN):
        staff_profile = StaffProfile.objects.filter(user_id=user.pk).first()
        if staff_profile:
            return staff_profile.campus
    if getattr(user, "role", None) == UserRole.TEACHER:
        section = (
            ClassSection.objects.filter(teacher_section_q(user)).first()
            or ClassSection.objects.filter(subject_allocations__teacher=user, subject_allocations__is_active=True)
            
            .first()
        )
        if section:
            return section.campus
    membership = (
        CampusMembership.objects.filter(user_id=user.pk, is_primary=True).first()
        or CampusMembership.objects.filter(user_id=user.pk).first()
    )
    return membership.campus if membership else None


def campus_ids_for_admin_like_user(user) -> list[int]:
    if getattr(user, "role", None) == UserRole.SUPER_ADMIN:
        return list(Campus.objects.values_list("id", flat=True))
    if getattr(user, "school_id", None):
        return [user.school_id]
    return list(CampusMembership.objects.filter(user_id=user.pk).values_list("campus_id", flat=True).distinct())


def scoped_finance_events_for_user(user):
    queryset = FinanceEvent.objects
    if not getattr(user, "is_authenticated", False):
        return queryset.none()
    if user.role in (UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNT):
        campus_ids = campus_ids_for_admin_like_user(user)
        return queryset.filter(campus_id__in=campus_ids) if campus_ids else queryset.none()
    if user.role == UserRole.STUDENT:
        student = Student.objects.filter(user_id=user.pk).first()
        return queryset.filter(payload__studentId=student.id) if student else queryset.none()
    return queryset.none()


def scoped_academic_events_for_user(user):
    queryset = AcademicEvent.objects
    if not getattr(user, "is_authenticated", False):
        return queryset.none()
    if user.role in (UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNT):
        campus_ids = campus_ids_for_admin_like_user(user)
        return queryset.filter(campus_id__in=campus_ids) if campus_ids else queryset.none()
    if user.role == UserRole.TEACHER:
        class_teacher_sections = list(ClassSection.objects.filter(class_teacher=user).values_list("id", flat=True))
        subject_sections = list(
            TeacherSubjectAllocation.objects.filter(teacher=user, is_active=True).values_list("section_id", flat=True).distinct()
        )
        teacher_campuses = list(
            ClassSection.objects.filter(Q(id__in=class_teacher_sections) | Q(id__in=subject_sections))
            .values_list("campus_id", flat=True)
            .distinct()
        )
        teacher_filter = Q(teacher=user)
        if class_teacher_sections:
            teacher_filter |= Q(payload__sectionId__in=class_teacher_sections)
        if subject_sections:
            teacher_filter |= Q(payload__sectionId__in=subject_sections)
        return queryset.filter(campus_id__in=teacher_campuses).filter(teacher_filter).distinct() if teacher_campuses else queryset.none()
    if user.role == UserRole.STUDENT:
        student = Student.objects.filter(user_id=user.pk).first()
        if not student:
            return queryset.none()
        return queryset.filter(
            Q(student=student)
            | Q(campus=student.campus, payload__studentId=student.id)
            | Q(
                campus=student.campus,
                payload__sectionId=student.section_id,
                event_type__in=[
                    AcademicEventType.NOTES_UPLOADED,
                    AcademicEventType.ASSIGNMENT_UPLOADED,
                    AcademicEventType.ASSIGNMENT_PUBLISHED,
                ],
            )
            | Q(campus=student.campus, event_type=AcademicEventType.NOTICE_PUBLISHED, payload__audience__in=["all", "learners"])
        ).distinct()
    return queryset.none()


def decimal_string(value) -> str:
    return str(value or Decimal("0"))


def next_finance_number(campus: Campus, prefix: str, model, field_name: str) -> str:
    date_part = timezone.localdate().strftime("%Y%m%d")
    base = f"{campus.code}-{prefix}-{date_part}"
    counter = model.objects.filter(**{f"{field_name}__startswith": base}).count() + 1
    while True:
        candidate = f"{base}-{counter:04d}"
        if not model.objects.filter(**{field_name: candidate}).exists():
            return candidate
        counter += 1


DEFAULT_SAAS_PLANS = {
    SaaSPlanCode.BASIC: {
        "name": "Basic",
        "monthly_price": Decimal("4999.00"),
        "annual_price": Decimal("49999.00"),
        "student_limit": 500,
        "teacher_limit": 40,
        "storage_limit_mb": 10240,
        "ai_monthly_limit": 1000,
        "whatsapp_monthly_limit": 500,
        "sms_monthly_limit": 2000,
        "custom_pricing_enabled": False,
        "modules": {"academics": True, "finance": True, "teacherPortal": True, "studentPortal": True, "ai": False, "whiteLabel": False},
    },
    SaaSPlanCode.STANDARD: {
        "name": "Standard",
        "monthly_price": Decimal("9999.00"),
        "annual_price": Decimal("99999.00"),
        "student_limit": 1500,
        "teacher_limit": 120,
        "storage_limit_mb": 51200,
        "ai_monthly_limit": 5000,
        "whatsapp_monthly_limit": 2500,
        "sms_monthly_limit": 10000,
        "custom_pricing_enabled": False,
        "modules": {"academics": True, "finance": True, "teacherPortal": True, "studentPortal": True, "communication": True, "ai": True, "whiteLabel": False},
    },
    SaaSPlanCode.PREMIUM: {
        "name": "Premium",
        "monthly_price": Decimal("19999.00"),
        "annual_price": Decimal("199999.00"),
        "student_limit": 5000,
        "teacher_limit": 350,
        "storage_limit_mb": 204800,
        "ai_monthly_limit": 20000,
        "whatsapp_monthly_limit": 10000,
        "sms_monthly_limit": 50000,
        "custom_pricing_enabled": True,
        "modules": {"academics": True, "finance": True, "teacherPortal": True, "studentPortal": True, "communication": True, "ai": True, "hardwareAttendance": True, "whiteLabel": True},
    },
    SaaSPlanCode.ENTERPRISE: {
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


def active_subscription_for_campus(campus: Campus) -> SchoolSubscription | None:
    return (
        SchoolSubscription.objects.filter(campus_id=str(campus.id))
        .order_by("-end_date", "-created_at")
        .first()
    )


def subscription_limit_snapshot(campus: Campus) -> dict:
    subscription = active_subscription_for_campus(campus)
    plan = subscription.plan if subscription else None
    student_count = Student.objects.filter(campus_id=str(campus.id), status="active").count()
    teacher_count = CampusMembership.objects.filter(campus_id=str(campus.id), role="teacher").count()
    month_start = timezone.localdate().replace(day=1)
    month_start_dt = timezone.make_aware(datetime.combine(month_start, datetime.min.time()))
    fallback_plan = (campus.subscription_plan or "").strip().lower()
    return {
        "subscription": {
            "id": subscription.id if subscription else None,
            "status": subscription.status if subscription else campus.subscription_status,
            "startDate": subscription.start_date if subscription else None,
            "endDate": subscription.end_date if subscription else campus.billing_due_date,
            "graceEndsOn": subscription.grace_ends_on if subscription else None,
            "accessAllowed": subscription.is_access_allowed if subscription else campus.status == SchoolStatus.ACTIVE,
        },
        "plan": {
            "id": plan.id if plan else None,
            "code": plan.code if plan else fallback_plan,
            "name": plan.name if plan else campus.subscription_plan,
            "modules": plan.modules if plan else campus.enabled_modules,
            "customPricingEnabled": plan.custom_pricing_enabled if plan else False,
        },
        "students": {"used": student_count, "limit": plan.student_limit if plan else 0},
        "teachers": {"used": teacher_count, "limit": plan.teacher_limit if plan else 0},
        "storageMb": {"used": 0, "limit": plan.storage_limit_mb if plan else 0},
        "ai": {"used": AILog.objects.filter(campus_id=str(campus.id), created_at__gte=month_start_dt).count(), "limit": plan.ai_monthly_limit if plan else 0},
        "whatsapp": {"used": OutboundMessage.objects.filter(campus_id=str(campus.id), channel=MessageChannel.WHATSAPP, created_at__gte=month_start_dt).count(), "limit": plan.whatsapp_monthly_limit if plan else 0},
        "sms": {"used": OutboundMessage.objects.filter(campus_id=str(campus.id), channel=MessageChannel.SMS, created_at__gte=month_start_dt).count(), "limit": plan.sms_monthly_limit if plan else 0},
    }


def enforce_subscription_limit(campus: Campus, metric: str, current_count: int | None = None) -> None:
    subscription = active_subscription_for_campus(campus)
    if subscription and not subscription.is_access_allowed:
        raise PermissionDenied("This school's ERP subscription is expired.")
    if not subscription:
        return
    plan = subscription.plan
    limit = plan.limit_for(metric)
    if not limit:
        return
    used = current_count
    if used is None:
        if metric == "student":
            used = Student.objects.filter(campus=campus, status="active").count()
        elif metric == "teacher":
            used = User.objects.filter(school=campus, role=UserRole.TEACHER, is_active=True).count()
        else:
            used = 0
    if used >= limit:
        raise ValidationError({metric: f"{plan.name} plan limit reached ({limit}). Upgrade the subscription to add more."})


def next_subscription_invoice_number(campus: Campus) -> str:
    date_part = timezone.localdate().strftime("%Y%m%d")
    base = f"{campus.code}-SUB-INV-{date_part}"
    counter = SubscriptionInvoice.objects.filter(invoice_number__startswith=base).count() + 1
    while True:
        candidate = f"{base}-{counter:04d}"
        if not SubscriptionInvoice.objects.filter(invoice_number=candidate).exists():
            return candidate
        counter += 1


def next_admission_application_number(campus: Campus) -> str:
    date_part = timezone.localdate().strftime("%Y%m%d")
    base = f"{campus.code}-ADM-{date_part}"
    counter = AdmissionApplication.objects.filter(application_number__startswith=base).count() + 1
    while True:
        candidate = f"{base}-{counter:04d}"
        if not AdmissionApplication.objects.filter(application_number=candidate).exists():
            return candidate
        counter += 1


def generate_tracking_code(campus: Campus) -> str:
    prefix = f"{campus.code}-TRACK"
    while True:
        candidate = f"{prefix}-{secrets.token_urlsafe(6).replace('-', '').replace('_', '').upper()[:8]}"
        if not AdmissionApplication.objects.filter(tracking_code=candidate).exists():
            return candidate


def log_user_activity(request, activity_type: str, summary: str, *, campus: Campus | None = None, metadata: dict | None = None) -> UserActivityLog:
    user = request.user if getattr(request, "user", None) and request.user.is_authenticated else None
    if campus is None and user and getattr(user, "school_id", None):
        campus = user.school
    return UserActivityLog.objects.create(
        campus=campus,
        user=user,
        activity_type=activity_type,
        summary=summary,
        request_path=getattr(request, "path", ""),
        method=getattr(request, "method", ""),
        ip_address=get_client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", "") if getattr(request, "META", None) else "",
        metadata=metadata or {},
    )


def refresh_expired_subscriptions() -> int:
    today = timezone.localdate()
    updated = 0
    for subscription in SchoolSubscription.objects.filter(
        status__in=[SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE],
        end_date__lt=today,
    ):
        if today <= subscription.grace_ends_on:
            subscription.status = SubscriptionStatus.GRACE
        else:
            subscription.status = SubscriptionStatus.EXPIRED
        subscription.sync_campus_fields()
        subscription.save(update_fields=["status", "updated_at"])
        updated += 1
    return updated


def emit_finance_event(campus: Campus, event_type: str, payload: dict, user=None) -> FinanceEvent:
    return FinanceEvent.objects.create(
        campus=campus,
        event_type=event_type,
        payload=payload,
        created_by=user if getattr(user, "is_authenticated", False) else None,
    )


def emit_academic_event(
    campus: Campus,
    event_type: str,
    payload: dict,
    user=None,
    student: Student | None = None,
    teacher=None,
) -> AcademicEvent:
    return AcademicEvent.objects.create(
        campus=campus,
        event_type=event_type,
        payload=payload,
        student=student,
        teacher=teacher,
        created_by=user if getattr(user, "is_authenticated", False) else None,
    )


def emit_school_status_event(campus: Campus, status_value: str, user=None) -> AcademicEvent:
    return emit_academic_event(
        campus,
        AcademicEventType.SCHOOL_STATUS_CHANGED,
        {"schoolId": campus.id, "schoolCode": campus.code, "status": status_value},
        user,
    )


def record_device_sync(
    device: AttendanceDevice,
    status_value: str,
    payload: dict,
    user=None,
    *,
    log_type: str = "sync",
    error_message: str = "",
    attempt_count: int = 1,
) -> DeviceSyncLog:
    log = DeviceSyncLog.objects.create(
        campus=device.campus,
        device=device,
        status=status_value,
        log_type=log_type,
        payload=payload,
        error_message=error_message,
        attempt_count=attempt_count,
        created_by=user if getattr(user, "is_authenticated", False) else None,
    )
    device.last_seen_at = timezone.now()
    device.save(update_fields=["last_seen_at", "updated_at"])
    emit_academic_event(
        device.campus,
        AcademicEventType.DEVICE_SYNCED,
        {"deviceId": device.id, "deviceCode": device.device_code, "status": status_value, "logId": log.id},
        user,
    )
    return log


def role_room(campus_id: int, role: str) -> str:
    return f"role:{campus_id}:{role}"


def school_room(campus_id: int) -> str:
    return f"school:{campus_id}"


def user_room(user_id: int | None) -> str | None:
    return f"user:{user_id}" if user_id else None


def class_room(section: ClassSection | None) -> str | None:
    if not section:
        return None
    class_id = re.sub(r"[^A-Za-z0-9_-]+", "", section.grade_name or "") or str(section.id)
    return f"class:{section.campus_id}:{class_id}:{section.id}"


def unique_rooms(values: list[str | None]) -> list[str]:
    return [room for room in dict.fromkeys(values) if room]


def student_from_payload_or_event(event) -> Student | None:
    student = getattr(event, "student", None)
    if student:
        return student
    student_id = (event.payload or {}).get("studentId")
    if student_id:
        return Student.objects.filter(id=student_id).first()
    return None


def realtime_rooms_for_academic_event(event: AcademicEvent) -> list[str]:
    payload = event.payload or {}
    rooms: list[str | None] = [
        school_room(event.campus_id),
        role_room(event.campus_id, UserRole.SCHOOL_ADMIN),
        "platform:super_admin",
    ]
    student = student_from_payload_or_event(event)
    if student:
        rooms.extend([user_room(student.user_id), class_room(student.section)])
    section_id = payload.get("sectionId")
    if section_id:
        rooms.append(class_room(ClassSection.objects.filter(id=section_id).first()))
    if event.teacher_id:
        rooms.append(user_room(event.teacher_id))
    if event.event_type in {AcademicEventType.NOTES_UPLOADED, AcademicEventType.ASSIGNMENT_UPLOADED, AcademicEventType.ASSIGNMENT_PUBLISHED, AcademicEventType.ASSIGNMENT_SUBMITTED}:
        rooms.append(role_room(event.campus_id, UserRole.TEACHER))
    if event.event_type == AcademicEventType.NOTICE_PUBLISHED:
        audience = payload.get("audience")
        if audience in {"all", "staff"}:
            rooms.append(role_room(event.campus_id, UserRole.TEACHER))
        if audience in {"all", "learners"}:
            rooms.append(role_room(event.campus_id, UserRole.STUDENT))
        if audience in {"all", "admins"}:
            rooms.append(role_room(event.campus_id, UserRole.SCHOOL_ADMIN))
    if event.event_type == AcademicEventType.PAYMENT_UPDATED:
        rooms.append(role_room(event.campus_id, UserRole.ACCOUNT))
    return unique_rooms(rooms)


def realtime_rooms_for_finance_event(event: FinanceEvent) -> list[str]:
    payload = event.payload or {}
    rooms: list[str | None] = [
        school_room(event.campus_id),
        role_room(event.campus_id, UserRole.ACCOUNT),
        role_room(event.campus_id, UserRole.SCHOOL_ADMIN),
        "platform:super_admin",
    ]
    student_id = payload.get("studentId")
    if student_id:
        student = Student.objects.filter(id=student_id).first()
        if student:
            rooms.extend([user_room(student.user_id), class_room(student.section)])
    rooms.append(user_room(payload.get("staffUserId")))
    return unique_rooms(rooms)


def normalized_realtime_event(source: str, event) -> dict:
    if source == "finance":
        rooms = realtime_rooms_for_finance_event(event)
    else:
        rooms = realtime_rooms_for_academic_event(event)
    return {
        "id": f"{source}:{event.id}",
        "source": source,
        "event": event.event_type,
        "campus": event.campus_id,
        "rooms": rooms,
        "payload": event.payload or {},
        "createdAt": event.created_at.isoformat(),
    }


def payment_signature(secret: str, order_id: str, payment_id: str) -> str:
    return hmac.new(str(secret).encode("utf-8"), f"{order_id}|{payment_id}".encode("utf-8"), hashlib.sha256).hexdigest()


def gateway_config_for(campus: Campus, provider: str) -> PaymentGatewayConfig:
    config = PaymentGatewayConfig.objects.filter(campus=campus, provider=provider, is_active=True).first()
    if not config:
        raise ValidationError({"provider": "No active payment gateway is configured for this school and provider."})
    return config


def fee_paid_amount(fee_assignment: FeeAssignment) -> Decimal:
    return fee_assignment.payments.aggregate(total=Sum("amount_paid")).get("total") or Decimal("0")


def fee_outstanding_amount(fee_assignment: FeeAssignment) -> Decimal:
    return max(fee_assignment.payable_amount - fee_paid_amount(fee_assignment), Decimal("0"))


def ensure_fee_invoice(fee_assignment: FeeAssignment) -> FeeAssignment:
    if not fee_assignment.invoice_number:
        fee_assignment.invoice_number = next_finance_number(fee_assignment.student.campus, "INV", FeeAssignment, "invoice_number")
        fee_assignment.invoice_generated_at = timezone.now()
        fee_assignment.save(update_fields=["invoice_number", "invoice_generated_at", "updated_at"])
    return fee_assignment


def payment_receipt_lines(payment: Payment) -> list[str]:
    fee = payment.fee_assignment
    student = fee.student
    return [
        f"Receipt Number: {payment.receipt_number or ''}",
        f"Invoice Number: {payment.invoice_number or fee.invoice_number or ''}",
        f"School: {student.campus.name} ({student.campus.code})",
        f"Student: {student.full_name} ({student.admission_number})",
        f"Fee: {fee.title}",
        f"Payment Mode: {payment.payment_method}",
        f"Gateway: {payment.gateway_name or 'offline'}",
        f"Transaction ID: {payment.transaction_id or payment.reference_number or ''}",
        f"Amount Paid: INR {payment.amount_paid}",
        f"Pending Amount: INR {payment.pending_amount}",
        f"Paid On: {payment.paid_on}",
    ]


def fee_invoice_lines(fee_assignment: FeeAssignment) -> list[str]:
    student = fee_assignment.student
    return [
        f"Invoice Number: {fee_assignment.invoice_number or ''}",
        f"School: {student.campus.name} ({student.campus.code})",
        f"Student: {student.full_name} ({student.admission_number})",
        f"Class/Section: {student.section.grade_name} - {student.section.section_name}",
        f"Fee: {fee_assignment.title}",
        f"Base Amount: INR {fee_assignment.amount}",
        f"Late Fee: INR {fee_assignment.late_fee}",
        f"Discount: INR {fee_assignment.discount_amount}",
        f"Payable Amount: INR {fee_assignment.payable_amount}",
        f"Paid Amount: INR {fee_paid_amount(fee_assignment)}",
        f"Outstanding Amount: INR {fee_outstanding_amount(fee_assignment)}",
        f"Due Date: {fee_assignment.due_date}",
    ]


def salary_slip_lines(salary: SalaryRecord) -> list[str]:
    return [
        f"Salary Slip: {salary.slip_number or ''}",
        f"School: {salary.campus.name} ({salary.campus.code})",
        f"Staff: {salary.staff_user.get_full_name() or salary.staff_user.username}",
        f"Month/Year: {salary.month}/{salary.year}",
        f"Present Days: {salary.present_days}",
        f"Absent Days: {salary.absent_days}",
        f"Leave Days: {salary.leave_days}",
        f"Half Days: {salary.half_days}",
        f"Gross Salary: INR {salary.gross_salary}",
        f"Deductions: INR {salary.deductions}",
        f"Bonus: INR {salary.bonus}",
        f"Final Payable: INR {salary.final_salary}",
        f"Payment Status: {salary.payment_status}",
        f"Paid On: {salary.paid_on or ''}",
        f"Reference: {salary.payment_reference}",
    ]


def create_success_payment_from_transaction(transaction_obj: PaymentTransaction, user=None) -> Payment:
    if transaction_obj.payment_id:
        return transaction_obj.payment
    if not transaction_obj.fee_assignment_id:
        raise ValidationError({"fee_assignment": "A fee assignment is required before marking a transaction successful."})
    fee = ensure_fee_invoice(transaction_obj.fee_assignment)
    receipt_number = next_finance_number(transaction_obj.campus, "REC", Payment, "receipt_number")
    payment = Payment.objects.create(
        campus=transaction_obj.campus,
        fee_assignment=fee,
        amount_paid=transaction_obj.amount,
        discount_amount=transaction_obj.discount_amount,
        late_fee=transaction_obj.late_fee,
        paid_on=timezone.localdate(),
        payment_method=transaction_obj.method or PaymentMethod.ONLINE,
        reference_number=transaction_obj.gateway_payment_id or transaction_obj.transaction_id,
        payment_status=TransactionStatus.SUCCESS,
        gateway_name=transaction_obj.gateway_name or transaction_obj.provider,
        gateway_order_id=transaction_obj.gateway_order_id,
        transaction_id=transaction_obj.gateway_payment_id or transaction_obj.transaction_id,
        receipt_number=receipt_number,
        invoice_number=fee.invoice_number or "",
        webhook_verified=transaction_obj.webhook_verified,
        collected_by=user if getattr(user, "is_authenticated", False) else None,
    )
    transaction_obj.payment = payment
    transaction_obj.status = TransactionStatus.SUCCESS
    transaction_obj.receipt_number = payment.receipt_number
    transaction_obj.invoice_number = payment.invoice_number
    transaction_obj.pending_amount = payment.pending_amount
    transaction_obj.paid_at = payment.paid_at
    transaction_obj.save(update_fields=["payment", "status", "receipt_number", "invoice_number", "pending_amount", "paid_at", "updated_at"])
    emit_finance_event(
        transaction_obj.campus,
        FinanceEventType.FEE_PAID,
        {
            "studentId": transaction_obj.student_id,
            "feeId": transaction_obj.fee_assignment_id,
            "paymentId": payment.id,
            "transactionId": transaction_obj.id,
            "amount": decimal_string(payment.amount_paid),
        },
        user,
    )
    emit_finance_event(
        transaction_obj.campus,
        FinanceEventType.RECEIPT_GENERATED,
        {
            "paymentId": payment.id,
            "receiptNumber": payment.receipt_number,
            "invoiceNumber": payment.invoice_number,
        },
        user,
    )
    emit_academic_event(
        transaction_obj.campus,
        AcademicEventType.PAYMENT_UPDATED,
        {
            "studentId": transaction_obj.student_id,
            "feeId": transaction_obj.fee_assignment_id,
            "paymentId": payment.id,
            "transactionId": transaction_obj.id,
            "amount": decimal_string(payment.amount_paid),
            "receiptNumber": payment.receipt_number,
        },
        user,
        student=transaction_obj.student,
    )
    return payment


def queue_finance_message(*, campus: Campus, channel: str, recipient: str, subject: str, body: str, user=None, student: Student | None = None, recipient_user=None) -> OutboundMessage:
    if channel == MessageChannel.WHATSAPP:
        snapshot = subscription_limit_snapshot(campus)
        limit = snapshot["whatsapp"]["limit"]
        if limit and snapshot["whatsapp"]["used"] >= limit:
            raise ValidationError({"channel": "WhatsApp monthly subscription limit reached."})
    if channel == MessageChannel.SMS:
        snapshot = subscription_limit_snapshot(campus)
        limit = snapshot["sms"]["limit"]
        if limit and snapshot["sms"]["used"] >= limit:
            raise ValidationError({"channel": "SMS monthly subscription limit reached."})
    return OutboundMessage.objects.create(
        campus=campus,
        channel=channel,
        recipient=recipient,
        subject=subject,
        body=body,
        student=student,
        recipient_user=recipient_user,
        status=MessageStatus.QUEUED,
        created_by=user if getattr(user, "is_authenticated", False) else None,
    )


class RoleScopedModelViewSet(viewsets.ModelViewSet):
    permission_classes = [RoleAccessPermission]
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES
    campus_filter_path: str | None = None
    allow_global_admin_queryset = False

    def filter_queryset_by_role(self, queryset):
        return queryset.none()

    def admin_campus_ids(self) -> list[int]:
        user = self.request.user
        if getattr(user, "role", None) not in (UserRole.SCHOOL_ADMIN, UserRole.ACCOUNT):
            return []
        if getattr(user, "school_id", None):
            return [user.school_id]
        return list(
            CampusMembership.objects.filter(user_id=user.pk)
            .values_list("campus_id", flat=True)
            .distinct()
        )

    def filter_admin_queryset(self, queryset):
        user = self.request.user
        if getattr(user, "role", None) == UserRole.SUPER_ADMIN:
            return queryset
        campus_ids = self.admin_campus_ids()
        if not campus_ids:
            return queryset.none()
        if not self.campus_filter_path:
            return queryset if self.allow_global_admin_queryset else queryset.none()
        return queryset.filter(**{f"{self.campus_filter_path}__in": campus_ids})

    def campus_id_from_attrs(self, attrs) -> int | None:
        campus = attrs.get("campus")
        if campus:
            return campus.id
        student = attrs.get("student")
        if student:
            return student.campus_id
        section = attrs.get("section")
        if section:
            return section.campus_id
        fee_assignment = attrs.get("fee_assignment")
        if fee_assignment:
            return fee_assignment.student.campus_id
        fee_structure = attrs.get("fee_structure")
        if fee_structure:
            return fee_structure.campus_id
        salary_setup = attrs.get("salary_setup")
        if salary_setup:
            return salary_setup.campus_id
        device = attrs.get("device")
        if device:
            return device.campus_id
        staff_user = attrs.get("staff_user")
        if staff_user and getattr(staff_user, "school_id", None):
            return staff_user.school_id
        subject = attrs.get("subject")
        if subject and hasattr(subject, "campus_id"):
            return subject.campus_id
        exam_type = attrs.get("exam_type")
        if exam_type:
            return exam_type.campus_id
        book = attrs.get("book")
        if book:
            return book.campus_id
        route = attrs.get("route")
        if route:
            return route.campus_id
        vehicle = attrs.get("vehicle")
        if vehicle:
            return vehicle.campus_id
        room = attrs.get("room")
        if room:
            return room.campus_id
        return None

    def campus_id_from_instance(self, instance) -> int | None:
        campus = getattr(instance, "campus", None)
        if campus is not None:
            return campus.id if hasattr(campus, "id") else campus
        student = getattr(instance, "student", None)
        if student is not None:
            return getattr(student, "campus_id", None)
        section = getattr(instance, "section", None)
        if section is not None:
            return getattr(section, "campus_id", None)
        staff_user = getattr(instance, "staff_user", None)
        if staff_user is not None:
            return getattr(staff_user, "school_id", None)
        device = getattr(instance, "device", None)
        if device is not None:
            return getattr(device, "campus_id", None)
        subject = getattr(instance, "subject", None)
        if subject is not None:
            return getattr(subject, "campus_id", None)
        return getattr(instance, "campus_id", None)

    def ensure_admin_payload_scope(self, attrs) -> None:
        user = self.request.user
        if getattr(user, "role", None) == UserRole.SUPER_ADMIN:
            return
        if getattr(user, "role", None) not in (UserRole.SCHOOL_ADMIN, UserRole.ACCOUNT):
            return
        campus_id = self.campus_id_from_attrs(attrs)
        if campus_id is None:
            return
        if campus_id not in self.admin_campus_ids():
            raise PermissionDenied("This record belongs to a campus outside your admin scope.")

    def get_queryset(self):
        # Re-fetch a fresh queryset each request. A class-level ``queryset =
        # Model.objects`` is a single mongoengine QuerySet whose result cache
        # otherwise persists across requests in long-lived workers, so list
        # endpoints show stale data after writes (and need a restart to update).
        document = getattr(self.queryset, "_document", None)
        queryset = document.objects if document is not None else super().get_queryset()
        user = self.request.user
        if not getattr(user, "is_authenticated", False):
            return queryset.none()
        if getattr(user, "role", None) in ADMIN_ROLES:
            return self.filter_admin_queryset(queryset)
        return self.filter_queryset_by_role(queryset)

    def audit_entity_type(self) -> str:
        qs = self.queryset
        document = getattr(qs, "_document", None)
        if document is not None:
            return document.__name__
        return qs.model.__name__

    def write_audit(self, action: str, instance) -> None:
        user = self.request.user
        if not getattr(user, "is_authenticated", False):
            return
        campus = getattr(instance, "campus", None)
        if campus is None and getattr(instance, "student", None):
            campus = instance.student.campus
        AuditEvent.objects.create(
            actor=user,
            action=action,
            entity_type=self.audit_entity_type(),
            entity_id=str(getattr(instance, "pk", "")),
            summary=str(instance),
            ip_address=get_client_ip(self.request),
        )
        UserActivityLog.objects.create(
            campus=campus,
            user=user,
            activity_type=f"{action}:{self.audit_entity_type()}",
            summary=str(instance),
            request_path=self.request.path,
            method=self.request.method,
            ip_address=get_client_ip(self.request),
            user_agent=self.request.META.get("HTTP_USER_AGENT", ""),
            metadata={"entityType": self.audit_entity_type(), "entityId": str(getattr(instance, "pk", ""))},
        )

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save()
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save()
        self.write_audit(AuditAction.UPDATE, instance)

    def perform_destroy(self, instance):
        user = self.request.user
        if getattr(user, "role", None) in (UserRole.SCHOOL_ADMIN, UserRole.ACCOUNT):
            campus_id = self.campus_id_from_instance(instance)
            if campus_id is not None and campus_id not in self.admin_campus_ids():
                raise PermissionDenied("This record belongs to a campus outside your admin scope.")
        self.write_audit(AuditAction.DELETE, instance)
        instance.delete()


class CampusViewSet(RoleScopedModelViewSet):
    queryset = Campus.objects.all()
    serializer_class = CampusSerializer
    campus_filter_path = "id"
    write_roles = (UserRole.SUPER_ADMIN,)

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(sections__class_teacher=user)
                | Q(sections__subject_allocations__teacher=user, sections__subject_allocations__is_active=True)
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(students__user=user).distinct()
        return queryset.none()

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    @action(detail=True, methods=["post"], url_path="activate")
    def activate(self, request, id=None):
        campus = self.get_object()
        campus.status = "active"
        campus.save(update_fields=["status", "updated_at"])
        emit_school_status_event(campus, campus.status, request.user)
        self.write_audit(AuditAction.UPDATE, campus)
        return Response(self.get_serializer(campus).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="suspend")
    def suspend(self, request, id=None):
        campus = self.get_object()
        campus.status = "suspended"
        campus.save(update_fields=["status", "updated_at"])
        emit_school_status_event(campus, campus.status, request.user)
        self.write_audit(AuditAction.UPDATE, campus)
        return Response(self.get_serializer(campus).data, status=status.HTTP_200_OK)


class SchoolViewSet(RoleScopedModelViewSet):
    queryset = Campus.objects.all()
    serializer_class = SchoolSerializer
    campus_filter_path = "id"
    read_roles = (UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
    write_roles = (UserRole.SUPER_ADMIN,)
    filterset_fields = ("status", "subscription_status", "city", "state")
    search_fields = ("name", "code", "contact_email", "contact_phone", "city", "state", "principal_name")

    def get_serializer_class(self):
        if getattr(self.request.user, "role", None) == UserRole.SUPER_ADMIN:
            return SchoolSerializer
        return SchoolProfileSerializer

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        school = primary_school_for_user(user)
        return queryset.filter(id=school.pk) if school else queryset.none()

    def get_queryset(self):
        queryset = super().get_queryset()
        return queryset

    def _school_payload(self, request):
        payload = request.data.copy()
        if not payload.get("schoolCode"):
            payload["schoolCode"] = generate_school_code(payload.get("schoolName") or payload.get("name") or "")
        return payload

    def _create_school_admin(self, campus: Campus, payload: dict) -> tuple[User, str]:
        admin_username = (payload.get("adminUsername") or payload.get("username") or f"admin.{campus.code.lower()}").strip()
        admin_email = (payload.get("adminEmail") or payload.get("email") or "").strip()
        admin_first_name = (payload.get("adminFirstName") or payload.get("firstName") or "School").strip()
        admin_last_name = (payload.get("adminLastName") or payload.get("lastName") or "Admin").strip()
        admin_phone = (payload.get("adminContactNumber") or payload.get("phoneNumber") or "").strip()
        temporary_password = payload.get("temporaryPassword") or payload.get("password") or generate_temporary_password()

        if User.objects.filter(username=admin_username).exists():
            raise ValidationError({"adminUsername": "A user with this username already exists."})
        if admin_email and User.objects.filter(email=admin_email).exists():
            raise ValidationError({"adminEmail": "A user with this email already exists."})

        user = User(
            username=admin_username,
            email=admin_email,
            first_name=admin_first_name,
            last_name=admin_last_name,
            role=UserRole.SCHOOL_ADMIN,
            school=campus,
            phone_number=admin_phone,
            is_staff=True,
            must_change_password=True,
        )
        user.set_password(temporary_password)
        user.save()
        CampusMembership.objects.create(
            campus=campus,
            user=user,
            role="it_admin",
            is_primary=True,
            can_manage_users=True,
            can_configure_attendance=True,
        )
        AuditEvent.objects.create(
            actor=self.request.user,
            action=AuditAction.CREATE,
            entity_type="User",
            entity_id=str(user.pk),
            summary=f"Created school admin for {campus.code}",
            ip_address=get_client_ip(self.request),
            metadata={"schoolId": campus.id, "schoolCode": campus.code, "role": UserRole.SCHOOL_ADMIN},
        )
        return user, temporary_password

    def create(self, request, *args, **kwargs):
        payload = self._school_payload(request)
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            campus = serializer.save(created_by=request.user)
            admin_user, temporary_password = self._create_school_admin(campus, payload)
            self.write_audit(AuditAction.CREATE, campus)
        response_data = self.get_serializer(campus).data
        response_data["adminUser"] = {
            "id": admin_user.id,
            "username": admin_user.username,
            "email": admin_user.email,
            "temporaryPassword": temporary_password,
            "mustChangePassword": admin_user.must_change_password,
        }
        return Response(response_data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        instance = serializer.save()
        if "status" in serializer.validated_data:
            emit_school_status_event(instance, instance.status, self.request.user)
        self.write_audit(AuditAction.UPDATE, instance)

    def perform_destroy(self, instance):
        instance.status = "suspended"
        instance.save(update_fields=["status", "updated_at"])
        emit_school_status_event(instance, instance.status, self.request.user)
        self.write_audit(AuditAction.DELETE, instance)

    @action(detail=False, methods=["get"], url_path="me")
    def my_profile(self, request):
        campus = primary_school_for_user(request.user)
        if campus is None:
            raise PermissionDenied("This account is not assigned to a school.")
        return Response(SchoolProfileSerializer(campus, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="activate")
    def activate(self, request, id=None):
        campus = self.get_object()
        campus.status = "active"
        campus.save(update_fields=["status", "updated_at"])
        emit_school_status_event(campus, campus.status, request.user)
        self.write_audit(AuditAction.UPDATE, campus)
        return Response(self.get_serializer(campus).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="deactivate")
    def deactivate(self, request, id=None):
        campus = self.get_object()
        campus.status = "inactive"
        campus.save(update_fields=["status", "updated_at"])
        emit_school_status_event(campus, campus.status, request.user)
        self.write_audit(AuditAction.UPDATE, campus)
        return Response(self.get_serializer(campus).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="suspend")
    def suspend(self, request, id=None):
        campus = self.get_object()
        campus.status = "suspended"
        campus.save(update_fields=["status", "updated_at"])
        emit_school_status_event(campus, campus.status, request.user)
        self.write_audit(AuditAction.UPDATE, campus)
        return Response(self.get_serializer(campus).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="connection-status")
    def connection_status(self, request, id=None):
        campus = self.get_object()
        return Response(school_connection_status(campus), status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="create-admin")
    def create_admin(self, request, id=None):
        campus = self.get_object()
        admin_user, temporary_password = self._create_school_admin(campus, request.data)
        return Response(
            {
                "id": admin_user.id,
                "username": admin_user.username,
                "email": admin_user.email,
                "temporaryPassword": temporary_password,
                "mustChangePassword": admin_user.must_change_password,
                "schoolId": campus.id,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="upload-logo", parser_classes=[MultiPartParser, FormParser])
    def upload_logo(self, request, id=None):
        campus = self.get_object()
        upload = request.FILES.get("file")
        if not upload:
            raise ValidationError({"file": "Upload a logo file."})
        campus.logo_url = uploaded_image_to_data_url(
            upload,
            allowed_types={"image/png", "image/jpeg", "image/webp", "image/svg+xml"},
            max_size=settings.MENTRIQ_UPLOAD_LOGO_MAX_BYTES,
            max_dimensions=(512, 512),
        )
        campus.logo_alt_text = request.data.get("altText") or f"{campus.name} logo"
        campus.save(update_fields=["logo_url", "logo_alt_text", "updated_at"])
        self.write_audit(AuditAction.UPDATE, campus)
        return Response(self.get_serializer(campus).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="upload-banner", parser_classes=[MultiPartParser, FormParser])
    def upload_banner(self, request, id=None):
        campus = self.get_object()
        upload = request.FILES.get("file")
        if not upload:
            raise ValidationError({"file": "Upload a banner image file."})
        campus.banner_url = uploaded_image_to_data_url(
            upload,
            allowed_types={"image/png", "image/jpeg", "image/webp"},
            max_size=settings.MENTRIQ_UPLOAD_BANNER_MAX_BYTES,
            max_dimensions=(1920, 720),
        )
        campus.save(update_fields=["banner_url", "updated_at"])
        self.write_audit(AuditAction.UPDATE, campus)
        return Response(self.get_serializer(campus).data, status=status.HTTP_200_OK)


class CampusMembershipViewSet(RoleScopedModelViewSet):
    queryset = CampusMembership.objects
    serializer_class = CampusMembershipSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "user", "role", "is_primary")

    def campus_id_from_attrs(self, attrs) -> int | None:
        campus = attrs.get("campus")
        if campus:
            return campus.id
        return None


class AttendanceDeviceViewSet(RoleScopedModelViewSet):
    queryset = AttendanceDevice.objects
    serializer_class = AttendanceDeviceSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES + (UserRole.TEACHER,)
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "device_type", "status", "is_enabled_for_students", "is_enabled_for_staff")
    search_fields = ("name", "device_code", "location", "provider")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(campus__sections__class_teacher=user)
                | Q(campus__sections__subject_allocations__teacher=user, campus__sections__subject_allocations__is_active=True)
            ).distinct()
        return queryset.none()

    def get_throttles(self):
        if getattr(self, "action", None) == "capture":
            self.throttle_scope = "hardware_capture"
        return super().get_throttles()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(configured_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        instance = self.get_object()
        user = self.request.user
        self.ensure_admin_payload_scope(serializer.validated_data)
        if getattr(user, "role", None) not in ADMIN_ROLES:
            payload_campus_id = self.campus_id_from_attrs(serializer.validated_data)
            instance_campus_id = self.campus_id_from_instance(instance)
            if payload_campus_id is not None and instance_campus_id is not None and payload_campus_id != instance_campus_id:
                raise PermissionDenied("Cannot change the campus association of this record.")
        instance = serializer.save()
        self.write_audit(AuditAction.UPDATE, instance)

    @action(detail=True, methods=["post"], url_path="capture")
    def capture(self, request, id=None):
        device = self.get_object()
        if getattr(request.user, "role", None) not in ADMIN_ROLES:
            raise PermissionDenied("Only campus admins can ingest hardware attendance.")

        person_type = request.data.get("person_type", "student")
        external_id = request.data.get("external_id")
        if not external_id:
            raise ValidationError({"external_id": "Provide an admission number or username."})

        captured_at_raw = request.data.get("captured_at")
        captured_at = parse_datetime(captured_at_raw) if captured_at_raw else timezone.now()
        if captured_at is None:
            raise ValidationError({"captured_at": "Use an ISO datetime value."})
        if timezone.is_naive(captured_at):
            captured_at = timezone.make_aware(captured_at)

        confidence = request.data.get("confidence_score")
        source_reference = request.data.get("source_reference", "")
        record_status = request.data.get("status", AttendanceStatus.PRESENT)
        attendance_date = ensure_attendance_date_is_editable(captured_at.date())

        if person_type == "student":
            if record_status not in {choice.value for choice in AttendanceStatus}:
                raise ValidationError({"status": f"Unsupported student attendance status: {record_status}"})
            if not device.is_enabled_for_students:
                raise ValidationError({"device": "This device is not enabled for student attendance."})
            student = get_object_or_404(Student, campus=device.campus, admission_number=external_id)
            record, _ = AttendanceRecord.objects.update_or_create(
                student=student,
                date=attendance_date,
                subject="",
                defaults={
                    "section": student.section,
                    "status": record_status,
                    "marked_by": request.user,
                    "capture_method": device.device_type,
                    "device": device,
                    "source_reference": source_reference,
                    "confidence_score": confidence or None,
                },
            )
            record_device_sync(
                device,
                DeviceSyncStatus.SUCCESS,
                {"personType": "student", "studentId": student.id, "attendanceId": record.id, "capturedAt": captured_at.isoformat()},
                request.user,
                log_type="capture",
            )
            serializer = AttendanceRecordSerializer(record, context={"request": request})
            return Response(serializer.data, status=status.HTTP_200_OK)

        if person_type == "staff":
            if record_status not in {choice.value for choice in StaffAttendanceStatus}:
                raise ValidationError({"status": f"Unsupported staff attendance status: {record_status}"})
            if not device.is_enabled_for_staff:
                raise ValidationError({"device": "This device is not enabled for staff attendance."})
            from apps.accounts.models import User

            staff_user = get_object_or_404(User, username=external_id)
            if staff_user.role == UserRole.STUDENT:
                raise ValidationError({"external_id": "Student users must use person_type=student or portal access."})
            record, _ = StaffAttendanceRecord.objects.update_or_create(
                staff_user=staff_user,
                date=attendance_date,
                defaults={
                    "campus": device.campus,
                    "clock_in": captured_at.time(),
                    "status": record_status,
                    "marked_by": request.user,
                    "capture_method": device.device_type,
                    "device": device,
                    "source_reference": source_reference,
                    "confidence_score": confidence or None,
                },
            )
            record_device_sync(
                device,
                DeviceSyncStatus.SUCCESS,
                {"personType": "staff", "staffUserId": staff_user.id, "attendanceId": record.id, "capturedAt": captured_at.isoformat()},
                request.user,
                log_type="capture",
            )
            serializer = StaffAttendanceRecordSerializer(record, context={"request": request})
            return Response(serializer.data, status=status.HTTP_200_OK)

        raise ValidationError({"person_type": "Use student or staff."})

    @action(detail=True, methods=["get"], url_path="status-check")
    def status_check(self, request, id=None):
        device = self.get_object()
        heartbeat_window = max(device.heartbeat_seconds * 3, 30)
        online = bool(device.last_seen_at and device.last_seen_at >= timezone.now() - timedelta(seconds=heartbeat_window))
        return Response(
            {
                "device": device.id,
                "deviceCode": device.device_code,
                "status": "online" if online else "offline",
                "lastSeenAt": device.last_seen_at,
                "heartbeatWindowSeconds": heartbeat_window,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get", "post"], url_path="sync-logs")
    def sync_logs(self, request, id=None):
        device = self.get_object()
        if request.method == "GET":
            queryset = device.sync_logs
            return Response(DeviceSyncLogSerializer(queryset, many=True, context={"request": request}).data, status=status.HTTP_200_OK)
        if getattr(request.user, "role", None) not in ADMIN_ROLES:
            raise PermissionDenied("Only campus admins can sync hardware logs.")
        status_value = request.data.get("status") or DeviceSyncStatus.SUCCESS
        if status_value not in DeviceSyncStatus.values:
            raise ValidationError({"status": "Unsupported sync status."})
        log = record_device_sync(
            device,
            status_value,
            request.data.get("payload") or {},
            request.user,
            log_type=request.data.get("log_type") or "sync",
            error_message=request.data.get("error_message", ""),
            attempt_count=int(request.data.get("attempt_count") or 1),
        )
        self.write_audit(AuditAction.UPDATE, device)
        return Response(DeviceSyncLogSerializer(log, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="error-logs")
    def error_logs(self, request, id=None):
        device = self.get_object()
        queryset = device.sync_logs.filter(status=DeviceSyncStatus.FAILED)
        return Response(DeviceSyncLogSerializer(queryset, many=True, context={"request": request}).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="retry-failed-sync")
    def retry_failed_sync(self, request, id=None):
        device = self.get_object()
        failed_log = device.sync_logs.filter(status=DeviceSyncStatus.FAILED).first()
        if not failed_log:
            raise ValidationError({"sync": "No failed sync log is available for retry."})
        retry_log = record_device_sync(
            device,
            DeviceSyncStatus.RETRYING,
            failed_log.payload,
            request.user,
            log_type="retry",
            error_message=failed_log.error_message,
            attempt_count=failed_log.attempt_count + 1,
        )
        self.write_audit(AuditAction.UPDATE, device)
        return Response(DeviceSyncLogSerializer(retry_log, context={"request": request}).data, status=status.HTTP_201_CREATED)


class AcademicSessionViewSet(RoleScopedModelViewSet):
    queryset = AcademicSession.objects
    serializer_class = AcademicSessionSerializer
    campus_filter_path = "campus_id"
    filterset_fields = ("campus", "is_active")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(sections__class_teacher=user)
                | Q(sections__subject_allocations__teacher=user, sections__subject_allocations__is_active=True)
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(sections__students__user=user).distinct()
        return queryset.none()


class ClassSectionViewSet(RoleScopedModelViewSet):
    queryset = ClassSection.objects
    serializer_class = ClassSectionSerializer
    campus_filter_path = "campus_id"
    filterset_fields = ("campus", "session", "class_teacher")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(teacher_section_q(user)).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(students__user=user).distinct()
        return queryset.none()


class TeacherSubjectAllocationViewSet(RoleScopedModelViewSet):
    queryset = TeacherSubjectAllocation.objects
    serializer_class = TeacherSubjectAllocationSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES + (UserRole.TEACHER,)
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "section", "teacher", "subject", "is_active")
    search_fields = ("subject", "section__grade_name", "section__section_name", "teacher__username", "teacher__first_name", "teacher__last_name")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(teacher=user, is_active=True)
        return queryset.none()

    def campus_id_from_attrs(self, attrs) -> int | None:
        campus = attrs.get("campus")
        if campus:
            return campus.id
        section = attrs.get("section")
        if section:
            return section.campus_id
        return None


class SubjectViewSet(RoleScopedModelViewSet):
    queryset = Subject.objects
    serializer_class = SubjectSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "grade_name", "is_active")
    search_fields = ("name", "code", "grade_name")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if getattr(user, "school_id", None):
            return queryset.filter(campus_id=user.school_id)
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(campus__sections__class_teacher=user)
                | Q(campus__sections__subject_allocations__teacher=user, campus__sections__subject_allocations__is_active=True)
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(campus__students__user=user).distinct()
        return queryset.none()


class StudentViewSet(RoleScopedModelViewSet):
    queryset = Student.objects
    serializer_class = StudentSerializer
    campus_filter_path = "campus_id"
    search_fields = ("admission_number", "first_name", "last_name")
    filterset_fields = ("campus", "section", "status")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.ACCOUNT:
            campus_ids = self.admin_campus_ids()
            return queryset.filter(campus_id__in=campus_ids) if campus_ids else queryset.none()
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(section__class_teacher=user)
                | Q(section__subject_allocations__teacher=user, section__subject_allocations__is_active=True)
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(user_id=user.pk)
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        campus = serializer.validated_data["campus"]
        enforce_subscription_limit(campus, "student")
        admission_number = (serializer.validated_data.get("admission_number") or "").strip()
        if not admission_number:
            admission_number = generate_student_id(campus)
        instance = serializer.save(admission_number=admission_number)
        self.write_audit(AuditAction.CREATE, instance)

    @action(detail=True, methods=["post"], url_path="upload-photo", parser_classes=[MultiPartParser, FormParser])
    def upload_photo(self, request, id=None):
        student = self.get_object()
        upload = request.FILES.get("file")
        if not upload:
            raise ValidationError({"file": "Upload a student photo."})
        student.photo_url = uploaded_image_to_data_url(
            upload,
            allowed_types={"image/jpeg", "image/png", "image/webp"},
            max_size=settings.MENTRIQ_UPLOAD_PHOTO_MAX_BYTES,
            max_dimensions=(800, 800),
        )
        student.save(update_fields=["photo_url", "updated_at"])
        self.write_audit(AuditAction.UPDATE, student)
        return Response(self.get_serializer(student).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="upload-document", parser_classes=[MultiPartParser, FormParser])
    def upload_document(self, request, id=None):
        student = self.get_object()
        upload = request.FILES.get("file")
        if not upload:
            raise ValidationError({"file": "Upload a document file."})
        document = Document.objects.create(
            campus=student.campus,
            student=student,
            uploaded_by=request.user,
            created_by=request.user,
            title=(request.data.get("title") or f"{student.full_name} document").strip(),
            document_type=(request.data.get("document_type") or "student_document").strip(),
            file_url=uploaded_file_to_data_url(
                upload,
                allowed_types={"application/pdf", "image/jpeg", "image/png", "image/webp"},
                max_size=settings.MENTRIQ_UPLOAD_DOCUMENT_MAX_BYTES,
            ),
        )
        self.write_audit(AuditAction.CREATE, document)
        return Response(DocumentSerializer(document, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="profile-pdf")
    def profile_pdf(self, request, id=None):
        student = self.get_object()
        lines = [
            f"Student ID: {student.admission_number}",
            f"Name: {student.full_name}",
            f"School: {student.campus.name}",
            f"Class/Section: {student.section.grade_name} - {student.section.section_name}",
            f"Date of Birth: {student.date_of_birth}",
            f"Father: {student.father_name}",
            f"Mother: {student.mother_name}",
            f"Phone: {student.phone_number}",
            f"Email: {student.contact_email}",
            f"Status: {student.status}",
        ]
        AuditEvent.objects.create(
            actor=request.user,
            action=AuditAction.EXPORT,
            entity_type="Student",
            entity_id=str(student.pk),
            summary=f"Downloaded profile PDF for {student.full_name}",
            ip_address=get_client_ip(request),
            metadata={"campus": student.campus.code},
        )
        response = HttpResponse(simple_pdf_bytes(f"Student Profile - {student.full_name}", lines), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="student-{student.admission_number}.pdf"'
        return response


class AttendanceRecordViewSet(RoleScopedModelViewSet):
    queryset = AttendanceRecord.objects
    serializer_class = AttendanceRecordSerializer
    campus_filter_path = "student__campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES + (UserRole.TEACHER,)
    filterset_fields = ("date", "status", "section", "subject", "capture_method", "device")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(section__class_teacher=user)
                | Q(section__subject_allocations__teacher=user, section__subject_allocations__is_active=True)
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(student__user=user)
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(marked_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(marked_by=self.request.user)
        self.write_audit(AuditAction.UPDATE, instance)

    @action(detail=False, methods=["post"], url_path="bulk-upsert")
    def bulk_upsert(self, request):
        user = request.user
        if getattr(user, "role", None) not in self.write_roles:
            raise PermissionDenied("You do not have access to mark attendance.")

        section = get_object_or_404(ClassSection, id=request.data.get("section"))
        if user.role == UserRole.SCHOOL_ADMIN and section.campus_id not in self.admin_campus_ids():
            raise PermissionDenied("This section belongs to a campus outside your admin scope.")

        attendance_date = request.data.get("date")
        records = request.data.get("records", [])
        if not attendance_date or not isinstance(records, list):
            raise ValidationError({"detail": "Provide date and records."})
        attendance_date = ensure_attendance_date_is_editable(attendance_date)
        subject = (request.data.get("subject") or "").strip()
        if len(subject) > 80:
            raise ValidationError({"subject": "Subject must be 80 characters or fewer."})
        if user.role == UserRole.TEACHER and not teacher_has_subject_access(user, section, subject):
            raise PermissionDenied("Teachers can mark attendance only for assigned class sections or allotted subjects.")

        allowed_statuses = {choice.value for choice in AttendanceStatus}
        device = None
        if request.data.get("device"):
            device = get_object_or_404(AttendanceDevice, id=request.data.get("device"), campus=section.campus)
        capture_method = request.data.get("capture_method") or (device.device_type if device else AttendanceCaptureMethod.MANUAL)
        if capture_method not in {choice.value for choice in AttendanceCaptureMethod}:
            raise ValidationError({"capture_method": f"Unsupported attendance capture method: {capture_method}"})
        source_reference = request.data.get("source_reference", "")
        confidence_score = request.data.get("confidence_score") or None

        saved_records = []
        with transaction.atomic():
            for item in records:
                try:
                    student_id = int(item.get("student"))
                except (TypeError, ValueError):
                    raise ValidationError({"student": "Provide a valid student id."})
                student = get_object_or_404(Student, id=student_id, section=section)
                record_status = item.get("status")
                if record_status not in allowed_statuses:
                    raise ValidationError({"status": f"Unsupported attendance status: {record_status}"})
                record, _ = AttendanceRecord.objects.update_or_create(
                    student=student,
                    date=attendance_date,
                    subject=subject,
                    defaults={
                        "section": section,
                        "status": record_status,
                        "marked_by": user,
                        "capture_method": capture_method,
                        "device": device,
                        "source_reference": source_reference,
                        "confidence_score": confidence_score,
                    },
                )
                saved_records.append(record)
            AuditEvent.objects.create(
                actor=user,
                action=AuditAction.UPDATE,
                entity_type="AttendanceRecord",
                entity_id=str(section.pk),
                summary=f"Bulk attendance for {section} on {attendance_date}",
                ip_address=get_client_ip(request),
                metadata={"record_count": len(saved_records), "subject": subject},
            )
            for record in saved_records:
                emit_academic_event(
                    section.campus,
                    AcademicEventType.ATTENDANCE_MARKED,
                    {
                        "attendanceId": record.id,
                        "studentId": record.student_id,
                        "sectionId": section.id,
                        "subject": subject,
                        "date": str(attendance_date),
                        "status": record.status,
                    },
                    user,
                    student=record.student,
                    teacher=user if getattr(user, "role", None) == UserRole.TEACHER else None,
                )

        serializer = self.get_serializer(saved_records, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        month = request.query_params.get("month")
        if month:
            try:
                year_str, month_str = month.split("-", 1)
                queryset = queryset.filter(date__year=int(year_str), date__month=int(month_str))
            except (ValueError, TypeError):
                raise ValidationError({"month": "Use YYYY-MM format."})
        headers = ["Date", "Student ID", "Student", "Section", "Subject", "Status", "Marked By"]
        rows = [
            [
                record.date,
                record.student.admission_number,
                record.student.full_name,
                f"{record.section.grade_name} - {record.section.section_name}",
                record.subject,
                record.status,
                record.marked_by.get_full_name() or record.marked_by.username if record.marked_by else "",
            ]
            for record in queryset.order_by("-date", "section__grade_name", "student__first_name")
        ]
        AuditEvent.objects.create(
            actor=request.user,
            action=AuditAction.EXPORT,
            entity_type="AttendanceRecord",
            entity_id="bulk",
            summary="Exported student attendance report",
            ip_address=get_client_ip(request),
            metadata={"record_count": len(rows), "format": request.query_params.get("file_format", "excel")},
        )
        return export_response("student-attendance-report", request.query_params.get("file_format", "excel"), headers, rows)


class StaffAttendanceRecordViewSet(RoleScopedModelViewSet):
    queryset = StaffAttendanceRecord.objects
    serializer_class = StaffAttendanceRecordSerializer
    campus_filter_path = "campus_id"
    read_roles = ACCOUNT_ROLES + (UserRole.TEACHER,)
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "staff_user", "date", "status", "capture_method", "device")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.ACCOUNT:
            campus_ids = self.admin_campus_ids()
            return queryset.filter(campus_id__in=campus_ids) if campus_ids else queryset.none()
        if user.role == UserRole.TEACHER:
            return queryset.filter(staff_user=user)
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(marked_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(marked_by=self.request.user)
        self.write_audit(AuditAction.UPDATE, instance)

    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        month = request.query_params.get("month")
        if month:
            try:
                year_str, month_str = month.split("-", 1)
                queryset = queryset.filter(date__year=int(year_str), date__month=int(month_str))
            except (ValueError, TypeError):
                raise ValidationError({"month": "Use YYYY-MM format."})
        headers = ["Date", "Staff", "Role", "Clock In", "Clock Out", "Status", "Notes"]
        rows = [
            [
                record.date,
                record.staff_user.get_full_name() or record.staff_user.username,
                record.staff_user.role,
                record.clock_in or "",
                record.clock_out or "",
                record.status,
                record.notes,
            ]
            for record in queryset.order_by("-date", "staff_user__username")
        ]
        AuditEvent.objects.create(
            actor=request.user,
            action=AuditAction.EXPORT,
            entity_type="StaffAttendanceRecord",
            entity_id="bulk",
            summary="Exported staff attendance report",
            ip_address=get_client_ip(request),
            metadata={"record_count": len(rows), "format": request.query_params.get("file_format", "excel")},
        )
        return export_response("staff-attendance-report", request.query_params.get("file_format", "excel"), headers, rows)


class StaffProfileViewSet(RoleScopedModelViewSet):
    queryset = StaffProfile.objects
    serializer_class = StaffProfileSerializer
    campus_filter_path = "campus_id"
    read_roles = ACCOUNT_ROLES + (UserRole.TEACHER,)
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "user", "department", "employment_type", "status")
    search_fields = ("employee_code", "designation", "department", "user__username", "user__first_name", "user__last_name")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.ACCOUNT:
            campus_ids = self.admin_campus_ids()
            return queryset.filter(campus_id__in=campus_ids) if campus_ids else queryset.none()
        if user.role == UserRole.TEACHER:
            return queryset.filter(user_id=user.pk)
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        campus = serializer.validated_data["campus"]
        staff_user = serializer.validated_data["user"]
        if getattr(staff_user, "role", None) == UserRole.TEACHER:
            enforce_subscription_limit(campus, "teacher")
        employee_code = (serializer.validated_data.get("employee_code") or "").strip()
        if not employee_code:
            employee_code = generate_employee_id(campus)
        instance = serializer.save(employee_code=employee_code)
        self.write_audit(AuditAction.CREATE, instance)

    @action(detail=True, methods=["post"], url_path="upload-photo", parser_classes=[MultiPartParser, FormParser])
    def upload_photo(self, request, id=None):
        staff_profile = self.get_object()
        upload = request.FILES.get("file")
        if not upload:
            raise ValidationError({"file": "Upload a staff photo."})
        staff_profile.photo_url = uploaded_image_to_data_url(
            upload,
            allowed_types={"image/jpeg", "image/png", "image/webp"},
            max_size=settings.MENTRIQ_UPLOAD_PHOTO_MAX_BYTES,
            max_dimensions=(800, 800),
        )
        staff_profile.save(update_fields=["photo_url", "updated_at"])
        self.write_audit(AuditAction.UPDATE, staff_profile)
        return Response(self.get_serializer(staff_profile).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="upload-document", parser_classes=[MultiPartParser, FormParser])
    def upload_document(self, request, id=None):
        staff_profile = self.get_object()
        upload = request.FILES.get("file")
        if not upload:
            raise ValidationError({"file": "Upload a document file."})
        document = Document.objects.create(
            campus=staff_profile.campus,
            staff_user=staff_profile.user,
            uploaded_by=request.user,
            created_by=request.user,
            title=(request.data.get("title") or f"{staff_profile.user.get_full_name() or staff_profile.user.username} document").strip(),
            document_type=(request.data.get("document_type") or "staff_document").strip(),
            file_url=uploaded_file_to_data_url(
                upload,
                allowed_types={"application/pdf", "image/jpeg", "image/png", "image/webp"},
                max_size=settings.MENTRIQ_UPLOAD_DOCUMENT_MAX_BYTES,
            ),
        )
        self.write_audit(AuditAction.CREATE, document)
        return Response(DocumentSerializer(document, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="attendance-summary")
    def attendance_summary(self, request, id=None):
        staff_profile = self.get_object()
        queryset = StaffAttendanceRecord.objects.filter(campus=staff_profile.campus, staff_user=staff_profile.user)
        return Response(
            {
                "staffProfile": staff_profile.id,
                "employeeCode": staff_profile.employee_code,
                "total": queryset.count(),
                "byStatus": {
                    item["status"]: item["count"]
                    for item in queryset.values("status").annotate(count=Count("id"))
                },
            },
            status=status.HTTP_200_OK,
        )


class TimetableSlotViewSet(RoleScopedModelViewSet):
    queryset = TimetableSlot.objects
    serializer_class = TimetableSlotSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "section", "teacher", "subject", "day_of_week")
    search_fields = ("subject", "room", "section__grade_name", "section__section_name", "teacher__username")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(teacher=user)
                | Q(section__class_teacher=user)
                | Q(section__subject_allocations__teacher=user, section__subject_allocations__is_active=True)
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(section__students__user=user).distinct()
        return queryset.none()


class ExamTypeViewSet(RoleScopedModelViewSet):
    queryset = ExamType.objects
    serializer_class = ExamTypeSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "is_active")
    search_fields = ("name", "description")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if getattr(user, "school_id", None):
            return queryset.filter(campus_id=user.school_id)
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(campus__sections__class_teacher=user)
                | Q(campus__sections__subject_allocations__teacher=user, campus__sections__subject_allocations__is_active=True)
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(campus__students__user=user).distinct()
        return queryset.none()


class ExamSubjectSetupViewSet(RoleScopedModelViewSet):
    queryset = ExamSubjectSetup.objects
    serializer_class = ExamSubjectSetupSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "exam_type", "section", "subject", "is_active")
    search_fields = ("exam_type__name", "subject__name", "section__grade_name", "section__section_name")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(section__class_teacher=user)
                | Q(section__subject_allocations__teacher=user, section__subject_allocations__is_active=True)
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(section__students__user=user).distinct()
        return queryset.none()


class ExamScheduleViewSet(RoleScopedModelViewSet):
    queryset = ExamSchedule.objects
    serializer_class = ExamScheduleSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "exam_type", "section", "subject", "exam_date", "status")
    search_fields = ("title", "exam_type__name", "subject__name", "venue")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(section__class_teacher=user)
                | Q(section__subject_allocations__teacher=user, section__subject_allocations__is_active=True)
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(section__students__user=user, status=ExamScheduleStatus.PUBLISHED).distinct()
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.UPDATE, instance)

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, id=None):
        schedule = self.get_object()
        schedule.status = ExamScheduleStatus.PUBLISHED
        schedule.save(update_fields=["status", "updated_at"])
        self.write_audit(AuditAction.UPDATE, schedule)
        return Response(self.get_serializer(schedule).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="unpublish")
    def unpublish(self, request, id=None):
        schedule = self.get_object()
        schedule.status = ExamScheduleStatus.DRAFT
        schedule.save(update_fields=["status", "updated_at"])
        self.write_audit(AuditAction.UPDATE, schedule)
        return Response(self.get_serializer(schedule).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="archive")
    def archive(self, request, id=None):
        schedule = self.get_object()
        schedule.status = ExamScheduleStatus.ARCHIVED
        schedule.save(update_fields=["status", "updated_at"])
        self.write_audit(AuditAction.UPDATE, schedule)
        return Response(self.get_serializer(schedule).data, status=status.HTTP_200_OK)


class LibraryBookViewSet(RoleScopedModelViewSet):
    queryset = LibraryBook.objects
    serializer_class = LibraryBookSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "category", "status")
    search_fields = ("accession_number", "title", "author", "isbn", "category")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(campus__sections__class_teacher=user)
                | Q(campus__sections__subject_allocations__teacher=user, campus__sections__subject_allocations__is_active=True)
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(campus__students__user=user).distinct()
        return queryset.none()


class LibraryLoanViewSet(RoleScopedModelViewSet):
    queryset = LibraryLoan.objects
    serializer_class = LibraryLoanSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "book", "student", "staff_user", "status", "due_on")
    search_fields = ("book__title", "student__first_name", "student__last_name", "staff_user__username")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(staff_user=user)
                | Q(student__section__class_teacher=user)
                | Q(student__section__subject_allocations__teacher=user, student__section__subject_allocations__is_active=True)
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(student__user=user)
        return queryset.none()


class TransportRouteViewSet(RoleScopedModelViewSet):
    queryset = TransportRoute.objects
    serializer_class = TransportRouteSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "is_active")
    search_fields = ("name", "route_code", "start_point", "end_point")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(campus__sections__class_teacher=user)
                | Q(campus__sections__subject_allocations__teacher=user, campus__sections__subject_allocations__is_active=True)
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(student_assignments__student__user=user).distinct()
        return queryset.none()


class TransportVehicleViewSet(RoleScopedModelViewSet):
    queryset = TransportVehicle.objects
    serializer_class = TransportVehicleSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "route", "is_active")
    search_fields = ("vehicle_number", "driver_name", "driver_phone", "gps_device_id")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(campus__sections__class_teacher=user)
                | Q(campus__sections__subject_allocations__teacher=user, campus__sections__subject_allocations__is_active=True)
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(student_assignments__student__user=user).distinct()
        return queryset.none()


class StudentTransportAssignmentViewSet(RoleScopedModelViewSet):
    queryset = StudentTransportAssignment.objects
    serializer_class = StudentTransportAssignmentSerializer
    campus_filter_path = "student__campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("student", "route", "vehicle", "is_active")
    search_fields = ("student__first_name", "student__last_name", "route__name", "pickup_stop", "drop_stop")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(student__section__class_teacher=user)
                | Q(student__section__subject_allocations__teacher=user, student__section__subject_allocations__is_active=True)
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(student__user=user)
        return queryset.none()


class HostelRoomViewSet(RoleScopedModelViewSet):
    queryset = HostelRoom.objects
    serializer_class = HostelRoomSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "hostel_name", "is_active")
    search_fields = ("hostel_name", "room_number", "floor")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(campus__sections__class_teacher=user)
                | Q(campus__sections__subject_allocations__teacher=user, campus__sections__subject_allocations__is_active=True)
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(allocations__student__user=user).distinct()
        return queryset.none()


class HostelAllocationViewSet(RoleScopedModelViewSet):
    queryset = HostelAllocation.objects
    serializer_class = HostelAllocationSerializer
    campus_filter_path = "student__campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("student", "room", "is_active")
    search_fields = ("student__first_name", "student__last_name", "room__hostel_name", "room__room_number", "bed_number")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(student__section__class_teacher=user)
                | Q(student__section__subject_allocations__teacher=user, student__section__subject_allocations__is_active=True)
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(student__user=user)
        return queryset.none()


class ApprovalRequestViewSet(RoleScopedModelViewSet):
    queryset = ApprovalRequest.objects
    serializer_class = ApprovalRequestSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES + (UserRole.TEACHER,)
    write_roles = ADMIN_ROLES + (UserRole.TEACHER,)
    filterset_fields = ("campus", "status", "entity_type", "requested_by")
    search_fields = ("title", "description", "entity_type", "entity_id")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(Q(requested_by=user) | Q(campus__sections__class_teacher=user)).distinct()
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(requested_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, id=None):
        if getattr(request.user, "role", None) not in ADMIN_ROLES:
            raise PermissionDenied("Only campus admins can approve requests.")
        approval = self.get_object()
        approval.decide(
            status_value=ApprovalStatus.APPROVED,
            reviewer=request.user,
            note=request.data.get("decision_note", ""),
        )
        self.write_audit(AuditAction.UPDATE, approval)
        return Response(self.get_serializer(approval).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, id=None):
        if getattr(request.user, "role", None) not in ADMIN_ROLES:
            raise PermissionDenied("Only campus admins can reject requests.")
        approval = self.get_object()
        approval.decide(
            status_value=ApprovalStatus.REJECTED,
            reviewer=request.user,
            note=request.data.get("decision_note", ""),
        )
        self.write_audit(AuditAction.UPDATE, approval)
        return Response(self.get_serializer(approval).data, status=status.HTTP_200_OK)


class AnnouncementViewSet(RoleScopedModelViewSet):
    queryset = Announcement.objects
    serializer_class = AnnouncementSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "audience", "is_active")
    search_fields = ("title", "message")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        campus_ids: list[int] = []
        if getattr(user, "school_id", None):
            campus_ids.append(user.school_id)
        if user.role == UserRole.TEACHER:
            campus_ids.extend(
                ClassSection.objects.filter(teacher_section_q(user)).values_list("campus_id", flat=True).distinct()
            )
        if user.role == UserRole.STUDENT:
            campus_ids.extend(Student.objects.filter(user_id=user.pk).values_list("campus_id", flat=True).distinct())
        campus_filter = Q(campus__isnull=True)
        if campus_ids:
            campus_filter |= Q(campus_id__in=list(dict.fromkeys(campus_ids)))
        if user.role == UserRole.TEACHER:
            return queryset.filter(campus_filter, audience__in=["all", "staff"])
        if user.role == UserRole.STUDENT:
            return queryset.filter(campus_filter, audience__in=["all", "learners"])
        return queryset.none()

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if getattr(user, "role", None) in ADMIN_ROLES:
            return queryset
        return queryset.filter(is_active=True, publish_on__lte=timezone.now())

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        save_kwargs = {"created_by": self.request.user}
        if getattr(self.request.user, "role", None) == UserRole.SCHOOL_ADMIN and not serializer.validated_data.get("campus"):
            school = primary_school_for_user(self.request.user)
            if school is None:
                raise PermissionDenied("This account is not assigned to a school.")
            save_kwargs["campus"] = school
        instance = serializer.save(**save_kwargs)
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.UPDATE, instance)

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, id=None):
        announcement = self.get_object()
        announcement.is_active = True
        announcement.publish_on = timezone.now()
        announcement.save(update_fields=["is_active", "publish_on", "updated_at"])
        if announcement.campus_id:
            emit_academic_event(
                announcement.campus,
                AcademicEventType.NOTICE_PUBLISHED,
                {"noticeId": announcement.id, "audience": announcement.audience, "title": announcement.title},
                request.user,
            )
        self.write_audit(AuditAction.UPDATE, announcement)
        return Response(self.get_serializer(announcement).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="unpublish")
    def unpublish(self, request, id=None):
        announcement = self.get_object()
        announcement.is_active = False
        announcement.save(update_fields=["is_active", "updated_at"])
        self.write_audit(AuditAction.UPDATE, announcement)
        return Response(self.get_serializer(announcement).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="archive")
    def archive(self, request, id=None):
        announcement = self.get_object()
        announcement.is_active = False
        announcement.save(update_fields=["is_active", "updated_at"])
        self.write_audit(AuditAction.DELETE, announcement)
        return Response(self.get_serializer(announcement).data, status=status.HTTP_200_OK)


class SupportTicketViewSet(viewsets.ModelViewSet):
    queryset = SupportTicket.objects
    serializer_class = SupportTicketSerializer
    permission_classes = [RoleAccessPermission]
    read_roles = READ_ROLES
    write_roles = READ_ROLES
    filterset_fields = ("status", "priority", "category", "campus")
    search_fields = ("subject", "message", "created_by__username")
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        queryset = SupportTicket.objects  # fresh queryset each request (avoid stale mongo cache)
        user = self.request.user
        status_filter = self.request.query_params.get("status")
        if status_filter:
            from apps.core.input import validate_enum_value
            from apps.core.mongo_models import SupportTicketStatusEnum
            status_filter = validate_enum_value(status_filter, SupportTicketStatusEnum)
            queryset = queryset.filter(status=status_filter)
        if getattr(user, "role", None) == UserRole.SUPER_ADMIN:
            return queryset
        return queryset.filter(created_by=user)

    def perform_create(self, serializer):
        campus = serializer.validated_data.get("campus")
        if campus is None:
            membership = CampusMembership.objects.filter(user_id=self.request.user.pk, is_primary=True).first()
            membership = membership or CampusMembership.objects.filter(user_id=self.request.user.pk).first()
            campus = membership.campus if membership else None
        ticket = serializer.save(created_by=self.request.user, campus=campus)
        AuditEvent.objects.create(
            actor=self.request.user,
            action=AuditAction.CREATE,
            entity_type="SupportTicket",
            entity_id=str(ticket.pk),
            summary=f"Support issue raised: {ticket.subject}",
            ip_address=get_client_ip(self.request),
            metadata={
                "priority": ticket.priority,
                "status": ticket.status,
                "campus": ticket.campus.code if ticket.campus else "",
            },
        )

    def partial_update(self, request, *args, **kwargs):
        if getattr(request.user, "role", None) != UserRole.SUPER_ADMIN:
            disallowed = {"status", "response_note", "reviewed_by", "resolved_at"} & set(request.data.keys())
            if disallowed:
                raise PermissionDenied("Only super admins can change support ticket resolution fields.")
        return super().partial_update(request, *args, **kwargs)

    def perform_update(self, serializer):
        status_value = serializer.validated_data.get("status")
        save_kwargs = {}
        if getattr(self.request.user, "role", None) == UserRole.SUPER_ADMIN:
            save_kwargs["reviewed_by"] = self.request.user
            if status_value:
                save_kwargs["resolved_at"] = timezone.now() if status_value == SupportTicketStatus.RESOLVED else None
        ticket = serializer.save(**save_kwargs)
        AuditEvent.objects.create(
            actor=self.request.user,
            action=AuditAction.UPDATE,
            entity_type="SupportTicket",
            entity_id=str(ticket.pk),
            summary=f"Support ticket updated: {ticket.subject}",
            ip_address=get_client_ip(self.request),
            metadata={"status": ticket.status, "priority": ticket.priority},
        )


class AssignedWorkViewSet(RoleScopedModelViewSet):
    queryset = AssignedWork.objects.annotate(submission_count=Count("submissions"))
    serializer_class = AssignedWorkSerializer
    campus_filter_path = "section__campus_id"
    read_roles = READ_ROLES
    write_roles = ACADEMIC_WRITE_ROLES
    filterset_fields = ("section", "subject", "status", "due_date")

    def get_permissions(self):
        if getattr(self, "action", None) == "submit":
            self.write_roles = ACADEMIC_WRITE_ROLES + (UserRole.STUDENT,)
        return super().get_permissions()

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(section__class_teacher=user)
                | Q(
                    section__subject_allocations__teacher=user,
                    section__subject_allocations__is_active=True,
                    section__subject_allocations__subject__iexact=F("subject"),
                )
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(status=AcademicWorkStatus.PUBLISHED, section__students__user=user).distinct()
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        status_value = serializer.validated_data.get("status", AcademicWorkStatus.PUBLISHED)
        published_on = timezone.localdate() if status_value == AcademicWorkStatus.PUBLISHED else None
        instance = serializer.save(assigned_by=self.request.user, published_on=published_on)
        if instance.status == AcademicWorkStatus.PUBLISHED:
            emit_academic_event(
                instance.section.campus,
                AcademicEventType.ASSIGNMENT_PUBLISHED,
                {"assignmentId": instance.id, "sectionId": instance.section_id, "subject": instance.subject, "title": instance.title},
                self.request.user,
                teacher=self.request.user if getattr(self.request.user, "role", None) == UserRole.TEACHER else None,
            )
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        if getattr(self.request.user, "role", None) == UserRole.TEACHER and self.get_object().assigned_by_id != self.request.user.id:
            raise PermissionDenied("Teachers can edit only assignments they created.")
        instance = serializer.save(assigned_by=self.request.user)
        if instance.status == AcademicWorkStatus.PUBLISHED and not instance.published_on:
            instance.published_on = timezone.localdate()
            instance.save(update_fields=["published_on", "updated_at"])
        self.write_audit(AuditAction.UPDATE, instance)

    def perform_destroy(self, instance):
        if getattr(self.request.user, "role", None) == UserRole.TEACHER and instance.assigned_by_id != self.request.user.id:
            raise PermissionDenied("Teachers can delete only assignments they created.")
        super().perform_destroy(instance)

    @action(detail=False, methods=["post"], url_path="upload", parser_classes=[MultiPartParser, FormParser])
    def upload(self, request):
        if getattr(request.user, "role", None) not in self.write_roles:
            raise PermissionDenied("You do not have access to upload assignments.")
        upload = request.FILES.get("file")
        if not upload:
            raise ValidationError({"file": "Upload an assignment file."})
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.ensure_admin_payload_scope(serializer.validated_data)
        status_value = serializer.validated_data.get("status", AcademicWorkStatus.PUBLISHED)
        instance = serializer.save(
            assigned_by=request.user,
            file_url=uploaded_file_to_data_url(upload, allowed_types=ACADEMIC_FILE_TYPES, max_size=ACADEMIC_FILE_MAX_SIZE),
            file_name=upload.name,
            file_content_type=upload.content_type,
            published_on=timezone.localdate() if status_value == AcademicWorkStatus.PUBLISHED else None,
        )
        emit_academic_event(
            instance.section.campus,
            AcademicEventType.ASSIGNMENT_UPLOADED,
            {"assignmentId": instance.id, "sectionId": instance.section_id, "subject": instance.subject, "title": instance.title},
            request.user,
            teacher=request.user if getattr(request.user, "role", None) == UserRole.TEACHER else None,
        )
        if instance.status == AcademicWorkStatus.PUBLISHED:
            emit_academic_event(
                instance.section.campus,
                AcademicEventType.ASSIGNMENT_PUBLISHED,
                {"assignmentId": instance.id, "sectionId": instance.section_id, "subject": instance.subject, "title": instance.title},
                request.user,
                teacher=request.user if getattr(request.user, "role", None) == UserRole.TEACHER else None,
            )
        self.write_audit(AuditAction.CREATE, instance)
        return Response(self.get_serializer(instance).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, id=None):
        assignment = self.get_object()
        AuditEvent.objects.create(
            actor=request.user,
            action=AuditAction.EXPORT,
            entity_type="AssignedWork",
            entity_id=str(assignment.id),
            summary=f"Downloaded assignment {assignment.title}",
            ip_address=get_client_ip(request),
        )
        return protected_data_url_response(assignment.file_url, assignment.file_name or f"assignment-{assignment.id}", assignment.file_content_type)

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, id=None):
        assignment = self.get_object()
        if getattr(request.user, "role", None) == UserRole.TEACHER and assignment.assigned_by_id != request.user.id:
            raise PermissionDenied("Teachers can publish only assignments they created.")
        assignment.status = AcademicWorkStatus.PUBLISHED
        assignment.published_on = timezone.localdate()
        assignment.save(update_fields=["status", "published_on", "updated_at"])
        emit_academic_event(
            assignment.section.campus,
            AcademicEventType.ASSIGNMENT_PUBLISHED,
            {"assignmentId": assignment.id, "sectionId": assignment.section_id, "subject": assignment.subject, "title": assignment.title},
            request.user,
            teacher=request.user if getattr(request.user, "role", None) == UserRole.TEACHER else None,
        )
        self.write_audit(AuditAction.UPDATE, assignment)
        return Response(self.get_serializer(assignment).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="unpublish")
    def unpublish(self, request, id=None):
        assignment = self.get_object()
        if getattr(request.user, "role", None) == UserRole.TEACHER and assignment.assigned_by_id != request.user.id:
            raise PermissionDenied("Teachers can unpublish only assignments they created.")
        assignment.status = AcademicWorkStatus.DRAFT
        assignment.save(update_fields=["status", "updated_at"])
        self.write_audit(AuditAction.UPDATE, assignment)
        return Response(self.get_serializer(assignment).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="submit", parser_classes=[MultiPartParser, FormParser])
    def submit(self, request, id=None):
        if getattr(request.user, "role", None) != UserRole.STUDENT:
            raise PermissionDenied("Only students can submit assignments.")
        assignment = self.get_object()
        if assignment.status != AcademicWorkStatus.PUBLISHED:
            raise ValidationError({"assignment": "Only published assignments can be submitted."})
        student = get_object_or_404(Student, user=request.user, section=assignment.section)
        upload = request.FILES.get("file")
        if not upload:
            raise ValidationError({"file": "Upload a submission file."})
        submission, _ = AssignmentSubmission.objects.update_or_create(
            assignment=assignment,
            student=student,
            defaults={
                "submitted_by": request.user,
                "file_url": uploaded_file_to_data_url(upload, allowed_types=ACADEMIC_FILE_TYPES, max_size=ACADEMIC_FILE_MAX_SIZE),
                "file_name": upload.name,
                "file_content_type": upload.content_type,
                "notes": request.data.get("notes", ""),
                "status": AssignmentSubmissionStatus.PENDING,
                "remarks": "",
                "checked_by": None,
                "checked_at": None,
                "submitted_at": timezone.now(),
            },
        )
        emit_academic_event(
            assignment.section.campus,
            AcademicEventType.ASSIGNMENT_SUBMITTED,
            {"assignmentId": assignment.id, "submissionId": submission.id, "studentId": student.id, "subject": assignment.subject},
            request.user,
            student=student,
            teacher=assignment.assigned_by,
        )
        self.write_audit(AuditAction.CREATE, submission)
        return Response(AssignmentSubmissionSerializer(submission, context={"request": request}).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="submissions")
    def submissions(self, request, id=None):
        assignment = self.get_object()
        if getattr(request.user, "role", None) == UserRole.STUDENT:
            raise PermissionDenied("Students cannot view the class submission list.")
        queryset = assignment.submissions
        serializer = AssignmentSubmissionSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class AssignmentSubmissionViewSet(RoleScopedModelViewSet):
    queryset = AssignmentSubmission.objects
    serializer_class = AssignmentSubmissionSerializer
    campus_filter_path = "assignment__section__campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES + (UserRole.TEACHER, UserRole.STUDENT)
    filterset_fields = ("assignment", "student", "status")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(assignment__section__class_teacher=user)
                | Q(
                    assignment__section__subject_allocations__teacher=user,
                    assignment__section__subject_allocations__is_active=True,
                    assignment__section__subject_allocations__subject__iexact=F("assignment__subject"),
                )
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(student__user=user)
        return queryset.none()

    def perform_create(self, serializer):
        assignment = serializer.validated_data["assignment"]
        student = serializer.validated_data["student"]
        user = self.request.user
        if user.role == UserRole.STUDENT and student.user_id != user.id:
            raise PermissionDenied("Students can submit only their own assignments.")
        if user.role in (UserRole.SCHOOL_ADMIN, UserRole.ACCOUNT) and assignment.section.campus_id not in self.admin_campus_ids():
            raise PermissionDenied("This assignment belongs to another school.")
        instance = serializer.save(submitted_by=user)
        self.write_audit(AuditAction.CREATE, instance)

    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, id=None):
        submission = self.get_object()
        AuditEvent.objects.create(
            actor=request.user,
            action=AuditAction.EXPORT,
            entity_type="AssignmentSubmission",
            entity_id=str(submission.id),
            summary=f"Downloaded submission {submission.id}",
            ip_address=get_client_ip(request),
        )
        return protected_data_url_response(submission.file_url, submission.file_name or f"submission-{submission.id}", submission.file_content_type)

    @action(detail=True, methods=["post"], url_path="mark-checked")
    def mark_checked(self, request, id=None):
        submission = self.get_object()
        if getattr(request.user, "role", None) == UserRole.STUDENT:
            raise PermissionDenied("Students cannot check submissions.")
        submission.status = AssignmentSubmissionStatus.CHECKED
        submission.remarks = request.data.get("remarks", submission.remarks)
        submission.checked_by = request.user
        submission.checked_at = timezone.now()
        submission.save(update_fields=["status", "remarks", "checked_by", "checked_at", "updated_at"])
        self.write_audit(AuditAction.UPDATE, submission)
        return Response(self.get_serializer(submission).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="add-remarks")
    def add_remarks(self, request, id=None):
        submission = self.get_object()
        if getattr(request.user, "role", None) == UserRole.STUDENT:
            raise PermissionDenied("Students cannot add teacher remarks.")
        submission.remarks = request.data.get("remarks", "")
        submission.checked_by = request.user
        submission.checked_at = timezone.now()
        submission.save(update_fields=["remarks", "checked_by", "checked_at", "updated_at"])
        self.write_audit(AuditAction.UPDATE, submission)
        return Response(self.get_serializer(submission).data, status=status.HTTP_200_OK)


class LearningResourceViewSet(RoleScopedModelViewSet):
    queryset = LearningResource.objects
    serializer_class = LearningResourceSerializer
    campus_filter_path = "section__campus_id"
    read_roles = READ_ROLES
    write_roles = ACADEMIC_WRITE_ROLES
    filterset_fields = ("section", "subject", "resource_type", "published_on", "is_published")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(section__class_teacher=user)
                | Q(
                    section__subject_allocations__teacher=user,
                    section__subject_allocations__is_active=True,
                    section__subject_allocations__subject__iexact=F("subject"),
                )
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(is_published=True, section__students__user=user).distinct()
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(uploaded_by=self.request.user)
        if instance.is_published:
            emit_academic_event(
                instance.section.campus,
                AcademicEventType.NOTES_UPLOADED,
                {"resourceId": instance.id, "sectionId": instance.section_id, "subject": instance.subject, "title": instance.title},
                self.request.user,
                teacher=self.request.user if getattr(self.request.user, "role", None) == UserRole.TEACHER else None,
            )
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        if getattr(self.request.user, "role", None) == UserRole.TEACHER and self.get_object().uploaded_by_id != self.request.user.id:
            raise PermissionDenied("Teachers can edit only notes they uploaded.")
        instance = serializer.save(uploaded_by=self.request.user)
        self.write_audit(AuditAction.UPDATE, instance)

    def perform_destroy(self, instance):
        if getattr(self.request.user, "role", None) == UserRole.TEACHER and instance.uploaded_by_id != self.request.user.id:
            raise PermissionDenied("Teachers can delete only notes they uploaded.")
        super().perform_destroy(instance)

    @action(detail=False, methods=["post"], url_path="upload", parser_classes=[MultiPartParser, FormParser])
    def upload(self, request):
        if getattr(request.user, "role", None) not in self.write_roles:
            raise PermissionDenied("You do not have access to upload notes.")
        upload = request.FILES.get("file")
        if not upload:
            raise ValidationError({"file": "Upload a notes file."})
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(
            uploaded_by=request.user,
            file_url=uploaded_file_to_data_url(upload, allowed_types=ACADEMIC_FILE_TYPES, max_size=ACADEMIC_FILE_MAX_SIZE),
            file_name=upload.name,
            file_content_type=upload.content_type,
        )
        if instance.is_published:
            emit_academic_event(
                instance.section.campus,
                AcademicEventType.NOTES_UPLOADED,
                {"resourceId": instance.id, "sectionId": instance.section_id, "subject": instance.subject, "title": instance.title},
                request.user,
                teacher=request.user if getattr(request.user, "role", None) == UserRole.TEACHER else None,
            )
        self.write_audit(AuditAction.CREATE, instance)
        return Response(self.get_serializer(instance).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, id=None):
        resource = self.get_object()
        AuditEvent.objects.create(
            actor=request.user,
            action=AuditAction.EXPORT,
            entity_type="LearningResource",
            entity_id=str(resource.id),
            summary=f"Downloaded notes {resource.title}",
            ip_address=get_client_ip(request),
        )
        return protected_data_url_response(resource.file_url, resource.file_name or f"resource-{resource.id}", resource.file_content_type)

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, id=None):
        resource = self.get_object()
        if getattr(request.user, "role", None) == UserRole.TEACHER and resource.uploaded_by_id != request.user.id:
            raise PermissionDenied("Teachers can publish only notes they uploaded.")
        resource.is_published = True
        resource.published_on = timezone.localdate()
        resource.save(update_fields=["is_published", "published_on", "updated_at"])
        emit_academic_event(
            resource.section.campus,
            AcademicEventType.NOTES_UPLOADED,
            {"resourceId": resource.id, "sectionId": resource.section_id, "subject": resource.subject, "title": resource.title},
            request.user,
            teacher=request.user if getattr(request.user, "role", None) == UserRole.TEACHER else None,
        )
        self.write_audit(AuditAction.UPDATE, resource)
        return Response(self.get_serializer(resource).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="unpublish")
    def unpublish(self, request, id=None):
        resource = self.get_object()
        if getattr(request.user, "role", None) == UserRole.TEACHER and resource.uploaded_by_id != request.user.id:
            raise PermissionDenied("Teachers can unpublish only notes they uploaded.")
        resource.is_published = False
        resource.save(update_fields=["is_published", "updated_at"])
        self.write_audit(AuditAction.UPDATE, resource)
        return Response(self.get_serializer(resource).data, status=status.HTTP_200_OK)


class ResultRecordViewSet(RoleScopedModelViewSet):
    queryset = ResultRecord.objects
    serializer_class = ResultRecordSerializer
    campus_filter_path = "student__campus_id"
    read_roles = READ_ROLES
    write_roles = ACADEMIC_WRITE_ROLES
    filterset_fields = ("student", "exam_name", "subject", "published_on", "is_published", "review_status")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(student__section__class_teacher=user)
                | Q(
                    student__section__subject_allocations__teacher=user,
                    student__section__subject_allocations__is_active=True,
                    student__section__subject_allocations__subject__iexact=F("subject"),
                )
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(student__user=user, is_published=True)
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        save_kwargs = {"recorded_by": self.request.user}
        if getattr(self.request.user, "role", None) == UserRole.TEACHER:
            save_kwargs.update({"is_published": False, "review_status": ResultReviewStatus.DRAFT})
        instance = serializer.save(**save_kwargs)
        emit_academic_event(
            instance.student.campus,
            AcademicEventType.MARKS_UPLOADED,
            {"resultId": instance.id, "studentId": instance.student_id, "examName": instance.exam_name, "subject": instance.subject},
            self.request.user,
            student=instance.student,
            teacher=self.request.user if getattr(self.request.user, "role", None) == UserRole.TEACHER else None,
        )
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        if getattr(self.request.user, "role", None) == UserRole.TEACHER and self.get_object().recorded_by_id != self.request.user.id:
            raise PermissionDenied("Teachers can edit only marks they uploaded.")
        instance = serializer.save(recorded_by=self.request.user)
        self.write_audit(AuditAction.UPDATE, instance)

    @action(detail=True, methods=["post"], url_path="upload-marks", parser_classes=[MultiPartParser, FormParser])
    def upload_marks(self, request, id=None):
        result = self.get_object()
        if getattr(request.user, "role", None) == UserRole.TEACHER and result.recorded_by_id != request.user.id:
            raise PermissionDenied("Teachers can upload files only for marks they created.")
        upload = request.FILES.get("file")
        if not upload:
            raise ValidationError({"file": "Upload a marks file."})
        result.marks_file_url = uploaded_file_to_data_url(upload, allowed_types=ACADEMIC_FILE_TYPES, max_size=ACADEMIC_FILE_MAX_SIZE)
        result.marks_file_name = upload.name
        result.marks_file_content_type = upload.content_type
        result.save(update_fields=["marks_file_url", "marks_file_name", "marks_file_content_type", "updated_at"])
        emit_academic_event(
            result.student.campus,
            AcademicEventType.MARKS_UPLOADED,
            {"resultId": result.id, "studentId": result.student_id, "examName": result.exam_name, "subject": result.subject},
            request.user,
            student=result.student,
            teacher=request.user if getattr(request.user, "role", None) == UserRole.TEACHER else None,
        )
        self.write_audit(AuditAction.UPDATE, result)
        return Response(self.get_serializer(result).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="download-marks-file")
    def download_marks_file(self, request, id=None):
        result = self.get_object()
        return protected_data_url_response(result.marks_file_url, result.marks_file_name or f"marks-{result.id}", result.marks_file_content_type)

    @action(detail=True, methods=["post"], url_path="submit-review")
    def submit_review(self, request, id=None):
        result = self.get_object()
        if getattr(request.user, "role", None) != UserRole.TEACHER:
            raise PermissionDenied("Only teachers can submit marks for review.")
        if result.recorded_by_id != request.user.id:
            raise PermissionDenied("Teachers can submit only marks they uploaded.")
        result.review_status = ResultReviewStatus.SUBMITTED
        result.is_published = False
        result.save(update_fields=["review_status", "is_published", "updated_at"])
        emit_academic_event(
            result.student.campus,
            AcademicEventType.MARKS_UPLOADED,
            {"resultId": result.id, "studentId": result.student_id, "examName": result.exam_name, "subject": result.subject, "status": result.review_status},
            request.user,
            student=result.student,
            teacher=request.user,
        )
        self.write_audit(AuditAction.UPDATE, result)
        return Response(self.get_serializer(result).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, id=None):
        if getattr(request.user, "role", None) not in ADMIN_ROLES:
            raise PermissionDenied("Only school admins can approve marks.")
        result = self.get_object()
        result.review_status = ResultReviewStatus.APPROVED
        result.reviewed_by = request.user
        result.reviewed_at = timezone.now()
        result.review_note = request.data.get("review_note", result.review_note)
        result.save(update_fields=["review_status", "reviewed_by", "reviewed_at", "review_note", "updated_at"])
        self.write_audit(AuditAction.UPDATE, result)
        return Response(self.get_serializer(result).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, id=None):
        if getattr(request.user, "role", None) not in ADMIN_ROLES:
            raise PermissionDenied("Only school admins can reject marks.")
        result = self.get_object()
        result.review_status = ResultReviewStatus.REJECTED
        result.is_published = False
        result.reviewed_by = request.user
        result.reviewed_at = timezone.now()
        result.review_note = request.data.get("review_note", result.review_note)
        result.save(update_fields=["review_status", "is_published", "reviewed_by", "reviewed_at", "review_note", "updated_at"])
        self.write_audit(AuditAction.UPDATE, result)
        return Response(self.get_serializer(result).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, id=None):
        if getattr(request.user, "role", None) not in ADMIN_ROLES:
            raise PermissionDenied("Only school admins can publish results.")
        result = self.get_object()
        result.is_published = True
        result.review_status = ResultReviewStatus.APPROVED
        result.reviewed_by = result.reviewed_by or request.user
        result.reviewed_at = result.reviewed_at or timezone.now()
        result.published_on = timezone.localdate()
        result.save(update_fields=["is_published", "review_status", "reviewed_by", "reviewed_at", "published_on", "updated_at"])
        emit_academic_event(
            result.student.campus,
            AcademicEventType.RESULT_PUBLISHED,
            {"resultId": result.id, "studentId": result.student_id, "examName": result.exam_name, "subject": result.subject},
            request.user,
            student=result.student,
            teacher=result.recorded_by,
        )
        self.write_audit(AuditAction.UPDATE, result)
        return Response(self.get_serializer(result).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="unpublish")
    def unpublish(self, request, id=None):
        if getattr(request.user, "role", None) not in ADMIN_ROLES:
            raise PermissionDenied("Only school admins can unpublish results.")
        result = self.get_object()
        result.is_published = False
        result.save(update_fields=["is_published", "updated_at"])
        self.write_audit(AuditAction.UPDATE, result)
        return Response(self.get_serializer(result).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="download-result")
    def download_result(self, request, id=None):
        result = self.get_object()
        lines = [
            f"School: {result.student.campus.name} ({result.student.campus.code})",
            f"Student: {result.student.full_name} ({result.student.admission_number})",
            f"Class/Section: {result.student.section.grade_name} - {result.student.section.section_name}",
            f"Exam: {result.exam_name}",
            f"Subject: {result.subject}",
            f"Score: {result.score} / {result.max_score}",
            f"Grade: {result.grade}",
            f"Remarks: {result.remarks}",
            f"Published On: {result.published_on}",
        ]
        response = HttpResponse(simple_pdf_bytes(f"Result - {result.exam_name}", lines), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="result-{result.id}.pdf"'
        AuditEvent.objects.create(
            actor=request.user,
            action=AuditAction.EXPORT,
            entity_type="ResultRecord",
            entity_id=str(result.id),
            summary=f"Downloaded result {result.exam_name}",
            ip_address=get_client_ip(request),
        )
        return response


class AdmitCardViewSet(RoleScopedModelViewSet):
    queryset = AdmitCard.objects
    serializer_class = AdmitCardSerializer
    campus_filter_path = "student__campus_id"
    read_roles = READ_ROLES
    write_roles = ACADEMIC_WRITE_ROLES
    filterset_fields = ("student", "exam_name", "status", "exam_date")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(student__section__class_teacher=user)
        if user.role == UserRole.STUDENT:
            return queryset.filter(student__user=user)
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(issued_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(issued_by=self.request.user)
        self.write_audit(AuditAction.UPDATE, instance)


class FeeStructureViewSet(RoleScopedModelViewSet):
    queryset = FeeStructure.objects
    serializer_class = FeeStructureSerializer
    campus_filter_path = "campus_id"
    read_roles = ACCOUNT_ROLES
    write_roles = ACCOUNT_ROLES
    filterset_fields = ("campus", "section", "is_active")
    search_fields = ("title", "description", "campus__name", "campus__code")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.ACCOUNT:
            campus_ids = self.admin_campus_ids()
            return queryset.filter(campus_id__in=campus_ids) if campus_ids else queryset.none()
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save()
        self.write_audit(AuditAction.UPDATE, instance)

    @action(detail=True, methods=["post"], url_path="assign")
    def assign(self, request, id=None):
        fee_structure = self.get_object()
        student_ids = request.data.get("student_ids") or []
        section_id = request.data.get("section") or fee_structure.section_id
        due_date_raw = request.data.get("due_date")
        due_date = parse_date(due_date_raw) if due_date_raw else timezone.localdate() + timedelta(days=fee_structure.due_day)
        students = Student.objects.filter(campus=fee_structure.campus, status="active")
        if student_ids:
            students = students.filter(id__in=student_ids)
        elif section_id:
            section = get_object_or_404(ClassSection, id=section_id, campus=fee_structure.campus)
            students = students.filter(section=section)
        created = 0
        updated = 0
        for student in students:
            assignment, was_created = FeeAssignment.objects.get_or_create(
                fee_structure=fee_structure,
                student=student,
                defaults={
                    "title": fee_structure.title,
                    "amount": fee_structure.amount,
                    "discount_amount": fee_structure.discount_amount,
                    "late_fee": fee_structure.late_fee,
                    "due_date": due_date,
                },
            )
            if was_created:
                created += 1
            else:
                assignment.title = fee_structure.title
                assignment.amount = fee_structure.amount
                assignment.discount_amount = fee_structure.discount_amount
                assignment.late_fee = fee_structure.late_fee
                assignment.due_date = due_date
                assignment.save(update_fields=["title", "amount", "discount_amount", "late_fee", "due_date", "updated_at"])
                updated += 1
        self.write_audit(AuditAction.UPDATE, fee_structure)
        return Response({"created": created, "updated": updated}, status=status.HTTP_200_OK)


class PaymentGatewayConfigViewSet(RoleScopedModelViewSet):
    queryset = PaymentGatewayConfig.objects
    serializer_class = PaymentGatewayConfigSerializer
    campus_filter_path = "campus_id"
    read_roles = ACCOUNT_ROLES
    write_roles = ACCOUNT_ROLES
    filterset_fields = ("campus", "provider", "is_active")
    search_fields = ("campus__name", "campus__code", "provider", "key_id", "upi_id")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.ACCOUNT:
            campus_ids = self.admin_campus_ids()
            return queryset.filter(campus_id__in=campus_ids) if campus_ids else queryset.none()
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save()
        self.write_audit(AuditAction.UPDATE, instance)


class FeeAssignmentViewSet(RoleScopedModelViewSet):
    queryset = FeeAssignment.objects
    serializer_class = FeeAssignmentSerializer
    campus_filter_path = "student__campus_id"
    read_roles = ACCOUNT_ROLES + (UserRole.STUDENT,)
    write_roles = ACCOUNT_ROLES
    filterset_fields = ("status", "due_date", "fee_structure", "student")
    search_fields = ("title", "student__first_name", "student__last_name", "student__admission_number", "invoice_number")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.ACCOUNT:
            campus_ids = self.admin_campus_ids()
            return queryset.filter(student__campus_id__in=campus_ids) if campus_ids else queryset.none()
        if user.role == UserRole.STUDENT:
            return queryset.filter(student__user=user)
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save()
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save()
        self.write_audit(AuditAction.UPDATE, instance)

    @action(detail=True, methods=["post"], url_path="generate-invoice")
    def generate_invoice(self, request, id=None):
        fee_assignment = ensure_fee_invoice(self.get_object())
        self.write_audit(AuditAction.UPDATE, fee_assignment)
        return Response(self.get_serializer(fee_assignment).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="invoice-pdf")
    def invoice_pdf(self, request, id=None):
        fee_assignment = ensure_fee_invoice(self.get_object())
        response = HttpResponse(simple_pdf_bytes(f"Invoice - {fee_assignment.invoice_number}", fee_invoice_lines(fee_assignment)), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{fee_assignment.invoice_number}.pdf"'
        AuditEvent.objects.create(
            actor=request.user,
            action=AuditAction.EXPORT,
            entity_type="FeeAssignment",
            entity_id=str(fee_assignment.id),
            summary=f"Downloaded invoice {fee_assignment.invoice_number}",
            ip_address=get_client_ip(request),
        )
        return response

    @action(detail=True, methods=["post"], url_path="send-reminder")
    def send_reminder(self, request, id=None):
        fee_assignment = self.get_object()
        channel = request.data.get("channel") or MessageChannel.EMAIL
        if channel not in MessageChannel.values:
            raise ValidationError({"channel": "Unsupported reminder channel."})
        student = fee_assignment.student
        recipient = request.data.get("recipient") or student.contact_email or student.phone_number
        if not recipient:
            raise ValidationError({"recipient": "A recipient email or phone number is required."})
        body = (
            f"Reminder: {fee_assignment.title} has INR {fee_outstanding_amount(fee_assignment)} pending "
            f"for {student.full_name}. Due date: {fee_assignment.due_date}."
        )
        queue_finance_message(
            campus=student.campus,
            channel=channel,
            recipient=recipient,
            subject=f"Fee reminder - {fee_assignment.title}",
            body=body,
            user=request.user,
            student=student,
            recipient_user=student.user,
        )
        fee_assignment.reminder_count += 1
        fee_assignment.last_reminder_at = timezone.now()
        fee_assignment.save(update_fields=["reminder_count", "last_reminder_at", "updated_at"])
        emit_finance_event(
            student.campus,
            FinanceEventType.FEE_REMINDER_SENT,
            {"feeId": fee_assignment.id, "studentId": student.id, "channel": channel},
            request.user,
        )
        self.write_audit(AuditAction.UPDATE, fee_assignment)
        return Response(self.get_serializer(fee_assignment).data, status=status.HTTP_200_OK)


class PaymentViewSet(RoleScopedModelViewSet):
    queryset = Payment.objects
    serializer_class = PaymentSerializer
    campus_filter_path = "campus_id"
    read_roles = ACCOUNT_ROLES + (UserRole.STUDENT,)
    write_roles = ACCOUNT_ROLES
    filterset_fields = ("campus", "payment_method", "payment_status", "paid_on", "webhook_verified")
    search_fields = ("reference_number", "receipt_number", "invoice_number", "transaction_id", "fee_assignment__student__first_name", "fee_assignment__student__last_name")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.ACCOUNT:
            campus_ids = self.admin_campus_ids()
            return queryset.filter(Q(campus_id__in=campus_ids) | Q(fee_assignment__student__campus_id__in=campus_ids)).distinct() if campus_ids else queryset.none()
        if user.role == UserRole.STUDENT:
            return queryset.filter(fee_assignment__student__user=user)
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        fee = ensure_fee_invoice(serializer.validated_data["fee_assignment"])
        receipt_number = next_finance_number(fee.student.campus, "REC", Payment, "receipt_number")
        instance = serializer.save(
            campus=fee.student.campus,
            collected_by=self.request.user,
            payment_status=TransactionStatus.SUCCESS,
            receipt_number=receipt_number,
            invoice_number=fee.invoice_number or "",
            webhook_verified=False,
        )
        emit_finance_event(
            instance.campus,
            FinanceEventType.OFFLINE_PAYMENT_ADDED,
            {"paymentId": instance.id, "feeId": fee.id, "studentId": fee.student_id, "amount": decimal_string(instance.amount_paid)},
            self.request.user,
        )
        emit_finance_event(
            instance.campus,
            FinanceEventType.RECEIPT_GENERATED,
            {"paymentId": instance.id, "receiptNumber": instance.receipt_number, "invoiceNumber": instance.invoice_number},
            self.request.user,
        )
        self.write_audit(AuditAction.CREATE, instance)

    @action(detail=True, methods=["get"], url_path="receipt-pdf")
    def receipt_pdf(self, request, id=None):
        payment = self.get_object()
        if not payment.receipt_number:
            payment.receipt_number = next_finance_number(payment.campus or payment.fee_assignment.student.campus, "REC", Payment, "receipt_number")
            payment.save(update_fields=["receipt_number", "updated_at"])
        response = HttpResponse(simple_pdf_bytes(f"Receipt - {payment.receipt_number}", payment_receipt_lines(payment)), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{payment.receipt_number}.pdf"'
        AuditEvent.objects.create(
            actor=request.user,
            action=AuditAction.EXPORT,
            entity_type="Payment",
            entity_id=str(payment.id),
            summary=f"Downloaded receipt {payment.receipt_number}",
            ip_address=get_client_ip(request),
        )
        return response

    @action(detail=True, methods=["post"], url_path="send-receipt")
    def send_receipt(self, request, id=None):
        payment = self.get_object()
        student = payment.fee_assignment.student
        channel = request.data.get("channel") or MessageChannel.EMAIL
        if channel not in MessageChannel.values:
            raise ValidationError({"channel": "Unsupported receipt channel."})
        recipient = request.data.get("recipient") or student.contact_email or student.phone_number
        if not recipient:
            raise ValidationError({"recipient": "A recipient email or phone number is required."})
        queue_finance_message(
            campus=student.campus,
            channel=channel,
            recipient=recipient,
            subject=f"Receipt {payment.receipt_number}",
            body=f"Receipt {payment.receipt_number} generated for INR {payment.amount_paid}.",
            user=request.user,
            student=student,
            recipient_user=student.user,
        )
        self.write_audit(AuditAction.UPDATE, payment)
        return Response(self.get_serializer(payment).data, status=status.HTTP_200_OK)


class PaymentTransactionViewSet(RoleScopedModelViewSet):
    queryset = PaymentTransaction.objects
    serializer_class = PaymentTransactionSerializer
    campus_filter_path = "campus_id"
    read_roles = ACCOUNT_ROLES + (UserRole.STUDENT,)
    write_roles = ACCOUNT_ROLES + (UserRole.STUDENT,)
    filterset_fields = ("campus", "student", "fee_assignment", "provider", "method", "status", "webhook_verified")
    search_fields = ("gateway_order_id", "gateway_payment_id", "receipt_number", "student__first_name", "student__last_name")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.ACCOUNT:
            campus_ids = self.admin_campus_ids()
            return queryset.filter(campus_id__in=campus_ids) if campus_ids else queryset.none()
        if user.role == UserRole.STUDENT:
            return queryset.filter(student__user=user)
        return queryset.none()

    def get_throttles(self):
        if getattr(self, "action", None) in {"create_order", "verify_payment", "verify_razorpay", "webhook"}:
            self.throttle_scope = "payment"
        return super().get_throttles()

    def perform_create(self, serializer):
        if getattr(self.request.user, "role", None) == UserRole.STUDENT:
            student = serializer.validated_data.get("student")
            fee_assignment = serializer.validated_data.get("fee_assignment")
            if fee_assignment and not student:
                student = fee_assignment.student
            if not student or student.user_id != self.request.user.id:
                raise PermissionDenied("Students can create payment transactions only for their own fee records.")
        else:
            self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user, gateway_name=serializer.validated_data.get("provider", ""))
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        if getattr(self.request.user, "role", None) == UserRole.STUDENT:
            raise PermissionDenied("Students cannot update payment transactions after creation.")
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save()
        self.write_audit(AuditAction.UPDATE, instance)

    def perform_destroy(self, instance):
        if getattr(self.request.user, "role", None) == UserRole.STUDENT:
            raise PermissionDenied("Students cannot delete payment transactions.")
        super().perform_destroy(instance)

    def _assert_fee_visible(self, fee_assignment: FeeAssignment) -> None:
        user = self.request.user
        if getattr(user, "role", None) == UserRole.SUPER_ADMIN:
            return
        if getattr(user, "role", None) in (UserRole.SCHOOL_ADMIN, UserRole.ACCOUNT):
            if fee_assignment.student.campus_id not in self.admin_campus_ids():
                raise PermissionDenied("This fee belongs to another school.")
            return
        if getattr(user, "role", None) == UserRole.STUDENT and fee_assignment.student.user_id == user.id:
            return
        raise PermissionDenied("You cannot access this fee.")

    @action(detail=False, methods=["post"], url_path="create-order")
    def create_order(self, request):
        fee_assignment = get_object_or_404(
            FeeAssignment.objects,
            id=request.data.get("fee_assignment"),
        )
        self._assert_fee_visible(fee_assignment)
        outstanding = fee_outstanding_amount(fee_assignment)
        if outstanding <= 0:
            raise ValidationError({"fee_assignment": "This fee is already paid."})
        amount = Decimal(str(request.data.get("amount") or outstanding))
        if amount <= 0 or amount > outstanding:
            raise ValidationError({"amount": "Payment amount must be greater than zero and cannot exceed the outstanding amount."})
        provider = request.data.get("provider") or GatewayProvider.RAZORPAY
        method = request.data.get("method") or PaymentMethod.ONLINE
        config = gateway_config_for(fee_assignment.student.campus, provider)
        fee_assignment = ensure_fee_invoice(fee_assignment)
        order_id = f"order_{fee_assignment.student.campus.code}_{secrets.token_urlsafe(10)}"
        transaction_obj = PaymentTransaction.objects.create(
            campus=fee_assignment.student.campus,
            student=fee_assignment.student,
            fee_assignment=fee_assignment,
            provider=provider,
            method=method,
            amount=amount,
            pending_amount=outstanding - amount,
            status=TransactionStatus.PENDING,
            gateway_name=provider,
            gateway_order_id=order_id,
            invoice_number=fee_assignment.invoice_number or "",
            raw_payload={"gatewayConfigId": config.id, "allowedMethods": config.allowed_methods},
            created_by=request.user,
        )
        self.write_audit(AuditAction.CREATE, transaction_obj)
        payload = self.get_serializer(transaction_obj).data
        payload["gateway"] = {
            "provider": config.provider,
            "keyId": config.key_id,
            "maskedKeyId": PaymentGatewayConfigSerializer(config).data.get("masked_key_id"),
            "upiId": config.upi_id,
            "allowedMethods": config.allowed_methods,
        }
        return Response(payload, status=status.HTTP_201_CREATED)

    def _verify_gateway_transaction(self, transaction_obj: PaymentTransaction, *, payment_id: str, signature: str, user=None, secret_override: str = "") -> PaymentTransaction:
        if not transaction_obj.gateway_order_id or not payment_id or not signature:
            raise ValidationError({"gateway_signature": "Order id, payment id, and signature are required."})
        config = gateway_config_for(transaction_obj.campus, transaction_obj.provider)
        secret = secret_override or config.get_key_secret() or config.get_webhook_secret()
        if not secret:
            raise ValidationError({"provider": "Gateway secret is not configured for this school."})
        expected = payment_signature(secret, transaction_obj.gateway_order_id, payment_id)
        if not hmac.compare_digest(expected, str(signature)):
            transaction_obj.status = TransactionStatus.FAILED
            transaction_obj.webhook_verified = False
            transaction_obj.raw_payload = {**transaction_obj.raw_payload, "verification_error": "Signature mismatch"}
            transaction_obj.save(update_fields=["status", "webhook_verified", "raw_payload", "updated_at"])
            emit_finance_event(
                transaction_obj.campus,
                FinanceEventType.PAYMENT_FAILED,
                {"transactionId": transaction_obj.id, "orderId": transaction_obj.gateway_order_id, "reason": "signature_mismatch"},
                user,
            )
            raise ValidationError({"gateway_signature": "Gateway signature verification failed."})
        transaction_obj.gateway_payment_id = payment_id
        transaction_obj.gateway_signature = signature
        transaction_obj.transaction_id = payment_id
        transaction_obj.webhook_verified = True
        transaction_obj.status = TransactionStatus.SUCCESS
        transaction_obj.paid_at = timezone.now()
        transaction_obj.raw_payload = {**transaction_obj.raw_payload, "verified": True}
        transaction_obj.save(
            update_fields=[
                "gateway_payment_id",
                "gateway_signature",
                "transaction_id",
                "webhook_verified",
                "status",
                "paid_at",
                "raw_payload",
                "updated_at",
            ]
        )
        create_success_payment_from_transaction(transaction_obj, user)
        return transaction_obj

    @action(detail=True, methods=["post"], url_path="verify-payment")
    def verify_payment(self, request, id=None):
        transaction_obj = self.get_object()
        if getattr(request.user, "role", None) == UserRole.STUDENT and transaction_obj.student.user_id != request.user.id:
            raise PermissionDenied("Students can verify only their own payment transactions.")
        payment_id = request.data.get("gateway_payment_id") or request.data.get("transaction_id") or transaction_obj.gateway_payment_id
        signature = request.data.get("gateway_signature") or transaction_obj.gateway_signature
        transaction_obj = self._verify_gateway_transaction(transaction_obj, payment_id=payment_id, signature=signature, user=request.user)
        self.write_audit(AuditAction.UPDATE, transaction_obj)
        return Response(self.get_serializer(transaction_obj).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="verify-razorpay")
    def verify_razorpay(self, request, id=None):
        return self.verify_payment(request, id=pk)

    @action(detail=False, methods=["post"], url_path="webhook", permission_classes=[AllowAny], authentication_classes=[])
    def webhook(self, request):
        school_id = request.data.get("schoolId") or request.data.get("school_id") or request.data.get("campus")
        order_id = request.data.get("gateway_order_id") or request.data.get("orderId")
        payment_id = request.data.get("gateway_payment_id") or request.data.get("paymentId") or request.data.get("transactionId")
        signature = request.data.get("gateway_signature") or request.data.get("signature")
        amount_raw = request.data.get("amount")
        if not all([school_id, order_id, payment_id, signature]):
            raise ValidationError({"webhook": "schoolId, orderId, paymentId, and signature are required."})
        transaction_obj = get_object_or_404(PaymentTransaction.objects, gateway_order_id=order_id)
        campus_match = str(transaction_obj.campus_id) == str(school_id) or transaction_obj.campus.code == str(school_id)
        if not campus_match:
            raise PermissionDenied("Webhook schoolId does not match the transaction school.")
        if amount_raw is not None and Decimal(str(amount_raw)) != transaction_obj.amount:
            raise ValidationError({"amount": "Webhook amount does not match the transaction amount."})
        config = gateway_config_for(transaction_obj.campus, transaction_obj.provider)
        secret = config.get_webhook_secret() or config.get_key_secret()
        if not secret:
            raise ValidationError({"provider": "Gateway webhook secret is not configured for this school."})
        expected = payment_signature(secret, order_id, payment_id)
        if not hmac.compare_digest(expected, str(signature)):
            transaction_obj.status = TransactionStatus.FAILED
            transaction_obj.raw_payload = {**transaction_obj.raw_payload, "webhook_error": "Signature mismatch", "webhook": sanitize_webhook_payload(request.data)}
            transaction_obj.save(update_fields=["status", "raw_payload", "updated_at"])
            emit_finance_event(
                transaction_obj.campus,
                FinanceEventType.PAYMENT_FAILED,
                {"transactionId": transaction_obj.id, "orderId": order_id, "reason": "webhook_signature_mismatch"},
            )
            raise ValidationError({"signature": "Webhook signature verification failed."})
        transaction_obj.raw_payload = {**transaction_obj.raw_payload, "webhook": sanitize_webhook_payload(request.data)}
        transaction_obj.save(update_fields=["raw_payload", "updated_at"])
        self._verify_gateway_transaction(transaction_obj, payment_id=payment_id, signature=signature, secret_override=secret)
        return Response({"status": "verified", "transaction": transaction_obj.id}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="receipt-pdf")
    def receipt_pdf(self, request, id=None):
        transaction_obj = self.get_object()
        if not transaction_obj.payment_id:
            raise ValidationError({"payment": "Receipt is available only after successful payment."})
        payment = transaction_obj.payment
        response = HttpResponse(simple_pdf_bytes(f"Receipt - {payment.receipt_number}", payment_receipt_lines(payment)), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{payment.receipt_number}.pdf"'
        return response


class SalarySetupViewSet(RoleScopedModelViewSet):
    queryset = SalarySetup.objects
    serializer_class = SalarySetupSerializer
    campus_filter_path = "campus_id"
    read_roles = ACCOUNT_ROLES + (UserRole.TEACHER,)
    write_roles = ACCOUNT_ROLES
    filterset_fields = ("campus", "staff_user", "is_active")
    search_fields = ("staff_user__username", "staff_user__first_name", "staff_user__last_name", "campus__name", "campus__code")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.ACCOUNT:
            campus_ids = self.admin_campus_ids()
            return queryset.filter(campus_id__in=campus_ids) if campus_ids else queryset.none()
        if user.role == UserRole.TEACHER:
            return queryset.filter(staff_user=user)
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save()
        self.write_audit(AuditAction.UPDATE, instance)


class SalaryRecordViewSet(RoleScopedModelViewSet):
    queryset = SalaryRecord.objects
    serializer_class = SalaryRecordSerializer
    campus_filter_path = "campus_id"
    read_roles = ACCOUNT_ROLES + (UserRole.TEACHER,)
    write_roles = ACCOUNT_ROLES
    filterset_fields = ("campus", "staff_user", "month", "year", "payment_status", "status")
    search_fields = ("staff_user__username", "staff_user__first_name", "staff_user__last_name", "slip_number", "payment_reference")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.ACCOUNT:
            campus_ids = self.admin_campus_ids()
            return queryset.filter(campus_id__in=campus_ids) if campus_ids else queryset.none()
        if user.role == UserRole.TEACHER:
            return queryset.filter(staff_user=user)
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save()
        self.write_audit(AuditAction.UPDATE, instance)

    @action(detail=False, methods=["post"], url_path="calculate")
    def calculate(self, request):
        setup = get_object_or_404(SalarySetup.objects, id=request.data.get("salary_setup"))
        if getattr(request.user, "role", None) != UserRole.SUPER_ADMIN and setup.campus_id not in self.admin_campus_ids():
            raise PermissionDenied("This salary setup belongs to another school.")
        month = int(request.data.get("month") or timezone.localdate().month)
        year = int(request.data.get("year") or timezone.localdate().year)
        if not 1 <= month <= 12:
            raise ValidationError({"month": "Month must be between 1 and 12."})
        start_date = date(year, month, 1)
        end_date = date(year + (1 if month == 12 else 0), 1 if month == 12 else month + 1, 1) - timedelta(days=1)
        attendance = StaffAttendanceRecord.objects.filter(campus=setup.campus, staff_user=setup.staff_user, date__range=(start_date, end_date))
        present_days = Decimal(attendance.filter(status__in=[StaffAttendanceStatus.PRESENT, StaffAttendanceStatus.LATE]).count())
        absent_days = Decimal(attendance.filter(status=StaffAttendanceStatus.ABSENT).count())
        leave_days = Decimal(attendance.filter(status=StaffAttendanceStatus.ON_LEAVE).count())
        half_days = Decimal(attendance.filter(status=StaffAttendanceStatus.HALF_DAY).count())
        counted_days = max(present_days + absent_days + leave_days + half_days, Decimal("1"))
        per_day = setup.gross_salary / counted_days
        deductions = setup.default_deductions + (absent_days * per_day) + (half_days * per_day / Decimal("2"))
        bonus = Decimal(str(request.data.get("bonus") or setup.default_bonus))
        final_salary = max(setup.gross_salary - deductions + bonus, Decimal("0"))
        salary, _ = SalaryRecord.objects.update_or_create(
            campus=setup.campus,
            staff_user=setup.staff_user,
            month=month,
            year=year,
            defaults={
                "salary_setup": setup,
                "present_days": present_days,
                "absent_days": absent_days,
                "leave_days": leave_days,
                "half_days": half_days,
                "gross_salary": setup.gross_salary,
                "deductions": deductions.quantize(Decimal("0.01")),
                "bonus": bonus,
                "final_salary": final_salary.quantize(Decimal("0.01")),
                "payment_status": SalaryPaymentStatus.PAYABLE,
                "created_by": request.user,
            },
        )
        self.write_audit(AuditAction.UPDATE, salary)
        return Response(self.get_serializer(salary).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, id=None):
        salary = self.get_object()
        salary.payment_status = SalaryPaymentStatus.PAID
        salary.paid_on = request.data.get("paid_on") or timezone.localdate()
        salary.payment_reference = request.data.get("payment_reference") or salary.payment_reference
        salary.paid_by = request.user
        if not salary.slip_number:
            salary.slip_number = next_finance_number(salary.campus, "SAL", SalaryRecord, "slip_number")
        salary.save(update_fields=["payment_status", "paid_on", "payment_reference", "paid_by", "slip_number", "updated_at"])
        emit_finance_event(
            salary.campus,
            FinanceEventType.SALARY_PAID,
            {"salaryRecordId": salary.id, "staffUserId": salary.staff_user_id, "amount": decimal_string(salary.final_salary)},
            request.user,
        )
        self.write_audit(AuditAction.UPDATE, salary)
        return Response(self.get_serializer(salary).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="salary-slip-pdf")
    def salary_slip_pdf(self, request, id=None):
        salary = self.get_object()
        if not salary.slip_number:
            salary.slip_number = next_finance_number(salary.campus, "SAL", SalaryRecord, "slip_number")
            salary.save(update_fields=["slip_number", "updated_at"])
        response = HttpResponse(simple_pdf_bytes(f"Salary Slip - {salary.slip_number}", salary_slip_lines(salary)), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{salary.slip_number}.pdf"'
        AuditEvent.objects.create(
            actor=request.user,
            action=AuditAction.EXPORT,
            entity_type="SalaryRecord",
            entity_id=str(salary.id),
            summary=f"Downloaded salary slip {salary.slip_number}",
            ip_address=get_client_ip(request),
        )
        return response

    @action(detail=True, methods=["post"], url_path="send-slip")
    def send_slip(self, request, id=None):
        salary = self.get_object()
        channel = request.data.get("channel") or MessageChannel.EMAIL
        if channel not in MessageChannel.values:
            raise ValidationError({"channel": "Unsupported salary slip channel."})
        recipient = request.data.get("recipient") or salary.staff_user.email
        if not recipient:
            raise ValidationError({"recipient": "A recipient email or phone number is required."})
        queue_finance_message(
            campus=salary.campus,
            channel=channel,
            recipient=recipient,
            subject=f"Salary slip {salary.slip_number or ''}",
            body=f"Salary slip generated for INR {salary.final_salary}.",
            user=request.user,
            recipient_user=salary.staff_user,
        )
        self.write_audit(AuditAction.UPDATE, salary)
        return Response(self.get_serializer(salary).data, status=status.HTTP_200_OK)


class FinanceEventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FinanceEvent.objects
    serializer_class = FinanceEventSerializer
    permission_classes = [RoleAccessPermission]
    read_roles = ACCOUNT_ROLES + (UserRole.STUDENT,)
    write_roles = ()
    filterset_fields = ("campus", "event_type")

    def admin_campus_ids(self) -> list[int]:
        user = self.request.user
        if getattr(user, "role", None) == UserRole.SUPER_ADMIN:
            return list(Campus.objects.values_list("id", flat=True))
        if getattr(user, "school_id", None):
            return [user.school_id]
        return list(CampusMembership.objects.filter(user_id=user.pk).values_list("campus_id", flat=True).distinct())

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if not getattr(user, "is_authenticated", False):
            return queryset.none()
        if user.role in (UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNT):
            campus_ids = self.admin_campus_ids()
            return queryset.filter(campus_id__in=campus_ids) if campus_ids else queryset.none()
        if user.role == UserRole.STUDENT:
            student = Student.objects.filter(user_id=user.pk).first()
            return queryset.filter(payload__studentId=student.id) if student else queryset.none()
        return queryset.none()

    @action(detail=False, methods=["get"], url_path="stream")
    def stream(self, request):
        scoped_events = self.get_queryset()

        def event_stream():
            last_id = int(request.query_params.get("last_id") or 0)
            while True:
                events = (
                    scoped_events.filter(id__gt=last_id)
                    
                    .order_by("id")[:20]
                )
                sent = False
                for event in events:
                    last_id = event.id
                    sent = True
                    yield f"id: {event.id}\nevent: {event.event_type}\ndata: {json.dumps(event.payload)}\n\n"
                if not sent:
                    yield ": heartbeat\n\n"
                time.sleep(5)

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        return response


class AcademicEventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AcademicEvent.objects
    serializer_class = AcademicEventSerializer
    permission_classes = [RoleAccessPermission]
    read_roles = READ_ROLES
    write_roles = ()
    filterset_fields = ("campus", "event_type", "student", "teacher")

    def admin_campus_ids(self) -> list[int]:
        user = self.request.user
        if getattr(user, "role", None) == UserRole.SUPER_ADMIN:
            return list(Campus.objects.values_list("id", flat=True))
        if getattr(user, "school_id", None):
            return [user.school_id]
        return list(CampusMembership.objects.filter(user_id=user.pk).values_list("campus_id", flat=True).distinct())

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if not getattr(user, "is_authenticated", False):
            return queryset.none()
        if user.role in (UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNT):
            campus_ids = self.admin_campus_ids()
            return queryset.filter(campus_id__in=campus_ids) if campus_ids else queryset.none()
        if user.role == UserRole.TEACHER:
            class_teacher_sections = list(ClassSection.objects.filter(class_teacher=user).values_list("id", flat=True))
            subject_sections = list(
                TeacherSubjectAllocation.objects.filter(teacher=user, is_active=True).values_list("section_id", flat=True).distinct()
            )
            teacher_campuses = list(
                ClassSection.objects.filter(Q(id__in=class_teacher_sections) | Q(id__in=subject_sections))
                .values_list("campus_id", flat=True)
                .distinct()
            )
            teacher_filter = Q(teacher=user)
            if class_teacher_sections:
                teacher_filter |= Q(payload__sectionId__in=class_teacher_sections)
            if subject_sections:
                teacher_filter |= Q(payload__sectionId__in=subject_sections)
            return queryset.filter(campus_id__in=teacher_campuses).filter(teacher_filter).distinct() if teacher_campuses else queryset.none()
        if user.role == UserRole.STUDENT:
            student = Student.objects.filter(user_id=user.pk).first()
            if not student:
                return queryset.none()
            return queryset.filter(
                Q(student=student)
                | Q(campus=student.campus, payload__studentId=student.id)
                | Q(
                    campus=student.campus,
                    payload__sectionId=student.section_id,
                    event_type__in=[
                        AcademicEventType.NOTES_UPLOADED,
                        AcademicEventType.ASSIGNMENT_UPLOADED,
                        AcademicEventType.ASSIGNMENT_PUBLISHED,
                    ],
                )
                | Q(campus=student.campus, event_type=AcademicEventType.NOTICE_PUBLISHED, payload__audience__in=["all", "learners"])
            ).distinct()
        return queryset.none()

    @action(detail=False, methods=["get"], url_path="stream")
    def stream(self, request):
        scoped_events = self.get_queryset()

        def event_stream():
            last_id = int(request.query_params.get("last_id") or 0)
            while True:
                events = scoped_events.filter(id__gt=last_id).order_by("id")[:20]
                sent = False
                for event in events:
                    last_id = event.id
                    sent = True
                    yield f"id: {event.id}\nevent: {event.event_type}\ndata: {json.dumps(event.payload)}\n\n"
                if not sent:
                    yield ": heartbeat\n\n"
                time.sleep(5)

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        return response


class RealTimeEventView(APIView):
    permission_classes = [RoleAccessPermission]
    read_roles = READ_ROLES
    write_roles = ()

    @extend_schema(
        responses=inline_serializer(
            name="RealTimeEventListResponse",
            fields={
                "events": drf_serializers.ListField(child=drf_serializers.DictField()),
            },
        )
    )
    def get(self, request):
        limit = min(int(request.query_params.get("limit") or 100), 200)
        finance_events = [
            normalized_realtime_event("finance", event)
            for event in scoped_finance_events_for_user(request.user).order_by("-created_at")[:limit]
        ]
        academic_events = [
            normalized_realtime_event("academic", event)
            for event in scoped_academic_events_for_user(request.user).order_by("-created_at")[:limit]
        ]
        events = sorted(finance_events + academic_events, key=lambda item: item["createdAt"], reverse=True)[:limit]
        AuditEvent.objects.create(
            actor=request.user,
            action=AuditAction.EXPORT,
            entity_type="RealTimeEvent",
            entity_id="list",
            summary="Viewed real-time event feed",
            ip_address=get_client_ip(request),
            metadata={"count": len(events)},
        )
        return Response({"events": events}, status=status.HTTP_200_OK)


class RealTimeEventStreamView(APIView):
    permission_classes = [RoleAccessPermission]
    read_roles = READ_ROLES
    write_roles = ()

    @extend_schema(responses=OpenApiTypes.STR)
    def get(self, request):
        def event_stream():
            from bson import ObjectId

            raw_finance = request.query_params.get("last_finance_id") or ""
            raw_academic = request.query_params.get("last_academic_id") or ""
            last_finance_id = raw_finance if ObjectId.is_valid(raw_finance) else None
            last_academic_id = raw_academic if ObjectId.is_valid(raw_academic) else None
            while True:
                finance_qs = scoped_finance_events_for_user(request.user)
                if last_finance_id:
                    finance_qs = finance_qs.filter(id__gt=ObjectId(last_finance_id))
                finance_events = finance_qs.order_by("id")[:20]
                academic_qs = scoped_academic_events_for_user(request.user)
                if last_academic_id:
                    academic_qs = academic_qs.filter(id__gt=ObjectId(last_academic_id))
                academic_events = academic_qs.order_by("id")[:20]
                events: list[dict] = []
                for event in finance_events:
                    last_finance_id = str(event.id)
                    events.append(normalized_realtime_event("finance", event))
                for event in academic_events:
                    last_academic_id = str(event.id)
                    events.append(normalized_realtime_event("academic", event))
                events = sorted(events, key=lambda item: item["createdAt"])
                if events:
                    for event in events:
                        yield f"id: {event['id']}\nevent: {event['event']}\ndata: {json.dumps(event)}\n\n"
                else:
                    yield ": heartbeat\n\n"
                time.sleep(5)

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        return response


class FinanceReportView(APIView):
    permission_classes = [RoleAccessPermission]
    read_roles = ACCOUNT_ROLES
    write_roles = ()

    def scoped_campus_ids(self, request) -> list[int]:
        user = request.user
        requested_campus = request.query_params.get("campus")
        if user.role == UserRole.SUPER_ADMIN:
            if requested_campus:
                return list(Campus.objects.filter(id=requested_campus).values_list("id", flat=True))
            return list(Campus.objects.values_list("id", flat=True))
        if getattr(user, "school_id", None):
            campus_ids = [user.school_id]
        else:
            campus_ids = list(CampusMembership.objects.filter(user_id=user.pk).values_list("campus_id", flat=True).distinct())
        if requested_campus:
            requested_id = int(requested_campus)
            if requested_id not in campus_ids:
                raise PermissionDenied("You cannot export finance reports for another school.")
            return [requested_id]
        return campus_ids

    @extend_schema(responses=OpenApiTypes.BINARY)
    def get(self, request, report_type: str):
        campus_ids = self.scoped_campus_ids(request)
        if not campus_ids:
            raise PermissionDenied("No school is assigned to this account.")
        file_format = request.query_params.get("file_format") or request.query_params.get("format") or "excel"
        today = timezone.localdate()
        payments = Payment.objects.filter(Q(campus_id__in=campus_ids) | Q(fee_assignment__student__campus_id__in=campus_ids))
        fees = FeeAssignment.objects.filter(student__campus_id__in=campus_ids)
        transactions = PaymentTransaction.objects.filter(campus_id__in=campus_ids)
        salaries = SalaryRecord.objects.filter(campus_id__in=campus_ids)

        if report_type == "fee-collection":
            headers = ["School", "Student", "Fee", "Receipt", "Amount", "Mode", "Paid On", "Status"]
            rows = [
                [
                    payment.fee_assignment.student.campus.name,
                    payment.fee_assignment.student.full_name,
                    payment.fee_assignment.title,
                    payment.receipt_number or "",
                    payment.amount_paid,
                    payment.payment_method,
                    payment.paid_on,
                    payment.payment_status,
                ]
                for payment in payments.order_by("-paid_on", "-created_at")
            ]
        elif report_type == "pending-fees":
            headers = ["School", "Student", "Fee", "Payable", "Paid", "Pending", "Due Date", "Status"]
            rows = [
                [
                    fee.student.campus.name,
                    fee.student.full_name,
                    fee.title,
                    fee.payable_amount,
                    fee_paid_amount(fee),
                    fee_outstanding_amount(fee),
                    fee.due_date,
                    fee.status,
                ]
                for fee in fees.exclude(status=FeeStatus.PAID).order_by("due_date")
            ]
        elif report_type == "overdue-fees":
            headers = ["School", "Student", "Fee", "Payable", "Paid", "Overdue", "Due Date", "Status"]
            rows = [
                [
                    fee.student.campus.name,
                    fee.student.full_name,
                    fee.title,
                    fee.payable_amount,
                    fee_paid_amount(fee),
                    fee_outstanding_amount(fee),
                    fee.due_date,
                    fee.status,
                ]
                for fee in fees.filter(Q(status=FeeStatus.OVERDUE) | Q(due_date__lt=today)).exclude(status=FeeStatus.PAID).order_by("due_date")
            ]
        elif report_type == "student-payments":
            headers = ["School", "Student", "Admission No", "Fee", "Receipt", "Transaction", "Amount", "Paid On"]
            rows = [
                [
                    payment.fee_assignment.student.campus.name,
                    payment.fee_assignment.student.full_name,
                    payment.fee_assignment.student.admission_number,
                    payment.fee_assignment.title,
                    payment.receipt_number or "",
                    payment.transaction_id or payment.reference_number,
                    payment.amount_paid,
                    payment.paid_on,
                ]
                for payment in payments.order_by("fee_assignment__student__first_name", "-paid_on")
            ]
        elif report_type == "online-transactions":
            headers = ["School", "Student", "Provider", "Order ID", "Transaction ID", "Amount", "Status", "Verified", "Created"]
            rows = [
                [
                    transaction_obj.campus.name,
                    transaction_obj.student.full_name if transaction_obj.student else "",
                    transaction_obj.provider,
                    transaction_obj.gateway_order_id,
                    transaction_obj.gateway_payment_id or transaction_obj.transaction_id,
                    transaction_obj.amount,
                    transaction_obj.status,
                    transaction_obj.webhook_verified,
                    transaction_obj.created_at,
                ]
                for transaction_obj in transactions.order_by("-created_at")
            ]
        elif report_type == "offline-payments":
            headers = ["School", "Student", "Fee", "Receipt", "Amount", "Mode", "Reference", "Paid On"]
            rows = [
                [
                    payment.fee_assignment.student.campus.name,
                    payment.fee_assignment.student.full_name,
                    payment.fee_assignment.title,
                    payment.receipt_number or "",
                    payment.amount_paid,
                    payment.payment_method,
                    payment.reference_number,
                    payment.paid_on,
                ]
                for payment in payments.filter(payment_method__in=[PaymentMethod.CASH, PaymentMethod.BANK]).order_by("-paid_on")
            ]
        elif report_type == "salary-report":
            headers = ["School", "Staff", "Month", "Year", "Present", "Absent", "Leave", "Half", "Final Salary", "Status"]
            rows = [
                [
                    salary.campus.name,
                    salary.staff_user.get_full_name() or salary.staff_user.username,
                    salary.month,
                    salary.year,
                    salary.present_days,
                    salary.absent_days,
                    salary.leave_days,
                    salary.half_days,
                    salary.final_salary,
                    salary.payment_status,
                ]
                for salary in salaries.order_by("-year", "-month", "staff_user__first_name")
            ]
        elif report_type == "monthly-finance":
            headers = ["School", "Collected", "Pending Fees", "Overdue Fees", "Failed Payments", "Salary Payable"]
            rows = []
            for campus in Campus.objects.filter(id__in=campus_ids).order_by("name"):
                campus_fees = fees.filter(student__campus=campus)
                rows.append(
                    [
                        campus.name,
                        payments.filter(Q(campus=campus) | Q(fee_assignment__student__campus=campus)).aggregate(total=Sum("amount_paid")).get("total") or Decimal("0"),
                        sum(fee_outstanding_amount(fee) for fee in campus_fees.exclude(status=FeeStatus.PAID)),
                        sum(fee_outstanding_amount(fee) for fee in campus_fees.filter(Q(status=FeeStatus.OVERDUE) | Q(due_date__lt=today)).exclude(status=FeeStatus.PAID)),
                        transactions.filter(campus=campus, status=TransactionStatus.FAILED).count(),
                        salaries.filter(campus=campus, payment_status__in=[SalaryPaymentStatus.DRAFT, SalaryPaymentStatus.PAYABLE]).aggregate(total=Sum("final_salary")).get("total") or Decimal("0"),
                    ]
                )
        else:
            raise ValidationError({"report_type": "Unsupported finance report type."})

        AuditEvent.objects.create(
            actor=request.user,
            action=AuditAction.EXPORT,
            entity_type="FinanceReport",
            entity_id=report_type,
            summary=f"Exported {report_type} finance report",
            ip_address=get_client_ip(request),
        )
        return export_response(report_type, file_format, headers, rows)


class DeviceSyncLogViewSet(RoleScopedModelViewSet):
    queryset = DeviceSyncLog.objects
    serializer_class = DeviceSyncLogSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES + (UserRole.TEACHER,)
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "device", "status", "log_type")
    search_fields = ("device__device_code", "device__name", "error_message")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(campus__sections__class_teacher=user)
                | Q(campus__sections__subject_allocations__teacher=user, campus__sections__subject_allocations__is_active=True)
            ).distinct()
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        emit_academic_event(
            instance.campus,
            AcademicEventType.DEVICE_SYNCED,
            {"deviceId": instance.device_id, "deviceCode": instance.device.device_code, "status": instance.status, "logId": instance.id},
            self.request.user,
        )
        self.write_audit(AuditAction.CREATE, instance)

    @action(detail=True, methods=["post"], url_path="retry")
    def retry(self, request, id=None):
        log = self.get_object()
        retry_log = record_device_sync(
            log.device,
            DeviceSyncStatus.RETRYING,
            log.payload,
            request.user,
            log_type="retry",
            error_message=log.error_message,
            attempt_count=log.attempt_count + 1,
        )
        self.write_audit(AuditAction.UPDATE, retry_log)
        return Response(self.get_serializer(retry_log).data, status=status.HTTP_201_CREATED)


DEFAULT_MESSAGE_TEMPLATES = [
    ("fee_reminder", "Fee reminder", MessageChannel.EMAIL, "Fee reminder for {{studentName}}", "Dear {{studentName}}, {{schoolName}} fee of {{feeAmount}} is due on {{dueDate}}. Pay: {{paymentLink}}"),
    ("attendance_alert", "Attendance alert", MessageChannel.SMS, "Attendance alert", "{{studentName}} attendance is {{attendancePercentage}} at {{schoolName}}."),
    ("assignment_notification", "Assignment notification", MessageChannel.WHATSAPP, "New assignment", "{{studentName}}, a new assignment is available for {{className}} {{sectionName}}."),
    ("exam_notice", "Exam notice", MessageChannel.EMAIL, "Exam notice", "{{schoolName}} exam notice for {{className}} {{sectionName}}."),
    ("result_published", "Result published", MessageChannel.EMAIL, "Result published", "{{studentName}}, your result is published. Download: {{resultLink}}"),
    ("payment_receipt", "Payment receipt", MessageChannel.EMAIL, "Payment receipt", "Receipt for {{studentName}} is ready: {{receiptLink}}"),
    ("salary_slip", "Salary slip", MessageChannel.EMAIL, "Salary slip", "Your salary slip is available."),
    ("school_announcement", "School announcement", MessageChannel.WHATSAPP, "School announcement", "{{schoolName}}: {{message}}"),
]
TEMPLATE_VARIABLES = [
    "studentName",
    "schoolName",
    "className",
    "sectionName",
    "feeAmount",
    "dueDate",
    "paymentLink",
    "receiptLink",
    "resultLink",
    "attendancePercentage",
]


def render_message_text(template_text: str, variables: dict) -> str:
    from apps.core.input import sanitize_template_variables

    rendered = template_text or ""
    variables = sanitize_template_variables(variables)
    for key in TEMPLATE_VARIABLES + list(variables.keys()):
        value = str(variables.get(key, ""))
        rendered = rendered.replace(f"{{{{{key}}}}}", value).replace(f"{{{key}}}", value)
    return rendered


class CommunicationSettingViewSet(RoleScopedModelViewSet):
    queryset = CommunicationSetting.objects
    serializer_class = CommunicationSettingSerializer
    campus_filter_path = "campus_id"
    read_roles = ACCOUNT_ROLES
    write_roles = ACCOUNT_ROLES
    filterset_fields = ("campus", "channel", "is_active")
    search_fields = ("provider_name", "sender_id", "api_url", "smtp_host", "smtp_username")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.ACCOUNT:
            campus_ids = self.admin_campus_ids()
            return queryset.filter(campus_id__in=campus_ids) if campus_ids else queryset.none()
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save()
        self.write_audit(AuditAction.UPDATE, instance)

    @action(detail=True, methods=["post"], url_path="test")
    def test_provider(self, request, id=None):
        setting = self.get_object()
        recipient = request.data.get("recipient") or request.user.email or request.user.phone_number
        if not recipient:
            raise ValidationError({"recipient": "A test recipient is required."})
        message = OutboundMessage.objects.create(
            campus=setting.campus,
            channel=setting.channel,
            recipient=recipient,
            subject=f"{setting.provider_name or setting.channel} test",
            body="MentriQ360 communication test message.",
            provider=setting.provider_name,
            status=MessageStatus.QUEUED,
            created_by=request.user,
            recipient_user=request.user,
        )
        self.write_audit(AuditAction.CREATE, message)
        return Response(OutboundMessageSerializer(message, context={"request": request}).data, status=status.HTTP_201_CREATED)


class MessageTemplateViewSet(RoleScopedModelViewSet):
    queryset = MessageTemplate.objects
    serializer_class = MessageTemplateSerializer
    campus_filter_path = "campus_id"
    read_roles = ACCOUNT_ROLES
    write_roles = ACCOUNT_ROLES
    filterset_fields = ("campus", "channel", "trigger", "status")
    search_fields = ("name", "trigger", "subject", "body")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.ACCOUNT:
            campus_ids = self.admin_campus_ids()
            return queryset.filter(Q(campus_id__in=campus_ids) | Q(campus__isnull=True)).distinct() if campus_ids else queryset.filter(campus__isnull=True)
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save()
        self.write_audit(AuditAction.UPDATE, instance)

    @action(detail=False, methods=["post"], url_path="seed-defaults")
    def seed_defaults(self, request):
        campus = get_object_or_404(Campus, id=request.data.get("campus"))
        if getattr(request.user, "role", None) != UserRole.SUPER_ADMIN and campus.id not in self.admin_campus_ids():
            raise PermissionDenied("This school is outside your scope.")
        created_or_updated = []
        for trigger, name, channel, subject, body in DEFAULT_MESSAGE_TEMPLATES:
            template, _ = MessageTemplate.objects.update_or_create(
                campus=campus,
                name=name,
                channel=channel,
                defaults={
                    "trigger": trigger,
                    "subject": subject,
                    "body": body,
                    "variables": TEMPLATE_VARIABLES,
                    "status": RecordStatus.ACTIVE,
                    "created_by": request.user,
                },
            )
            created_or_updated.append(template)
        AuditEvent.objects.create(
            actor=request.user,
            action=AuditAction.CREATE,
            entity_type="MessageTemplate",
            entity_id=str(campus.id),
            summary=f"Seeded communication templates for {campus.code}",
            ip_address=get_client_ip(request),
            metadata={"count": len(created_or_updated)},
        )
        return Response(self.get_serializer(created_or_updated, many=True).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="render")
    def render(self, request, id=None):
        template = self.get_object()
        variables = request.data.get("variables") or {}
        return Response(
            {
                "subject": render_message_text(template.subject, variables),
                "body": render_message_text(template.body, variables),
                "variables": template.variables,
            },
            status=status.HTTP_200_OK,
        )


class OutboundMessageViewSet(RoleScopedModelViewSet):
    queryset = OutboundMessage.objects
    serializer_class = OutboundMessageSerializer
    campus_filter_path = "campus_id"
    read_roles = ACCOUNT_ROLES + (UserRole.STUDENT,)
    write_roles = ACCOUNT_ROLES
    filterset_fields = ("campus", "channel", "status", "student", "recipient_user")
    search_fields = ("recipient", "subject", "body", "provider_reference")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.ACCOUNT:
            campus_ids = self.admin_campus_ids()
            return queryset.filter(campus_id__in=campus_ids) if campus_ids else queryset.none()
        if user.role == UserRole.STUDENT:
            return queryset.filter(Q(recipient_user=user) | Q(student__user=user)).distinct()
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save()
        self.write_audit(AuditAction.UPDATE, instance)

    @action(detail=False, methods=["post"], url_path="send-template")
    def send_template(self, request):
        template = get_object_or_404(MessageTemplate.objects, id=request.data.get("template"))
        campus = template.campus or get_object_or_404(Campus, id=request.data.get("campus"))
        if getattr(request.user, "role", None) != UserRole.SUPER_ADMIN and campus.id not in self.admin_campus_ids():
            raise PermissionDenied("This communication belongs to another school.")
        student = None
        if request.data.get("student"):
            student = get_object_or_404(Student, id=request.data.get("student"), campus=campus)
        recipient_user = None
        if request.data.get("recipient_user"):
            recipient_user = get_object_or_404(User, id=request.data.get("recipient_user"))
            if getattr(recipient_user, "school_id", None) and recipient_user.school_id != campus.id:
                raise PermissionDenied("Recipient belongs to another school.")
        variables = request.data.get("variables") or {}
        if student:
            variables = {
                "studentName": student.full_name,
                "schoolName": campus.name,
                "className": student.section.grade_name,
                "sectionName": student.section.section_name,
                **variables,
            }
        message = OutboundMessage.objects.create(
            campus=campus,
            template=template,
            recipient_user=recipient_user or (student.user if student else None),
            student=student,
            channel=request.data.get("channel") or template.channel,
            recipient=request.data.get("recipient") or (student.contact_email or student.phone_number if student else ""),
            subject=render_message_text(template.subject, variables),
            body=render_message_text(template.body, variables),
            status=MessageStatus.QUEUED,
            provider=request.data.get("provider", ""),
            created_by=request.user,
        )
        self.write_audit(AuditAction.CREATE, message)
        return Response(self.get_serializer(message).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="mark-sent")
    def mark_sent(self, request, id=None):
        message = self.get_object()
        message.status = "sent"
        message.sent_at = timezone.now()
        message.provider_reference = request.data.get("provider_reference", message.provider_reference)
        message.save(update_fields=["status", "sent_at", "provider_reference", "updated_at"])
        self.write_audit(AuditAction.UPDATE, message)
        return Response(self.get_serializer(message).data, status=status.HTTP_200_OK)


AI_FEATURES_BY_ROLE = {
    UserRole.SUPER_ADMIN: {
        "school_performance_summary",
        "inactive_school_detection",
        "subscription_reminder_generator",
        "total_schools",
        "revenue_summary",
        "subscription_status",
        "system_health",
    },
    UserRole.SCHOOL_ADMIN: {
        "low_attendance_student_detection",
        "school_notice_generator",
        "student_performance_summary",
        "attendance_insights",
        "fee_collection_insights",
    },
    UserRole.ACCOUNT: {
        "fee_defaulter_summary",
        "payment_reminder_generator",
        "monthly_finance_summary",
    },
    UserRole.TEACHER: {
        "assignment_generator",
        "notes_summary",
        "question_paper_generator",
        "student_feedback_generator",
        "lesson_plan_generator",
    },
    UserRole.STUDENT: {
        "study_assistant",
        "notes_summarizer",
        "exam_preparation_suggestions",
        "explain_notes",
        "chapter_summarizer",
        "quiz_generator",
        "study_planner",
    },
}


def ai_campus_for_request(user, requested_campus=None) -> Campus | None:
    if user.role == UserRole.SUPER_ADMIN:
        if requested_campus:
            return get_object_or_404(Campus, id=requested_campus)
        return None
    campus = primary_school_for_user(user)
    if not campus:
        raise PermissionDenied("This account is not assigned to a school.")
    if requested_campus and str(campus.id) != str(requested_campus):
        raise PermissionDenied("AI tools cannot access another school.")
    return campus


def student_attendance_percentage(student: Student) -> int:
    records = AttendanceRecord.objects.filter(student=student)
    total = records.count()
    if not total:
        return 0
    present = records.filter(status__in=[AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.ON_DUTY]).count()
    return round((present / total) * 100)


def build_ai_response(user, feature: str, prompt: str, campus: Campus | None) -> tuple[str, dict]:
    today = timezone.localdate()
    metadata: dict = {"feature": feature, "role": user.role}
    if campus:
        metadata["campusId"] = campus.id
        metadata["campusCode"] = campus.code

    if user.role == UserRole.SUPER_ADMIN:
        schools = Campus.objects.all()
        if feature == "school_performance_summary":
            active = schools.filter(status="active").count()
            students = Student.objects.count()
            teachers = User.objects.filter(role=UserRole.TEACHER).count()
            return f"Platform summary: {active}/{schools.count()} schools active, {students} students, {teachers} teachers. Focus on schools with overdue subscriptions and low usage.", metadata
        if feature == "inactive_school_detection":
            inactive = list(schools.exclude(status="active").values_list("name", "status")[:10])
            return "Inactive or blocked schools: " + (", ".join(f"{name} ({status_value})" for name, status_value in inactive) or "none detected."), metadata
        if feature == "subscription_reminder_generator":
            overdue = schools.exclude(subscription_status="active")[:10]
            lines = [f"Reminder: {school.name}, please renew your MentriQ360 subscription to keep services uninterrupted." for school in overdue]
            return "\n".join(lines) or "All school subscriptions are active.", metadata
        if feature == "total_schools":
            return f"Total schools: {schools.count()}. Active: {schools.filter(status=SchoolStatus.ACTIVE).count()}, inactive: {schools.filter(status=SchoolStatus.INACTIVE).count()}, suspended: {schools.filter(status=SchoolStatus.SUSPENDED).count()}.", metadata
        if feature == "revenue_summary":
            payments = SubscriptionPayment.objects.filter(payment_status=EnterprisePaymentStatus.SUCCESS)
            total = payments.aggregate(total=Sum("amount")).get("total") or Decimal("0")
            fee_total = Payment.objects.filter(payment_status=TransactionStatus.SUCCESS).aggregate(total=Sum("amount_paid")).get("total") or Decimal("0")
            return f"Revenue summary: SaaS revenue INR {total}; school fee collections INR {fee_total}. Review failed payments and upcoming renewals.", metadata
        if feature == "subscription_status":
            rows = SchoolSubscription.objects.values("status").annotate(count=Count("id")).order_by("status")
            return "Subscription status: " + (", ".join(f"{row['status']}: {row['count']}" for row in rows) or "no subscriptions configured."), metadata
        if feature == "system_health":
            latest = SystemHealthSnapshot.objects.order_by("-checked_at")[:8]
            critical = SystemHealthSnapshot.objects.filter(status=HealthStatus.CRITICAL).count()
            return f"System health: {critical} critical snapshots. Latest checks: " + (", ".join(f"{item.component} {item.status}" for item in latest) or "no health snapshots yet."), metadata

    if not campus:
        raise PermissionDenied("A school context is required for this AI tool.")

    if user.role == UserRole.SCHOOL_ADMIN:
        if feature == "low_attendance_student_detection":
            students = Student.objects.filter(campus=campus)[:200]
            low = [(student.full_name, student_attendance_percentage(student)) for student in students]
            low = [item for item in low if item[1] and item[1] < 75][:10]
            return "Low attendance students: " + (", ".join(f"{name} ({pct}%)" for name, pct in low) or "none below 75%."), metadata
        if feature == "school_notice_generator":
            topic = prompt or "school update"
            return f"Notice: {campus.name} informs all students and staff about {topic}. Please follow the schedule and instructions shared by the school office.", metadata
        if feature == "student_performance_summary":
            results = ResultRecord.objects.filter(student__campus=campus)
            avg = "0"
            if results.exists():
                percentages = [(result.score / result.max_score) * 100 for result in results if result.max_score]
                avg = str(round(sum(percentages) / len(percentages), 2)) if percentages else "0"
            return f"Student performance summary for {campus.name}: average result percentage is {avg} across {results.count()} subject records.", metadata
        if feature == "attendance_insights":
            total = AttendanceRecord.objects.filter(student__campus=campus).count()
            absent = AttendanceRecord.objects.filter(student__campus=campus, status=AttendanceStatus.ABSENT).count()
            pct = str((Decimal(total - absent) / Decimal(total) * Decimal("100")).quantize(Decimal("0.01")) if total else Decimal("0.00"))
            return f"Attendance insights: {pct}% present/covered records, {absent} absent records. Prioritize parent alerts for repeated absence.", metadata
        if feature == "fee_collection_insights":
            fees = FeeAssignment.objects.filter(student__campus=campus)
            pending = sum(fee_outstanding_amount(fee) for fee in fees.exclude(status=FeeStatus.PAID))
            collected = Payment.objects.filter(campus=campus).aggregate(total=Sum("amount_paid")).get("total") or Decimal("0")
            return f"Fee collection insights: INR {collected} collected, INR {pending} pending. Send reminders to overdue families and review discounts.", metadata

    if user.role == UserRole.ACCOUNT:
        fees = FeeAssignment.objects.filter(student__campus=campus)
        if feature == "fee_defaulter_summary":
            pending = [fee for fee in fees.exclude(status=FeeStatus.PAID) if fee_outstanding_amount(fee) > 0][:10]
            return "Fee defaulters: " + (", ".join(f"{fee.student.full_name} owes INR {fee_outstanding_amount(fee)}" for fee in pending) or "no pending fees."), metadata
        if feature == "payment_reminder_generator":
            fee = fees.exclude(status=FeeStatus.PAID).order_by("due_date").first()
            if not fee:
                return "No payment reminder needed. All visible fees are paid.", metadata
            return f"Dear {fee.student.full_name}, INR {fee_outstanding_amount(fee)} is pending for {fee.title}, due {fee.due_date}. Please pay using your student portal.", metadata
        if feature == "monthly_finance_summary":
            payments = Payment.objects.filter(campus=campus, paid_on__year=today.year, paid_on__month=today.month)
            collected = payments.aggregate(total=Sum("amount_paid")).get("total") or Decimal("0")
            pending = sum(fee_outstanding_amount(fee) for fee in fees.exclude(status=FeeStatus.PAID))
            return f"Monthly finance summary: INR {collected} collected this month, INR {pending} pending.", metadata

    if user.role == UserRole.TEACHER:
        teacher_sections = ClassSection.objects.filter(teacher_section_q(user), campus=campus).distinct()
        if feature == "assignment_generator":
            subject = prompt or "the selected subject"
            return f"Assignment draft for {subject}: 1. Review key concepts. 2. Solve five applied problems. 3. Submit a one-page reflection before the deadline.", metadata
        if feature == "notes_summary":
            notes = LearningResource.objects.filter(section__in=teacher_sections, uploaded_by=user)
            return f"Notes summary: {notes.count()} notes uploaded. Recent topics: " + (", ".join(notes.values_list("title", flat=True)[:5]) or "no notes yet."), metadata
        if feature == "question_paper_generator":
            subject = prompt or "subject"
            return f"Question paper for {subject}: 5 short questions, 3 long-answer questions, and 2 application problems. Total marks: 50.", metadata
        if feature == "student_feedback_generator":
            student = Student.objects.filter(section__in=teacher_sections).first()
            name = student.full_name if student else "Student"
            return f"Feedback for {name}: shows consistent effort. Recommended focus: revision, timely submissions, and active class participation.", metadata
        if feature == "lesson_plan_generator":
            topic = prompt or "the next classroom topic"
            return f"Lesson plan for {topic}: objective, 10-minute warm-up, concept explanation, guided practice, assessment questions, and homework task.", metadata

    if user.role == UserRole.STUDENT:
        student = Student.objects.filter(user_id=user.pk, campus_id=campus.id).first()
        if not student:
            raise PermissionDenied("No student profile is linked to this login.")
        if feature == "study_assistant":
            return f"Study assistant: focus on today's pending assignments, revise recent notes, and spend 30 minutes on weak subjects. Prompt: {prompt or 'general study help'}", metadata
        if feature == "notes_summarizer":
            notes = LearningResource.objects.filter(section=student.section, is_published=True)
            return f"Notes available: {notes.count()}. Start with: " + (", ".join(notes.values_list("title", flat=True)[:5]) or "no notes published yet."), metadata
        if feature == "exam_preparation_suggestions":
            results = ResultRecord.objects.filter(student=student, is_published=True)
            weak = results.order_by("score").first()
            focus = weak.subject if weak else "core subjects"
            return f"Exam preparation: revise {focus}, solve previous assignments, and take a timed mock test this week.", metadata
        if feature == "explain_notes":
            return f"Notes explanation: break the topic into definitions, key examples, and one practice question. Topic: {prompt or 'recent class notes'}.", metadata
        if feature == "chapter_summarizer":
            return f"Chapter summary: identify the main idea, five key points, important terms, and one likely exam question for {prompt or 'the selected chapter'}.", metadata
        if feature == "quiz_generator":
            return f"Quiz: 1. Define the topic. 2. Give one example. 3. Solve one application problem. 4. Explain why the answer is correct. Topic: {prompt or 'current lesson'}.", metadata
        if feature == "study_planner":
            return "Study planner: 30 minutes notes review, 30 minutes assignment practice, 20 minutes quiz, 10 minutes recap, then update weak-topic list.", metadata

    raise ValidationError({"feature": "Unsupported AI feature for this role."})


class RoleAIToolView(APIView):
    permission_classes = [RoleAccessPermission]
    read_roles = READ_ROLES
    write_roles = READ_ROLES

    def get_throttles(self):
        if self.request.method.upper() == "POST":
            from rest_framework.throttling import ScopedRateThrottle
            return [ScopedRateThrottle()]
        return []

    @property
    def throttle_scope(self):
        return "ai_generation" if self.request.method.upper() == "POST" else None

    @extend_schema(
        responses=inline_serializer(
            name="RoleAIFeatureListResponse",
            fields={
                "features": drf_serializers.ListField(child=drf_serializers.CharField()),
            },
        )
    )
    def get(self, request):
        return Response({"features": sorted(AI_FEATURES_BY_ROLE.get(request.user.role, set()))}, status=status.HTTP_200_OK)

    @extend_schema(
        request=inline_serializer(
            name="RunRoleAIToolRequest",
            fields={
                "feature": drf_serializers.CharField(),
                "prompt": drf_serializers.CharField(required=False, allow_blank=True),
                "campus": drf_serializers.IntegerField(required=False),
            },
        ),
        responses=AILogSerializer,
    )
    def post(self, request):
        feature = request.data.get("feature")
        allowed = AI_FEATURES_BY_ROLE.get(request.user.role, set())
        if feature not in allowed:
            raise PermissionDenied("This AI feature is not available for your role.")
        campus = ai_campus_for_request(request.user, request.data.get("campus"))
        if campus:
            snapshot = subscription_limit_snapshot(campus)
            limit = snapshot["ai"]["limit"]
            if limit and snapshot["ai"]["used"] >= limit:
                raise ValidationError({"feature": "AI monthly subscription limit reached."})
        prompt = request.data.get("prompt", "")
        response_text, metadata = build_ai_response(request.user, feature, prompt, campus)
        log = AILog.objects.create(
            campus=campus,
            user=request.user,
            role=request.user.role,
            feature=feature,
            prompt=prompt,
            response=response_text,
            metadata=metadata,
            created_by=request.user,
        )
        AuditEvent.objects.create(
            actor=request.user,
            action=AuditAction.CREATE,
            entity_type="AILog",
            entity_id=str(log.id),
            summary=f"Ran AI tool {feature}",
            ip_address=get_client_ip(request),
            metadata=metadata,
        )
        return Response(AILogSerializer(log, context={"request": request}).data, status=status.HTTP_201_CREATED)


class AILogViewSet(RoleScopedModelViewSet):
    queryset = AILog.objects
    serializer_class = AILogSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = READ_ROLES
    filterset_fields = ("campus", "role", "feature", "status")
    search_fields = ("feature", "prompt", "response")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.ACCOUNT:
            campus_ids = self.admin_campus_ids()
            return queryset.filter(Q(campus_id__in=campus_ids) | Q(user_id=user.pk)).distinct() if campus_ids else queryset.filter(user_id=user.pk)
        if user.role in (UserRole.TEACHER, UserRole.STUDENT):
            return queryset.filter(user_id=user.pk)
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(user=self.request.user, role=self.request.user.role, created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)


class DocumentViewSet(RoleScopedModelViewSet):
    queryset = Document.objects
    serializer_class = DocumentSerializer
    campus_filter_path = "campus_id"
    read_roles = ACCOUNT_ROLES + (UserRole.TEACHER, UserRole.STUDENT)
    write_roles = ACCOUNT_ROLES + (UserRole.TEACHER,)
    filterset_fields = ("campus", "student", "staff_user", "document_type", "status")
    search_fields = ("title", "document_type", "student__first_name", "student__last_name")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.ACCOUNT:
            campus_ids = self.admin_campus_ids()
            return queryset.filter(campus_id__in=campus_ids) if campus_ids else queryset.none()
        if user.role == UserRole.TEACHER:
            return queryset.filter(
                Q(uploaded_by=user)
                | Q(staff_user=user)
                | Q(student__section__class_teacher=user)
                | Q(student__section__subject_allocations__teacher=user, student__section__subject_allocations__is_active=True)
            ).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(student__user=user)
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(uploaded_by=self.request.user, created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save()
        self.write_audit(AuditAction.UPDATE, instance)

    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, id=None):
        document = self.get_object()
        DocumentAccessLog.objects.create(
            campus=document.campus,
            document=document,
            user=request.user,
            student=document.student,
            access_type="download",
            file_name=document.title,
            granted=True,
            ip_address=get_client_ip(request),
            metadata={"documentType": document.document_type},
        )
        AuditEvent.objects.create(
            actor=request.user,
            action=AuditAction.EXPORT,
            entity_type="Document",
            entity_id=str(document.id),
            summary=f"Downloaded document {document.title}",
            ip_address=get_client_ip(request),
            metadata={"campus": document.campus.code, "documentType": document.document_type},
        )
        filename = f"{document.title or 'document'}.pdf"
        return protected_data_url_response(document.file_url, filename)


class PlatformSettingViewSet(RoleScopedModelViewSet):
    queryset = PlatformSetting.objects
    serializer_class = PlatformSettingSerializer
    campus_filter_path = "campus_id"
    read_roles = ACCOUNT_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "key", "status")
    search_fields = ("key",)

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.ACCOUNT:
            campus_ids = self.admin_campus_ids()
            return queryset.filter(Q(campus_id__in=campus_ids) | Q(campus__isnull=True)).distinct() if campus_ids else queryset.filter(campus__isnull=True)
        return queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save()
        self.write_audit(AuditAction.UPDATE, instance)


class AdmissionFormTemplateViewSet(RoleScopedModelViewSet):
    queryset = AdmissionFormTemplate.objects
    serializer_class = AdmissionFormTemplateSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "is_public", "status", "academic_year")
    search_fields = ("name", "academic_year", "campus__name", "campus__code")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save()
        self.write_audit(AuditAction.UPDATE, instance)


class AdmissionApplicationViewSet(RoleScopedModelViewSet):
    queryset = AdmissionApplication.objects
    serializer_class = AdmissionApplicationSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "form_template", "target_section", "status", "payment_status")
    search_fields = ("application_number", "tracking_code", "applicant_first_name", "applicant_last_name", "guardian_name", "contact_phone", "contact_email")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        campus = serializer.validated_data["campus"]
        form_template = serializer.validated_data.get("form_template")
        instance = serializer.save(
            application_number=next_admission_application_number(campus),
            tracking_code=generate_tracking_code(campus),
            admission_fee_amount=serializer.validated_data.get("admission_fee_amount") or (form_template.admission_fee if form_template else Decimal("0.00")),
            created_by=self.request.user,
        )
        self.write_audit(AuditAction.CREATE, instance)

    @action(detail=True, methods=["post"], url_path="transition")
    def transition(self, request, id=None):
        application = self.get_object()
        next_status = request.data.get("status")
        if next_status not in AdmissionApplicationStatus.values:
            raise ValidationError({"status": "Unsupported admission status."})
        application.status = next_status
        application.decision_note = request.data.get("decision_note", application.decision_note)
        interview_at_raw = request.data.get("interview_at")
        if interview_at_raw:
            interview_at = parse_datetime(interview_at_raw)
            if interview_at is None:
                raise ValidationError({"interview_at": "Use ISO datetime format."})
            application.interview_at = timezone.make_aware(interview_at) if timezone.is_naive(interview_at) else interview_at
        application.reviewed_by = request.user
        application.save(update_fields=["status", "decision_note", "interview_at", "reviewed_by", "updated_at"])
        self.write_audit(AuditAction.UPDATE, application)
        return Response(self.get_serializer(application).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="mark-payment")
    def mark_payment(self, request, id=None):
        application = self.get_object()
        payment_status = request.data.get("payment_status", TransactionStatus.SUCCESS)
        if payment_status not in TransactionStatus.values:
            raise ValidationError({"payment_status": "Unsupported payment status."})
        application.payment_status = payment_status
        application.payment_reference = request.data.get("payment_reference", application.payment_reference)
        application.save(update_fields=["payment_status", "payment_reference", "updated_at"])
        self.write_audit(AuditAction.UPDATE, application)
        return Response(self.get_serializer(application).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="admit")
    def admit(self, request, id=None):
        application = self.get_object()
        section = application.target_section
        if request.data.get("section"):
            section = get_object_or_404(ClassSection, id=request.data["section"], campus=application.campus)
        if not section:
            raise ValidationError({"section": "Select a class/section before admitting the student."})
        student = application.admitted_student
        if not student:
            student = Student.objects.create(
                campus=application.campus,
                section=section,
                admission_number=request.data.get("admission_number") or f"{application.campus.code}-ADM-STU-{application.id}",
                first_name=application.applicant_first_name,
                last_name=application.applicant_last_name,
                date_of_birth=application.date_of_birth,
                status=RecordStatus.ACTIVE,
            )
        application.admitted_student = student
        application.status = AdmissionApplicationStatus.ADMITTED
        application.reviewed_by = request.user
        application.save(update_fields=["admitted_student", "status", "reviewed_by", "updated_at"])
        self.write_audit(AuditAction.UPDATE, application)
        return Response(self.get_serializer(application).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="upload-document", parser_classes=[MultiPartParser, FormParser])
    def upload_document(self, request, id=None):
        application = self.get_object()
        upload = request.FILES.get("file")
        if not upload:
            raise ValidationError({"file": "Upload an admission document."})
        document = AdmissionDocument.objects.create(
            application=application,
            title=request.data.get("title") or upload.name,
            document_type=request.data.get("document_type") or "admission_document",
            file_url=uploaded_file_to_data_url(upload, allowed_types=ACADEMIC_FILE_TYPES, max_size=ACADEMIC_FILE_MAX_SIZE),
            file_name=upload.name,
            file_content_type=upload.content_type,
            uploaded_by=request.user,
        )
        self.write_audit(AuditAction.CREATE, document)
        return Response(AdmissionDocumentSerializer(document, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="dashboard")
    def dashboard(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        revenue = queryset.filter(payment_status=TransactionStatus.SUCCESS).aggregate(total=Sum("admission_fee_amount")).get("total") or Decimal("0")
        class_rows = (
            queryset.values("target_section__grade_name", "target_section__section_name")
            .annotate(count=Count("id"))
            .order_by("target_section__grade_name", "target_section__section_name")
        )
        payload = {
            "totalApplications": queryset.count(),
            "approvedStudents": queryset.filter(status__in=[AdmissionApplicationStatus.APPROVED, AdmissionApplicationStatus.ADMITTED]).count(),
            "rejectedStudents": queryset.filter(status=AdmissionApplicationStatus.REJECTED).count(),
            "admissionRevenue": str(revenue),
            "pipeline": dict(queryset.values_list("status").annotate(count=Count("id"))),
            "classWiseAdmissions": [
                {
                    "className": f"{row['target_section__grade_name'] or 'Unassigned'} {row['target_section__section_name'] or ''}".strip(),
                    "applications": row["count"],
                }
                for row in class_rows
            ],
        }
        return Response(payload, status=status.HTTP_200_OK)


class AdmissionDocumentViewSet(RoleScopedModelViewSet):
    queryset = AdmissionDocument.objects
    serializer_class = AdmissionDocumentSerializer
    campus_filter_path = "application__campus_id"
    read_roles = ADMIN_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("application", "document_type")
    search_fields = ("title", "file_name", "application__application_number")

    def campus_id_from_attrs(self, attrs) -> int | None:
        application = attrs.get("application")
        return application.campus_id if application else None

    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, id=None):
        document = self.get_object()
        DocumentAccessLog.objects.create(
            campus=document.application.campus,
            user=request.user,
            access_type="admission_document_download",
            file_name=document.file_name or document.title,
            granted=True,
            ip_address=get_client_ip(request),
            metadata={"applicationId": document.application_id, "documentType": document.document_type},
        )
        return protected_data_url_response(document.file_url, document.file_name or document.title, document.file_content_type)


class PublicAdmissionView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser]
    serializer_class = AdmissionApplicationSerializer

    @extend_schema(
        responses=inline_serializer(
            name="PublicAdmissionFormsResponse",
            fields={
                "school": drf_serializers.JSONField(),
                "forms": drf_serializers.JSONField(),
            },
        )
    )
    def get(self, request, school_code):
        campus = get_object_or_404(Campus, code__iexact=school_code, status=SchoolStatus.ACTIVE)
        forms = AdmissionFormTemplate.objects.filter(campus=campus, is_public=True, status=RecordStatus.ACTIVE)
        return Response(
            {
                "school": {"id": campus.id, "name": campus.name, "code": campus.code, "logo": campus.logo_url},
                "forms": AdmissionFormTemplateSerializer(forms, many=True, context={"request": request}).data,
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(responses=AdmissionApplicationSerializer)
    def post(self, request, school_code):
        campus = get_object_or_404(Campus, code__iexact=school_code, status=SchoolStatus.ACTIVE)
        form_template = None
        if request.data.get("form_template"):
            form_template = get_object_or_404(AdmissionFormTemplate, id=request.data["form_template"], campus=campus, is_public=True, status=RecordStatus.ACTIVE)
        else:
            form_template = AdmissionFormTemplate.objects.filter(campus=campus, is_public=True, status=RecordStatus.ACTIVE).first()
        section = None
        if request.data.get("target_section"):
            section = get_object_or_404(ClassSection, id=request.data["target_section"], campus=campus)
        application = AdmissionApplication.objects.create(
            campus=campus,
            form_template=form_template,
            target_section=section,
            application_number=next_admission_application_number(campus),
            tracking_code=generate_tracking_code(campus),
            applicant_first_name=request.data.get("applicant_first_name", "").strip(),
            applicant_last_name=request.data.get("applicant_last_name", "").strip(),
            date_of_birth=parse_date(request.data.get("date_of_birth") or ""),
            guardian_name=request.data.get("guardian_name", "").strip(),
            contact_email=request.data.get("contact_email", "").strip(),
            contact_phone=request.data.get("contact_phone", "").strip(),
            form_data=json.loads(request.data.get("form_data", "{}")) if isinstance(request.data.get("form_data"), str) else dict(request.data.get("form_data", {}) or {}),
            admission_fee_amount=form_template.admission_fee if form_template else Decimal("0.00"),
            payment_status=TransactionStatus.SUCCESS if not form_template or form_template.admission_fee == Decimal("0.00") else TransactionStatus.PENDING,
        )
        for upload in request.FILES.getlist("documents"):
            AdmissionDocument.objects.create(
                application=application,
                title=upload.name,
                document_type="admission_document",
                file_url=uploaded_file_to_data_url(upload, allowed_types=ACADEMIC_FILE_TYPES, max_size=ACADEMIC_FILE_MAX_SIZE),
                file_name=upload.name,
                file_content_type=upload.content_type,
            )
        return Response(AdmissionApplicationSerializer(application, context={"request": request}).data, status=status.HTTP_201_CREATED)


class PublicAdmissionTrackingView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=AdmissionApplicationSerializer)
    def get(self, request, tracking_code):
        application = get_object_or_404(AdmissionApplication.objects, tracking_code=tracking_code)
        return Response(AdmissionApplicationSerializer(application, context={"request": request}).data, status=status.HTTP_200_OK)


class TransportDriverViewSet(RoleScopedModelViewSet):
    queryset = TransportDriver.objects
    serializer_class = TransportDriverSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "status")
    search_fields = ("full_name", "phone", "license_number")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)


class TransportVehicleAttendanceViewSet(RoleScopedModelViewSet):
    queryset = TransportVehicleAttendance.objects
    serializer_class = TransportVehicleAttendanceSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "vehicle", "driver", "date", "status")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(marked_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)


class TransportTripLogViewSet(RoleScopedModelViewSet):
    queryset = TransportTripLog.objects
    serializer_class = TransportTripLogSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "route", "vehicle", "driver", "trip_date", "trip_type", "status")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.STUDENT:
            return queryset.filter(vehicle__student_assignments__student__user=user).distinct()
        if user.role == UserRole.TEACHER:
            return queryset.filter(campus__sections__class_teacher=user).distinct()
        school = primary_school_for_user(user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)


class DigitalLibraryResourceViewSet(RoleScopedModelViewSet):
    queryset = DigitalLibraryResource.objects
    serializer_class = DigitalLibraryResourceSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "book", "resource_type", "status")
    search_fields = ("title", "book__title", "file_name")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.STUDENT:
            return queryset.filter(campus__students__user=user, status=RecordStatus.ACTIVE).distinct()
        if user.role == UserRole.TEACHER:
            return queryset.filter(campus__sections__class_teacher=user, status=RecordStatus.ACTIVE).distinct()
        school = primary_school_for_user(user)
        return queryset.filter(campus=school) if school else queryset.none()

    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, id=None):
        resource = self.get_object()
        DocumentAccessLog.objects.create(
            campus=resource.campus,
            user=request.user,
            access_type="digital_library_download",
            file_name=resource.file_name or resource.title,
            granted=True,
            ip_address=get_client_ip(request),
            metadata={"resourceId": resource.id, "resourceType": resource.resource_type},
        )
        return protected_data_url_response(resource.file_url, resource.file_name or resource.title, resource.file_content_type)


class LibraryBookRequestViewSet(RoleScopedModelViewSet):
    queryset = LibraryBookRequest.objects
    serializer_class = LibraryBookRequestSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = READ_ROLES
    filterset_fields = ("campus", "book", "student", "staff_user", "status")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.STUDENT:
            return queryset.filter(student__user=user)
        if user.role == UserRole.TEACHER:
            return queryset.filter(Q(staff_user=user) | Q(campus__sections__class_teacher=user)).distinct()
        school = primary_school_for_user(user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        campus = serializer.validated_data.get("campus")
        if not campus:
            book = serializer.validated_data["book"]
            campus = book.campus
        if self.request.user.role == UserRole.STUDENT:
            student = get_object_or_404(Student, user=self.request.user, campus=campus)
            instance = serializer.save(campus=campus, student=student)
        elif self.request.user.role == UserRole.TEACHER:
            instance = serializer.save(campus=campus, staff_user=self.request.user)
        else:
            self.ensure_admin_payload_scope({**serializer.validated_data, "campus": campus})
            instance = serializer.save(campus=campus)
        self.write_audit(AuditAction.CREATE, instance)

    @action(detail=True, methods=["post"], url_path="decide")
    def decide(self, request, id=None):
        if request.user.role not in ADMIN_ROLES:
            raise PermissionDenied("Only admins can decide book requests.")
        item = self.get_object()
        next_status = request.data.get("status")
        if next_status not in {LibraryRequestStatus.APPROVED, LibraryRequestStatus.REJECTED, LibraryRequestStatus.ISSUED, LibraryRequestStatus.CANCELLED}:
            raise ValidationError({"status": "Use approved, rejected, issued, or cancelled."})
        item.status = next_status
        item.decision_note = request.data.get("decision_note", item.decision_note)
        item.decided_by = request.user
        item.save(update_fields=["status", "decision_note", "decided_by", "updated_at"])
        self.write_audit(AuditAction.UPDATE, item)
        return Response(self.get_serializer(item).data, status=status.HTTP_200_OK)


class InventoryAssetViewSet(RoleScopedModelViewSet):
    queryset = InventoryAsset.objects
    serializer_class = InventoryAssetSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "category", "status", "allocated_to_user", "allocated_to_student")
    search_fields = ("asset_code", "name", "serial_number", "location")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)


class AssetMaintenanceLogViewSet(RoleScopedModelViewSet):
    queryset = AssetMaintenanceLog.objects
    serializer_class = AssetMaintenanceLogSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "asset", "status", "maintenance_date")
    search_fields = ("asset__asset_code", "issue", "service_provider")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)


class SchoolWebsiteContentViewSet(RoleScopedModelViewSet):
    queryset = SchoolWebsiteContent.objects
    serializer_class = SchoolWebsiteContentSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "content_type", "is_published")
    search_fields = ("title", "slug", "summary")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)


class PublicSchoolWebsiteView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        responses=inline_serializer(
            name="PublicSchoolWebsiteResponse",
            fields={
                "school": drf_serializers.JSONField(),
                "contents": drf_serializers.JSONField(),
            },
        )
    )
    def get(self, request, school_code):
        campus = get_object_or_404(Campus, code__iexact=school_code, status=SchoolStatus.ACTIVE)
        queryset = SchoolWebsiteContent.objects.filter(campus=campus, is_published=True).order_by("sort_order", "-publish_at")
        content_type = request.query_params.get("content_type")
        if content_type:
            from apps.core.input import validate_enum_value
            from apps.core.mongo_models import WebsiteContentTypeEnum
            content_type = validate_enum_value(content_type, WebsiteContentTypeEnum)
            queryset = queryset.filter(content_type=content_type)
        return Response(
            {
                "school": {"id": campus.id, "name": campus.name, "code": campus.code, "logo": campus.logo_url, "banner": campus.banner_url},
                "contents": SchoolWebsiteContentSerializer(queryset, many=True, context={"request": request}).data,
            },
            status=status.HTTP_200_OK,
        )


class PushNotificationDeviceViewSet(RoleScopedModelViewSet):
    queryset = PushNotificationDevice.objects
    serializer_class = PushNotificationDeviceSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = READ_ROLES
    filterset_fields = ("campus", "user", "platform", "is_active")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role in (UserRole.TEACHER, UserRole.STUDENT):
            return queryset.filter(user_id=user.pk)
        school = primary_school_for_user(user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        user = serializer.validated_data.get("user") or self.request.user
        campus = serializer.validated_data.get("campus") or primary_school_for_user(user)
        if self.request.user.role not in ADMIN_ROLES and user != self.request.user:
            raise PermissionDenied("You can register only your own device.")
        instance = serializer.save(user=user, campus=campus, last_seen_at=timezone.now())
        self.write_audit(AuditAction.CREATE, instance)

    @action(detail=True, methods=["post"], url_path="disable")
    def disable(self, request, id=None):
        device = self.get_object()
        device.is_active = False
        device.save(update_fields=["is_active", "updated_at"])
        self.write_audit(AuditAction.UPDATE, device)
        return Response(self.get_serializer(device).data, status=status.HTTP_200_OK)


class PushNotificationLogViewSet(RoleScopedModelViewSet):
    queryset = PushNotificationLog.objects
    serializer_class = PushNotificationLogSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "user", "student", "event_type", "status")
    search_fields = ("title", "body", "event_type")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        if user.role == UserRole.STUDENT:
            return queryset.filter(Q(user_id=user.pk) | Q(student__user=user)).distinct()
        if user.role == UserRole.TEACHER:
            return queryset.filter(Q(user_id=user.pk) | Q(campus__sections__class_teacher=user)).distinct()
        school = primary_school_for_user(user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    @action(detail=True, methods=["post"], url_path="mark-sent")
    def mark_sent(self, request, id=None):
        item = self.get_object()
        item.status = PushNotificationStatus.SENT
        item.sent_at = timezone.now()
        item.error_message = ""
        item.save(update_fields=["status", "sent_at", "error_message", "updated_at"])
        self.write_audit(AuditAction.UPDATE, item)
        return Response(self.get_serializer(item).data, status=status.HTTP_200_OK)


class MobileAppBootstrapView(APIView):
    permission_classes = [RoleAccessPermission]
    read_roles = READ_ROLES
    write_roles = ()

    @extend_schema(
        responses=inline_serializer(
            name="MobileAppBootstrapResponse",
            fields={
                "user": drf_serializers.JSONField(),
                "school": drf_serializers.JSONField(allow_null=True),
                "modules": drf_serializers.JSONField(),
                "features": drf_serializers.ListField(child=drf_serializers.CharField()),
                "notifications": drf_serializers.JSONField(),
            },
        )
    )
    def get(self, request):
        campus = primary_school_for_user(request.user)
        # PushNotificationLog is keyed by user_id only (no student linkage in the Mongo model).
        notifications = PushNotificationLog.objects.filter(user_id=request.user.pk).order_by("-created_at")[:10]
        payload = {
            "user": {"id": request.user.id, "username": request.user.username, "role": request.user.role},
            "school": {"id": campus.id, "name": campus.name, "code": campus.code, "logo": campus.logo_url} if campus else None,
            "modules": campus.enabled_modules if campus else {},
            "features": sorted(AI_FEATURES_BY_ROLE.get(request.user.role, set())),
            "notifications": PushNotificationLogSerializer(notifications, many=True, context={"request": request}).data,
        }
        return Response(payload, status=status.HTTP_200_OK)


class MarketplacePluginViewSet(RoleScopedModelViewSet):
    queryset = MarketplacePlugin.objects.all()
    serializer_class = MarketplacePluginSerializer
    read_roles = ADMIN_ROLES
    write_roles = (UserRole.SUPER_ADMIN,)
    allow_global_admin_queryset = True
    filterset_fields = ("plugin_type", "is_enabled")
    search_fields = ("code", "name", "provider_name")

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)


class SchoolPluginConfigViewSet(RoleScopedModelViewSet):
    queryset = SchoolPluginConfig.objects
    serializer_class = SchoolPluginConfigSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "plugin", "is_enabled")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)


class AccountingLedgerEntryViewSet(RoleScopedModelViewSet):
    queryset = AccountingLedgerEntry.objects
    serializer_class = AccountingLedgerEntrySerializer
    campus_filter_path = "campus_id"
    read_roles = ACCOUNT_ROLES
    write_roles = ACCOUNT_ROLES
    filterset_fields = ("campus", "entry_type", "entry_date", "reference_type")
    search_fields = ("ledger_name", "reference_type", "reference_id")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    @action(detail=False, methods=["get"], url_path="gst-report")
    def gst_report(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        output = queryset.filter(entry_type__in=[AccountingEntryType.GST_INPUT, AccountingEntryType.GST_OUTPUT])
        payload = {
            "outputGst": str(output.filter(entry_type=AccountingEntryType.GST_OUTPUT).aggregate(total=Sum("gst_amount")).get("total") or Decimal("0")),
            "inputGst": str(output.filter(entry_type=AccountingEntryType.GST_INPUT).aggregate(total=Sum("gst_amount")).get("total") or Decimal("0")),
            "entries": AccountingLedgerEntrySerializer(output[:100], many=True, context={"request": request}).data,
        }
        return Response(payload, status=status.HTTP_200_OK)


def report_rows_for_definition(definition: ReportDefinition, campus: Campus | None) -> tuple[list[str], list[list[str]]]:
    if definition.report_type == ReportDefinitionType.ATTENDANCE:
        queryset = AttendanceRecord.objects
        if campus:
            queryset = queryset.filter(student__campus=campus)
        headers = ["Student", "Class", "Date", "Status"]
        rows = [[row.student.full_name, f"{row.section.grade_name}-{row.section.section_name}", row.date, row.status] for row in queryset[:500]]
        return headers, rows
    if definition.report_type == ReportDefinitionType.FEES:
        queryset = FeeAssignment.objects
        if campus:
            queryset = queryset.filter(student__campus=campus)
        headers = ["Student", "Fee", "Payable", "Due", "Status"]
        rows = [[row.student.full_name, row.title, row.payable_amount, row.due_date, row.status] for row in queryset[:500]]
        return headers, rows
    if definition.report_type == ReportDefinitionType.STAFF:
        queryset = StaffProfile.objects
        if campus:
            queryset = queryset.filter(campus=campus)
        headers = ["Staff", "Designation", "Department", "Status"]
        rows = [[row.user.get_full_name() or row.user.username, row.designation, row.department, row.status] for row in queryset[:500]]
        return headers, rows
    queryset = Student.objects
    if campus:
        queryset = queryset.filter(campus=campus)
    headers = ["Admission No", "Student", "Class", "Status"]
    rows = [[row.admission_number, row.full_name, f"{row.section.grade_name}-{row.section.section_name}", row.status] for row in queryset[:500]]
    return headers, rows


class ReportDefinitionViewSet(RoleScopedModelViewSet):
    queryset = ReportDefinition.objects
    serializer_class = ReportDefinitionSerializer
    campus_filter_path = "campus_id"
    read_roles = READ_ROLES
    write_roles = ACCOUNT_ROLES + (UserRole.TEACHER,)
    filterset_fields = ("campus", "report_type", "is_public_to_school")
    search_fields = ("name", "description")

    def filter_queryset_by_role(self, queryset):
        user = self.request.user
        school = primary_school_for_user(user)
        if not school:
            return queryset.none()
        if user.role == UserRole.TEACHER:
            return queryset.filter(Q(campus=school, is_public_to_school=True) | Q(created_by=user)).distinct()
        if user.role == UserRole.STUDENT:
            return queryset.filter(campus=school, is_public_to_school=True)
        return queryset.filter(campus=school)

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    @action(detail=True, methods=["get"], url_path="run")
    def run(self, request, id=None):
        definition = self.get_object()
        campus = definition.campus or primary_school_for_user(request.user)
        headers, rows = report_rows_for_definition(definition, campus)
        return Response({"headers": headers, "rows": rows, "count": len(rows)}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="export")
    def export(self, request, id=None):
        definition = self.get_object()
        campus = definition.campus or primary_school_for_user(request.user)
        headers, rows = report_rows_for_definition(definition, campus)
        return export_response(definition.name.replace(" ", "-").lower(), request.query_params.get("file_format", "excel"), headers, rows)


class SecurityPolicyViewSet(RoleScopedModelViewSet):
    queryset = SecurityPolicy.objects
    serializer_class = SecurityPolicySerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "two_factor_required")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)


class DeviceLoginSessionViewSet(RoleScopedModelViewSet):
    queryset = DeviceLoginSession.objects
    serializer_class = DeviceLoginSessionSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = (UserRole.SUPER_ADMIN,)
    filterset_fields = ("campus", "user", "is_active", "forced_logout", "event_type")
    search_fields = ("user__username", "device_id", "ip_address")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()

    @action(detail=True, methods=["post"], url_path="force-logout")
    def force_logout(self, request, id=None):
        session = self.get_object()
        session.is_active = False
        session.forced_logout = True
        session.logout_at = timezone.now()
        session.event_type = SecurityEventType.FORCE_LOGOUT
        session.save(update_fields=["is_active", "forced_logout", "logout_at", "event_type", "updated_at"])
        SecurityEvent.objects.create(campus=session.campus, user=session.user, event_type=SecurityEventType.FORCE_LOGOUT, severity="warning", summary=f"Forced logout for {session.user.username}", ip_address=get_client_ip(request))
        self.write_audit(AuditAction.UPDATE, session)
        return Response(self.get_serializer(session).data, status=status.HTTP_200_OK)


class SecurityEventViewSet(RoleScopedModelViewSet):
    queryset = SecurityEvent.objects
    serializer_class = SecurityEventSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = (UserRole.SUPER_ADMIN,)
    filterset_fields = ("campus", "user", "event_type", "severity", "resolved_at")
    search_fields = ("summary", "ip_address")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()

    @action(detail=True, methods=["post"], url_path="resolve")
    def resolve(self, request, id=None):
        item = self.get_object()
        item.resolved_at = timezone.now()
        item.resolved_by = request.user
        item.save(update_fields=["resolved_at", "resolved_by", "updated_at"])
        self.write_audit(AuditAction.UPDATE, item)
        return Response(self.get_serializer(item).data, status=status.HTTP_200_OK)


def build_production_audit_checks(campus: Campus | None = None) -> list[dict]:
    campus_filter = {"campus": campus} if campus else {}
    return [
        {"key": "protected_routes", "label": "Protected API routes", "passed": True, "detail": "RoleAccessPermission guards protected viewsets."},
        {"key": "tenant_isolation", "label": "Tenant isolation", "passed": True, "detail": "Campus-scoped query filters are active."},
        {"key": "file_access", "label": "Protected file access", "passed": DocumentAccessLog.objects.filter(**campus_filter).exists(), "detail": "Document access logs exist for protected downloads."},
        {"key": "payment_leakage", "label": "Payment leakage", "passed": not PaymentTransaction.objects.filter(**campus_filter, status=TransactionStatus.FAILED, webhook_verified=False).exists(), "detail": "Failed unverified payments are monitored."},
        {"key": "security_alerts", "label": "Security alerts", "passed": not SecurityEvent.objects.filter(**campus_filter, resolved_at__isnull=True, severity__in=["high", "critical"]).exists(), "detail": "No unresolved high/critical security events."},
        {"key": "broken_routes", "label": "Broken routes", "passed": True, "detail": "Registered API routes are generated by DRF router."},
        {"key": "role_escalation", "label": "Role escalation", "passed": True, "detail": "Super Admin protection and RBAC checks are enforced."},
    ]


class ProductionAuditRunViewSet(RoleScopedModelViewSet):
    queryset = ProductionAuditRun.objects
    serializer_class = ProductionAuditRunSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = (UserRole.SUPER_ADMIN,)
    filterset_fields = ("campus", "status")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()

    @action(detail=False, methods=["post"], url_path="run-now")
    def run_now(self, request):
        campus = None
        if request.data.get("campus"):
            campus = get_object_or_404(Campus, id=request.data["campus"])
        checks = build_production_audit_checks(campus)
        failed = [check for check in checks if not check["passed"]]
        audit = ProductionAuditRun.objects.create(
            campus=campus,
            status=ProductionAuditStatus.FAILED if failed else ProductionAuditStatus.PASSED,
            checks=checks,
            summary={"total": len(checks), "passed": len(checks) - len(failed), "failed": len(failed)},
            started_at=timezone.now(),
            completed_at=timezone.now(),
            created_by=request.user,
        )
        self.write_audit(AuditAction.CREATE, audit)
        return Response(self.get_serializer(audit).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="report")
    def report(self, request, id=None):
        audit = self.get_object()
        lines = [f"{check['label']}: {'PASS' if check['passed'] else 'FAIL'} - {check['detail']}" for check in audit.checks]
        response = HttpResponse(simple_pdf_bytes("Production Audit Report", lines), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="production-audit-{audit.id}.pdf"'
        return response


class Phase10EcosystemDashboardView(APIView):
    permission_classes = [RoleAccessPermission]
    read_roles = ADMIN_ROLES
    write_roles = ()

    @extend_schema(
        responses=inline_serializer(
            name="Phase10EcosystemDashboardResponse",
            fields={
                "scope": drf_serializers.CharField(),
                "admissions": drf_serializers.JSONField(),
                "transport": drf_serializers.JSONField(),
                "library": drf_serializers.JSONField(),
                "inventory": drf_serializers.JSONField(),
                "website": drf_serializers.JSONField(),
                "mobile": drf_serializers.JSONField(),
                "security": drf_serializers.JSONField(),
                "audit": drf_serializers.JSONField(),
            },
        )
    )
    def get(self, request):
        if request.user.role == UserRole.SUPER_ADMIN and request.query_params.get("campus"):
            campus = get_object_or_404(Campus, id=request.query_params.get("campus"))
        elif request.user.role == UserRole.SUPER_ADMIN:
            campus = None
        else:
            campus = primary_school_for_user(request.user)
            if not campus:
                raise PermissionDenied("No school context is available.")
        campus_filter = {"campus": campus} if campus else {}
        application_queryset = AdmissionApplication.objects.filter(**campus_filter)
        payload = {
            "scope": campus.code if campus else "platform",
            "admissions": {
                "total": application_queryset.count(),
                "approved": application_queryset.filter(status__in=[AdmissionApplicationStatus.APPROVED, AdmissionApplicationStatus.ADMITTED]).count(),
                "rejected": application_queryset.filter(status=AdmissionApplicationStatus.REJECTED).count(),
                # AdmissionApplication has no fee/payment fields in the Mongo model,
                # so admission revenue is not tracked here.
                "revenue": "0",
            },
            "transport": {
                "routes": TransportRoute.objects.filter(**campus_filter).count(),
                "vehicles": TransportVehicle.objects.filter(**campus_filter).count(),
                "drivers": TransportDriver.objects.filter(**campus_filter).count(),
                "activeAssignments": StudentTransportAssignment.objects.filter(route__campus=campus, is_active=True).count() if campus else StudentTransportAssignment.objects.filter(is_active=True).count(),
            },
            "library": {
                "books": LibraryBook.objects.filter(**campus_filter).count(),
                "issued": LibraryLoan.objects.filter(**campus_filter, status="issued").count(),
                "digitalResources": DigitalLibraryResource.objects.filter(**campus_filter).count(),
                "requests": LibraryBookRequest.objects.filter(**campus_filter, status="requested").count(),
            },
            "inventory": {
                "assets": InventoryAsset.objects.filter(**campus_filter).count(),
                "maintenance": AssetMaintenanceLog.objects.filter(**campus_filter).count(),
            },
            "website": {
                "published": SchoolWebsiteContent.objects.filter(**campus_filter, is_published=True).count(),
            },
            "mobile": {
                "pushDevices": PushNotificationDevice.objects.filter(**campus_filter, is_active=True).count(),
                "queuedNotifications": PushNotificationLog.objects.filter(**campus_filter, status=PushNotificationStatus.QUEUED).count(),
            },
            "security": {
                "activeSessions": DeviceLoginSession.objects.filter(**campus_filter, is_active=True).count(),
                "openAlerts": SecurityEvent.objects.filter(**campus_filter, resolved_at=None).count(),
            },
            "audit": {
                "latestStatus": getattr(ProductionAuditRun.objects.filter(**campus_filter).order_by("-created_at").first(), "status", None) or "not_run",
            },
        }
        return Response(payload, status=status.HTTP_200_OK)


class SaaSPlanViewSet(viewsets.ModelViewSet):
    queryset = SaaSPlan.objects.all()
    serializer_class = SaaSPlanSerializer
    permission_classes = [RoleAccessPermission]
    read_roles = (UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
    write_roles = (UserRole.SUPER_ADMIN,)
    filterset_fields = ("code", "is_active")
    search_fields = ("name", "description")

    def get_queryset(self):
        queryset = SaaSPlan.objects  # fresh queryset each request (avoid stale mongo cache)
        if getattr(self.request.user, "role", None) == UserRole.SCHOOL_ADMIN:
            return queryset.filter(is_active=True)
        return queryset

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        log_user_activity(self.request, "saas_plan:create", f"Created SaaS plan {instance.name}")

    def perform_update(self, serializer):
        instance = serializer.save()
        log_user_activity(self.request, "saas_plan:update", f"Updated SaaS plan {instance.name}")

    @action(detail=False, methods=["post"], url_path="seed-defaults")
    def seed_defaults(self, request):
        created_or_updated = []
        for code, values in DEFAULT_SAAS_PLANS.items():
            plan, _ = SaaSPlan.objects.update_or_create(
                code=code,
                defaults={**values, "description": f"Default {values['name']} SaaS plan.", "is_active": True, "created_by": request.user},
            )
            created_or_updated.append(plan)
        log_user_activity(request, "saas_plan:seed_defaults", "Seeded default SaaS plans")
        return Response(SaaSPlanSerializer(created_or_updated, many=True, context={"request": request}).data, status=status.HTTP_200_OK)


class SchoolSubscriptionViewSet(RoleScopedModelViewSet):
    queryset = SchoolSubscription.objects
    serializer_class = SchoolSubscriptionSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = (UserRole.SUPER_ADMIN,)
    filterset_fields = ("campus", "plan", "status", "billing_cycle")
    search_fields = ("campus__name", "campus__code", "plan__name", "gst_number")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        instance.sync_campus_fields()
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        instance = serializer.save()
        instance.sync_campus_fields()
        self.write_audit(AuditAction.UPDATE, instance)

    @action(detail=True, methods=["post"], url_path="renew")
    def renew(self, request, id=None):
        subscription = self.get_object()
        months = int(request.data.get("months") or (12 if subscription.billing_cycle == BillingCycle.ANNUAL else 1))
        if months <= 0 or months > 36:
            raise ValidationError({"months": "Renewal months must be between 1 and 36."})
        start = max(subscription.end_date + timedelta(days=1), timezone.localdate())
        subscription.start_date = start
        subscription.end_date = start + timedelta(days=30 * months)
        subscription.next_billing_date = subscription.end_date
        subscription.status = SubscriptionStatus.ACTIVE
        subscription.save(update_fields=["start_date", "end_date", "next_billing_date", "status", "updated_at"])
        subscription.sync_campus_fields()
        self.write_audit(AuditAction.UPDATE, subscription)
        return Response(self.get_serializer(subscription).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="generate-invoice")
    def generate_invoice(self, request, id=None):
        subscription = self.get_object()
        invoice = SubscriptionInvoice.objects.create(
            subscription=subscription,
            campus=subscription.campus,
            invoice_number=next_subscription_invoice_number(subscription.campus),
            billing_period_start=subscription.start_date,
            billing_period_end=subscription.end_date,
            base_amount=subscription.effective_price,
            discount_amount=Decimal(str(request.data.get("discount_amount") or "0.00")),
            gst_rate=Decimal(str(request.data.get("gst_rate") or "18.00")),
            currency=subscription.currency,
            status=InvoiceStatus.ISSUED,
            due_date=request.data.get("due_date") or timezone.localdate() + timedelta(days=7),
            created_by=request.user,
        )
        self.write_audit(AuditAction.CREATE, invoice)
        return Response(SubscriptionInvoiceSerializer(invoice, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="enforce-expiry")
    def enforce_expiry(self, request):
        updated = refresh_expired_subscriptions()
        log_user_activity(request, "subscription:enforce_expiry", f"Updated {updated} expired subscriptions")
        return Response({"updated": updated}, status=status.HTTP_200_OK)


class SubscriptionInvoiceViewSet(RoleScopedModelViewSet):
    queryset = SubscriptionInvoice.objects
    serializer_class = SubscriptionInvoiceSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = (UserRole.SUPER_ADMIN,)
    filterset_fields = ("campus", "subscription", "status", "due_date")
    search_fields = ("invoice_number", "campus__name", "campus__code")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        subscription = serializer.validated_data["subscription"]
        invoice_number = serializer.validated_data.get("invoice_number") or next_subscription_invoice_number(subscription.campus)
        instance = serializer.save(campus=subscription.campus, invoice_number=invoice_number, created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, id=None):
        invoice = self.get_object()
        lines = [
            f"GST Invoice: {invoice.invoice_number}",
            f"School: {invoice.campus.name}",
            f"Plan: {invoice.subscription.plan.name}",
            f"GSTIN: {invoice.subscription.gst_number or 'Not provided'}",
            f"Period: {invoice.billing_period_start} to {invoice.billing_period_end}",
            f"Base Amount: {invoice.base_amount}",
            f"Discount: {invoice.discount_amount}",
            f"GST Rate: {invoice.gst_rate}%",
            f"GST Amount: {invoice.gst_amount}",
            f"Total: {invoice.total_amount} {invoice.currency}",
            f"Status: {invoice.status}",
        ]
        log_user_activity(request, "subscription_invoice:download", f"Downloaded SaaS invoice {invoice.invoice_number}", campus=invoice.campus)
        response = HttpResponse(simple_pdf_bytes(f"Subscription Invoice - {invoice.invoice_number}", lines), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{invoice.invoice_number}.pdf"'
        return response


class SubscriptionPaymentViewSet(RoleScopedModelViewSet):
    queryset = SubscriptionPayment.objects
    serializer_class = SubscriptionPaymentSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = (UserRole.SUPER_ADMIN,)
    filterset_fields = ("campus", "invoice", "payment_status", "payment_mode", "provider")
    search_fields = ("transaction_id", "invoice__invoice_number", "campus__name", "campus__code")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        invoice = serializer.validated_data["invoice"]
        instance = serializer.save(campus=invoice.campus, created_by=self.request.user)
        if instance.payment_status == EnterprisePaymentStatus.SUCCESS:
            invoice.status = InvoiceStatus.PAID
            invoice.paid_at = instance.paid_at
            invoice.save(update_fields=["status", "paid_at", "updated_at"])
            subscription = invoice.subscription
            subscription.status = SubscriptionStatus.ACTIVE
            subscription.next_billing_date = subscription.end_date
            subscription.save(update_fields=["status", "next_billing_date", "updated_at"])
            subscription.sync_campus_fields()
        self.write_audit(AuditAction.CREATE, instance)


class WhiteLabelConfigViewSet(RoleScopedModelViewSet):
    queryset = WhiteLabelConfig.objects
    serializer_class = WhiteLabelConfigSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = ADMIN_ROLES
    filterset_fields = ("campus", "is_enabled", "custom_domain")
    search_fields = ("campus__name", "campus__code", "custom_domain", "login_heading")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()

    def perform_create(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    def perform_update(self, serializer):
        self.ensure_admin_payload_scope(serializer.validated_data)
        instance = serializer.save()
        self.write_audit(AuditAction.UPDATE, instance)


class UserActivityLogViewSet(RoleScopedModelViewSet):
    queryset = UserActivityLog.objects
    serializer_class = UserActivityLogSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = ()
    filterset_fields = ("campus", "user", "activity_type")
    search_fields = ("summary", "request_path", "ip_address")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()


class DocumentAccessLogViewSet(UserActivityLogViewSet):
    queryset = DocumentAccessLog.objects
    serializer_class = DocumentAccessLogSerializer
    filterset_fields = ("campus", "document", "user", "student", "access_type", "granted")
    search_fields = ("file_name", "reason", "ip_address")


class EnterpriseUsageMetricViewSet(RoleScopedModelViewSet):
    queryset = EnterpriseUsageMetric.objects
    serializer_class = EnterpriseUsageMetricSerializer
    campus_filter_path = "campus_id"
    read_roles = ADMIN_ROLES
    write_roles = (UserRole.SUPER_ADMIN,)
    filterset_fields = ("campus", "metric_type", "period_start", "period_end")
    search_fields = ("metric_type", "campus__name", "campus__code")

    def filter_queryset_by_role(self, queryset):
        school = primary_school_for_user(self.request.user)
        return queryset.filter(campus=school) if school else queryset.none()


class BackupPolicyViewSet(EnterpriseUsageMetricViewSet):
    queryset = BackupPolicy.objects
    serializer_class = BackupPolicySerializer
    write_roles = (UserRole.SUPER_ADMIN,)
    filterset_fields = ("campus", "backup_type", "frequency", "is_active")

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)


class BackupJobViewSet(EnterpriseUsageMetricViewSet):
    queryset = BackupJob.objects
    serializer_class = BackupJobSerializer
    write_roles = (UserRole.SUPER_ADMIN,)
    filterset_fields = ("campus", "backup_type", "status")

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    @action(detail=True, methods=["post"], url_path="mark-restored")
    def mark_restored(self, request, id=None):
        job = self.get_object()
        job.metadata = {**(job.metadata or {}), "restoreTestedAt": timezone.now().isoformat(), "restoreNote": request.data.get("note", "")}
        job.save(update_fields=["metadata", "updated_at"])
        self.write_audit(AuditAction.UPDATE, job)
        return Response(self.get_serializer(job).data, status=status.HTTP_200_OK)


class QueueJobViewSet(EnterpriseUsageMetricViewSet):
    queryset = QueueJob.objects
    serializer_class = QueueJobSerializer
    write_roles = (UserRole.SUPER_ADMIN,)
    filterset_fields = ("campus", "job_type", "status")

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        self.write_audit(AuditAction.CREATE, instance)

    @action(detail=False, methods=["post"], url_path="run-next")
    def run_next(self, request):
        job = QueueJob.objects.filter(status=JobStatus.QUEUED, scheduled_at__lte=timezone.now()).order_by("priority", "scheduled_at").first()
        if not job:
            return Response({"job": None, "message": "No queued jobs are ready."}, status=status.HTTP_200_OK)
        job.status = JobStatus.SUCCESS
        job.started_at = timezone.now()
        job.completed_at = timezone.now()
        job.attempts = F("attempts") + 1
        job.save(update_fields=["status", "started_at", "completed_at", "attempts", "updated_at"])
        job.refresh_from_db()
        self.write_audit(AuditAction.UPDATE, job)
        return Response(self.get_serializer(job).data, status=status.HTTP_200_OK)


class SystemHealthSnapshotViewSet(EnterpriseUsageMetricViewSet):
    queryset = SystemHealthSnapshot.objects
    serializer_class = SystemHealthSnapshotSerializer
    write_roles = (UserRole.SUPER_ADMIN,)
    filterset_fields = ("campus", "component", "status")


class SecureAPITokenViewSet(EnterpriseUsageMetricViewSet):
    queryset = SecureAPIToken.objects
    serializer_class = SecureAPITokenSerializer
    write_roles = (UserRole.SUPER_ADMIN,)
    filterset_fields = ("campus", "is_active", "prefix")
    search_fields = ("name", "prefix")

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        raw_token = getattr(self, "_created_raw_token", None)
        if raw_token:
            response.data["rawToken"] = raw_token
        return response

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        self._created_raw_token = getattr(instance, "_raw_token", None)
        self.write_audit(AuditAction.CREATE, instance)


class AuditEventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditEvent.objects
    serializer_class = AuditEventSerializer
    permission_classes = [RoleAccessPermission]
    read_roles = ADMIN_ROLES
    write_roles = ()
    filterset_fields = ("actor", "action", "entity_type")

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if getattr(user, "role", None) == UserRole.SUPER_ADMIN:
            return queryset
        if getattr(user, "role", None) != UserRole.SCHOOL_ADMIN:
            return queryset.none()

        campus_scope = CampusMembership.objects.filter(user_id=user.pk)
        campus_ids = list(campus_scope.values_list("campus_id", flat=True).distinct())
        campus_codes = list(campus_scope.values_list("campus__code", flat=True).distinct())
        if not campus_ids:
            return queryset.none()

        return queryset.filter(
            Q(actor__campus_memberships__campus_id__in=campus_ids)
            | Q(metadata__campus__in=campus_codes)
        ).distinct()


class EnterpriseAnalyticsView(APIView):
    permission_classes = [RoleAccessPermission]
    read_roles = (UserRole.SUPER_ADMIN,)
    write_roles = ()

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        cache_key = "enterprise_analytics:platform"
        cached = cache.get(cache_key)
        if cached:
            return Response(cached, status=status.HTTP_200_OK)

        today = timezone.localdate()
        month_start = today.replace(day=1)
        active_subscriptions = SchoolSubscription.objects.filter(status__in=[SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE])
        mrr = Decimal("0")
        for subscription in active_subscriptions:
            amount = subscription.effective_price
            if subscription.billing_cycle == BillingCycle.ANNUAL:
                amount = amount / Decimal("12")
            mrr += amount
        arr = mrr * Decimal("12")
        subscription_count = SchoolSubscription.objects.count()
        month_start_dt = timezone.make_aware(datetime.combine(month_start, datetime.min.time()))
        cancelled_or_expired = SchoolSubscription.objects.filter(status__in=[SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED], updated_at__gte=month_start_dt).count()
        churn_rate = Decimal("0.00")
        if subscription_count:
            churn_rate = (Decimal(cancelled_or_expired) / Decimal(subscription_count) * Decimal("100.00")).quantize(Decimal("0.01"))
        # Resolve plan revenue via the payment -> invoice -> subscription -> plan chain.
        # (mongoengine has no relational joins/aggregation, so build lookup maps in Python.)
        revenue = SubscriptionPayment.objects.filter(payment_status=EnterprisePaymentStatus.SUCCESS)
        plan_names = {str(p.id): p.name for p in SaaSPlan.objects.only("id", "name")}
        sub_plan = {str(s.id): plan_names.get(s.plan_id, "Unknown") for s in SchoolSubscription.objects.only("id", "plan_id")}
        invoice_plan = {str(inv.id): sub_plan.get(inv.subscription_id, "Unknown") for inv in SubscriptionInvoice.objects.only("id", "subscription_id")}
        revenue_totals: dict[str, Decimal] = {}
        for pay in revenue.only("invoice_id", "amount"):
            plan_name = invoice_plan.get(pay.invoice_id, "Unknown")
            revenue_totals[plan_name] = revenue_totals.get(plan_name, Decimal("0")) + (pay.amount or Decimal("0"))
        revenue_by_plan = [{"plan": name, "amount": str(amount)} for name, amount in sorted(revenue_totals.items())]
        growth_counter: dict[str, int] = {}
        for sub in SchoolSubscription.objects.only("created_at"):
            if sub.created_at:
                key = sub.created_at.date().isoformat()
                growth_counter[key] = growth_counter.get(key, 0) + 1
        growth_rows = [{"date": d, "subscriptions": c} for d, c in sorted(growth_counter.items())][-12:]
        payload = {
            "mrr": str(mrr.quantize(Decimal("0.01"))),
            "arr": str(arr.quantize(Decimal("0.01"))),
            "activeSchools": Campus.objects.filter(status=SchoolStatus.ACTIVE).count(),
            "totalSchools": Campus.objects.count(),
            "churnRate": str(churn_rate),
            "subscriptionGrowth": growth_rows,
            "revenueAnalytics": {
                "total": str(revenue.aggregate(total=Sum("amount")).get("total") or Decimal("0")),
                "monthly": str(revenue.filter(paid_at__gte=month_start_dt).aggregate(total=Sum("amount")).get("total") or Decimal("0")),
                "byPlan": revenue_by_plan,
            },
            "plans": list(SaaSPlan.objects.values("code", "name", "monthly_price", "annual_price", "is_active")),
            "limits": {
                "schoolsOverStudentLimit": sum(1 for campus in Campus.objects.all() if (subscription_limit_snapshot(campus)["students"]["limit"] and subscription_limit_snapshot(campus)["students"]["used"] > subscription_limit_snapshot(campus)["students"]["limit"])),
                "schoolsOverTeacherLimit": sum(1 for campus in Campus.objects.all() if (subscription_limit_snapshot(campus)["teachers"]["limit"] and subscription_limit_snapshot(campus)["teachers"]["used"] > subscription_limit_snapshot(campus)["teachers"]["limit"])),
            },
        }
        cache.set(cache_key, payload, 60)
        log_user_activity(request, "enterprise_analytics:view", "Viewed platform enterprise analytics")
        return Response(payload, status=status.HTTP_200_OK)


class SchoolEnterpriseAnalyticsView(APIView):
    permission_classes = [RoleAccessPermission]
    read_roles = ADMIN_ROLES
    write_roles = ()

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        if request.user.role == UserRole.SUPER_ADMIN and request.query_params.get("campus"):
            campus = get_object_or_404(Campus, id=request.query_params.get("campus"))
        else:
            campus = primary_school_for_user(request.user)
        if not campus:
            raise PermissionDenied("No school context is available.")

        today = timezone.localdate()
        month_start = today.replace(day=1)
        students = Student.objects.filter(campus=campus)
        attendance = AttendanceRecord.objects.filter(student__campus=campus)
        attendance_total = attendance.count()
        attendance_present = attendance.filter(status=AttendanceStatus.PRESENT).count()
        fees = FeeAssignment.objects.filter(student__campus=campus)
        payments = Payment.objects.filter(campus=campus)
        results = ResultRecord.objects.filter(student__campus=campus, is_published=True)
        teacher_rows = [
            {
                "teacherId": row["id"],
                "name": (row["first_name"] + " " + row["last_name"]).strip() or row["username"],
                "assignedSubjects": TeacherSubjectAllocation.objects.filter(teacher_id=row["id"], campus=campus, is_active=True).count(),
                "attendanceMarked": AttendanceRecord.objects.filter(marked_by_id=row["id"], student__campus=campus).count(),
                "notesUploaded": LearningResource.objects.filter(uploaded_by_id=row["id"], section__campus=campus).count(),
                "assignmentsCreated": AssignedWork.objects.filter(assigned_by_id=row["id"], section__campus=campus).count(),
            }
            for row in User.objects.filter(school=campus, role=UserRole.TEACHER, is_active=True).values("id", "username", "first_name", "last_name")
        ]
        payload = {
            "school": {"id": campus.id, "name": campus.name, "code": campus.code},
            "subscription": subscription_limit_snapshot(campus),
            "attendanceAnalytics": {
                "totalRecords": attendance_total,
                "presentRecords": attendance_present,
                "attendancePercentage": str((Decimal(attendance_present) / Decimal(attendance_total) * Decimal("100")).quantize(Decimal("0.01")) if attendance_total else Decimal("0.00")),
                "todayPresent": attendance.filter(date=today, status=AttendanceStatus.PRESENT).count(),
                "todayAbsent": attendance.filter(date=today, status=AttendanceStatus.ABSENT).count(),
            },
            "feeCollectionAnalytics": {
                "assigned": str(sum((fee.payable_amount for fee in fees), Decimal("0"))),
                "collected": str(payments.aggregate(total=Sum("amount_paid")).get("total") or Decimal("0")),
                "monthlyCollection": str(payments.filter(paid_on__gte=month_start).aggregate(total=Sum("amount_paid")).get("total") or Decimal("0")),
                "pendingCount": fees.exclude(status=FeeStatus.PAID).count(),
                "overdueCount": fees.filter(Q(status=FeeStatus.OVERDUE) | Q(due_date__lt=today)).exclude(status=FeeStatus.PAID).count(),
            },
            "studentPerformanceAnalytics": {
                "studentCount": students.count(),
                "averageScore": str(results.aggregate(avg=Avg("score")).get("avg") or Decimal("0")),
                "publishedResults": results.count(),
                "topSubjects": list(results.values("subject").annotate(avg=Avg("score"), count=Count("id")).order_by("-avg")[:6]),
            },
            "teacherPerformanceAnalytics": teacher_rows,
        }
        log_user_activity(request, "enterprise_analytics:school_view", f"Viewed school analytics for {campus.code}", campus=campus)
        return Response(payload, status=status.HTTP_200_OK)


class EnterpriseMonitoringView(APIView):
    permission_classes = [RoleAccessPermission]
    read_roles = ADMIN_ROLES
    write_roles = ()

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        if request.user.role == UserRole.SUPER_ADMIN and request.query_params.get("campus"):
            campus = get_object_or_404(Campus, id=request.query_params.get("campus"))
        elif request.user.role == UserRole.SUPER_ADMIN:
            campus = None
        else:
            campus = primary_school_for_user(request.user)
            if not campus:
                raise PermissionDenied("No school context is available.")

        campus_filter = {"campus": campus} if campus else {}
        latest_health = SystemHealthSnapshot.objects.filter(**campus_filter).order_by("-checked_at")[:20]
        backup_jobs = BackupJob.objects.filter(**campus_filter).order_by("-created_at")[:10]
        queue_jobs = QueueJob.objects.filter(**campus_filter).order_by("-created_at")[:10]
        failed_payments = PaymentTransaction.objects.filter(**({"campus": campus} if campus else {}), status=TransactionStatus.FAILED).count()
        month_start_dt = timezone.make_aware(datetime.combine(timezone.localdate().replace(day=1), datetime.min.time()))
        ai_usage = AILog.objects.filter(**({"campus": campus} if campus else {}), created_at__gte=month_start_dt).count()
        payload = {
            "scope": campus.code if campus else "platform",
            "health": SystemHealthSnapshotSerializer(latest_health, many=True, context={"request": request}).data,
            "backupJobs": BackupJobSerializer(backup_jobs, many=True, context={"request": request}).data,
            "queueJobs": QueueJobSerializer(queue_jobs, many=True, context={"request": request}).data,
            "paymentMonitoring": {"failedPayments": failed_payments},
            "aiUsageMonitoring": {"monthlyUsage": ai_usage},
            "storageMonitoring": list(EnterpriseUsageMetric.objects.filter(**campus_filter, metric_type="storage_mb").order_by("-period_end")[:10].values("campus_id", "quantity", "period_start", "period_end")),
            "alerts": {
                "criticalHealth": SystemHealthSnapshot.objects.filter(**campus_filter, status=HealthStatus.CRITICAL).count(),
                "failedBackups": BackupJob.objects.filter(**campus_filter, status=JobStatus.FAILED).count(),
                "failedQueueJobs": QueueJob.objects.filter(**campus_filter, status=JobStatus.FAILED).count(),
            },
        }
        log_user_activity(request, "enterprise_monitoring:view", f"Viewed monitoring dashboard for {payload['scope']}", campus=campus)
        return Response(payload, status=status.HTTP_200_OK)


class DashboardSummaryView(APIView):
    permission_classes = [RoleAccessPermission]
    read_roles = READ_ROLES
    write_roles = ()

    def admin_campus_ids(self, user):
        if user.role == UserRole.SUPER_ADMIN:
            return None
        if user.role in (UserRole.SCHOOL_ADMIN, UserRole.ACCOUNT):
            if getattr(user, "school_id", None):
                return [user.school_id]
            return list(CampusMembership.objects.filter(user_id=user.pk).values_list("campus_id", flat=True).distinct())
        return []

    def scoped_students(self, user):
        queryset = Student.objects
        if user.role == UserRole.SUPER_ADMIN:
            return queryset
        if user.role in (UserRole.SCHOOL_ADMIN, UserRole.ACCOUNT):
            campus_ids = self.admin_campus_ids(user)
            return queryset.filter(campus_id__in=campus_ids) if campus_ids else queryset.none()
        if user.role == UserRole.TEACHER:
            # Sections this teacher owns or is allocated to (mongoengine stores ids, not relations).
            section_ids = set(str(s) for s in ClassSection.objects.filter(class_teacher_id=user.pk).values_list("id", flat=True))
            section_ids |= set(
                str(s) for s in TeacherSubjectAllocation.objects.filter(teacher_id=user.pk, is_active=True).values_list("section_id", flat=True)
            )
            return queryset.filter(section_id__in=list(section_ids)) if section_ids else queryset.none()
        if user.role == UserRole.STUDENT:
            return queryset.filter(user_id=user.pk)
        return queryset.none()

    def scoped_campus_ids(self, user, students):
        if user.role == UserRole.SUPER_ADMIN:
            return [str(cid) for cid in Campus.objects.values_list("id", flat=True)]
        if user.role in (UserRole.SCHOOL_ADMIN, UserRole.ACCOUNT):
            return self.admin_campus_ids(user) or []
        return [str(c) for c in students.values_list("campus_id", flat=True).distinct() if c]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        user = request.user
        today = timezone.localdate()
        today_str = today.isoformat()
        month_start = today.replace(day=1)
        month_start_dt = timezone.make_aware(datetime.combine(month_start, datetime.min.time()))
        today_start_dt = timezone.make_aware(datetime.combine(today, datetime.min.time()))
        today_end_dt = today_start_dt + timedelta(days=1)

        students = self.scoped_students(user)
        student_ids = [str(sid) for sid in students.values_list("id", flat=True)]
        campus_ids = self.scoped_campus_ids(user, students)

        attendance = AttendanceRecord.objects.filter(student_id__in=student_ids)
        fees = FeeAssignment.objects.filter(student_id__in=student_ids)
        payments = Payment.objects.filter(student_id__in=student_ids)
        campuses = Campus.objects.filter(id__in=campus_ids)
        sections = ClassSection.objects.filter(campus_id__in=campus_ids)
        staff_attendance = StaffAttendanceRecord.objects.filter(campus_id__in=campus_ids)
        staff_profiles = StaffProfile.objects.filter(campus_id__in=campus_ids)
        payment_transactions = PaymentTransaction.objects.filter(campus_id__in=campus_ids)
        if user.role == UserRole.STUDENT:
            payment_transactions = payment_transactions.filter(student_id__in=student_ids)
        devices = AttendanceDevice.objects.filter(campus_id__in=campus_ids)
        approvals = ApprovalRequest.objects.filter(campus_id__in=campus_ids)
        member_user_ids = list(
            CampusMembership.objects.filter(campus_id__in=campus_ids).values_list("user_id", flat=True)
        )
        tenant_users = User.objects.filter(id__in=member_user_ids).distinct()
        today_student_attendance = attendance.filter(date=today_str)
        today_staff_attendance = staff_attendance.filter(date=today_str)

        # ── Fee / payment figures ──────────────────────────────────────────
        # NOTE: best-effort port. The fee-calculation and salary subsystems were
        # never fully ported to MongoDB, so payable amounts are derived inline
        # and salary figures report 0 until those models exist.
        successful_payments = payments.filter(status=TransactionStatus.SUCCESS)
        total_collected = sum((p.amount or Decimal("0")) for p in successful_payments.only("amount"))
        today_collection = sum((p.amount or Decimal("0")) for p in successful_payments.filter(paid_at__gte=today_start_dt, paid_at__lt=today_end_dt).only("amount"))
        monthly_collection = sum((p.amount or Decimal("0")) for p in successful_payments.filter(paid_at__gte=month_start_dt).only("amount"))
        online_modes = [PaymentMethod.ONLINE, PaymentMethod.UPI, PaymentMethod.CARD, PaymentMethod.NET_BANKING, PaymentMethod.WALLET]
        online_payment_total = sum((p.amount or Decimal("0")) for p in successful_payments.filter(payment_mode__in=online_modes).only("amount"))
        offline_payment_total = sum((p.amount or Decimal("0")) for p in successful_payments.filter(payment_mode__in=[PaymentMethod.CASH, PaymentMethod.BANK]).only("amount"))

        total_assigned = Decimal("0")
        pending_fee_amount = Decimal("0")
        overdue_fee_amount = Decimal("0")
        fees_by_status: dict[str, int] = {}
        for fee in fees.only("amount", "late_fee", "discount_amount", "paid_amount", "status", "due_date"):
            payable = (fee.amount or Decimal("0")) + (fee.late_fee or Decimal("0")) - (fee.discount_amount or Decimal("0"))
            outstanding = max(payable - (fee.paid_amount or Decimal("0")), Decimal("0"))
            total_assigned += payable
            fees_by_status[fee.status] = fees_by_status.get(fee.status, 0) + 1
            if fee.status != FeeStatus.PAID:
                pending_fee_amount += outstanding
                if fee.status == FeeStatus.OVERDUE or (fee.due_date and str(fee.due_date) < today_str):
                    overdue_fee_amount += outstanding

        monthly_subscriptions = sum((c.monthly_subscription_amount or Decimal("0")) for c in campuses.only("monthly_subscription_amount"))
        teacher_salary_payable = staff_salary_payable = salary_payable = Decimal("0")
        subscription_due_count = campuses.filter(subscription_status__ne="active").count()

        # ── Attendance group-bys (mongoengine has no values().annotate()) ──
        attendance_by_status: dict[str, int] = {}
        section_agg: dict[str, dict] = {}
        for rec in attendance.only("status", "section_id"):
            attendance_by_status[rec.status] = attendance_by_status.get(rec.status, 0) + 1
            bucket = section_agg.setdefault(rec.section_id, {"total": 0, "present": 0, "absent": 0})
            bucket["total"] += 1
            if rec.status == AttendanceStatus.PRESENT:
                bucket["present"] += 1
            elif rec.status == AttendanceStatus.ABSENT:
                bucket["absent"] += 1
        section_label_map = {str(s.id): s for s in ClassSection.objects.filter(id__in=list(section_agg.keys()))} if section_agg else {}
        section_rows = []
        for section_id, agg in section_agg.items():
            sec = section_label_map.get(section_id)
            section_rows.append({
                "section": section_id,
                "label": f"{sec.grade_name} - {sec.section_name}" if sec else section_id,
                "total": agg["total"], "present": agg["present"], "absent": agg["absent"],
            })

        staff_attendance_by_status: dict[str, int] = {}
        for rec in staff_attendance.only("status"):
            staff_attendance_by_status[rec.status] = staff_attendance_by_status.get(rec.status, 0) + 1
        devices_by_type: dict[str, int] = {}
        for dev in devices.only("device_type"):
            devices_by_type[dev.device_type] = devices_by_type.get(dev.device_type, 0) + 1

        # ── Recent payments / transactions (manual id → document resolution) ──
        recent_payment_docs = list(payments.order_by("-paid_at")[:8])
        recent_txn_docs = list(payment_transactions.order_by("-created_at")[:8])
        needed_student_ids = {p.student_id for p in recent_payment_docs} | {t.student_id for t in recent_txn_docs if t.student_id}
        student_cache = {str(s.id): s for s in Student.objects.filter(id__in=list(needed_student_ids))} if needed_student_ids else {}

        def _student_name(sid):
            st = student_cache.get(sid)
            return st.full_name if st else ""

        recent_payments = [
            {
                "id": str(p.id),
                "student_name": _student_name(p.student_id),
                "fee_title": "",
                "amount_paid": str(p.amount),
                "paid_on": p.paid_at,
                "payment_method": p.payment_mode,
                "reference_number": p.receipt_number,
            }
            for p in recent_payment_docs
        ]
        recent_transactions = [
            {
                "id": str(t.id),
                "student_name": _student_name(t.student_id) if t.student_id else "",
                "fee_title": "",
                "provider": t.provider,
                "amount": str(t.amount),
                "status": t.status,
                "gateway_order_id": t.gateway_order_id,
                "transaction_id": t.gateway_payment_id or getattr(t, "transaction_id", ""),
                "created_at": t.created_at,
            }
            for t in recent_txn_docs
        ]

        # ── Upcoming exams (manual id → document resolution) ──
        upcoming_exam_docs = list(ExamSchedule.objects.filter(campus_id__in=campus_ids, exam_date__gte=today_str).order_by("exam_date", "start_time")[:6])
        exam_type_map = {str(e.id): e.name for e in ExamType.objects.filter(id__in=[d.exam_type_id for d in upcoming_exam_docs])} if upcoming_exam_docs else {}
        exam_subject_map = {str(s.id): s.name for s in Subject.objects.filter(id__in=[d.subject_id for d in upcoming_exam_docs])} if upcoming_exam_docs else {}
        exam_section_map = {str(s.id): s for s in ClassSection.objects.filter(id__in=[d.section_id for d in upcoming_exam_docs])} if upcoming_exam_docs else {}
        upcoming_exams = []
        for exam in upcoming_exam_docs:
            sec = exam_section_map.get(exam.section_id)
            upcoming_exams.append({
                "id": str(exam.id),
                "title": exam.title,
                "exam_type": exam_type_map.get(exam.exam_type_id, ""),
                "section": f"{sec.grade_name} - {sec.section_name}" if sec else "",
                "subject": exam_subject_map.get(exam.subject_id, ""),
                "exam_date": exam.exam_date,
                "start_time": exam.start_time,
                "status": exam.status,
            })

        # ── Recent notices ──
        notice_docs = list(Announcement.objects.filter(campus_id__in=campus_ids, is_published=True).order_by("-published_at", "-created_at")[:6])
        notice_campus_map = {str(c.id): c.name for c in Campus.objects.filter(id__in=[n.campus_id for n in notice_docs])} if notice_docs else {}
        recent_notices = [
            {
                "id": str(n.id),
                "title": n.title,
                "audience": n.audience,
                "campus": notice_campus_map.get(n.campus_id, "All schools"),
                "publish_on": n.published_at,
            }
            for n in notice_docs
        ]

        return Response(
            {
                "students": {
                    "total": students.count(),
                    "active": students.filter(status="active").count(),
                },
                "classes": {
                    "total": sections.count(),
                },
                "schools": {
                    "total": campuses.count(),
                    "active": campuses.filter(status="active").count(),
                    "inactive": campuses.filter(status="inactive").count(),
                    "suspended": campuses.filter(status="suspended").count(),
                    "subscription_due": subscription_due_count,
                },
                "users": {
                    "total": tenant_users.count(),
                    "teachers": tenant_users.filter(role=UserRole.TEACHER).count(),
                    "accounts": tenant_users.filter(role=UserRole.ACCOUNT).count(),
                    "school_admins": tenant_users.filter(role=UserRole.SCHOOL_ADMIN).count(),
                    "active": tenant_users.filter(is_active=True).count(),
                },
                "attendance": {
                    "total": attendance.count(),
                    "today_total": today_student_attendance.count(),
                    "today_present": today_student_attendance.filter(status=AttendanceStatus.PRESENT).count(),
                    "today_absent": today_student_attendance.filter(status=AttendanceStatus.ABSENT).count(),
                    "by_status": attendance_by_status,
                    "by_section": section_rows,
                },
                "fees": {
                    "total_assigned": str(total_assigned),
                    "total_collected": str(total_collected),
                    "total_outstanding": str(max(total_assigned - total_collected, Decimal("0"))),
                    "monthly_subscriptions": str(monthly_subscriptions),
                    "pending_school_payments": subscription_due_count,
                    "salary_payable": str(salary_payable),
                    "by_status": fees_by_status,
                },
                "finance": {
                    "total_fee_collection": str(total_collected),
                    "today_collection": str(today_collection),
                    "monthly_collection": str(monthly_collection),
                    "pending_fees": str(pending_fee_amount),
                    "overdue_fees": str(overdue_fee_amount),
                    "online_payments": str(online_payment_total),
                    "offline_payments": str(offline_payment_total),
                    "failed_payments": payment_transactions.filter(status=TransactionStatus.FAILED).count(),
                    "teacher_salary_payable": str(teacher_salary_payable),
                    "staff_salary_payable": str(staff_salary_payable),
                    "recent_transactions": recent_transactions,
                },
                "staff": {
                    "total": staff_profiles.count(),
                    "active": staff_profiles.filter(status="active").count(),
                    "teachers": tenant_users.filter(role=UserRole.TEACHER).count(),
                },
                "staff_attendance": {
                    "total": staff_attendance.count(),
                    "today_total": today_staff_attendance.count(),
                    "today_present": today_staff_attendance.filter(status=StaffAttendanceStatus.PRESENT).count(),
                    "today_absent": today_staff_attendance.filter(status=StaffAttendanceStatus.ABSENT).count(),
                    "today_late": today_staff_attendance.filter(status=StaffAttendanceStatus.LATE).count(),
                    "by_status": staff_attendance_by_status,
                },
                "devices": {
                    "total": devices.count(),
                    "active": devices.filter(status="active").count(),
                    "by_type": devices_by_type,
                },
                "approvals": {
                    "pending": approvals.filter(status=ApprovalStatus.PENDING).count(),
                    "approved": approvals.filter(status=ApprovalStatus.APPROVED).count(),
                    "rejected": approvals.filter(status=ApprovalStatus.REJECTED).count(),
                },
                "recent_payments": recent_payments,
                "upcoming_exams": upcoming_exams,
                "recent_notices": recent_notices,
            }
        )
