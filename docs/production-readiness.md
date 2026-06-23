# Production Readiness

This ERP is designed as a responsive web application backed by a Django REST API. The codebase includes the application hooks needed for production operation, but 50 lakh+ user support depends on the deployment architecture around it.

## Web App

- The frontend is responsive across mobile, tablet, and desktop screens.
- `web/public/manifest.json` makes the app installable as a standalone browser app.
- Global loading and error boundaries prevent blank screens during route failures.
- The API client enforces request timeouts and returns consistent network, session, and rate-limit errors.
- Idle sessions expire on the client using `NEXT_PUBLIC_SESSION_IDLE_MINUTES`.
- Active sessions are periodically revalidated using `NEXT_PUBLIC_SESSION_VALIDATE_SECONDS`.

## API Traffic Control

DRF throttling is enabled globally and should use Redis in production so limits are shared across all API instances.

Recommended production variables:

```env
DJANGO_CACHE_URL=redis://redis:6379/1
DJANGO_THROTTLE_ANON_RATE=30/minute
DJANGO_THROTTLE_AUTH_RATE=10/minute
DJANGO_THROTTLE_USER_RATE=300/minute
DJANGO_THROTTLE_HARDWARE_CAPTURE_RATE=1200/minute
DJANGO_THROTTLE_PAYMENT_RATE=120/minute
DJANGO_PAGE_SIZE=50
DJANGO_MAX_PAGE_SIZE=200
```

Scale these rates per institution, load balancer policy, and device volume. Keep login throttles conservative.

## Production Environment

Do not commit production secrets. Set these in the hosting provider secret store or `.env.production.local` only:

```env
DJANGO_SETTINGS_MODULE=config.settings.production
DJANGO_SECRET_KEY=<rotated-64-byte-secret>
DATABASE_URL=postgres://<username>:<password>@<host>:5432/mentriq360
POSTGRES_SSLMODE=require
POSTGRES_CONN_MAX_AGE=60
DJANGO_ALLOWED_HOSTS=api.mentriq360.example.com,.vercel.app
DJANGO_CORS_ALLOWED_ORIGINS=https://app.mentriq360.example.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://app.mentriq360.example.com
DJANGO_USE_X_FORWARDED_HOST=True
DJANGO_CACHE_URL=redis://<username>:<password>@<redis-host>:6379/1
NEXT_PUBLIC_SITE_URL=https://app.mentriq360.example.com
NEXT_PUBLIC_API_BASE_URL=https://api.mentriq360.example.com/api/v1
NEXT_PUBLIC_TENANT_DOMAIN_SUFFIX=schools.mentriq360.example.com
```

School-wise payment gateway and communication secrets are configured inside the protected ERP UI:

- Payment Gateway Config stores Razorpay key secret and webhook secret encrypted at rest.
- Communication Setting stores SMTP/SMS/WhatsApp API keys and SMTP passwords encrypted at rest.
- AI provider keys stay server-side in `MENTRIQ_AI_API_KEY`; never use a `NEXT_PUBLIC_` key for AI secrets.

For optional separate school databases, set:

```env
CAMPUS_DATABASE_URLS=M360-MAIN=postgres://<user>:<pass>@<host>:5432/main;M360-NORTH=postgres://<user>:<pass>@<host>:5432/north
```

Then run:

```powershell
Set-Location backend
python manage.py migrate
python manage.py migrate_campus_databases
```

## Storage and Uploads

Uploaded logos, banners, and profile photos are validated and optimized before storage. Production upload limits are controlled by:

```env
MENTRIQ_UPLOAD_LOGO_MAX_BYTES=524288
MENTRIQ_UPLOAD_BANNER_MAX_BYTES=1048576
MENTRIQ_UPLOAD_PHOTO_MAX_BYTES=2097152
MENTRIQ_UPLOAD_DOCUMENT_MAX_BYTES=5242880
MENTRIQ_UPLOAD_ACADEMIC_MAX_BYTES=10485760
```

For production, use persistent protected storage for `backend/media` or move protected files to a private object-storage bucket behind signed/protected download APIs. Do not serve student documents from public unrestricted URLs.

## Deployment Gate

Run the Phase 7 gate before promoting a preview deployment:

```powershell
npm install --package-lock=false
npm run lint
npm run build
npm run test
Set-Location backend
python manage.py makemigrations --check --dry-run
python manage.py check --deploy
```

The repository also includes `.github/workflows/production-qa.yml` to run backend checks/tests and frontend lint/type/build in CI.

## Deployment Notes

- Deploy the frontend from `web/` with `NEXT_PUBLIC_API_BASE_URL` set to your backend URL.
- Deploy the backend from `backend/` using `config.settings.production` and a managed database.
- Use Cloudflare or another edge/WAF layer for SSL, custom domains, DDoS protection, and request-rate policies.
- Do not give preview deployments production database credentials unless the preview is a controlled staging environment.
- Run database migrations before production promotion, then promote the already-verified preview artifact.

## Final Security Audit

Verify before launch:

- Super Admin accounts cannot be deleted, disabled, or modified by another user.
- `schoolId` tampering is blocked by role and tenant filters.
- Payment gateway secrets and communication secrets are not exposed in API responses.
- Payment webhooks validate school, order ID, amount, and signature.
- File downloads require authenticated scoped API access.
- Student access is limited to that student; teacher access is limited to assigned classes/subjects.
- Audit logs are generated for auth, finance, upload, AI, communication, device sync, and school status actions.
- Redis-backed throttling is enabled for login, payment, hardware, and general API traffic.

## Hardware Attendance Contract

Attendance devices are registered in Campus Control. Each active device can post captures to:

```http
POST /api/v1/attendance-devices/{device_id}/capture/
Authorization: Bearer <admin-or-device-token>
Content-Type: application/json
```

Student capture payload:

```json
{
  "person_type": "student",
  "external_id": "ADM-2026-001",
  "captured_at": "2026-05-21T08:15:00+05:30",
  "status": "present",
  "source_reference": "device-event-987654",
  "confidence_score": "98.50"
}
```

Staff capture payload:

```json
{
  "person_type": "staff",
  "external_id": "teacher",
  "captured_at": "2026-05-21T08:12:00+05:30",
  "status": "present",
  "source_reference": "staff-event-123456",
  "confidence_score": "97.20"
}
```

The API validates device campus, supported person type, editable attendance date, and allowed attendance statuses.

## 50 Lakh+ User Deployment Notes

Use a horizontally scaled deployment:

- CDN and edge caching for static Next.js assets.
- Multiple Next.js app instances behind a load balancer.
- Multiple Django API instances behind a load balancer.
- Redis for shared throttling, cache, and future queues.
- PostgreSQL with connection pooling, read replicas, backups, and partitioning for high-volume attendance/audit tables.
- Dedicated ingestion path for hardware traffic if device volume grows beyond standard API traffic.
- Centralized logs, metrics, tracing, uptime checks, and alerting.

The local development environment is not intended to simulate 50 lakh+ production traffic.
