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
  X,
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
  ,School
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { clearPortalSession } from "@/lib/session";
import { Avatar } from "@/components/ui/avatar";

interface SidebarItem {
  id: string;
  name: string;
  icon: any;
  children?: SidebarItem[];
}

interface SidebarProps {
  role: "admin" | "teacher" | "student" | "guardian";
  activeItemId: string;
  onItemClick: (id: string) => void;
  userName?: string;
  userEmail?: string;
  /** Below the lg breakpoint the sidebar is an off-canvas drawer controlled by the shell. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
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
        { id: "student-admissions", name: "Admissions", icon: ListChecks },
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
    {
      id: "class-management",
      name: "Classes",
      icon: School,
      children: [
        { id: "class-create", name: "Create Class", icon: PlusCircle },
        { id: "classes", name: "Manage Classes", icon: School },
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
  guardian: [
    { id: "overview", name: "Dashboard", icon: LayoutDashboard },
    { id: "progress", name: "Student Progress", icon: BarChart3 },
    { id: "lectures", name: "Lecture Recommendations", icon: Video },
    { id: "quizzes", name: "Quiz Attempts", icon: FileQuestion },
    { id: "alerts", name: "Activity Alerts", icon: ShieldAlert },
  ]
};

export function Sidebar({ role, activeItemId, onItemClick: onItemSelect, userName, userEmail, mobileOpen = false, onMobileClose }: SidebarProps) {
  const [collapsedPreference, setCollapsedPreference] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  // The icon-only rail only makes sense on wide screens; the mobile drawer is always full width.
  const isCollapsed = collapsedPreference && isDesktop;
  const setIsCollapsed = setCollapsedPreference;
  const onItemClick = (id: string) => {
    onItemSelect(id);
    onMobileClose?.();
  };

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
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
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      id="primary-navigation"
      aria-label="Primary navigation"
      className={cn(
        "relative flex h-screen flex-col overflow-hidden border-r border-accent-purple/15 bg-[#f6f2fd]/60 text-slate-400 backdrop-blur-2xl z-30 shrink-0",
        // Off-canvas drawer below lg: solid background so the page does not show through.
        "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:!w-[280px] max-lg:max-w-[85vw] max-lg:bg-[#f6f2fd] max-lg:shadow-2xl max-lg:transition-transform max-lg:duration-200",
        mobileOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
        isCollapsed ? "px-3" : "px-4"
      )}
    >
      {/* Logo Section */}
      <div className="flex h-20 items-center justify-between px-2">
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.18 }}
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
          onClick={() => setIsCollapsed(!collapsedPreference)}
          className="hidden h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all duration-200 hover:bg-accent-purple/[0.08] hover:text-slate-900 active:scale-90 lg:flex"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <button
          type="button"
          onClick={onMobileClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-all duration-200 hover:bg-accent-purple/[0.08] hover:text-slate-900 active:scale-90 lg:hidden"
          aria-label="Close menu"
        >
          <X size={18} />
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
                  "group relative flex w-full items-center rounded-xl px-3 py-2.5 transition-all duration-150",
                  isCollapsed ? "justify-center" : "justify-start",
                  isActive
                    ? "bg-gradient-to-r from-accent-purple/20 via-accent-purple/10 to-transparent text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "hover:bg-accent-purple/[0.06] hover:text-slate-900"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-nav"
                    className="absolute left-0 h-6 w-1 rounded-full bg-gradient-to-b from-accent-purple to-accent-cyan shadow-[0_0_12px_rgba(124,58,237,0.6)]"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                
                <item.icon 
                  className={cn(
                    "h-5 w-5 shrink-0 transition-transform duration-150 group-hover:scale-110",
                    isActive ? "text-white" : "text-slate-400 group-hover:text-slate-900"
                  )} 
                />
                
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="ml-3 flex-1 truncate text-left text-sm font-medium"
                    >
                      {item.name}
                    </motion.span>
                  )}
                </AnimatePresence>

                {hasChildren && !isCollapsed && (
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-150",
                      isOpen ? "rotate-180 text-slate-600" : "text-slate-500"
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
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="ml-5 space-y-1 border-l border-accent-purple/15 pl-3">
                      {item.children?.map((child) => {
                        const isChildActive = activeItemId === child.id;

                        return (
                          <button
                            key={child.id}
                            onClick={() => onItemClick(child.id)}
                            className={cn(
                              "group flex w-full items-center rounded-lg px-3 py-2 text-left transition-all duration-200",
                              isChildActive
                                ? "bg-white/[0.09] text-white"
                                : "text-slate-500 hover:bg-accent-purple/[0.06] hover:text-slate-900"
                            )}
                          >
                            <child.icon
                              className={cn(
                                "h-4 w-4 shrink-0",
                                isChildActive ? "text-white" : "text-slate-500 group-hover:text-slate-700"
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
      <div className="mb-6 mt-auto space-y-2 border-t border-accent-purple/15 pt-6">
        <div className={cn(
          "flex items-center gap-3 px-2",
          isCollapsed ? "justify-center" : "justify-start"
        )}>
          <Avatar name={userName} size="md" />
          
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
            "group flex w-full items-center rounded-xl px-3 py-2.5 text-slate-400 transition-all duration-200 hover:bg-rose-500/10 hover:text-rose-600 active:scale-[0.98]",
            isCollapsed ? "justify-center" : "justify-start"
          )}
        >
          <LogOut className="h-5 w-5 shrink-0 text-rose-500 transition-transform duration-200 group-hover:-translate-x-0.5" />
          {!isCollapsed && <span className="ml-3 text-sm font-medium">Log out</span>}
        </button>
      </div>
    </motion.div>
  );
}
