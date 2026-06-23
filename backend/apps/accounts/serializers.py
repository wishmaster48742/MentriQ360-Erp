import re

from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from django.core.cache import cache

from .captcha import validate_captcha_response
from .models import User, UserRole


# ─── Password complexity ──────────────────────────────────────────────────────

_PASSWORD_MIN_LENGTH = 10


def _validate_password_strength(password: str) -> str:
    """
    Enforce the project's minimum password security policy:
      ≥ 10 chars, at least one uppercase, one lowercase, one digit, one special char.
    Raises serializers.ValidationError with a list of all violations found.
    """
    errors: list[str] = []
    if len(password) < _PASSWORD_MIN_LENGTH:
        errors.append(f"Password must be at least {_PASSWORD_MIN_LENGTH} characters long.")
    if not re.search(r"[A-Z]", password):
        errors.append("Password must contain at least one uppercase letter.")
    if not re.search(r"[a-z]", password):
        errors.append("Password must contain at least one lowercase letter.")
    if not re.search(r"\d", password):
        errors.append("Password must contain at least one digit.")
    if not re.search(r"[^a-zA-Z0-9]", password):
        errors.append("Password must contain at least one special character (!@#$%^&* etc.).")
    if errors:
        raise serializers.ValidationError(errors)
    return password


# ─── Brute-force lockout helpers ─────────────────────────────────────────────

_FAIL_PREFIX = "auth_fail:"
_FAIL_IP_PREFIX = "auth_fail_ip:"
_MAX_FAILURES = 5
_LOCKOUT_SECONDS = 15 * 60   # 15 minutes


def _fail_key(username: str) -> str:
    return f"{_FAIL_PREFIX}{username.strip().lower()}"


def _fail_ip_key(ip: str) -> str:
    return f"{_FAIL_IP_PREFIX}{ip}"


def _is_locked_out(username: str, ip: str | None = None) -> bool:
    if int(cache.get(_fail_key(username)) or 0) >= _MAX_FAILURES:
        return True
    if ip and int(cache.get(_fail_ip_key(ip)) or 0) >= _MAX_FAILURES * 2:
        return True
    return False


def _record_failure(username: str, ip: str | None = None) -> None:
    key = _fail_key(username)
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=_LOCKOUT_SECONDS)
    if ip:
        ip_key = _fail_ip_key(ip)
        try:
            cache.incr(ip_key)
        except ValueError:
            cache.set(ip_key, 1, timeout=_LOCKOUT_SECONDS)


def _clear_failures(username: str, ip: str | None = None) -> None:
    cache.delete(_fail_key(username))
    if ip:
        cache.delete(_fail_ip_key(ip))


# ─── Serializers ─────────────────────────────────────────────────────────────

