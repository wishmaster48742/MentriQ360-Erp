# Deployment Guide — Vercel (Frontend) + Render (Backend)

## Architecture Overview

```
GitHub repo
  ├── /web      → Vercel  (Next.js frontend)
  └── /backend  → Render  (Django + gunicorn)
                      ↕
             MongoDB Atlas (cloud database)
```

---

## Part 1: Deploy Backend on Render

### Step 1 — Push to GitHub

Ensure your full monorepo (including `web/` and `backend/`) is pushed to GitHub.

### Step 2 — Create a Web Service on Render

1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect your GitHub repository
3. Configure the service:

| Field | Value |
|---|---|
| **Root Directory** | `backend` |
| **Runtime** | Python 3 |
| **Build Command** | `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate` |
| **Start Command** | `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 4 --timeout 120` |

### Step 3 — Set Environment Variables on Render

In Render → your service → **Environment**, add each variable:

```
DJANGO_SETTINGS_MODULE=config.settings.production
DJANGO_SECRET_KEY=<generate: python -c "import secrets; print(secrets.token_urlsafe(64))">
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=<your-app>.onrender.com
DJANGO_CORS_ALLOWED_ORIGINS=https://<your-vercel-app>.vercel.app
DJANGO_CSRF_TRUSTED_ORIGINS=https://<your-app>.onrender.com
DJANGO_USE_X_FORWARDED_HOST=True
DJANGO_SECURE_SSL_REDIRECT=False

MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.7lohzqi.mongodb.net/
MONGODB_DATABASE=Mentriq-ERP

MENTRIQ_SUPER_ADMIN_USERNAME=super.admin
MENTRIQ_SUPER_ADMIN_EMAIL=admin@mentriq360.in
MENTRIQ_SUPER_ADMIN_PASSWORD=<your-admin-password>

DJANGO_LOG_LEVEL=INFO
DJANGO_PAGE_SIZE=50
DJANGO_MAX_PAGE_SIZE=200
DJANGO_ACCESS_TOKEN_MINUTES=30
DJANGO_REFRESH_TOKEN_DAYS=7
DJANGO_MEDIA_ROOT=/tmp/media
```

> **Why `DJANGO_SECURE_SSL_REDIRECT=False`:** Render terminates TLS at its load balancer before traffic reaches Django. If Django also redirects to HTTPS, it causes an infinite redirect loop.

> **Why `DJANGO_USE_X_FORWARDED_HOST=True`:** Render proxies requests, so Django must trust the forwarded host header to construct correct absolute URLs.

### Step 4 — Note your backend URL

After a successful deploy, your backend will be at:
```
https://<your-app>.onrender.com
```

---

## Part 2: Deploy Frontend on Vercel

### Step 1 — Import project on Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project** → import your GitHub repo
2. Set **Root Directory** to `web`
3. Framework will auto-detect as **Next.js**
4. The `web/vercel.json` already has the correct build config — no changes needed

### Step 2 — Set Environment Variables on Vercel

In Vercel → your project → **Settings** → **Environment Variables**, add:

```
NEXT_PUBLIC_API_BASE_URL=https://<your-render-app>.onrender.com/api/v1
NEXT_PUBLIC_SITE_URL=https://<your-vercel-app>.vercel.app
NEXT_PUBLIC_DEFAULT_TENANT_CODE=
NEXT_PUBLIC_SESSION_IDLE_MINUTES=30
NEXT_PUBLIC_SESSION_VALIDATE_SECONDS=300
NEXT_PUBLIC_TENANT_DOMAIN_SUFFIX=
```

> `NEXT_PUBLIC_API_BASE_URL` is the most critical variable — it tells the frontend where to send API requests.

### Step 3 — Deploy

Click **Deploy**. Vercel runs `pnpm install --frozen-lockfile && pnpm build` automatically.

---

## Part 3: MongoDB Atlas — Allow Render IPs

Render uses dynamic outbound IPs by default.

In **MongoDB Atlas** → **Network Access**:

- **Simple approach:** Add `0.0.0.0/0` (allow all IPs)
- **Secure approach:** Upgrade to Render's paid plan to get a static outbound IP, then whitelist only that IP in Atlas

---

## Part 4: .env Changes for Production

Your local `.env` has dev values. These must be different in production (set them in Render/Vercel dashboards, never commit `.env`):

| Variable | Local (dev) | Production |
|---|---|---|
| `DJANGO_DEBUG` | `True` | `False` |
| `DJANGO_ALLOWED_HOSTS` | `*` | `<your-app>.onrender.com` |
| `DJANGO_CORS_ALLOWED_ORIGINS` | `*` | `https://<your-vercel-app>.vercel.app` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `http://localhost:3000` | `https://<your-render-app>.onrender.com` |
| `DJANGO_USE_X_FORWARDED_HOST` | `False` | `True` |
| `DJANGO_SECURE_SSL_REDIRECT` | _(not set)_ | `False` |
| `DJANGO_SECRET_KEY` | current value | generate a new 64-byte secret |

### Generate a new secret key

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

---

## Part 5: After First Deploy — Verify

```bash
# Check backend health
curl https://<your-render-app>.onrender.com/api/v1/health/

# Check CORS headers (replace with your Vercel domain)
curl -H "Origin: https://<your-vercel-app>.vercel.app" \
     -I https://<your-render-app>.onrender.com/api/v1/health/
```

If the health check passes and CORS headers include your Vercel domain, the deployment is complete.

---

## Notes

- **Cold starts on Render free tier:** Free Render services spin down after 15 minutes of inactivity. The first request after idle takes ~30s. Upgrade to a paid instance type to avoid this.
- **File uploads:** `DJANGO_MEDIA_ROOT=/tmp/media` works on Render but files are lost on redeploy. For persistent uploads, use an S3-compatible storage bucket and configure `django-storages`.
- **The `.env` file is for local development only.** All production secrets live in the Render and Vercel dashboards.
