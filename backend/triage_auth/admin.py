"""Django admin registrations for Node-owned auth tables (CRUD + read-only reference views)."""

import bcrypt
from django import forms
from django.contrib import admin, messages
from django.utils import timezone

from .models import (
    TriagePasswordResetToken,
    TriagePermission,
    TriageRole,
    TriageUser,
    TriageUserRole,
)


class ReadOnlyAdminMixin:
    """Hide add/change/delete for tables owned or seeded by the Node API."""

    def has_add_permission(self, request):
        """Block creating rows from admin."""
        return False

    def has_change_permission(self, request, obj=None):
        """Block editing rows from admin."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Block deleting rows from admin."""
        return False


class TriageUserAdminForm(forms.ModelForm):
    """
    User form: email, active flag, password, and roles.

    Roles use a multi-select instead of TabularInline because auth_user_roles has a
    composite PK and Django admin inlines POST PKs as ``(2, 1)`` while CompositePrimaryKey
    expects JSON — that mismatch caused JSONDecodeError on save.
    """

    new_password = forms.CharField(
        label="Password",
        required=False,
        widget=forms.PasswordInput(render_value=False),
        help_text="Leave blank when editing unless you want to set a new password (min 8 characters).",
    )
    roles = forms.ModelMultipleChoiceField(
        queryset=TriageRole.objects.order_by("name"),
        required=False,
        widget=forms.CheckboxSelectMultiple,
        label="Roles",
        help_text="Assign at least admin for Django admin access.",
    )

    class Meta:
        model = TriageUser
        fields = ("email", "is_active")

    def __init__(self, *args, **kwargs):
        """Pre-select current roles when editing an existing user."""
        super().__init__(*args, **kwargs)
        if self.instance.pk:
            self.fields["roles"].initial = self.instance.roles.all()

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
        """Persist user row, bcrypt password, and queue role sync for save_m2m."""
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
        self._roles_to_sync = list(self.cleaned_data.get("roles", []))
        if commit:
            user.save()
            self._sync_user_roles(user, self._roles_to_sync)
        return user

    def save_m2m(self):
        """ModelAdmin calls this after save(commit=False); sync auth_user_roles rows."""
        self._sync_user_roles(self.instance, getattr(self, "_roles_to_sync", []))

    def _sync_user_roles(self, user, roles):
        """Replace through-table rows to match the multi-select (composite PK, no inline)."""
        desired_ids = {role.pk for role in roles}
        existing_ids = set(
            TriageUserRole.objects.filter(user=user).values_list("role_id", flat=True)
        )
        for role_id in desired_ids - existing_ids:
            TriageUserRole.objects.create(user_id=user.pk, role_id=role_id)
        TriageUserRole.objects.filter(user=user).exclude(role_id__in=desired_ids).delete()


@admin.register(TriageUser)
class TriageUserAdmin(admin.ModelAdmin):
    """Create, update, delete users; assign roles via the main form (not inlines)."""

    form = TriageUserAdminForm
    list_display = ("email", "is_active", "role_list", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("email",)
    ordering = ("email",)

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
        """Delegate to ModelForm (password + roles handled in form.save / save_m2m)."""
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
class TriageRoleAdmin(ReadOnlyAdminMixin, admin.ModelAdmin):
    """
    View roles and permission codes (read-only).

    Permission mappings use auth_role_permissions (composite PK) — no inline to avoid
    the same JSONDecodeError issue as user role inlines.
    """

    list_display = ("name", "description", "permission_code_list")
    search_fields = ("name",)
    ordering = ("name",)
    readonly_fields = ("name", "description", "permission_code_list")

    @admin.display(description="Permissions")
    def permission_code_list(self, obj):
        """List permission codes granted to this role."""
        if obj is None:
            return "—"
        codes = obj.role_permissions.select_related("permission").values_list(
            "permission__code", flat=True
        )
        return ", ".join(codes) or "—"


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
