# Mentriq360 Security Baseline

## Authentication

- API authentication uses JWT access and refresh tokens through `djangorestframework-simplejwt`.
- Refresh tokens rotate and are blacklisted after rotation.
- Password validation uses Django's built-in validators.
- Migrations seed a permanent Super Admin from `MENTRIQ_SUPER_ADMIN_USERNAME` and `MENTRIQ_SUPER_ADMIN_PASSWORD`.
- Super Admin accounts cannot be disabled, demoted, or deleted through the API or Django admin.

## Authorization

Backend role checks are enforced with `RoleAccessPermission`.

Roles:

- `super_admin`: platform owner and full control
- `school_admin`: assigned-campus operations, academic setup, fees, reports, users
- `account`: assigned-campus fee, payment, transaction, and salary workflows
- `teacher`: assigned section attendance and student visibility
- `student`: read-only access to the linked student record

The frontend hides unrelated screens, but the backend remains the authority for access control.

## Data Scoping

- Teachers can view students only for sections where they are assigned as class teacher.
- Teachers can bulk mark attendance only for their assigned section.
- Campus admins can read and write records only for campuses assigned through `CampusMembership`.
- Students can view only their linked student profile and academic records.
- When `X-Campus-Code` is supplied, tenant middleware routes the request to that campus database alias.

## Validation

- A class section's academic session must belong to the same campus.
- A student's section must belong to the same campus as the student.
- Attendance section must match the student's current section.
- Student attendance accepts only present, absent, and on-duty.
- Attendance can be edited only for today and the previous 3 days.
- Fee amounts and payment amounts must be greater than zero.
- Payments cannot exceed the outstanding fee amount.
- Staff, timetable, library, transport, and hostel records validate campus consistency before save.

## Audit Logging

`AuditEvent` records:

- successful logins
- create, update, and delete actions from ERP viewsets
- bulk attendance updates

Audit records include actor, action, entity type, entity ID, summary, IP address, metadata, and timestamp.

## Production Settings

Production settings enable:

- secure cookies
- HTTPS redirect
- HSTS
- content type sniffing protection
- clickjacking protection
- CORS allowlist

Secrets must be stored in `.env` or deployment secret storage, not committed to the repository.
