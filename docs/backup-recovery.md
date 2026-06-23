# Backup and Recovery

Backups must preserve tenant isolation, payment auditability, and file/download integrity.

## Backup Schedule

| Asset | Frequency | Retention |
| --- | --- | --- |
| Production database | Daily full, hourly incremental where supported | 30 days minimum |
| School-wise exports | Daily for active schools | 30 days minimum |
| Uploaded files | Daily incremental | 30 days minimum |
| Payment and webhook logs | Continuous or hourly | 90 days minimum |
| Audit logs and login history | Daily | 180 days minimum |
| Environment variable inventory | On every release | Latest plus previous release |

## Database Backup

PostgreSQL full backup:

```bash
pg_dump "$DATABASE_URL" --format=custom --file="mentriq360-$(date +%F).dump"
```

Restore to a clean database:

```bash
pg_restore --clean --if-exists --dbname="$RESTORE_DATABASE_URL" mentriq360-YYYY-MM-DD.dump
```

After restore:

```bash
python manage.py migrate --noinput
python manage.py check --deploy
```

## School-Wise Data Backup

For single-database mode, school-wise backup is an export filtered by `schoolId`/campus ID. Include:

- Campus/school profile and settings.
- Users and campus memberships.
- Students, staff, teachers, classes, sections, subjects, timetable.
- Attendance, exams, marks, results, notes, assignments, submissions.
- Fees, payments, invoices, receipts, salary records, finance events.
- Communication settings, templates, outbound messages.
- Device settings, sync logs, audit logs, AI logs.

For separate-database mode, run one backup per configured campus database in `CAMPUS_DATABASE_URLS`.

## File Backup

Back up the configured media/file storage:

- School logos and banners.
- Student and staff photos.
- Student/staff documents.
- Notes, assignments, submissions, result files.
- Receipts, invoices, salary slips, exported reports.

Use immutable backup storage where possible. Keep file metadata and database backup timestamps aligned.

## Payment Logs Backup

Back up:

- Payment records.
- Payment transactions.
- Gateway order IDs.
- Gateway payment IDs.
- Webhook verification status.
- Raw webhook payloads where retained.
- Receipt/invoice numbers.
- Finance real-time events.

Payment restore must be reconciled with Razorpay/provider dashboards before reopening online payment.

## Audit Logs Backup

Back up:

- `AuditEvent`
- login history
- security logs
- AI logs
- device sync logs
- payment failure logs

Audit logs should be append-only operational evidence. Avoid manual deletion except under approved retention policies.

## Recovery Process

1. Declare incident and freeze writes if data integrity is at risk.
2. Identify restore point and affected schools.
3. Restore database into a staging environment first.
4. Verify tenant isolation, login, payment state, and file links.
5. Restore files matching the selected database timestamp.
6. Run migrations and health checks.
7. Reconcile payment gateway transactions.
8. Promote restored environment or perform controlled production restore.
9. Record the incident in audit/maintenance notes.

## Recovery Verification

After any restore, test:

- Super Admin login.
- One School Admin login per restored school.
- Student list and one student profile.
- Payment receipt download.
- File download for one note/document.
- Audit log visibility.
- `/api/v1/health/`.

