"""AppConfig hooks: admin branding, hide duplicate auth models, disable last_login update."""


from django.apps import AppConfig


class TriageAuthConfig(AppConfig):
    """Register triage_auth and configure Django admin site behavior."""

    default_auto_field = "django.db.models.AutoField"
    name = "triage_auth"
    verbose_name = "Triage accounts"

    def ready(self):
        """Run once at startup: URLs back to triage app, fix login side-effects, hide contrib.auth."""
        from django.conf import settings
        from django.contrib import admin
        from django.contrib.auth.models import Group, User, update_last_login
        from django.contrib.auth.signals import user_logged_in

        admin.site.site_url = getattr(settings, "TRIAGE_APP_PUBLIC_URL", "/")

        # Node auth_users has no last_login column; Django's default hook would crash login.
        user_logged_in.disconnect(update_last_login, dispatch_uid="update_last_login")

        # Hide unused Django contrib.auth models — user CRUD uses TriageUser in this app only.
        for model in (User, Group):
            try:
                admin.site.unregister(model)
            except admin.sites.NotRegistered:
                pass
