# Mentriq360 ERP Runbook

## 1. Prerequisites

- Python 3.12+
- Node.js 20+
- `pnpm` 10+
- PostgreSQL 15+ for production-style local runs
- Redis 7+ for cache and future async jobs

## 2. Backend Setup

PowerShell from the repository root:

```powershell
Copy-Item .env.example .env
python -m venv .backend-venv
.\.backend-venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

For fast local execution without PostgreSQL:

```powershell
$env:DJANGO_USE_SQLITE='True'
Set-Location backend
..\.backend-venv\Scripts\python.exe manage.py migrate
..\.backend-venv\Scripts\python.exe manage.py createsuperuser
..\.backend-venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```

For PostgreSQL and Redis:

```powershell
docker compose up postgres redis
```

Then run migrations and start Django with the same commands without `DJANGO_USE_SQLITE=True`.

## 3. Frontend Setup

```powershell
Set-Location web
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## 4. Authorized Account Setup

Create the first Super Admin through Django's protected management command:

```powershell
Set-Location backend
..\.backend-venv\Scripts\python.exe manage.py createsuperuser
```

After the Super Admin signs in, create School Admin, Account, Teacher, and Student users from the admin workspace. Do not commit or publish real user names, temporary passwords, or imported credential files.

## 5. Module Execution Order

1. Login with an authorized Super Admin or School Admin user.
2. Create campus and academic session records.
3. Create sections and assign class teachers.
4. Add students and guardian contact details.
5. Login as teacher and mark attendance.
6. Login as admin and assign fees or record payments.
7. Login as student and verify profile, attendance, fees, and receipts.
8. Login as admin and review reports and audit events.

## Campus Database Operation

Set `CAMPUS_DATABASE_URLS` in `.env` when campuses must use separate databases:

```dotenv
CAMPUS_DATABASE_URLS=M360-MAIN=postgres://<user>:<pass>@<host>:5432/mentriq360_main;M360-NORTH=postgres://<user>:<pass>@<host>:5432/mentriq360_north
```

Then run:

```powershell
Set-Location backend
..\.backend-venv\Scripts\python.exe manage.py migrate_campus_databases
```

The login form uses the default database and does not ask users for a campus code. Campus database routing is handled by the stored tenant campus context and the `X-Campus-Code` API header.

## 6. Verification

Backend:

```powershell
Set-Location backend
$env:DJANGO_USE_SQLITE='True'
$env:DJANGO_ALLOWED_HOSTS='testserver,localhost,127.0.0.1'
..\.backend-venv\Scripts\python.exe manage.py check
..\.backend-venv\Scripts\python.exe manage.py test
```

Frontend:

```powershell
Set-Location web
pnpm lint
pnpm build
```

## 7. Deployment Checklist

- Set a strong `DJANGO_SECRET_KEY`.
- Set `DJANGO_DEBUG=False`.
- Use PostgreSQL, not SQLite.
- Set production `DJANGO_ALLOWED_HOSTS`.
- Set production `DJANGO_CORS_ALLOWED_ORIGINS`.
- Set frontend `NEXT_PUBLIC_API_BASE_URL` to the deployed Django API URL, for example `https://api.your-domain.com/api/v1`.
- Serve the frontend over HTTPS.
- Use `config.settings.production`.
- Run `python manage.py migrate`.
- Create the first Super Admin with `python manage.py createsuperuser`.
