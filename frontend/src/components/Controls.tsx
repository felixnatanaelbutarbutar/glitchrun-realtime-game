"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/store/useGameStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useWebSocket } from "@/hooks/useWebSocket";
import { playSound, SOUNDS } from "@/lib/sounds";

// ── Preset chips ──────────────────────────────────────────────────────────────
const PRESETS = [1, 5, 10, 25, 50, 100];

// ── StatBox helper ─────────────────────────────────────────────────────────────
function StatBox({ label, value, accent, big }: {
    label: string; value: string; accent?: boolean; big?: boolean
}) {
    return (
        <div className="bg-black/30 rounded-xl p-2 border border-white/5 flex flex-col gap-0.5">
            <div className="text-gray-600 text-[10px] font-mono uppercase tracking-wide">{label}</div>
            <motion.div key={value} initial={{ y: -5, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                className={`font-mono font-bold leading-tight ${big ? "text-sm" : "text-xs"}
                    ${accent ? "text-green-400" : "text-white"}`}>
                {value}
            </motion.div>
        </div>
    );
}

// ── Main Controls ─────────────────────────────────────────────────────────────
export default function Controls() {
    const { phase, activeBet, balance, userId, multiplier } = useGameStore();
    const { sendMessage } = useWebSocket();
    const {
        soundEnabled, setSoundEnabled,
        animationsEnabled, setAnimationsEnabled,
        autoCashoutEnabled, setAutoCashoutEnabled,
        autoCashoutMultiplier, setAutoCashoutMultiplier
    } = useSettingsStore();

    const [betInput, setBetInput] = useState("10");
    const [inputError, setInputError] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [queuedBet, setQueuedBet] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const isWaiting = phase === "waiting";
    const isRunning = phase === "running";
    const hasBet = activeBet !== null;
    const parsedBet = parseFloat(betInput) || 0;
    const isValid = parsedBet > 0 && parsedBet <= balance;

    const potentialPay = hasBet && multiplier > 1
        ? parseFloat((activeBet!.amount * multiplier).toFixed(2))
        : null;
    const profit = potentialPay !== null ? parseFloat((potentialPay - activeBet!.amount).toFixed(2)) : null;

    // ── Input handlers ────────────────────────────────────────────────────────
    const handleBetInput = (val: string) => {
        if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
            setBetInput(val);
            setInputError(false);
        }
    };

    const handleBetBlur = () => {
        const n = parseFloat(betInput);
        if (!isNaN(n) && n > 0) setBetInput(n.toFixed(2));
        else if (betInput !== "") setInputError(true);
    };

    // ── Quick-set helpers ─────────────────────────────────────────────────────
    const setPreset = (n: number) => { setBetInput(n.toFixed(2)); setInputError(false); };
    const half = () => { const n = parsedBet; setBetInput(n > 0 ? Math.max(0.01, n / 2).toFixed(2) : "1.00"); };
    const doDouble = () => { const n = parsedBet; setBetInput(Math.min(n * 2, balance).toFixed(2)); };
    const allIn = () => { setBetInput(balance.toFixed(2)); setInputError(false); };

    // ── Place bet ─────────────────────────────────────────────────────────────
    const handlePlaceBet = useCallback(() => {
        if (!isValid || hasBet || isLoading || queuedBet) return;

        if (isRunning || phase === "crashed") {
            setQueuedBet(true);
            return;
        }

        setIsLoading(true);
        const payload: Record<string, unknown> = { type: "bet", userId, amount: parsedBet };
        if (autoCashoutEnabled && autoCashoutMultiplier > 1) {
            payload.autoCashout = autoCashoutMultiplier;
        }
        sendMessage(payload);
        if (soundEnabled) playSound(SOUNDS.bet);
        setTimeout(() => setIsLoading(false), 800);
    }, [isValid, isRunning, phase, hasBet, queuedBet, isLoading, userId, parsedBet, autoCashoutEnabled, autoCashoutMultiplier, sendMessage, soundEnabled]);

    // ── Flush queued bet when round becomes waiting ───────────────────────────
    useEffect(() => {
        if (isWaiting && queuedBet && !hasBet) {
            setQueuedBet(false);
            if (parsedBet > 0 && parsedBet <= balance) {
                setIsLoading(true);
                const payload: Record<string, unknown> = { type: "bet", userId, amount: parsedBet };
                if (autoCashoutEnabled && autoCashoutMultiplier > 1) {
                    payload.autoCashout = autoCashoutMultiplier;
                }
                sendMessage(payload);
                if (soundEnabled) playSound(SOUNDS.bet);
                setTimeout(() => setIsLoading(false), 800);
            }
        }
    }, [isWaiting, queuedBet, hasBet, parsedBet, autoCashoutEnabled, autoCashoutMultiplier, balance, userId, sendMessage, soundEnabled]);

    // ── Cash out ──────────────────────────────────────────────────────────────
    const handleCashOut = useCallback(() => {
        if (!isRunning || !hasBet) return;
        sendMessage({ type: "cashout", userId });
        if (soundEnabled) playSound(SOUNDS.cashout);
    }, [isRunning, hasBet, userId, sendMessage, soundEnabled]);

    // ── Auto Cashout logic (frontend driven) ──────────────────────────────────
    const autoCashoutTriggered = useRef(false);

    useEffect(() => {
        if (!isRunning) {
            autoCashoutTriggered.current = false;
        }
    }, [isRunning]);

    useEffect(() => {
        if (isRunning && hasBet && autoCashoutEnabled && autoCashoutMultiplier > 1 && !autoCashoutTriggered.current) {
            if (multiplier >= autoCashoutMultiplier) {
                autoCashoutTriggered.current = true;
                handleCashOut();
            }
        }
    }, [isRunning, hasBet, autoCashoutEnabled, autoCashoutMultiplier, multiplier, handleCashOut]);

    // ── ⌨️ Keyboard shortcuts ─────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Enter" && document.activeElement === inputRef.current) {
                e.preventDefault();
                handlePlaceBet();
                return;
            }
            if (e.code === "Space" && document.activeElement?.tagName !== "INPUT") {
                e.preventDefault();
                handleCashOut();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [handlePlaceBet, handleCashOut]);

    return (
        <div className="flex flex-col gap-2 w-full">

            {/* ── Bet input card ──────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-surface-border bg-surface-card p-3 sm:p-4 flex flex-col gap-2 sm:gap-3">

                {/* ── Bet Amount header row: label + ALL IN + ½ + 2× ── */}
                <div className="flex items-center justify-between">
                    <label className="text-gray-300 text-sm font-bold">Bet Amount</label>
                    <div className="flex gap-1.5">
                        {/* ½ */}
                        <button onClick={half} disabled={hasBet || queuedBet}
                            className="text-xs font-bold font-mono w-8 h-7 rounded-lg
                           bg-surface-DEFAULT border border-surface-border text-gray-300
                           hover:border-green-400/60 hover:text-green-300 transition
                           disabled:opacity-30 disabled:cursor-not-allowed">
                            ½
                        </button>
                        {/* 2× */}
                        <button onClick={doDouble} disabled={hasBet || queuedBet}
                            className="text-xs font-bold font-mono px-2 h-7 rounded-lg
                           bg-green-500/15 border border-green-500/40 text-green-300
                           hover:bg-green-500/25 hover:border-green-400 transition
                           disabled:opacity-30 disabled:cursor-not-allowed">
                            2×
                        </button>
                        {/* ALL IN */}
                        <button onClick={allIn} disabled={hasBet || queuedBet || balance <= 0}
                            className="text-xs font-bold font-mono px-2 h-7 rounded-lg border
                             border-yellow-500/40 text-yellow-400 bg-yellow-500/10
                             hover:bg-yellow-500/20 transition
                             disabled:opacity-30 disabled:cursor-not-allowed">
                            ALL IN
                        </button>
                    </div>
                </div>

                {/* ── Input row ─────────────────────────────────────────── */}
                <div className="relative flex items-center">
                    <span className="absolute left-3 text-gray-400 font-mono font-bold text-base z-10 select-none">$</span>
                    <input
                        ref={inputRef}
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*\.?[0-9]{0,2}"
                        value={betInput}
                        onChange={(e) => handleBetInput(e.target.value)}
                        onBlur={handleBetBlur}
                        disabled={hasBet || queuedBet}
                        placeholder="0.00"
                        autoComplete="off"
                        className={`w-full bg-surface-DEFAULT rounded-xl pl-8 pr-10 py-3
                          font-mono text-lg font-bold
                          border transition focus:outline-none
                          disabled:opacity-40 disabled:cursor-not-allowed
                          placeholder:text-gray-700
                          ${inputError
                                ? "border-red-500 focus:ring-1 focus:ring-red-500/40"
                                : "border-surface-border focus:border-green-500 focus:ring-1 focus:ring-green-500/20"
                            }`}
                        style={{
                            color: "#e2e8f0",
                            WebkitTextFillColor: "#e2e8f0",
                            caretColor: "#4ade80",
                            backgroundColor: "#0f1117",
                        }}
                    />
                    {betInput && !hasBet && !queuedBet && (
                        <button onClick={() => { setBetInput(""); inputRef.current?.focus(); }}
                            className="absolute right-3 text-gray-600 hover:text-gray-400 text-lg transition">
                            ×
                        </button>
                    )}
                </div>

                {/* Error hints */}
                <AnimatePresence>
                    {inputError && (
                        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-red-400 text-[11px] font-mono -mt-1 ml-1">
                            ⚠ Enter a valid amount (max ${balance.toFixed(2)})
                        </motion.p>
                    )}
                    {parsedBet > balance && !inputError && betInput !== "" && (
                        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-red-400 text-[11px] font-mono -mt-1 ml-1">
                            ⚠ Exceeds balance (${balance.toFixed(2)})
                        </motion.p>
                    )}
                </AnimatePresence>

                {/* ── Preset chips ──────────────────────────────────────── */}
                <div className="grid grid-cols-6 gap-1">
                    {PRESETS.map((n) => (
                        <button key={n} onClick={() => setPreset(n)}
                            disabled={hasBet || queuedBet || n > balance}
                            className={`text-xs font-mono py-1.5 rounded-lg border transition-all
                          ${betInput === n.toFixed(2)
                                    ? "border-green-500 text-green-300 bg-green-500/10 font-bold"
                                    : "border-surface-border text-gray-500 bg-surface-DEFAULT hover:border-green-500/50 hover:text-green-400"}
                          disabled:opacity-25 disabled:cursor-not-allowed`}>
                            ${n}
                        </button>
                    ))}
                </div>

                {/* ── Auto Cash-Out ──────────────────────────────────────── */}
                <div className="flex items-center gap-2">
                    <button onClick={() => setAutoCashoutEnabled(!autoCashoutEnabled)}
                        disabled={hasBet || queuedBet}
                        className={`text-xs font-bold uppercase px-3 py-2 rounded-lg border transition whitespace-nowrap
                        ${autoCashoutEnabled
                                ? "bg-green-500/20 text-green-400 border-green-500/50"
                                : "bg-surface-DEFAULT text-gray-500 border-surface-border"}
                        disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                        Auto
                    </button>
                    <input
                        type="text"
                        inputMode="decimal"
                        placeholder="2.00"
                        value={autoCashoutMultiplier || ""}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
                                setAutoCashoutMultiplier(val ? parseFloat(val) : 0);
                            }
                        }}
                        disabled={hasBet || queuedBet || !autoCashoutEnabled}
                        autoComplete="off"
                        className="flex-[0.8] bg-surface-DEFAULT border border-surface-border rounded-xl
                       px-3 py-1.5 font-mono text-sm min-w-0
                       focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500/20
                       disabled:opacity-40 disabled:cursor-not-allowed transition
                       placeholder:text-gray-700"
                        style={{
                            color: "#e2e8f0",
                            WebkitTextFillColor: "#e2e8f0",
                            caretColor: "#eab308",
                            backgroundColor: "#0f1117",
                        }}
                    />
                    <div className="flex-1 flex gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar pb-1 -mb-1">
                        {[1.5, 2, 3, 5].map((v) => (
                            <button key={v} onClick={() => setAutoCashoutMultiplier(v)}
                                disabled={hasBet || queuedBet || !autoCashoutEnabled}
                                className={`text-xs font-mono px-2 py-1.5 rounded-lg border transition flex-shrink-0
                              ${autoCashoutMultiplier === v && autoCashoutEnabled
                                        ? "border-yellow-500 text-yellow-300 bg-yellow-500/10"
                                        : "border-surface-border text-gray-600 hover:text-yellow-400 hover:border-yellow-500/40"}
                              disabled:opacity-25`}>
                                {v}×
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── CTA Button ─────────────────────────────────────────── */}
                <AnimatePresence mode="wait">
                    {isRunning && hasBet ? (
                        /* CASH OUT */
                        <motion.button key="cashout"
                            initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.92, opacity: 0 }}
                            onClick={handleCashOut}
                            className={`relative w-full py-3.5 rounded-xl font-black text-base uppercase tracking-wider
                         bg-gradient-to-r from-green-400 to-emerald-500 text-black
                         hover:from-green-300 hover:to-emerald-400 transition-all
                         shadow-[0_0_35px_rgba(34,197,94,0.5)] overflow-hidden touch-manipulation
                         ${animationsEnabled ? "animate-pulse-glow" : ""}`}
                        >
                            {animationsEnabled && (
                                <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                                    animate={{ x: ["-100%", "200%"] }}
                                    transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }} />
                            )}
                            <span className="relative">
                                {potentialPay ? `💰 Cash Out  $${potentialPay.toFixed(2)}` : "Cash Out"}
                            </span>
                        </motion.button>
                    ) : (
                        /* PLACE BET */
                        <motion.button key="bet"
                            initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.92, opacity: 0 }}
                            onClick={() => {
                                if (queuedBet) setQueuedBet(false);
                                else handlePlaceBet();
                            }}
                            disabled={hasBet || isLoading || !isValid}
                            className="w-full py-3.5 rounded-xl font-black text-base uppercase tracking-wider
                         transition-all touch-manipulation
                         bg-gradient-to-r from-green-600 to-emerald-700 text-white
                         hover:from-green-500 hover:to-emerald-600
                         hover:shadow-[0_0_30px_rgba(34,197,94,0.4)]
                         active:scale-[0.98]
                         disabled:opacity-40 disabled:cursor-not-allowed
                         disabled:hover:shadow-none"
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <motion.span animate={animationsEnabled ? { rotate: 360 } : {}}
                                        transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                                        className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                                    Placing…
                                </span>
                            ) : hasBet ? "✅ Bet Placed" : queuedBet ? "❌ Cancel Next Bet" : !isWaiting ? "Bet Next Round" : "🚀 Place Bet"}
                        </motion.button>
                    )}
                </AnimatePresence>

                {/* Keyboard hint — hidden on mobile */}
                <div className="hidden sm:flex justify-center gap-4 text-[10px] text-gray-700 font-mono">
                    <span>↵ Enter = Bet</span>
                    <span>Space = Cash Out</span>
                </div>

                {/* ── Live Bet Stats ─────────────────────────────────────── */}
                <AnimatePresence>
                    {hasBet && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="grid grid-cols-4 gap-1">
                                <StatBox label="Bet" value={`$${activeBet!.amount.toFixed(2)}`} />
                                <StatBox label="Mult" value={`${multiplier.toFixed(2)}×`} accent />
                                <StatBox label="Payout" value={potentialPay ? `$${potentialPay.toFixed(2)}` : "—"} big />
                                <StatBox label="Profit"
                                    value={profit !== null && profit > 0 ? `+$${profit.toFixed(2)}` : "—"}
                                    accent={!!profit && profit > 0} big />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Settings Row ─────────────────────────────────────────────── */}
            <div className="flex justify-between items-center px-1">
                <div className="flex gap-3">
                    <button
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        className={`text-xs flex items-center gap-1.5 transition ${soundEnabled ? "text-blue-400" : "text-gray-600 line-through"}`}
                    >
                        🔊 Sound
                    </button>
                    <button
                        onClick={() => setAnimationsEnabled(!animationsEnabled)}
                        className={`text-xs flex items-center gap-1.5 transition ${animationsEnabled ? "text-purple-400" : "text-gray-600 line-through"}`}
                    >
                        ✨ Animasi
                    </button>
                </div>
            </div>

            {/* ── Round Phase Indicator ──────────────────────────────────────── */}
            <div className="rounded-2xl border border-surface-border bg-surface-card px-3 py-2.5
                      flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 shadow-[0_0_8px] ${isRunning ? (animationsEnabled ? "bg-green-400 shadow-green-400/70 animate-ping" : "bg-green-400 shadow-green-400/0") :
                    isWaiting ? (animationsEnabled ? "bg-yellow-400 shadow-yellow-400/50 animate-pulse" : "bg-yellow-400 shadow-yellow-400/0") :
                        "bg-red-500 shadow-red-500/0"
                    }`} />
                <div className="flex-1 min-w-0">
                    <div className="text-white text-xs font-bold truncate">
                        {isRunning ? "🟢 Round Live" : isWaiting ? "🟡 Accepting Bets" : "🔴 Round Over"}
                    </div>
                    <div className="text-gray-600 text-[10px] font-mono truncate">
                        {isRunning ? `${multiplier.toFixed(2)}× — cash out before crash!` :
                            isWaiting ? "Place bet · Press ↵ to confirm" :
                                "Preparing next round…"}
                    </div>
                </div>
            </div>
        </div>
    );
}
