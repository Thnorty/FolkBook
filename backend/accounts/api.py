from uuid import UUID

from django.core.exceptions import PermissionDenied
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from ninja import Router, Status
from ninja.pagination import PageNumberPagination, paginate
from ninja.utils import check_csrf

from accounts import services
from accounts.schemas import CsrfOut, CurrentUserOut, DeviceOut, LoginIn, PasswordIn
from core.api import ErrorOut

router = Router(tags=["auth"])


@router.get("/csrf", response=CsrfOut, auth=None)
def csrf(request):
    """Sets the `csrftoken` cookie. Send it back as the X-CSRFToken header on writes."""
    return {"csrf_token": get_token(request)}


@router.post("/login", response={200: CurrentUserOut, 401: ErrorOut, 429: ErrorOut}, auth=None)
def login(request, payload: LoginIn):
    # Logging in has no session yet, so check CSRF here (it stops login forgery).
    if check_csrf(request):
        raise PermissionDenied("CSRF check failed. Reload the page and try again.")
    try:
        return services.sign_in(request, payload.email, payload.password, payload.remember)
    except services.WrongCredentials:
        return Status(401, {"detail": "Wrong email or password."})
    except services.TooManyAttempts:
        return Status(429, {"detail": "Too many attempts. Try again in 15 minutes."})


@router.post("/logout", response={204: None})
def logout(request):
    services.sign_out(request)
    return Status(204, None)


@router.get("/me", response=CurrentUserOut)
def me(request):
    return request.auth


@router.post("/password", response={204: None})
def change_password(request, payload: PasswordIn):
    """Change your password. Signs you out on every other device."""
    services.change_password(request, payload.current_password, payload.new_password)
    return Status(204, None)


@router.get("/devices", response=list[DeviceOut])
@paginate(PageNumberPagination, page_size=50)
def list_devices(request):
    """Where you're signed in, most recently used first."""
    return services.active_devices(request.auth)


@router.delete("/devices/{uuid:device_id}", response={204: None})
def sign_out_device(request, device_id: UUID):
    services.sign_out_device(get_object_or_404(services.active_devices(request.auth), pk=device_id))
    return Status(204, None)


@router.post("/devices/sign-out-others", response={204: None})
def sign_out_other_devices(request):
    services.sign_out_other_devices(request.auth, keep=request.session.session_key)
    return Status(204, None)
