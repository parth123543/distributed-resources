"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, useInView } from "framer-motion";

function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const duration = 1800;
    const step = (timestamp: number, startTime: number) => {
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * to));
      if (progress < 1) requestAnimationFrame((t) => step(t, startTime));
    };
    requestAnimationFrame((t) => step(t, t));
  }, [inView, to]);

  return <span ref={ref}>{count}{suffix}</span>;
}

function Particle({ x, y, size, duration, delay }: {
  x: number; y: number; size: number; duration: number; delay: number;
}) {
  return (
    <motion.div
      className="absolute rounded-full bg-blue-500 opacity-20"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}
      animate={{ y: [0, -30, 0], x: [0, 15, 0], opacity: [0.1, 0.3, 0.1], scale: [1, 1.2, 1] }}
      transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function GlowOrb({ className }: { className: string }) {
  return <div className={`absolute rounded-full blur-[120px] opacity-20 pointer-events-none ${className}`} />;
}

function FeatureCard({ icon, title, desc, index }: {
  icon: string; title: string; desc: string; index: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 60 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.15, ease: [0.21, 0.47, 0.32, 0.98] }}
      whileHover={{ y: -8, transition: { duration: 0.2 } }}
      className="group relative bg-gradient-to-b from-slate-800/60 to-slate-900/60 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-sm overflow-hidden cursor-default"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-purple-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl" />
      <div className="absolute inset-0 border border-blue-500/0 group-hover:border-blue-500/30 rounded-2xl transition-all duration-500" />
      <div className="text-3xl mb-4">{icon}</div>
      <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
    </motion.div>
  );
}

function AnimatedTerminal() {
  const lines = [
    { text: "$ dr submit --cpu 4 --ram 8 train.py", color: "text-green-400", delay: 0 },
    { text: "✓ Job queued: job_4f2a9c1e", color: "text-blue-400", delay: 0.5 },
    { text: "✓ Assigned to node-07 (8 cores / 16GB)", color: "text-blue-400", delay: 1.0 },
    { text: "⚡ Container started — epoch 1/50", color: "text-yellow-400", delay: 1.5 },
    { text: "  loss: 0.8231 · acc: 0.6124", color: "text-slate-400", delay: 2.0 },
    { text: "  loss: 0.4821 · acc: 0.8341", color: "text-slate-400", delay: 2.5 },
    { text: "  loss: 0.2103 · acc: 0.9287", color: "text-slate-400", delay: 3.0 },
    { text: "✓ Job completed in 4m 23s", color: "text-green-400", delay: 3.5 },
    { text: "✓ Results saved → /outputs/run_001/", color: "text-green-400", delay: 4.0 },
  ];

  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.8, ease: [0.21, 0.47, 0.32, 0.98] }}
      className="relative bg-slate-900/90 border border-slate-700/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-2xl shadow-black/50"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50 bg-slate-800/50">
        <div className="w-3 h-3 rounded-full bg-red-500/80" />
        <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
        <div className="w-3 h-3 rounded-full bg-green-500/80" />
        <span className="ml-2 text-slate-500 text-xs font-mono">distributed-resources — bash</span>
      </div>
      <div className="p-5 font-mono text-sm space-y-1.5 min-h-[280px]">
        {lines.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: line.delay, duration: 0.3 }}
            className={line.color}
          >
            {line.text}
          </motion.div>
        ))}
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="inline-block w-2 h-4 bg-green-400 ml-1"
        />
      </div>
    </motion.div>
  );
}

function StatCard({ value, suffix, label, index }: {
  value: number; suffix: string; label: string; index: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ delay: index * 0.1, duration: 0.5, ease: "backOut" }}
      className="text-center"
    >
      <div className="text-4xl font-bold text-white">
        <Counter to={value} suffix={suffix} />
      </div>
      <div className="text-slate-400 text-sm mt-1">{label}</div>
    </motion.div>
  );
}

