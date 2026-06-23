# User Manual

This manual explains daily usage for each MentriQ360 role. All school users see only their own school data.

## Super Admin

Use the Super Admin panel to manage the platform and schools.

Core actions:

- View school list, status, subscription, tenant/database status, and counts.
- Add a new school and verify the generated school code.
- Upload school logo, banner, and photos.
- Create the first School Admin login and share the temporary password through an approved secure channel.
- Activate, deactivate, or suspend schools.
- Manage subscription status and audit school-level actions.
- Keep the MentriQ360 brand visible in the Super Admin panel.

Super Admin must not edit or delete another protected Super Admin account. The backend blocks deletion/disable attempts.

## School Admin

Use the School Admin panel to manage academic and school operations for one school.

Core actions:

- Review dashboard totals for students, teachers, staff, classes, attendance, pending fees, exams, and notices.
- Add and edit students, assign class/section, upload photos/documents, and download profile PDFs.
- Add and edit teachers/staff, assign subjects/classes/sections, upload documents, and view attendance summaries.
- Create classes, sections, subjects, class teachers, subject teachers, and timetable slots.
- Manage exams, marks setup, result approval/rejection, and publish/unpublish results.
- Create, publish, and archive notices.
- Configure school branding, payment gateway settings, and communication settings where enabled.

School Admin cannot access Super Admin routes or another school.

## Account Panel

Use the Account panel to manage school finance.

Core actions:

- View total collection, today/monthly collection, pending/overdue fees, failed payments, salary payable, and recent transactions.
- Create fee structures by class/section.
- Assign fees student-wise.
- Collect offline payments and verify online payments.
- Generate invoices, receipts, salary slips, and downloadable finance reports.
- Configure school-wise Razorpay/UPI/card/net banking/wallet settings.
- Send fee reminders by Email, SMS, or WhatsApp when configured.
- Mark teacher/staff salary as paid after attendance-based calculation.

Account users can manage only their own school finance records. Gateway secrets are never visible on frontend.

## Teacher Panel

Use the Teacher panel for assigned academic work.

Core actions:

- View assigned classes, subjects, timetable, pending attendance, notes, assignments, submissions, exams, and quick actions.
- Take attendance only for assigned classes/sections/subjects.
- Upload, edit, publish, unpublish, or delete own notes.
- Create assignments, attach files, publish assignments, and view/download submissions.
- Mark submissions checked/pending and add remarks.
- Upload marks for assigned subjects and submit marks for School Admin review.
- Download allowed attendance and submission reports.

Teachers cannot access other schools or unassigned classes.

## Student Portal

Use the Student Portal for the logged-in student's own data.

Core actions:

- View profile, class/section, attendance percentage, pending fees, notices, exams, notes, assignments, latest result, and payment status.
- View and download assigned notes.
- View assignments, download assignment files, submit files, and view remarks/status.
- View fees, pay fees, check payment history, and download receipts.
- View marks/results and download result PDFs.
- Open Parent View inside the Student Portal to show attendance, fees, results, notices, assignments, documents, and receipts.

Students cannot access another student's data, files, fees, receipts, or results.

## Payment Gateway Setup

1. Open the school Account or School Admin finance settings.
2. Select provider: Razorpay, UPI, card, net banking, or wallet.
3. Enter production key ID and secret server-side.
4. Enter webhook secret.
5. Enable allowed payment methods.
6. Save and run a small production test payment.
7. Confirm webhook verifies schoolId, orderId, signature, and amount.
8. Confirm the receipt appears in Account Panel and Student Portal.

Do not put gateway secrets in `NEXT_PUBLIC_` variables or browser-visible fields.

## Email, SMS, and WhatsApp Setup

1. Open communication settings for the school.
2. Configure each enabled channel separately.
3. Email requires SMTP host, port, username, password, and sender.
4. SMS requires provider URL, API key/secret, and sender ID.
5. WhatsApp requires API URL/token and phone number ID.
6. Create templates for fee reminders, attendance alerts, assignments, exams, results, receipts, salary slips, and announcements.
7. Test delivery to an internal account before enabling live messages.

Templates support variables such as `studentName`, `schoolName`, `className`, `sectionName`, `feeAmount`, `dueDate`, `paymentLink`, `receiptLink`, `resultLink`, and `attendancePercentage`.

## AI Feature Usage

AI tools are role-scoped:

- Super Admin: school performance summary, inactive school detection, subscription reminder generator.
- School Admin: low attendance detection, notice generator, student performance summary.
- Account: fee defaulter summary, payment reminder generator, monthly finance summary.
- Teacher: assignment generator, notes summary, question paper generator, student feedback generator.
- Student: study assistant, notes summarizer, exam preparation suggestions.

AI uses only data the logged-in role can already access. AI usage is logged.

## Attendance Hardware Setup

1. Add a device from School Admin attendance hardware settings.
2. Select biometric, RFID, or QR attendance.
3. Enter provider, device code, location, server/domain, port, heartbeat, and enabled student/staff modes.
4. Check online/offline status.
5. Run sync logs.
6. Review failed sync logs and retry where needed.
7. Confirm attendance appears only in the correct school dashboard.

## Reports and Downloads

Common downloads:

- Student profile PDF.
- Student attendance PDF/Excel/CSV where enabled.
- Fee invoices and receipts.
- Fee collection, pending fee, overdue fee, student payment, online transaction, offline payment, salary, and monthly finance reports.
- Notes and assignment files.
- Assignment submissions.
- Result PDFs/report cards.
- Salary slips.

Every download is protected by role, schoolId, and userId checks.

