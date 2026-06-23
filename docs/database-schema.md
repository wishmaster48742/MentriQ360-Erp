# Database Schema Summary

MentriQ360 uses Django models with either single-database tenant isolation or optional separate school databases. In single-database mode, all school data is filtered through the school/campus relationship.

## Core Tenant Model

| Model | Purpose |
| --- | --- |
| `Campus` | School record, branding, status, subscription, tenant/database reference, module settings. |
| `CampusMembership` | Connects users to a school and school-local role capability. |
| `User` | Auth user with role and optional `school` tenant assignment. Super Admin is global. |

## Academic Models

| Model | Purpose |
| --- | --- |
| `AcademicSession` | School academic year/session. |
| `ClassSection` | Class and section under one school/session. |
| `Subject` | School subject catalog. |
| `TeacherSubjectAllocation` | Teacher to section/subject assignment. |
| `TimetableSlot` | Class timetable by day, time, teacher, subject, and room. |
| `Student` | Student profile, class/section assignment, linked student user. |
| `StaffProfile` | Teacher/staff employment profile. |
| `AttendanceRecord` | Student attendance by date/subject/section. |
| `StaffAttendanceRecord` | Teacher/staff attendance by date. |
| `ExamType` | Exam category. |
| `ExamSubjectSetup` | Subject-wise marks setup for exam/class/section. |
| `ExamSchedule` | Exam date/time/venue. |
| `ResultRecord` | Student marks, grade, review, and publish status. |
| `LearningResource` | Notes/syllabus/resource files. |
| `AssignedWork` | Assignments/homework. |
| `AssignmentSubmission` | Student assignment submissions and teacher remarks. |
| `Announcement` | Notices for school/global audiences. |

## Finance Models

| Model | Purpose |
| --- | --- |
| `FeeStructure` | Class/section fee definition. |
| `FeeAssignment` | Student-wise fee, due date, invoice, and payment status. |
| `Payment` | Completed or recorded payment and receipt data. |
| `PaymentTransaction` | Online/offline transaction, gateway order/payment IDs, webhook verification. |
| `PaymentGatewayConfig` | School-wise encrypted payment gateway settings. |
| `SalarySetup` | Staff salary setup. |
| `SalaryRecord` | Monthly salary calculation, payment status, salary slip reference. |
| `FinanceEvent` | Real-time finance event log. |

## Communication, AI, Hardware, Audit

| Model | Purpose |
| --- | --- |
| `CommunicationSetting` | School-wise Email/SMS/WhatsApp settings with encrypted secrets. |
| `MessageTemplate` | Message templates and variables. |
| `OutboundMessage` | Sent/queued/failed message records. |
| `AttendanceDevice` | Biometric/RFID/QR attendance device configuration. |
| `DeviceSyncLog` | Device sync status, payload, errors, retries. |
| `AILog` | Role-wise AI feature usage log. |
| `AcademicEvent` | Real-time academic event log. |
| `AuditEvent` | Security and write-action audit trail. |
| `Document` | Protected student/staff documents. |
| `PlatformSetting` | Global or school-specific settings. |

## Important Indexes

Indexes exist for high-volume tenant and reporting access patterns, including:

- school/code/status and subscription status
- school/role/is_active for users
- school/status for students and staff
- section/date/subject and student/date for attendance
- school/date/status for staff attendance
- school/is_active for subjects/classes/fees
- student/status and due_date/status for fee assignments
- school/payment_status and school/paid_on for payments
- school/status/created_at for payment transactions
- school/event_type/created_at for academic and finance events

## Tenant Isolation

Single-database mode:

- School users are filtered by `schoolId`/campus IDs derived from authenticated user context.
- Teacher queries add assigned class/section/subject filters.
- Student queries add own user/student filters.
- Frontend schoolId values are treated as hints only, never authorization.

Separate-database mode:

- `CAMPUS_DATABASE_URLS` maps school code to database URL.
- Tenant middleware and router activate the correct database alias.
- Run `python manage.py migrate_campus_databases` for every tenant database.

