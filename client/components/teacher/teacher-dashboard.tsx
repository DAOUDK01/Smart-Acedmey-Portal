import { PremiumCard } from "../premium-card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

type PerformanceItem = { name: string; score: number };
type ActivityItem = { name: string; active: number };

export function TeacherDashboard({
  stats,
  performanceData = [],
  studentActivityData = [],
}: {
  stats: {
    totalStudents: number;
    activeStudents: number;
    totalCourses: number;
    totalLectures: number;
    avgQuizScore: number;
  };
  performanceData?: PerformanceItem[];
  studentActivityData?: ActivityItem[];
}) {
  const performance =
    performanceData.length > 0 ? performanceData : [{ name: "No attempts", score: 0 }];
  const activity =
    studentActivityData.length > 0
      ? studentActivityData
      : [
          { name: "Mon", active: 0 },
          { name: "Tue", active: 0 },
          { name: "Wed", active: 0 },
          { name: "Thu", active: 0 },
          { name: "Fri", active: 0 },
          { name: "Sat", active: 0 },
          { name: "Sun", active: 0 },
        ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <PremiumCard title={stats.totalStudents.toString()} description="Total Students" />
        <PremiumCard title={stats.activeStudents.toString()} description="Active Students" />
        <PremiumCard title={stats.totalCourses.toString()} description="Total Courses" />
        <PremiumCard title={stats.totalLectures.toString()} description="Total Lectures" />
        <PremiumCard title={`${stats.avgQuizScore}%`} description="Avg Quiz Score" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PremiumCard eyebrow="Analytics" title="Class Performance" description="Average quiz scores over time.">
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performance}>
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #ffffff10",
                    borderRadius: "12px",
                  }}
                  itemStyle={{ color: "#fff", fontSize: "12px" }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#8B5CF6"
                  fillOpacity={1}
                  fill="url(#colorScore)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </PremiumCard>

        <PremiumCard eyebrow="Engagement" title="Student Activity" description="Active students by day of week.">
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
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
                <Bar dataKey="active" fill="#06b6d4" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PremiumCard>
      </div>
    </div>
  );
}
