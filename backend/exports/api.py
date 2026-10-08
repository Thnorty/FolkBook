from uuid import UUID

from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.http import content_disposition_header
from ninja import File, Form, Router, UploadedFile
from ninja.security import django_auth

from access.policy import visible_people, visible_spaces
from core.api import access_for
from exports import restore, services
from exports.schemas import ExportSummary, RestoreSummary

router = Router(tags=["export"])


@router.get("/summary", response=ExportSummary)
def export_summary(request):
    """How many people and photos a full export holds, and roughly how big it is."""
    return services.summary(access_for(request))


@router.get(
    "/everything",
    openapi_extra={
        "responses": {
            200: {
                "description": "A .zip: folkbook.json (see ExportFile) and photos/",
                "content": {"application/zip": {}},
            }
        }
    },
)
def export_everything(request):
    """Everything in your book, private notes included, as one .zip."""
    out = services.export_zip(access_for(request))
    name = f"folkbook-{timezone.localdate():%Y-%m-%d}.zip"
    return FileResponse(out, as_attachment=True, filename=name, content_type="application/zip")


@router.get(
    "/people/{uuid:person_id}",
    openapi_extra={
        "responses": {
            200: {
                "description": "A .zip like the full export, of one person",
                "content": {"application/zip": {}},
            }
        }
    },
)
def export_person(request, person_id: UUID):
    """A copy of one person to keep (before tearing them out): them, everything you wrote
    about them, and your links to them. Not a book to restore."""
    access = access_for(request)
    person = get_object_or_404(visible_people(access), pk=person_id)
    out = services.export_zip(access, person)
    name = f"FolkBook - {person.name} - {timezone.localdate():%Y-%m-%d}.zip"
    return FileResponse(out, as_attachment=True, filename=name, content_type="application/zip")


@router.get(
    "/contacts",
    openapi_extra={
        "responses": {
            200: {"description": "vCards (3.0), one per person", "content": {"text/vcard": {}}}
        }
    },
)
def export_contacts(request, space: UUID | None = None):
    """Your people as a .vcf for your phone or another app: name, phone, email,
    birthday. `space` narrows it to one space."""
    access = access_for(request)
    chosen = get_object_or_404(visible_spaces(access), pk=space) if space else None
    response = HttpResponse(
        services.contacts_vcf(access, chosen), content_type="text/vcard; charset=utf-8"
    )
    name = f"FolkBook contacts{f' - {chosen.name}' if chosen else ''}.vcf"
    response["Content-Disposition"] = content_disposition_header(True, name)
    return response


@router.post("/restore/check", response=RestoreSummary, auth=django_auth)
def check_restore(request, file: File[UploadedFile]):
    """What a full export (.zip) holds, and whether it can be restored. Changes nothing."""
    return restore.check(access_for(request), file)


@router.post("/restore", response=RestoreSummary, auth=django_auth)
def restore_everything(request, file: File[UploadedFile], confirm_email: Form[str]):
    """Replace everything in your book with a full export (.zip). Only while nothing in
    your book is shared; `confirm_email` must be your account's email."""
    return restore.restore(access_for(request), file, confirm_email)
