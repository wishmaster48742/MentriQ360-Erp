from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.core.exceptions import ValidationError

from .models import User


@admin.register(User)
class ERPUserAdmin(UserAdmin):
    list_display = ("username", "email", "role", "is_staff", "is_active")
    list_filter = ("role", "is_staff", "is_active")
    fieldsets = UserAdmin.fieldsets + (
        (
            "ERP Access",
            {
                "fields": (
                    "role",
                    "must_change_password",
                )
            },
        ),
    )

    def delete_model(self, request, obj):
        if obj.is_protected_super_admin:
            raise ValidationError("Super Admin accounts cannot be deleted.")
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        if queryset.filter(role="super_admin").exists():
            raise ValidationError("Super Admin accounts cannot be deleted.")
        super().delete_queryset(request, queryset)
