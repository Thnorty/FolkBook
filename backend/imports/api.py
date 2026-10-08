from ninja import File, Router, UploadedFile

from core.api import access_for
from imports import services
from imports.schemas import ChoicesIn, ImportOut, PreviewOut

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
