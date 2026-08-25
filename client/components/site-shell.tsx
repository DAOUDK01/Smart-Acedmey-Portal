import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/admin", label: "Admin" },
  { href: "/teacher", label: "Teacher" },
  { href: "/student", label: "Student" },
  { href: "/guardian", label: "Guardian" },
  { href: "/ai-insights", label: "Insights" },
];

export function SiteShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen text-slate-800">
      <header className="sticky top-0 z-30 border-b border-accent-purple/15 bg-[#ffffff]/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
              Smart Academy Portal
            </p>
            <h1 className="mt-1 text-lg font-semibold text-slate-900">{title}</h1>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
          <nav className="surface-panel hidden items-center gap-2 rounded-full p-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href as any}
                className="rounded-full px-4 py-2 text-sm text-slate-600 transition hover:bg-accent-purple/[0.08] hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">{children}</main>
    </div>
  );
}
