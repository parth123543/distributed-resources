"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getMachinesApi, registerMachineApi, deleteMachineApi } from "@/lib/api";
import type { Machine } from "@/lib/api";
import { Server, Plus, X, Trash2, Cpu, HardDrive, Monitor, Wifi, WifiOff, Clock } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string; pulse: boolean }> = {
    online:  { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400", pulse: true },
    offline: { bg: "bg-slate-500/10",   text: "text-slate-400",   dot: "bg-slate-500",   pulse: false },
    busy:    { bg: "bg-amber-500/10",   text: "text-amber-400",   dot: "bg-amber-400",   pulse: true },
  };
  const s = map[status] ?? map.offline;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`relative flex w-1.5 h-1.5`}>
        {s.pulse && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${s.dot} opacity-50`} />}
        <span className={`relative inline-flex rounded-full w-1.5 h-1.5 ${s.dot}`} />
      </span>
      {status}
    </span>
  );
}

function MachineCard({ machine, index, onDelete }: {
  machine: Machine; index: number; onDelete: (id: string) => void;
}) {
  const lastSeen = machine.last_heartbeat
    ? Math.round((Date.now() - new Date(machine.last_heartbeat).getTime()) / 1000)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.06, duration: 0.4 }}
      className="group bg-[#0f0f1a] border border-white/[0.06] rounded-2xl p-5 hover:border-violet-500/20 transition-all duration-300 relative overflow-hidden"
    >
      {/* top accent */}
      <div className={`absolute top-0 left-0 right-0 h-px ${
        machine.status === "online" ? "bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" :
        machine.status === "busy"   ? "bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" :
                                      "bg-gradient-to-r from-transparent via-slate-700/50 to-transparent"
      }`} />

      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
            machine.status === "online" ? "bg-emerald-500/10 border-emerald-500/20" :
            machine.status === "busy"   ? "bg-amber-500/10 border-amber-500/20" :
                                          "bg-slate-500/10 border-slate-700/20"
          }`}>
            <Server size={18} className={
              machine.status === "online" ? "text-emerald-400" :
              machine.status === "busy"   ? "text-amber-400" : "text-slate-500"
            } />
          </div>
          <div>
            <div className="text-white font-medium text-sm">{machine.os}</div>
            <div className="text-slate-600 text-xs font-mono">{machine.id.slice(0, 12)}...</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge status={machine.status} />
          <button
            onClick={() => onDelete(machine.id)}
            className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-red-400 transition-all"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Spec grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { icon: <Cpu size={12} className="text-violet-400" />,       label: "CPU",  value: `${machine.cpu_cores} cores` },
          { icon: <HardDrive size={12} className="text-cyan-400" />,   label: "RAM",  value: `${machine.ram_gb} GB` },
          { icon: <Monitor size={12} className="text-blue-400" />,     label: "OS",   value: machine.os.split(" ")[0] },
          { icon: <Clock size={12} className="text-slate-500" />,      label: "Seen",
            value: lastSeen !== null
              ? lastSeen < 60 ? `${lastSeen}s ago`
              : lastSeen < 3600 ? `${Math.round(lastSeen/60)}m ago`
              : `${Math.round(lastSeen/3600)}h ago`
              : "Never"
          },
        ].map((spec) => (
          <div key={spec.label} className="bg-white/[0.02] rounded-xl px-3 py-2">
            <div className="flex items-center gap-1.5 text-slate-600 text-[10px] mb-1">
              {spec.icon} {spec.label}
            </div>
            <div className="text-slate-300 text-xs font-medium truncate">{spec.value}</div>
          </div>
        ))}
      </div>

      {machine.gpu_info && (
        <div className="mt-2.5 bg-violet-500/10 border border-violet-500/20 rounded-xl px-3 py-2">
          <div className="text-[10px] text-violet-500 mb-0.5">GPU</div>
          <div className="text-violet-300 text-xs font-medium">{machine.gpu_info}</div>
        </div>
      )}
    </motion.div>
  );
}

function RegisterModal({ onClose, onRegister }: {
  onClose: () => void;
  onRegister: (data: any) => Promise<void>;
}) {
  const [form, setForm] = useState({ cpu_cores: 4, ram_gb: 8, os: "", gpu_info: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await onRegister({ ...form, gpu_info: form.gpu_info || undefined });
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Failed to register machine.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="w-full max-w-md bg-[#0f0f1a] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04]">
          <div>
            <div className="text-white font-semibold">Register Machine</div>
            <div className="text-slate-500 text-xs mt-0.5">Donate this machine's idle compute power</div>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 mb-2 block">CPU Cores</label>
              <input
                type="number" min={1} max={256} value={form.cpu_cores}
                onChange={(e) => setForm({ ...form, cpu_cores: Number(e.target.value) })}
                className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-2 block">RAM (GB)</label>
              <input
                type="number" min={1} max={512} step={0.5} value={form.ram_gb}
                onChange={(e) => setForm({ ...form, ram_gb: Number(e.target.value) })}
                className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-2 block">Operating System</label>
            <input
              type="text" value={form.os} placeholder="macOS 14, Ubuntu 22.04, Windows 11..."
              onChange={(e) => setForm({ ...form, os: e.target.value })} required
              className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-700 focus:outline-none focus:border-violet-500/50 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-2 block">GPU <span className="text-slate-700">(optional)</span></label>
            <input
              type="text" value={form.gpu_info} placeholder="NVIDIA RTX 3060, Apple M2..."
              onChange={(e) => setForm({ ...form, gpu_info: e.target.value })}
              className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-700 focus:outline-none focus:border-violet-500/50 transition-colors"
            />
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold rounded-xl hover:from-violet-500 hover:to-purple-500 transition-all disabled:opacity-50 shadow-lg shadow-violet-500/20"
          >
            {loading ? "Registering..." : "Register Machine →"}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function MachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    getMachinesApi().then(setMachines).catch(console.error);
    const interval = setInterval(() => getMachinesApi().then(setMachines).catch(console.error), 10000);
    return () => clearInterval(interval);
  }, []);

  async function handleRegister(data: any) {
    const machine = await registerMachineApi(data);
    setMachines((prev) => [machine, ...prev]);
  }

  async function handleDelete(id: string) {
    await deleteMachineApi(id);
    setMachines((prev) => prev.filter((m) => m.id !== id));
  }

  const online  = machines.filter((m) => m.status === "online").length;
  const offline = machines.filter((m) => m.status === "offline").length;
  const busy    = machines.filter((m) => m.status === "busy").length;

  return (
    <div className="min-h-screen bg-[#080810] p-6">
      <div className="fixed top-0 right-0 w-[400px] h-[400px] bg-emerald-600/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">Machines</h1>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-xs text-emerald-400">{online} online</span>
            <span className="text-xs text-amber-400">{busy} busy</span>
            <span className="text-xs text-slate-500">{offline} offline</span>
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(124,58,237,0.4)" }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-medium rounded-xl text-sm shadow-lg shadow-violet-500/20"
        >
          <Plus size={16} /> Register Machine
        </motion.button>
      </motion.div>

      {/* Grid */}
      {machines.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-32 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
            <Server size={24} className="text-violet-400" />
          </div>
          <div className="text-slate-400 font-medium mb-1">No machines registered</div>
          <div className="text-slate-600 text-sm">Register this machine to donate compute power</div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {machines.map((m, i) => (
              <MachineCard key={m.id} machine={m} index={i} onDelete={handleDelete} />
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <RegisterModal onClose={() => setShowModal(false)} onRegister={handleRegister} />
        )}
      </AnimatePresence>
    </div>
  );
}
