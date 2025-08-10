from django.contrib import admin
from django.urls import path, re_path
from django.views.generic import TemplateView, RedirectView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("game/", TemplateView.as_view(template_name="game/index.html"), name="game"),
    path("", RedirectView.as_view(pattern_name="game", permanent=False)),
]