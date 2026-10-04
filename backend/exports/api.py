from django.http import FileResponse
from django.utils import timezone
from ninja import Router

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
