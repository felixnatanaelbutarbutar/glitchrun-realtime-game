"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { playSound, SOUNDS } from "@/lib/sounds";

// ── SVG Chart Config ──────────────────────────────────────────────────────────
const W = 600;
const H = 360;   // ← Tinggi SVG diperbesar
const PAD_L = 12;
const PAD_B = 24;

function multToY(m: number): number {
    const ratio = Math.log(Math.max(m, 1.001)) / Math.log(20); // 20x = top
    return (H - PAD_B) - Math.min(ratio, 1) * (H - PAD_B - 14);
}

function getColor(m: number, phase: string): string {
    if (phase === "crashed") return "#ef4444";
    if (m >= 10) return "#a855f7";
    if (m >= 5) return "#f97316";
    if (m >= 2) return "#eab308";
    return "#22c55e";
}

function getCrashBadge(n: number) {
    if (n >= 10) return "bg-purple-500/25 text-purple-300 border-purple-500/40";
    if (n >= 5) return "bg-orange-500/25 text-orange-300 border-orange-500/40";
    if (n >= 2) return "bg-green-500/25  text-green-300  border-green-500/40";
    if (n >= 1.5) return "bg-yellow-500/25 text-yellow-300 border-yellow-500/40";
    return "bg-red-500/25 text-red-400 border-red-500/40";
}

// ── SVG Flight Chart ──────────────────────────────────────────────────────────
interface ChartPoint { x: number; y: number }

