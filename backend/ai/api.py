from ninja import Router

from ai import services
from ai.schemas import AiCheckIn, AiModelsOut, AiProviderIn, AiSettingsOut, AiTestOut

router = Router(tags=["ai"])


@router.get("", response=AiSettingsOut)
def get_ai(request):
    """Your own AI, the server's, and which one Quick capture uses. Never a key."""
    return services.ai_settings(request.auth)


@router.put("/mine", response=AiSettingsOut)
def save_mine(request, payload: AiProviderIn):
    """Your own AI. Leave `key` out to keep the stored one; "" removes it."""
    services.save_provider(request.auth, payload, server=False)
    return services.ai_settings(request.auth)


@router.delete("/mine", response=AiSettingsOut)
def remove_mine(request):
    services.remove_provider(request.auth, server=False)
    return services.ai_settings(request.auth)


@router.put("/server", response=AiSettingsOut)
def save_server(request, payload: AiProviderIn):
    """The server's AI, for everyone without their own (admins only)."""
    services.save_provider(request.auth, payload, server=True)
    return services.ai_settings(request.auth)


@router.delete("/server", response=AiSettingsOut)
def remove_server(request):
    services.remove_provider(request.auth, server=True)
    return services.ai_settings(request.auth)


@router.post("/models", response=AiModelsOut)
def fetch_models(request, payload: AiCheckIn):
    """The models the AI offers. Only their ids: never what the server sent back."""
    return services.fetch_models(services.target_for_check(request.auth, payload))


@router.post("/test", response=AiTestOut)
def test_connection(request, payload: AiCheckIn):
    """Ask the AI one word. A plain result, never what the server sent back."""
    return services.test_connection(services.target_for_check(request.auth, payload))
