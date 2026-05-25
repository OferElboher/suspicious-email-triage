"""Authenticate Django admin sessions against auth_users (bcrypt, same as Node API)."""

import bcrypt
from django.contrib.auth.backends import BaseBackend

from .models import TriageUser


class TriageAuthBackend(BaseBackend):
    """Map Django admin login to Node-owned rows; no Django auth_user table involved."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        email = (username or kwargs.get("email") or "").strip().lower()
        if not email or not password:
            return None
        try:
            user = TriageUser.objects.get(email__iexact=email, is_active=True)
        except TriageUser.DoesNotExist:
            return None
        try:
            ok = bcrypt.checkpw(password.encode("utf-8"), user.password_hash.encode("utf-8"))
        except ValueError:
            return None
        if not ok:
            return None
        if not user.is_staff:
            return None
        return user

    def get_user(self, user_id):
        try:
            user = TriageUser.objects.get(pk=user_id, is_active=True)
        except TriageUser.DoesNotExist:
            return None
        if not user.is_staff:
            return None
        return user
