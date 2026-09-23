from accounts.services import touch_device


class DeviceActivityMiddleware:
    """Update "last seen" for the signed-in device (at most every few minutes)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated and request.session.session_key:
            touch_device(request)
        return self.get_response(request)
