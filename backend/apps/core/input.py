from __future__ import annotations

import os
import re
import enum
from typing import Any

from django.core.exceptions import ValidationError
from rest_framework.filters import BaseFilterBackend, OrderingFilter, SearchFilter

# ─── MongoDB operator injection prevention ───────────────────────────────
_MONGO_OPERATOR_PATTERN = re.compile(r"^\$[a-zA-Z0-9_]+")


def strip_mongo_operators(value: Any) -> str:
    """
    If *value* is a dict containing MongoDB operators (keys starting with
    ``$``), return the string value of the ``$eq`` key if present, or raise
    a ``ValidationError``.

    If *value* is a plain string it is returned unchanged.
    """
    if isinstance(value, dict):
        if all(_MONGO_OPERATOR_PATTERN.match(k) for k in value):
            eq = value.get("$eq")
            if eq is not None:
                return str(eq)
            raise ValidationError("MongoDB operators are not allowed in filter parameters.")
        raise ValidationError("Unexpected filter object format.")
    return str(value)


def sanitize_search_query(value: str) -> str:
    """
    Strip characters commonly used in MongoDB injection from search strings:
    ``$``, ``{``, ``}``, ``(``, ``)``.
    """
    return re.sub(r"[${}()]", "", value)


# ─── Enum validation ─────────────────────────────────────────────────────
def validate_enum_value(value: Any, enum_class: type[enum.Enum]) -> str:
    """
    Validate that *value* is a member of *enum_class*.  Returns the
    canonical string value.
    """
    cleaned = strip_mongo_operators(value)
    valid = {e.value for e in enum_class}
    if cleaned not in valid:
        raise ValidationError(f"Value must be one of: {', '.join(sorted(valid))}")
    return cleaned


# ─── File / filename sanitization ────────────────────────────────────────
_DANGEROUS_FILENAME_PATTERN = re.compile(r"[^\w\.\- ]")
_PATH_TRAVERSAL_PATTERN = re.compile(r"(\.\./|\.\.\\)")


def sanitize_filename(filename: str, default: str = "download") -> str:
    """
    Strip path-traversal sequences, null bytes, and dangerous characters
    from a filename.
    """
    safe = (filename or default).replace("\x00", "")
    safe = _PATH_TRAVERSAL_PATTERN.sub("", safe)
    safe = _DANGEROUS_FILENAME_PATTERN.sub("_", safe)
    return safe or default


# ─── Magic-byte file signature verification ──────────────────────────────
_FILE_SIGNATURES: dict[str, list[tuple[bytes, int]]] = {
    "image/jpeg": [(b"\xff\xd8\xff", 0)],
    "image/png": [(b"\x89PNG\r\n\x1a\n", 0)],
    "image/gif": [(b"GIF87a", 0), (b"GIF89a", 0)],
    "image/webp": [(b"RIFF", 0), (b"WEBP", 8)],
    "image/svg+xml": [(b"<svg", 0), (b"<?xml", 0)],
    "application/pdf": [(b"%PDF", 0)],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [(b"PK\x03\x04", 0)],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [(b"PK\x03\x04", 0)],
    "text/csv": [],
    "application/octet-stream": [],
}

# Commonly used ``allowed_types`` sets
IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}
DOCUMENT_TYPES = {"application/pdf", "image/jpeg", "image/png"}
ACADEMIC_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "text/csv",
}


def validate_file_signature(upload, allowed_types: set[str]) -> None:
    """
    Check that the uploaded file's magic bytes match its declared
    ``Content-Type``.  Raises ``ValidationError`` on mismatch.

    Skips validation for types not in ``_FILE_SIGNATURES``.
    """
    ct = upload.content_type
    if ct not in allowed_types:
        raise ValidationError({"file": f"Unsupported file type: {ct}."})

    if ct not in _FILE_SIGNATURES or not _FILE_SIGNATURES[ct]:
        return

    raw = upload.read(64)
    upload.seek(0)

    for signature, offset in _FILE_SIGNATURES[ct]:
        start = offset
        end = offset + len(signature)
        if raw[start:end] == signature:
            return

    raise ValidationError({"file": f"File content does not match declared type ({ct})."})


