from uuid import UUID

from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from ninja import Router, Status
from ninja.pagination import PageNumberPagination, paginate

from access.policy import visible_api_keys, visible_spaces
from api_keys import services
from api_keys.schemas import ApiKeyIn, ApiKeyOut, CreatedApiKeyOut
from core.api import access_for

router = Router(tags=["api keys"])


@router.get("", response=list[ApiKeyOut])
@paginate(PageNumberPagination, page_size=50)
def list_api_keys(request):
    """Your API keys, newest first. The keys themselves are never sent again."""
    access = access_for(request)
    spaces = Prefetch("spaces", queryset=visible_spaces(access))
    return visible_api_keys(access).prefetch_related(spaces).order_by("-created_at")


@router.post("", response={201: CreatedApiKeyOut})
def create_api_key(request, payload: ApiKeyIn):
    """A new key. The response has the key itself: the only time it's sent."""
    api_key, key = services.create_api_key(access_for(request), payload)
    api_key.key = key
    return Status(201, api_key)


@router.delete("/{uuid:key_id}", response={204: None})
def revoke_api_key(request, key_id: UUID):
    access = access_for(request)
    services.revoke_api_key(access, get_object_or_404(visible_api_keys(access), pk=key_id))
    return Status(204, None)
