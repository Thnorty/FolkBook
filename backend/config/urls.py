from django.contrib import admin
from django.urls import path, re_path

from config.api import api
from core.api import not_found

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", api.urls),
    re_path(r"^api/", not_found),
]