function FlightChart({ color }: { color: string }) {
    const { phase, multiplier } = useGameStore();
    const { animationsEnabled } = useSettingsStore();

    const pointsRef = useRef<ChartPoint[]>([{ x: PAD_L, y: H - PAD_B }]);
    const tickRef = useRef(0);
    const [pathD, setPathD] = useState(`M${PAD_L},${H - PAD_B}`);
    const [pos, setPos] = useState({ x: PAD_L, y: H - PAD_B });
    const crashed = phase === "crashed";

    useEffect(() => {
        if (phase === "waiting") {
            pointsRef.current = [{ x: PAD_L, y: H - PAD_B }];
            tickRef.current = 0;
            setPathD(`M${PAD_L},${H - PAD_B}`);
            setPos({ x: PAD_L, y: H - PAD_B });
            return;
        }
        if (phase === "running" || phase === "crashed") {
            tickRef.current += 1;
            const x = Math.min(PAD_L + tickRef.current * 5, W - 12);
            const y = multToY(multiplier);
            pointsRef.current.push({ x, y });

            const pts = pointsRef.current;
            let d = `M${pts[0].x},${pts[0].y}`;
            for (let i = 1; i < pts.length; i++) {
                const cpx = (pts[i - 1].x + pts[i].x) / 2;
                d += ` C${cpx},${pts[i - 1].y} ${cpx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
            }
            setPathD(d);
            setPos({ x, y });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [multiplier, phase]);

    return (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
            <defs>
                <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.45" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.01" />
                </linearGradient>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="4" result="b" />
                    <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
            </defs>

            {/* Grid lines */}
            {[1.5, 2, 3, 5, 10, 20].map((m) => {
                const y = multToY(m);
                if (y < 0) return null;
                return (
                    <g key={m}>
                        <line x1={PAD_L} y1={y} x2={W} y2={y}
                            stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 8" />
                        <text x={PAD_L + 4} y={y - 5} fill="rgba(255,255,255,0.18)"
                            fontSize="10" fontFamily="monospace">{m}x</text>
                    </g>
                );
            })}

            {/* Fill */}
            {pathD.length > 5 && (
                <path d={`${pathD} L${pos.x},${H - PAD_B} L${PAD_L},${H - PAD_B} Z`}
                    fill="url(#cg)" />
            )}

            {/* Curve */}
            <path d={pathD} fill="none" stroke={color} strokeWidth="3"
                strokeLinecap="round" strokeLinejoin="round"
                filter={crashed || !animationsEnabled ? undefined : "url(#glow)"}
                style={{ transition: "stroke 0.3s" }} />

            {/* Plane */}
            {!crashed && (
                <g transform={`translate(${pos.x - 16}, ${pos.y - 16})`}>
                    <circle cx="16" cy="16" r="20" fill={color} fillOpacity="0.15">
                        {animationsEnabled && (
                            <>
                                <animate attributeName="r" values="20;30;20" dur="0.9s" repeatCount="indefinite" />
                                <animate attributeName="fill-opacity" values="0.15;0.04;0.15" dur="0.9s" repeatCount="indefinite" />
                            </>
                        )}
                    </circle>
                    <image href="/plane.png" width="32" height="32" x="0" y="0" />
                </g>
            )}

            {/* Explosion */}
            {crashed && (
                <g transform={`translate(${pos.x - 24}, ${pos.y - 28})`}>
                    <text fontSize="44" x="0" y="44">💥</text>
                </g>
            )}
        </svg>
    );
}

// ── Crash Notification ────────────────────────────────────────────────────────

function CrashNotification({ crashPoint, onDone }: { crashPoint: number; onDone: () => void }) {
    const { animationsEnabled } = useSettingsStore();

    useEffect(() => {
        const t = setTimeout(onDone, 3500);
        return () => clearTimeout(t);
    }, [onDone]);

    const label = `${crashPoint.toFixed(2)}×`;
    return (
        <motion.div
            initial={animationsEnabled ? { y: -130, opacity: 0, scale: 0.8 } : { y: 0, opacity: 1, scale: 1 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={animationsEnabled ? { y: -130, opacity: 0, scale: 0.8 } : { opacity: 0 }}
            transition={animationsEnabled ? { type: "spring", stiffness: 420, damping: 24 } : { duration: 0 }}
            className="fixed top-5 left-1/2 z-50 -translate-x-1/2 pointer-events-none"
        >
            <div className="relative flex flex-col items-center gap-1 px-10 py-4 rounded-2xl
                      border-2 border-red-500 bg-black/90 backdrop-blur-md
                      shadow-[0_0_70px_rgba(239,68,68,0.7)]"
                style={{ minWidth: 300 }}>
                {/* Scanlines */}
                <div className="absolute inset-0 rounded-2xl overflow-hidden opacity-[0.07]"
                    style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,40,40,0.5) 2px,rgba(255,40,40,0.5) 4px)" }} />

                <span className="text-red-400 text-xs font-mono uppercase tracking-[0.3em]">💥 BUSTED</span>

                {/* Glitch multiplier */}
                <span
                    className={`font-black font-mono text-red-500 leading-none ${animationsEnabled ? "glitch-active" : ""}`}
                    data-text={label}
                    style={{ fontSize: "4rem", textShadow: "0 0 40px rgba(239,68,68,0.9)" }}
                >
                    {label}
                </span>

                <span className="text-gray-500 text-xs font-mono">Better luck next round!</span>

                {/* Progress drain */}
                {animationsEnabled ? (
                    <motion.div
                        className="absolute bottom-0 left-0 h-0.5 bg-red-500 rounded-b-2xl"
                        initial={{ width: "100%" }}
                        animate={{ width: "0%" }}
                        transition={{ duration: 3.5, ease: "linear" }}
                    />
                ) : (
                    <div className="absolute bottom-0 left-0 h-0.5 bg-red-500 rounded-b-2xl w-full" />
                )}
            </div>
        </motion.div>
    );
}

// ── Cashout Notification ──────────────────────────────────────────────────────

function CashoutNotification({ cashout, onDone }: { cashout: { payout: number; multiplier: number }; onDone: () => void }) {
    const { animationsEnabled } = useSettingsStore();

    useEffect(() => {
        const t = setTimeout(onDone, 3800); // Tampil sedikit lebih lama
        return () => clearTimeout(t);
    }, [onDone]);

    const label = `${cashout.multiplier.toFixed(2)}×`;
    return (
        <motion.div
            initial={animationsEnabled ? { y: -130, opacity: 0, scale: 0.8 } : { y: 0, opacity: 1, scale: 1 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={animationsEnabled ? { y: -130, opacity: 0, scale: 0.8 } : { opacity: 0 }}
            transition={animationsEnabled ? { type: "spring", stiffness: 420, damping: 24 } : { duration: 0 }}
            className="fixed top-5 left-1/2 z-50 -translate-x-1/2 pointer-events-none"
        >
            <div className="relative flex flex-col items-center gap-1 px-10 py-5 rounded-2xl
                      border-2 border-green-500 bg-black/90 backdrop-blur-md
                      shadow-[0_0_70px_rgba(34,197,94,0.7)]"
                style={{ minWidth: 320 }}>
                {/* Scanlines */}
                <div className="absolute inset-0 rounded-2xl overflow-hidden opacity-[0.09]"
                    style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(34,197,94,0.5) 2px,rgba(34,197,94,0.5) 4px)" }} />

                <span className="text-green-400 text-xs font-mono font-black uppercase tracking-[0.3em] mb-1">
                    ✓ CASHOUT SUCCESS
                </span>

                {/* Glitch multiplier */}
                <span
                    className={`font-black font-mono text-green-400 leading-none ${animationsEnabled ? "glitch-active-green" : ""}`}
                    data-text={label}
                    style={{ fontSize: "4.5rem", textShadow: "0 0 45px rgba(34,197,94,1)" }}
                >
                    {label}
                </span>

                <span className="text-yellow-400 text-lg font-mono font-black mt-2 bg-yellow-400/10 px-4 py-1 rounded-full border border-yellow-500/30">
                    WON ${cashout.payout.toFixed(2)}
                </span>

                {/* Progress drain */}
                {animationsEnabled ? (
                    <motion.div
                        className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-green-400 to-emerald-600 rounded-b-2xl"
                        initial={{ width: "100%" }}
                        animate={{ width: "0%" }}
                        transition={{ duration: 3.8, ease: "linear" }}
                    />
                ) : (
                    <div className="absolute bottom-0 left-0 h-1 bg-green-500 rounded-b-2xl w-full" />
                )}
            </div>
        </motion.div>
    );
}

// ── Countdown (local, ticks every second) ────────────────────────────────────

function Countdown() {
    const { nextRoundIn, phase } = useGameStore();
    const [count, setCount] = useState(nextRoundIn);

    useEffect(() => {
        if (phase !== "waiting") { setCount(nextRoundIn); return; }

        // Sync to latest nextRoundIn from server
        setCount(nextRoundIn);

        // Tick every second
        const interval = setInterval(() => {
            setCount((prev) => Math.max(0, prev - 1));
        }, 1000);

        return () => clearInterval(interval);
    }, [phase, nextRoundIn]); // restarts when phase changes or new nextRoundIn arrives

    return (
        <motion.div key={count}
            initial={{ scale: 1.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="font-black font-mono text-green-400 leading-none"
            style={{ fontSize: "5rem", textShadow: "0 0 40px rgba(34,197,94,0.7)" }}
        >
            {count}s
        </motion.div>
    );
}

// ── Main GameBoard ─────────────────────────────────────────────────────────────

export default function GameBoard() {
    const { phase, multiplier, crashPoint, history, seedHash, lastCashout, clearLastCashout } = useGameStore();
    const { soundEnabled, animationsEnabled } = useSettingsStore();

    const crashed = phase === "crashed";
    const color = getColor(multiplier, phase);

    const [showNotif, setShowNotif] = useState(false);
    const [showAllHistory, setShowAllHistory] = useState(false);
    const prevPhaseRef = useRef<string>("");
    const vignetteRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (phase === "crashed" && prevPhaseRef.current !== "crashed") {
            setShowNotif(true);
            if (soundEnabled) playSound(SOUNDS.crash);
            if (vignetteRef.current && animationsEnabled) {
                vignetteRef.current.classList.remove("vignette-flash");
                void vignetteRef.current.offsetWidth;
                vignetteRef.current.classList.add("vignette-flash");
            }
        }
        prevPhaseRef.current = phase;
    }, [phase, soundEnabled, animationsEnabled]);

    const multLabel = `${multiplier.toFixed(2)}×`;

    return (
        <>
            <AnimatePresence>
                {/* 1) Notifikasi Crash */}
                {showNotif && crashPoint !== null && (
                    <CrashNotification key="crash-notif" crashPoint={crashPoint} onDone={() => setShowNotif(false)} />
                )}

                {/* 2) Notifikasi Cashout (independent from phase) */}
                {lastCashout !== null && (
                    <CashoutNotification key={`cashout-${lastCashout.payout}`} cashout={lastCashout} onDone={clearLastCashout} />
                )}
            </AnimatePresence>

            <div className="flex flex-col gap-3 w-full h-full">

                {/* ── Flight Chart Card ─────────────────────────────────────────── */}
                <div
                    className="relative overflow-hidden rounded-2xl border border-surface-border flex-1"
                    style={{
                        background: "linear-gradient(160deg, #0b1120 0%, #0f1623 100%)",
                        minHeight: "clamp(260px, 45vw, 480px)",
                    }}
                >
                    <div ref={vignetteRef} className="absolute inset-0 rounded-2xl pointer-events-none z-10" />

                    {/* Red flash overlay */}
                    <AnimatePresence>
                        {crashed && (
                            <motion.div key="rf"
                                initial={{ opacity: 0.5 }} animate={{ opacity: 0 }}
                                transition={{ duration: 1.8 }}
                                className="absolute inset-0 bg-red-600 pointer-events-none z-10"
                            />
                        )}
                    </AnimatePresence>

                    {/* SVG Chart */}
                    <div className="absolute inset-0">
                        <FlightChart color={color} />
                    </div>

                    {/* Multiplier overlay */}
                    <div className="relative z-20 flex flex-col items-center justify-start pt-10">
                        <AnimatePresence mode="wait">

                            {/* WAITING with countdown */}
                            {phase === "waiting" ? (
                                <motion.div key="waiting"
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="flex flex-col items-center gap-1"
                                >
                                    <span className="text-gray-500 text-xs font-mono uppercase tracking-widest mb-1">
                                        Next round in
                                    </span>
                                    <Countdown />
                                    {seedHash && (
                                        <span className="text-gray-700 text-[10px] font-mono mt-2 px-4 text-center">
                                            Seed: {seedHash.slice(0, 24)}…
                                        </span>
                                    )}
                                </motion.div>

                            ) : (
                                /* RUNNING / CRASHED */
                                <motion.div key="active"
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="flex flex-col items-center"
                                >
                                    <motion.span
                                        className="text-xs font-mono uppercase tracking-[0.22em] mb-1"
                                        style={{ color: color + "aa", transition: "color 0.3s" }}
                                    >
                                        {crashed ? "Busted at" : "Flying at"}
                                    </motion.span>

                                    {/* ★ GLITCH MULTIPLIER ★ */}
                                    <motion.div
                                        className={`font-mono font-black leading-none select-none relative ${crashed ? "glitch-active" : ""}`}
                                        data-text={multLabel}
                                        style={{
                                            fontSize: "clamp(4rem, 10vw, 7.5rem)", // ← Lebih besar
                                            color,
                                            textShadow: crashed
                                                ? "0 0 70px rgba(239,68,68,0.95), 0 0 140px rgba(239,68,68,0.4)"
                                                : `0 0 55px ${color}90`,
                                            transition: "color 0.25s, text-shadow 0.25s",
                                        }}
                                        animate={!crashed
                                            ? {
                                                y: [0, -4, 0],
                                                transition: { repeat: Infinity, duration: 0.7, ease: "easeInOut" }
                                            }
                                            : {
                                                x: [0, -10, 10, -8, 8, -5, 5, 0],
                                                transition: { duration: 0.5, ease: "easeOut" }
                                            }
                                        }
                                    >
                                        {multLabel}
                                    </motion.div>

                                    {crashed && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.6 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: 0.1, type: "spring", stiffness: 500 }}
                                            className="mt-3 px-6 py-1.5 rounded-full border border-red-500/50
                                 bg-red-500/10 text-red-400 text-sm font-bold uppercase tracking-widest"
                                        >
                                            💥 Rocket Crashed
                                        </motion.div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Bottom bar pulse */}
                    <motion.div
                        className="absolute bottom-0 left-0 right-0 h-0.5"
                        style={{ backgroundColor: color, transition: "background-color 0.3s" }}
                        animate={!crashed
                            ? { opacity: [0.4, 1, 0.4], transition: { repeat: Infinity, duration: 1 } }
                            : {}}
                    />
                </div>

                {/* ── Crash History ─────────────────────────────────────────────── */}
                <div>
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-gray-600 text-xs font-mono uppercase tracking-widest">Recent Crashes</span>
                        <div className="flex-1 h-px bg-surface-border" />
                        {/* Mobile: show toggle button */}
                        <button
                            onClick={() => setShowAllHistory(p => !p)}
                            className="sm:hidden flex items-center gap-1 text-[10px] font-mono
                                       text-gray-500 hover:text-green-400 transition px-2 py-0.5
                                       rounded border border-surface-border hover:border-green-500/40"
                        >
                            {showAllHistory ? (
                                <><span>Close</span><span className="text-[8px]">▲</span></>
                            ) : (
                                <><span>+{Math.max(0, history.length - 5)} more</span><span className="text-[8px]">▼</span></>
                            )}
                        </button>
                        <span className="text-gray-700 text-xs font-mono">{history.length}/50</span>
                    </div>

                    {/* Desktop: always show all (up to 50). Mobile: 5 or all */}
                    <div className="flex flex-wrap gap-1.5">
                        {history.length === 0 && (
                            <span className="text-gray-700 text-xs font-mono italic">No rounds yet…</span>
                        )}
                        {
                            /* On mobile show 5 unless expanded; desktop always full */
                            history.slice(0, showAllHistory ? 50 : undefined).map((n, i) => {
                                /* On mobile hide items beyond index 4 unless showAllHistory */
                                const hiddenOnMobile = !showAllHistory && i >= 5;
                                return (
                                    <motion.span
                                        key={`${n}-${i}`}
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2, ease: "easeOut" }}
                                        className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg border
                                            ${getCrashBadge(n)}
                                            ${hiddenOnMobile ? "hidden sm:inline-flex" : ""}`}
                                    >
                                        {n.toFixed(2)}x
                                    </motion.span>
                                );
                            })
                        }
                    </div>

                    {/* Mobile: expand panel when showAllHistory */}
                    <AnimatePresence>
                        {showAllHistory && history.length > 5 && (
                            <motion.div
                                key="history-expand"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden sm:hidden mt-1"
                            >
                                {/* The extra items are already rendered above via hiddenOnMobile; 
                                    this panel just gives spacing and a close-row affordance */}
                                <button
                                    onClick={() => setShowAllHistory(false)}
                                    className="mt-2 w-full text-[10px] font-mono text-gray-600
                                               hover:text-red-400 transition text-center py-1
                                               border border-surface-border rounded-lg"
                                >
                                    ✕ Close
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </>
    );
}
