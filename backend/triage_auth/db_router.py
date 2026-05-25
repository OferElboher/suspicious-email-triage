"""
Route Django-internal models to SQLite; triage_auth reads/writes Node-owned PostgreSQL tables.

Without this split, `migrate` on the shared Postgres DB created Django `auth_user` / `auth_group`
tables alongside Node `auth_users` / `auth_roles`, and the admin UI showed duplicate sections.
"""


class TriageAuthRouter:
    """Send triage_auth ORM access to the `triage` database alias only."""

    app_label = "triage_auth"

    def db_for_read(self, model, **hints):
        if model._meta.app_label == self.app_label:
            return "triage"
        return None

    def db_for_write(self, model, **hints):
        if model._meta.app_label == self.app_label:
            return "triage"
        return None

    def allow_relation(self, obj1, obj2, **hints):
        labels = {obj1._meta.app_label, obj2._meta.app_label}
        if self.app_label in labels:
            return labels <= {self.app_label}
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        # Node owns auth_* tables in Postgres; never run Django migrations for triage_auth there.
        if app_label == self.app_label:
            return False
        # Django sessions/admin/contenttypes/auth live on the default SQLite DB only.
        if db == "triage":
            return False
        return db == "default"
