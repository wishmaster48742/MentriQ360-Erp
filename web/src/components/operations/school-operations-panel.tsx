"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BedDouble,
  Bus,
  CalendarDays,
  LibraryBig,
  Plus,
  RefreshCcw,
  Users,
} from "lucide-react";
import {
  ApiError,
  campusApi,
  hostelAllocationApi,
  hostelRoomApi,
  libraryBookApi,
  libraryLoanApi,
  sectionApi,
  staffProfileApi,
  studentTransportApi,
  timetableApi,
  transportRouteApi,
  transportVehicleApi,
  userApi,
  type Campus,
  type ClassSection,
  type ERPUser,
  type HostelAllocation,
  type HostelRoom,
  type LibraryBook,
  type LibraryLoan,
  type StaffProfile,
  type StudentTransportAssignment,
  type TimetableSlot,
  type TransportRoute,
  type TransportVehicle,
  type UserRole,
  type Weekday,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { WorkspacePlaceholder } from "@/components/ui/workspace-placeholder";

type OperationsView = "staff" | "timetable" | "library" | "transport" | "hostel";

const today = new Date().toISOString().slice(0, 10);
const inputCls = "w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent";
const weekdayLabels: Record<Weekday, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

function asArray<T>(value: T[] | { results?: T[] }): T[] {
  return Array.isArray(value) ? value : value.results ?? [];
}

function statusVariant(active: boolean) {
  return active ? "success" : "warning";
}

function roleName(role?: UserRole) {
  if (!role) return "";
  if (role === "super_admin") return "Super Admin";
  if (role === "school_admin") return "School Admin";
  if (role === "account") return "Account";
  return role[0].toUpperCase() + role.slice(1);
}

function PanelButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition ${
        active ? "border-accent bg-accent text-white" : "border-line/70 bg-white text-muted hover:bg-slate-50 hover:text-ink"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
      {children}
    </label>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted">
        {label}
      </td>
    </tr>
  );
}

