# MentriQ360 Client Handover

This package is the final client-ready handover for MentriQ360 School ERP. It covers how to operate the system, seed a removable demo school, verify security, deploy safely, and maintain the platform after launch.

## Handover Files

| File | Purpose |
| --- | --- |
| [README.md](../README.md) | Project overview, local run commands, verification commands, and documentation index. |
| [.env.example](../.env.example) | Production-safe environment variable template. Secrets are placeholders only. |
| [User Manual](user-manual.md) | Role-wise operating guide for Super Admin, School Admin, Account, Teacher, and Student users. |
| [Demo Data Guide](demo-data.md) | Demo school seed/remove commands, demo accounts, and included sample records. |
| [Permission Matrix](permission-matrix.md) | Role-wise view/create/update/delete/download/manage access table. |
| [Deployment Guide](deployment-guide.md) | Backend, frontend, database, Vercel/Cloudflare, environment, SSL, and rollback process. |
| [API Documentation](api.md) | API groups, authentication, tenant isolation, and protected route behavior. |
| [Database Schema](database-schema.md) | Main models, relationships, indexes, and tenant isolation notes. |
| [Security Baseline](security.md) | RBAC, school isolation, secrets, file protection, payments, audit logs, and rate limits. |
| [Backup and Recovery](backup-recovery.md) | Database, school-wise, file, payment log, and audit log backup/restore process. |
| [Maintenance Guide](maintenance.md) | Error monitoring, uptime checks, health checks, logs, payment failures, and device sync logs. |
| [Production Readiness](production-readiness.md) | Final environment, storage, deployment gate, and security audit checklist. |
| [Test Report](test-report.md) | Final QA commands, coverage, and latest verification status. |
| [Known Limitations](known-limitations.md) | Items requiring production provider credentials or operational decisions. |

## Client Onboarding Flow

1. Super Admin logs in and opens the Super Admin panel.
2. Super Admin creates a school, uploads logo/banner, and creates the School Admin user.
3. Super Admin or School Admin verifies the school status is active and subscription is valid.
4. School Admin configures payment gateway settings for that school only.
5. School Admin configures Email, SMS, and WhatsApp settings for that school only.
6. School Admin adds classes, sections, subjects, teachers, staff, and students.
7. Account user creates fee structures, assigns fees, and verifies online/offline payment flow.
8. Teacher marks attendance, uploads notes, creates assignments, and uploads marks.
9. School Admin approves/publishes notices and results.
10. Student logs in to view profile, attendance, fees, notes, assignments, results, notices, receipts, and parent view.

## Final Acceptance Checklist

Use this checklist before client sign-off.

| Check | Status |
| --- | --- |
| All role dashboards load: Super Admin, School Admin, Account, Teacher, Student | Pending client environment verification |
| All visible buttons route to working actions or validated API calls | Pending client environment verification |
| No dummy buttons or fake production routes remain | Verified by code scan |
| Demo data is clearly marked and removable | Verified with `seed_demo_school --remove` |
| School-wise payment gateway settings are isolated | Covered by backend regression tests |
| No cross-school data access is allowed | Covered by backend regression tests |
| Real-time events are scoped by school/user/role | Covered by backend regression tests |
| File upload/download APIs validate file type, size, and access | Covered by backend regression tests |
| Reports export as PDF/Excel/CSV where implemented | Covered by backend regression tests |
| Mobile and tablet responsive layouts build successfully | Covered by production build; visual client QA still required |
| Super Admin cannot be deleted or disabled by other users | Covered by backend regression tests |
| Production documentation is complete | Complete |

## Production Sign-Off Inputs

The implementation is ready for handover after the client provides or confirms:

- Production database URL and optional school-specific tenant database URLs.
- Production backend domain and frontend domain.
- Razorpay production keys for each school that will accept online payment.
- Email SMTP, SMS API, WhatsApp API, and sender approvals.
- AI provider key and approved model.
- File storage location and retention policy.
- Backup destination and restore owner.
- Monitoring destination for errors, uptime, logs, and security alerts.

