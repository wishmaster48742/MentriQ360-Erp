FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DJANGO_SETTINGS_MODULE=config.settings.production

WORKDIR /app/backend

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt

COPY backend /app/backend

RUN addgroup --system django --gid 1001 && \
    adduser --system --uid 1001 --ingroup django django && \
    mkdir -p /app/data && \
    chown -R django:django /app/backend /app/data

USER django

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health/')" || exit 1

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4", "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-"]
