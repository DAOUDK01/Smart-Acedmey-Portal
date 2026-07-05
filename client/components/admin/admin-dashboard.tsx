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
} from "recharts";

type DistributionItem = { name: string; value: number; color: string };
type SignupItem = { month: string; signups: number };

export function AdminDashboard({
  stats,
  userDistribution = [],
  monthlySignups = [],
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
}) {
  const distributionData =
    userDistribution.length > 0
      ? userDistribution
      : [{ name: "No users", value: 0, color: "#8B5CF6" }];

  const signupData =
    monthlySignups.length > 0
      ? monthlySignups
      : [{ month: "N/A", signups: 0 }];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <PremiumCard title={stats.students.toString()} description="Total Students" />
        <PremiumCard title={stats.teachers.toString()} description="Total Teachers" />
        <PremiumCard title={stats.courses.toString()} description="Total Courses" />
        <PremiumCard title={stats.activeUsers.toString()} description="Active Users" />
        <PremiumCard title={(stats.pendingApprovals ?? 0).toString()} description="Pending Approvals" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PremiumCard eyebrow="Demographics" title="User Distribution" description="Platform users by role.">
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis
                  dataKey="name"
                  type="category"
                  stroke="#94a3b8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                />
                <Tooltip
                  cursor={{ fill: "#ffffff05" }}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #ffffff10",
                    borderRadius: "12px",
                  }}
                  itemStyle={{ color: "#fff", fontSize: "12px" }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PremiumCard>

        <PremiumCard eyebrow="Growth" title="New Account Signups" description="Monthly registrations on the platform.">
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={signupData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "#ffffff05" }}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #ffffff10",
                    borderRadius: "12px",
                  }}
                  itemStyle={{ color: "#fff", fontSize: "12px" }}
                />
                <Bar dataKey="signups" fill="#8B5CF6" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PremiumCard>
      </div>
    </div>
  );
}