# ─── Template variable sanitization ──────────────────────────────────────
_TEMPLATE_VARIABLE_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def sanitize_template_variables(variables: dict) -> dict:
    """
    Remove variable keys that contain dangerous characters or look like
    injection attempts.
    """
    cleaned: dict[str, str] = {}
    for key, raw_value in variables.items():
        key_str = str(key)
        if not _TEMPLATE_VARIABLE_PATTERN.match(key_str):
            continue
        value_str = str(raw_value)
        value_str = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", value_str)
        cleaned[key_str] = value_str
    return cleaned


# ─── Safe DRF filter backends ────────────────────────────────────────────


class SafeMongoFilterBackend(BaseFilterBackend):
    """Mongoengine-compatible replacement for ``DjangoFilterBackend``.

    The stock ``django_filters`` backend builds a ``FilterSet`` from
    ``queryset.model`` and Django ORM field metadata, which mongoengine
    querysets don't provide (``'QuerySet' object has no attribute 'model'``),
    so every viewset declaring ``filterset_fields`` raised a 500.

    This backend reads the view's ``filterset_fields`` and applies simple
    exact-match filters for any matching query parameters using mongoengine's
    own ``QuerySet.filter``. MongoDB operator-injection is stripped via
    ``strip_mongo_operators``. When no recognised params are present the
    queryset is returned unchanged, so plain list/detail loads never break.
    """

    def filter_queryset(self, request, queryset, view):
        fields = getattr(view, "filterset_fields", None)
        if not fields:
            return queryset

        field_names = list(fields.keys()) if isinstance(fields, dict) else list(fields)
        document = getattr(queryset, "_document", None)
        doc_fields = getattr(document, "_fields", {}) if document is not None else {}

        lookups: dict[str, str] = {}
        for field in field_names:
            if field not in request.query_params:
                continue
            try:
                value = strip_mongo_operators(request.query_params.get(field))
            except ValidationError:
                continue
            # Map e.g. ``campus`` → ``campus_id`` when the document stores the id variant.
            key = field
            if doc_fields and field not in doc_fields and f"{field}_id" in doc_fields:
                key = f"{field}_id"
            lookups[key] = value

        if not lookups:
            return queryset
        try:
            return queryset.filter(**lookups)
        except Exception:
            # Never turn a bad filter param into a 500 — fall back to unfiltered.
            return queryset


class SafeSearchFilter(SearchFilter):
    """
    DRF ``SearchFilter`` that strips MongoDB operator syntax from the
    ``?search=`` query parameter before passing it to the queryset.
    """

    def get_search_terms(self, request):
        terms = super().get_search_terms(request)
        return [sanitize_search_query(t) for t in terms]


class SafeOrderingFilter(OrderingFilter):
    """
    DRF ``OrderingFilter`` that rejects ordering parameters containing
    MongoDB operators or special characters.
    """

    _VALID_ORDERING_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")

    def get_ordering(self, request, queryset, view):
        ordering = super().get_ordering(request, queryset, view)
        if ordering is None:
            return ordering
        cleaned: list[str] = []
        for param in ordering:
            raw = param.lstrip("-")
            if not self._VALID_ORDERING_PATTERN.match(raw):
                continue
            if param.startswith("-"):
                cleaned.append(f"-{raw}")
            else:
                cleaned.append(raw)
        return cleaned or None


# ─── Webhook payload sanitization ────────────────────────────────────────
_SENSITIVE_WEBHOOK_KEYS = {"secret", "key", "token", "password", "signature"}


def sanitize_webhook_payload(payload: dict) -> dict:
    """
    Return a copy of *payload* with known sensitive fields masked and
    deeply nested dicts flattened to a single level.
    """
    safe: dict[str, Any] = {}
    for k, v in payload.items():
        key_lower = str(k).lower()
        if any(s in key_lower for s in _SENSITIVE_WEBHOOK_KEYS):
            safe[str(k)] = "***masked***"
        elif isinstance(v, (dict, list)):
            safe[str(k)] = str(v)[:1000]
        else:
            safe[str(k)] = str(v)[:2000]
    return safe