export default function LandingPage() {
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.25], [0, -80]);

  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: (i * 37 + 13) % 100,
    y: (i * 53 + 27) % 100,
    size: (i % 5) + 2,
    duration: (i % 4) + 3,
    delay: (i % 3) * 0.7,
  }));

  const features = [
    { icon: "🐳", title: "Docker-isolated execution", desc: "Every job runs in a sandboxed container with strict resource limits — no access to the host machine, no network, non-root user." },
    { icon: "⚡", title: "Redis-powered queue", desc: "BRPOP-based dispatch means jobs are picked up within milliseconds of submission. Atomic claiming prevents race conditions." },
    { icon: "🔄", title: "Automatic job recovery", desc: "Failure detector marks dead workers offline and requeues their jobs automatically. No human intervention required." },
    { icon: "📊", title: "Live metrics streaming", desc: "CPU, RAM, and disk metrics stream in real time via Redis pub/sub and WebSocket. Sub-5-second latency from worker to dashboard." },
    { icon: "🛡️", title: "JWT + RBAC security", desc: "Every API call is authenticated. Object-level authorization ensures you can only touch your own machines and jobs." },
    { icon: "🎯", title: "Resource-aware scheduling", desc: "Workers inspect job requirements before claiming. A 4-core job never lands on a 2-core machine." },
  ];

  return (
    <div className="min-h-screen bg-[#030712] text-white overflow-x-hidden">
      <GlowOrb className="w-[600px] h-[600px] bg-blue-600 top-[-200px] left-[-200px]" />
      <GlowOrb className="w-[500px] h-[500px] bg-purple-600 top-[200px] right-[-150px]" />
      <GlowOrb className="w-[400px] h-[400px] bg-cyan-600 top-[600px] left-[30%]" />

      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {particles.map((p) => (
          <Particle key={p.id} x={p.x} y={p.y} size={p.size} duration={p.duration} delay={p.delay} />
        ))}
      </div>

      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
        }}
      />

      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-8 py-4 border-b border-white/5 bg-[#030712]/80 backdrop-blur-xl"
      >
        <span className="text-xl font-bold tracking-tight">
          Distributed<span className="text-blue-400">Resources</span>
        </span>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
            >
              Sign in
            </motion.button>
          </Link>
          <Link href="/signup">
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(59,130,246,0.5)" }}
              whileTap={{ scale: 0.97 }}
              className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
            >
              Get started →
            </motion.button>
          </Link>
        </div>
      </motion.nav>

      <motion.section
        style={{ opacity: heroOpacity, y: heroY }}
        className="relative flex flex-col items-center justify-center text-center px-4 pt-40 pb-32 min-h-screen"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs px-4 py-1.5 rounded-full mb-10"
        >
          <motion.span
            animate={{ scale: [1, 1.4, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-1.5 h-1.5 bg-blue-400 rounded-full"
          />
          Campus distributed computing — now live
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-6xl md:text-7xl font-bold tracking-tight max-w-4xl leading-[1.1] mb-6"
        >
          Your campus has{" "}
          <span className="relative">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-400">
              supercomputer power
            </span>
            <motion.span
              className="absolute -inset-1 bg-gradient-to-r from-blue-400/20 to-purple-400/20 blur-xl rounded-lg"
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </span>
          {" "}sitting idle
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-slate-400 text-xl max-w-2xl leading-relaxed mb-10"
        >
          Submit ML training jobs, simulations, and data tasks. We schedule them across idle campus machines — Docker-isolated, resource-matched, and automatically recovered if a node goes offline.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="flex gap-4"
        >
          <Link href="/signup">
            <motion.button
              whileHover={{ scale: 1.06, boxShadow: "0 0 30px rgba(59,130,246,0.6), 0 0 60px rgba(59,130,246,0.2)" }}
              whileTap={{ scale: 0.97 }}
              className="px-8 py-3.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl font-semibold text-lg transition-all"
            >
              Start computing free →
            </motion.button>
          </Link>
          <Link href="/login">
            <motion.button
              whileHover={{ scale: 1.06, backgroundColor: "rgba(255,255,255,0.06)" }}
              whileTap={{ scale: 0.97 }}
              className="px-8 py-3.5 border border-white/10 text-slate-300 rounded-xl font-semibold text-lg hover:text-white transition-all"
            >
              Sign in
            </motion.button>
          </Link>
        </motion.div>

        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="absolute bottom-10 flex flex-col items-center gap-2 text-slate-600 text-xs"
        >
          <span>scroll to explore</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.div>
      </motion.section>

      <section className="relative border-y border-white/5 bg-white/[0.02] py-16">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 px-8">
          <StatCard value={500} suffix="+" label="Campus machines" index={0} />
          <StatCard value={99} suffix="%" label="Uptime SLA" index={1} />
          <StatCard value={450} suffix="ms" label="Avg dispatch time" index={2} />
          <StatCard value={10} suffix="x" label="Cost vs cloud" index={3} />
        </div>
      </section>

      <section className="relative max-w-6xl mx-auto px-8 py-32 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <div className="text-blue-400 text-sm font-semibold tracking-widest uppercase mb-4">How it works</div>
            <h2 className="text-4xl font-bold text-white leading-tight mb-6">
              Submit a job.<br />
              <span className="text-slate-400">We handle everything else.</span>
            </h2>
            <p className="text-slate-400 leading-relaxed mb-8">
              Define your resource requirements, paste your command, and hit submit. Our scheduler finds an available machine, spins up a sandboxed Docker container, executes your code, and delivers results — all in seconds.
            </p>
            <div className="space-y-4">
              {["Atomic job claiming — no duplicate execution", "Failure detection + automatic requeue", "Real-time log streaming via WebSocket"].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.4 }}
                  className="flex items-center gap-3 text-slate-300 text-sm"
                >
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 text-xs flex-shrink-0">✓</span>
                  {item}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
        <AnimatedTerminal />
      </section>

      <section className="relative max-w-6xl mx-auto px-8 pb-32">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-blue-400 text-sm font-semibold tracking-widest uppercase mb-4"
          >
            Built for production
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl font-bold text-white"
          >
            Everything a distributed system needs
          </motion.h2>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <FeatureCard key={f.title} {...f} index={i} />
          ))}
        </div>
      </section>

      <section className="relative px-8 py-32 flex flex-col items-center text-center">
        <GlowOrb className="w-[800px] h-[400px] bg-blue-600 bottom-0 left-1/2 -translate-x-1/2" />
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-5xl font-bold text-white max-w-2xl leading-tight mb-6"
        >
          Ready to use your campus&apos;s full potential?
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-slate-400 text-lg max-w-lg mb-10"
        >
          Join the platform and start running compute jobs on idle machines across campus — for free.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          <Link href="/signup">
            <motion.button
              whileHover={{ scale: 1.07, boxShadow: "0 0 40px rgba(59,130,246,0.7), 0 0 80px rgba(59,130,246,0.3)" }}
              whileTap={{ scale: 0.97 }}
              className="px-10 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold text-xl transition-all"
            >
              Get started — it&apos;s free →
            </motion.button>
          </Link>
        </motion.div>
      </section>

      <footer className="border-t border-white/5 px-8 py-8 flex items-center justify-between text-slate-600 text-sm">
        <span className="font-semibold text-slate-500">Distributed<span className="text-blue-500/70">Resources</span></span>
        <span>Built with FastAPI · Redis · Docker · Next.js</span>
      </footer>
    </div>
  );
}