function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-line/60 bg-slate-50">
            {headers.map((header) => (
              <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function SectionLabel({ sections, id }: { sections: ClassSection[]; id?: number | null }) {
  const section = sections.find((item) => item.id === id);
  return <>{section?.label ?? section?.section_name ?? "Unassigned"}</>;
}

export function SchoolOperationsPanel() {
  const { user } = useAuth();
  const canManage = user?.role === "super_admin" || user?.role === "school_admin";
  const [activeView, setActiveView] = useState<OperationsView>("staff");
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [sections, setSections] = useState<ClassSection[]>([]);
  const [users, setUsers] = useState<ERPUser[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [timetable, setTimetable] = useState<TimetableSlot[]>([]);
  const [libraryBooks, setLibraryBooks] = useState<LibraryBook[]>([]);
  const [libraryLoans, setLibraryLoans] = useState<LibraryLoan[]>([]);
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [vehicles, setVehicles] = useState<TransportVehicle[]>([]);
  const [transportAssignments, setTransportAssignments] = useState<StudentTransportAssignment[]>([]);
  const [hostelRooms, setHostelRooms] = useState<HostelRoom[]>([]);
  const [hostelAllocations, setHostelAllocations] = useState<HostelAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [staffForm, setStaffForm] = useState({
    campus: "",
    user: "",
    employee_code: "",
    designation: "",
    department: "",
    employment_type: "full_time",
    joining_date: today,
    qualification: "",
    emergency_contact: "",
  });
  const [slotForm, setSlotForm] = useState({
    campus: "",
    section: "",
    teacher: "",
    subject: "",
    day_of_week: "1",
    start_time: "09:00",
    end_time: "09:40",
    room: "",
    effective_from: today,
  });
  const [bookForm, setBookForm] = useState({
    campus: "",
    accession_number: "",
    title: "",
    author: "",
    category: "",
    total_copies: "1",
    shelf_location: "",
  });
  const [routeForm, setRouteForm] = useState({
    campus: "",
    name: "",
    route_code: "",
    start_point: "",
    end_point: "",
    stops: "",
  });
  const [vehicleForm, setVehicleForm] = useState({
    campus: "",
    route: "",
    vehicle_number: "",
    driver_name: "",
    driver_phone: "",
    capacity: "30",
    gps_device_id: "",
  });
  const [hostelRoomForm, setHostelRoomForm] = useState({
    campus: "",
    hostel_name: "",
    room_number: "",
    floor: "",
    capacity: "1",
  });

  const teachers = useMemo(() => users.filter((item) => item.role === "teacher"), [users]);
  const staffUsers = useMemo(
    () => users.filter((item) => item.role === "teacher" || item.role === "school_admin" || item.role === "super_admin"),
    [users],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [
        campusRes,
        sectionRes,
        staffRes,
        timetableRes,
        bookRes,
        loanRes,
        routeRes,
        vehicleRes,
        transportAssignmentRes,
        hostelRoomRes,
        hostelAllocationRes,
        userRes,
      ] = await Promise.all([
        campusApi.list(),
        sectionApi.list(),
        staffProfileApi.list(),
        timetableApi.list(),
        libraryBookApi.list(),
        libraryLoanApi.list(),
        transportRouteApi.list(),
        transportVehicleApi.list(),
        studentTransportApi.list(),
        hostelRoomApi.list(),
        hostelAllocationApi.list(),
        canManage ? userApi.list() : Promise.resolve([] as ERPUser[]),
      ]);
      const campusList = asArray(campusRes);
      const sectionList = asArray(sectionRes);
      setCampuses(campusList);
      setSections(sectionList);
      setStaffProfiles(asArray(staffRes));
      setTimetable(asArray(timetableRes));
      setLibraryBooks(asArray(bookRes));
      setLibraryLoans(asArray(loanRes));
      setRoutes(asArray(routeRes));
      setVehicles(asArray(vehicleRes));
      setTransportAssignments(asArray(transportAssignmentRes));
      setHostelRooms(asArray(hostelRoomRes));
      setHostelAllocations(asArray(hostelAllocationRes));
      setUsers(asArray(userRes));

      const firstCampus = String(campusList[0]?.id ?? "");
      const firstSection = String(sectionList[0]?.id ?? "");
      setStaffForm((form) => ({ ...form, campus: form.campus || firstCampus }));
      setSlotForm((form) => ({ ...form, campus: form.campus || firstCampus, section: form.section || firstSection }));
      setBookForm((form) => ({ ...form, campus: form.campus || firstCampus }));
      setRouteForm((form) => ({ ...form, campus: form.campus || firstCampus }));
      setVehicleForm((form) => ({ ...form, campus: form.campus || firstCampus }));
      setHostelRoomForm((form) => ({ ...form, campus: form.campus || firstCampus }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load school operations.");
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveStaffProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!canManage || !staffForm.campus || !staffForm.user) return;
    setSaving(true);
    setError("");
    try {
      await staffProfileApi.create({
        campus: Number(staffForm.campus),
        user: Number(staffForm.user),
        employee_code: staffForm.employee_code.trim(),
        designation: staffForm.designation.trim(),
        department: staffForm.department.trim(),
        employment_type: staffForm.employment_type as StaffProfile["employment_type"],
        joining_date: staffForm.joining_date,
        qualification: staffForm.qualification.trim(),
        emergency_contact: staffForm.emergency_contact.trim(),
        status: "active",
      });
      setStaffForm((form) => ({ ...form, employee_code: "", designation: "", department: "", qualification: "", emergency_contact: "" }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Staff profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTimetableSlot(event: React.FormEvent) {
    event.preventDefault();
    if (!canManage || !slotForm.campus || !slotForm.section) return;
    setSaving(true);
    setError("");
    try {
      await timetableApi.create({
        campus: Number(slotForm.campus),
        section: Number(slotForm.section),
        teacher: slotForm.teacher ? Number(slotForm.teacher) : null,
        subject: slotForm.subject.trim(),
        day_of_week: Number(slotForm.day_of_week) as Weekday,
        start_time: slotForm.start_time,
        end_time: slotForm.end_time,
        room: slotForm.room.trim(),
        effective_from: slotForm.effective_from,
        effective_to: null,
      });
      setSlotForm((form) => ({ ...form, subject: "", room: "" }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Timetable slot could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function saveBook(event: React.FormEvent) {
    event.preventDefault();
    if (!canManage || !bookForm.campus) return;
    setSaving(true);
    setError("");
    try {
      const copies = Math.max(Number(bookForm.total_copies) || 1, 1);
      await libraryBookApi.create({
        campus: Number(bookForm.campus),
        accession_number: bookForm.accession_number.trim(),
        title: bookForm.title.trim(),
        author: bookForm.author.trim(),
        isbn: "",
        category: bookForm.category.trim(),
        total_copies: copies,
        available_copies: copies,
        shelf_location: bookForm.shelf_location.trim(),
        status: "active",
      });
      setBookForm((form) => ({ ...form, accession_number: "", title: "", author: "", category: "", shelf_location: "" }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Library book could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function saveRoute(event: React.FormEvent) {
    event.preventDefault();
    if (!canManage || !routeForm.campus) return;
    setSaving(true);
    setError("");
    try {
      await transportRouteApi.create({
        campus: Number(routeForm.campus),
        name: routeForm.name.trim(),
        route_code: routeForm.route_code.trim(),
        start_point: routeForm.start_point.trim(),
        end_point: routeForm.end_point.trim(),
        stops: routeForm.stops.split(",").map((item) => item.trim()).filter(Boolean),
        is_active: true,
      });
      setRouteForm((form) => ({ ...form, name: "", route_code: "", start_point: "", end_point: "", stops: "" }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transport route could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function saveVehicle(event: React.FormEvent) {
    event.preventDefault();
    if (!canManage || !vehicleForm.campus) return;
    setSaving(true);
    setError("");
    try {
      await transportVehicleApi.create({
        campus: Number(vehicleForm.campus),
        route: vehicleForm.route ? Number(vehicleForm.route) : null,
        vehicle_number: vehicleForm.vehicle_number.trim(),
        driver_name: vehicleForm.driver_name.trim(),
        driver_phone: vehicleForm.driver_phone.trim(),
        capacity: Math.max(Number(vehicleForm.capacity) || 1, 1),
        gps_device_id: vehicleForm.gps_device_id.trim(),
        is_active: true,
      });
      setVehicleForm((form) => ({ ...form, vehicle_number: "", driver_name: "", driver_phone: "", gps_device_id: "" }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Transport vehicle could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function saveHostelRoom(event: React.FormEvent) {
    event.preventDefault();
    if (!canManage || !hostelRoomForm.campus) return;
    setSaving(true);
    setError("");
    try {
      await hostelRoomApi.create({
        campus: Number(hostelRoomForm.campus),
        hostel_name: hostelRoomForm.hostel_name.trim(),
        room_number: hostelRoomForm.room_number.trim(),
        floor: hostelRoomForm.floor.trim(),
        capacity: Math.max(Number(hostelRoomForm.capacity) || 1, 1),
        is_active: true,
      });
      setHostelRoomForm((form) => ({ ...form, hostel_name: "", room_number: "", floor: "" }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Hostel room could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <WorkspacePlaceholder title="School operations" detail="Preparing staff, timetable, library, transport, and hostel data." />;
  }

  return (
    <div className="space-y-6">
      <div className="mastersoft-page-title flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <span>Operational Management</span>
          <span className="mt-1 block text-sm font-medium text-muted">Staff, timetable, library, transport, and hostel services</span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line/70 bg-white px-3 text-sm font-medium text-muted shadow-sm hover:bg-slate-50 hover:text-ink"
        >
          <RefreshCcw size={14} />
          Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Staff", value: staffProfiles.length, icon: Users },
          { label: "Timetable", value: timetable.length, icon: CalendarDays },
          { label: "Books", value: libraryBooks.length, icon: LibraryBig },
          { label: "Routes", value: routes.length, icon: Bus },
          { label: "Rooms", value: hostelRooms.length, icon: BedDouble },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="surface flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-soft text-accent-strong">
              <Icon size={18} />
            </span>
          </div>
        ))}
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Operations navigation">
        <PanelButton active={activeView === "staff"} icon={Users} label="Staff" onClick={() => setActiveView("staff")} />
        <PanelButton active={activeView === "timetable"} icon={CalendarDays} label="Timetable" onClick={() => setActiveView("timetable")} />
        <PanelButton active={activeView === "library"} icon={LibraryBig} label="Library" onClick={() => setActiveView("library")} />
        <PanelButton active={activeView === "transport"} icon={Bus} label="Transport" onClick={() => setActiveView("transport")} />
        <PanelButton active={activeView === "hostel"} icon={BedDouble} label="Hostel" onClick={() => setActiveView("hostel")} />
      </nav>

      {activeView === "staff" && (
        <section className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
          {canManage && (
            <form onSubmit={saveStaffProfile} className="surface space-y-4 p-4">
              <h2 className="text-base font-semibold text-ink">Staff Profile</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Campus">
                  <select className={inputCls} value={staffForm.campus} onChange={(event) => setStaffForm((form) => ({ ...form, campus: event.target.value }))}>
                    {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                  </select>
                </Field>
                <Field label="User">
                  <select className={inputCls} value={staffForm.user} onChange={(event) => setStaffForm((form) => ({ ...form, user: event.target.value }))}>
                    <option value="">Select user</option>
                    {staffUsers.map((staffUser) => <option key={staffUser.id} value={staffUser.id}>{staffUser.full_name || staffUser.username} ({roleName(staffUser.role)})</option>)}
                  </select>
                </Field>
                <Field label="Employee Code"><input className={inputCls} value={staffForm.employee_code} onChange={(event) => setStaffForm((form) => ({ ...form, employee_code: event.target.value }))} required /></Field>
                <Field label="Designation"><input className={inputCls} value={staffForm.designation} onChange={(event) => setStaffForm((form) => ({ ...form, designation: event.target.value }))} required /></Field>
                <Field label="Department"><input className={inputCls} value={staffForm.department} onChange={(event) => setStaffForm((form) => ({ ...form, department: event.target.value }))} /></Field>
                <Field label="Joining Date"><input type="date" className={inputCls} value={staffForm.joining_date} onChange={(event) => setStaffForm((form) => ({ ...form, joining_date: event.target.value }))} required /></Field>
              </div>
              <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60">
                <Plus size={14} />
                {saving ? "Saving..." : "Add profile"}
              </button>
            </form>
          )}
          <div className="surface overflow-hidden">
            <DataTable headers={["Employee", "Designation", "Department", "Campus", "Status"]}>
              {staffProfiles.length ? staffProfiles.map((profile) => (
                <tr key={profile.id} className="border-b border-line/40">
                  <td className="px-4 py-3 font-medium text-ink">{profile.user_name}<span className="block text-xs text-muted">{profile.employee_code}</span></td>
                  <td className="px-4 py-3 text-muted">{profile.designation}</td>
                  <td className="px-4 py-3 text-muted">{profile.department || "General"}</td>
                  <td className="px-4 py-3 text-muted">{profile.campus_name}</td>
                  <td className="px-4 py-3"><Badge variant={profile.status === "active" ? "success" : "warning"}>{profile.status}</Badge></td>
                </tr>
              )) : <EmptyRow colSpan={5} label="No staff profiles found." />}
            </DataTable>
          </div>
        </section>
      )}

      {activeView === "timetable" && (
        <section className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
          {canManage && (
            <form onSubmit={saveTimetableSlot} className="surface space-y-4 p-4">
              <h2 className="text-base font-semibold text-ink">Timetable Slot</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Campus">
                  <select className={inputCls} value={slotForm.campus} onChange={(event) => setSlotForm((form) => ({ ...form, campus: event.target.value }))}>
                    {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                  </select>
                </Field>
                <Field label="Section">
                  <select className={inputCls} value={slotForm.section} onChange={(event) => {
                    const section = sections.find((item) => item.id === Number(event.target.value));
                    setSlotForm((form) => ({ ...form, section: event.target.value, campus: section ? String(section.campus) : form.campus }));
                  }}>
                    {sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
                  </select>
                </Field>
                <Field label="Teacher">
                  <select className={inputCls} value={slotForm.teacher} onChange={(event) => setSlotForm((form) => ({ ...form, teacher: event.target.value }))}>
                    <option value="">Unassigned</option>
                    {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name || teacher.username}</option>)}
                  </select>
                </Field>
                <Field label="Subject"><input className={inputCls} value={slotForm.subject} onChange={(event) => setSlotForm((form) => ({ ...form, subject: event.target.value }))} required /></Field>
                <Field label="Day">
                  <select className={inputCls} value={slotForm.day_of_week} onChange={(event) => setSlotForm((form) => ({ ...form, day_of_week: event.target.value }))}>
                    {Object.entries(weekdayLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Room"><input className={inputCls} value={slotForm.room} onChange={(event) => setSlotForm((form) => ({ ...form, room: event.target.value }))} /></Field>
                <Field label="Start"><input type="time" className={inputCls} value={slotForm.start_time} onChange={(event) => setSlotForm((form) => ({ ...form, start_time: event.target.value }))} required /></Field>
                <Field label="End"><input type="time" className={inputCls} value={slotForm.end_time} onChange={(event) => setSlotForm((form) => ({ ...form, end_time: event.target.value }))} required /></Field>
              </div>
              <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60">
                <Plus size={14} />
                {saving ? "Saving..." : "Add slot"}
              </button>
            </form>
          )}
          <div className="surface overflow-hidden">
            <DataTable headers={["Day", "Time", "Class", "Subject", "Teacher", "Room"]}>
              {timetable.length ? timetable.map((slot) => (
                <tr key={slot.id} className="border-b border-line/40">
                  <td className="px-4 py-3 font-medium text-ink">{slot.day_name ?? weekdayLabels[slot.day_of_week]}</td>
                  <td className="px-4 py-3 text-muted">{slot.start_time} - {slot.end_time}</td>
                  <td className="px-4 py-3 text-muted">{slot.section_label ?? <SectionLabel sections={sections} id={slot.section} />}</td>
                  <td className="px-4 py-3 text-ink">{slot.subject}</td>
                  <td className="px-4 py-3 text-muted">{slot.teacher_name || "Unassigned"}</td>
                  <td className="px-4 py-3 text-muted">{slot.room || "-"}</td>
                </tr>
              )) : <EmptyRow colSpan={6} label="No timetable slots found." />}
            </DataTable>
          </div>
        </section>
      )}

      {activeView === "library" && (
        <section className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
          {canManage && (
            <form onSubmit={saveBook} className="surface space-y-4 p-4">
              <h2 className="text-base font-semibold text-ink">Library Book</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Campus">
                  <select className={inputCls} value={bookForm.campus} onChange={(event) => setBookForm((form) => ({ ...form, campus: event.target.value }))}>
                    {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                  </select>
                </Field>
                <Field label="Accession"><input className={inputCls} value={bookForm.accession_number} onChange={(event) => setBookForm((form) => ({ ...form, accession_number: event.target.value }))} required /></Field>
                <Field label="Title"><input className={inputCls} value={bookForm.title} onChange={(event) => setBookForm((form) => ({ ...form, title: event.target.value }))} required /></Field>
                <Field label="Author"><input className={inputCls} value={bookForm.author} onChange={(event) => setBookForm((form) => ({ ...form, author: event.target.value }))} /></Field>
                <Field label="Category"><input className={inputCls} value={bookForm.category} onChange={(event) => setBookForm((form) => ({ ...form, category: event.target.value }))} /></Field>
                <Field label="Copies"><input type="number" min={1} className={inputCls} value={bookForm.total_copies} onChange={(event) => setBookForm((form) => ({ ...form, total_copies: event.target.value }))} /></Field>
              </div>
              <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60">
                <Plus size={14} />
                {saving ? "Saving..." : "Add book"}
              </button>
            </form>
          )}
          <div className="grid gap-4">
            <div className="surface overflow-hidden">
              <DataTable headers={["Book", "Category", "Campus", "Copies", "Status"]}>
                {libraryBooks.length ? libraryBooks.map((book) => (
                  <tr key={book.id} className="border-b border-line/40">
                    <td className="px-4 py-3 font-medium text-ink">{book.title}<span className="block text-xs text-muted">{book.accession_number}</span></td>
                    <td className="px-4 py-3 text-muted">{book.category || "-"}</td>
                    <td className="px-4 py-3 text-muted">{book.campus_name}</td>
                    <td className="px-4 py-3 text-muted">{book.available_copies} / {book.total_copies}</td>
                    <td className="px-4 py-3"><Badge variant={book.status === "active" ? "success" : "warning"}>{book.status}</Badge></td>
                  </tr>
                )) : <EmptyRow colSpan={5} label="No library books found." />}
              </DataTable>
            </div>
            <div className="surface overflow-hidden">
              <DataTable headers={["Loan", "Borrower", "Due", "Fine", "Status"]}>
                {libraryLoans.length ? libraryLoans.slice(0, 8).map((loan) => (
                  <tr key={loan.id} className="border-b border-line/40">
                    <td className="px-4 py-3 font-medium text-ink">{loan.book_title}</td>
                    <td className="px-4 py-3 text-muted">{loan.borrower_name || "Borrower"}</td>
                    <td className="px-4 py-3 text-muted">{loan.due_on}</td>
                    <td className="px-4 py-3 text-muted">{loan.fine_amount}</td>
                    <td className="px-4 py-3"><Badge variant={loan.status === "issued" ? "warning" : "success"}>{loan.status}</Badge></td>
                  </tr>
                )) : <EmptyRow colSpan={5} label="No library loans found." />}
              </DataTable>
            </div>
          </div>
        </section>
      )}

      {activeView === "transport" && (
        <section className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
          {canManage && (
            <div className="grid gap-4">
              <form onSubmit={saveRoute} className="surface space-y-4 p-4">
                <h2 className="text-base font-semibold text-ink">Transport Route</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Campus">
                    <select className={inputCls} value={routeForm.campus} onChange={(event) => setRouteForm((form) => ({ ...form, campus: event.target.value }))}>
                      {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Route Code"><input className={inputCls} value={routeForm.route_code} onChange={(event) => setRouteForm((form) => ({ ...form, route_code: event.target.value }))} required /></Field>
                  <Field label="Name"><input className={inputCls} value={routeForm.name} onChange={(event) => setRouteForm((form) => ({ ...form, name: event.target.value }))} required /></Field>
                  <Field label="Start"><input className={inputCls} value={routeForm.start_point} onChange={(event) => setRouteForm((form) => ({ ...form, start_point: event.target.value }))} required /></Field>
                  <Field label="End"><input className={inputCls} value={routeForm.end_point} onChange={(event) => setRouteForm((form) => ({ ...form, end_point: event.target.value }))} required /></Field>
                  <Field label="Stops"><input className={inputCls} value={routeForm.stops} onChange={(event) => setRouteForm((form) => ({ ...form, stops: event.target.value }))} /></Field>
                </div>
                <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60">
                  <Plus size={14} />
                  {saving ? "Saving..." : "Add route"}
                </button>
              </form>
              <form onSubmit={saveVehicle} className="surface space-y-4 p-4">
                <h2 className="text-base font-semibold text-ink">Transport Vehicle</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Campus">
                    <select className={inputCls} value={vehicleForm.campus} onChange={(event) => setVehicleForm((form) => ({ ...form, campus: event.target.value }))}>
                      {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Route">
                    <select className={inputCls} value={vehicleForm.route} onChange={(event) => setVehicleForm((form) => ({ ...form, route: event.target.value }))}>
                      <option value="">Unassigned</option>
                      {routes.map((route) => <option key={route.id} value={route.id}>{route.route_code} - {route.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Vehicle"><input className={inputCls} value={vehicleForm.vehicle_number} onChange={(event) => setVehicleForm((form) => ({ ...form, vehicle_number: event.target.value }))} required /></Field>
                  <Field label="Driver"><input className={inputCls} value={vehicleForm.driver_name} onChange={(event) => setVehicleForm((form) => ({ ...form, driver_name: event.target.value }))} required /></Field>
                  <Field label="Phone"><input className={inputCls} value={vehicleForm.driver_phone} onChange={(event) => setVehicleForm((form) => ({ ...form, driver_phone: event.target.value }))} /></Field>
                  <Field label="Capacity"><input type="number" min={1} className={inputCls} value={vehicleForm.capacity} onChange={(event) => setVehicleForm((form) => ({ ...form, capacity: event.target.value }))} /></Field>
                </div>
                <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60">
                  <Plus size={14} />
                  {saving ? "Saving..." : "Add vehicle"}
                </button>
              </form>
            </div>
          )}
          <div className="grid gap-4">
            <div className="surface overflow-hidden">
              <DataTable headers={["Route", "Start", "End", "Stops", "Status"]}>
                {routes.length ? routes.map((route) => (
                  <tr key={route.id} className="border-b border-line/40">
                    <td className="px-4 py-3 font-medium text-ink">{route.route_code}<span className="block text-xs text-muted">{route.name}</span></td>
                    <td className="px-4 py-3 text-muted">{route.start_point}</td>
                    <td className="px-4 py-3 text-muted">{route.end_point}</td>
                    <td className="px-4 py-3 text-muted">{route.stops?.length ?? 0}</td>
                    <td className="px-4 py-3"><Badge variant={statusVariant(route.is_active)}>{route.is_active ? "active" : "inactive"}</Badge></td>
                  </tr>
                )) : <EmptyRow colSpan={5} label="No routes found." />}
              </DataTable>
            </div>
            <div className="surface overflow-hidden">
              <DataTable headers={["Vehicle", "Route", "Driver", "Capacity", "Status"]}>
                {vehicles.length ? vehicles.map((vehicle) => (
                  <tr key={vehicle.id} className="border-b border-line/40">
                    <td className="px-4 py-3 font-medium text-ink">{vehicle.vehicle_number}</td>
                    <td className="px-4 py-3 text-muted">{vehicle.route_name || "Unassigned"}</td>
                    <td className="px-4 py-3 text-muted">{vehicle.driver_name}</td>
                    <td className="px-4 py-3 text-muted">{vehicle.capacity}</td>
                    <td className="px-4 py-3"><Badge variant={statusVariant(vehicle.is_active)}>{vehicle.is_active ? "active" : "inactive"}</Badge></td>
                  </tr>
                )) : <EmptyRow colSpan={5} label="No vehicles found." />}
              </DataTable>
            </div>
            <div className="surface overflow-hidden">
              <DataTable headers={["Student", "Route", "Vehicle", "Pickup", "Status"]}>
                {transportAssignments.length ? transportAssignments.slice(0, 8).map((assignment) => (
                  <tr key={assignment.id} className="border-b border-line/40">
                    <td className="px-4 py-3 font-medium text-ink">{assignment.student_name}</td>
                    <td className="px-4 py-3 text-muted">{assignment.route_name}</td>
                    <td className="px-4 py-3 text-muted">{assignment.vehicle_number || "-"}</td>
                    <td className="px-4 py-3 text-muted">{assignment.pickup_stop}</td>
                    <td className="px-4 py-3"><Badge variant={statusVariant(assignment.is_active)}>{assignment.is_active ? "active" : "inactive"}</Badge></td>
                  </tr>
                )) : <EmptyRow colSpan={5} label="No student transport assignments found." />}
              </DataTable>
            </div>
          </div>
        </section>
      )}

      {activeView === "hostel" && (
        <section className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
          {canManage && (
            <form onSubmit={saveHostelRoom} className="surface space-y-4 p-4">
              <h2 className="text-base font-semibold text-ink">Hostel Room</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Campus">
                  <select className={inputCls} value={hostelRoomForm.campus} onChange={(event) => setHostelRoomForm((form) => ({ ...form, campus: event.target.value }))}>
                    {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                  </select>
                </Field>
                <Field label="Hostel"><input className={inputCls} value={hostelRoomForm.hostel_name} onChange={(event) => setHostelRoomForm((form) => ({ ...form, hostel_name: event.target.value }))} required /></Field>
                <Field label="Room"><input className={inputCls} value={hostelRoomForm.room_number} onChange={(event) => setHostelRoomForm((form) => ({ ...form, room_number: event.target.value }))} required /></Field>
                <Field label="Floor"><input className={inputCls} value={hostelRoomForm.floor} onChange={(event) => setHostelRoomForm((form) => ({ ...form, floor: event.target.value }))} /></Field>
                <Field label="Capacity"><input type="number" min={1} className={inputCls} value={hostelRoomForm.capacity} onChange={(event) => setHostelRoomForm((form) => ({ ...form, capacity: event.target.value }))} /></Field>
              </div>
              <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white disabled:opacity-60">
                <Plus size={14} />
                {saving ? "Saving..." : "Add room"}
              </button>
            </form>
          )}
          <div className="grid gap-4">
            <div className="surface overflow-hidden">
              <DataTable headers={["Hostel", "Room", "Floor", "Capacity", "Status"]}>
                {hostelRooms.length ? hostelRooms.map((room) => (
                  <tr key={room.id} className="border-b border-line/40">
                    <td className="px-4 py-3 font-medium text-ink">{room.hostel_name}</td>
                    <td className="px-4 py-3 text-muted">{room.room_number}</td>
                    <td className="px-4 py-3 text-muted">{room.floor || "-"}</td>
                    <td className="px-4 py-3 text-muted">{room.capacity}</td>
                    <td className="px-4 py-3"><Badge variant={statusVariant(room.is_active)}>{room.is_active ? "active" : "inactive"}</Badge></td>
                  </tr>
                )) : <EmptyRow colSpan={5} label="No hostel rooms found." />}
              </DataTable>
            </div>
            <div className="surface overflow-hidden">
              <DataTable headers={["Student", "Room", "Bed", "Start", "Status"]}>
                {hostelAllocations.length ? hostelAllocations.slice(0, 8).map((allocation) => (
                  <tr key={allocation.id} className="border-b border-line/40">
                    <td className="px-4 py-3 font-medium text-ink">{allocation.student_name}</td>
                    <td className="px-4 py-3 text-muted">{allocation.room_label}</td>
                    <td className="px-4 py-3 text-muted">{allocation.bed_number}</td>
                    <td className="px-4 py-3 text-muted">{allocation.start_date}</td>
                    <td className="px-4 py-3"><Badge variant={statusVariant(allocation.is_active)}>{allocation.is_active ? "active" : "inactive"}</Badge></td>
                  </tr>
                )) : <EmptyRow colSpan={5} label="No hostel allocations found." />}
              </DataTable>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
