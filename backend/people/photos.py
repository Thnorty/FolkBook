"""Profile photos: every upload becomes the same 4:5 polaroid, re-encoded as WebP.

Re-encoding also drops everything but the pixels: EXIF data such as where the photo
was taken never gets stored.
"""

from io import BytesIO

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import UploadedFile
from PIL import Image, ImageOps, UnidentifiedImageError

FULL_SIZE = (800, 1000)
THUMBNAIL_SIZE = (240, 300)
MAX_BYTES = 15 * 1024 * 1024
PAPER = (255, 252, 246)  # what shows through transparent parts


def prepare(upload: UploadedFile) -> tuple[ContentFile, ContentFile]:
    """The full-size photo and its thumbnail, cropped to 4:5 around the center."""
    if upload.size > MAX_BYTES:
        raise ValidationError({"file": "Photos can be up to 15 MB."})
    try:
        image = Image.open(upload)
        image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValidationError(
            {"file": "That file isn't a photo we can read. Try a JPEG, PNG or WebP."}
        ) from None

    image = _flatten(ImageOps.exif_transpose(image))
    full = ImageOps.fit(image, FULL_SIZE, Image.Resampling.LANCZOS)
    thumbnail = full.resize(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
    return _webp(full), _webp(thumbnail)


def _flatten(image: Image.Image) -> Image.Image:
    if image.mode in ("RGBA", "LA", "P"):
        rgba = image.convert("RGBA")
        background = Image.new("RGB", image.size, PAPER)
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    return image.convert("RGB")


def _webp(image: Image.Image) -> ContentFile:
    buffer = BytesIO()
    image.save(buffer, "WEBP", quality=85)
    return ContentFile(buffer.getvalue())
