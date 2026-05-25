"""Django admin registrations for Node-owned auth tables (CRUD + read-only reference views)."""

import bcrypt
from django import forms
from django.contrib import admin, messages
from django.utils import timezone

from .models import (
    TriagePasswordResetToken,
    TriagePermission,
    TriageRole,
    TriageRolePermission,
    TriageUser,
    TriageUserRole,
)


class ReadOnlyAdminMixin:
    """Hide add/change/delete for tables owned or seeded by the Node API."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class TriageUserRoleInline(admin.TabularInline):
    """Edit role assignments on the user change form (uses composite PK through table)."""

    model = TriageUserRole
    extra = 1
    autocomplete_fields = ["role"]
    ordering = ("role__name",)  # Avoid default ORDER BY id (column does not exist).


class TriageRolePermissionInline(admin.TabularInline):
    """Show which permission codes a role grants (seeded by Node — read-only)."""

    model = TriageRolePermission
    extra = 0
    can_delete = False
    fields = ("permission",)
    readonly_fields = ("permission",)
    ordering = ("permission__code",)

    def has_add_permission(self, request, obj=None):
        return False


class TriageUserAdminForm(forms.ModelForm):
    """User form with optional password field mapped to ``password_hash`` (bcrypt)."""

    new_password = forms.CharField(
        label="Password",
        required=False,
        widget=forms.PasswordInput(render_value=False),
        help_text="Leave blank when editing unless you want to set a new password (min 8 characters).",
    )

    class Meta:
        model = TriageUser
        fields = ("email", "is_active")

    def clean_new_password(self):
        """Enforce the same minimum length as the Node API."""
        password = self.cleaned_data.get("new_password") or ""
        if password and len(password) < 8:
            raise forms.ValidationError("Password must be at least 8 characters.")
        return password

    def clean(self):
        """Require a password when creating a new user."""
        cleaned = super().clean()
        if not self.instance.pk and not cleaned.get("new_password"):
            raise forms.ValidationError({"new_password": "Password is required for new users."})
        return cleaned

    def save(self, commit=True):
        """Hash password with bcrypt (compatible with Node login) before persisting."""
        user = super().save(commit=False)
        password = self.cleaned_data.get("new_password")
        now = timezone.now()
        if not user.pk:
            user.created_at = now
        user.updated_at = now
        if password:
            user.password_hash = bcrypt.hashpw(
                password.encode("utf-8"),
                bcrypt.gensalt(rounds=12),
            ).decode("utf-8")
        if commit:
            user.save()
            self.save_m2m()
        return user


@admin.register(TriageUser)
class TriageUserAdmin(admin.ModelAdmin):
    """Create, update, delete users and their role assignments."""

    form = TriageUserAdminForm
    list_display = ("email", "is_active", "role_list", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("email",)
    ordering = ("email",)
    inlines = [TriageUserRoleInline]

    @admin.display(description="Roles")
    def role_list(self, obj):
        """Summarize assigned roles for the changelist."""
        return ", ".join(obj.roles.values_list("name", flat=True)) or "—"

    def get_readonly_fields(self, request, obj=None):
        """Show timestamps on existing users."""
        if obj:
            return ("created_at", "updated_at")
        return ()

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)

    def delete_model(self, request, obj):
        """Prevent lock-out: admin must use another account or SQL to remove themselves."""
        if obj.pk == request.user.pk:
            messages.error(request, "You cannot delete your own admin account.")
            return
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        """Bulk delete skips the signed-in admin row."""
        blocked = queryset.filter(pk=request.user.pk)
        if blocked.exists():
            messages.error(request, "Your own admin account was skipped and cannot be deleted.")
            queryset = queryset.exclude(pk=request.user.pk)
        if queryset.exists():
            super().delete_queryset(request, queryset)


@admin.register(TriageRole)
class TriageRoleAdmin(admin.ModelAdmin):
    """View roles and their permission mappings (role names seeded by Node)."""

    search_fields = ("name",)
    ordering = ("name",)
    inlines = [TriageRolePermissionInline]

    def has_add_permission(self, request):
        """New roles should be added via Node bootstrap or SQL, not casually in admin."""
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(TriagePermission)
class TriagePermissionAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    """Reference list of permission codes (``backend/src/auth/constants.js`` seeds these)."""

    list_display = ("code", "description")
    search_fields = ("code",)
    ordering = ("code",)


@admin.register(TriagePasswordResetToken)
class TriagePasswordResetTokenAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    """Audit active/recent forgot-password tokens (Node API creates and consumes these)."""

    list_display = ("user", "expires_at", "used_at", "created_at")
    list_filter = ("used_at",)
    search_fields = ("user__email",)
    ordering = ("-created_at",)


admin.site.site_header = "Suspicious Email Triage — user administration"
admin.site.site_title = "Triage admin"
admin.site.index_title = "Accounts, roles, and permissions"
