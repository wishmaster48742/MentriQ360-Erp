"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Globe2,
  Image,
  Link,
  ListOrdered,
  Newspaper,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  Type,
  Layout,
  FileText,
  Megaphone,
  CalendarDays,
  GraduationCap,
  MessageSquareText,
  ToggleLeft,
} from "lucide-react";
import { phase10Api, type SchoolWebsiteContent } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";

type ContentType = "page" | "news" | "notice" | "gallery" | "event" | "admission" | "contact";

const CONTENT_TYPES: { value: ContentType; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { value: "page", label: "Page", icon: Layout },
  { value: "news", label: "News", icon: Newspaper },
  { value: "notice", label: "Notice", icon: Megaphone },
  { value: "gallery", label: "Gallery", icon: Image },
  { value: "event", label: "Event", icon: CalendarDays },
  { value: "admission", label: "Admission", icon: GraduationCap },
  { value: "contact", label: "Contact", icon: MessageSquareText },
];

const inputCls =
  "w-full rounded-2xl border border-line/80 bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20";

export function WebsiteCMS() {
  const [contents, setContents] = useState<SchoolWebsiteContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolWebsiteContent | null>(null);

  const [formContentType, setFormContentType] = useState<ContentType>("page");
  const [formTitle, setFormTitle] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formSummary, setFormSummary] = useState("");
  const [formMediaUrl, setFormMediaUrl] = useState("");
  const [formPublishAt, setFormPublishAt] = useState("");
  const [formIsPublished, setFormIsPublished] = useState(true);
  const [formSortOrder, setFormSortOrder] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await phase10Api.website.list();
      setContents(res as SchoolWebsiteContent[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load website content.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openCreateModal() {
    setEditing(null);
    setFormContentType("news");
    setFormTitle("");
    setFormSlug("");
    setFormBody("");
    setFormSummary("");
    setFormMediaUrl("");
    setFormPublishAt(new Date().toISOString().slice(0, 16));
    setFormIsPublished(true);
    setFormSortOrder(0);
    setModalOpen(true);
  }

  function openEditModal(item: SchoolWebsiteContent) {
    setEditing(item);
    setFormContentType((item.content_type || "news") as ContentType);
    setFormTitle(item.title || "");
    setFormSlug(item.slug || "");
    setFormBody(item.body || "");
    setFormSummary(item.summary || "");
    setFormMediaUrl(item.media_url || "");
    setFormPublishAt(item.publish_at ? item.publish_at.slice(0, 16) : new Date().toISOString().slice(0, 16));
    setFormIsPublished(item.is_published);
    setFormSortOrder(item.sort_order ?? 0);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        campus: 0,
        content_type: formContentType,
        title: formTitle,
        slug: formSlug || formTitle.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
        body: formBody,
        summary: formSummary,
        media_url: formMediaUrl,
        metadata: {},
        publish_at: formPublishAt ? new Date(formPublishAt).toISOString() : new Date().toISOString(),
        is_published: formIsPublished,
        sort_order: formSortOrder,
      };

      if (editing) {
        await phase10Api.website.update(editing.id, payload);
      } else {
        await phase10Api.website.create(payload);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function removeContent(id: number) {
    if (!confirm("Delete this content?")) return;
    try {
      await phase10Api.website.remove(id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  const contentTypeIcon = (type: string) => {
    const found = CONTENT_TYPES.find((ct) => ct.value === type);
    const Icon = found?.icon ?? Globe2;
    return <Icon size={14} />;
  };

  const filteredContents = useMemo(() => {
    const q = search.toLowerCase();
    return contents.filter((c) => !q || c.title?.toLowerCase().includes(q) || c.content_type?.toLowerCase().includes(q) || c.slug?.toLowerCase().includes(q));
  }, [contents, search]);

  if (loading) {
    return (
      <div className="surface flex items-center justify-center p-16">
        <RefreshCcw size={20} className="animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="surface p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="section-kicker">
              <Globe2 size={14} />
              CMS
            </span>
            <h1 className="display-font mt-3 text-2xl font-semibold text-ink">Website content manager</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Create and manage pages, news, notices, galleries, events, admission info, and contact content for the public school website.
            </p>
          </div>
          <button type="button" onClick={load} className="flex items-center gap-2 rounded-lg border border-line/70 bg-white px-4 py-2 text-sm font-medium text-muted hover:bg-slate-50 hover:text-ink">
            <RefreshCcw size={14} />
            Refresh
          </button>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {CONTENT_TYPES.map(({ value, label, icon: Icon }) => {
          const count = contents.filter((c) => c.content_type === value).length;
          return (
            <div key={value} className="surface rounded-3xl p-5 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-blue-700 text-white">
                  <Icon size={18} />
                </div>
              </div>
              <p className="display-font mt-3 text-4xl font-bold text-ink">{count}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-72">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title, type, or slug..." className={inputCls + " pl-9"} />
        </div>
        <button type="button" onClick={openCreateModal} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5">
          <Plus size={14} />
          New content
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <div className="surface overflow-hidden shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/60 bg-slate-50">
                {["Type", "Title", "Slug", "Status", "Published", "Order", "Actions"].map((head) => (
                  <th key={head} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredContents.map((item) => (
                <tr key={item.id} className="border-b border-line/40 hover:bg-slate-50/60">
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-line/60 bg-slate-50 px-2 py-1 text-xs font-medium capitalize text-ink">
                      {contentTypeIcon(item.content_type)}
                      {item.content_type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-ink">{item.title || "Untitled"}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-muted">/{item.slug}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant={item.is_published ? "success" : "neutral"}>{item.is_published ? "published" : "draft"}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-muted">{item.publish_at ? new Date(item.publish_at).toLocaleDateString("en-IN") : "—"}</td>
                  <td className="px-5 py-3.5 text-center text-sm text-muted">{item.sort_order ?? 0}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => openEditModal(item)} className="flex items-center gap-1 rounded-xl border border-teal-200 px-2.5 py-1.5 text-xs font-medium text-teal-700 transition hover:bg-teal-50">
                        <Pencil size={12} />
                        Edit
                      </button>
                      <button type="button" onClick={() => removeContent(item.id)} className="flex items-center gap-1 rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredContents.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted">
                    {search ? "No matching content found." : "No website content yet. Create your first piece of content above."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit content" : "New content"} size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-ink">Content type</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {CONTENT_TYPES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFormContentType(value)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                      formContentType === value
                        ? "border-teal-400 bg-teal-50 text-teal-700"
                        : "border-line/70 text-muted hover:bg-slate-50 hover:text-ink"
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink">
                  <Type size={14} className="mr-1 inline text-muted" />
                  Title
                </label>
                <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} required className={inputCls + " mt-1"} placeholder="Enter title" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink">
                  <Link size={14} className="mr-1 inline text-muted" />
                  Slug
                </label>
                <input value={formSlug} onChange={(e) => setFormSlug(e.target.value)} className={inputCls + " mt-1 font-mono text-xs"} placeholder="auto-generated from title" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink">
              <FileText size={14} className="mr-1 inline text-muted" />
              Body content
            </label>
            <textarea value={formBody} onChange={(e) => setFormBody(e.target.value)} rows={6} className={inputCls + " mt-1 resize-y"} placeholder="Full content body (supports HTML)" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-ink">
                <FileText size={14} className="mr-1 inline text-muted" />
                Summary
              </label>
              <textarea value={formSummary} onChange={(e) => setFormSummary(e.target.value)} rows={2} className={inputCls + " mt-1 resize-none"} placeholder="Short summary / excerpt" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image size={14} className="mr-1 inline text-muted" />
                Media URL
              </label>
              <input value={formMediaUrl} onChange={(e) => setFormMediaUrl(e.target.value)} className={inputCls + " mt-1 font-mono text-xs"} placeholder="https://example.com/image.jpg" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-ink">
                <Calendar size={14} className="mr-1 inline text-muted" />
                Publish date
              </label>
              <input type="datetime-local" value={formPublishAt} onChange={(e) => setFormPublishAt(e.target.value)} className={inputCls + " mt-1"} />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">
                <ToggleLeft size={14} className="mr-1 inline text-muted" />
                Status
              </label>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFormIsPublished(true)}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                    formIsPublished ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-line/70 text-muted hover:bg-slate-50"
                  }`}
                >
                  <CheckCircle2 size={12} />
                  Published
                </button>
                <button
                  type="button"
                  onClick={() => setFormIsPublished(false)}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                    !formIsPublished ? "border-slate-300 bg-slate-100 text-ink" : "border-line/70 text-muted hover:bg-slate-50"
                  }`}
                >
                  Draft
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">
                <ListOrdered size={14} className="mr-1 inline text-muted" />
                Sort order
              </label>
              <input type="number" value={formSortOrder} onChange={(e) => setFormSortOrder(Number(e.target.value))} className={inputCls + " mt-1"} min={0} />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-line/60 pt-4">
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-2xl border border-line/70 px-4 py-2 text-sm font-medium text-ink hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-blue-700 px-5 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 disabled:opacity-60">
              {busy ? "Saving..." : editing ? "Update content" : "Publish content"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
