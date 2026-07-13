"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Building2, ChevronDown, ChevronUp, GraduationCap, Pencil, Plus, Trash2, Users } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { PremiumCard } from "@/components/premium-card";

type Teacher = { id: string; name: string; email: string; isActive: boolean };
type ClassSection = {
  id: string; classId: string; name: string; room: string | null; capacity: number;
  classTeacherId: string | null; isActive: boolean;
};
type AcademicClass = {
  id: string; name: string; code: string; academicYear: string; description: string | null;
  isActive: boolean; sections: ClassSection[];
};

const emptyClass = { name: "", code: "", academicYear: new Date().getFullYear().toString(), description: "", isActive: true };
const emptySection = { name: "", room: "", capacity: 30, classTeacherId: "", isActive: true };

export function ClassesManagement({ mode, teachers }: { mode: "create" | "manage"; teachers: Teacher[] }) {
  const [classes, setClasses] = useState<AcademicClass[]>([]);
  const [classForm, setClassForm] = useState(emptyClass);
  const [sectionForms, setSectionForms] = useState<Record<string, typeof emptySection>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingClass, setEditingClass] = useState<AcademicClass | null>(null);
  const [editingSection, setEditingSection] = useState<ClassSection | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { void loadClasses(); }, []);

  async function loadClasses() {
    try { setClasses(await apiFetch<AcademicClass[]>("/api/admin/classes")); }
    catch { setMessage("Classes could not be loaded. Apply the database migration and try again."); }
  }

  const totals = useMemo(() => ({
    active: classes.filter((item) => item.isActive).length,
    sections: classes.reduce((total, item) => total + item.sections.length, 0),
    capacity: classes.reduce((total, item) => total + item.sections.reduce((sum, section) => sum + section.capacity, 0), 0),
  }), [classes]);

  function notify(value: string) { setMessage(value); window.setTimeout(() => setMessage(null), 3500); }

  async function createClass(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await apiFetch("/api/admin/classes", { method: "POST", body: JSON.stringify(classForm) });
      setClassForm(emptyClass); notify("Class created successfully."); await loadClasses();
    } catch (error) { notify(error instanceof Error && error.message.includes("already exists") ? "That class code is already in use." : "Class could not be created."); }
    finally { setBusy(false); }
  }

  async function saveClass(event: FormEvent) {
    event.preventDefault(); if (!editingClass) return; setBusy(true);
    try {
      await apiFetch(`/api/admin/classes/${editingClass.id}`, { method: "PATCH", body: JSON.stringify(editingClass) });
      setEditingClass(null); notify("Class updated."); await loadClasses();
    } catch { notify("Class could not be updated."); } finally { setBusy(false); }
  }

  async function removeClass(item: AcademicClass) {
    if (!window.confirm(`Delete ${item.name} and all ${item.sections.length} of its sections?`)) return;
    try { await apiFetch(`/api/admin/classes/${item.id}`, { method: "DELETE" }); notify("Class deleted."); await loadClasses(); }
    catch { notify("Class could not be deleted."); }
  }

  async function createSection(event: FormEvent, classId: string) {
    event.preventDefault(); const form = sectionForms[classId] ?? emptySection; setBusy(true);
    try {
      await apiFetch(`/api/admin/classes/${classId}/sections`, { method: "POST", body: JSON.stringify(form) });
      setSectionForms((current) => ({ ...current, [classId]: emptySection })); notify("Section added."); await loadClasses();
    } catch { notify("Section could not be added. Its name may already exist in this class."); } finally { setBusy(false); }
  }

  async function saveSection(event: FormEvent) {
    event.preventDefault(); if (!editingSection) return; setBusy(true);
    try {
      await apiFetch(`/api/admin/classes/sections/${editingSection.id}`, { method: "PATCH", body: JSON.stringify(editingSection) });
      setEditingSection(null); notify("Section updated."); await loadClasses();
    } catch { notify("Section could not be updated."); } finally { setBusy(false); }
  }

  async function removeSection(section: ClassSection) {
    if (!window.confirm(`Delete section ${section.name}?`)) return;
    try { await apiFetch(`/api/admin/classes/sections/${section.id}`, { method: "DELETE" }); notify("Section deleted."); await loadClasses(); }
    catch { notify("Section could not be deleted."); }
  }

  const teacherName = (id: string | null) => teachers.find((teacher) => teacher.id === id)?.name ?? "Not assigned";

  if (mode === "create") return (
    <PremiumCard eyebrow="Academic Structure" title="Create Class" description="Create a class first, then add its sections from Manage Classes.">
      {message && <div className="mt-5"><Alert variant="info">{message}</Alert></div>}
      <form onSubmit={createClass} className="mt-6 max-w-3xl space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Class Name"><Input required placeholder="e.g. Grade 8" value={classForm.name} onChange={(e) => setClassForm({ ...classForm, name: e.target.value })} /></Field>
          <Field label="Class Code"><Input required placeholder="e.g. G8-2026" value={classForm.code} onChange={(e) => setClassForm({ ...classForm, code: e.target.value })} /></Field>
          <Field label="Academic Year"><Input required placeholder="2026-2027" value={classForm.academicYear} onChange={(e) => setClassForm({ ...classForm, academicYear: e.target.value })} /></Field>
          <Field label="Status"><Select value={String(classForm.isActive)} onChange={(e) => setClassForm({ ...classForm, isActive: e.target.value === "true" })}><option value="true">Active</option><option value="false">Inactive</option></Select></Field>
        </div>
        <Field label="Description"><Textarea className="min-h-28" placeholder="Optional notes about this class..." value={classForm.description} onChange={(e) => setClassForm({ ...classForm, description: e.target.value })} /></Field>
        <Button type="submit" variant="solid" disabled={busy}><Plus size={16} /> {busy ? "Creating..." : "Create Class"}</Button>
      </form>
    </PremiumCard>
  );

  return (
    <div className="space-y-6">
      {message && <Alert variant="info">{message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={GraduationCap} label="Active Classes" value={totals.active} color="purple" />
        <Stat icon={Building2} label="Total Sections" value={totals.sections} color="cyan" />
        <Stat icon={Users} label="Total Capacity" value={totals.capacity} color="emerald" />
      </div>
      <PremiumCard eyebrow="Academic Structure" title="Classes & Sections" description="Manage class details, sections, rooms, capacity, and class teachers.">
        <div className="mt-6 space-y-4">
          {classes.map((item) => {
            const isOpen = expanded[item.id] ?? false;
            const form = sectionForms[item.id] ?? emptySection;
            return <div key={item.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
              <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                <button className="flex flex-1 items-center gap-4 text-left" onClick={() => setExpanded({ ...expanded, [item.id]: !isOpen })}>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-purple/10 text-accent-purple"><BookOpenCheck size={22} /></div>
                  <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-white">{item.name}</h3><span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{item.code}</span><span className={cn("rounded-full px-2 py-1 text-[10px] font-bold uppercase", item.isActive ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-500/10 text-slate-400")}>{item.isActive ? "Active" : "Inactive"}</span></div><p className="mt-1 text-xs text-slate-500">{item.academicYear} · {item.sections.length} section{item.sections.length === 1 ? "" : "s"}</p></div>
                  {isOpen ? <ChevronUp className="ml-auto text-slate-500" /> : <ChevronDown className="ml-auto text-slate-500" />}
                </button>
                <div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => setEditingClass(item)}><Pencil size={14} /> Edit</Button><Button variant="ghost" size="sm" className="text-rose-400" onClick={() => removeClass(item)}><Trash2 size={14} /></Button></div>
              </div>
              {isOpen && <div className="border-t border-white/10 p-5">
                {item.description && <p className="mb-5 text-sm text-slate-400">{item.description}</p>}
                <div className="grid gap-3 lg:grid-cols-2">
                  {item.sections.map((section) => <div key={section.id} className="rounded-xl border border-white/10 bg-ink-950/50 p-4">
                    <div className="flex items-start justify-between"><div><h4 className="font-semibold text-white">Section {section.name}</h4><p className="mt-1 text-xs text-slate-500">Room {section.room || "not assigned"}</p></div><div className="flex"><button onClick={() => setEditingSection(section)} className="p-2 text-slate-500 hover:text-white"><Pencil size={14} /></button><button onClick={() => removeSection(section)} className="p-2 text-slate-500 hover:text-rose-400"><Trash2 size={14} /></button></div></div>
                    <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-lg bg-white/[0.04] p-3"><p className="text-[10px] uppercase tracking-widest text-slate-600">Capacity</p><p className="mt-1 text-sm text-slate-200">{section.capacity} students</p></div><div className="rounded-lg bg-white/[0.04] p-3"><p className="text-[10px] uppercase tracking-widest text-slate-600">Class Teacher</p><p className="mt-1 truncate text-sm text-slate-200">{teacherName(section.classTeacherId)}</p></div></div>
                  </div>)}
                </div>
                {!item.sections.length && <div className="rounded-xl border border-dashed border-white/10 py-8 text-center text-sm text-slate-500">No sections added yet.</div>}
                <form onSubmit={(event) => createSection(event, item.id)} className="mt-5 rounded-xl border border-accent-purple/20 bg-accent-purple/[0.04] p-4"><p className="mb-4 text-xs font-bold uppercase tracking-widest text-accent-purple">Add Section</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Input required placeholder="Section name (A)" value={form.name} onChange={(e) => setSectionForms({ ...sectionForms, [item.id]: { ...form, name: e.target.value } })} /><Input placeholder="Room" value={form.room} onChange={(e) => setSectionForms({ ...sectionForms, [item.id]: { ...form, room: e.target.value } })} /><Input required type="number" min={1} max={500} value={form.capacity} onChange={(e) => setSectionForms({ ...sectionForms, [item.id]: { ...form, capacity: Number(e.target.value) } })} /><Select value={form.classTeacherId} onChange={(e) => setSectionForms({ ...sectionForms, [item.id]: { ...form, classTeacherId: e.target.value } })}><option value="">Select class teacher</option>{teachers.filter((teacher) => teacher.isActive).map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</Select></div><Button type="submit" variant="secondary" size="sm" className="mt-4" disabled={busy}><Plus size={14} /> Add Section</Button></form>
              </div>}
            </div>;
          })}
          {!classes.length && <div className="rounded-2xl border border-dashed border-white/10 py-16 text-center"><GraduationCap className="mx-auto text-slate-600" size={34} /><h3 className="mt-4 font-semibold text-white">No classes created</h3><p className="mt-1 text-sm text-slate-500">Use Create Class in the sidebar to build your academic structure.</p></div>}
        </div>
      </PremiumCard>
      {editingClass && <Modal title="Edit Class" onClose={() => setEditingClass(null)}><form onSubmit={saveClass} className="space-y-4"><Field label="Class Name"><Input required value={editingClass.name} onChange={(e) => setEditingClass({ ...editingClass, name: e.target.value })} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Code"><Input required value={editingClass.code} onChange={(e) => setEditingClass({ ...editingClass, code: e.target.value })} /></Field><Field label="Academic Year"><Input required value={editingClass.academicYear} onChange={(e) => setEditingClass({ ...editingClass, academicYear: e.target.value })} /></Field></div><Field label="Description"><Textarea value={editingClass.description ?? ""} onChange={(e) => setEditingClass({ ...editingClass, description: e.target.value })} /></Field><Field label="Status"><Select value={String(editingClass.isActive)} onChange={(e) => setEditingClass({ ...editingClass, isActive: e.target.value === "true" })}><option value="true">Active</option><option value="false">Inactive</option></Select></Field><Button type="submit" variant="solid" disabled={busy}>Save Changes</Button></form></Modal>}
      {editingSection && <Modal title={`Edit Section ${editingSection.name}`} onClose={() => setEditingSection(null)}><form onSubmit={saveSection} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Section Name"><Input required value={editingSection.name} onChange={(e) => setEditingSection({ ...editingSection, name: e.target.value })} /></Field><Field label="Room"><Input value={editingSection.room ?? ""} onChange={(e) => setEditingSection({ ...editingSection, room: e.target.value })} /></Field><Field label="Capacity"><Input type="number" min={1} max={500} value={editingSection.capacity} onChange={(e) => setEditingSection({ ...editingSection, capacity: Number(e.target.value) })} /></Field><Field label="Class Teacher"><Select value={editingSection.classTeacherId ?? ""} onChange={(e) => setEditingSection({ ...editingSection, classTeacherId: e.target.value })}><option value="">Not assigned</option>{teachers.filter((teacher) => teacher.isActive).map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</Select></Field></div><Field label="Status"><Select value={String(editingSection.isActive)} onChange={(e) => setEditingSection({ ...editingSection, isActive: e.target.value === "true" })}><option value="true">Active</option><option value="false">Inactive</option></Select></Field><Button type="submit" variant="solid" disabled={busy}>Save Section</Button></form></Modal>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>{children}</label>; }
function Stat({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: number; color: "purple" | "cyan" | "emerald" }) { const styles = { purple: "bg-accent-purple/10 text-accent-purple", cyan: "bg-accent-cyan/10 text-accent-cyan", emerald: "bg-emerald-500/10 text-emerald-300" }; return <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5"><div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", styles[color])}><Icon size={20} /></div><div><p className="text-2xl font-bold text-white">{value}</p><p className="text-xs text-slate-500">{label}</p></div></div>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm"><div className="w-full max-w-xl rounded-2xl border border-white/10 bg-ink-900 p-6 shadow-2xl"><div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-bold text-white">{title}</h2><button onClick={onClose} className="rounded-lg px-3 py-2 text-slate-500 hover:bg-white/5 hover:text-white">×</button></div>{children}</div></div>; }
