import bcrypt
from django import forms
from django.contrib import admin, messages
from django.utils import timezone

from .models import TriageRole, TriageUser, TriageUserRole


class TriageUserRoleInline(admin.TabularInline):
    model = TriageUserRole
    extra = 1
    autocomplete_fields = ["role"]


class TriageUserAdminForm(forms.ModelForm):
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
        password = self.cleaned_data.get("new_password") or ""
        if password and len(password) < 8:
            raise forms.ValidationError("Password must be at least 8 characters.")
        return password

    def clean(self):
        cleaned = super().clean()
        if not self.instance.pk and not cleaned.get("new_password"):
            raise forms.ValidationError({"new_password": "Password is required for new users."})
        return cleaned

    def save(self, commit=True):
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
    form = TriageUserAdminForm
    list_display = ("email", "is_active", "role_list", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("email",)
    ordering = ("email",)
    inlines = [TriageUserRoleInline]

    @admin.display(description="Roles")
    def role_list(self, obj):
        return ", ".join(obj.roles.values_list("name", flat=True)) or "—"

    def get_readonly_fields(self, request, obj=None):
        if obj:
            return ("created_at", "updated_at")
        return ()

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)

    def delete_model(self, request, obj):
        # Prevent lock-out: admin must use another account or SQL to remove themselves.
        if obj.pk == request.user.pk:
            messages.error(request, "You cannot delete your own admin account.")
            return
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        blocked = queryset.filter(pk=request.user.pk)
        if blocked.exists():
            messages.error(request, "Your own admin account was skipped and cannot be deleted.")
            queryset = queryset.exclude(pk=request.user.pk)
        if queryset.exists():
            super().delete_queryset(request, queryset)


@admin.register(TriageRole)
class TriageRoleAdmin(admin.ModelAdmin):
    search_fields = ("name",)
    ordering = ("name",)


admin.site.site_header = "Suspicious Email Triage — user administration"
admin.site.site_title = "Triage admin"
admin.site.index_title = "Accounts and roles"
