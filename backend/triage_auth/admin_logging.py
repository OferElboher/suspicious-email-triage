"""Admin audit-log helpers for triage_auth ModelAdmin classes."""


class TriageAdminLoggingMixin:
    """
    Disable django.contrib.admin.models.LogEntry writes for triage_auth admins.

    LogEntry.user_id FK targets SQLite auth_user, but admins sign in as TriageUser rows
    in PostgreSQL — saving the audit row raises IntegrityError (FOREIGN KEY constraint failed).
    """

    def log_addition(self, request, obj, message):
        """Intentionally no-op: cross-database user FK is incompatible with LogEntry."""

    def log_change(self, request, obj, message):
        """Intentionally no-op: password/role updates must not touch SQLite auth_user."""

    def log_deletion(self, request, obj, message):
        """Intentionally no-op: deletions are tracked in Postgres, not django_admin_log."""