class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    campuses = serializers.SerializerMethodField()
    school_name = serializers.CharField(source="school.name", read_only=True)
    school_code = serializers.CharField(source="school.code", read_only=True)
    school_status = serializers.CharField(source="school.status", read_only=True)
    linked_student_profile = serializers.SerializerMethodField()
    linked_staff_profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "school",
            "school_name",
            "school_code",
            "school_status",
            "phone_number",
            "must_change_password",
            "campuses",
            "is_active",
            "gender",
            "date_of_birth",
            "address",
            "city",
            "state",
            "pincode",
            "blood_group",
            "emergency_contact_name",
            "emergency_contact_phone",
            "qualification",
            "profile_photo_url",
            "bio",
            "linked_student_profile",
            "linked_staff_profile",
        )
        read_only_fields = (
            "id",
            "username",
            "role",
            "school",
            "school_name",
            "school_code",
            "school_status",
            "must_change_password",
            "campuses",
            "is_active",
            "linked_student_profile",
            "linked_staff_profile",
        )

    def get_full_name(self, obj: User) -> str:
        return obj.get_full_name() or obj.username

    def get_campuses(self, obj: User) -> list[dict]:
        memberships = list(obj.get_campus_memberships())
        if not memberships and obj.school_id:
            school = obj.school
            if school:
                return [
                    {
                        "id": obj.school_id,
                        "name": school.name,
                        "code": school.code,
                        "logo_url": school.logo_url,
                        "logo_alt_text": school.logo_alt_text,
                        "role": "school",
                        "is_primary": True,
                        "can_manage_users": obj.role == UserRole.SCHOOL_ADMIN,
                        "can_configure_attendance": obj.role == UserRole.SCHOOL_ADMIN,
                    }
                ]
            return []
        result = []
        for membership in memberships:
            campus = membership.campus
            if not campus:
                continue
            result.append({
                "id": membership.campus_id,
                "name": campus.name,
                "code": campus.code,
                "logo_url": campus.logo_url,
                "logo_alt_text": campus.logo_alt_text,
                "role": membership.role,
                "is_primary": membership.is_primary,
                "can_manage_users": membership.can_manage_users,
                "can_configure_attendance": membership.can_configure_attendance,
            })
        return result

    def get_linked_student_profile(self, obj: User) -> dict | None:
        try:
            student = obj.get_student_profile()
            if not student:
                return None
            return {
                "id": str(student.id),
                "admission_number": student.admission_number,
                "first_name": student.first_name,
                "last_name": student.last_name,
                "grade_name": student.section.grade_name if student.section else "",
                "section_name": student.section.section_name if student.section else "",
                "status": student.status,
            }
        except Exception:
            return None

    def get_linked_staff_profile(self, obj: User) -> dict | None:
        try:
            staff = obj.get_staff_profile()
            if not staff:
                return None
            return {
                "id": str(staff.id),
                "employee_code": staff.employee_code,
                "designation": staff.designation,
                "department": staff.department,
                "status": staff.status,
            }
        except Exception:
            return None


class UserAdminSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, min_length=_PASSWORD_MIN_LENGTH)
    full_name = serializers.SerializerMethodField()
    campuses = serializers.SerializerMethodField()
    school_name = serializers.CharField(source="school.name", read_only=True)
    school_code = serializers.CharField(source="school.code", read_only=True)
    school_status = serializers.CharField(source="school.status", read_only=True)
    campus_ids = serializers.ListField(
        child=serializers.CharField(),
        write_only=True,
        required=False,
        allow_empty=True,
    )
    linked_student_profile = serializers.SerializerMethodField()
    linked_staff_profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "school",
            "school_name",
            "school_code",
            "school_status",
            "phone_number",
            "campuses",
            "campus_ids",
            "must_change_password",
            "is_active",
            "is_staff",
            "password",
            "gender",
            "date_of_birth",
            "address",
            "city",
            "state",
            "pincode",
            "blood_group",
            "emergency_contact_name",
            "emergency_contact_phone",
            "qualification",
            "profile_photo_url",
            "bio",
            "linked_student_profile",
            "linked_staff_profile",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    def validate_password(self, value: str) -> str:
        return _validate_password_strength(value)

    def get_linked_student_profile(self, obj: User) -> dict | None:
        try:
            student = obj.get_student_profile()
            if not student:
                return None
            return {
                "id": str(student.id),
                "admission_number": student.admission_number,
                "first_name": student.first_name,
                "last_name": student.last_name,
                "grade_name": student.section.grade_name if student.section else "",
                "section_name": student.section.section_name if student.section else "",
                "status": student.status,
            }
        except Exception:
            return None

    def get_linked_staff_profile(self, obj: User) -> dict | None:
        try:
            staff = obj.get_staff_profile()
            if not staff:
                return None
            return {
                "id": str(staff.id),
                "employee_code": staff.employee_code,
                "designation": staff.designation,
                "department": staff.department,
                "status": staff.status,
            }
        except Exception:
            return None

    def get_full_name(self, obj: User) -> str:
        return obj.get_full_name() or obj.username

    def get_campuses(self, obj: User) -> list[dict]:
        result = []
        for membership in obj.get_campus_memberships():
            campus = membership.campus
            if not campus:
                continue
            result.append({
                "id": membership.campus_id,
                "name": campus.name,
                "code": campus.code,
                "logo_url": campus.logo_url,
                "logo_alt_text": campus.logo_alt_text,
                "role": membership.role,
                "is_primary": membership.is_primary,
                "can_manage_users": membership.can_manage_users,
                "can_configure_attendance": membership.can_configure_attendance,
            })
        return result

    def validate_role(self, value):
        if value == UserRole.SUPER_ADMIN:
            request = self.context.get("request")
            if not request or getattr(request.user, "role", None) != UserRole.SUPER_ADMIN:
                raise serializers.ValidationError("Only a super admin can create or edit super admins.")
        return value

    def validate_campus_ids(self, value):
        if len(set(value)) > 1:
            raise serializers.ValidationError("Every non-super-admin user must belong to exactly one school.")
        request = self.context.get("request")
        if not request or getattr(request.user, "role", None) == UserRole.SUPER_ADMIN:
            return value
        from apps.core.models import CampusMembership

        allowed = set(CampusMembership.objects.filter(user_id=request.user.pk).values_list("campus_id", flat=True))
        if not set(value).issubset(allowed):
            raise serializers.ValidationError("Admins can assign users only to their own campuses.")
        return value

    def validate(self, attrs):
        role = attrs.get("role", getattr(self.instance, "role", None))
        campus_ids = attrs.get("campus_ids", None)
        school = attrs.get("school", getattr(self.instance, "school", None))
        request = self.context.get("request")
        if role == UserRole.SUPER_ADMIN:
            attrs["school_id"] = None
            attrs["campus_ids"] = None
            return attrs
        if campus_ids is not None and not campus_ids:
            raise serializers.ValidationError({"campus_ids": "Select at least one campus for this user."})
        if campus_ids is None and school is None and self.instance is None:
            raise serializers.ValidationError({"campus_ids": "Select at least one campus for this user."})
        if school and request and getattr(request.user, "role", None) != UserRole.SUPER_ADMIN:
            from apps.core.models import CampusMembership

            allowed = set(CampusMembership.objects.filter(user_id=request.user.pk).values_list("campus_id", flat=True))
            if getattr(school, "id", None) not in allowed:
                raise serializers.ValidationError({"school": "Admins can assign users only to their own school."})
        if campus_ids:
            attrs["school_id"] = campus_ids[0]
        return attrs

    def sync_campus_memberships(self, user: User, campus_ids: list[int] | None) -> None:
        if campus_ids is None and user.school_id and not user.get_campus_memberships():
            campus_ids = [user.school_id]
        if campus_ids is None:
            return
        from apps.core.models import CampusMemberRole, CampusMembership

        CampusMembership.objects.filter(user_id=user.pk).delete()
        role_map = {
            UserRole.SCHOOL_ADMIN: CampusMemberRole.IT_ADMIN,
            UserRole.ACCOUNT: CampusMemberRole.FINANCE_ADMIN,
            UserRole.TEACHER: CampusMemberRole.TEACHER,
            UserRole.STUDENT: CampusMemberRole.SUPPORT,
        }
        membership_role = role_map.get(user.role, CampusMemberRole.SUPPORT)
        unique_campus_ids = list(dict.fromkeys(campus_ids))[:1]
        if unique_campus_ids:
            user.school_id = unique_campus_ids[0]
            user.save(update_fields=["school_id", "updated_at"])
        for index, campus_id in enumerate(unique_campus_ids):
            CampusMembership.objects.create(
                user=user,
                campus_id=campus_id,
                role=membership_role,
                is_primary=index == 0,
                can_manage_users=user.role == UserRole.SCHOOL_ADMIN,
                can_configure_attendance=user.role == UserRole.SCHOOL_ADMIN,
            )

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        campus_ids = validated_data.pop("campus_ids", None)
        school_id = validated_data.pop("school_id", None)
        user = User(**validated_data)
        if school_id:
            user.school_id = school_id
        if user.role in (UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN):
            user.is_staff = True
        else:
            user.is_staff = False
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
            user.must_change_password = True
        user.save()
        self.sync_campus_memberships(user, campus_ids)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        campus_ids = validated_data.pop("campus_ids", None)
        school_id = validated_data.pop("school_id", None)
        if instance.is_protected_super_admin:
            blocked = {}
            requested_role = validated_data.get("role", instance.role)
            requested_active = validated_data.get("is_active", instance.is_active)
            if requested_role != UserRole.SUPER_ADMIN:
                blocked["role"] = "Super Admin accounts cannot be demoted."
            if requested_active is False:
                blocked["is_active"] = "Super Admin accounts cannot be disabled."
            if blocked:
                raise serializers.ValidationError(blocked)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if school_id:
            instance.school_id = school_id
        if instance.role in (UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN):
            instance.is_staff = True
        else:
            instance.is_staff = False
        if password:
            instance.set_password(password)
            instance.must_change_password = False
        instance.save()
        self.sync_campus_memberships(instance, campus_ids)
        return instance


