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
  Area
} from 'recharts';

const performanceData = [
  { name: 'Week 1', score: 72 },
  { name: 'Week 2', score: 78 },
  { name: 'Week 3', score: 85 },
  { name: 'Week 4', score: 82 },
  { name: 'Week 5', score: 88 },
  { name: 'Week 6', score: 84 },
];

const studentActivityData = [
  { name: 'Mon', active: 45 },
  { name: 'Tue', active: 52 },
  { name: 'Wed', active: 48 },
  { name: 'Thu', active: 61 },
  { name: 'Fri', active: 55 },
  { name: 'Sat', active: 32 },
  { name: 'Sun', active: 28 },
];

export function TeacherDashboard({ stats }: { stats: any }) {
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
          <div className="h-64 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceData}>
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff', fontSize: '12px' }}
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

        <PremiumCard eyebrow="Engagement" title="Student Activity" description="Daily active students on the platform.">
          <div className="h-64 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={studentActivityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <Tooltip 
                  cursor={{fill: '#ffffff05'}}
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff', fontSize: '12px' }}
                />
                <Bar 
                  dataKey="active" 
                  fill="#06b6d4" 
                  radius={[4, 4, 0, 0]} 
                  barSize={30}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PremiumCard>
      </div>
    </div>
  );
}
