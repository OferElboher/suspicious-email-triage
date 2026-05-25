from django.apps import AppConfig


class TriageAuthConfig(AppConfig):
    default_auto_field = "django.db.models.AutoField"
    name = "triage_auth"
    verbose_name = "Triage accounts"

    def ready(self):
        from django.conf import settings
        from django.contrib import admin
        from django.contrib.auth.models import update_last_login
        from django.contrib.auth.signals import user_logged_in

        admin.site.site_url = getattr(settings, "TRIAGE_APP_PUBLIC_URL", "/")

        # Node-owned auth_users has no last_login column; skip Django's default hook.
        user_logged_in.disconnect(update_last_login, dispatch_uid="update_last_login")
