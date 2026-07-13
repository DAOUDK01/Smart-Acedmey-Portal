import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Bell, Search } from "lucide-react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Input } from "@/components/ui/input";

const roleLabels = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
  guardian: "Guardian",
} as const;

export function DashboardShell({
  role,
  title,
  subtitle,
  children,
  activeTab = "overview",
  onTabChange,
  session,
}: {
  role: keyof typeof roleLabels;
  title: string;
  subtitle: string;
  children: ReactNode;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  session?: { name: string; email: string };
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-ink-950 text-slate-100">
      {/* Sidebar */}
      <Sidebar 
        role={role as any} 
        activeItemId={activeTab} 
        onItemClick={onTabChange || (() => {})} 
        userName={session?.name}
        userEmail={session?.email}
      />
      
      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Navigation / Header */}
        <header className="flex h-20 shrink-0 items-center justify-between border-b border-white/5 bg-ink-950/50 px-8 backdrop-blur-xl">
          <div className="flex items-center gap-8">
            <div className="relative hidden lg:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                type="text"
                placeholder="Search resources, courses..."
                className="h-10 w-80 pl-10"
              />
            </div>
          </div>

          <div className="flex items-center gap-5">
            {/* Notifications */}
            <button className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition-all">
              <Bell size={20} />
              <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-accent-danger border-2 border-ink-950" />
            </button>

            <div className="h-6 w-px bg-white/10 mx-2" />

            {/* Quick Profile */}
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-white">{session?.name || "User Name"}</p>
                <p className="text-xs text-slate-500 capitalize">{roleLabels[role]}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-accent-purple to-accent-cyan p-[1px]">
                <div className="flex h-full w-full items-center justify-center rounded-[11px] bg-ink-900 font-bold text-white">
                  {session?.name ? session.name.charAt(0).toUpperCase() : "JD"}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto bg-ink-950 p-8">
          <div className="mx-auto max-w-6xl">
            <header className="mb-10">
              <Eyebrow>{roleLabels[role]} Dashboard</Eyebrow>
              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-4xl font-bold tracking-tight text-white">
                    {title}
                  </h1>
                  <p className="mt-2 text-slate-400">
                    {subtitle}
                  </p>
                </div>
                
                {/* Dynamic context buttons could go here */}
              </div>
            </header>

            <div className="motion-rise">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
