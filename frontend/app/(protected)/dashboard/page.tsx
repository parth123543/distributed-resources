"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getMeApi, getMachinesApi, getJobsApi } from "@/lib/api";
import type { User, Machine, Job } from "@/lib/api";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Server, Briefcase, CheckCircle, Activity, Clock, Cpu,
  TrendingUp, Zap, AlertCircle, MoreHorizontal, ArrowUpRight,
} from "lucide-react";

// ── Animated number counter ────────────────────────────────────────────────
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const duration = 1000;
    const start = performance.now();
    const from = display;
    const to = value;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);

  return <>{display}</>;
}

// ── Glow dot ───────────────────────────────────────────────────────────────
function GlowDot({ color = "bg-violet-400" }: { color?: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-50`} />
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${color}`} />
    </span>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    online:    { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
    offline:   { bg: "bg-slate-500/10",   text: "text-slate-400",   dot: "bg-slate-400" },
    busy:      { bg: "bg-amber-500/10",   text: "text-amber-400",   dot: "bg-amber-400" },
    pending:   { bg: "bg-blue-500/10",    text: "text-blue-400",    dot: "bg-blue-400" },
    scheduled: { bg: "bg-violet-500/10",  text: "text-violet-400",  dot: "bg-violet-400" },
    running:   { bg: "bg-amber-500/10",   text: "text-amber-400",   dot: "bg-amber-400" },
    completed: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
    failed:    { bg: "bg-red-500/10",     text: "text-red-400",     dot: "bg-red-400" },
  };
  const s = map[status] ?? map.offline;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────
function StatCard({
  icon, label, value, sub, accent, delay,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub: string;
  accent: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
      className="group relative bg-[#0f0f1a] border border-white/[0.06] rounded-2xl p-5 overflow-hidden hover:border-white/10 transition-all duration-300"
    >
      {/* corner glow */}
      <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-500 ${accent}`} />

      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-xl ${accent} bg-opacity-10`}>
          {icon}
        </div>
        <ArrowUpRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
      </div>

      <div className="text-3xl font-bold text-white mb-1">
        {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
      </div>
      <div className="text-slate-500 text-xs">{label}</div>
      <div className="text-slate-600 text-xs mt-1">{sub}</div>
    </motion.div>
  );
}

// ── Custom tooltip ─────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl px-4 py-3 shadow-xl">
      <div className="text-slate-400 text-xs mb-2">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}:</span>
          <span className="text-white font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Job row ────────────────────────────────────────────────────────────────
function JobRow({ job, index }: { job: Job; index: number }) {
  const duration = job.completed_at && job.started_at
    ? Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="flex items-center gap-4 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] px-2 rounded-lg transition-colors group"
    >
      <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
        <Briefcase size={14} className="text-violet-400" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-200 font-mono truncate">{job.command}</div>
        <div className="text-xs text-slate-600 mt-0.5">
          {new Date(job.created_at).toLocaleTimeString()} · {job.required_cpu} CPU · {job.required_ram}GB RAM
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {duration && (
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Clock size={10} />
            {duration}s
          </span>
        )}
        <StatusBadge status={job.status} />
      </div>
    </motion.div>
  );
}

// ── Machine card ───────────────────────────────────────────────────────────
function MachineCard({ machine, index }: { machine: Machine; index: number }) {
  const cpuUsage = Math.floor(Math.random() * 60 + 20);
  const ramUsage = Math.floor((machine.ram_gb * 0.6) * 10) / 10;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      className="bg-[#0f0f1a] border border-white/[0.06] rounded-2xl p-4 hover:border-violet-500/20 transition-all duration-300 group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Server size={14} className="text-violet-400" />
          </div>
          <div>
            <div className="text-sm text-white font-medium">{machine.os.split(" ")[0]}</div>
            <div className="text-xs text-slate-600">{machine.id.slice(0, 8)}...</div>
          </div>
        </div>
        <StatusBadge status={machine.status} />
      </div>

      <div className="space-y-2.5 mt-4">
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>CPU · {machine.cpu_cores} cores</span>
            <span>{cpuUsage}%</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${cpuUsage}%` }}
              transition={{ delay: index * 0.08 + 0.3, duration: 0.8, ease: "easeOut" }}
              className="h-full bg-gradient-to-r from-violet-600 to-purple-500 rounded-full"
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>RAM · {machine.ram_gb}GB</span>
            <span>{ramUsage}GB</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(ramUsage / machine.ram_gb) * 100}%` }}
              transition={{ delay: index * 0.08 + 0.4, duration: 0.8, ease: "easeOut" }}
              className="h-full bg-gradient-to-r from-cyan-600 to-blue-500 rounded-full"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Generate mock chart data ───────────────────────────────────────────────
function generateChartData() {
  const hours = ["00", "02", "04", "06", "08", "10", "12", "14", "16", "18", "20", "22"];
  return hours.map((h) => ({
    time: `${h}:00`,
    jobs: Math.floor(Math.random() * 20 + 2),
    machines: Math.floor(Math.random() * 8 + 1),
  }));
}

