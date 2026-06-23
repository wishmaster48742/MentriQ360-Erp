# Role Permission Matrix

Every API, page, file, report, event, and download is scoped by role and school. School users must have a `schoolId` and cannot access another school by changing request payloads or query parameters.

## Access Matrix

| Area | Super Admin | School Admin | Account | Teacher | Student |
| --- | --- | --- | --- | --- | --- |
| Platform school list | View/manage all schools | No access | No access | No access | No access |
| Create/edit/suspend school | Create, update, suspend, activate | No access | No access | No access | No access |
| School profile/branding | View all; manage from Super Admin | View/manage own school | View own school finance context | View own school branding | View own school branding |
| School users | Create School Admin and manage platform users | Manage own school users | View finance-relevant own school users | View assigned students/classes | View own login/profile only |
| Students | View all through platform scope | Create/read/update/deactivate own school | View own school fee-linked students | View assigned classes only | View own student record only |
| Teachers/staff | View all through platform scope | Create/read/update/deactivate own school | View own school staff for salary | View own profile and assignments | No staff access |
| Classes/sections/subjects | View all through platform scope | Manage own school | View own school context | View assigned class/subject | View own class/section/subject |
| Attendance | View school summaries | Manage own school attendance and corrections | View attendance for salary/finance | Mark/view assigned class/subject | View own attendance |
| Fees/payments | Platform visibility as needed | View school summaries | Manage own school fees/payments/reports | No finance management | View/pay own fees only |
| Payment gateway | View/check school status | Configure own school if allowed | Configure/manage own school finance gateway | No access | No access to secrets |
| Salary | Platform visibility as needed | View school summaries | Manage own school salary setup and payments | View own salary summary where exposed | No access |
| Notes | No routine academic upload | View own school | No routine access | Create/update/delete own notes for assigned classes | View/download assigned notes only |
| Assignments | No routine academic upload | View/approve where needed | No routine access | Create/manage assigned assignments and submissions | View/submit own assignments |
| Marks/results | Platform visibility as needed | Approve/reject/publish own school | No routine access | Upload marks for assigned subjects | View/download own result only |
| Notices | Platform/global notices | Create/publish/archive own school | View finance notices if targeted | View targeted notices | View targeted notices |
| Reports/downloads | Platform reports | Own school reports | Own school finance/salary reports | Assigned attendance/submission reports | Own profile/attendance/receipt/result downloads |
| AI tools | Platform summaries and subscription reminders | Own school summaries and notice generation | Own school finance summaries/reminders | Assigned class academic tools | Own study/notes/result tools |
| Communication settings | Platform visibility where needed | Configure own school | Use finance reminders | Use assignment/attendance notifications | Receive messages |
| Hardware attendance devices | Platform visibility where needed | Add/edit/delete/sync own school devices | View finance impact if needed | View device-marked attendance | View own attendance only |
| Audit logs | View platform logs | View own school logs | View own finance logs | View own upload/attendance/submission logs | View own relevant events only |

## Operation Matrix

| Role | View | Create | Update | Delete/deactivate | Download/export | Manage settings |
| --- | --- | --- | --- | --- | --- | --- |
| Super Admin | All schools and platform status | Schools, School Admins, platform notices | School details, subscription, status, branding | Suspend/delete where implemented, never protected Super Admin | Platform reports and school status exports | Platform settings, tenant status |
| School Admin | Own school only | Students, teachers, staff, classes, subjects, exams, notices | Own school academic/admin records | Deactivate own school users/records | Own school reports, profiles, attendance, results | Branding, communication, payment setup if assigned |
| Account | Own school finance only | Fee structures, fee assignments, payments, salary records, reminders | Own school finance records | Reverse/deactivate finance records where implemented | Finance, receipt, invoice, salary, CSV/PDF exports | Payment gateway and finance settings |
| Teacher | Own assigned classes/subjects | Attendance, notes, assignments, marks, remarks | Own uploads and allowed attendance edits | Delete own notes/assignments where allowed | Attendance, notes, submissions, result files for assignments | No school-level settings |
| Student | Own data only | Assignment submissions and fee payment attempts | Own profile fields where allowed | No destructive access | Own notes, assignments, attendance, receipts, result PDFs | No settings |

## Tenant Security Rules

- Super Admin is global and sees all schools.
- Every school user must have exactly one school context.
- School Admin, Account, Teacher, and Student APIs filter by schoolId on the server.
- Teacher access also requires assigned class/section/subject validation.
- Student access also requires own userId/studentId validation.
- Frontend schoolId values are never trusted for authorization.
- Payment gateway secrets are stored server-side and never exposed to the browser.
- File downloads require protected API access and permission checks.

