from __future__ import annotations

import logging

from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger("mentriq.error")


def custom_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)

    if response is not None:
        return response

    logger.exception("Unhandled exception in %s", context.get("view", "unknown"))

    detail = "An internal server error occurred. Please contact support if the issue persists."

    if hasattr(exc, "detail"):
        detail = str(exc.detail)
    elif hasattr(exc, "message"):
        detail = str(exc.message)

    return Response(
        {"detail": detail, "error_type": type(exc).__name__},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
