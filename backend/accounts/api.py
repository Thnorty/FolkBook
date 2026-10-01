from uuid import UUID

from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from ninja import Router, Status
from ninja.pagination import PageNumberPagination, paginate

from accounts import services
from accounts.models import User
from accounts.schemas import (
    CsrfOut,
    CurrentUserOut,
    DeviceOut,
    LoginIn,
    PasswordIn,
    ResetIn,
    ResetLinkIn,
    ResetLinkOut,
    ResetPreviewOut,
)
from core.api import ErrorOut, require_csrf

router = Router(tags=["auth"])


@router.get("/csrf", response=CsrfOut, auth=None)
def csrf(request):
    """Sets the `csrftoken` cookie. Send it back as the X-CSRFToken header on writes."""
    return {"csrf_token": get_token(request)}


@router.post("/login", response={200: CurrentUserOut, 401: ErrorOut, 429: ErrorOut}, auth=None)
def login(request, payload: LoginIn):
    require_csrf(request)  # stops login forgery
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


# ---------------------------------------------------------------- password reset links

UNUSABLE_RESET = {"detail": "This reset link has expired, was used already, or doesn't exist."}


@router.post("/password-resets", response={201: ResetLinkOut})
def create_reset_link(request, payload: ResetLinkIn):
    """Admins: a one-time link for someone who forgot their password. Shown once."""
    user = get_object_or_404(User, pk=payload.user_id)
    reset, token = services.create_reset_link(request.auth, user)
    return Status(
        201, {"path": f"/reset/{token}", "email": user.email, "expires_at": reset.expires_at}
    )


@router.get("/password-resets/{token}", response={200: ResetPreviewOut, 404: ErrorOut}, auth=None)
def preview_reset(request, token: str):
    """Whose password a reset link is for. Looking changes nothing."""
    try:
        reset = services.usable_reset(token)
    except services.ResetUnusable:
        return Status(404, UNUSABLE_RESET)
    return {"email": reset.user.email, "expires_at": reset.expires_at}


@router.post("/password-resets/{token}", response={204: None, 404: ErrorOut}, auth=None)
def reset_password(request, token: str, payload: ResetIn):
    """Choose a new password with a reset link. Signs out every device; log in after."""
    require_csrf(request)
    try:
        services.reset_password(token, payload.password)
    except services.ResetUnusable:
        return Status(404, UNUSABLE_RESET)
    return Status(204, None)
