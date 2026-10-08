from uuid import UUID

from django.shortcuts import get_object_or_404
from ninja import File, Router, UploadedFile
from ninja.pagination import PageNumberPagination, paginate

from access.policy import visible_imports
from core.api import access_for
from imports import services
from imports.models import Import
from imports.schemas import ChoicesIn, ImportOut, PreviewOut, RecentImportOut

router = Router(tags=["import"])


@router.post("/preview", response=PreviewOut)
def preview_import(request, file: File[UploadedFile]):
    """The contacts in a .vcf, each with who they may already be in your book.
    Nothing is stored."""
    return services.preview(access_for(request), file)


@router.post("", response=ImportOut)
def run_import(request, choices: ChoicesIn, file: File[UploadedFile]):
    """Import a .vcf: the same file as the preview, plus `choices` (a JSON form field):
    who to add, who to merge into the person they matched, and a space for the new
    people."""
    return services.run_import(access_for(request), file, choices)


@router.get("", response=list[RecentImportOut])
@paginate(PageNumberPagination, page_size=50)
def list_imports(request):
    """Your imports, newest first."""
    return visible_imports(access_for(request)).order_by("-created_at")


@router.get("/{uuid:import_id}", response=RecentImportOut)
def get_import(request, import_id: UUID):
    return _import(request, import_id)


def _import(request, import_id: UUID) -> Import:
    return get_object_or_404(visible_imports(access_for(request)), pk=import_id)
