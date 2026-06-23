# Known Limitations

These are not code blockers, but they require client/provider configuration before production go-live.

## Provider Credentials

Real Razorpay, Email SMTP, SMS API, WhatsApp API, and AI credentials are not included in the repository. They must be configured in production environment variables or the protected school settings screens.

## Demo Data

The demo school uses embedded demo images and demo file URLs for safe walkthroughs. It is not production data and should be removed before launch unless the client explicitly wants it in staging.

## Hardware Attendance

The ERP stores device configuration and sync logs. Real biometric/RFID/QR devices require provider-specific connectivity, network allowlists, and field mapping validation in the client environment.

## Real-Time Transport

Real-time behavior is implemented through scoped event records/SSE-style feeds. If the client requires Socket.io specifically, deploy an always-on backend service and configure school/user/role rooms using the same event scope rules.

## File Storage

Local/demo uploads can use local media/data URLs. Production should use durable object storage with protected download APIs or signed URLs, backup retention, and malware scanning if required by policy.

## Tenant Databases

Single-database school isolation is supported by strict schoolId filtering. Separate database per school requires `CAMPUS_DATABASE_URLS` and a configured production database for every school.

## Production Messaging

SMS and WhatsApp templates may require provider approval before live sending. Delivery failures should be monitored after provider activation.

## Visual QA

Automated build and route checks pass, but final client sign-off should include manual browser QA on the target devices, especially for mobile forms, long tables, and print/download workflows.

