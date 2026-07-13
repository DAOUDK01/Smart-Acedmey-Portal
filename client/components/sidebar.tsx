"use client";

import { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  BookOpen, 
  Users, 
  Settings, 
  GraduationCap, 
  ChevronLeft, 
  ChevronRight,
  LogOut,
  BarChart3,
  FileQuestion,
  Lightbulb,
  ShieldAlert,
  PlusCircle,
  Video,
  FileText,
  UserCheck,
  ChevronDown,
  LineChart,
  ListChecks
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, usePathname } from "next/navigation";
import { clearPortalSession } from "@/lib/session";

interface SidebarItem {
  id: string;
  name: string;
  icon: any;
  children?: SidebarItem[];
}

interface SidebarProps {
  role: "admin" | "teacher" | "student" | "guardian" | "expert";
  activeItemId: string;
  onItemClick: (id: string) => void;
  userName?: string;
  userEmail?: string;
}

const sidebarItems: Record<string, SidebarItem[]> = {
  admin: [
    { id: "overview", name: "Overview", icon: LayoutDashboard },
    {
      id: "staff-management",
      name: "Staff",
      icon: Users,
      children: [
        { id: "staff-add", name: "Add Staff", icon: PlusCircle },
        { id: "staff-view", name: "View Staff", icon: UserCheck },
        { id: "staff-approvals", name: "Approvals", icon: ListChecks },
      ],
    },
    {
      id: "student-management",
      name: "Students",
      icon: GraduationCap,
      children: [
        { id: "student-add", name: "Add Student", icon: PlusCircle },
        { id: "student-view", name: "View Students", icon: GraduationCap },
        { id: "student-performance", name: "Performance", icon: LineChart },
      ],
    },
    {
      id: "course-management",
      name: "Courses",
      icon: BookOpen,
      children: [
        { id: "create-course", name: "Add Course", icon: PlusCircle },
        { id: "courses", name: "View Courses", icon: BookOpen },
      ],
    },
    { id: "analytics", name: "Analytics", icon: BarChart3 },
    {
      id: "system",
      name: "System",
      icon: Settings,
      children: [
        { id: "settings", name: "Settings", icon: Settings },
      ],
    },
  ],
  teacher: [
    { id: "overview", name: "Dashboard", icon: LayoutDashboard },
    { id: "upload", name: "Upload Lecture", icon: Video },
    { id: "manage-lectures", name: "Manage Lectures", icon: FileText },
    { id: "courses", name: "My Courses", icon: BookOpen },
    { id: "quizzes", name: "Quiz Review", icon: FileText },
    { id: "mockups", name: "Mock Exams", icon: FileQuestion },
    { id: "analytics", name: "Performance", icon: BarChart3 },
    { id: "alerts", name: "Risk Alerts", icon: ShieldAlert },
  ],
  student: [
    { id: "overview", name: "Dashboard", icon: LayoutDashboard },
    { id: "courses", name: "My Courses", icon: GraduationCap },
    { id: "exams", name: "Mock Exams", icon: FileQuestion },
    { id: "progress", name: "Performance", icon: BarChart3 },
    { id: "ai-tutor", name: "AI Tutor", icon: Lightbulb },
  ],
  expert: [
    { id: "overview", name: "Dashboard", icon: LayoutDashboard },
    { id: "lectures", name: "Lecture Reviews", icon: Video },
    { id: "quizzes", name: "Quiz Audit", icon: ShieldAlert },
  ],
  guardian: [
    { id: "overview", name: "Dashboard", icon: LayoutDashboard },
    { id: "progress", name: "Student Progress", icon: BarChart3 },
    { id: "alerts", name: "Activity Alerts", icon: ShieldAlert },
  ]
};

