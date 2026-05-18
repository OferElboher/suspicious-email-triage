"""URL routes for the small Django health app."""

from django.urls import path

# health view: answers GET /health-style requests with {"status": "ok"}.
from .views import health

# urlpatterns: Django's route table for this app.
urlpatterns = [
    # Root of this app maps to the health view.
    path("", health),
]
