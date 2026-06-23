from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.accounts.models import UserRole
from apps.core.models import (
    AcademicSession,
    Announcement,
    AttendanceRecord,
    Campus,
    CampusMembership,
    ClassSection,
    ExamSchedule,
    ExamType,
    FeeAssignment,
    FeeStructure,
    Payment,
    PlatformSetting,
    StaffAttendanceRecord,
    StaffProfile,
    Student,
    Subject,
    TeacherSubjectAllocation,
)


DEMO_CODE = "DEMO360"
DEMO_MARKER_KEY = "demo_data_marker"
DEMO_TAG = "phase8_client_demo"
DEMO_PASSWORD = "Demo@12345"

DEMO_USERNAMES = (
    "demo.schooladmin",
    "demo.account",
    "demo.teacher.math",
    "demo.teacher.science",
    "demo.student.aarav",
    "demo.student.mira",
    "demo.student.kabir",
)


class Command(BaseCommand):
    help = "Seed or remove one clearly marked MentriQ360 demo school (MongoDB-backed)."

    def add_arguments(self, parser):
        parser.add_argument("--code", default=DEMO_CODE, help="Demo school code. Defaults to DEMO360.")
        parser.add_argument("--password", default=DEMO_PASSWORD, help="Password assigned to demo users.")
        parser.add_argument("--remove", action="store_true", help="Remove the demo school and demo users.")
        parser.add_argument("--reset", action="store_true", help="Remove the existing demo school before re-seeding.")

    def handle(self, *args, **options):
        code = options["code"].strip().upper()
        password = options["password"]
        if not code:
            raise CommandError("Demo school code cannot be empty.")

        if options["remove"]:
            removed = self.remove_demo_school(code)
            self.stdout.write(self.style.SUCCESS(f"Removed demo school {code} ({removed} root record(s))."))
            return

        if options["reset"]:
            self.remove_demo_school(code, allow_missing=True)

        campus = self.seed_demo_school(code=code, password=password)
        self.stdout.write(self.style.SUCCESS(f"Demo school ready: {campus.name} ({campus.code})"))
        self.stdout.write("Demo login password for all demo users: " + password)
        for username in DEMO_USERNAMES:
            self.stdout.write(f"  - {username}")
        remove_cmd = "python manage.py seed_demo_school --remove"
        if code != DEMO_CODE:
            remove_cmd = f"python manage.py seed_demo_school --code {code} --remove"
        self.stdout.write(f"Remove later with: {remove_cmd}")

    # ── helpers ────────────────────────────────────────────────────────────

    def is_demo_campus(self, campus) -> bool:
        if (campus.enabled_modules or {}).get("demoData"):
            return True
        return PlatformSetting.objects.filter(campus_id=str(campus.id), key=DEMO_MARKER_KEY).first() is not None

    def _user(self, username, role, first_name, last_name, password, *, is_staff=False):
        User = get_user_model()
        user, _ = User.objects.get_or_create(username=username)
        user.role = role
        user.first_name = first_name
        user.last_name = last_name
        user.email = f"{username}@mentriq360.example"
        user.is_staff = is_staff
        user.is_active = True
        user.must_change_password = False
        user.set_password(password)
        user.save()
        return user

    def remove_demo_school(self, code: str, *, allow_missing: bool = False) -> int:
        campus = Campus.objects.filter(code=code).first()
        if not campus:
            if allow_missing:
                return 0
            raise CommandError(f"No school with code {code} exists.")
        if not self.is_demo_campus(campus):
            raise CommandError(f"School {code} is not marked as demo data. Refusing to remove it.")

        cid = str(campus.id)
        student_ids = [str(s.id) for s in Student.objects.filter(campus_id=cid)]
        if student_ids:
            AttendanceRecord.objects.filter(student_id__in=student_ids).delete()
            FeeAssignment.objects.filter(student_id__in=student_ids).delete()
        for model in (
            Payment, Student, ClassSection, AcademicSession, ExamSchedule, ExamType,
            Subject, Announcement, StaffProfile, StaffAttendanceRecord, FeeStructure,
            TeacherSubjectAllocation, CampusMembership, PlatformSetting,
        ):
            model.objects.filter(campus_id=cid).delete()
        get_user_model().objects.filter(username__in=DEMO_USERNAMES).delete()
        campus.delete()
        return 1

    # ── seed ───────────────────────────────────────────────────────────────

    def seed_demo_school(self, *, code: str, password: str) -> Campus:
        existing = Campus.objects.filter(code=code).first()
        if existing and not self.is_demo_campus(existing):
            raise CommandError(f"School code {code} already exists and is not marked as demo data.")
        if existing:
            self.remove_demo_school(code)

        today = timezone.localdate()
        ts = today.isoformat()

        campus = Campus.objects.create(
            code=code,
            name="MentriQ360 Demo School",
            address="Demo Campus Road, Knowledge Park",
            city="Pune",
            state="Maharashtra",
            pincode="411001",
            contact_email="demo.school@mentriq360.example",
            contact_phone="+91-90000-00001",
            principal_name="Dr. Demo Principal",
            status="active",
            subscription_plan="Demo Enterprise",
            subscription_status="active",
            monthly_subscription_amount=Decimal("5000.00"),
            billing_due_date=(today + timedelta(days=30)).isoformat(),
            academic_year_label="2026-2027",
            enabled_modules={
                "demoData": True, "academics": True, "finance": True, "teacherPortal": True,
                "studentPortal": True, "communication": True, "ai": True, "hardwareAttendance": True,
            },
        )
        cid = str(campus.id)

        school_admin = self._user("demo.schooladmin", UserRole.SCHOOL_ADMIN, "Demo", "School Admin", password, is_staff=True)
        account_user = self._user("demo.account", UserRole.ACCOUNT, "Demo", "Account", password, is_staff=True)
        teacher_math = self._user("demo.teacher.math", UserRole.TEACHER, "Ananya", "Rao", password)
        teacher_science = self._user("demo.teacher.science", UserRole.TEACHER, "Rohan", "Mehta", password)
        student_users = {
            "Aarav": self._user("demo.student.aarav", UserRole.STUDENT, "Aarav", "Patil", password),
            "Mira": self._user("demo.student.mira", UserRole.STUDENT, "Mira", "Shah", password),
            "Kabir": self._user("demo.student.kabir", UserRole.STUDENT, "Kabir", "Sen", password),
        }

        for user, role in ((school_admin, "it_admin"), (account_user, "finance_admin"),
                           (teacher_math, "teacher"), (teacher_science, "teacher")):
            CampusMembership.objects.create(
                campus_id=cid, user_id=user.pk, role=role, is_primary=True,
                can_manage_users=(role == "it_admin"), can_configure_attendance=(role == "it_admin"),
            )

        for user, emp, designation in ((account_user, "EMP-001", "Accounts Officer - Demo"),
                                       (teacher_math, "EMP-002", "Mathematics Teacher - Demo"),
                                       (teacher_science, "EMP-003", "Science Teacher - Demo")):
            StaffProfile.objects.create(
                campus_id=cid, user_id=user.pk, employee_code=f"{code}-{emp}", designation=designation,
                department="Academics", joining_date=(today - timedelta(days=365)).isoformat(),
                employment_type="full_time", status="active",
            )

        session = AcademicSession.objects.create(
            campus_id=cid, name="Demo Academic Year 2026-2027",
            start_date=today.replace(month=4, day=1).isoformat(),
            end_date=today.replace(year=today.year + 1, month=3, day=31).isoformat(), is_active=True,
        )
        sid = str(session.id)
        grade5 = ClassSection.objects.create(campus_id=cid, session_id=sid, grade_name="Grade 5", section_name="A", class_teacher_id=teacher_math.pk)
        grade6 = ClassSection.objects.create(campus_id=cid, session_id=sid, grade_name="Grade 6", section_name="A", class_teacher_id=teacher_science.pk)
        g5, g6 = str(grade5.id), str(grade6.id)

        subject_math = Subject.objects.create(campus_id=cid, name="Mathematics", grade_name="Grade 5", code="MATH", is_active=True)
        Subject.objects.create(campus_id=cid, name="Science", grade_name="Grade 5", code="SCI", is_active=True)
        Subject.objects.create(campus_id=cid, name="English", grade_name="Grade 6", code="ENG", is_active=True)
        TeacherSubjectAllocation.objects.create(campus_id=cid, section_id=g5, teacher_id=teacher_math.pk, subject="Mathematics", weekly_periods=6, is_active=True)
        TeacherSubjectAllocation.objects.create(campus_id=cid, section_id=g5, teacher_id=teacher_science.pk, subject="Science", weekly_periods=5, is_active=True)

        students = []
        for name, section_id in (("Aarav", g5), ("Mira", g5), ("Kabir", g6)):
            uu = student_users[name]
            students.append(Student.objects.create(
                campus_id=cid, section_id=section_id, user_id=uu.pk, first_name=uu.first_name,
                last_name=uu.last_name, admission_number=f"{code}-STU-{name[:3].upper()}",
                date_of_birth=today.replace(year=today.year - 11).isoformat(), status="active",
            ))
        for index, student in enumerate(students):
            AttendanceRecord.objects.create(
                student_id=str(student.id), section_id=student.section_id, date=ts,
                subject="Mathematics" if student.section_id == g5 else "English",
                status=["present", "absent", "present"][index], marked_by_id=teacher_math.pk, capture_method="manual",
            )
        StaffAttendanceRecord.objects.create(
            campus_id=cid, staff_user_id=teacher_math.pk, date=ts, clock_in="08:15", clock_out="15:45",
            status="present", capture_method="manual", marked_by_id=school_admin.pk,
        )

        fee_structure = FeeStructure.objects.create(
            campus_id=cid, section_id=g5, title="Demo Quarterly Tuition Fee", description="Demo fee structure.",
            amount=Decimal("15000.00"), late_fee=Decimal("500.00"), due_day=10, is_active=True, created_by_id=account_user.pk,
        )
        fees = []
        for index, student in enumerate(students[:2], start=1):
            fees.append(FeeAssignment.objects.create(
                student_id=str(student.id), fee_structure_id=str(fee_structure.id),
                due_date=(today + timedelta(days=14)).isoformat(), amount=Decimal("15000.00"),
                late_fee=Decimal("0.00"), discount_amount=Decimal("0.00"),
                paid_amount=Decimal("15000.00") if index == 1 else Decimal("5000.00"),
                status="paid" if index == 1 else "partial",
            ))
        Payment.objects.create(
            receipt_number=f"{code}-REC-001", campus_id=cid, fee_assignment_id=str(fees[0].id),
            student_id=str(students[0].id), amount=Decimal("15000.00"), paid_at=timezone.now(),
            payment_mode="online", status="success", gateway="razorpay", transaction_id=f"pay_{code.lower()}_001",
            recorded_by_id=account_user.pk,
        )
        Payment.objects.create(
            receipt_number=f"{code}-REC-002", campus_id=cid, fee_assignment_id=str(fees[1].id),
            student_id=str(students[1].id), amount=Decimal("5000.00"), paid_at=timezone.now(),
            payment_mode="cash", status="success", gateway="razorpay", transaction_id=f"cash_{code.lower()}_001",
            recorded_by_id=account_user.pk,
        )

        exam_type = ExamType.objects.create(campus_id=cid, name="Demo Unit Test", description="Demo assessment cycle.", is_active=True)
        ExamSchedule.objects.create(
            campus_id=cid, exam_type_id=str(exam_type.id), section_id=g5, subject_id=str(subject_math.id),
            title="Demo Mathematics Unit Test", exam_date=(today + timedelta(days=10)).isoformat(),
            start_time="09:30", end_time="10:30", max_marks=Decimal("100.00"), venue="Room 5A",
            status="published", created_by_id=school_admin.pk,
        )
        Announcement.objects.create(
            campus_id=cid, title="Demo School Notice",
            body="This is a demo notice. Demo data can be removed with seed_demo_school --remove.",
            audience="all", created_by_id=school_admin.pk, is_published=True, published_at=timezone.now(),
        )
        PlatformSetting.objects.create(
            campus_id=cid, key=DEMO_MARKER_KEY, data_type="json",
            value_json={"demo": True, "demoTag": DEMO_TAG, "users": list(DEMO_USERNAMES)},
        )
        return campus
