from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    CaptchaChallengeView,
    CurrentUserView,
    ERPTokenObtainPairView,
    EmailVerificationConfirmView,
    EmailVerificationSendView,
    LogoutView,
    PasswordChangeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    UserViewSet,
)

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")

urlpatterns = [
    path("captcha/", CaptchaChallengeView.as_view(), name="captcha-challenge"),
    path("token/", ERPTokenObtainPairView.as_view(), name="token-obtain-pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", CurrentUserView.as_view(), name="current-user"),
    path("change-password/", PasswordChangeView.as_view(), name="change-password"),
    path("password-reset/request/", PasswordResetRequestView.as_view(), name="password-reset-request"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
    path("email-verification/send/", EmailVerificationSendView.as_view(), name="email-verification-send"),
    path("email-verification/confirm/", EmailVerificationConfirmView.as_view(), name="email-verification-confirm"),
    path("", include(router.urls)),
]
