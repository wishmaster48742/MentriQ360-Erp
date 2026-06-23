from __future__ import annotations


class CampusTenantRouter:
    """
    All application data now lives in MongoDB via mongoengine.
    This router routes everything to the default SQLite database
    which is used only for Django internals (auth, sessions, admin).
    """

    def db_for_read(self, model, **hints):
        return "default"

    def db_for_write(self, model, **hints):
        return "default"

    def allow_relation(self, obj1, obj2, **hints):
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        return db == "default"
