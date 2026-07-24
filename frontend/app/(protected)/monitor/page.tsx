"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { getToken } from "@/lib/auth";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Activity, Cpu, HardDrive, Wifi, WifiOff } from "lucide-react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
const MAX_POINTS = 30;

interface MetricPoint {
  time: string;
  cpu: number;
  ram: number;
  disk: number;
}

interface LiveMetrics {
  machine_id: string;
  timestamp: string;
  cpu_percent: number;
  ram_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  disk_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-xl px-4 py-3 shadow-2xl">
      <div className="text-slate-500 text-xs mb-2">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="text-white font-semibold">{p.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

function GaugeMeter({ value, label, color, max = 100 }: {
  value: number; label: string; color: string; max?: number;
}) {
  const pct = Math.min((value / max) * 100, 100);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = (pct / 100) * circumference * 0.75;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 128 128" className="w-full h-full -rotate-[225deg]">
          {/* track */}
          <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.05)"
            strokeWidth="8" strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
            strokeLinecap="round"
          />
          {/* fill */}
          <motion.circle
            cx="64" cy="64" r={radius} fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={`${strokeDash} ${circumference - strokeDash}`}
            strokeLinecap="round"
            initial={{ strokeDasharray: `0 ${circumference}` }}
            animate={{ strokeDasharray: `${strokeDash} ${circumference - strokeDash}` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </svg>
        {/* center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{value.toFixed(0)}</span>
          <span className="text-xs text-slate-500">%</span>
        </div>
      </div>
      <div className="text-slate-400 text-sm font-medium mt-2">{label}</div>
    </div>
  );
}

function MetricBar({ label, value, used, total, color, icon }: {
  label: string; value: number; used: number; total: number; color: string; icon: React.ReactNode;
}) {
  return (
    <div className="bg-[#0f0f1a] border border-white/[0.06] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white/[0.03] flex items-center justify-center">
            {icon}
          </div>
          <span className="text-slate-300 font-medium text-sm">{label}</span>
        </div>
        <span className="text-2xl font-bold text-white">{value.toFixed(1)}%</span>
      </div>

      <div className="h-2.5 bg-white/[0.04] rounded-full overflow-hidden mb-3">
        <motion.div
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>

      <div className="flex justify-between text-xs text-slate-600">
        <span>{used.toFixed(1)} GB used</span>
        <span>{total.toFixed(1)} GB total</span>
      </div>
    </div>
  );
}

export default function MonitorPage() {
  const [connected, setConnected] = useState(false);
  const [latest, setLatest] = useState<LiveMetrics | null>(null);
  const [history, setHistory] = useState<MetricPoint[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    function connect() {
      const ws = new WebSocket(`${WS_URL}/ws/metrics?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (e) => {
        const data: LiveMetrics = JSON.parse(e.data);
        setLatest(data);
        setHistory((prev) => {
          const point: MetricPoint = {
            time: new Date(data.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            cpu:  data.cpu_percent,
            ram:  data.ram_percent,
            disk: data.disk_percent,
          };
          return [...prev.slice(-MAX_POINTS + 1), point];
        });
      };
    }

    connect();
    return () => wsRef.current?.close();
  }, []);

  return (
    <div className="min-h-screen bg-[#080810] p-6">
      {/* Background */}
      <div className="fixed top-0 left-1/2 w-[600px] h-[300px] bg-cyan-600/5 rounded-full blur-[100px] pointer-events-none -translate-x-1/2" />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">Live Monitor</h1>
          <p className="text-slate-500 text-sm mt-1">Real-time metrics via WebSocket · Redis pub/sub</p>
        </div>

        <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all ${
          connected
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            : "bg-red-500/10 border-red-500/20 text-red-400"
        }`}>
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          {connected ? "Connected" : "Reconnecting..."}
        </div>
      </motion.div>

      {!connected && !latest && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-32 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-4">
            <Activity size={24} className="text-cyan-400 animate-pulse" />
          </div>
          <div className="text-slate-400 font-medium mb-1">Connecting to metrics stream...</div>
          <div className="text-slate-600 text-sm">Make sure the worker agent is running</div>
        </motion.div>
      )}

      {latest && (
        <>
          {/* Gauge row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-[#0f0f1a] border border-white/[0.06] rounded-2xl p-6 mb-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="text-white font-semibold">Current Utilization</div>
              <div className="text-slate-600 text-xs font-mono">
                {latest.machine_id.slice(0, 12)}...
              </div>
            </div>
            <div className="flex items-center justify-around">
              <GaugeMeter value={latest.cpu_percent}  label="CPU"  color="#7c3aed" />
              <GaugeMeter value={latest.ram_percent}  label="RAM"  color="#06b6d4" />
              <GaugeMeter value={latest.disk_percent} label="Disk" color="#10b981" />
            </div>
          </motion.div>

          {/* Detail bars */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6"
          >
            <MetricBar
              label="Memory"
              value={latest.ram_percent}
              used={latest.ram_used_gb}
              total={latest.ram_total_gb}
              color="linear-gradient(90deg, #0891b2, #06b6d4)"
              icon={<HardDrive size={16} className="text-cyan-400" />}
            />
            <MetricBar
              label="Disk"
              value={latest.disk_percent}
              used={latest.disk_used_gb}
              total={latest.disk_total_gb}
              color="linear-gradient(90deg, #059669, #10b981)"
              icon={<HardDrive size={16} className="text-emerald-400" />}
            />
          </motion.div>

          {/* History chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-[#0f0f1a] border border-white/[0.06] rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="text-white font-semibold">Metrics History</div>
                <div className="text-slate-500 text-xs mt-0.5">Last {MAX_POINTS} data points · updates every 5s</div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-3 h-0.5 bg-violet-500 rounded" /> CPU
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-3 h-0.5 bg-cyan-500 rounded" /> RAM
                </span>
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="w-3 h-0.5 bg-emerald-500 rounded" /> Disk
                </span>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={history} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <defs>
                  {[
                    { id: "cpuG",  color: "#7c3aed" },
                    { id: "ramG",  color: "#06b6d4" },
                    { id: "diskG", color: "#10b981" },
                  ].map(({ id, color }) => (
                    <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="time" tick={{ fill: "#475569", fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="cpu"  name="CPU"  stroke="#7c3aed" strokeWidth={2} fill="url(#cpuG)"  dot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="ram"  name="RAM"  stroke="#06b6d4" strokeWidth={2} fill="url(#ramG)"  dot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="disk" name="Disk" stroke="#10b981" strokeWidth={2} fill="url(#diskG)" dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        </>
      )}
    </div>
  );
}
