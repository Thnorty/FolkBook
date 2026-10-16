from ninja import Router

from mail import services
from mail.schemas import MailSettingsOut, MailStatusOut, MailTestIn, MailTestOut, SmtpIn

router = Router(tags=["mail"])


@router.get("/status", response=MailStatusOut, auth=None)
def status(request):
    """Whether this server can send email (the log-in page asks before offering reset emails)."""
    return {"ready": services.email_ready()}


@router.get("", response=MailSettingsOut)
def get_settings(request):
    """The server's SMTP settings (admins). Never the password."""
    return services.mail_settings(request.auth)


@router.put("", response=MailSettingsOut)
def save_settings(request, payload: SmtpIn):
    """Save the SMTP settings. Leave `password` out to keep the saved one; "" removes it."""
    services.save_settings(request.auth, payload)
    return services.mail_settings(request.auth)


@router.delete("", response=MailSettingsOut)
def remove_settings(request):
    services.remove_settings(request.auth)
    return services.mail_settings(request.auth)


@router.post("/test", response=MailTestOut)
def send_test(request, payload: MailTestIn):
    """Send a short email to yourself, through the form's settings or the ones in use."""
    return services.send_test(request.auth, payload.smtp)
