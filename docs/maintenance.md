# Maintenance Guide

This guide covers day-two operations for MentriQ360.

## Monitoring

Configure monitoring for:

- Frontend availability.
- Backend API health.
- Database connectivity.
- Redis/cache connectivity.
- Payment webhook failures.
- Attendance device sync failures.
- Email/SMS/WhatsApp delivery failures.
- Background or scheduled task failures.
- Error rate and latency.

Health endpoint:

```text
GET /api/v1/health/
```

Protected status checks:

- Super Admin school database/tenant connection status.
- School Admin own school profile.
- Account payment gateway status.
- Attendance device status check.

## Error Monitoring

Recommended captured fields:

- request path
- request method
- user ID
- role
- schoolId/campusId
- status code
- exception type
- trace ID

Never log raw passwords, payment secrets, gateway secrets, SMS/WhatsApp tokens, or full file contents.

## Uptime Monitoring

Create checks for:

- Frontend route `/dashboard`.
- Backend route `/api/v1/health/`.
- API schema/docs route if exposed internally.
- Payment webhook endpoint with provider-side status alerts.

Alert on:

- repeated 5xx responses
- failed health check for more than 2 checks
- database connection failures
- Redis connection failures
- webhook verification failure spike

## Payment Failure Logs

Review daily:

- failed `PaymentTransaction` records
- failed webhook verification
- amount mismatch
- wrong school/payment gateway mismatch
- repeated order creation attempts
- pending payments older than provider SLA

Finance team should reconcile payment gateway settlement reports with ERP receipts.

## Attendance Device Sync Logs

Review:

- offline devices
- failed sync logs
- retrying logs
- device heartbeat age
- duplicate punches
- records without mapped student/staff user

School Admin should retry failed sync only after verifying the device belongs to the school.

## Database Health

Track:

- connection count
- slow queries
- index usage on `schoolId`, `userId`, `studentId`, `paymentId`, `attendanceDate`
- lock waits
- storage growth
- backup success

Run migrations only through release procedure.

## Admin Activity Logs

Review audit logs for:

- school creation, suspension, activation
- user creation/deactivation
- role changes
- payment setting changes
- communication setting changes
- result publication
- fee/salary payment changes
- file upload/download anomalies

## Maintenance Tasks

Daily:

- Check health dashboards.
- Review failed payments and failed communications.
- Review attendance device sync errors.
- Confirm backup completed.

Weekly:

- Review audit logs.
- Review inactive users.
- Review storage growth.
- Export finance exception report.

Monthly:

- Rotate provider credentials where policy requires.
- Test restore in staging.
- Review role access matrix with client admin.
- Archive old notices/logs according to retention policy.

