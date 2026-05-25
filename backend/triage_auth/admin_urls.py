"""URL routing for the django-admin container (admin UI only)."""

from django.contrib import admin
from django.urls import path

urlpatterns = [
    path("admin/", admin.site.urls),
]
