from django.conf import settings


def get_mongodb_client():
    return settings.MONGODB_CLIENT


def get_mongodb():
    return settings.MONGODB_DATABASE


def get_collection(name: str):
    db = get_mongodb()
    if db is None:
        return None
    return db[name]
