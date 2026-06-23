from .mongo_models import *  # noqa: F401, F403
from .mongo_compat import patch_mongoengine  # noqa: F401

patch_mongoengine()
