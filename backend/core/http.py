from django.http import HttpRequest


def client_ip(request: HttpRequest) -> str | None:
    """The browser's IP address.

    Only Caddy can reach the backend, and it sets X-Forwarded-For, so its first
    entry is the real client. Without it (tests, runserver) use the socket address.
    """
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return forwarded.split(",")[0].strip() or request.META.get("REMOTE_ADDR") or None
