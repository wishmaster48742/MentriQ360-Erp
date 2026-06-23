# Phase 10 Commercial Ecosystem

Phase 10 extends MentriQ360 from an enterprise SaaS ERP into a commercial school management ecosystem. All records remain tenant-scoped through `schoolId`/`campus` filtering, and Super Admin is the only role with platform-wide access.

## Modules Added

- Admission management: public admission forms, dynamic schemas, document uploads, fee status, tracking codes, review pipeline, dashboard totals, and admit-to-student conversion.
- Transport management: driver profiles, vehicle attendance, GPS-ready trip logs, and student-visible transport foundations using existing route, vehicle, and allocation records.
- Library management: digital library resources, protected downloads, and book request approval workflow on top of the existing book catalog and issue/return models.
- Inventory and assets: school-scoped assets for computers, lab equipment, furniture, smart boards, projectors, allocation metadata, depreciation fields, and maintenance logs.
- School website integration: school-scoped news, notice, gallery, event, admission, and contact content exposed through a public website API.
- Mobile backend: role-aware mobile bootstrap endpoint for Android/iOS clients with school branding, enabled modules, AI features, and recent notifications.
- Push notifications: Firebase-ready device and notification logs for mobile/browser events such as notices, assignments, results, attendance, and payments.
- Advanced AI assistant: Phase 10 role tools for Super Admin, School Admin, Teacher, and Student use cases, logged through AI audit records.
- Marketplace architecture: provider registry and per-school plugin enablement for biometric, SMS, WhatsApp, payment, AI, storage, and custom providers.
- GST and accounting: GST ledger entries, GST report endpoint, and report-builder exports.
- Advanced reporting: saved report definitions, run endpoint, and PDF/Excel/CSV export support.
- Disaster recovery and monitoring: Phase 10 builds on Phase 9 backup policies, backup jobs, health snapshots, queue jobs, and monitoring panels.
- Security center: two-factor policy settings, IP lists, session controls, force logout, suspicious-event tracking, and security event resolution.
- Production audit: automated launch checks for protected routes, tenant isolation, protected file access, payment leakage, security alerts, route registration, and role escalation.

## Super Admin UI

Use `Super Admin > Commercial Ecosystem` to manage Phase 10:

- Overview: school selector, module counts, launch snapshot, and Super Admin AI summary.
- Admissions: create public admission forms, approve applications, and admit approved students.
- Transport, Library, Assets: add drivers, add protected digital resources, download resources, and create inventory assets.
- Website & Push: publish school website content, queue push notifications, and mark queued notifications as sent.
- Marketplace: register providers and enable a provider for the selected school.
- GST & Reports: add GST ledger entries, view GST totals, create report definitions, run reports, and export CSV.
- Security Center: save two-factor policy and resolve open security alerts.
- Launch Audit: run production audits and download audit PDF reports.

## API Groups

Phase 10 endpoints are under `/api/v1/`:

- `admission-form-templates/`
- `admission-applications/`
- `admission-documents/`
- `public/admissions/{schoolCode}/`
- `public/admissions/track/{trackingCode}/`
- `transport-drivers/`
- `transport-vehicle-attendance/`
- `transport-trip-logs/`
- `digital-library-resources/`
- `library-book-requests/`
- `inventory-assets/`
- `asset-maintenance-logs/`
- `school-website-contents/`
- `public/schools/{schoolCode}/website/`
- `push-devices/`
- `push-notifications/`
- `mobile/bootstrap/`
- `marketplace-plugins/`
- `school-plugin-configs/`
- `accounting-ledger-entries/`
- `report-definitions/`
- `security-policies/`
- `device-login-sessions/`
- `security-events/`
- `production-audit-runs/`
- `enterprise/ecosystem/`

## Tenant Rules

- Public admission and public website endpoints resolve a school by active `schoolCode`.
- School Admin and Account users are limited to their assigned school through campus-scoped querysets.
- Teacher and Student access is limited to assigned class/student records where endpoints allow non-admin reads.
- Super Admin can read platform-wide records and run platform or school-scoped audits.
- Protected file downloads create document access logs.
- Marketplace secrets or payment gateway secrets are never exposed by Phase 10 endpoints.

## Acceptance Checks

Run:

```powershell
Set-Location backend
python manage.py test apps.core.tests.ERPRoleFlowTests.test_phase10_commercial_ecosystem_modules_are_scoped_and_actionable
```

The regression covers public admission, school admin review/admit, protected admission and library downloads, transport driver/trip records, library request approval, inventory, public website content, push notifications, marketplace enablement, GST reporting, report export, security policy, force logout, security event resolution, production audit PDF, AI assistant, and the Phase 10 ecosystem dashboard.
