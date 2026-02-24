"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "@/store/useGameStore";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function Auth() {
    // false = showing Login | true = showing Register
    const [isRegister, setIsRegister] = useState(false);

    // Form states
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [showInfo, setShowInfo] = useState(false);

    const { setUserId } = useGameStore();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMsg("");

        // Basic validation
        if (!email || !password || (isRegister && !username)) {
            setErrorMsg("Please fill all required fields.");
            setIsLoading(false);
            return;
        }

        const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
        const body = isRegister
            ? { username, email, password }
            : { email, password };

        try {
            const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (!res.ok) {
                setErrorMsg(data.message || (isRegister ? "Registration failed. Try a different alias or email." : "Invalid email or password."));
                return;
            }

            // Success! Save userId, username, email to store
            setUserId(data.userId, data.username, data.email);

        } catch (err) {
            console.error(err);
            setErrorMsg("Connection to server failed.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <div className="relative w-full max-w-4xl h-[600px] bg-surface-card rounded-2xl border border-surface-border overflow-hidden flex shadow-[0_0_50px_rgba(34,197,94,0.1)]">

                {/* ── Background Scanlines ────────────────────────────────────────────── */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
                    style={{ backgroundImage: "repeating-linear-gradient(0deg, #000, #000 2px, transparent 2px, transparent 4px)" }} />

                {/* ══════════════════════════════════════════════════════════════════════
          LEFT SIDE: SIGN IN FORM
          ══════════════════════════════════════════════════════════════════════ */}
                <div className="w-1/2 h-full flex flex-col justify-center items-center px-10 relative z-10">
                    <h2 className="text-3xl font-black mb-6 crt-text text-white">SYSTEM_LOGIN</h2>

                    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-mono text-gray-400 uppercase tracking-widest">Email Vector</label>
                            <input
                                type="email" required
                                value={email} onChange={(e) => setEmail(e.target.value)}
                                className="crt-input w-full p-3 rounded-lg bg-surface border border-surface-border
                         focus:border-green-500 focus:ring-1 focus:ring-green-500/20 text-white transition-all
                         placeholder:text-gray-600 outline-none font-mono"
                                placeholder="operator@glitchrun.io"
                            />
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-mono text-gray-400 uppercase tracking-widest">Passcode</label>
                            <input
                                type="password" required
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                className="crt-input w-full p-3 rounded-lg bg-surface border border-surface-border
                         focus:border-green-500 focus:ring-1 focus:ring-green-500/20 text-white transition-all
                         placeholder:text-gray-600 outline-none font-mono tracking-widest"
                                placeholder="••••••••"
                            />
                        </div>

                        {errorMsg && !isRegister && (
                            <span className="text-red-400 text-xs font-mono mt-1 glitch-active" data-text={errorMsg}>⚠ {errorMsg}</span>
                        )}

                        <button
                            type="submit" disabled={isLoading}
                            className="crt-btn w-full py-4 mt-2 rounded-lg font-black uppercase text-lg tracking-widest
                       disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? "AUTHENTICATING..." : "INITIATE_LOGIN"}
                        </button>
                    </form>
                </div>

                {/* ══════════════════════════════════════════════════════════════════════
          RIGHT SIDE: REGISTER FORM
          ══════════════════════════════════════════════════════════════════════ */}
                <div className="w-1/2 h-full flex flex-col justify-center items-center px-10 relative z-10">
                    <h2 className="text-3xl font-black mb-6 crt-text text-white">NEW_OPERATOR</h2>

                    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-mono text-gray-400 uppercase tracking-widest">Alias</label>
                            <input
                                type="text" required
                                value={username} onChange={(e) => setUsername(e.target.value)}
                                className="crt-input w-full p-3 rounded-lg bg-surface border border-surface-border
                         focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 text-white transition-all
                         placeholder:text-gray-600 outline-none font-mono"
                                placeholder="CyberPunk2077"
                            />
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-mono text-gray-400 uppercase tracking-widest">Email Vector</label>
                            <input
                                type="email" required
                                value={email} onChange={(e) => setEmail(e.target.value)}
                                className="crt-input w-full p-3 rounded-lg bg-surface border border-surface-border
                         focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 text-white transition-all
                         placeholder:text-gray-600 outline-none font-mono"
                                placeholder="new@glitchrun.io"
                            />
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-mono text-gray-400 uppercase tracking-widest">Passcode</label>
                            <input
                                type="password" required
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                className="crt-input w-full p-3 rounded-lg bg-surface border border-surface-border
                         focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 text-white transition-all
                         placeholder:text-gray-600 outline-none font-mono tracking-widest"
                                placeholder="••••••••"
                            />
                        </div>

                        {errorMsg && isRegister && (
                            <span className="text-red-400 text-xs font-mono mt-1 glitch-active" data-text={errorMsg}>⚠ {errorMsg}</span>
                        )}

                        <button
                            type="submit" disabled={isLoading}
                            className="relative w-full py-4 mt-2 rounded-lg font-black uppercase text-lg tracking-widest
                       border border-cyan-500/50 bg-cyan-500/10 text-cyan-400 transition-all
                       hover:border-cyan-400 hover:bg-cyan-500/20 hover:shadow-[0_0_15px_rgba(0,255,238,0.4)]
                       disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                        >
                            {isLoading ? "UPLOADING..." : "CREATE_IDENTITY"}
                        </button>
                    </form>
                </div>

                {/* ══════════════════════════════════════════════════════════════════════
          THE SLIDING GLASS OVERLAY PANEL
          ══════════════════════════════════════════════════════════════════════ */}
                <motion.div
                    className="absolute top-0 bottom-0 w-1/2 z-20 flex flex-col justify-center items-center px-12 text-center
                   backdrop-blur-xl border-x border-surface-border overflow-hidden"
                    style={{
                        background: "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(15,20,32,0.95))"
                    }}
                    initial={false}
                    animate={{
                        x: isRegister ? "0%" : "100%",
                        borderColor: isRegister ? "rgba(0,255,238,0.3)" : "rgba(34,197,94,0.3)"
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                    {/* Animated background noise inside panel */}
                    <div className="absolute inset-0 opacity-10 crt-noise pointer-events-none" />

                    <AnimatePresence mode="wait">
                        {!isRegister ? (
                            <motion.div key="text-login"
                                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                                className="flex flex-col items-center gap-4"
                            >
                                <h3 className="text-3xl font-black text-white crt-text">NO IDENTITY?</h3>
                                <p className="text-gray-400 font-mono text-sm leading-relaxed mb-2">
                                    Enter the grid. Create your alias today and the system will instantly fund your wallet with <strong className="text-cyan-400">$1000 in Demo Credits</strong>. run the multipliers before the system crashes.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setShowInfo(true)}
                                    className="text-xs font-mono text-gray-500 hover:text-green-400 transition-colors underline underline-offset-4 mb-4"
                                >
                                    How do I know this game is Provably Fair?
                                </button>
                                <button
                                    onClick={() => { setIsRegister(true); setErrorMsg(""); }}
                                    className="mt-6 px-8 py-3 rounded-full border border-white/20 text-white font-bold
                           hover:bg-white/10 transition-colors uppercase tracking-widest text-sm"
                                >
                                    Sign Up
                                </button>
                            </motion.div>
                        ) : (
                            <motion.div key="text-register"
                                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                className="flex flex-col items-center gap-4"
                            >
                                <h3 className="text-3xl font-black text-white crt-text">ALREADY CONNECTED?</h3>
                                <p className="text-gray-400 font-mono text-sm leading-relaxed">
                                    Return to your console. Your session is waiting in the mainframe.
                                </p>
                                <button
                                    onClick={() => { setIsRegister(false); setErrorMsg(""); }}
                                    className="mt-6 px-8 py-3 rounded-full border border-white/20 text-white font-bold
                           hover:bg-white/10 transition-colors uppercase tracking-widest text-sm"
                                >
                                    Sign In
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

            </div>

            {/* ══════════════════════════════════════════════════════════════════════
                PROVABLY FAIR MODAL
                ══════════════════════════════════════════════════════════════════════ */}
            <AnimatePresence>
                {showInfo && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                        onClick={() => setShowInfo(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-2xl bg-surface-card border border-surface-border rounded-2xl p-6 sm:p-8 shadow-2xl relative crt-panel"
                        >
                            <button
                                onClick={() => setShowInfo(false)}
                                className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                            >
                                ✕
                            </button>

                            <h2 className="text-2xl font-black text-white mb-4 crt-text text-green-400">PROVABLY FAIR ALGORITHM</h2>

                            <div className="space-y-4 text-gray-300 font-mono text-sm">
                                <p>
                                    GlitchRun operates on a strict <strong className="text-white">Provably Fair</strong> system. This means the outcome of every round is mathematically predetermined and entirely transparent. We cannot manipulate the crash point after the bets are placed.
                                </p>

                                <div className="bg-surface p-4 rounded-lg border border-surface-border space-y-3">
                                    <div>
                                        <h4 className="text-cyan-400 font-bold mb-1">1. The Server Seed</h4>
                                        <p className="text-xs text-gray-400">Before the round begins, our server generates a random secret (Server Seed) and determines the exact crash point. We immediately broadcast the <strong className="text-white">SHA-256 Hash</strong> of this seed to all players in the Lobby. Because hashes are one-way, no one can guess the crash point, but it proves the server cannot change it later.</p>
                                    </div>
                                    <div>
                                        <h4 className="text-cyan-400 font-bold mb-1">2. The Resolution</h4>
                                        <p className="text-xs text-gray-400">Once the round ends (crashes), the server reveals the original unhashed Server Seed.</p>
                                    </div>
                                    <div>
                                        <h4 className="text-cyan-400 font-bold mb-1">3. The Verification</h4>
                                        <p className="text-xs text-gray-400">You can take the revealed Server Seed, run it through any independent SHA-256 generator online, and verify that it matches the Hash we broadcasted *before* the round started. Next, apply our open-source HMAC-SHA256 formula to calculate the exact multiplier. It will match exactly.</p>
                                    </div>
                                </div>

                                <p className="text-xs text-gray-500 italic mt-4">
                                    Trust through cryptography. Your $1000 starter demo credits are safe from manipulation. Enjoy the grid.
                                </p>
                            </div>

                            <button
                                onClick={() => setShowInfo(false)}
                                className="mt-8 w-full py-3 rounded-lg border border-green-500/50 text-green-400 font-bold hover:bg-green-500/10 transition-colors"
                            >
                                ACKNOWLEDGE
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
