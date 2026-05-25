"""
Unmanaged ORM models mirroring Node-owned PostgreSQL auth tables.

Node DDL uses composite primary keys on junction tables (no surrogate ``id`` column).
Django defaults assume an ``id`` AutoField — ``CompositePrimaryKey`` matches the real schema.
"""

from django.db import models


class TriageRole(models.Model):
    """Application role (admin, analyst, …) stored in ``auth_roles``."""

    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=64, unique=True)
    description = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "auth_roles"
        verbose_name = "Role"
        verbose_name_plural = "Roles"

    def __str__(self):
        """Human-readable label for admin dropdowns."""
        return self.name


class TriagePermission(models.Model):
    """Permission code (``reviews.read``, …) seeded by the Node API in ``auth_permissions``."""

    id = models.AutoField(primary_key=True)
    code = models.CharField(max_length=128, unique=True)
    description = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "auth_permissions"
        verbose_name = "Permission"
        verbose_name_plural = "Permissions"

    def __str__(self):
        return self.code


class TriageRolePermission(models.Model):
    """Maps roles to permissions; composite PK ``(role_id, permission_id)`` — no ``id`` column."""

    role = models.ForeignKey(
        TriageRole,
        on_delete=models.CASCADE,
        db_column="role_id",
        related_name="role_permissions",
    )
    permission = models.ForeignKey(
        TriagePermission,
        on_delete=models.CASCADE,
        db_column="permission_id",
        related_name="permission_roles",
    )
    # Match Node DDL: PRIMARY KEY (role_id, permission_id) without a surrogate id.
    pk = models.CompositePrimaryKey("role", "permission")

    class Meta:
        managed = False
        db_table = "auth_role_permissions"
        verbose_name = "Role permission"
        verbose_name_plural = "Role permissions"

    def __str__(self):
        return f"{self.role.name} → {self.permission.code}"


class TriageUser(models.Model):
    """Sign-in account row in ``auth_users`` (bcrypt hash, no ``last_login`` column)."""

    id = models.AutoField(primary_key=True)
    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    roles = models.ManyToManyField(
        TriageRole,
        through="TriageUserRole",
        related_name="users",
        blank=True,
    )

    class Meta:
        managed = False
        db_table = "auth_users"
        verbose_name = "User"
        verbose_name_plural = "Users"

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    @property
    def is_anonymous(self):
        """Django auth protocol: admin sessions always have a concrete user."""
        return False

    @property
    def is_authenticated(self):
        """Django auth protocol: user was loaded from the database."""
        return True

    @property
    def is_staff(self):
        """Only ``admin`` role may use Django admin (see TriageAuthBackend)."""
        return self.roles.filter(name="admin").exists()

    @property
    def is_superuser(self):
        """Admin UI treats staff admins as superusers for module access."""
        return self.is_staff

    def has_perm(self, perm, obj=None):
        """Grant all admin modules when user has admin role."""
        return self.is_staff

    def has_module_perms(self, app_label):
        """Grant all admin modules when user has admin role."""
        return self.is_staff

    def get_username(self):
        """Return email because USERNAME_FIELD is email."""
        return self.email

    def __str__(self):
        return self.email


class TriageUserRole(models.Model):
    """Assigns roles to users; composite PK ``(user_id, role_id)`` — no ``id`` column."""

    user = models.ForeignKey(
        TriageUser,
        on_delete=models.CASCADE,
        db_column="user_id",
        related_name="user_roles",
    )
    role = models.ForeignKey(
        TriageRole,
        on_delete=models.CASCADE,
        db_column="role_id",
        related_name="role_users",
    )
    # Without this, Django SELECTs auth_user_roles.id and crashes (Node table has no id).
    pk = models.CompositePrimaryKey("user", "role")

    class Meta:
        managed = False
        db_table = "auth_user_roles"
        verbose_name = "User role assignment"
        verbose_name_plural = "User role assignments"

    def __str__(self):
        return f"{self.user.email} → {self.role.name}"


class TriagePasswordResetToken(models.Model):
    """Forgot-password tokens (hashed); managed by Node API, view-only in admin."""

    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(
        TriageUser,
        on_delete=models.CASCADE,
        db_column="user_id",
        related_name="password_reset_tokens",
    )
    token_hash = models.CharField(max_length=255)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = "auth_password_reset_tokens"
        verbose_name = "Password reset token"
        verbose_name_plural = "Password reset tokens"

    def __str__(self):
        return f"Reset token for {self.user.email}"
