"""
Monkey-patches mongoengine Document / QuerySet to expose Django-ORM-like
convenience methods so that existing views continue to work with minimal
changes.

Methods added:
  - ``Document.objects.create(**kwargs)``         – alias for ``Document(**kwargs).save()``
  - ``QuerySet.values(*fields)``                   – list of dicts (like Django ORM)
  - ``QuerySet.values_list(*fields, flat=False)``  – list of tuples / flat list
  - ``QuerySet.distinct()``                        – already exists (no-op patch for safety)
  - ``QuerySet.annotate(**kwargs)``                – no-op, returns self (ignores annotations)
  - ``QuerySet.aggregate(**kwargs)``               – thin wrapper around mongoengine sum / count
  - ``QuerySet.update_or_create(defaults=None, **kwargs)``
  - ``QuerySet.get_or_create(defaults=None, **kwargs)``
  - ``get_object_or_404(klass, *args, **kwargs)``  – re-exported for convenience

Call ``patch_mongoengine()`` once at startup (e.g. in AppConfig.ready()).
"""

from functools import wraps

from django.http import Http404
from mongoengine import DoesNotExist, MultipleObjectsReturned
from mongoengine.queryset import Q as MongoQ
from mongoengine.queryset import QuerySet


# ─── Q / F compatibility aliases ───────────────────────────────────────

class Q(MongoQ):
    """Drop-in replacement for ``django.db.models.Q``.

    Supports ``|`` (OR) and ``&`` (AND) operators.  Negation (``~``) is
    **not** supported – use ``exclude()`` instead.
    """
    pass


class F:
    """Naive placeholder for ``django.db.models.F``.

    Only supports simple field-reference comparisons.
    """
    def __init__(self, name):
        self.name = name

    def __eq__(self, other):
        return {self.name: other}


# ─── aggregation expression wrappers ───────────────────────────────────

class Sum:
    def __init__(self, expression, **kwargs):
        self.expression = expression
        self.name = expression

class Count:
    def __init__(self, expression, **kwargs):
        self.expression = expression
        self.name = expression

class Avg:
    def __init__(self, expression, **kwargs):
        self.expression = expression
        self.name = expression

class Min:
    def __init__(self, expression, **kwargs):
        self.expression = expression
        self.name = expression

class Max:
    def __init__(self, expression, **kwargs):
        self.expression = expression
        self.name = expression


# ─── helpers ─────────────────────────────────────────────────────────────

def _queryset_method(method):
    """Decorator that attaches *method* to ``mongoengine.queryset.QuerySet``."""
    setattr(QuerySet, method.__name__, method)
    return method


# ─── patches ─────────────────────────────────────────────────────────────

def _resolve_refs(kwargs):
    """Convert Django/mongoengine model instances to their PKs automatically."""
    from mongoengine import Document as MongoDocument

    resolved = {}
    for k, v in kwargs.items():
        if hasattr(v, "_meta") and hasattr(v, "pk"):
            resolved[k] = str(v.pk)
        elif isinstance(v, dict):
            resolved[k] = {kk: _ref_val(vv) for kk, vv in v.items()}
        elif isinstance(v, (list, tuple)):
            resolved[k] = [_ref_val(x) for x in v]
        else:
            resolved[k] = v
    return resolved


def _ref_val(v):
    if hasattr(v, "_meta") and hasattr(v, "pk"):
        return str(v.pk)
    return v


def _resolve_field_names(doc_cls, kwargs):
    """Map common field aliases (e.g. ``campus`` → ``campus_id``) when the target
    document has the ``_id`` variant but not the plain name."""
    for key in list(kwargs.keys()):
        if key not in doc_cls._fields and f"{key}_id" in doc_cls._fields:
            kwargs[f"{key}_id"] = kwargs.pop(key)
    return kwargs


@_queryset_method
def create(queryset, **kwargs):
    """Django-ORM-like ``Model.objects.create(**kwargs)``.

    Constructs a document and saves it immediately, returning the instance.
    """
    doc_cls = queryset._document
    resolved = _resolve_refs(kwargs)
    resolved = _resolve_field_names(doc_cls, resolved)
    doc = doc_cls(**resolved)
    doc.save()
    return doc


@_queryset_method
def values(queryset, *fields):
    """Return a list of dicts containing only the requested fields.

    Unlike Django ORM this always returns a list (not a ValuesQuerySet).
    """
    if not fields:
        return [doc.to_mongo().to_dict() for doc in queryset]
    return [{f: getattr(doc, f, None) for f in fields} for doc in queryset.only(*fields)]


@_queryset_method
def values_list(queryset, *fields, flat=False):
    """Return a list of tuples (or flat list when *flat=True* with one field)."""
    docs = queryset.only(*fields) if fields else queryset
    if flat and len(fields) == 1:
        return [getattr(doc, fields[0], None) for doc in docs]
    if fields:
        return [tuple(getattr(doc, f, None) for f in fields) for doc in docs]
    return [tuple(doc.to_mongo().to_dict().values()) for doc in docs]


@_queryset_method
def annotate(queryset, **kwargs):
    """No-op: mongoengine doesn't support annotation in the Django ORM sense.

    Returns the queryset unchanged.
    """
    return queryset


