from ninja import File, Router, UploadedFile

from core.api import access_for
from imports import services
from imports.schemas import PreviewOut

router = Router(tags=["import"])


@router.post("/preview", response=PreviewOut)
def preview_import(request, file: File[UploadedFile]):
    """The contacts in a .vcf, each with who they may already be in your book.
    Nothing is stored."""
    return services.preview(access_for(request), file)
