"use client";

export type RoleTab = {
  id: string;
  label: string;
  count?: number;
};

export function RoleTabs({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: RoleTab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}) {
  return (
    <div className="surface-panel flex flex-wrap gap-2 rounded-[24px] p-2">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-accent-purple/10 text-accent-purple ring-1 ring-inset ring-accent-purple/20 backdrop-blur-sm shadow-soft"
                : "text-slate-500 hover:bg-accent-purple/[0.08] hover:text-slate-900"
            }`}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${isActive ? "bg-accent-purple/15 text-slate-900" : "bg-accent-purple/10 text-slate-600"}`}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
