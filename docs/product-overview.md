# MentriQ360 School ERP — Product Overview

> **Version:** 1.0 | **Last updated:** June 2026
> This document is the single source of truth for what MentriQ360 is, who uses it, how it works, and how it is built. For deeper specifics, refer to the linked docs inside the `docs/` folder.

---

## Table of Contents

1. [What Is MentriQ360](#1-what-is-mentriq360)
2. [Tech Stack](#2-tech-stack)
3. [System Architecture](#3-system-architecture)
4. [User Roles](#4-user-roles)
5. [Module Breakdown by Role](#5-module-breakdown-by-role)
   - 5.1 Super Admin
   - 5.2 School Admin
   - 5.3 Account (Finance Officer)
   - 5.4 Teacher
   - 5.5 Student
6. [Complete Feature List](#6-complete-feature-list)
7. [Authentication & Security Flow](#7-authentication--security-flow)
8. [Multi-Tenancy Model](#8-multi-tenancy-model)
9. [Application Workflow](#9-application-workflow)
10. [Third-Party Integrations](#10-third-party-integrations)
11. [Mobile App](#11-mobile-app)
12. [Environment Variables](#12-environment-variables)
13. [API Overview](#13-api-overview)
14. [Data Storage](#14-data-storage)
15. [Known Limitations](#15-known-limitations)
16. [Glossary](#16-glossary)

---

## 1. What Is MentriQ360

MentriQ360 is a **multi-tenant, role-based School ERP (Enterprise Resource Planning)** system designed for educational institutions. It provides a unified platform for managing every operational aspect of a school — from student admissions and attendance to fee collection, academic management, staff payroll, and real-time communication.

The platform supports a hierarchy of users (Super Admin → School Admin → Finance Officer / Teacher / Student) and is built to run multiple schools (tenants) from a single deployment while keeping each school's data isolated.

**Core value delivered:**
- Schools do not need multiple separate tools — one login covers admissions, academics, fees, attendance, exams, reports, communication, and more.
- Super Admins (the platform operator) can create and manage multiple school accounts with full SaaS billing, white-labelling, and compliance controls.
- Every user sees only the screens and data that belong to their role and school.

---

## 2. Tech Stack

### Frontend
| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5.6 |
| UI Library | React 19 |
| Styling | Tailwind CSS 3.4 |
| Icons | Lucide React |
| Mobile | Capacitor 8 (Android wrapper) |
| E2E Tests | Playwright 1.60 |

### Backend
| Layer | Technology |
|---|---|
| Framework | Django 5.2 + Django REST Framework 3.15 |
| Auth | SimpleJWT (access + refresh tokens) |
| Schema docs | drf-spectacular (OpenAPI 3) |
| Password hashing | Argon2 |
| Image handling | Pillow |
| WSGI server | Gunicorn (4 workers, 120 s timeout) |

### Databases
| Purpose | Technology |
|---|---|
| User auth, core identity | SQLite (local) / PostgreSQL (production) |
| School operational data | MongoDB 7 (via PyMongo + MongoEngine) |
| Cache / rate limiting / queues | Redis 7 |

### Infrastructure
| Layer | Technology |
|---|---|
| Containerisation | Docker + Docker Compose |
| Deployment | Vercel (frontend) + Gunicorn on server (backend) |
| Reverse proxy / CDN | Configured per deployment |
| File storage | Local media (dev) / object storage (production) |

---

## 3. System Architecture

```
Browser / Android App
        │
        ▼
  Next.js Frontend (Port 3000)
   - App Router pages per role
   - Typed API client (src/lib/api.ts)
   - JWT stored in localStorage
   - Idle session timeout
        │
        │  REST API over HTTPS
        ▼
  Django Backend (Port 8000)
   - /api/v1/auth/   → JWT login, logout, refresh, captcha
   - /api/v1/        → 100+ viewsets (CRUD + custom actions)
   - Role-based permissions enforced server-side
   - X-Campus-Code header for tenant routing
        │
   ┌────┴──────────────────┐
   ▼                       ▼
SQLite / PostgreSQL      MongoDB
(Users, Auth, Django     (Students, Attendance,
 admin, Audit logs)       Fees, Exams, Staff, etc.)
                          │
                          ▼
                        Redis
                  (Cache, Rate limits,
                   Session store,
                   Real-time queues)
```

**Database routing** — Django's `db_router.py` automatically sends auth/user queries to the relational DB and all school-operation queries to MongoDB. The frontend never touches the DB directly.

---

## 4. User Roles

MentriQ360 has **five roles**. Each role logs in at the same URL and is redirected to its own dashboard.

| Role | Who They Are | Dashboard Path |
|---|---|---|
| `super_admin` | Platform operator / SaaS owner | `/dashboard/super-admin` |
| `school_admin` | Principal or head administrator of a school | `/dashboard/school-admin` |
| `account` | Finance officer / accountant at a school | `/dashboard/account` |
| `teacher` | Teaching or non-teaching staff at a school | `/dashboard/teacher` |
| `student` | Enrolled student (or parent with student login) | `/dashboard/student` |

> See `docs/permission-matrix.md` for a full CRUD breakdown per role per module.

---

## 5. Module Breakdown by Role

### 5.1 Super Admin

The Super Admin is the **platform operator**. They see across all schools.

**Navigation tabs (10):**

| Tab | What it does |
|---|---|
| **Overview** | Network-wide status — total schools, active subscriptions, health alerts |
| **Schools** | Create schools, assign School Admin credentials, upload branding |
| **Enterprise SaaS** | SaaS plans, subscription billing, GST invoices, white-label config, compliance |
| **Commercial Ecosystem** | Admissions portal, mobile app distribution, marketplace plugins, audit |
| **Records & Users** | Academic sessions, platform-wide users, student records |
| **Administration** | Campus access control, approval requests, attendance devices |
| **Operations** | Staff directory, timetable, library, transport, hostel, inventory |
| **Finance** | Fees, payments, salary across schools |
| **Realtime & AI** | Live event feed, AI tools, email/SMS/WhatsApp, device sync |
| **Reports** | Audit logs, operational and financial reports |

**Key capabilities:**
- Create and suspend schools
- Configure SaaS plans (Basic / Standard / Premium / Enterprise)
- Manage school subscriptions, billing cycles, and GST invoicing
- White-label the platform per school (custom logo, colours, domain)
- View system health snapshots, backup jobs, and queue jobs
- Generate and revoke secure API tokens
- Access enterprise analytics (MRR, ARR, churn, usage per school)
- Run production audit checks

---

### 5.2 School Admin

The School Admin manages **everything within their own school**.

**Navigation tabs (8):**

| Tab | What it does |
|---|---|
| **Overview** | School-level stats — students, staff, attendance rate, fee collection |
| **Students** | Admissions, profiles, status (active / inactive / alumni) |
| **Teachers & Staff** | Staff onboarding, profiles, designations, departments |
| **Classes** | Sections, subjects, timetable, teacher-subject allocation |
| **Attendance** | Student and staff attendance (manual or hardware device) |
| **Exams** | Exam types, schedules, mark entry, result records, admit cards |
| **Notices** | Write and publish announcements to students / staff |
| **Realtime & AI** | Live events, AI-generated summaries, communication, device sync |

**Key capabilities:**
- Bulk-import students and staff from CSV/Excel
- Configure class sections, academic sessions, and subjects
- Set class teachers
- Define exam types and publish schedules
- Enter and approve exam marks
- Publish or reject results
- Post school-wide notices with a draft → publish workflow
- Configure attendance devices per campus

---

### 5.3 Account (Finance Officer)

The Account role is scoped entirely to **finance**.

**Navigation tabs (4):**

| Tab | What it does |
|---|---|
| **Overview** | Finance summary — total assigned fees, collected, pending, overdue |
| **Fees** | Fee structure definition, fee assignment to students, payment recording |
| **Realtime & AI** | Finance events, AI-generated reminders, communication settings |
| **Reports** | Finance reports, salary reports, audit exports |

**Key capabilities:**
- Define fee structures per class/section
- Assign fees to individual students
- Record offline payments (cash, cheque, bank transfer)
- Configure and manage payment gateways (Razorpay, UPI, card, net banking)
- Manage staff salary setups and payment records
- Download receipts, invoices, and salary slips
- Send automated fee reminders via SMS / email / WhatsApp

---

### 5.4 Teacher

The Teacher sees only their **assigned classes and subjects**.

**Navigation tabs (5):**

| Tab | What it does |
|---|---|
| **Overview** | Sections assigned, upcoming assignments, recent attendance summary |
| **Attendance** | Mark daily attendance for assigned sections/subjects |
| **Academics** | Create notes, post assignments, enter exam marks, view submissions |
| **Realtime & AI** | Live academic events, AI study tools, assignment notifications |
| **Reports** | Attendance reports and submission reports for assigned classes |

**Key capabilities:**
- View timetable and section roster
- Mark attendance (present / absent / late / half day / on duty)
- Upload learning resources (PDFs, notes, references)
- Create and publish assignments with due dates
- Grade and remark on student submissions
- Enter exam marks per student per subject
- View and download result records

---

### 5.5 Student

The Student portal is **read-heavy with limited write access** (submissions, profile updates).

**Navigation tabs (2):**

| Tab | What it does |
|---|---|
| **Student Portal** | Full self-service area (see sub-sections below) |
| **AI & Updates** | AI study assistant and live academic event feed |

**Student portal sub-sections:**

| Section | Content |
|---|---|
| Overview | Attendance summary, fee status, recent notices |
| Profile | Personal info, photo, contact details, parent info |
| Attendance | Date-wise attendance records with subject and percentage |
| Fees | Fee assignments, payment history, outstanding dues |
| Results | Exam scores, percentage, grade, remarks |
| Assignments | Assigned work, due dates, submission upload |
| Resources | Learning notes and materials uploaded by teachers |
| Notices | School announcements |
| Documents | Certificates and issued documents |
| Admit Cards | Exam admit cards (downloadable) |

---

## 6. Complete Feature List

### Academic Management
- Academic session setup (start date, end date, active flag)
- Class section creation with class teacher assignment
- Subject catalogue per grade
- Teacher-subject allocation (with weekly period count)
- Weekly timetable (day, time slot, room, teacher)
- Academic calendar events

### Student Management
- Student admission with full demographic profile
- Photo upload, blood group, medical notes
- Parent/guardian contact information
- Section assignment and transfer
- Status tracking (active / inactive / alumni)
- Bulk CSV import

### Staff Management
- Staff profiles (employee code, designation, department)
- Employment type (full-time, part-time, contract)
- Joining date, qualification, emergency contact
- Staff attendance with clock-in / clock-out
- Leave tracking

### Attendance
- Manual attendance (section + subject + date)
- Hardware-based attendance (face recognition, fingerprint, card scan)
- Attendance device registration and sync
- Device heartbeat and online/offline status
- Attendance status options: present, absent, late, half day, on duty
- Editable for the last 3 days
- Staff attendance with same capture method support

### Examination & Results
- Exam type definition
- Exam schedule with venue, time, instructions
- Subject-wise exam setup (max marks, pass marks, weightage)
- Mark entry per student
- Result records with percentage and grade
- Approval workflow (draft → submitted → approved → rejected)
- Bulk marks file upload
- Result publication with visibility control
- Admit card generation with roll number, venue, reporting time

### Fees & Payments
- Fee structure per class with late fee and discount
- Fee assignment to individual students
- Payment recording (cash, card, bank, UPI, online, net banking, wallet)
- Payment gateway integration (Razorpay and others)
- Transaction tracking and webhook verification
- Receipt generation (PDF)
- Invoice numbering
- Outstanding and overdue tracking
- Fee reminders via communication channels

### Salary Management
- Gross salary setup per staff member
- Deductions and bonuses configuration
- Monthly salary record (present/absent/leave/half-day days)
- Final salary calculation
- Payment status (draft → payable → paid / hold)
- Salary slip generation

### Library
- Book catalogue (title, author, ISBN, category, shelf location)
- Copy count management (total / available)
- Book loans (issue, return, overdue tracking)
- Fine amount calculation
- Digital library resources
- Book request workflow

### Transport
- Route management (start, end, stops)
- Vehicle registration (number, capacity, driver, GPS device)
- Driver profiles
- Student transport assignment (pickup stop, drop stop, fee)
- Vehicle attendance and trip logs

### Hostel
- Hostel room setup (hostel name, room number, floor, capacity)
- Student room allocation with bed number
- Occupancy and date-range tracking

### Inventory
- Asset catalogue
- Asset maintenance log

### Admissions Portal
- Public admission form templates (configurable schema)
- Online application submission (no login required)
- Application tracking via tracking code
- Application status workflow (new → under review → interview scheduled → approved / rejected / waitlisted → admitted)
- Admission fee payment
- Document upload

### Communication & Notifications
- Email, SMS, and WhatsApp messaging
- Message templates with dynamic variables
- Outbound message tracking (queued / sent / failed)
- SMTP configuration for email
- SMS API configuration
- WhatsApp Business API configuration
- Push notification support (mobile devices)
- Announcement system with role-targeted visibility

### Real-time & AI
- Live event feed (attendance marked, fee paid, result published)
- Server-Sent Events / WebSocket event stream endpoint
- AI tools for school summary, notice generation, student study assistant
- AI log tracking per campus

### Reports
- Dashboard summary (students, staff, attendance rate, fee collection)
- Attendance report by section
- Fee status report
- Salary report
- Finance export (CSV / PDF)
- Audit event log
- Recent activity per user

### School Website CMS
- Public school website content management
- Published page count tracking

### Enterprise & SaaS (Super Admin only)
- Plan management (Basic / Standard / Premium / Enterprise)
- Student, teacher, storage, AI, WhatsApp, SMS limits per plan
- Module enable/disable per plan
- School subscription lifecycle management
- GST billing (GST number, GST on invoices)
- Subscription invoice generation and tracking
- Subscription payment recording
- White-label configuration (logo, domain, colours, login text, email headers/footers, report logo)
- Backup policies (frequency, retention, destination, encryption)
- Backup job tracking
- Queue job monitoring
- System health snapshots
- Secure API token management (scopes, expiry)
- Enterprise usage metrics
- Enterprise analytics (MRR, ARR, churn, plan breakdown)
- Production audit runs
- Security policy and security event log
- Marketplace plugin management

---

## 7. Authentication & Security Flow

### Login flow
1. User opens the login page.
2. A CAPTCHA challenge (arithmetic question) is fetched from the server.
3. User submits username, password, challenge ID, and captcha answer.
4. Server validates captcha, then validates credentials.
5. On success, server returns an access token (short-lived) and a refresh token (long-lived).
6. Tokens are stored in `localStorage` (`erp_access`, `erp_refresh`).
7. User is redirected to their role's dashboard.

### Session management
- Every API request sends `Authorization: Bearer <access_token>`.
- When the access token expires, the frontend transparently calls `/auth/token/refresh/` to get a new one.
- If refresh fails (token blacklisted or expired), a `mentriq360-session-expired` event fires and the user is returned to the login page.
- **Idle timeout:** Activity is tracked on click, keydown, mousemove, scroll, touch. After 30 minutes of inactivity (configurable via `NEXT_PUBLIC_SESSION_IDLE_MINUTES`), the session expires.
- **Cross-tab logout:** A `storage` event listener picks up token removal from any tab and logs out all tabs simultaneously.

### Security measures
- Passwords hashed with Argon2
- CAPTCHA on every login attempt
- JWT refresh token blacklisted on logout
- Server-side role + school scope enforcement on every API endpoint
- Payment gateway secrets never sent to the browser
- Audit log written on every login and write action
- Rate limiting via Redis
- Hardware attendance device authentication

---

## 8. Multi-Tenancy Model

MentriQ360 operates in **multi-tenant mode** where one backend instance serves multiple schools.

- Each school is identified by a **campus code** (e.g., `STJOHN`, `DELHI01`).
- The frontend sends an `X-Campus-Code` header on every request.
- The campus code is resolved from (in priority order):
  1. `localStorage` (after first login)
  2. URL query parameter (`?campus_code=`)
  3. Subdomain (e.g., `stjohn.mentriq360.com`) via `NEXT_PUBLIC_TENANT_DOMAIN_SUFFIX`
  4. `NEXT_PUBLIC_DEFAULT_TENANT_CODE` environment variable
- The backend's `db_router.py` uses the campus code to route MongoDB queries to the correct database alias.
- **Separate database per school** is supported via `CAMPUS_DATABASE_URLS`. Single-database isolation (strict `schoolId` filtering) is the default.
- A Super Admin's requests are not restricted by campus code — they see all schools.

---

## 9. Application Workflow

### Setting up a new school (Super Admin flow)
```
Super Admin logs in
  → Schools tab → Create School
    → Enter school name, contact, address, branding
    → System creates school record + School Admin user
    → Temporary credentials shown (copy and send to school)
  → Enterprise SaaS → Create Subscription
    → Assign plan, billing cycle, start/end date
  → School is now live
```

### School onboarding (School Admin flow)
```
School Admin logs in with temporary credentials
  → Changes password on first login
  → Classes tab → Create Academic Session
    → Create Class Sections (Grade + Section)
    → Add Subjects per grade
    → Assign Teachers to subjects
    → Build Timetable
  → Students tab → Add students (manual or bulk import)
  → Teachers & Staff tab → Add staff profiles
  → Attendance tab → Configure devices (optional)
  → School is operationally ready
```

### Daily attendance flow
```
Teacher logs in
  → Attendance tab
  → Select section and subject and date
  → Mark each student (present / absent / late / etc.)
  → Save → Attendance records written to MongoDB
```

### Fee collection flow
```
Account logs in
  → Fees tab → Create Fee Structure (amount, due day, late fee)
  → Assign fee to students
  → Student pays (online via gateway or offline)
  → Account records payment → Status auto-updates (pending → partial → paid)
  → System generates receipt PDF
  → Reminder sent if overdue (via SMS / email / WhatsApp)
```

### Exam and results flow
```
School Admin creates Exam Type and Exam Schedule
Teacher enters marks (Academics tab → Results)
School Admin reviews marks → Approves
Results published → Students can view on their portal
Admit cards generated and issued to students
```

---

## 10. Third-Party Integrations

| Service | Purpose | Where configured |
|---|---|---|
| **Razorpay** | Online fee payment gateway | Finance → Payment Gateway settings |
| **UPI / Net Banking / Card** | Alternative payment methods | Finance → Payment Gateway settings |
| **SMTP (Email)** | Email notifications, receipts, reminders | Realtime & AI → Communication Settings |
| **SMS API** | SMS notifications and fee reminders | Realtime & AI → Communication Settings |
| **WhatsApp Business API** | WhatsApp messages to parents/students | Realtime & AI → Communication Settings |
| **Biometric / RFID devices** | Hardware attendance capture | Attendance → Device Configuration |
| **AI provider** | AI summaries, study tools, notice generation | Configured via backend env variable |
| **Push notifications** | Mobile app push alerts | Realtime & AI → Push Devices |

> **Important:** Real provider credentials (API keys, SMTP passwords, WhatsApp tokens) are never stored in the repository. They must be entered in the settings screens or set as environment variables before going live.

---

## 11. Mobile App

MentriQ360 ships an **Android mobile app** built using Capacitor 8 wrapping the Next.js web app.

- Build command: `pnpm build:mobile` (sets `NEXT_PUBLIC_MOBILE=true`)
- Capacitor sync: `npx cap sync android`
- Opens in Android Studio for APK/AAB generation
- The mobile app uses the same API and auth flow as the web app
- Push notifications are supported via registered push device tokens

---

## 12. Environment Variables

### Frontend (`web/.env`)

| Variable | Purpose | Example |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Backend API base URL | `https://api.mentriq360.com/api/v1` |
| `NEXT_PUBLIC_LOCAL_API_PORT` | Dev backend port | `8000` |
| `NEXT_PUBLIC_API_TIMEOUT_MS` | Request timeout in ms | `60000` |
| `NEXT_PUBLIC_DEFAULT_TENANT_CODE` | Default campus code | `MAIN` |
| `NEXT_PUBLIC_TENANT_DOMAIN_SUFFIX` | Subdomain-based tenancy suffix | `mentriq360.com` |
| `NEXT_PUBLIC_SESSION_IDLE_MINUTES` | Idle logout time | `30` |
| `NEXT_PUBLIC_SESSION_VALIDATE_SECONDS` | Token validation interval | `300` |
| `NEXT_PUBLIC_MOBILE` | Set by mobile build script | `true` |

### Backend (`backend/.env`)

| Variable | Purpose |
|---|---|
| `DJANGO_SETTINGS_MODULE` | Settings file to use (`config.settings.production`) |
| `SECRET_KEY` | Django secret key |
| `DEBUG` | Debug mode (`False` in production) |
| `ALLOWED_HOSTS` | Comma-separated allowed hostnames |
| `DATABASE_URL` | PostgreSQL connection string (production) |
| `DJANGO_USE_SQLITE` | Use SQLite instead of PostgreSQL (`True` for local dev) |
| `MONGO_URI` | MongoDB connection string |
| `REDIS_URL` | Redis connection string |
| `CAMPUS_DATABASE_URLS` | JSON map of campus code → MongoDB URI (separate-DB tenancy) |
| `MENTRIQ_SUPER_ADMIN_PASSWORD` | Initial super admin password (random if unset) |
| `CORS_ALLOWED_ORIGINS` | Allowed CORS origins |
| `SIMPLE_JWT_*` | JWT token lifetimes and signing keys |

---

## 13. API Overview

- **Base URL:** `https://<backend-host>/api/v1/`
- **Auth prefix:** `/api/v1/auth/`
- **Docs (OpenAPI):** `/api/docs/` (drf-spectacular Swagger UI)
- **Health check:** `GET /api/v1/health/`

### Auth endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/login/` | Login with username, password, captcha |
| `POST` | `/auth/logout/` | Blacklist refresh token |
| `POST` | `/auth/token/refresh/` | Get new access token using refresh token |
| `GET` | `/auth/me/` | Get current user profile |
| `POST` | `/auth/password/change/` | Change own password |
| `GET` | `/auth/captcha/` | Get new CAPTCHA challenge |

### Key resource groups

| Group | Prefix |
|---|---|
| Schools & campuses | `/schools/`, `/campuses/` |
| Users | `/users/` (via accounts app) |
| Students | `/students/` |
| Staff | `/staff-profiles/` |
| Attendance | `/attendance-records/`, `/staff-attendance-records/` |
| Academics | `/sections/`, `/subjects/`, `/timetable-slots/`, `/learning-resources/`, `/assigned-work/`, `/result-records/` |
| Exams | `/exam-types/`, `/exam-schedules/`, `/admit-cards/` |
| Fees & payments | `/fee-structures/`, `/fee-assignments/`, `/payments/`, `/payment-gateways/` |
| Salary | `/salary-setups/`, `/salary-records/` |
| Library | `/library-books/`, `/library-loans/` |
| Transport | `/transport-routes/`, `/transport-vehicles/` |
| Hostel | `/hostel-rooms/`, `/hostel-allocations/` |
| Communication | `/message-templates/`, `/outbound-messages/`, `/communication-settings/` |
| Realtime | `/realtime/events/`, `/realtime/events/stream/` |
| Enterprise | `/saas-plans/`, `/school-subscriptions/`, `/white-label-configs/` |
| Reports | `/reports/summary/`, `/finance/reports/<type>/` |
| AI | `/ai-tools/`, `/ai-logs/` |
| Audit | `/audit-events/`, `/user-activity-logs/` |
| Public (no auth) | `/public/admissions/<school_code>/`, `/public/schools/<school_code>/website/` |

All protected endpoints require `Authorization: Bearer <access_token>` and (for school-scoped requests) `X-Campus-Code: <code>`.

---

## 14. Data Storage

| What is stored | Where |
|---|---|
| Django users, auth sessions, audit events | SQLite (dev) / PostgreSQL (prod) |
| Students, attendance, fees, exams, results, staff, library, transport, hostel | MongoDB |
| Sessions, rate-limit counters, event queues | Redis |
| Uploaded files (photos, PDFs, marks sheets) | Local media (dev) / object storage (prod) |

**Backup:** Backup policies are configurable from the Super Admin → Enterprise SaaS panel. MongoDB data should be backed up with `mongodump`. SQLite/PostgreSQL should use standard DB backup. See `docs/backup-recovery.md` for the full runbook.

---

## 15. Known Limitations

| Area | Limitation |
|---|---|
| Provider credentials | Razorpay, SMTP, SMS, WhatsApp, and AI credentials must be configured in production — they are not in the repo |
| Hardware attendance | Real biometric/RFID devices need provider-specific field mapping and network allowlisting in the client environment |
| Real-time transport | Live updates use SSE / polling. Socket.io rooms require an always-on backend service if the client needs it |
| File storage | Production must use object storage (S3-compatible) with signed URLs — local disk is dev-only |
| Separate DB per school | Requires `CAMPUS_DATABASE_URLS` and a configured MongoDB instance per school |
| SMS / WhatsApp templates | Provider template approval may be required before live sending |
| Demo data | Remove the demo school seed before client go-live unless explicitly kept for staging |

> See `docs/known-limitations.md` for the full list.

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **Campus** | A physical school branch. One school organisation may have multiple campuses. |
| **Campus code** | Short alphanumeric identifier for a campus (e.g., `STJOHN`). Used for tenant routing. |
| **Section** | A specific class group — e.g., "Grade 5 – Section A". |
| **Academic session** | A school year period (e.g., April 2025 – March 2026). |
| **Tenant** | A school/campus using the platform as an isolated data environment. |
| **Super Admin** | The platform operator who owns and manages all school accounts. |
| **School Admin** | The head administrator of a single school account. |
| **Account role** | Finance officer role scoped to fee and salary management. |
| **Capture method** | How attendance is recorded (manual, face recognition, fingerprint, card scan). |
| **Challenge ID** | Server-generated ID for a CAPTCHA question. Must be sent back with the login request. |
| **White-label** | Custom branding (logo, colours, domain) applied to the platform for a specific school. |
| **SaaS plan** | Tier of service (Basic / Standard / Premium / Enterprise) with student/feature limits. |
| **Admit card** | Official exam entry document issued to a student with roll number and venue details. |
| **Fee assignment** | An individual fee record linked to a specific student with due date and status. |
| **Salary record** | Monthly payroll entry for a staff member with attendance-adjusted final salary. |
| **Result review status** | Workflow state of a result: draft → submitted → approved / rejected. |
| **Marketplace plugin** | Third-party integration (biometric, SMS, payment, AI, storage) activatable per school. |

---

*For further details, see the dedicated files in `docs/`:*
- `architecture.md` — deep-dive on system design
- `permission-matrix.md` — full role × feature access table
- `deployment-guide.md` — step-by-step production deployment
- `api-documentation.md` — full API reference
- `security.md` — security controls and audit model
- `backup-recovery.md` — backup and disaster recovery runbook
- `database-schema.md` — MongoDB collection and SQL schema reference
- `user-manual.md` — end-user guides per role
- `known-limitations.md` — production go-live checklist
