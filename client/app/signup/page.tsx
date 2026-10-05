"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { GraduationCap } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import MaintenanceScreen from "@/components/maintenance-screen";
import { useMaintenance } from "@/lib/use-maintenance";

type CatalogClass={id:string;name:string;code:string;academicYear:string;courses:{id:string;title:string;code:string|null}[]};

export default function SignupPage(){
  const { enabled: maintenanceEnabled, message: maintenanceMessage, loading: maintenanceLoading } = useMaintenance();
  const [classes,setClasses]=useState<CatalogClass[]>([]);
  const [name,setName]=useState("");const [email,setEmail]=useState("");const [classId,setClassId]=useState("");const [courseIds,setCourseIds]=useState<string[]>([]);
  const [status,setStatus]=useState<string|null>(null);const [busy,setBusy]=useState(false);

  useEffect(()=>{fetch(`${API_BASE_URL}/api/admissions/catalog`).then(r=>r.json()).then(setClasses).catch(()=>setStatus("Admission catalog could not be loaded."));},[]);

  const selectedClass=useMemo(()=>classes.find(item=>item.id===classId),[classes,classId]);

  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setStatus(null);try{const response=await fetch(`${API_BASE_URL}/api/admissions/request`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,email,desiredClassId:classId,selectedCourseIds:courseIds})});const data=await response.json().catch(()=>null);if(!response.ok)throw new Error(Array.isArray(data?.message)?data.message.join(", "):data?.message||"Request failed");setName("");setEmail("");setClassId("");setCourseIds([]);setStatus(data?.emailSent?"Admission request submitted. We have emailed you a confirmation, and you will receive another email with your registration link after admin review.":"Admission request submitted. You will receive an email with your registration link after admin review. (We could not send the confirmation email just now — please check the address you entered.)");}catch(error){setStatus(error instanceof Error?error.message:"Admission request failed.");}finally{setBusy(false);}}

  function toggleCourse(id:string){setCourseIds(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);}

  if (maintenanceLoading) return null;
  if (maintenanceEnabled) return <MaintenanceScreen message={maintenanceMessage} />;

  return <main className="grid min-h-screen page-canvas lg:grid-cols-[0.8fr_1.2fr]">
    <section className="hidden bg-[radial-gradient(circle_at_30%_20%,rgba(226,232,240,0.9),transparent_35%),#ffffff] p-14 lg:flex lg:flex-col lg:justify-between"><div className="flex items-center gap-3 text-slate-900"><GraduationCap className="text-slate-600"/><span className="font-bold">SmartAcademy</span></div><div><p className="text-xs uppercase tracking-[.35em] text-slate-500">Join SmartAcademy</p><h1 className="mt-5 text-5xl font-semibold leading-tight text-slate-900">Begin your learning journey.</h1><p className="mt-5 max-w-md leading-7 text-slate-600">Apply for admission — your guardian will automatically receive a portal account with login details on email.</p></div><p className="text-xs text-slate-500">Portal access is created after admin approval.</p></section>
    <section className="flex items-center justify-center px-6 py-12"><Panel className="w-full max-w-2xl" glass={false}>
      <p className="text-xs font-bold uppercase tracking-[.3em] text-slate-600">Admission Request</p>
      <h2 className="mt-3 text-3xl font-semibold text-slate-900">Apply as a student</h2>
      <p className="mt-2 text-sm text-slate-600">Choose your class and courses. After approval you will receive a registration link — add your guardian's email there and their portal login will be sent to them automatically.</p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input required placeholder="Student full name" value={name} onChange={e=>setName(e.target.value)}/>
          <Input required type="email" placeholder="Student email" value={email} onChange={e=>setEmail(e.target.value)}/>
        </div>
        <Select required value={classId} onChange={e=>{setClassId(e.target.value);setCourseIds([]);}}>
          <option value="">Select class</option>
          {classes.map(item=><option key={item.id} value={item.id}>{item.name} ({item.code}) · {item.academicYear}</option>)}
        </Select>
        {selectedClass&&<div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Select Courses</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {selectedClass.courses.map(course=><label key={course.id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition",courseIds.includes(course.id)?"border-accent-cyan/50 bg-accent-cyan/10":"border-accent-purple/15 bg-accent-purple/[0.05]")}><input type="checkbox" checked={courseIds.includes(course.id)} onChange={()=>toggleCourse(course.id)} className="accent-accent-purple"/><span className="text-sm text-slate-700">{course.title}</span></label>)}
          </div>
          {!selectedClass.courses.length&&<Alert variant="neutral">No courses are currently offered in this class.</Alert>}
        </div>}
        <Button fullWidth type="submit" disabled={busy||!courseIds.length}>{busy?"Submitting...":"Request Admission"}</Button>
      </form>
      {status&&<Alert variant="info" className="mt-5">{status}</Alert>}
      <p className="mt-6 text-center text-sm text-slate-500">Already have an account? <Link href="/login" className="text-cyan-600 hover:text-cyan-700">Sign in</Link></p>
    </Panel></section>
  </main>;
}