class ERPTokenObtainPairSerializer(TokenObtainPairSerializer):
    captcha_id = serializers.CharField(write_only=True, required=True)
    captcha_answer = serializers.CharField(write_only=True, required=True, trim_whitespace=True)

    @classmethod
    def get_token(cls, user: User):
        token = super().get_token(user)
        token["role"] = user.role
        token["username"] = user.username
        token["schoolId"] = user.school_id
        school = user.school
        token["schoolCode"] = school.code if school else ""
        return token

    def validate(self, attrs):
        captcha_id = attrs.pop("captcha_id", "")
        captcha_answer = attrs.pop("captcha_answer", "")

        if not validate_captcha_response(captcha_id, captcha_answer):
            raise serializers.ValidationError(
                {"captcha_answer": "Captcha answer is incorrect or expired. Refresh and try again."}
            )

        username = attrs.get(self.username_field, "").strip()

        request = self.context.get("request")
        client_ip = None
        if request:
            forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
            if forwarded:
                client_ip = forwarded.split(",")[0].strip()
            else:
                client_ip = request.META.get("REMOTE_ADDR")

        # Brute-force lockout check (checked after captcha to avoid enumeration
        # of locked accounts without solving a captcha first).
        if username and _is_locked_out(username, client_ip):
            raise serializers.ValidationError(
                {"non_field_errors": ["Login temporarily locked due to repeated failures. Please try again in 15 minutes."]}
            )

        try:
            data = super().validate(attrs)
        except (serializers.ValidationError, AuthenticationFailed):
            if username:
                _record_failure(username, client_ip)
            raise

        # Successful authentication — clear the failure counter.
        if username:
            _clear_failures(username, client_ip)

        if self.user.role != UserRole.SUPER_ADMIN:
            campus = self.user.school
            if campus is None:
                from apps.core.models import Campus, CampusMembership

                membership = (
                    CampusMembership.objects.filter(user_id=self.user.pk, is_primary=True).first()
                    or CampusMembership.objects.filter(user_id=self.user.pk).first()
                )
                if membership and membership.campus_id:
                    campus = Campus.objects.filter(id=membership.campus_id).first()

            if campus is None:
                # Don't reveal that the account exists but has no school assignment.
                raise serializers.ValidationError(
                    {"non_field_errors": ["Login failed. Please contact your administrator."]}
                )
            if campus.status != "active":
                # Don't reveal the school name or its exact status to unauthenticated callers.
                raise serializers.ValidationError(
                    {"non_field_errors": ["Login failed. Please contact your administrator."]}
                )

        data["user"] = UserSerializer(self.user).data
        return data


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=_PASSWORD_MIN_LENGTH)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value: str) -> str:
        return _validate_password_strength(value)

    def save(self, **kwargs):
        from django.utils import timezone
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.must_change_password = False
        user.password_changed_at = timezone.now()
        user.save(update_fields=["password", "must_change_password", "password_changed_at", "updated_at"])
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        user = User.objects.filter(email__iexact=value).first()
        if not user:
            raise serializers.ValidationError("No account found with this email address.")
        return value

    def save(self, **kwargs):
        from django.utils import timezone
        from django.core.signing import TimestampSigner
        from django.conf import settings
        email = self.validated_data["email"]
        user = User.objects.filter(email__iexact=email).first()
        if not user:
            return None
        signer = TimestampSigner(salt="password-reset")
        token = signer.sign(f"{user.pk}:{user.username}")
        return {
            "email": email,
            "token": token,
            "expires_in_minutes": settings.MENTRIQ_PASSWORD_RESET_TOKEN_MINUTES,
        }


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=_PASSWORD_MIN_LENGTH)

    def validate_new_password(self, value: str) -> str:
        return _validate_password_strength(value)

    def validate(self, attrs):
        from django.core.signing import TimestampSigner, SignatureExpired, BadSignature
        from django.conf import settings
        from django.utils import timezone
        signer = TimestampSigner(salt="password-reset")
        token = attrs.get("token", "")
        try:
            unsigned = signer.unsign(token, max_age=settings.MENTRIQ_PASSWORD_RESET_TOKEN_MINUTES * 60)
        except SignatureExpired:
            raise serializers.ValidationError({"token": "Password reset token has expired. Please request a new one."})
        except BadSignature:
            raise serializers.ValidationError({"token": "Invalid password reset token."})
        parts = unsigned.split(":", 1)
        if len(parts) != 2:
            raise serializers.ValidationError({"token": "Malformed password reset token."})
        pk_str, username = parts
        user = User.objects.filter(pk=int(pk_str), username=username).first()
        if not user:
            raise serializers.ValidationError({"token": "Invalid password reset token."})
        attrs["_user"] = user
        return attrs

    def save(self, **kwargs):
        from django.utils import timezone
        user = self.validated_data["_user"]
        user.set_password(self.validated_data["new_password"])
        user.must_change_password = False
        user.password_changed_at = timezone.now()
        user.save(update_fields=["password", "must_change_password", "password_changed_at", "updated_at"])
        return user


