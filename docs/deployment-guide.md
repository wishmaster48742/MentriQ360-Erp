# Deployment Guide

This guide prepares MentriQ360 for production deployment. Do not commit production secrets.

## Required Environments

Use separate environments for development, preview/staging, and production.

Backend:

- `DJANGO_SETTINGS_MODULE=config.settings.production`
- `DJANGO_SECRET_KEY`
- `DATABASE_URL`
- `REDIS_URL`
- `DJANGO_ALLOWED_HOSTS`
- `DJANGO_CORS_ALLOWED_ORIGINS`
- `DJANGO_CSRF_TRUSTED_ORIGINS`
- `CAMPUS_DATABASE_URLS` when using separate school databases
- `MENTRIQ_AI_API_KEY`
- Upload/file storage settings

Frontend:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_TENANT_DOMAIN_SUFFIX` when using tenant subdomains
- `NEXT_PUBLIC_DEFAULT_TENANT_CODE` only for single-school deployments

Provider credentials:

- Razorpay/payment gateway production keys are configured school-wise inside the protected ERP UI.
- Email/SMS/WhatsApp production credentials are configured school-wise inside the protected ERP UI.
- Secrets must never use `NEXT_PUBLIC_` names.

## Local Production Gate

Run from the repository root:

```powershell
npm install --package-lock=false
npm run lint
npm run build
npm run test
npm run migrate:check
```

Run backend production checks:

```powershell
$env:DJANGO_SETTINGS_MODULE='config.settings.production'
$env:DJANGO_USE_SQLITE='True'
$env:DJANGO_SECRET_KEY='replace-with-local-check-secret'
$env:DJANGO_ALLOWED_HOSTS='localhost,127.0.0.1'
$env:DJANGO_CORS_ALLOWED_ORIGINS='http://localhost:3000'
$env:DJANGO_CSRF_TRUSTED_ORIGINS='http://localhost:3000'
npm run check:deploy
```

## Database Deployment

1. Create the production PostgreSQL database.
2. Set `DATABASE_URL`.
3. Run migrations:

```powershell
Set-Location backend
python manage.py migrate --noinput
```

For separate school databases:

```dotenv
CAMPUS_DATABASE_URLS=DEMO360=postgres://<user>:<pass>@<host>:5432/mentriq360_demo;NORTH=postgres://<user>:<pass>@<host>:5432/mentriq360_north
```


Then run:

```powershell
python manage.py migrate_campus_databases
```

## Frontend Deployment on Vercel

The web app has `web/vercel.json` configured for Next.js.

Preview deployment:

```powershell
Set-Location web
vercel deploy
```

Production deployment:

```powershell
Set-Location web
vercel deploy --prod
```

Prebuilt production deployment:

```powershell
Set-Location web
vercel build --prod
vercel deploy --prebuilt --prod
```

CI requires:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

Use `vercel env add` for production variables and `vercel env pull .env.local --environment=production` for local validation. Never commit `.env.local`.

Set these in your hosting provider's environment:

```text
NEXT_PUBLIC_SITE_URL=https://app.your-domain.com
NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com/api/v1
```

## Backend Deployment

Deploy the Django backend to the selected provider with:

- Python 3.12.
- `backend/requirements.txt`.
- Command: `python manage.py migrate --noinput` before release.
- Start command appropriate to provider, for example Gunicorn/ASGI server.
- HTTPS enforced at load balancer or application.
- Health check: `/api/v1/health/`.

If using Vercel for backend functions, ensure `DATABASE_URL`, CORS, CSRF trusted origins, allowed hosts, and production settings are configured in Vercel environment variables.

## Cloudflare Setup

Use Cloudflare for DNS, SSL, WAF, and caching rules.

- Set DNS records for frontend and backend.
- Enforce HTTPS.
- Do not cache authenticated API responses.
- Bypass cache for `/api/*`.
- Enable WAF/rate limiting for auth and payment endpoints.
- Monitor origin health.

## Post-Deployment Checks

1. `/api/v1/health/` returns 200.
2. Login works for Super Admin.
3. Super Admin creates a school and School Admin.
4. School Admin can see only own school.
5. Account user can configure payment settings and create fees.
6. Payment webhook validates signature and amount.
7. Teacher can see only assigned classes.
8. Student can see only own data.
9. Upload/download works through protected APIs.
10. Reports export successfully.
11. Real-time events appear only in correct school/user/role.

## Rollback

Frontend on Vercel:

```powershell
vercel rollback
```

or promote a validated preview:

```powershell
vercel promote <deployment-url-or-id>
```

Backend:

- Keep previous deploy artifact available.
- Roll back application version first.
- Roll back database only if a migration is incompatible and a tested restore point exists.
- Never restore production payment data without reconciling gateway transactions.
