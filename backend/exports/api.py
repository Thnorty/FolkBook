from uuid import UUID

from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.http import content_disposition_header
from ninja import Router

from access.policy import visible_spaces
from core.api import access_for
from exports import services
from exports.schemas import ExportSummary

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
