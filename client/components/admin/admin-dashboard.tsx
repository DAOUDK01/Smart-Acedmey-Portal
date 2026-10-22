"use client";

import { useMemo, useState, type ReactNode } from "react";
import { UserPlus, Users } from "lucide-react";
import { PremiumCard } from "../premium-card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { ChartTooltip } from "@/components/charts/chart-parts";
import { ChartEmpty, ChartError, ChartFilter, ChartSkeleton } from "@/components/charts/chart-states";
import {
  CHART_COLORS,
  CHART_INITIAL_DIMENSION,
  CHART_RESIZE_DEBOUNCE_MS,
  ROLE_COLORS,
  axisProps,
  gridProps,
} from "@/lib/chart-theme";
import { useChartAnimation } from "@/lib/use-chart-animation";

type DistributionItem = { name: string; value: number; color: string };
type SignupItem = { month: string; signups: number };
export type ChartStatus = "loading" | "ready" | "error";

type SignupPeriod = "3" | "6";
const PERIODS: { value: SignupPeriod; label: string }[] = [
  { value: "3", label: "3 months" },
  { value: "6", label: "6 months" },
];

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function AdminDashboard({
  stats,
  userDistribution = [],
  monthlySignups = [],
  chartStatus = "ready",
  onRetry,
}: {
  stats: {
    students: number;
    teachers: number;
    courses: number;
    activeUsers: number;
    pendingApprovals?: number;
  };
  userDistribution?: DistributionItem[];
  monthlySignups?: SignupItem[];
  chartStatus?: ChartStatus;
  onRetry?: () => void;
}) {
  const animation = useChartAnimation();
  const [period, setPeriod] = useState<SignupPeriod>("6");

  const distribution = useMemo(() => userDistribution.filter((item) => item.value > 0), [userDistribution]);
  const totalUsers = distribution.reduce((sum, item) => sum + item.value, 0);
  // The API returns the last six months, oldest first; the filter only narrows that real window.
  const signups = useMemo(() => monthlySignups.slice(-Number(period)), [monthlySignups, period]);
  const periodTotal = signups.reduce((sum, item) => sum + item.signups, 0);

  const body = (content: ReactNode, emptyTitle: string, emptyMessage: string, isEmpty: boolean, icon: ReactNode) => {
    if (chartStatus === "loading") return <ChartSkeleton className="mt-4" />;
    if (chartStatus === "error") return <ChartError className="mt-4" onRetry={onRetry} />;
    if (isEmpty) return <ChartEmpty className="mt-4" title={emptyTitle} message={emptyMessage} icon={icon} />;
    return content;
  };

  return (
    <div className="space-y-6">
      <div className="motion-stagger grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <PremiumCard title={stats.students.toString()} description="Total Students" />
        <PremiumCard title={stats.teachers.toString()} description="Total Teachers" />
        <PremiumCard title={stats.courses.toString()} description="Total Courses" />
        <PremiumCard title={stats.activeUsers.toString()} description="Active Users" />
        <PremiumCard title={(stats.pendingApprovals ?? 0).toString()} description="Pending Approvals" />
      </div>

      <div className="motion-stagger grid gap-6 lg:grid-cols-2">
        <PremiumCard
          eyebrow="Demographics"
          title="User Distribution"
          description={
            chartStatus === "ready" && totalUsers > 0
              ? `${plural(totalUsers, "account")} across ${plural(distribution.length, "role")}.`
              : "Platform users by role."
          }
        >
          {body(
            <div className="mt-4 h-64 w-full" role="img" aria-label={`User distribution: ${distribution.map((d) => `${d.name} ${d.value}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS} initialDimension={CHART_INITIAL_DIMENSION}>
                <BarChart data={distribution} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }} barCategoryGap="28%">
                  <CartesianGrid {...gridProps} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} {...axisProps} />
                  <YAxis dataKey="name" type="category" width={78} {...axisProps} />
                  <Tooltip
                    cursor={{ fill: CHART_COLORS.cursorFill }}
                    content={
                      <ChartTooltip
                        names={{ value: "Accounts" }}
                        valueFormatter={(value) =>
                          totalUsers > 0 ? `${value} (${Math.round((Number(value) / totalUsers) * 100)}%)` : String(value)
                        }
                        colorFor={(entry) => ROLE_COLORS[String(entry.payload?.name)] ?? (entry.payload?.color as string | undefined)}
                      />
                    }
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={24} {...animation}>
                    {distribution.map((entry) => (
                      <Cell key={entry.name} fill={ROLE_COLORS[entry.name] ?? entry.color} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="right"
                      offset={8}
                      className="fill-slate-700 text-[11px] font-semibold tabular-nums"
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>,
            "No users yet",
            "Once teachers, students and parents register, their numbers by role appear here.",
            distribution.length === 0,
            <Users size={18} aria-hidden="true" />,
          )}
        </PremiumCard>

        <PremiumCard
          eyebrow="Growth"
          title="New Account Signups"
          description={
            chartStatus === "ready" && signups.length > 0
              ? `${plural(periodTotal, "new account")} in the last ${signups.length} months.`
              : "Monthly registrations on the platform."
          }
        >
          <div className="mt-4 flex justify-end">
            <ChartFilter label="Signup period" options={PERIODS} value={period} onChange={setPeriod} />
          </div>
          {body(
            <div className="mt-2 h-60 w-full" role="img" aria-label={`Signups per month: ${signups.map((s) => `${s.month} ${s.signups}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS} initialDimension={CHART_INITIAL_DIMENSION}>
                <BarChart data={signups} margin={{ top: 20, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
                  <CartesianGrid {...gridProps} vertical={false} />
                  <XAxis dataKey="month" {...axisProps} />
                  <YAxis allowDecimals={false} width={32} {...axisProps} />
                  <Tooltip
                    cursor={{ fill: CHART_COLORS.cursorFill }}
                    content={<ChartTooltip names={{ signups: "New accounts" }} />}
                  />
                  <Bar dataKey="signups" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={36} {...animation}>
                    <LabelList
                      dataKey="signups"
                      position="top"
                      offset={6}
                      className="fill-slate-600 text-[11px] font-semibold tabular-nums"
                      formatter={(value: unknown) => (Number(value) > 0 ? String(value) : "")}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>,
            "No signup data yet",
            "Monthly registrations will appear here once accounts are created.",
            signups.length === 0,
            <UserPlus size={18} aria-hidden="true" />,
          )}
        </PremiumCard>
      </div>
    </div>
  );
}
