from django.apps import AppConfig


class TriageAuthConfig(AppConfig):
    default_auto_field = "django.db.models.AutoField"
    name = "triage_auth"
    verbose_name = "Triage accounts"

    def ready(self):
        from django.conf import settings
        from django.contrib import admin

        admin.site.site_url = getattr(settings, "TRIAGE_APP_PUBLIC_URL", "/")
