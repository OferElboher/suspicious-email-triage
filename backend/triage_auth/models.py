"""Unmanaged models mirroring Node-owned PostgreSQL auth tables."""

from django.db import models


class TriageRole(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=64, unique=True)
    description = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "auth_roles"
        verbose_name = "Role"
        verbose_name_plural = "Roles"

    def __str__(self):
        return self.name


class TriageUser(models.Model):
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
        managed = False  # Node API owns DDL for auth_users; Django only reads/writes rows.
        db_table = "auth_users"
        verbose_name = "User"
        verbose_name_plural = "Users"

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    @property
    def is_anonymous(self):
        return False

    @property
    def is_authenticated(self):
        return True

    @property
    def is_staff(self):
        return self.roles.filter(name="admin").exists()

    @property
    def is_superuser(self):
        return self.is_staff

    def has_perm(self, perm, obj=None):
        return self.is_staff

    def has_module_perms(self, app_label):
        return self.is_staff

    def get_username(self):
        return self.email

    def __str__(self):
        return self.email


class TriageUserRole(models.Model):
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

    class Meta:
        managed = False
        db_table = "auth_user_roles"
        unique_together = (("user", "role"),)
        verbose_name = "User role assignment"
        verbose_name_plural = "User role assignments"

    def __str__(self):
        return f"{self.user.email} → {self.role.name}"
