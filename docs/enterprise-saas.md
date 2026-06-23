# MentriQ360 Phase 9 Enterprise SaaS Guide

This guide covers the Phase 9 enterprise layer: subscription plans, school billing, white-label controls, analytics, compliance logs, disaster recovery, scalability, and monitoring.

## SaaS Plans

Default plans are seeded by migration and can be refreshed from either:

```powershell
python backend/manage.py enterprise_maintenance --seed-plans
```

or the Super Admin UI:

- Open `Super Admin > Enterprise SaaS > Plans`.
- Use `Seed defaults` to restore Basic, Standard, Premium, and Enterprise.
- Edit pricing, student limits, teacher limits, storage limits, AI limits, WhatsApp/SMS limits, module access, custom pricing, and active status.

Plan rules:

- `Basic` and `Standard` reject custom pricing.
- `Premium` and `Enterprise` allow custom pricing.
- Limit value `0` means unlimited.
- White-label modules must stay disabled for Basic and Standard.

## School Subscriptions

Open `Super Admin > Enterprise SaaS > Subscriptions`.

Super Admin can:

- assign a plan to a school
- set monthly, annual, or custom billing cycle
- configure GST number
- set start date, end date, grace period, and auto-disable behavior
- renew active subscriptions
- generate GST subscription invoices

When a subscription is saved, the school profile is synchronized with plan name, subscription status, monthly payable amount, billing due date, and enabled modules.

Expired subscriptions are enforced by:

```powershell
python backend/manage.py enterprise_maintenance --expire-subscriptions
```

or the UI `Enforce expiry` action.

## Subscription Billing

Open `Super Admin > Enterprise SaaS > Billing`.

Supported billing flow:

1. Generate invoice from a school subscription.
2. Download invoice PDF.
3. Record subscription payment with provider and transaction ID.
4. Successful payment marks the invoice paid and keeps the subscription active.
5. Payment, invoice, and subscription actions are logged in audit and activity logs.

GST invoices include base amount, discount, GST rate, GST amount, total, billing period, school name, and GSTIN.

## White Label

Open `Super Admin > Enterprise SaaS > White Label`.

Premium and Enterprise schools can configure:

- custom logo URL
- custom domain
- primary, secondary, and accent colors
- custom login heading and subheading
- email template header/footer
- report logo/footer

Super Admin branding remains protected. Basic and Standard schools are blocked from enabling white-label branding.

## Analytics

Open `Super Admin > Enterprise SaaS > Analytics`.

Super Admin analytics include:

- MRR
- ARR
- active schools
- churn rate
- subscription growth
- total and monthly SaaS revenue
- revenue by plan
- schools over student or teacher limits

School analytics include:

- attendance percentage
- fee collection
- pending and overdue fee counts
- student performance
- teacher performance activity
- subscription usage limits

## Compliance Logs

Open `Super Admin > Enterprise SaaS > Compliance`.

Tracked evidence includes:

- audit events
- user activity logs
- login activity
- subscription changes
- invoice/payment actions
- document download logs
- secure API token creation

Document downloads use protected APIs and write `DocumentAccessLog` entries with school, user, student, file name, access type, authorization result, IP, and metadata.

## Secure API Tokens

Use `Compliance > Token access` to issue platform or school-scoped API tokens.

Rules:

- Tokens are hashed with the Django `SECRET_KEY`.
- Raw token is shown only once.
- Store token scopes explicitly, for example `analytics.read,subscription.read`.
- Disable tokens instead of deleting them when preserving audit history matters.

## Backup And Recovery

Open `Super Admin > Enterprise SaaS > Recovery`.

Backup policy scopes:

- platform-wide
- school-specific

Backup types:

- full database
- school data
- files
- payment logs
- audit logs

Operational command:

```powershell
python backend/manage.py enterprise_maintenance --queue-backups
```

Restore testing:

- Queue a backup job.
- Run the storage-side restore procedure.
- Mark the job restored in the UI.
- The backup job metadata stores restore-test evidence.

## Monitoring

Open `Super Admin > Enterprise SaaS > Monitoring`.

Monitoring includes:

- system health snapshots
- API health
- database health
- queue status
- backup failures
- failed payments
- AI monthly usage
- storage usage metrics

Create baseline snapshots with:

```powershell
python backend/manage.py enterprise_maintenance --health-snapshot
```

Run all maintenance tasks:

```powershell
python backend/manage.py enterprise_maintenance --all
```

## Scalability Notes

The enterprise schema adds indexes for:

- school subscription status and expiry
- subscription invoice status, due date, invoice number
- subscription payment status, paid date, transaction ID
- activity logs by school/user/date
- document access logs by school/document/user/date
- backup jobs by status and school
- queue jobs by status, schedule, priority, and school
- system health by component, status, school, and check time
- secure API token prefix and active school scope

Recommended production setup:

- PostgreSQL with connection pooling
- Redis cache for dashboard and analytics responses
- scheduled maintenance command for subscription expiry and health snapshots
- queue worker process for backup, import, report, notification, and payment retry jobs
- object storage for protected files and backup artifacts
- log drain or observability provider for API, payment, hardware, and AI events

## Enterprise Test Coverage

The backend regression suite covers:

- default SaaS plan seeding
- Premium subscription creation
- GST invoice generation
- subscription payment activation
- white-label allow/deny rules
- health snapshot creation
- backup policy/job/restore marker
- queue job execution
- secure API token hashing
- protected document download logging
- enterprise analytics and monitoring APIs
- school-scoped subscription reads
- student-limit enforcement
