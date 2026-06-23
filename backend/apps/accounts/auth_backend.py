from django.contrib.auth.backends import BaseBackend
from django.contrib.auth import get_user_model


class MongoDBAuthBackend(BaseBackend):
    """Django ORM-based auth backend using the SQLite User model.

    Kept for compatibility with the existing AUTHENTICATION_BACKENDS
    setting in ``base.py``.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        User = get_user_model()
        if username is None:
            username = kwargs.get("username")
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return None
        if not user.is_active:
            return None
        if not user.check_password(str(password)):
            return None
        return user

    def get_user(self, user_id):
        User = get_user_model()
        try:
            return User.objects.get(pk=user_id)
        except Exception:
            return None
