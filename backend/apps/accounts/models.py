from datetime import datetime

from django.contrib.auth.models import AbstractUser
from django.db import models


class UserRole(models.TextChoices):
    SUPER_ADMIN = "super_admin", "Super Admin"
    SCHOOL_ADMIN = "school_admin", "School Admin"
    ACCOUNT = "account", "Account"
    TEACHER = "teacher", "Teacher"
    STUDENT = "student", "Student"


class GenderChoice(models.TextChoices):
    MALE = "male", "Male"
    FEMALE = "female", "Female"
    OTHER = "other", "Other"


class User(AbstractUser):
    role = models.CharField(max_length=32, choices=UserRole.choices, default=UserRole.SCHOOL_ADMIN)
    school_id = models.CharField(max_length=24, null=True, blank=True, default=None)
    phone_number = models.CharField(max_length=20, default="", blank=True)
    gender = models.CharField(max_length=20, default="", blank=True)
    date_of_birth = models.CharField(max_length=20, default="", blank=True)
    address = models.TextField(default="", blank=True)
    city = models.CharField(max_length=100, default="", blank=True)
    state = models.CharField(max_length=100, default="", blank=True)
    pincode = models.CharField(max_length=20, default="", blank=True)
    blood_group = models.CharField(max_length=8, default="", blank=True)
    emergency_contact_name = models.CharField(max_length=120, default="", blank=True)
    emergency_contact_phone = models.CharField(max_length=20, default="", blank=True)
    qualification = models.CharField(max_length=180, default="", blank=True)
    profile_photo_url = models.TextField(default="", blank=True)
    bio = models.TextField(default="", blank=True)
    must_change_password = models.BooleanField(default=False)
    is_email_verified = models.BooleanField(default=False)
    password_changed_at = models.DateTimeField(null=True, blank=True, default=None)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["username"]

    def __str__(self) -> str:
        return f"{self.username} ({self.role})"

    @property
    def is_protected_super_admin(self) -> bool:
        return self.role == UserRole.SUPER_ADMIN or self.is_superuser

    @property
    def school(self):
        if not self.school_id:
            return None
        from apps.core.models import Campus
        from apps.core.mongo_compat import lazy_qs
        try:
            return lazy_qs(Campus.objects.filter(id=self.school_id)).first()
        except Exception:
            return None

    @school.setter
    def school(self, value):
        if value is None:
            self.school_id = None
        else:
            self.school_id = str(getattr(value, "id", value))

    def save(self, *args, **kwargs):
        if self.role == UserRole.SUPER_ADMIN or self.is_superuser:
            self.role = UserRole.SUPER_ADMIN
            self.is_staff = True
            self.is_superuser = True
            self.is_active = True
        super().save(*args, **kwargs)

    def get_campus_memberships(self):
        from apps.core.models import CampusMembership
        return CampusMembership.objects.filter(user_id=self.pk)

    def get_student_profile(self):
        from apps.core.models import Student
        try:
            return Student.objects.filter(user_id=self.pk).first()
        except Exception:
            return None

    def get_staff_profile(self):
        from apps.core.models import StaffProfile
        try:
            return StaffProfile.objects.filter(user_id=self.pk).first()
        except Exception:
            return None
