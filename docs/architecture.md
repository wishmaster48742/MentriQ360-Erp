# Mentriq360 Production Architecture

## System Overview

```text
Next.js responsive web app
  -> Django REST API
  -> PostgreSQL or SQLite
  -> Redis for cache and async expansion
```

The backend owns business rules, role checks, relational integrity, and campus database routing. The frontend owns the device-responsive user experience for Super Admin, School Admin, Account, Teacher, and Student users.

## Role Model

- `super_admin`: full platform control
- `school_admin`: school setup, users, students, fees, payments, reports
- `account`: assigned-school fee, payment, transaction, and salary workflows
- `teacher`: assigned section attendance and student reads
- `student`: own profile, attendance, fees, assignments, results, resources, and admit cards

## Core Data Flow

```text
User logs in
  -> role returned in JWT response
  -> app shell selects workspace
  -> admin creates campus/session/section/student
  -> teacher marks attendance
  -> school admin or account user assigns fee and records payment
  -> reports update from source tables
  -> student sees own scoped data
```

## Multi-Tenant Databases

Campus isolation is enabled by `CAMPUS_DATABASE_URLS`. Each `CAMPUS_CODE=database_url` entry creates a Django database alias such as `campus_m360_main`. Requests that include `X-Campus-Code` are routed through `CampusTenantMiddleware` and `CampusTenantRouter` so ERP reads and writes use that campus database. Without a campus code, the default database is used for central operation.

Tenant selection can come from `X-Campus-Code`, the `campus_code` query parameter, or an optional subdomain suffix configured with `DJANGO_TENANT_DOMAIN_SUFFIX` and `NEXT_PUBLIC_TENANT_DOMAIN_SUFFIX`. For example, `north.schools.example.com` resolves to campus code `NORTH` when the suffix is `schools.example.com`. Shared-database deployments should leave these suffix/default tenant settings blank.

## Backend Modules

- `apps.accounts`: custom user model, role enum, JWT serializer, current user, admin user API
- `apps.core`: academic setup, students, attendance, fees, payments, staff profiles, timetable, library, transport, hostel, reports, audit events
- `config.settings`: split local and production settings

## Frontend Modules

- `AppShell`: login gate and role-aware navigation
- `AdminDashboard`: campuses, sessions, sections, users, and students
- `AttendancePanel`: teacher attendance entry
- `FeesPaymentsDashboard`: fee assignment and payment collection
- `SchoolOperationsPanel`: staff profiles, timetable, library, transport, and hostel operations
- `StudentDashboard`: student read-only view
- `ReportsDashboard`: analytics and audit trail

## Database Entities

- `User`
- `Campus`
- `AcademicSession`
- `ClassSection`
- `Student`
- `AttendanceRecord`
- `StaffProfile`
- `TimetableSlot`
- `LibraryBook`
- `LibraryLoan`
- `TransportRoute`
- `TransportVehicle`
- `StudentTransportAssignment`
- `HostelRoom`
- `HostelAllocation`
- `FeeAssignment`
- `Payment`
- `AuditEvent`

## Security Boundaries

- JWT authentication is required by default.
- API querysets are role-scoped.
- Teachers cannot mark attendance outside assigned sections.
- Students cannot read unlinked student data.
- Audit endpoints are admin-only.
- Production settings enable secure cookies, HSTS, HTTPS redirect, and CORS allowlists.

## Deployment Shape

The repository includes Dockerfiles and `docker-compose.yml` for:

- PostgreSQL
- Redis
- Django API
- Next.js web app

For production, run the web app behind HTTPS and run the Django API with `config.settings.production`.
