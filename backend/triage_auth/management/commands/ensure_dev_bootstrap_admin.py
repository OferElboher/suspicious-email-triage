/**
 * Django management command — ensure bootstrap admin exists for dev Django admin login.
 *
 * Problem: postgres-data volume persists password hashes across rebuilds, but bootstrap only
 * runs when auth_users is empty. This command mirrors Node resetBootstrapAdminForDev so
 * http://localhost:8000/admin/ accepts AUTH_BOOTSTRAP_* credentials after every django-admin start.
 *
 * Technology: bcrypt (same as Node bcryptjs), PostgreSQL via Django ORM unmanaged models.
 */
import os

import bcrypt
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from triage_auth.models import TriageRole, TriageUser, TriageUserRole


class Command(BaseCommand):
    """Create or reset bootstrap admin when ENVIRONMENT=dev."""

    help = "Ensure AUTH_BOOTSTRAP_ADMIN_* user exists with admin role (dev Django admin login)."

    def handle(self, *args, **options):
        """Run idempotent bootstrap sync — safe on every container start."""
        if os.getenv("ENVIRONMENT", "dev") != "dev":
            self.stdout.write("Skipping — ensure_dev_bootstrap_admin runs in dev only.")
            return

        email = os.getenv("AUTH_BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
        password = os.getenv("AUTH_BOOTSTRAP_ADMIN_PASSWORD", "temp-admin-pswd")
        if not email or email.endswith("@local.test"):
            self.stdout.write(
                self.style.WARNING(
                    "Bootstrap email not configured — run: bash scripts/configure-dev-bootstrap-admin.sh YOUR_EMAIL@example.com"
                )
            )
            return

        admin_role, _ = TriageRole.objects.using("triage").get_or_create(
            name="admin",
            defaults={"description": "admin role"},
        )

        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        now = timezone.now()

        with transaction.atomic(using="triage"):
            user, created = TriageUser.objects.using("triage").get_or_create(
                email=email,
                defaults={
                    "password_hash": password_hash,
                    "is_active": True,
                    "created_at": now,
                    "updated_at": now,
                },
            )
            if not created:
                user.password_hash = password_hash
                user.is_active = True
                user.updated_at = now
                user.save(using="triage", update_fields=["password_hash", "is_active", "updated_at"])

            TriageUserRole.objects.using("triage").get_or_create(user=user, role=admin_role)

        action = "created" if created else "password synced"
        self.stdout.write(self.style.SUCCESS(f"Bootstrap admin {action}: {email}"))
