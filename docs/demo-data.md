# Demo Data Guide

MentriQ360 includes a removable demo school seed command for client walkthroughs and QA. Demo data is not stored in migrations and is not created automatically in production.

## Create Demo School

From the backend folder:

```powershell
python manage.py seed_demo_school
```

Default demo school:

| Field | Value |
| --- | --- |
| School name | MentriQ360 Demo School |
| School code | DEMO360 |
| Demo marker | `PlatformSetting.key = demo_data_marker` |
| Demo tag | `phase8_client_demo` |
| Remove command | `python manage.py seed_demo_school --remove` |

Use a custom code for isolated testing:

```powershell
python manage.py seed_demo_school --code CLIENTDEMO --reset
python manage.py seed_demo_school --code CLIENTDEMO --remove
```

## Demo Accounts

All demo accounts use this password unless overridden:

```text
Demo@12345
```

| Role | Username |
| --- | --- |
| School Admin | `demo.schooladmin` |
| Account | `demo.account` |
| Teacher | `demo.teacher.math` |
| Teacher | `demo.teacher.science` |
| Student | `demo.student.aarav` |
| Student | `demo.student.mira` |
| Student | `demo.student.kabir` |

These accounts are for demos only. Do not use them in production launch data.

## Included Demo Records

The seed command creates:

- School logo and banner as embedded demo images.
- School Admin, Account user, two teachers, and three students.
- Academic session, two class sections, and three subjects.
- Teacher subject allocations and timetable entries.
- Staff profiles for Account and Teacher users.
- Fee structure, fee assignments, online payment, offline payment, receipt numbers, and payment transaction.
- Razorpay demo gateway settings with encrypted demo secrets.
- Email, SMS, and WhatsApp communication settings.
- Message templates for fee reminders and results.
- Attendance device, sync log, student attendance, and staff attendance.
- Notes, assignment, checked assignment submission, published results, exam setup, exam schedule, and notice.
- Academic and finance real-time event records.

## Remove Demo School

```powershell
python manage.py seed_demo_school --remove
```

For a custom code:

```powershell
python manage.py seed_demo_school --code CLIENTDEMO --remove
```

Removal safety:

- The command refuses to remove a school unless it has the demo marker.
- All non-Super Admin users assigned to the demo school are deleted.
- The demo school delete cascades its students, fees, payments, notes, assignments, results, notices, communication settings, devices, and logs.
- Super Admin accounts are never deleted.

## Demo Data Rule

Any data shown by this command is marked as demo and should not be migrated into a real school account. For real onboarding, create a fresh school from the Super Admin panel and enter production credentials school by school.