// ── Main dashboard ─────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [chartData] = useState(generateChartData);
  const [activeTab, setActiveTab] = useState<"jobs" | "machines">("jobs");

  useEffect(() => {
    getMeApi().then(setUser).catch(console.error);
    getMachinesApi().then(setMachines).catch(console.error);
    getJobsApi().then(setJobs).catch(console.error);
  }, []);

  const onlineMachines = machines.filter((m) => m.status === "online").length;
  const completedJobs = jobs.filter((j) => j.status === "completed").length;
  const runningJobs = jobs.filter((j) => j.status === "running").length;
  const failedJobs = jobs.filter((j) => j.status === "failed").length;
  const pendingJobs = jobs.filter((j) => j.status === "pending").length;

  return (
    <div className="min-h-screen bg-[#080810] p-6 relative overflow-hidden">
      {/* Background orbs */}
      <div className="fixed top-[-20%] right-[-10%] w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"},
            {" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-400">
              {user?.email.split("@")[0] ?? "..."}
            </span>
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
            <GlowDot color="bg-emerald-400" />
            <span className="text-emerald-400 text-xs font-medium">All systems operational</span>
          </div>
        </div>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Server size={18} className="text-violet-400" />}
          label="Online Machines"
          value={onlineMachines}
          sub={`${machines.length} total registered`}
          accent="bg-violet-500"
          delay={0}
        />
        <StatCard
          icon={<Zap size={18} className="text-amber-400" />}
          label="Running Jobs"
          value={runningJobs}
          sub={`${pendingJobs} pending in queue`}
          accent="bg-amber-500"
          delay={0.1}
        />
        <StatCard
          icon={<CheckCircle size={18} className="text-emerald-400" />}
          label="Completed"
          value={completedJobs}
          sub="jobs finished successfully"
          accent="bg-emerald-500"
          delay={0.2}
        />
        <StatCard
          icon={<AlertCircle size={18} className="text-red-400" />}
          label="Failed"
          value={failedJobs}
          sub="jobs need attention"
          accent="bg-red-500"
          delay={0.3}
        />
      </div>

      {/* Chart + live metrics */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        {/* Area chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="lg:col-span-2 bg-[#0f0f1a] border border-white/[0.06] rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-white font-semibold">Platform Activity</div>
              <div className="text-slate-500 text-xs mt-0.5">Jobs submitted · Machines active · Last 24h</div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="w-3 h-0.5 bg-violet-500 rounded" /> Jobs
              </span>
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="w-3 h-0.5 bg-cyan-500 rounded" /> Machines
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="jobsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="machinesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="time" tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="jobs" name="Jobs" stroke="#7c3aed" strokeWidth={2} fill="url(#jobsGrad)" dot={false} />
              <Area type="monotone" dataKey="machines" name="Machines" stroke="#06b6d4" strokeWidth={2} fill="url(#machinesGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Live metrics sidebar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="bg-[#0f0f1a] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-4"
        >
          <div className="flex items-center justify-between">
            <div className="text-white font-semibold">Live Metrics</div>
            <GlowDot color="bg-violet-400" />
          </div>

          {[
            { label: "Avg CPU Usage", value: 42, color: "from-violet-600 to-purple-500", text: "text-violet-400" },
            { label: "Avg RAM Usage", value: 67, color: "from-cyan-600 to-blue-500", text: "text-cyan-400" },
            { label: "Queue Depth", value: pendingJobs * 10, color: "from-amber-600 to-orange-500", text: "text-amber-400" },
            { label: "Success Rate", value: jobs.length ? Math.round((completedJobs / jobs.length) * 100) : 100, color: "from-emerald-600 to-green-500", text: "text-emerald-400" },
          ].map((m, i) => (
            <div key={m.label}>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-slate-400">{m.label}</span>
                <span className={`font-semibold ${m.text}`}>{m.value}%</span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(m.value, 100)}%` }}
                  transition={{ delay: 0.5 + i * 0.1, duration: 0.8, ease: "easeOut" }}
                  className={`h-full bg-gradient-to-r ${m.color} rounded-full`}
                />
              </div>
            </div>
          ))}

          <div className="mt-auto pt-4 border-t border-white/[0.04]">
            <div className="text-xs text-slate-600 mb-3">Node health</div>
            <div className="flex flex-wrap gap-1.5">
              {machines.slice(0, 12).map((m, i) => (
                <div
                  key={m.id}
                  className={`w-4 h-4 rounded-sm ${
                    m.status === "online" ? "bg-emerald-500" :
                    m.status === "busy" ? "bg-amber-500" : "bg-slate-700"
                  }`}
                  title={`${m.os} · ${m.status}`}
                />
              ))}
              {machines.length === 0 && (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="w-4 h-4 rounded-sm bg-slate-800 animate-pulse" />
                ))
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Jobs + Machines tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="bg-[#0f0f1a] border border-white/[0.06] rounded-2xl overflow-hidden"
      >
        {/* Tab bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.04]">
          <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-xl">
            {(["jobs", "machines"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === tab
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {tab === "jobs" ? `Jobs (${jobs.length})` : `Machines (${machines.length})`}
              </button>
            ))}
          </div>
          <button className="text-slate-600 hover:text-slate-400 transition-colors">
            <MoreHorizontal size={18} />
          </button>
        </div>

        {/* Tab content */}
        <div className="p-5">
          <AnimatePresence mode="wait">
            {activeTab === "jobs" ? (
              <motion.div
                key="jobs"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {jobs.length === 0 ? (
                  <div className="text-center py-12">
                    <Briefcase size={32} className="text-slate-700 mx-auto mb-3" />
                    <div className="text-slate-500 text-sm">No jobs yet</div>
                    <div className="text-slate-700 text-xs mt-1">Submit your first job to get started</div>
                  </div>
                ) : (
                  <div>
                    {jobs.slice(0, 8).map((job, i) => (
                      <JobRow key={job.id} job={job} index={i} />
                    ))}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="machines"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {machines.length === 0 ? (
                  <div className="text-center py-12">
                    <Server size={32} className="text-slate-700 mx-auto mb-3" />
                    <div className="text-slate-500 text-sm">No machines registered</div>
                    <div className="text-slate-700 text-xs mt-1">Register a machine to donate compute power</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {machines.map((m, i) => (
                      <MachineCard key={m.id} machine={m} index={i} />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
