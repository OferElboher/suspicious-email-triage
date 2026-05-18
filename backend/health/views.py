"""Django health-check views for lightweight service availability checks."""

from django.http import JsonResponse


# health: returns a tiny JSON payload so callers can verify the Django app boots.
def health(request):
    # request is accepted for Django's view signature; no request fields are needed.
    return JsonResponse({"status": "ok"})
