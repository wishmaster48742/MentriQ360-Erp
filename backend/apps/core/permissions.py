from rest_framework.permissions import SAFE_METHODS, BasePermission

SUPER_ADMIN_ROLE = "super_admin"


class RoleAccessPermission(BasePermission):
    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if getattr(user, "role", None) == SUPER_ADMIN_ROLE:
            return True

        if request.method in SAFE_METHODS:
            allowed_roles = getattr(view, "read_roles", ())
        else:
            allowed_roles = getattr(view, "write_roles", ())

        return user.role in allowed_roles
