from rest_framework.permissions import BasePermission

from .models import UserRole


class HasRole(BasePermission):
    allowed_roles: tuple[str, ...] = ()

    def has_permission(self, request, view) -> bool:
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in self.allowed_roles
        )


class IsAdminUserRole(HasRole):
    allowed_roles = (UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)


class IsAccountUserRole(HasRole):
    allowed_roles = (UserRole.ACCOUNT,)


class IsTeacherUserRole(HasRole):
    allowed_roles = (UserRole.TEACHER,)


class IsStudentUserRole(HasRole):
    allowed_roles = (UserRole.STUDENT,)
