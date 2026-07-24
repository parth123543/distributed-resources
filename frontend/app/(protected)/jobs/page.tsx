"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getJobsApi, submitJobApi, deleteJobApi } from "@/lib/api";
import type { Job } from "@/lib/api";
import {
  Briefcase, Plus, X, Trash2, ChevronDown, ChevronUp,
  Clock, Cpu, MemoryStick, Terminal, CheckCircle, AlertCircle, Loader,
} from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    pending:   { bg: "bg-blue-500/10",    text: "text-blue-400",    dot: "bg-blue-400" },
    scheduled: { bg: "bg-violet-500/10",  text: "text-violet-400",  dot: "bg-violet-400" },
    running:   { bg: "bg-amber-500/10",   text: "text-amber-400",   dot: "bg-amber-400" },
    completed: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
    failed:    { bg: "bg-red-500/10",     text: "text-red-400",     dot: "bg-red-400" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === "running" ? "animate-pulse" : ""}`} />
      {status}
    </span>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle size={16} className="text-emerald-400" />;
  if (status === "failed")    return <AlertCircle size={16} className="text-red-400" />;
  if (status === "running")   return <Loader size={16} className="text-amber-400 animate-spin" />;
  return <Clock size={16} className="text-slate-500" />;
}

function JobCard({ job, index, onDelete }: { job: Job; index: number; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const duration = job.completed_at && job.started_at
    ? Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="bg-[#0f0f1a] border border-white/[0.06] rounded-2xl overflow-hidden hover:border-violet-500/20 transition-all duration-300"
    >
      <div className="flex items-center gap-4 p-4">
        <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
          <StatusIcon status={job.status} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-sm text-slate-200 font-mono truncate">{job.command}</div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-slate-600 flex items-center gap-1">
              <Cpu size={10} /> {job.required_cpu} cores
            </span>
            <span className="text-xs text-slate-600 flex items-center gap-1">
              <MemoryStick size={10} /> {job.required_ram}GB RAM
            </span>
            {duration && (
              <span className="text-xs text-slate-600 flex items-center gap-1">
                <Clock size={10} /> {duration}s
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <StatusBadge status={job.status} />
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-slate-600 hover:text-slate-300 transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button
            onClick={() => onDelete(job.id)}
            className="text-slate-700 hover:text-red-400 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/[0.04] overflow-hidden"
          >
            <div className="p-4 space-y-3">
              {job.result_output && (
                <div>
                  <div className="text-xs text-slate-500 mb-2 flex items-center gap-1.5">
                    <Terminal size={10} /> Output
                  </div>
                  <pre className="bg-black/40 border border-white/[0.04] rounded-xl p-3 text-xs text-emerald-300 font-mono overflow-x-auto whitespace-pre-wrap">
                    {job.result_output}
                  </pre>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white/[0.02] rounded-xl p-3">
                  <div className="text-slate-600 mb-1">Job ID</div>
                  <div className="text-slate-300 font-mono">{job.id}</div>
                </div>
                <div className="bg-white/[0.02] rounded-xl p-3">
                  <div className="text-slate-600 mb-1">Assigned Machine</div>
                  <div className="text-slate-300 font-mono">{job.assigned_machine_id?.slice(0, 16) ?? "—"}...</div>
                </div>
                <div className="bg-white/[0.02] rounded-xl p-3">
                  <div className="text-slate-600 mb-1">Created</div>
                  <div className="text-slate-300">{new Date(job.created_at).toLocaleString()}</div>
                </div>
                <div className="bg-white/[0.02] rounded-xl p-3">
                  <div className="text-slate-600 mb-1">Completed</div>
                  <div className="text-slate-300">{job.completed_at ? new Date(job.completed_at).toLocaleString() : "—"}</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SubmitModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (job: any) => Promise<void> }) {
  const [form, setForm] = useState({ command: "", required_cpu: 1, required_ram: 1, priority: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const examples = [
    { label: "Python print", cmd: 'python3 -c "print(\'Hello from campus compute!\')"' },
    { label: "Math compute", cmd: 'python3 -c "import math; print(sum(math.sqrt(i) for i in range(100000)))"' },
    { label: "System info",  cmd: 'python3 -c "import platform, os; print(platform.node(), os.cpu_count())"' },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.command.trim()) { setError("Command is required."); return; }
    setLoading(true);
    try {
      await onSubmit(form);
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Failed to submit job.");
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
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="w-full max-w-lg bg-[#0f0f1a] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl shadow-black/50"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04]">
          <div>
            <div className="text-white font-semibold">Submit Job</div>
            <div className="text-slate-500 text-xs mt-0.5">Run code on campus compute nodes</div>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Quick examples */}
          <div>
            <div className="text-xs text-slate-500 mb-2">Quick examples</div>
            <div className="flex flex-wrap gap-2">
              {examples.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => setForm({ ...form, command: ex.cmd })}
                  className="px-3 py-1 bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs rounded-lg hover:bg-violet-500/20 transition-colors"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          {/* Command */}
          <div>
            <label className="text-xs text-slate-400 mb-2 block">Command *</label>
            <textarea
              value={form.command}
              onChange={(e) => setForm({ ...form, command: e.target.value })}
              placeholder='python3 -c "print(Hello)"'
              rows={3}
              className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-slate-200 font-mono placeholder:text-slate-700 focus:outline-none focus:border-violet-500/50 resize-none transition-colors"
            />
          </div>

          {/* Resources */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 mb-2 block">CPU Cores</label>
              <input
                type="number"
                min={1}
                max={32}
                value={form.required_cpu}
                onChange={(e) => setForm({ ...form, required_cpu: Number(e.target.value) })}
                className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-2 block">RAM (GB)</label>
              <input
                type="number"
                min={0.5}
                max={64}
                step={0.5}
                value={form.required_ram}
                onChange={(e) => setForm({ ...form, required_ram: Number(e.target.value) })}
                className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500/50 transition-colors"
              />
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs text-slate-400 mb-2 block">
              Priority: <span className="text-violet-400">{form.priority}</span>
            </label>
            <input
              type="range"
              min={0}
              max={10}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
              className="w-full accent-violet-500"
            />
            <div className="flex justify-between text-[10px] text-slate-700 mt-1">
              <span>Low</span><span>High</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold rounded-xl hover:from-violet-500 hover:to-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader size={14} className="animate-spin" /> Submitting...
              </span>
            ) : "Submit Job →"}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    getJobsApi().then(setJobs).catch(console.error);
    const interval = setInterval(() => {
      getJobsApi().then(setJobs).catch(console.error);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleSubmit(data: any) {
    const job = await submitJobApi(data);
    setJobs((prev) => [job, ...prev]);
  }

  async function handleDelete(id: string) {
    await deleteJobApi(id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }

  const statuses = ["all", "pending", "running", "completed", "failed"];
  const filtered = filter === "all" ? jobs : jobs.filter((j) => j.status === filter);

  return (
    <div className="min-h-screen bg-[#080810] p-6">
      {/* Background */}
      <div className="fixed top-0 right-0 w-[400px] h-[400px] bg-violet-600/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">Jobs</h1>
          <p className="text-slate-500 text-sm mt-1">{jobs.length} total · auto-refreshes every 5s</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(124,58,237,0.4)" }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-medium rounded-xl text-sm shadow-lg shadow-violet-500/20"
        >
          <Plus size={16} /> Submit Job
        </motion.button>
      </motion.div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              filter === s
                ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20"
                : "bg-white/[0.03] text-slate-500 hover:text-slate-300 border border-white/[0.06]"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== "all" && (
              <span className="ml-1.5 text-xs opacity-60">
                ({jobs.filter((j) => j.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Jobs list */}
      <div className="space-y-3">
        <AnimatePresence>
          {filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-24 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
                <Briefcase size={24} className="text-violet-400" />
              </div>
              <div className="text-slate-400 font-medium mb-1">No jobs found</div>
              <div className="text-slate-600 text-sm">
                {filter === "all" ? "Submit your first job to get started" : `No ${filter} jobs`}
              </div>
            </motion.div>
          ) : (
            filtered.map((job, i) => (
              <JobCard key={job.id} job={job} index={i} onDelete={handleDelete} />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Submit modal */}
      <AnimatePresence>
        {showModal && (
          <SubmitModal onClose={() => setShowModal(false)} onSubmit={handleSubmit} />
        )}
      </AnimatePresence>
    </div>
  );
}