export function Sidebar({ role, activeItemId, onItemClick, userName, userEmail }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const router = useRouter();
  const items = sidebarItems[role] || [];

  useEffect(() => {
    const activeParent = items.find((item) => item.children?.some((child) => child.id === activeItemId));

    if (activeParent) {
      setOpenGroups((current) => ({
        ...current,
        [activeParent.id]: true,
      }));
    }
  }, [activeItemId, items]);

  const handleLogout = () => {
    clearPortalSession();
    router.replace(role === "admin" ? "/admin/login" : "/login");
  };

  const handleParentClick = (item: SidebarItem) => {
    if (!item.children?.length) {
      onItemClick(item.id);
      return;
    }

    if (isCollapsed) {
      onItemClick(item.children[0].id);
      return;
    }

    setOpenGroups((current) => ({
      ...current,
      [item.id]: !current[item.id],
    }));
  };

  const isItemActive = (item: SidebarItem) => {
    return activeItemId === item.id || Boolean(item.children?.some((child) => child.id === activeItemId));
  };

  return (
    <motion.div
      initial={false}
      animate={{ width: isCollapsed ? 80 : 280 }}
      className={cn(
        "relative flex h-screen flex-col border-r border-white/10 bg-ink-950 text-slate-400 transition-all duration-300 ease-in-out z-30 shrink-0",
        isCollapsed ? "px-3" : "px-4"
      )}
    >
      {/* Logo Section */}
      <div className="flex h-20 items-center justify-between px-2">
        <AnimatePresence mode="wait">
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex items-center gap-3"
            >
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-accent-purple to-accent-cyan p-[1px]">
                <div className="flex h-full w-full items-center justify-center rounded-[11px] bg-ink-950">
                  <GraduationCap className="h-5 w-5 text-white" />
                </div>
              </div>
              <span className="text-lg font-bold tracking-tight text-white">SmartAcademy</span>
            </motion.div>
          )}
        </AnimatePresence>
        
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition-all"
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="mt-8 flex-1 space-y-1.5">
        {items.map((item) => {
          const hasChildren = Boolean(item.children?.length);
          const isActive = isItemActive(item);
          const isOpen = Boolean(openGroups[item.id]);

          return (
            <div key={item.id} className="space-y-1">
              <button
                onClick={() => handleParentClick(item)}
                className={cn(
                  "group relative flex w-full items-center rounded-xl px-3 py-2.5 transition-all duration-200",
                  isCollapsed ? "justify-center" : "justify-start",
                  isActive
                    ? "bg-gradient-to-r from-accent-purple/10 to-transparent text-white" 
                    : "hover:bg-white/5 hover:text-slate-200"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-nav"
                    className="absolute left-0 h-6 w-1 rounded-full bg-accent-purple"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                
                <item.icon 
                  className={cn(
                    "h-5 w-5 shrink-0",
                    isActive ? "text-accent-purple" : "text-slate-400 group-hover:text-slate-200"
                  )} 
                />
                
                <AnimatePresence>
                  {!isCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="ml-3 flex-1 truncate text-left text-sm font-medium"
                    >
                      {item.name}
                    </motion.span>
                  )}
                </AnimatePresence>

                {hasChildren && !isCollapsed && (
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-200",
                      isOpen ? "rotate-180 text-slate-200" : "text-slate-500"
                    )}
                  />
                )}
              </button>

              <AnimatePresence initial={false}>
                {hasChildren && isOpen && !isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="ml-5 space-y-1 border-l border-white/10 pl-3">
                      {item.children?.map((child) => {
                        const isChildActive = activeItemId === child.id;

                        return (
                          <button
                            key={child.id}
                            onClick={() => onItemClick(child.id)}
                            className={cn(
                              "group flex w-full items-center rounded-lg px-3 py-2 text-left transition-all duration-200",
                              isChildActive
                                ? "bg-white/[0.08] text-white"
                                : "text-slate-500 hover:bg-white/5 hover:text-slate-200"
                            )}
                          >
                            <child.icon
                              className={cn(
                                "h-4 w-4 shrink-0",
                                isChildActive ? "text-accent-cyan" : "text-slate-500 group-hover:text-slate-300"
                              )}
                            />
                            <span className="ml-2 truncate text-sm font-medium">{child.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>

      {/* Footer / User Profile */}
      <div className="mb-6 mt-auto space-y-2 border-t border-white/10 pt-6">
        <div className={cn(
          "flex items-center gap-3 px-2",
          isCollapsed ? "justify-center" : "justify-start"
        )}>
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-accent-purple to-accent-cyan p-[1px] shrink-0">
            <div className="flex h-full w-full items-center justify-center rounded-[11px] bg-ink-900 text-sm font-bold text-white">
              {userName ? userName.charAt(0).toUpperCase() : "JD"}
            </div>
          </div>
          
          {!isCollapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-semibold text-white">{userName || "User Name"}</span>
              <span className="truncate text-xs text-slate-500">{userEmail || "user@example.com"}</span>
            </div>
          )}
        </div>

        <button
          onClick={handleLogout}
          className={cn(
            "group flex w-full items-center rounded-xl px-3 py-2.5 text-slate-400 transition-all hover:bg-rose-500/10 hover:text-rose-400",
            isCollapsed ? "justify-center" : "justify-start"
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!isCollapsed && <span className="ml-3 text-sm font-medium">Log out</span>}
        </button>
      </div>
    </motion.div>
  );
}