@_queryset_method
def aggregate(queryset, **kwargs):
    """Basic aggregation support.

    Supports ``Sum('field')``, ``Count('field')``, ``Avg('field')``,
    ``Min('field')``, ``Max('field')`` patterns as used in the codebase.
    """

    result = {}
    for alias, expression in kwargs.items():
        field_name = None
        aggregate_cls = None

        if isinstance(expression, (Sum, Count, Avg, Min, Max)):
            field_name = expression.name
            aggregate_cls = type(expression)
        else:
            # Also accept django.db.models aggregation expressions
            name = getattr(expression, "name", None)
            if name is not None:
                field_name = name
                cls_name = type(expression).__name__
                aggregate_cls = {"Sum": Sum, "Count": Count, "Avg": Avg, "Min": Min, "Max": Max}.get(cls_name)
            if not aggregate_cls:
                result[alias] = None
                continue

        docs = list(queryset)
        values_list = [getattr(d, field_name, 0) or 0 for d in docs]
        if not values_list:
            result[alias] = 0
            continue

        if aggregate_cls is Sum:
            result[alias] = sum(values_list)
        elif aggregate_cls is Count:
            result[alias] = len(values_list)
        elif aggregate_cls is Avg:
            result[alias] = sum(values_list) / len(values_list)
        elif aggregate_cls is Min:
            result[alias] = min(values_list)
        elif aggregate_cls is Max:
            result[alias] = max(values_list)
        else:
            result[alias] = None

    return result


@_queryset_method
def update_or_create(queryset, defaults=None, **kwargs):
    """Django-ORM-like ``update_or_create(defaults=None, **kwargs)``.

    Returns ``(instance, created)`` tuple.
    """
    doc_cls = queryset._document
    defaults = _resolve_refs(defaults or {})
    defaults = _resolve_field_names(doc_cls, defaults)
    kwargs = _resolve_refs(kwargs)
    kwargs = _resolve_field_names(doc_cls, kwargs)
    try:
        doc = queryset.get(**kwargs)
        for key, value in defaults.items():
            setattr(doc, key, value)
        doc.save()
        return doc, False
    except DoesNotExist:
        kwargs.update(defaults)
        doc = doc_cls(**kwargs)
        doc.save()
        return doc, True


@_queryset_method
def get_or_create(queryset, defaults=None, **kwargs):
    """Django-ORM-like ``get_or_create(defaults=None, **kwargs)``.

    Returns ``(instance, created)`` tuple.
    """
    return update_or_create(queryset, defaults=defaults, **kwargs)


@_queryset_method
def in_bulk(queryset, id_list=None, field_name="id"):
    """Django-ORM-like ``in_bulk(id_list=None, field_name='pk')``.

    Returns a dict mapping field values to document instances.
    """
    if id_list is not None:
        ids_param = f"{field_name}__in"
        docs = queryset.filter(**{ids_param: id_list})
    else:
        docs = queryset
    return {str(getattr(d, field_name)): d for d in docs}


# ─── top-level helpers ───────────────────────────────────────────────────

def get_object_or_404(klass, *args, **kwargs):
    """Django-ORM-like ``get_object_or_404`` that works with mongoengine Documents.

    Accepts either a Document class or a QuerySet/QuerySetManager as *klass*.
    """
    if hasattr(klass, "objects"):
        queryset = klass.objects
    else:
        queryset = klass
    name = getattr(klass, "__name__", getattr(queryset, "_document", klass).__name__)
    try:
        return queryset.get(*args, **kwargs)
    except DoesNotExist:
        raise Http404(f"No {name} matches the given query.")
    except MultipleObjectsReturned:
        raise Http404(f"Multiple {name} matches the given query.")


# ─── Lazy queryset wrapper ───────────────────────────────────────────────

class lazy_qs:
    """Wraps a mongoengine Document class so that ``lazy_qs(Model)`` behaves
    like ``Model.objects.all()`` but defers the MongoDB connection until the
    queryset is actually accessed (iterated, counted, filtered, …).

    Usage in ViewSet class definitions::

        class CampusViewSet(RoleScopedModelViewSet):
            queryset = lazy_qs(Campus)

    instead of::

        class CampusViewSet(RoleScopedModelViewSet):
            queryset = Campus.objects.all()
    """

    def __init__(self, document_class):
        self._document_class = document_class
        self._qs = None

    def _resolve(self):
        if self._qs is None:
            self._qs = self._document_class.objects.all()
        return self._qs

    def __getattr__(self, name):
        if name in ("_document_class", "_qs", "model"):
            raise AttributeError(name)
        if name == "model":
            return self._document_class
        return getattr(self._resolve(), name)

    def __iter__(self):
        return iter(self._resolve())

    def __len__(self):
        return len(self._resolve())

    def __bool__(self):
        return bool(self._resolve())

    def __repr__(self):
        return repr(self._resolve())

    def __copy__(self):
        return lazy_qs(self._document_class)

    def __deepcopy__(self, memo):
        return lazy_qs(self._document_class)

    @property
    def model(self):
        return self._document_class


# ─── init ─────────────────────────────────────────────────────────────────

def patch_mongoengine():
    """Apply all patches. Safe to call multiple times."""
    from apps.core.mongo_models import _MODEL_REGISTRY
    # Register the Django User model for user_id references
    from apps.accounts.models import User
    _MODEL_REGISTRY["User"] = User
    _MODEL_REGISTRY["user"] = User