class EmailVerificationSendSerializer(serializers.Serializer):
    def validate(self, attrs):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("Authentication required.")
        if request.user.is_email_verified:
            raise serializers.ValidationError("Email is already verified.")
        return attrs

    def save(self, **kwargs):
        from django.core.signing import TimestampSigner
        from django.conf import settings
        request = self.context["request"]
        user = request.user
        signer = TimestampSigner(salt="email-verification")
        token = signer.sign(f"{user.pk}:{user.email}")
        return {
            "token": token,
            "expires_in_hours": settings.MENTRIQ_VERIFICATION_TOKEN_HOURS,
        }


class EmailVerificationConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()

    def validate(self, attrs):
        from django.core.signing import TimestampSigner, SignatureExpired, BadSignature
        from django.conf import settings
        signer = TimestampSigner(salt="email-verification")
        token = attrs.get("token", "")
        try:
            unsigned = signer.unsign(token, max_age=settings.MENTRIQ_VERIFICATION_TOKEN_HOURS * 3600)
        except SignatureExpired:
            raise serializers.ValidationError({"token": "Verification token has expired. Please request a new one."})
        except BadSignature:
            raise serializers.ValidationError({"token": "Invalid verification token."})
        parts = unsigned.split(":", 1)
        if len(parts) != 2:
            raise serializers.ValidationError({"token": "Malformed verification token."})
        pk_str, email = parts
        user = User.objects.filter(pk=int(pk_str)).first()
        if not user:
            raise serializers.ValidationError({"token": "Invalid verification token."})
        if user.is_email_verified:
            raise serializers.ValidationError("Email is already verified.")
        attrs["_user"] = user
        return attrs

    def save(self, **kwargs):
        user = self.validated_data["_user"]
        user.is_email_verified = True
        user.save(update_fields=["is_email_verified", "updated_at"])
        return user

