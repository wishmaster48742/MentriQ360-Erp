import hashlib
import hmac
import base64
from datetime import date, time, timedelta
from decimal import Decimal
from io import BytesIO, StringIO

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.urls import reverse
from django.test import RequestFactory, SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from PIL import Image

from apps.accounts.models import User, UserRole
from apps.core.models import (
    AcademicSession,
    AcademicEvent,
    AccountingLedgerEntry,
    AdmitCard,
    AdmissionApplication,
    AdmissionFormTemplate,
    Announcement,
    AssetMaintenanceLog,
    AILog,
    AssignmentSubmission,
    AssignedWork,
    AttendanceRecord,
    AttendanceDevice,
    AuditAction,
    AuditEvent,
    BackupJob,
    BackupPolicy,
    CampusMembership,
    Campus,
    ClassSection,
    CommunicationSetting,
    DeviceLoginSession,
    DeviceSyncLog,
    Document,
    DocumentAccessLog,
    DigitalLibraryResource,
    ExamSchedule,
    ExamSubjectSetup,
    ExamType,
    FeeAssignment,
    FeeStructure,
    FinanceEvent,
    InventoryAsset,
    LibraryBook,
    LibraryBookRequest,
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
    SchoolSubscription,
    SchoolPluginConfig,
    SchoolWebsiteContent,
    SecureAPIToken,
    SecurityEvent,
    SecurityPolicy,
    StaffAttendanceRecord,
    StaffProfile,
    StaffAttendanceStatus,
    Student,
    SubscriptionInvoice,
    SubscriptionPayment,
    Subject,
    SupportTicket,
    SystemHealthSnapshot,
    TeacherSubjectAllocation,
    TransportDriver,
    TransportRoute,
    TransportTripLog,
    TransportVehicle,
    TransportVehicleAttendance,
    UserActivityLog,
    WhiteLabelConfig,
)
from apps.core.db_router import CampusTenantRouter
from apps.core.middleware import CampusTenantMiddleware
from apps.core.tenant import activate_campus_tenant, normalize_campus_database_alias, reset_campus_tenant


class CampusTenantRoutingTests(SimpleTestCase):
    @override_settings(
        CAMPUS_DATABASE_ALIAS_SET={"campus_m360_main"},
        TENANT_ROUTED_APPS=("accounts", "core"),
    )
    def test_router_uses_active_campus_database_alias(self):
        router = CampusTenantRouter()
        settings.DATABASES["campus_m360_main"] = settings.DATABASES["default"].copy()

        try:
            self.assertEqual(normalize_campus_database_alias("M360-MAIN"), "campus_m360_main")
            self.assertIsNone(router.db_for_read(Student))

            tokens = activate_campus_tenant("M360-MAIN", "campus_m360_main")
            try:
                self.assertEqual(router.db_for_read(Student), "campus_m360_main")
                self.assertEqual(router.db_for_write(Student), "campus_m360_main")
            finally:
                reset_campus_tenant(tokens)

            self.assertIsNone(router.db_for_read(Student))
        finally:
            settings.DATABASES.pop("campus_m360_main", None)


class CampusTenantMiddlewareTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.middleware = CampusTenantMiddleware(lambda request: None)

    @override_settings(TENANT_DOMAIN_SUFFIX="schools.example.com")
    def test_derives_campus_code_from_configured_subdomain(self):
        request = self.factory.get("/", HTTP_HOST="north.schools.example.com")

        self.assertEqual(self.middleware._campus_code_from_request(request), "NORTH")

    @override_settings(TENANT_DOMAIN_SUFFIX="schools.example.com")
    def test_header_takes_precedence_over_subdomain(self):
        request = self.factory.get("/", HTTP_HOST="north.schools.example.com", HTTP_X_CAMPUS_CODE="main")

        self.assertEqual(self.middleware._campus_code_from_request(request), "MAIN")

    @override_settings(TENANT_DOMAIN_SUFFIX="")
    def test_host_detection_is_disabled_without_suffix(self):
        request = self.factory.get("/", HTTP_HOST="north.schools.example.com")

        self.assertEqual(self.middleware._campus_code_from_request(request), "")


def make_uploaded_image(filename: str, content_type: str, image_format: str = "PNG") -> SimpleUploadedFile:
    buffer = BytesIO()
    Image.new("RGB", (16, 16), color=(32, 96, 160)).save(buffer, format=image_format)
    return SimpleUploadedFile(filename, buffer.getvalue(), content_type=content_type)


class ERPRoleFlowTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin",
            password="Passw0rd!123",
            role=UserRole.SCHOOL_ADMIN,
            is_staff=True,
        )
        self.super_admin = User.objects.create_user(
            username="superadmin",
            password="Passw0rd!123",
            role=UserRole.SUPER_ADMIN,
            is_staff=True,
            is_superuser=True,
        )
        self.teacher = User.objects.create_user(
            username="teacher",
            password="Passw0rd!123",
            role=UserRole.TEACHER,
        )
        self.student_user = User.objects.create_user(
            username="student",
            password="Passw0rd!123",
            role=UserRole.STUDENT,
        )
        self.other_teacher = User.objects.create_user(
            username="other_teacher",
            password="Passw0rd!123",
            role=UserRole.TEACHER,
        )

        self.campus = Campus.objects.create(name="Main Campus", code="MAIN")
        self.other_campus = Campus.objects.create(name="North Campus", code="NORTH")
        CampusMembership.objects.create(
            campus=self.campus,
            user=self.admin,
            role="it_admin",
            is_primary=True,
            can_manage_users=True,
            can_configure_attendance=True,
        )
        CampusMembership.objects.create(
            campus=self.other_campus,
            user=self.other_teacher,
            role="teacher",
            is_primary=True,
        )
        self.session = AcademicSession.objects.create(
            campus=self.campus,
            name="2026-27",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
        )
        self.other_session = AcademicSession.objects.create(
            campus=self.other_campus,
            name="2026-27",
            start_date=date(2026, 4, 1),
            end_date=date(2027, 3, 31),
        )
        self.section = ClassSection.objects.create(
            campus=self.campus,
            session=self.session,
            grade_name="Grade 5",
            section_name="A",
            class_teacher=self.teacher,
        )
        self.other_section = ClassSection.objects.create(
            campus=self.other_campus,
            session=self.other_session,
            grade_name="Grade 6",
            section_name="B",
            class_teacher=self.other_teacher,
        )
        self.student = Student.objects.create(
            campus=self.campus,
            section=self.section,
            user=self.student_user,
            admission_number="ADM-1",
            first_name="Anaya",
            last_name="Kapoor",
            date_of_birth=date(2015, 7, 18),
        )
        AttendanceRecord.objects.create(
            student=self.student,
            section=self.section,
            date=timezone.localdate() - timedelta(days=1),
            status="present",
            marked_by=self.teacher,
        )
        FeeAssignment.objects.create(
            student=self.student,
            title="Term Fee",
            amount=Decimal("12000.00"),
            due_date=date(2026, 6, 1),
        )
        AssignedWork.objects.create(
            section=self.section,
            assigned_by=self.teacher,
            title="Fractions",
            subject="Mathematics",
            description="Complete exercise 1.",
            due_date=date(2026, 5, 20),
        )
        LearningResource.objects.create(
            section=self.section,
            uploaded_by=self.teacher,
            title="Math Notes",
            subject="Mathematics",
            resource_type="notes",
            description="Revision notes.",
            published_on=date(2026, 5, 12),
        )
        ResultRecord.objects.create(
            student=self.student,
            recorded_by=self.teacher,
            exam_name="Unit Test 1",
            subject="Mathematics",
            score=Decimal("88"),
            max_score=Decimal("100"),
            grade="A",
            published_on=date(2026, 5, 13),
        )
        AdmitCard.objects.create(
            student=self.student,
            issued_by=self.admin,
            exam_name="Mid Term",
            roll_number="G5A-001",
            exam_date=date(2026, 6, 10),
            reporting_time=time(8, 30),
            venue="Room 205",
            status="issued",
            issued_on=date(2026, 5, 15),
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_admin_can_read_dashboard_summary(self):
        self.authenticate(self.admin)
        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["students"]["total"], 1)
        self.assertEqual(response.data["attendance"]["by_status"]["present"], 1)

    def test_admin_can_configure_attendance_hardware_settings(self):
        self.authenticate(self.admin)
        payload = {
            "campus": self.campus.id,
            "name": "Main Gate Nialabs Terminal",
            "device_code": "NIALABS-MAIN-01",
            "device_type": "face_recognition",
            "location": "Main gate",
            "provider": "Nialabs",
            "status": "active",
            "is_enabled_for_students": True,
            "is_enabled_for_staff": True,
            "server_required": True,
            "use_domain_name": True,
            "domain_name": "device.example.com",
            "server_ip": "192.168.1.100",
            "server_port": 7743,
            "heartbeat_seconds": 3,
            "server_approval_required": False,
            "device_numeric_id": 1,
            "local_port": 5005,
            "baud_rate": 38400,
            "rs485_function": "software",
        }

        response = self.client.post("/api/v1/attendance-devices/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["domain_name"], "device.example.com")
        self.assertEqual(response.data["server_port"], 7743)
        self.assertEqual(response.data["local_port"], 5005)
        self.assertEqual(response.data["baud_rate"], 38400)
        self.assertEqual(response.data["rs485_function"], "software")
        self.assertEqual(response.data["configured_by"], self.admin.id)

    def test_student_can_read_own_workspace_only(self):
        self.authenticate(self.student_user)

        students_response = self.client.get("/api/v1/students/")
        attendance_response = self.client.get("/api/v1/attendance-records/")
        fees_response = self.client.get("/api/v1/fee-assignments/")
        audit_response = self.client.get("/api/v1/audit-events/")
        write_response = self.client.post(
            "/api/v1/students/",
            {
                "campus": self.campus.id,
                "section": self.section.id,
                "admission_number": "ADM-STUDENT-BLOCKED",
                "first_name": "Blocked",
                "last_name": "Student",
                "date_of_birth": "2015-05-10",
                "status": "active",
            },
            format="json",
        )

        self.assertEqual(students_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(students_response.data), 1)
        self.assertEqual(students_response.data[0]["id"], self.student.id)
        self.assertEqual(attendance_response.status_code, status.HTTP_200_OK)
        self.assertEqual(fees_response.status_code, status.HTTP_200_OK)
        self.assertEqual(audit_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(write_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_is_scoped_to_assigned_campus(self):
        self.authenticate(self.admin)

        campus_response = self.client.get("/api/v1/campuses/")
        blocked_student = self.client.post(
            "/api/v1/students/",
            {
                "campus": self.other_campus.id,
                "section": self.other_section.id,
                "admission_number": "ADM-NORTH-1",
                "first_name": "Nikhil",
                "last_name": "Rao",
                "date_of_birth": "2015-05-10",
                "status": "active",
            },
            format="json",
        )
        blocked_user = self.client.post(
            "/api/v1/auth/users/",
            {
                "username": "north-admin",
                "password": "Passw0rd!123",
                "role": "school_admin",
                "campus_ids": [self.other_campus.id],
            },
            format="json",
        )

        self.assertEqual(campus_response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id"] for item in campus_response.data], [self.campus.id])
        self.assertEqual(blocked_student.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(blocked_user.status_code, status.HTTP_400_BAD_REQUEST)

    def test_phase3_student_crud_uploads_downloads_and_cross_school_block(self):
        other_admin = User.objects.create_user(
            username="north-school-admin",
            password="Passw0rd!123",
            role=UserRole.SCHOOL_ADMIN,
            school=self.other_campus,
            is_staff=True,
        )
        CampusMembership.objects.create(
            campus=self.other_campus,
            user=other_admin,
            role="it_admin",
            is_primary=True,
            can_manage_users=True,
            can_configure_attendance=True,
        )

        self.authenticate(self.admin)
        create_response = self.client.post(
            "/api/v1/students/",
            {
                "campus": self.campus.id,
                "section": self.section.id,
                "first_name": "Kabir",
                "last_name": "Sen",
                "date_of_birth": "2015-08-11",
                "status": "active",
            },
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        self.assertTrue(create_response.data["admission_number"].startswith("MAIN-STU-"))
        student_id = create_response.data["id"]

        photo_response = self.client.post(
            f"/api/v1/students/{student_id}/upload-photo/",
            {"file": make_uploaded_image("student.png", "image/png", "PNG")},
            format="multipart",
        )
        document_response = self.client.post(
            f"/api/v1/students/{student_id}/upload-document/",
            {
                "title": "Birth certificate",
                "document_type": "birth_certificate",
                "file": SimpleUploadedFile("birth.pdf", b"%PDF-1.4", content_type="application/pdf"),
            },
            format="multipart",
        )
        pdf_response = self.client.get(f"/api/v1/students/{student_id}/profile-pdf/")
        deactivate_response = self.client.patch(
            f"/api/v1/students/{student_id}/",
            {"status": "inactive"},
            format="json",
        )

        self.assertEqual(photo_response.status_code, status.HTTP_200_OK, photo_response.data)
        self.assertTrue(photo_response.data["photo_url"].startswith("data:image/png;base64,"))
        self.assertEqual(document_response.status_code, status.HTTP_201_CREATED, document_response.data)
        self.assertEqual(document_response.data["student"], student_id)
        self.assertEqual(pdf_response.status_code, status.HTTP_200_OK)
        self.assertEqual(pdf_response["Content-Type"], "application/pdf")
        self.assertEqual(deactivate_response.status_code, status.HTTP_200_OK)
        self.assertEqual(deactivate_response.data["status"], "inactive")

        self.authenticate(other_admin)
        blocked_detail = self.client.get(f"/api/v1/students/{student_id}/")
        blocked_update = self.client.patch(
            f"/api/v1/students/{student_id}/",
            {"first_name": "Tampered"},
            format="json",
        )

        self.assertEqual(blocked_detail.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(blocked_update.status_code, status.HTTP_404_NOT_FOUND)

    def test_phase3_staff_subject_exam_attendance_notice_and_result_workflows(self):
        other_admin = User.objects.create_user(
            username="north-phase3-admin",
            password="Passw0rd!123",
            role=UserRole.SCHOOL_ADMIN,
            school=self.other_campus,
            is_staff=True,
        )
        CampusMembership.objects.create(campus=self.other_campus, user=other_admin, role="it_admin", is_primary=True)

        self.authenticate(self.admin)
        staff_response = self.client.post(
            "/api/v1/staff-profiles/",
            {
                "campus": self.campus.id,
                "user": self.teacher.id,
                "designation": "Class Teacher",
                "department": "Academics",
                "employment_type": "full_time",
                "joining_date": "2026-04-01",
                "qualification": "B.Ed",
                "emergency_contact": "9876500101",
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(staff_response.status_code, status.HTTP_201_CREATED, staff_response.data)
        self.assertTrue(staff_response.data["employee_code"].startswith("MAIN-EMP-"))
        staff_id = staff_response.data["id"]

        staff_photo = self.client.post(
            f"/api/v1/staff-profiles/{staff_id}/upload-photo/",
            {"file": make_uploaded_image("teacher.webp", "image/webp", "WEBP")},
            format="multipart",
        )
        staff_document = self.client.post(
            f"/api/v1/staff-profiles/{staff_id}/upload-document/",
            {
                "title": "Qualification",
                "document_type": "qualification",
                "file": SimpleUploadedFile("qualification.pdf", b"%PDF-1.4", content_type="application/pdf"),
            },
            format="multipart",
        )
        staff_attendance = self.client.post(
            "/api/v1/staff-attendance-records/",
            {
                "campus": self.campus.id,
                "staff_user": self.teacher.id,
                "date": timezone.localdate().isoformat(),
                "clock_in": "08:10:00",
                "clock_out": None,
                "status": "late",
                "capture_method": "manual",
                "device": None,
                "notes": "Manual correction",
            },
            format="json",
        )
        staff_summary = self.client.get(f"/api/v1/staff-profiles/{staff_id}/attendance-summary/")

        self.assertEqual(staff_photo.status_code, status.HTTP_200_OK, staff_photo.data)
        self.assertTrue(staff_photo.data["photo_url"].startswith("data:image/webp;base64,"))
        self.assertEqual(staff_document.status_code, status.HTTP_201_CREATED, staff_document.data)
        self.assertEqual(staff_document.data["staff_user"], self.teacher.id)
        self.assertEqual(staff_attendance.status_code, status.HTTP_201_CREATED, staff_attendance.data)
        self.assertEqual(staff_summary.status_code, status.HTTP_200_OK)
        self.assertEqual(staff_summary.data["byStatus"]["late"], 1)

        subject_response = self.client.post(
            "/api/v1/subjects/",
            {
                "campus": self.campus.id,
                "name": "Mathematics",
                "code": "math",
                "grade_name": "Grade 5",
                "description": "Core mathematics",
                "is_active": True,
            },
            format="json",
        )
        exam_type_response = self.client.post(
            "/api/v1/exam-types/",
            {"campus": self.campus.id, "name": "Unit Test", "description": "Monthly test", "is_active": True},
            format="json",
        )
        self.assertEqual(subject_response.status_code, status.HTTP_201_CREATED, subject_response.data)
        self.assertEqual(exam_type_response.status_code, status.HTTP_201_CREATED, exam_type_response.data)
        self.assertEqual(subject_response.data["code"], "MATH")

        marks_setup_response = self.client.post(
            "/api/v1/exam-subject-setups/",
            {
                "campus": self.campus.id,
                "exam_type": exam_type_response.data["id"],
                "section": self.section.id,
                "subject": subject_response.data["id"],
                "max_marks": "50.00",
                "pass_marks": "17.00",
                "weightage": "100.00",
                "is_active": True,
            },
            format="json",
        )
        schedule_response = self.client.post(
            "/api/v1/exam-schedules/",
            {
                "campus": self.campus.id,
                "exam_type": exam_type_response.data["id"],
                "section": self.section.id,
                "subject": subject_response.data["id"],
                "title": "Unit Test Mathematics",
                "exam_date": (timezone.localdate() + timedelta(days=7)).isoformat(),
                "start_time": "09:00:00",
                "end_time": "10:00:00",
                "max_marks": "50.00",
                "venue": "Room 205",
                "instructions": "Bring stationery.",
                "status": "draft",
            },
            format="json",
        )
        self.assertEqual(marks_setup_response.status_code, status.HTTP_201_CREATED, marks_setup_response.data)
        self.assertEqual(schedule_response.status_code, status.HTTP_201_CREATED, schedule_response.data)

        publish_schedule = self.client.post(f"/api/v1/exam-schedules/{schedule_response.data['id']}/publish/", {}, format="json")
        unpublish_schedule = self.client.post(f"/api/v1/exam-schedules/{schedule_response.data['id']}/unpublish/", {}, format="json")
        archive_schedule = self.client.post(f"/api/v1/exam-schedules/{schedule_response.data['id']}/archive/", {}, format="json")
        self.assertEqual(publish_schedule.data["status"], "published")
        self.assertEqual(unpublish_schedule.data["status"], "draft")
        self.assertEqual(archive_schedule.data["status"], "archived")

        unpublish_result = self.client.post(f"/api/v1/result-records/{self.student.result_records.first().id}/unpublish/", {}, format="json")
        self.authenticate(self.student_user)
        hidden_results = self.client.get("/api/v1/result-records/")
        self.assertEqual(unpublish_result.status_code, status.HTTP_200_OK)
        self.assertEqual(hidden_results.data, [])

        self.authenticate(self.admin)
        publish_result = self.client.post(f"/api/v1/result-records/{self.student.result_records.first().id}/publish/", {}, format="json")
        student_attendance_export = self.client.get("/api/v1/attendance-records/export/?file_format=pdf")
        staff_attendance_export = self.client.get("/api/v1/staff-attendance-records/export/?file_format=excel")
        notice_response = self.client.post(
            "/api/v1/announcements/",
            {"title": "Exam notice", "message": "Unit test next week", "audience": "all", "is_active": True},
            format="json",
        )
        publish_notice = self.client.post(f"/api/v1/announcements/{notice_response.data['id']}/publish/", {}, format="json")
        unpublish_notice = self.client.post(f"/api/v1/announcements/{notice_response.data['id']}/unpublish/", {}, format="json")
        archive_notice = self.client.post(f"/api/v1/announcements/{notice_response.data['id']}/archive/", {}, format="json")

        self.assertEqual(publish_result.status_code, status.HTTP_200_OK)
        self.assertTrue(publish_result.data["is_published"])
        self.assertEqual(student_attendance_export.status_code, status.HTTP_200_OK)
        self.assertEqual(student_attendance_export["Content-Type"], "application/pdf")
        self.assertEqual(staff_attendance_export.status_code, status.HTTP_200_OK)
        self.assertEqual(staff_attendance_export["Content-Type"], "application/vnd.ms-excel")
        self.assertEqual(notice_response.status_code, status.HTTP_201_CREATED, notice_response.data)
        self.assertEqual(notice_response.data["campus"], self.campus.id)
        self.assertTrue(publish_notice.data["is_active"])
        self.assertFalse(unpublish_notice.data["is_active"])
        self.assertFalse(archive_notice.data["is_active"])

        self.authenticate(other_admin)
        other_subjects = self.client.get("/api/v1/subjects/")
        other_notices = self.client.get("/api/v1/announcements/")
        other_schedule = self.client.get(f"/api/v1/exam-schedules/{schedule_response.data['id']}/")
        self.assertEqual(other_subjects.status_code, status.HTTP_200_OK)
        self.assertEqual(other_subjects.data, [])
        self.assertEqual(other_notices.status_code, status.HTTP_200_OK)
        self.assertEqual(other_notices.data, [])
        self.assertEqual(other_schedule.status_code, status.HTTP_404_NOT_FOUND)

    def test_super_admin_can_configure_campus_branding(self):
        logo_data = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'></svg>"

        self.authenticate(self.admin)
        denied = self.client.patch(
            f"/api/v1/campuses/{self.campus.id}/",
            {"logo_url": logo_data, "logo_alt_text": "Main Campus"},
            format="json",
        )

        self.authenticate(self.super_admin)
        response = self.client.patch(
            f"/api/v1/campuses/{self.campus.id}/",
            {"logo_url": logo_data, "logo_alt_text": "Main Campus"},
            format="json",
        )

        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["logo_url"], logo_data)
        self.assertEqual(response.data["logo_alt_text"], "Main Campus")

    def test_super_admin_can_create_school_with_admin_and_school_admin_is_isolated(self):
        self.authenticate(self.super_admin)
        create_response = self.client.post(
            "/api/v1/schools/",
            {
                "schoolName": "Phase Two Academy",
                "address": "12 Knowledge Park",
                "city": "Bengaluru",
                "state": "Karnataka",
                "pincode": "560001",
                "contactNumber": "9876500001",
                "email": "office@phasetwo.example",
                "principalName": "Dr Meera Rao",
                "subscriptionStatus": "active",
                "adminUsername": "phase2.admin",
                "adminEmail": "admin@phasetwo.example",
                "adminFirstName": "Phase",
                "adminLastName": "Admin",
            },
            format="json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        self.assertIn("schoolCode", create_response.data)
        self.assertIn("temporaryPassword", create_response.data["adminUser"])

        created_school = Campus.objects.get(code=create_response.data["schoolCode"])
        created_admin = User.objects.get(username="phase2.admin")
        self.assertEqual(created_admin.role, UserRole.SCHOOL_ADMIN)
        self.assertEqual(created_admin.school_id, created_school.id)
        self.assertTrue(created_admin.must_change_password)
        self.assertTrue(CampusMembership.objects.filter(user=created_admin, campus=created_school).exists())

        self.authenticate(created_admin)
        own_profile = self.client.get("/api/v1/schools/me/")
        school_list = self.client.get("/api/v1/schools/")
        other_school = self.client.get(f"/api/v1/schools/{self.other_campus.id}/")
        update_attempt = self.client.patch(
            f"/api/v1/schools/{created_school.id}/",
            {"schoolName": "Tampered"},
            format="json",
        )

        self.assertEqual(own_profile.status_code, status.HTTP_200_OK)
        self.assertEqual(own_profile.data["schoolId"], created_school.id)
        self.assertNotIn("tenantId", own_profile.data)
        self.assertEqual(school_list.status_code, status.HTTP_200_OK)
        self.assertEqual([item["schoolId"] for item in school_list.data], [created_school.id])
        self.assertEqual(other_school.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(update_attempt.status_code, status.HTTP_403_FORBIDDEN)

    def test_audit_events_are_scoped_for_admin_and_global_for_super_admin(self):
        main_event = AuditEvent.objects.create(
            actor=self.admin,
            action=AuditAction.UPDATE,
            entity_type="Student",
            entity_id=str(self.student.id),
            summary="Main campus student update",
            metadata={"campus": self.campus.code},
        )
        other_event = AuditEvent.objects.create(
            actor=self.other_teacher,
            action=AuditAction.UPDATE,
            entity_type="Student",
            entity_id="other-campus",
            summary="Other campus student update",
            metadata={"campus": self.other_campus.code},
        )

        self.authenticate(self.admin)
        admin_response = self.client.get("/api/v1/audit-events/")
        self.assertEqual(admin_response.status_code, status.HTTP_200_OK)
        self.assertEqual([event["id"] for event in admin_response.data], [main_event.id])

        self.authenticate(self.super_admin)
        super_response = self.client.get("/api/v1/audit-events/")
        self.assertEqual(super_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {main_event.id, other_event.id}.issubset({event["id"] for event in super_response.data}),
            True,
        )

    def test_teacher_can_bulk_mark_only_assigned_section(self):
        self.authenticate(self.teacher)
        device = AttendanceDevice.objects.create(
            campus=self.campus,
            name="Main Gate Face Terminal",
            device_code="FACE-MAIN-01",
            device_type="face_recognition",
        )
        response = self.client.post(
            "/api/v1/attendance-records/bulk-upsert/",
            {
                "section": self.section.id,
                "date": timezone.localdate().isoformat(),
                "capture_method": "face_recognition",
                "device": device.id,
                "records": [{"student": self.student.id, "status": "half_day"}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        saved = AttendanceRecord.objects.get(date=timezone.localdate())
        self.assertEqual(saved.status, "half_day")
        self.assertEqual(saved.capture_method, "face_recognition")
        self.assertTrue(AcademicEvent.objects.filter(campus=self.campus, event_type="attendanceMarked", student=self.student).exists())

        self.authenticate(self.other_teacher)
        denied = self.client.post(
            "/api/v1/attendance-records/bulk-upsert/",
            {
                "section": self.section.id,
                "date": timezone.localdate().isoformat(),
                "records": [{"student": self.student.id, "status": "present"}],
            },
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_subject_teacher_can_mark_only_allotted_subject_attendance(self):
        TeacherSubjectAllocation.objects.create(
            campus=self.campus,
            section=self.section,
            teacher=self.other_teacher,
            subject="Science",
            weekly_periods=5,
        )

        self.authenticate(self.other_teacher)
        allocations = self.client.get("/api/v1/teacher-subject-allocations/")
        students = self.client.get(f"/api/v1/students/?section={self.section.id}")
        allowed = self.client.post(
            "/api/v1/attendance-records/bulk-upsert/",
            {
                "section": self.section.id,
                "date": timezone.localdate().isoformat(),
                "subject": "Science",
                "records": [{"student": self.student.id, "status": "present"}],
            },
            format="json",
        )
        denied = self.client.post(
            "/api/v1/attendance-records/bulk-upsert/",
            {
                "section": self.section.id,
                "date": timezone.localdate().isoformat(),
                "subject": "Mathematics",
                "records": [{"student": self.student.id, "status": "absent"}],
            },
            format="json",
        )

        self.assertEqual(allocations.status_code, status.HTTP_200_OK)
        self.assertEqual([item["subject"] for item in allocations.data], ["Science"])
        self.assertEqual(students.status_code, status.HTTP_200_OK)
        self.assertEqual(len(students.data), 1)
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
        saved = AttendanceRecord.objects.get(student=self.student, date=timezone.localdate(), subject="Science")
        self.assertEqual(saved.marked_by, self.other_teacher)
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_attendance_older_than_three_days_is_locked(self):
        self.authenticate(self.teacher)
        response = self.client.post(
            "/api/v1/attendance-records/bulk-upsert/",
            {
                "section": self.section.id,
                "date": (timezone.localdate() - timedelta(days=4)).isoformat(),
                "records": [{"student": self.student.id, "status": "present"}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_student_can_read_own_academic_workspace_only(self):
        self.authenticate(self.student_user)

        students_response = self.client.get("/api/v1/students/")
        work_response = self.client.get("/api/v1/assigned-work/")
        resources_response = self.client.get("/api/v1/learning-resources/")
        results_response = self.client.get("/api/v1/result-records/")
        admit_cards_response = self.client.get("/api/v1/admit-cards/")
        write_response = self.client.post(
            "/api/v1/assigned-work/",
            {
                "section": self.section.id,
                "title": "Blocked",
                "subject": "Science",
                "due_date": "2026-06-01",
            },
            format="json",
        )

        self.assertEqual(students_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(students_response.data), 1)
        self.assertEqual(students_response.data[0]["user"], self.student_user.id)
        self.assertEqual(work_response.status_code, status.HTTP_200_OK)
        self.assertEqual(resources_response.status_code, status.HTTP_200_OK)
        self.assertEqual(results_response.status_code, status.HTTP_200_OK)
        self.assertEqual(admit_cards_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(work_response.data), 1)
        self.assertEqual(len(resources_response.data), 1)
        self.assertEqual(len(results_response.data), 1)
        self.assertEqual(len(admit_cards_response.data), 1)
        self.assertEqual(write_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_phase5_teacher_notes_assignments_submissions_and_downloads_are_scoped(self):
        self.authenticate(self.teacher)
        notes_response = self.client.post(
            "/api/v1/learning-resources/upload/",
            {
                "section": self.section.id,
                "title": "Algebra Notes",
                "subject": "Mathematics",
                "resource_type": "notes",
                "description": "Linear equations.",
                "is_published": "true",
                "file": SimpleUploadedFile("algebra.pdf", b"%PDF-1.4 notes", content_type="application/pdf"),
            },
            format="multipart",
        )
        assignment_response = self.client.post(
            "/api/v1/assigned-work/upload/",
            {
                "section": self.section.id,
                "title": "Algebra Worksheet",
                "subject": "Mathematics",
                "description": "Solve ten equations.",
                "due_date": "2026-06-20",
                "status": "published",
                "file": SimpleUploadedFile("worksheet.pdf", b"%PDF-1.4 assignment", content_type="application/pdf"),
            },
            format="multipart",
        )

        self.assertEqual(notes_response.status_code, status.HTTP_201_CREATED, notes_response.data)
        self.assertEqual(assignment_response.status_code, status.HTTP_201_CREATED, assignment_response.data)
        notes_id = notes_response.data["id"]
        assignment_id = assignment_response.data["id"]

        self.authenticate(self.student_user)
        notes_list = self.client.get("/api/v1/learning-resources/")
        work_list = self.client.get("/api/v1/assigned-work/")
        notes_download = self.client.get(f"/api/v1/learning-resources/{notes_id}/download/")
        submission_response = self.client.post(
            f"/api/v1/assigned-work/{assignment_id}/submit/",
            {
                "notes": "Completed.",
                "file": SimpleUploadedFile("submission.pdf", b"%PDF-1.4 submission", content_type="application/pdf"),
            },
            format="multipart",
        )

        self.assertEqual(notes_list.status_code, status.HTTP_200_OK)
        self.assertIn(notes_id, [item["id"] for item in notes_list.data])
        self.assertEqual(work_list.status_code, status.HTTP_200_OK)
        self.assertIn(assignment_id, [item["id"] for item in work_list.data])
        self.assertEqual(notes_download.status_code, status.HTTP_200_OK)
        self.assertEqual(notes_download["Content-Type"], "application/pdf")
        self.assertEqual(submission_response.status_code, status.HTTP_200_OK, submission_response.data)
        self.assertEqual(submission_response.data["status"], "pending")
        submission_id = submission_response.data["id"]

        other_student_user = User.objects.create_user(username="north-phase5-student", password="Passw0rd!123", role=UserRole.STUDENT, school=self.other_campus)
        Student.objects.create(
            campus=self.other_campus,
            section=self.other_section,
            user=other_student_user,
            admission_number="NORTH-P5-1",
            first_name="Nira",
            last_name="Rao",
            date_of_birth=date(2015, 1, 1),
        )
        self.authenticate(other_student_user)
        blocked_notes = self.client.get(f"/api/v1/learning-resources/{notes_id}/download/")
        blocked_submit = self.client.post(
            f"/api/v1/assigned-work/{assignment_id}/submit/",
            {"file": SimpleUploadedFile("blocked.pdf", b"x", content_type="application/pdf")},
            format="multipart",
        )
        self.assertEqual(blocked_notes.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(blocked_submit.status_code, status.HTTP_404_NOT_FOUND)

        self.authenticate(self.teacher)
        submissions = self.client.get(f"/api/v1/assigned-work/{assignment_id}/submissions/")
        submission_download = self.client.get(f"/api/v1/assignment-submissions/{submission_id}/download/")
        checked = self.client.post(
            f"/api/v1/assignment-submissions/{submission_id}/mark-checked/",
            {"remarks": "Well done."},
            format="json",
        )

        self.assertEqual(submissions.status_code, status.HTTP_200_OK)
        self.assertEqual(len(submissions.data), 1)
        self.assertEqual(submission_download.status_code, status.HTTP_200_OK)
        self.assertEqual(checked.status_code, status.HTTP_200_OK, checked.data)
        self.assertEqual(checked.data["status"], "checked")
        self.assertEqual(checked.data["remarks"], "Well done.")
        self.assertTrue(AssignmentSubmission.objects.filter(pk=submission_id, checked_by=self.teacher).exists())
        self.assertTrue(AcademicEvent.objects.filter(campus=self.campus, event_type="notesUploaded").exists())
        self.assertTrue(AcademicEvent.objects.filter(campus=self.campus, event_type="assignmentPublished").exists())
        self.assertTrue(AcademicEvent.objects.filter(campus=self.campus, event_type="assignmentSubmitted", student=self.student).exists())

    def test_phase5_marks_review_publish_and_result_download_are_scoped(self):
        self.authenticate(self.teacher)
        result_response = self.client.post(
            "/api/v1/result-records/",
            {
                "student": self.student.id,
                "exam_name": "Final Test",
                "subject": "Mathematics",
                "score": "91.00",
                "max_score": "100.00",
                "grade": "A+",
                "remarks": "Strong performance.",
                "is_published": True,
            },
            format="json",
        )
        self.assertEqual(result_response.status_code, status.HTTP_201_CREATED, result_response.data)
        self.assertFalse(result_response.data["is_published"])
        self.assertEqual(result_response.data["review_status"], "draft")
        result_id = result_response.data["id"]

        upload_response = self.client.post(
            f"/api/v1/result-records/{result_id}/upload-marks/",
            {"file": SimpleUploadedFile("marks.pdf", b"%PDF-1.4 marks", content_type="application/pdf")},
            format="multipart",
        )
        submit_response = self.client.post(f"/api/v1/result-records/{result_id}/submit-review/", {}, format="json")
        self.assertEqual(upload_response.status_code, status.HTTP_200_OK, upload_response.data)
        self.assertEqual(upload_response.data["marks_file_name"], "marks.pdf")
        self.assertEqual(submit_response.status_code, status.HTTP_200_OK, submit_response.data)
        self.assertEqual(submit_response.data["review_status"], "submitted")

        self.authenticate(self.student_user)
        hidden_results = self.client.get("/api/v1/result-records/")
        self.assertNotIn(result_id, [item["id"] for item in hidden_results.data])

        self.authenticate(self.admin)
        approve_response = self.client.post(
            f"/api/v1/result-records/{result_id}/approve/",
            {"review_note": "Approved for publication."},
            format="json",
        )
        publish_response = self.client.post(f"/api/v1/result-records/{result_id}/publish/", {}, format="json")
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK, approve_response.data)
        self.assertEqual(approve_response.data["review_status"], "approved")
        self.assertEqual(publish_response.status_code, status.HTTP_200_OK, publish_response.data)
        self.assertTrue(publish_response.data["is_published"])

        self.authenticate(self.student_user)
        visible_results = self.client.get("/api/v1/result-records/")
        result_pdf = self.client.get(f"/api/v1/result-records/{result_id}/download-result/")
        self.assertIn(result_id, [item["id"] for item in visible_results.data])
        self.assertEqual(result_pdf.status_code, status.HTTP_200_OK)
        self.assertEqual(result_pdf["Content-Type"], "application/pdf")

        other_student_user = User.objects.create_user(username="north-result-student", password="Passw0rd!123", role=UserRole.STUDENT, school=self.other_campus)
        Student.objects.create(
            campus=self.other_campus,
            section=self.other_section,
            user=other_student_user,
            admission_number="NORTH-RESULT-1",
            first_name="Reva",
            last_name="Rao",
            date_of_birth=date(2015, 1, 1),
        )
        self.authenticate(other_student_user)
        blocked_pdf = self.client.get(f"/api/v1/result-records/{result_id}/download-result/")
        self.assertEqual(blocked_pdf.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(AcademicEvent.objects.filter(campus=self.campus, event_type="resultPublished", student=self.student).exists())

    def test_phase6_realtime_ai_communication_and_device_sync_are_scoped(self):
        account_user = User.objects.create_user(
            username="phase6-account",
            password="Passw0rd!123",
            role=UserRole.ACCOUNT,
            school=self.campus,
            email="accounts@example.com",
        )
        CampusMembership.objects.create(campus=self.campus, user=account_user, role="finance_admin", is_primary=True)
        other_student_user = User.objects.create_user(username="phase6-north-student", password="Passw0rd!123", role=UserRole.STUDENT, school=self.other_campus)
        other_student = Student.objects.create(
            campus=self.other_campus,
            section=self.other_section,
            user=other_student_user,
            admission_number="P6-NORTH-1",
            first_name="North",
            last_name="Learner",
            date_of_birth=date(2015, 1, 1),
        )
        AcademicEvent.objects.create(
            campus=self.campus,
            event_type="assignmentUploaded",
            payload={"sectionId": self.section.id, "studentId": self.student.id},
            student=self.student,
            teacher=self.teacher,
            created_by=self.teacher,
        )
        AcademicEvent.objects.create(
            campus=self.other_campus,
            event_type="assignmentUploaded",
            payload={"sectionId": self.other_section.id, "studentId": other_student.id},
            student=other_student,
            created_by=self.other_teacher,
        )
        FinanceEvent.objects.create(
            campus=self.campus,
            event_type="feePaid",
            payload={"studentId": self.student.id, "amount": "100.00"},
            created_by=account_user,
        )

        self.authenticate(self.student_user)
        realtime_response = self.client.get("/api/v1/realtime/events/")
        self.assertEqual(realtime_response.status_code, status.HTTP_200_OK)
        event_ids = [event["payload"].get("studentId") for event in realtime_response.data["events"]]
        self.assertIn(self.student.id, event_ids)
        self.assertNotIn(other_student.id, event_ids)
        student_event = realtime_response.data["events"][0]
        self.assertIn(f"school:{self.campus.id}", student_event["rooms"])
        self.assertIn(f"user:{self.student_user.id}", student_event["rooms"])
        self.assertTrue(any(room.startswith(f"class:{self.campus.id}:") for room in student_event["rooms"]))

        ai_response = self.client.post(
            "/api/v1/ai-tools/",
            {"feature": "study_assistant", "prompt": "math revision"},
            format="json",
        )
        blocked_ai = self.client.post(
            "/api/v1/ai-tools/",
            {"feature": "monthly_finance_summary", "prompt": "finance"},
            format="json",
        )
        self.assertEqual(ai_response.status_code, status.HTTP_201_CREATED, ai_response.data)
        self.assertIn("Study assistant", ai_response.data["response"])
        self.assertEqual(blocked_ai.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(AILog.objects.filter(user=self.student_user, feature="study_assistant", campus=self.campus).exists())

        self.authenticate(account_user)
        setting_response = self.client.post(
            "/api/v1/communication-settings/",
            {
                "campus": self.campus.id,
                "channel": "email",
                "provider_name": "SMTP",
                "smtp_host": "smtp.example.com",
                "smtp_port": 587,
                "smtp_username": "school@example.com",
                "smtp_password": "secret-password",
                "api_key": "secret-key",
                "api_secret": "secret-api",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(setting_response.status_code, status.HTTP_201_CREATED, setting_response.data)
        self.assertNotIn("api_key", setting_response.data)
        self.assertTrue(setting_response.data["has_api_key"])
        self.assertTrue(CommunicationSetting.objects.filter(campus=self.campus, channel="email").exists())
        setting = CommunicationSetting.objects.get(campus=self.campus, channel="email")
        self.assertNotEqual(setting.api_key, "secret-key")
        self.assertNotEqual(setting.api_secret, "secret-api")
        self.assertNotEqual(setting.smtp_password, "secret-password")
        self.assertEqual(setting.get_api_key(), "secret-key")
        self.assertEqual(setting.get_api_secret(), "secret-api")
        self.assertEqual(setting.get_smtp_password(), "secret-password")

        seed_response = self.client.post("/api/v1/message-templates/seed-defaults/", {"campus": self.campus.id}, format="json")
        self.assertEqual(seed_response.status_code, status.HTTP_200_OK, seed_response.data)
        template = MessageTemplate.objects.get(campus=self.campus, trigger="fee_reminder", channel="email")
        render_response = self.client.post(
            f"/api/v1/message-templates/{template.id}/render/",
            {"variables": {"studentName": self.student.full_name, "schoolName": self.campus.name, "feeAmount": "100", "dueDate": "2026-06-30", "paymentLink": "https://pay.example.org"}},
            format="json",
        )
        send_response = self.client.post(
            "/api/v1/outbound-messages/send-template/",
            {
                "template": template.id,
                "student": self.student.id,
                "recipient": "parent@example.com",
                "variables": {"feeAmount": "100", "dueDate": "2026-06-30", "paymentLink": "https://pay.example.org"},
            },
            format="json",
        )
        self.assertEqual(render_response.status_code, status.HTTP_200_OK)
        self.assertIn(self.student.full_name, render_response.data["body"])
        self.assertEqual(send_response.status_code, status.HTTP_201_CREATED, send_response.data)
        self.assertTrue(OutboundMessage.objects.filter(campus=self.campus, student=self.student, recipient="parent@example.com").exists())

        self.authenticate(self.admin)
        device = AttendanceDevice.objects.create(
            campus=self.campus,
            name="Phase6 QR Terminal",
            device_code="P6-QR-1",
            device_type="card_scan",
        )
        sync_response = self.client.post(
            f"/api/v1/attendance-devices/{device.id}/sync-logs/",
            {"status": "failed", "log_type": "rfid", "payload": {"raw": "ERR"}, "error_message": "Timeout"},
            format="json",
        )
        errors_response = self.client.get(f"/api/v1/attendance-devices/{device.id}/error-logs/")
        retry_response = self.client.post(f"/api/v1/attendance-devices/{device.id}/retry-failed-sync/", {}, format="json")
        status_response = self.client.get(f"/api/v1/attendance-devices/{device.id}/status-check/")

        self.assertEqual(sync_response.status_code, status.HTTP_201_CREATED, sync_response.data)
        self.assertEqual(errors_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(errors_response.data), 1)
        self.assertEqual(retry_response.status_code, status.HTTP_201_CREATED, retry_response.data)
        self.assertEqual(retry_response.data["status"], "retrying")
        self.assertEqual(status_response.status_code, status.HTTP_200_OK)
        self.assertTrue(DeviceSyncLog.objects.filter(device=device, status="retrying").exists())
        self.assertTrue(AcademicEvent.objects.filter(campus=self.campus, event_type="deviceSynced").exists())

    def test_phase7_pagination_protected_endpoints_and_image_optimization(self):
        self.client.force_authenticate(user=None)
        protected_endpoints = [
            "/api/v1/realtime/events/",
            "/api/v1/ai-tools/",
            "/api/v1/communication-settings/",
            "/api/v1/device-sync-logs/",
            "/api/v1/payment-gateways/",
        ]
        for endpoint in protected_endpoints:
            response = self.client.get(endpoint)
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED, endpoint)

        self.authenticate(self.admin)
        for index in range(2, 5):
            Student.objects.create(
                campus=self.campus,
                section=self.section,
                admission_number=f"P7-STU-{index}",
                first_name=f"Phase{index}",
                last_name="Learner",
                date_of_birth=date(2015, 1, index),
            )

        unpaged_response = self.client.get("/api/v1/students/")
        paged_response = self.client.get("/api/v1/students/?page_size=1")
        self.assertIsInstance(unpaged_response.data, list)
        self.assertEqual(paged_response.status_code, status.HTTP_200_OK, paged_response.data)
        self.assertIn("results", paged_response.data)
        self.assertEqual(len(paged_response.data["results"]), 1)
        self.assertGreaterEqual(paged_response.data["count"], 4)

        image_buffer = BytesIO()
        Image.new("RGB", (1200, 1200), color=(220, 20, 60)).save(image_buffer, format="JPEG", quality=95)
        upload = SimpleUploadedFile("student-photo.jpg", image_buffer.getvalue(), content_type="image/jpeg")
        upload_response = self.client.post(f"/api/v1/students/{self.student.id}/upload-photo/", {"file": upload}, format="multipart")
        self.assertEqual(upload_response.status_code, status.HTTP_200_OK, upload_response.data)
        self.student.refresh_from_db()
        self.assertTrue(self.student.photo_url.startswith("data:image/jpeg;base64,"))
        optimized = base64.b64decode(self.student.photo_url.split(";base64,", 1)[1])
        optimized_image = Image.open(BytesIO(optimized))
        self.assertLessEqual(max(optimized_image.size), 800)

    def test_phase8_demo_school_seed_command_is_marked_and_removable(self):
        seed_output = StringIO()
        call_command("seed_demo_school", code="T8DEMO", password="Demo@12345", stdout=seed_output)

        campus = Campus.objects.get(code="T8DEMO")
        demo_usernames = [
            "demo.schooladmin",
            "demo.account",
            "demo.teacher.math",
            "demo.teacher.science",
            "demo.student.aarav",
            "demo.student.mira",
            "demo.student.kabir",
        ]

        self.assertIn("Demo school ready", seed_output.getvalue())
        self.assertTrue(campus.enabled_modules["demoData"])
        self.assertTrue(PlatformSetting.objects.filter(campus=campus, key="demo_data_marker").exists())
        self.assertEqual(User.objects.filter(username__in=demo_usernames, school=campus).count(), 7)
        self.assertEqual(Student.objects.filter(campus=campus).count(), 3)
        self.assertEqual(ClassSection.objects.filter(campus=campus).count(), 2)
        self.assertEqual(Subject.objects.filter(campus=campus).count(), 3)
        self.assertEqual(FeeStructure.objects.filter(campus=campus).count(), 1)
        self.assertEqual(FeeAssignment.objects.filter(student__campus=campus).count(), 2)
        self.assertEqual(AttendanceRecord.objects.filter(student__campus=campus).count(), 3)
        self.assertEqual(LearningResource.objects.filter(section__campus=campus).count(), 1)
        self.assertEqual(AssignedWork.objects.filter(section__campus=campus).count(), 1)
        self.assertEqual(ResultRecord.objects.filter(student__campus=campus).count(), 3)
        self.assertEqual(Announcement.objects.filter(campus=campus).count(), 1)
        self.assertEqual(PaymentGatewayConfig.objects.filter(campus=campus).count(), 1)
        self.assertEqual(CommunicationSetting.objects.filter(campus=campus).count(), 3)

        remove_output = StringIO()
        call_command("seed_demo_school", code="T8DEMO", remove=True, stdout=remove_output)

        self.assertIn("Removed demo school", remove_output.getvalue())
        self.assertFalse(Campus.objects.filter(code="T8DEMO").exists())
        self.assertEqual(User.objects.filter(username__in=demo_usernames).count(), 0)

    def test_admin_can_manage_operations_and_student_can_read_own_services(self):
        self.authenticate(self.admin)

        staff_response = self.client.post(
            "/api/v1/staff-profiles/",
            {
                "campus": self.campus.id,
                "user": self.teacher.id,
                "employee_code": "EMP-001",
                "designation": "Class Teacher",
                "department": "Academics",
                "employment_type": "full_time",
                "joining_date": "2026-04-01",
                "qualification": "B.Ed",
                "emergency_contact": "9876500101",
                "status": "active",
            },
            format="json",
        )
        slot_response = self.client.post(
            "/api/v1/timetable-slots/",
            {
                "campus": self.campus.id,
                "section": self.section.id,
                "teacher": self.teacher.id,
                "subject": "Mathematics",
                "day_of_week": 1,
                "start_time": "09:00",
                "end_time": "09:40",
                "room": "A-101",
                "effective_from": "2026-04-01",
                "effective_to": None,
            },
            format="json",
        )
        book_response = self.client.post(
            "/api/v1/library-books/",
            {
                "campus": self.campus.id,
                "accession_number": "LIB-001",
                "title": "Mathematics Skill Builder",
                "author": "R. Menon",
                "isbn": "",
                "category": "Academics",
                "total_copies": 4,
                "available_copies": 3,
                "shelf_location": "A1",
                "status": "active",
            },
            format="json",
        )
        loan_response = self.client.post(
            "/api/v1/library-loans/",
            {
                "campus": self.campus.id,
                "book": book_response.data["id"],
                "student": self.student.id,
                "staff_user": None,
                "issued_on": "2026-05-01",
                "due_on": "2026-05-15",
                "returned_on": None,
                "fine_amount": "0.00",
                "status": "issued",
            },
            format="json",
        )
        route_response = self.client.post(
            "/api/v1/transport-routes/",
            {
                "campus": self.campus.id,
                "name": "Main East Route",
                "route_code": "TR-EAST",
                "start_point": "Indiranagar",
                "end_point": "Campus Gate",
                "stops": ["Indiranagar", "Domlur"],
                "is_active": True,
            },
            format="json",
        )
        vehicle_response = self.client.post(
            "/api/v1/transport-vehicles/",
            {
                "campus": self.campus.id,
                "route": route_response.data["id"],
                "vehicle_number": "KA-01-MQ-3601",
                "driver_name": "Ramesh Kumar",
                "driver_phone": "9876500601",
                "capacity": 36,
                "gps_device_id": "GPS-MAIN-01",
                "is_active": True,
            },
            format="json",
        )
        transport_response = self.client.post(
            "/api/v1/student-transport-assignments/",
            {
                "student": self.student.id,
                "route": route_response.data["id"],
                "vehicle": vehicle_response.data["id"],
                "pickup_stop": "Indiranagar",
                "drop_stop": "Campus Gate",
                "start_date": "2026-04-01",
                "end_date": None,
                "fee_amount": "6000.00",
                "is_active": True,
            },
            format="json",
        )
        room_response = self.client.post(
            "/api/v1/hostel-rooms/",
            {
                "campus": self.campus.id,
                "hostel_name": "Main Hostel",
                "room_number": "A-101",
                "floor": "1",
                "capacity": 4,
                "is_active": True,
            },
            format="json",
        )
        hostel_response = self.client.post(
            "/api/v1/hostel-allocations/",
            {
                "student": self.student.id,
                "room": room_response.data["id"],
                "bed_number": "A-101-A",
                "start_date": "2026-04-01",
                "end_date": None,
                "fee_amount": "18000.00",
                "is_active": True,
            },
            format="json",
        )

        for response in (
            staff_response,
            slot_response,
            book_response,
            loan_response,
            route_response,
            vehicle_response,
            transport_response,
            room_response,
            hostel_response,
        ):
            self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        self.authenticate(self.student_user)
        student_slots = self.client.get("/api/v1/timetable-slots/")
        student_loans = self.client.get("/api/v1/library-loans/")
        student_transport = self.client.get("/api/v1/student-transport-assignments/")
        student_hostel = self.client.get("/api/v1/hostel-allocations/")
        student_staff = self.client.get("/api/v1/staff-profiles/")

        self.assertEqual(student_slots.status_code, status.HTTP_200_OK)
        self.assertEqual(student_loans.status_code, status.HTTP_200_OK)
        self.assertEqual(student_transport.status_code, status.HTTP_200_OK)
        self.assertEqual(student_hostel.status_code, status.HTTP_200_OK)
        self.assertEqual(len(student_slots.data), 1)
        self.assertEqual(len(student_loans.data), 1)
        self.assertEqual(len(student_transport.data), 1)
        self.assertEqual(len(student_hostel.data), 1)
        self.assertEqual(student_staff.status_code, status.HTTP_403_FORBIDDEN)

    def test_phase4_fee_structure_offline_payment_receipt_and_school_scope(self):
        account_user = User.objects.create_user(
            username="main-account",
            password="Passw0rd!123",
            role=UserRole.ACCOUNT,
            school=self.campus,
        )
        CampusMembership.objects.create(campus=self.campus, user=account_user, role="finance_admin", is_primary=True)
        other_account = User.objects.create_user(
            username="north-account",
            password="Passw0rd!123",
            role=UserRole.ACCOUNT,
            school=self.other_campus,
        )
        CampusMembership.objects.create(campus=self.other_campus, user=other_account, role="finance_admin", is_primary=True)

        self.authenticate(account_user)
        structure_response = self.client.post(
            "/api/v1/fee-structures/",
            {
                "campus": self.campus.id,
                "section": self.section.id,
                "title": "Monthly Tuition",
                "amount": "5000.00",
                "late_fee": "100.00",
                "discount_amount": "250.00",
                "due_day": 10,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(structure_response.status_code, status.HTTP_201_CREATED, structure_response.data)

        assign_response = self.client.post(
            f"/api/v1/fee-structures/{structure_response.data['id']}/assign/",
            {"due_date": "2026-06-10"},
            format="json",
        )
        self.assertEqual(assign_response.status_code, status.HTTP_200_OK, assign_response.data)
        self.assertGreaterEqual(assign_response.data["created"], 1)
        fee = FeeAssignment.objects.get(fee_structure_id=structure_response.data["id"], student=self.student)

        invoice_response = self.client.post(f"/api/v1/fee-assignments/{fee.id}/generate-invoice/", {}, format="json")
        self.assertEqual(invoice_response.status_code, status.HTTP_200_OK, invoice_response.data)
        self.assertTrue(invoice_response.data["invoice_number"].startswith("MAIN-INV-"))

        payment_response = self.client.post(
            "/api/v1/payments/",
            {
                "fee_assignment": fee.id,
                "amount_paid": "1000.00",
                "paid_on": "2026-06-05",
                "payment_method": "cash",
                "reference_number": "CASH-001",
            },
            format="json",
        )
        self.assertEqual(payment_response.status_code, status.HTTP_201_CREATED, payment_response.data)
        self.assertTrue(payment_response.data["receipt_number"].startswith("MAIN-REC-"))
        self.assertEqual(payment_response.data["campus"], self.campus.id)

        receipt_response = self.client.get(f"/api/v1/payments/{payment_response.data['id']}/receipt-pdf/")
        report_response = self.client.get("/api/v1/finance/reports/fee-collection/?file_format=pdf")
        self.assertEqual(receipt_response.status_code, status.HTTP_200_OK)
        self.assertEqual(receipt_response["Content-Type"], "application/pdf")
        self.assertEqual(report_response.status_code, status.HTTP_200_OK)
        self.assertEqual(report_response["Content-Type"], "application/pdf")
        self.assertTrue(FinanceEvent.objects.filter(campus=self.campus, event_type="offlinePaymentAdded").exists())

        self.authenticate(other_account)
        blocked_list = self.client.get("/api/v1/fee-assignments/")
        blocked_payment = self.client.get(f"/api/v1/payments/{payment_response.data['id']}/")
        self.assertEqual(blocked_list.status_code, status.HTTP_200_OK)
        self.assertNotIn(fee.id, [item["id"] for item in blocked_list.data])
        self.assertEqual(blocked_payment.status_code, status.HTTP_404_NOT_FOUND)

    def test_phase4_online_payment_uses_school_gateway_and_blocks_wrong_school(self):
        self.authenticate(self.admin)
        gateway_response = self.client.post(
            "/api/v1/payment-gateways/",
            {
                "campus": self.campus.id,
                "provider": "razorpay",
                "key_id": "rzp_main_key",
                "key_secret": "main-secret",
                "webhook_secret": "main-webhook",
                "upi_id": "main@upi",
                "allowed_methods": ["upi", "card", "net_banking", "wallet"],
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(gateway_response.status_code, status.HTTP_201_CREATED, gateway_response.data)
        self.assertNotIn("key_secret", gateway_response.data)
        gateway = PaymentGatewayConfig.objects.get(pk=gateway_response.data["id"])
        self.assertEqual(gateway.get_key_secret(), "main-secret")

        fee = self.student.fee_assignments.first()
        self.authenticate(self.student_user)
        order_response = self.client.post(
            "/api/v1/payment-transactions/create-order/",
            {"fee_assignment": fee.id, "amount": "12000.00", "provider": "razorpay", "method": "upi"},
            format="json",
        )
        self.assertEqual(order_response.status_code, status.HTTP_201_CREATED, order_response.data)
        self.assertEqual(order_response.data["campus"], self.campus.id)
        self.assertNotIn("key_secret", order_response.data.get("gateway", {}))

        payment_id = "pay_main_001"
        signature = hmac.new(
            b"main-secret",
            f"{order_response.data['gateway_order_id']}|{payment_id}".encode(),
            hashlib.sha256,
        ).hexdigest()
        verify_response = self.client.post(
            f"/api/v1/payment-transactions/{order_response.data['id']}/verify-payment/",
            {"gateway_payment_id": payment_id, "gateway_signature": signature},
            format="json",
        )
        self.assertEqual(verify_response.status_code, status.HTTP_200_OK, verify_response.data)
        self.assertEqual(verify_response.data["status"], "success")
        self.assertTrue(verify_response.data["webhook_verified"])
        self.assertTrue(Payment.objects.filter(fee_assignment=fee, transaction_id=payment_id, campus=self.campus).exists())

        other_student_user = User.objects.create_user(username="north-student", password="Passw0rd!123", role=UserRole.STUDENT, school=self.other_campus)
        other_student = Student.objects.create(
            campus=self.other_campus,
            section=self.other_section,
            user=other_student_user,
            admission_number="NORTH-STU-1",
            first_name="Nora",
            last_name="Rao",
            date_of_birth=date(2015, 1, 1),
        )
        other_fee = FeeAssignment.objects.create(student=other_student, title="North Fee", amount=Decimal("1000.00"), due_date=date(2026, 6, 10))
        blocked_order = self.client.post(
            "/api/v1/payment-transactions/create-order/",
            {"fee_assignment": other_fee.id, "amount": "1000.00", "provider": "razorpay", "method": "upi"},
            format="json",
        )
        self.assertEqual(blocked_order.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=None)
        webhook_response = self.client.post(
            "/api/v1/payment-transactions/webhook/",
            {
                "schoolId": self.other_campus.id,
                "gateway_order_id": order_response.data["gateway_order_id"],
                "gateway_payment_id": "pay_bad_school",
                "signature": signature,
                "amount": "12000.00",
            },
            format="json",
        )
        self.assertEqual(webhook_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_phase4_salary_calculation_slip_reports_and_events(self):
        account_user = User.objects.create_user(
            username="salary-account",
            password="Passw0rd!123",
            role=UserRole.ACCOUNT,
            school=self.campus,
        )
        CampusMembership.objects.create(campus=self.campus, user=account_user, role="finance_admin", is_primary=True)

        StaffAttendanceRecord.objects.create(campus=self.campus, staff_user=self.teacher, date=date(2026, 6, 1), status=StaffAttendanceStatus.PRESENT)
        StaffAttendanceRecord.objects.create(campus=self.campus, staff_user=self.teacher, date=date(2026, 6, 2), status=StaffAttendanceStatus.ABSENT)
        StaffAttendanceRecord.objects.create(campus=self.campus, staff_user=self.teacher, date=date(2026, 6, 3), status=StaffAttendanceStatus.HALF_DAY)

        self.authenticate(account_user)
        setup_response = self.client.post(
            "/api/v1/salary-setups/",
            {
                "campus": self.campus.id,
                "staff_user": self.teacher.id,
                "gross_salary": "30000.00",
                "default_deductions": "0.00",
                "default_bonus": "500.00",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(setup_response.status_code, status.HTTP_201_CREATED, setup_response.data)

        calculate_response = self.client.post(
            "/api/v1/salary-records/calculate/",
            {"salary_setup": setup_response.data["id"], "month": 6, "year": 2026},
            format="json",
        )
        self.assertEqual(calculate_response.status_code, status.HTTP_200_OK, calculate_response.data)
        self.assertEqual(calculate_response.data["present_days"], "1.00")
        self.assertEqual(calculate_response.data["absent_days"], "1.00")
        self.assertEqual(calculate_response.data["half_days"], "1.00")
        salary_id = calculate_response.data["id"]

        mark_paid_response = self.client.post(
            f"/api/v1/salary-records/{salary_id}/mark-paid/",
            {"paid_on": "2026-06-30", "payment_reference": "SAL-TXN-001"},
            format="json",
        )
        self.assertEqual(mark_paid_response.status_code, status.HTTP_200_OK, mark_paid_response.data)
        self.assertEqual(mark_paid_response.data["payment_status"], "paid")
        self.assertTrue(mark_paid_response.data["slip_number"].startswith("MAIN-SAL-"))

        slip_response = self.client.get(f"/api/v1/salary-records/{salary_id}/salary-slip-pdf/")
        report_response = self.client.get("/api/v1/finance/reports/salary-report/?file_format=excel")
        summary_response = self.client.get(reverse("dashboard-summary"))
        self.assertEqual(slip_response.status_code, status.HTTP_200_OK)
        self.assertEqual(slip_response["Content-Type"], "application/pdf")
        self.assertEqual(report_response.status_code, status.HTTP_200_OK)
        self.assertEqual(report_response["Content-Type"], "application/vnd.ms-excel")
        self.assertEqual(summary_response.status_code, status.HTTP_200_OK)
        self.assertIn("finance", summary_response.data)
        self.assertTrue(FinanceEvent.objects.filter(campus=self.campus, event_type="salaryPaid").exists())
        self.assertTrue(SalaryRecord.objects.filter(pk=salary_id, paid_by=account_user).exists())

    def test_phase9_enterprise_saas_billing_compliance_monitoring_and_limits(self):
        self.authenticate(self.super_admin)

        seed_response = self.client.post("/api/v1/saas-plans/seed-defaults/", {}, format="json")
        self.assertEqual(seed_response.status_code, status.HTTP_200_OK, seed_response.data)
        self.assertGreaterEqual(len(seed_response.data), 4)

        basic = SaaSPlan.objects.get(code="basic")
        premium = SaaSPlan.objects.get(code="premium")
        today = timezone.localdate()
        subscription_response = self.client.post(
            "/api/v1/school-subscriptions/",
            {
                "campus": self.campus.id,
                "plan": premium.id,
                "status": "active",
                "billing_cycle": "monthly",
                "start_date": today.isoformat(),
                "end_date": (today + timedelta(days=30)).isoformat(),
                "grace_period_days": 7,
                "custom_price": "25000.00",
                "currency": "INR",
                "gst_number": "29ABCDE1234F1Z5",
                "auto_disable_on_expiry": True,
            },
            format="json",
        )
        self.assertEqual(subscription_response.status_code, status.HTTP_201_CREATED, subscription_response.data)
        self.campus.refresh_from_db()
        self.assertEqual(self.campus.subscription_plan, "Premium")
        self.assertEqual(self.campus.monthly_subscription_amount, Decimal("25000.00"))
        subscription_id = subscription_response.data["id"]

        invoice_response = self.client.post(f"/api/v1/school-subscriptions/{subscription_id}/generate-invoice/", {}, format="json")
        self.assertEqual(invoice_response.status_code, status.HTTP_201_CREATED, invoice_response.data)
        self.assertTrue(invoice_response.data["invoice_number"].startswith("MAIN-SUB-INV-"))
        self.assertEqual(invoice_response.data["total_amount"], "29500.00")

        payment_response = self.client.post(
            "/api/v1/subscription-payments/",
            {
                "invoice": invoice_response.data["id"],
                "campus": self.campus.id,
                "amount": invoice_response.data["total_amount"],
                "payment_mode": "online",
                "provider": "razorpay",
                "transaction_id": "SUB-TXN-001",
                "payment_status": "success",
                "paid_at": timezone.now().isoformat(),
                "raw_payload": {"source": "phase9-test"},
            },
            format="json",
        )
        self.assertEqual(payment_response.status_code, status.HTTP_201_CREATED, payment_response.data)
        self.assertEqual(SubscriptionInvoice.objects.get(pk=invoice_response.data["id"]).status, "paid")
        self.assertTrue(SubscriptionPayment.objects.filter(transaction_id="SUB-TXN-001", campus=self.campus).exists())

        invoice_pdf = self.client.get(f"/api/v1/subscription-invoices/{invoice_response.data['id']}/pdf/")
        self.assertEqual(invoice_pdf.status_code, status.HTTP_200_OK)
        self.assertEqual(invoice_pdf["Content-Type"], "application/pdf")

        white_label_response = self.client.post(
            "/api/v1/white-label-configs/",
            {
                "campus": self.campus.id,
                "is_enabled": True,
                "custom_domain": "main.school.example",
                "primary_color": "#2857d8",
                "secondary_color": "#111827",
                "accent_color": "#ff7a00",
                "login_heading": "Main Campus Portal",
            },
            format="json",
        )
        self.assertEqual(white_label_response.status_code, status.HTTP_201_CREATED, white_label_response.data)
        self.assertTrue(WhiteLabelConfig.objects.get(campus=self.campus).is_enabled)

        basic_subscription = SchoolSubscription.objects.create(
            campus=self.other_campus,
            plan=basic,
            status="active",
            billing_cycle="monthly",
            start_date=today,
            end_date=today + timedelta(days=30),
            created_by=self.super_admin,
        )
        basic_subscription.sync_campus_fields()
        denied_white_label = self.client.post(
            "/api/v1/white-label-configs/",
            {"campus": self.other_campus.id, "is_enabled": True, "custom_domain": "north.school.example"},
            format="json",
        )
        self.assertEqual(denied_white_label.status_code, status.HTTP_400_BAD_REQUEST)

        health_response = self.client.post(
            "/api/v1/system-health-snapshots/",
            {
                "campus": None,
                "component": "database",
                "status": "ok",
                "latency_ms": 12,
                "metric_value": "1.00",
                "message": "Database reachable",
                "metadata": {"connection": "default"},
            },
            format="json",
        )
        self.assertEqual(health_response.status_code, status.HTTP_201_CREATED, health_response.data)
        self.assertTrue(SystemHealthSnapshot.objects.filter(component="database", status="ok").exists())

        backup_policy_response = self.client.post(
            "/api/v1/backup-policies/",
            {
                "campus": self.campus.id,
                "backup_type": "school_data",
                "frequency": "daily",
                "retention_days": 30,
                "destination": "s3://mentriq360-backups/main",
                "encryption_required": True,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(backup_policy_response.status_code, status.HTTP_201_CREATED, backup_policy_response.data)
        backup_job_response = self.client.post(
            "/api/v1/backup-jobs/",
            {
                "policy": backup_policy_response.data["id"],
                "campus": self.campus.id,
                "backup_type": "school_data",
                "status": "queued",
                "storage_location": "",
                "size_bytes": 0,
                "checksum": "",
                "metadata": {"manual": True},
            },
            format="json",
        )
        self.assertEqual(backup_job_response.status_code, status.HTTP_201_CREATED, backup_job_response.data)
        restore_response = self.client.post(f"/api/v1/backup-jobs/{backup_job_response.data['id']}/mark-restored/", {"note": "Restore tested."}, format="json")
        self.assertEqual(restore_response.status_code, status.HTTP_200_OK, restore_response.data)
        self.assertIn("restoreTestedAt", BackupJob.objects.get(pk=backup_job_response.data["id"]).metadata)

        queue_response = self.client.post(
            "/api/v1/queue-jobs/",
            {"campus": self.campus.id, "job_type": "attendance_import", "status": "queued", "priority": 1, "payload": {"rows": 1000}},
            format="json",
        )
        self.assertEqual(queue_response.status_code, status.HTTP_201_CREATED, queue_response.data)
        run_queue_response = self.client.post("/api/v1/queue-jobs/run-next/", {}, format="json")
        self.assertEqual(run_queue_response.status_code, status.HTTP_200_OK, run_queue_response.data)
        self.assertEqual(QueueJob.objects.get(pk=queue_response.data["id"]).status, "success")

        token_response = self.client.post(
            "/api/v1/secure-api-tokens/",
            {"campus": self.campus.id, "name": "Main analytics token", "scopes": ["analytics.read"], "is_active": True},
            format="json",
        )
        self.assertEqual(token_response.status_code, status.HTTP_201_CREATED, token_response.data)
        self.assertIn("rawToken", token_response.data)
        self.assertTrue(SecureAPIToken.objects.get(pk=token_response.data["id"]).verify(token_response.data["rawToken"]))

        document = Document.objects.create(
            campus=self.campus,
            student=self.student,
            uploaded_by=self.admin,
            created_by=self.admin,
            title="Admission Proof",
            document_type="identity",
            file_url="data:application/pdf;base64,JVBERi0xLjQK",
        )
        document_download = self.client.get(f"/api/v1/documents/{document.id}/download/")
        self.assertEqual(document_download.status_code, status.HTTP_200_OK)
        self.assertTrue(DocumentAccessLog.objects.filter(document=document, user=self.super_admin, granted=True).exists())

        analytics_response = self.client.get("/api/v1/enterprise/analytics/")
        school_analytics_response = self.client.get(f"/api/v1/enterprise/school-analytics/?campus={self.campus.id}")
        monitoring_response = self.client.get("/api/v1/enterprise/monitoring/")
        self.assertEqual(analytics_response.status_code, status.HTTP_200_OK, analytics_response.data)
        self.assertIn("mrr", analytics_response.data)
        self.assertEqual(school_analytics_response.status_code, status.HTTP_200_OK, school_analytics_response.data)
        self.assertEqual(school_analytics_response.data["subscription"]["plan"]["code"], "premium")
        self.assertEqual(monitoring_response.status_code, status.HTTP_200_OK, monitoring_response.data)
        self.assertIn("health", monitoring_response.data)
        self.assertTrue(UserActivityLog.objects.filter(activity_type__startswith="subscription").exists())

        basic.student_limit = 1
        basic.save(update_fields=["student_limit", "updated_at"])
        limited_subscription = SchoolSubscription.objects.create(
            campus=self.campus,
            plan=basic,
            status="active",
            billing_cycle="monthly",
            start_date=today,
            end_date=today + timedelta(days=60),
            created_by=self.super_admin,
        )
        limited_subscription.sync_campus_fields()

        self.authenticate(self.admin)
        own_subscriptions = self.client.get("/api/v1/school-subscriptions/")
        self.assertEqual(own_subscriptions.status_code, status.HTTP_200_OK)
        self.assertTrue(own_subscriptions.data)
        self.assertEqual({item["campus"] for item in own_subscriptions.data}, {self.campus.id})
        limit_response = self.client.post(
            "/api/v1/students/",
            {
                "campus": self.campus.id,
                "section": self.section.id,
                "first_name": "Limit",
                "last_name": "Blocked",
                "date_of_birth": "2015-05-10",
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(limit_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_phase10_commercial_ecosystem_modules_are_scoped_and_actionable(self):
        self.teacher.school = self.campus
        self.teacher.save(update_fields=["school", "updated_at"])
        self.student_user.school = self.campus
        self.student_user.save(update_fields=["school", "updated_at"])
        today = timezone.localdate()

        self.authenticate(self.admin)
        form_response = self.client.post(
            "/api/v1/admission-form-templates/",
            {
                "campus": self.campus.id,
                "name": "Demo Admission 2026",
                "academic_year": "2026-27",
                "form_schema": [{"name": "previousSchool", "type": "text", "required": False}],
                "admission_fee": "500.00",
                "is_public": True,
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(form_response.status_code, status.HTTP_201_CREATED, form_response.data)

        self.client.force_authenticate(user=None)
        public_forms = self.client.get(f"/api/v1/public/admissions/{self.campus.code}/")
        self.assertEqual(public_forms.status_code, status.HTTP_200_OK, public_forms.data)
        self.assertEqual(public_forms.data["forms"][0]["id"], form_response.data["id"])

        admission_document = SimpleUploadedFile("birth-certificate.pdf", b"%PDF-1.4\nphase10", content_type="application/pdf")
        public_application = self.client.post(
            f"/api/v1/public/admissions/{self.campus.code}/",
            {
                "form_template": str(form_response.data["id"]),
                "target_section": str(self.section.id),
                "applicant_first_name": "Ishan",
                "applicant_last_name": "Mehra",
                "date_of_birth": "2016-02-14",
                "guardian_name": "Riya Mehra",
                "contact_email": "riya.parent@example.com",
                "contact_phone": "9999990001",
                "form_data": '{"previousSchool":"Demo Primary"}',
                "documents": admission_document,
            },
            format="multipart",
        )
        self.assertEqual(public_application.status_code, status.HTTP_201_CREATED, public_application.data)
        self.assertEqual(public_application.data["campus"], self.campus.id)
        self.assertEqual(public_application.data["payment_status"], "pending")
        tracking_code = public_application.data["tracking_code"]

        tracking_response = self.client.get(f"/api/v1/public/admissions/track/{tracking_code}/")
        self.assertEqual(tracking_response.status_code, status.HTTP_200_OK, tracking_response.data)
        self.assertEqual(tracking_response.data["application_number"], public_application.data["application_number"])

        self.authenticate(self.admin)
        transition_response = self.client.post(
            f"/api/v1/admission-applications/{public_application.data['id']}/transition/",
            {"status": "interview_scheduled", "interview_at": "2026-06-20T10:00:00Z", "decision_note": "Shortlisted for interaction."},
            format="json",
        )
        self.assertEqual(transition_response.status_code, status.HTTP_200_OK, transition_response.data)
        payment_response = self.client.post(
            f"/api/v1/admission-applications/{public_application.data['id']}/mark-payment/",
            {"payment_status": "success", "payment_reference": "ADM-FEE-001"},
            format="json",
        )
        self.assertEqual(payment_response.status_code, status.HTTP_200_OK, payment_response.data)
        admit_response = self.client.post(f"/api/v1/admission-applications/{public_application.data['id']}/admit/", {}, format="json")
        self.assertEqual(admit_response.status_code, status.HTTP_200_OK, admit_response.data)
        self.assertEqual(admit_response.data["status"], "admitted")
        self.assertTrue(Student.objects.filter(campus=self.campus, first_name="Ishan").exists())

        dashboard_response = self.client.get("/api/v1/admission-applications/dashboard/")
        self.assertEqual(dashboard_response.status_code, status.HTTP_200_OK, dashboard_response.data)
        self.assertEqual(dashboard_response.data["totalApplications"], 1)
        self.assertEqual(dashboard_response.data["admissionRevenue"], "500")

        admission_file_response = self.client.get(f"/api/v1/admission-documents/{AdmissionApplication.objects.get(pk=public_application.data['id']).documents.first().id}/download/")
        self.assertEqual(admission_file_response.status_code, status.HTTP_200_OK)
        self.assertTrue(DocumentAccessLog.objects.filter(access_type="admission_document_download", granted=True).exists())

        route_response = self.client.post(
            "/api/v1/transport-routes/",
            {
                "campus": self.campus.id,
                "name": "Central Route",
                "route_code": "MAIN-R1",
                "start_point": "City Center",
                "end_point": "School Gate",
                "stops": [{"name": "Museum Stop", "time": "07:35"}],
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(route_response.status_code, status.HTTP_201_CREATED, route_response.data)
        vehicle_response = self.client.post(
            "/api/v1/transport-vehicles/",
            {
                "campus": self.campus.id,
                "route": route_response.data["id"],
                "vehicle_number": "KA01M360",
                "driver_name": "Ramesh Driver",
                "driver_phone": "8888880001",
                "capacity": 40,
                "gps_device_id": "GPS-MAIN-001",
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(vehicle_response.status_code, status.HTTP_201_CREATED, vehicle_response.data)
        driver_response = self.client.post(
            "/api/v1/transport-drivers/",
            {"campus": self.campus.id, "full_name": "Ramesh Driver", "phone": "8888880001", "license_number": "DL-MAIN-001", "status": "active"},
            format="json",
        )
        self.assertEqual(driver_response.status_code, status.HTTP_201_CREATED, driver_response.data)
        attendance_response = self.client.post(
            "/api/v1/transport-vehicle-attendance/",
            {
                "campus": self.campus.id,
                "vehicle": vehicle_response.data["id"],
                "driver": driver_response.data["id"],
                "date": today.isoformat(),
                "status": "present",
                "odometer_reading": 12000,
            },
            format="json",
        )
        self.assertEqual(attendance_response.status_code, status.HTTP_201_CREATED, attendance_response.data)
        trip_response = self.client.post(
            "/api/v1/transport-trip-logs/",
            {
                "campus": self.campus.id,
                "route": route_response.data["id"],
                "vehicle": vehicle_response.data["id"],
                "driver": driver_response.data["id"],
                "trip_date": today.isoformat(),
                "trip_type": "pickup",
                "status": "completed",
                "scheduled_time": "07:30:00",
                "pickup_drop_report": [{"studentId": self.student.id, "stop": "Museum Stop", "status": "picked"}],
            },
            format="json",
        )
        self.assertEqual(trip_response.status_code, status.HTTP_201_CREATED, trip_response.data)

        book_response = self.client.post(
            "/api/v1/library-books/",
            {
                "campus": self.campus.id,
                "accession_number": "MAIN-LIB-001",
                "title": "Applied Science Reader",
                "author": "MentriQ360",
                "isbn": "9780000000010",
                "category": "Science",
                "total_copies": 3,
                "available_copies": 3,
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(book_response.status_code, status.HTTP_201_CREATED, book_response.data)
        digital_resource = self.client.post(
            "/api/v1/digital-library-resources/",
            {
                "campus": self.campus.id,
                "book": book_response.data["id"],
                "title": "Science Reader PDF",
                "resource_type": "ebook",
                "file_url": "data:application/pdf;base64,JVBERi0xLjQK",
                "file_name": "science-reader.pdf",
                "file_content_type": "application/pdf",
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(digital_resource.status_code, status.HTTP_201_CREATED, digital_resource.data)

        self.authenticate(self.student_user)
        student_resources = self.client.get("/api/v1/digital-library-resources/")
        self.assertEqual(student_resources.status_code, status.HTTP_200_OK, student_resources.data)
        self.assertEqual(student_resources.data[0]["id"], digital_resource.data["id"])
        resource_download = self.client.get(f"/api/v1/digital-library-resources/{digital_resource.data['id']}/download/")
        self.assertEqual(resource_download.status_code, status.HTTP_200_OK)
        book_request = self.client.post(
            "/api/v1/library-book-requests/",
            {"campus": self.campus.id, "book": book_response.data["id"], "student": self.student.id, "request_note": "Need for project work."},
            format="json",
        )
        self.assertEqual(book_request.status_code, status.HTTP_201_CREATED, book_request.data)
        mobile_bootstrap = self.client.get("/api/v1/mobile/bootstrap/")
        self.assertEqual(mobile_bootstrap.status_code, status.HTTP_200_OK, mobile_bootstrap.data)
        self.assertEqual(mobile_bootstrap.data["school"]["id"], self.campus.id)
        self.assertIn("quiz_generator", mobile_bootstrap.data["features"])

        student_ai = self.client.post("/api/v1/ai-tools/", {"feature": "quiz_generator", "prompt": "fractions"}, format="json")
        self.assertEqual(student_ai.status_code, status.HTTP_201_CREATED, student_ai.data)
        self.assertIn("Quiz:", student_ai.data["response"])

        self.authenticate(self.admin)
        decide_request = self.client.post(f"/api/v1/library-book-requests/{book_request.data['id']}/decide/", {"status": "approved", "decision_note": "Approved."}, format="json")
        self.assertEqual(decide_request.status_code, status.HTTP_200_OK, decide_request.data)

        asset_response = self.client.post(
            "/api/v1/inventory-assets/",
            {
                "campus": self.campus.id,
                "asset_code": "MAIN-SMART-001",
                "name": "Smart Board 1",
                "category": "smart_board",
                "serial_number": "SB-001",
                "location": "Grade 5 A",
                "purchase_date": today.isoformat(),
                "purchase_cost": "75000.00",
                "current_value": "70000.00",
                "depreciation_rate": "10.00",
                "status": "allocated",
            },
            format="json",
        )
        self.assertEqual(asset_response.status_code, status.HTTP_201_CREATED, asset_response.data)
        maintenance_response = self.client.post(
            "/api/v1/asset-maintenance-logs/",
            {
                "campus": self.campus.id,
                "asset": asset_response.data["id"],
                "issue": "Quarterly calibration",
                "service_provider": "MentriQ360 Support",
                "maintenance_date": today.isoformat(),
                "cost": "1500.00",
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(maintenance_response.status_code, status.HTTP_201_CREATED, maintenance_response.data)
        blocked_asset = self.client.post(
            "/api/v1/inventory-assets/",
            {"campus": self.other_campus.id, "asset_code": "NORTH-LEAK-001", "name": "Blocked Asset", "category": "computer"},
            format="json",
        )
        self.assertEqual(blocked_asset.status_code, status.HTTP_403_FORBIDDEN)

        website_response = self.client.post(
            "/api/v1/school-website-contents/",
            {
                "campus": self.campus.id,
                "content_type": "news",
                "title": "Admissions Open",
                "slug": "admissions-open",
                "body": "Admissions are open for the demo school.",
                "summary": "Admissions open",
                "is_published": True,
                "sort_order": 1,
            },
            format="json",
        )
        self.assertEqual(website_response.status_code, status.HTTP_201_CREATED, website_response.data)
        self.client.force_authenticate(user=None)
        public_website = self.client.get(f"/api/v1/public/schools/{self.campus.code}/website/?content_type=news")
        self.assertEqual(public_website.status_code, status.HTTP_200_OK, public_website.data)
        self.assertEqual(public_website.data["contents"][0]["slug"], "admissions-open")

        self.authenticate(self.student_user)
        push_device = self.client.post(
            "/api/v1/push-devices/",
            {"campus": self.campus.id, "user": self.student_user.id, "platform": "android", "device_id": "student-phone-1", "token": "firebase-token-demo"},
            format="json",
        )
        self.assertEqual(push_device.status_code, status.HTTP_201_CREATED, push_device.data)
        self.assertNotIn("token", push_device.data)

        self.authenticate(self.admin)
        push_log = self.client.post(
            "/api/v1/push-notifications/",
            {
                "campus": self.campus.id,
                "user": self.student_user.id,
                "student": self.student.id,
                "event_type": "assignment_reminder",
                "title": "Assignment due",
                "body": "Submit the science assignment.",
                "payload": {"assignmentId": 1},
                "status": "queued",
            },
            format="json",
        )
        self.assertEqual(push_log.status_code, status.HTTP_201_CREATED, push_log.data)
        mark_sent = self.client.post(f"/api/v1/push-notifications/{push_log.data['id']}/mark-sent/", {}, format="json")
        self.assertEqual(mark_sent.status_code, status.HTTP_200_OK, mark_sent.data)
        self.assertEqual(mark_sent.data["status"], "sent")

        self.authenticate(self.super_admin)
        plugin_response = self.client.post(
            "/api/v1/marketplace-plugins/",
            {
                "code": "razorpay-enterprise",
                "name": "Razorpay Enterprise",
                "plugin_type": "payment",
                "provider_name": "Razorpay",
                "description": "Production-ready school payment provider.",
                "config_schema": {"keyId": "string"},
                "is_enabled": True,
            },
            format="json",
        )
        self.assertEqual(plugin_response.status_code, status.HTTP_201_CREATED, plugin_response.data)
        super_ai = self.client.post("/api/v1/ai-tools/", {"feature": "total_schools", "prompt": ""}, format="json")
        self.assertEqual(super_ai.status_code, status.HTTP_201_CREATED, super_ai.data)
        self.assertIn("Total schools", super_ai.data["response"])

        self.authenticate(self.admin)
        school_plugin = self.client.post(
            "/api/v1/school-plugin-configs/",
            {"campus": self.campus.id, "plugin": plugin_response.data["id"], "is_enabled": True, "config": {"keyId": "rzp_live_demo"}},
            format="json",
        )
        self.assertEqual(school_plugin.status_code, status.HTTP_201_CREATED, school_plugin.data)

        gst_output = self.client.post(
            "/api/v1/accounting-ledger-entries/",
            {
                "campus": self.campus.id,
                "entry_type": "gst_output",
                "ledger_name": "Admission GST",
                "reference_type": "admission",
                "reference_id": public_application.data["application_number"],
                "amount": "500.00",
                "tax_rate": "18.00",
                "gst_amount": "90.00",
                "entry_date": today.isoformat(),
            },
            format="json",
        )
        self.assertEqual(gst_output.status_code, status.HTTP_201_CREATED, gst_output.data)
        gst_input = self.client.post(
            "/api/v1/accounting-ledger-entries/",
            {
                "campus": self.campus.id,
                "entry_type": "gst_input",
                "ledger_name": "Asset Maintenance GST",
                "reference_type": "asset_maintenance",
                "reference_id": maintenance_response.data["id"],
                "amount": "1500.00",
                "tax_rate": "18.00",
                "gst_amount": "270.00",
                "entry_date": today.isoformat(),
            },
            format="json",
        )
        self.assertEqual(gst_input.status_code, status.HTTP_201_CREATED, gst_input.data)
        gst_report = self.client.get("/api/v1/accounting-ledger-entries/gst-report/")
        self.assertEqual(gst_report.status_code, status.HTTP_200_OK, gst_report.data)
        self.assertEqual(gst_report.data["outputGst"], "90")
        self.assertEqual(gst_report.data["inputGst"], "270")

        report_definition = self.client.post(
            "/api/v1/report-definitions/",
            {
                "campus": self.campus.id,
                "name": "Student Register",
                "report_type": "student",
                "description": "Student export for audit.",
                "columns": ["admission_number", "student", "class", "status"],
                "filters": {},
                "sort": [],
                "is_public_to_school": True,
            },
            format="json",
        )
        self.assertEqual(report_definition.status_code, status.HTTP_201_CREATED, report_definition.data)
        report_run = self.client.get(f"/api/v1/report-definitions/{report_definition.data['id']}/run/")
        self.assertEqual(report_run.status_code, status.HTTP_200_OK, report_run.data)
        self.assertGreaterEqual(report_run.data["count"], 1)
        report_export = self.client.get(f"/api/v1/report-definitions/{report_definition.data['id']}/export/?file_format=csv")
        self.assertEqual(report_export.status_code, status.HTTP_200_OK)
        self.assertEqual(report_export["Content-Type"], "text/csv")

        policy_response = self.client.post(
            "/api/v1/security-policies/",
            {
                "campus": self.campus.id,
                "two_factor_required": True,
                "allowed_ip_ranges": ["10.0.0.0/24"],
                "blocked_ip_ranges": [],
                "max_active_sessions": 2,
                "force_password_change_days": 60,
                "suspicious_login_threshold": 3,
            },
            format="json",
        )
        self.assertEqual(policy_response.status_code, status.HTTP_201_CREATED, policy_response.data)
        login_session = DeviceLoginSession.objects.create(
            campus=self.campus,
            user=self.student_user,
            device_id="student-phone-1",
            ip_address="10.0.0.8",
            user_agent="MentriQ360 Mobile",
            is_active=True,
        )

        self.authenticate(self.super_admin)
        forced_logout = self.client.post(f"/api/v1/device-login-sessions/{login_session.id}/force-logout/", {}, format="json")
        self.assertEqual(forced_logout.status_code, status.HTTP_200_OK, forced_logout.data)
        self.assertTrue(SecurityEvent.objects.filter(campus=self.campus, user=self.student_user, event_type="force_logout").exists())
        security_event_id = SecurityEvent.objects.filter(campus=self.campus, user=self.student_user, event_type="force_logout").latest("created_at").id
        resolve_event = self.client.post(f"/api/v1/security-events/{security_event_id}/resolve/", {}, format="json")
        self.assertEqual(resolve_event.status_code, status.HTTP_200_OK, resolve_event.data)

        audit_run = self.client.post("/api/v1/production-audit-runs/run-now/", {"campus": self.campus.id}, format="json")
        self.assertEqual(audit_run.status_code, status.HTTP_201_CREATED, audit_run.data)
        self.assertEqual(audit_run.data["status"], "passed")
        audit_report = self.client.get(f"/api/v1/production-audit-runs/{audit_run.data['id']}/report/")
        self.assertEqual(audit_report.status_code, status.HTTP_200_OK)
        self.assertEqual(audit_report["Content-Type"], "application/pdf")

        ecosystem_response = self.client.get(f"/api/v1/enterprise/ecosystem/?campus={self.campus.id}")
        self.assertEqual(ecosystem_response.status_code, status.HTTP_200_OK, ecosystem_response.data)
        self.assertEqual(ecosystem_response.data["admissions"]["total"], 1)
        self.assertEqual(ecosystem_response.data["transport"]["drivers"], 1)
        self.assertEqual(ecosystem_response.data["library"]["digitalResources"], 1)
        self.assertEqual(ecosystem_response.data["inventory"]["assets"], 1)
        self.assertEqual(ecosystem_response.data["mobile"]["pushDevices"], 1)
        self.assertEqual(ecosystem_response.data["audit"]["latestStatus"], "passed")

        self.assertEqual(AdmissionFormTemplate.objects.filter(campus=self.campus).count(), 1)
        self.assertEqual(AdmissionApplication.objects.filter(campus=self.campus, status="admitted").count(), 1)
        self.assertEqual(TransportDriver.objects.filter(campus=self.campus).count(), 1)
        self.assertEqual(TransportVehicleAttendance.objects.filter(campus=self.campus).count(), 1)
        self.assertEqual(TransportTripLog.objects.filter(campus=self.campus).count(), 1)
        self.assertEqual(LibraryBook.objects.filter(campus=self.campus).count(), 1)
        self.assertEqual(DigitalLibraryResource.objects.filter(campus=self.campus).count(), 1)
        self.assertEqual(LibraryBookRequest.objects.filter(campus=self.campus, status="approved").count(), 1)
        self.assertEqual(InventoryAsset.objects.filter(campus=self.campus).count(), 1)
        self.assertEqual(AssetMaintenanceLog.objects.filter(campus=self.campus).count(), 1)
        self.assertEqual(SchoolWebsiteContent.objects.filter(campus=self.campus, is_published=True).count(), 1)
        self.assertEqual(PushNotificationDevice.objects.filter(campus=self.campus, is_active=True).count(), 1)
        self.assertEqual(PushNotificationLog.objects.filter(campus=self.campus, status="sent").count(), 1)
        self.assertEqual(MarketplacePlugin.objects.filter(code="razorpay-enterprise", is_enabled=True).count(), 1)
        self.assertEqual(SchoolPluginConfig.objects.filter(campus=self.campus, is_enabled=True).count(), 1)
        self.assertEqual(AccountingLedgerEntry.objects.filter(campus=self.campus).count(), 2)
        self.assertEqual(ReportDefinition.objects.filter(campus=self.campus).count(), 1)
        self.assertEqual(SecurityPolicy.objects.filter(campus=self.campus, two_factor_required=True).count(), 1)
        self.assertEqual(ProductionAuditRun.objects.filter(campus=self.campus, status="passed").count(), 1)

    def test_announcements_are_visible_by_audience(self):
        Announcement.objects.create(campus=self.campus, title="All notice", message="For everyone", audience="all", created_by=self.admin)
        Announcement.objects.create(campus=self.campus, title="Staff notice", message="For staff", audience="staff", created_by=self.admin)
        Announcement.objects.create(campus=self.campus, title="Learner notice", message="For learners", audience="learners", created_by=self.admin)
        Announcement.objects.create(campus=self.campus, title="Admin notice", message="For admins", audience="admins", created_by=self.admin)

        self.authenticate(self.teacher)
        teacher_response = self.client.get("/api/v1/announcements/")
        self.assertEqual(teacher_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {item["title"] for item in teacher_response.data},
            {"All notice", "Staff notice"},
        )

        self.authenticate(self.student_user)
        student_response = self.client.get("/api/v1/announcements/")
        self.assertEqual(student_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {item["title"] for item in student_response.data},
            {"All notice", "Learner notice"},
        )

        self.authenticate(self.admin)
        admin_response = self.client.get("/api/v1/announcements/")
        self.assertEqual(admin_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(admin_response.data), 4)

    def test_support_tickets_are_sent_to_super_admin_queue(self):
        self.authenticate(self.student_user)
        create_response = self.client.post(
            "/api/v1/support-tickets/",
            {
                "campus": self.campus.id,
                "subject": "Admit card download issue",
                "message": "The download button is not opening the admit card.",
                "category": "student_portal",
                "priority": "high",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        ticket_id = create_response.data["id"]

        self.authenticate(self.teacher)
        teacher_response = self.client.get("/api/v1/support-tickets/")
        self.assertEqual(teacher_response.status_code, status.HTTP_200_OK)
        self.assertEqual(teacher_response.data, [])

        self.authenticate(self.super_admin)
        queue_response = self.client.get("/api/v1/support-tickets/?status=open")
        self.assertEqual(queue_response.status_code, status.HTTP_200_OK)
        self.assertIn(ticket_id, [item["id"] for item in queue_response.data])

        resolve_response = self.client.patch(
            f"/api/v1/support-tickets/{ticket_id}/",
            {"status": "resolved", "response_note": "Shared with School Admin."},
            format="json",
        )
        self.assertEqual(resolve_response.status_code, status.HTTP_200_OK)
        ticket = SupportTicket.objects.get(pk=ticket_id)
        self.assertEqual(ticket.status, "resolved")
        self.assertEqual(ticket.reviewed_by, self.super_admin)

    # ── Edge case: Pagination boundary validation ──────────────────────────
    def test_pagination_rejects_negative_page_number(self):
        self.authenticate(self.admin)
        response = self.client.get("/api/v1/students/?page=-1")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pagination_rejects_zero_page_number(self):
        self.authenticate(self.admin)
        response = self.client.get("/api/v1/students/?page=0")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pagination_rejects_negative_page_size(self):
        self.authenticate(self.admin)
        response = self.client.get("/api/v1/students/?page_size=-5")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pagination_rejects_page_size_exceeding_max(self):
        self.authenticate(self.admin)
        response = self.client.get("/api/v1/students/?page_size=9999")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pagination_rejects_non_numeric_page(self):
        self.authenticate(self.admin)
        response = self.client.get("/api/v1/students/?page=abc")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pagination_rejects_non_numeric_page_size(self):
        self.authenticate(self.admin)
        response = self.client.get("/api/v1/students/?page_size=xyz")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pagination_works_with_valid_boundaries(self):
        self.authenticate(self.admin)
        for index in range(1, 6):
            Student.objects.create(
                campus=self.campus,
                section=self.section,
                admission_number=f"EDGE-STU-{index}",
                first_name=f"Edge{index}",
                last_name="Test",
                date_of_birth=date(2015, 1, index),
            )
        page1 = self.client.get("/api/v1/students/?page=1&page_size=2")
        self.assertEqual(page1.status_code, status.HTTP_200_OK)
        self.assertEqual(len(page1.data["results"]), 2)

        page2 = self.client.get("/api/v1/students/?page=2&page_size=2")
        self.assertEqual(page2.status_code, status.HTTP_200_OK)
        self.assertEqual(len(page2.data["results"]), 2)

    # ── Edge case: Attendance boundary conditions ─────────────────────────
    def test_attendance_exact_edit_window_boundary_is_editable(self):
        self.authenticate(self.teacher)
        boundary_date = timezone.localdate() - timedelta(days=3)
        response = self.client.post(
            "/api/v1/attendance-records/bulk-upsert/",
            {
                "section": self.section.id,
                "date": boundary_date.isoformat(),
                "records": [{"student": self.student.id, "status": "present"}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_attendance_future_date_is_rejected(self):
        self.authenticate(self.teacher)
        future_date = timezone.localdate() + timedelta(days=1)
        response = self.client.post(
            "/api/v1/attendance-records/bulk-upsert/",
            {
                "section": self.section.id,
                "date": future_date.isoformat(),
                "records": [{"student": self.student.id, "status": "present"}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_attendance_today_is_editable(self):
        self.authenticate(self.teacher)
        today = timezone.localdate()
        response = self.client.post(
            "/api/v1/attendance-records/bulk-upsert/",
            {
                "section": self.section.id,
                "date": today.isoformat(),
                "records": [{"student": self.student.id, "status": "absent"}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # ── Edge case: Upload size enforcement ─────────────────────────────────
    def test_upload_oversized_photo_is_rejected(self):
        self.authenticate(self.admin)
        oversized = make_uploaded_image("huge.png", "image/png", "PNG")
        oversized.file = BytesIO(b"x" * 5_000_000)
        oversized.size = 5_000_000
        response = self.client.post(
            f"/api/v1/students/{self.student.id}/upload-photo/",
            {"file": oversized},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Edge case: Cross-school data isolation with boundary values ────────
    def test_cross_school_isolation_with_empty_and_extreme_values(self):
        other_admin = User.objects.create_user(
            username="edge-other-admin",
            password="Passw0rd!123",
            role=UserRole.SCHOOL_ADMIN,
            school=self.other_campus,
            is_staff=True,
        )
        CampusMembership.objects.create(campus=self.other_campus, user=other_admin, role="it_admin", is_primary=True)

        self.authenticate(self.admin)
        created = self.client.post(
            "/api/v1/students/",
            {
                "campus": self.campus.id,
                "section": self.section.id,
                "first_name": "",
                "last_name": "X" * 500,
                "date_of_birth": "2015-01-01",
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        student_id = created.data["id"]

        self.authenticate(other_admin)
        blocked = self.client.get(f"/api/v1/students/{student_id}/")
        self.assertEqual(blocked.status_code, status.HTTP_404_NOT_FOUND)

    # ── Edge case: API rejects empty payloads gracefully ────────────────────
    def test_create_student_with_empty_payload_returns_400(self):
        self.authenticate(self.admin)
        response = self.client.post("/api/v1/students/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_student_with_null_fields_returns_400(self):
        self.authenticate(self.admin)
        response = self.client.post(
            "/api/v1/students/",
            {"campus": None, "section": None, "first_name": None, "last_name": None, "date_of_birth": None},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_attendance_with_invalid_date_format_returns_400(self):
        self.authenticate(self.teacher)
        response = self.client.post(
            "/api/v1/attendance-records/bulk-upsert/",
            {
                "section": self.section.id,
                "date": "not-a-date",
                "records": [{"student": self.student.id, "status": "present"}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_attendance_with_empty_records_list_returns_400(self):
        self.authenticate(self.teacher)
        response = self.client.post(
            "/api/v1/attendance-records/bulk-upsert/",
            {
                "section": self.section.id,
                "date": timezone.localdate().isoformat(),
                "records": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ── Edge case: Token auth with missing/bad credentials ──────────────────
    def test_protected_endpoint_with_expired_token_returns_401(self):
        self.client.force_authenticate(user=None)
        from rest_framework_simplejwt.tokens import AccessToken
        token = AccessToken()
        token.set_exp(lifetime=-timedelta(hours=1))
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.get("/api/v1/students/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_protected_endpoint_with_malformed_token_returns_401(self):
        self.client.force_authenticate(user=None)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer invalid.token.here")
        response = self.client.get("/api/v1/students/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_protected_endpoint_without_token_returns_401(self):
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/v1/students/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # ── Edge case: Null campus code in middleware ───────────────────────────
    def test_admin_without_campus_membership_gets_empty_scope(self):
        isolated = User.objects.create_user(
            username="isolated-user",
            password="Passw0rd!123",
            role=UserRole.TEACHER,
        )
        self.authenticate(isolated)
        response = self.client.get("/api/v1/students/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    # ── Edge case: Fee assignment edge conditions ───────────────────────────
    def test_fee_assignment_with_zero_amount_is_accepted(self):
        account_user = User.objects.create_user(
            username="edge-fee-account",
            password="Passw0rd!123",
            role=UserRole.ACCOUNT,
            school=self.campus,
        )
        CampusMembership.objects.create(campus=self.campus, user=account_user, role="finance_admin", is_primary=True)
        self.authenticate(account_user)
        response = self.client.post(
            "/api/v1/fee-assignments/",
            {
                "campus": self.campus.id,
                "student": self.student.id,
                "title": "Zero Fee",
                "amount": "0.00",
                "due_date": "2026-12-31",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_fee_assignment_with_very_large_amount_is_accepted(self):
        account_user = User.objects.create_user(
            username="edge-large-fee-account",
            password="Passw0rd!123",
            role=UserRole.ACCOUNT,
            school=self.campus,
        )
        CampusMembership.objects.create(campus=self.campus, user=account_user, role="finance_admin", is_primary=True)
        self.authenticate(account_user)
        response = self.client.post(
            "/api/v1/fee-assignments/",
            {
                "campus": self.campus.id,
                "student": self.student.id,
                "title": "Large Fee",
                "amount": "99999999.99",
                "due_date": "2026-12-31",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    # ── Edge case: Duplicate admission number within same campus ────────────
    def test_duplicate_admission_number_within_same_campus_is_rejected(self):
        self.authenticate(self.admin)
        first = self.client.post(
            "/api/v1/students/",
            {
                "campus": self.campus.id,
                "section": self.section.id,
                "admission_number": "DUP-001",
                "first_name": "First",
                "last_name": "Dup",
                "date_of_birth": "2015-01-01",
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        second = self.client.post(
            "/api/v1/students/",
            {
                "campus": self.campus.id,
                "section": self.section.id,
                "admission_number": "DUP-001",
                "first_name": "Second",
                "last_name": "Dup",
                "date_of_birth": "2015-02-02",
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_admission_number_across_campuses_is_allowed(self):
        self.authenticate(self.admin)
        other_section = ClassSection.objects.create(
            campus=self.other_campus,
            session=self.other_session,
            grade_name="Grade 7",
            section_name="A",
            class_teacher=self.other_teacher,
        )
        main_response = self.client.post(
            "/api/v1/students/",
            {
                "campus": self.campus.id,
                "section": self.section.id,
                "admission_number": "CROSS-DUP",
                "first_name": "Main",
                "last_name": "Student",
                "date_of_birth": "2015-01-01",
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(main_response.status_code, status.HTTP_201_CREATED, main_response.data)
        other_response = self.client.post(
            "/api/v1/students/",
            {
                "campus": self.other_campus.id,
                "section": other_section.id,
                "admission_number": "CROSS-DUP",
                "first_name": "Other",
                "last_name": "Student",
                "date_of_birth": "2015-03-03",
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(other_response.status_code, status.HTTP_201_CREATED, other_response.data)

    # ── Edge case: Tenant middleware with extreme host values ───────────────
    def test_tenant_middleware_with_malformed_host_header(self):
        from django.test import RequestFactory
        factory = RequestFactory()
        middleware = CampusTenantMiddleware(lambda request: None)
        with override_settings(TENANT_DOMAIN_SUFFIX="schools.example.com"):
            request = factory.get("/", HTTP_HOST="")
            self.assertEqual(middleware._campus_code_from_request(request), "")

            request = factory.get("/", HTTP_HOST="not-a-real-suffix.com")
            self.assertEqual(middleware._campus_code_from_request(request), "")

            request = factory.get("/", HTTP_HOST="a" * 300)
            code = middleware._campus_code_from_request(request)
            self.assertEqual(code, "")

    # ── Edge case: Rate limit detection in API client (simulated) ──────────
    def test_rate_limit_response_format(self):
        self.authenticate(self.admin)
        from django.conf import settings as dj_settings
        from rest_framework.throttling import UserRateThrottle
        throttle = UserRateThrottle()
        throttle.rate = "1/second"
        throttle.num_requests = 1
        throttle.duration = 1
        throttle.wait = lambda self: 60
        response = self.client.get("/api/v1/students/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
