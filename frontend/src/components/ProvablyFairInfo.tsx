"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Helper: Web Crypto API for HMAC-SHA256
async function generateHMAC(keyStr: string, message: string): Promise<string> {
    const enc = new TextEncoder();
    const keyData = enc.encode(keyStr);

    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign(
        "HMAC",
        cryptoKey,
        enc.encode(message)
    );

    // Convert ArrayBuffer to Hex String
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    return hashHex;
}

// Same logic as backend Crash multiplier
function calculateCrashMultiplier(hex8: string, houseEdge: number = 0.01): number {
    // Parse first 16 hex characters (8 bytes) into a float
    const n = Number(BigInt("0x" + hex8.substring(0, 16)));

    // Max value of uint64 (2^64 - 1)
    const maxUint64 = 18446744073709551615; // Exact BigInt value

    const r = n / maxUint64;

    if (r < houseEdge) return 1.00; // House edge hit

    const rawCrash = 100.0 / (1.0 - r);
    const crash = Math.floor(rawCrash) / 100.0;

    // Hard cap at 1_000_000.00x
    return Math.min(Math.max(1.00, crash), 1000000.00);
}

export default function ProvablyFairInfo() {
    const [isOpen, setIsOpen] = useState(false);

    // Mock verification state
    const [serverSeed, setServerSeed] = useState("a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6");
    const [clientSeed, setClientSeed] = useState("player_random_seed_123");
    const [nonce, setNonce] = useState("1");

    const [outputHash, setOutputHash] = useState("");
    const [crashPoint, setCrashPoint] = useState<number | null>(null);

    // Auto-calculate on input change
    useEffect(() => {
        let isCancelled = false;

        const calculate = async () => {
            if (!serverSeed || !clientSeed || !nonce) {
                setOutputHash("");
                setCrashPoint(null);
                return;
            }

            const message = `${clientSeed}:${nonce}`;
            const hash = await generateHMAC(serverSeed, message);

            if (!isCancelled) {
                setOutputHash(hash);
                // Standard formula takes first 8 bytes of HMAC
                const point = calculateCrashMultiplier(hash, 0.01);
                setCrashPoint(point);
            }
        };

        calculate();

        return () => { isCancelled = true; };
    }, [serverSeed, clientSeed, nonce]);

    return (
        <div className="w-full max-w-4xl mx-auto mt-6">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 bg-surface-card border border-surface-border rounded-xl
                           hover:border-green-500/50 transition-colors shadow-lg group relative overflow-hidden crt-panel"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="flex items-center gap-3 relative z-10">
                    <span className="w-8 h-8 flex items-center justify-center rounded bg-green-500/10 border border-green-500/30 text-green-400 font-black">
                        ?
                    </span>
                    <h3 className="font-black text-white text-lg tracking-widest crt-text text-left">
                        PROVABLY FAIR & TRANSPARENCY
                    </h3>
                </div>

                <span className={`text-green-400 font-mono text-xl transition-transform duration-300 relative z-10 ${isOpen ? "rotate-180" : ""}`}>
                    ▼
                </span>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-2 p-6 bg-surface-card border border-surface-border rounded-xl space-y-6 crt-panel">

                            {/* Explanation Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 bg-surface border border-surface-border rounded-lg shadow-inner">
                                    <h4 className="font-black text-cyan-400 mb-2 font-mono">1. SERVER SEED</h4>
                                    <p className="text-gray-400 text-xs leading-relaxed font-mono">
                                        Generated by the casino before the round starts. We hash it with SHA-256 and show you the hash publicly, meaning we CANNOT change it silently after bets are placed.
                                    </p>
                                </div>
                                <div className="p-4 bg-surface border border-surface-border rounded-lg shadow-inner">
                                    <h4 className="font-black text-cyan-400 mb-2 font-mono">2. CLIENT SEED</h4>
                                    <p className="text-gray-400 text-xs leading-relaxed font-mono">
                                        A string determined by your browser (or manually set by you). It ensures the casino cannot selectively pick a Server Seed that causes you to lose.
                                    </p>
                                </div>
                                <div className="p-4 bg-surface border border-surface-border rounded-lg shadow-inner">
                                    <h4 className="font-black text-cyan-400 mb-2 font-mono">3. THE NONCE</h4>
                                    <p className="text-gray-400 text-xs leading-relaxed font-mono">
                                        A number that acts as a counter for each round. It increases by 1 sequentially.
                                    </p>
                                </div>
                            </div>

                            <div className="text-center font-mono text-sm text-gray-400 my-4">
                                Crash Point = <span className="text-green-400">HMAC_SHA256(ServerSeed, ClientSeed:Nonce)</span>
                            </div>

                            {/* Interactive Verifier */}
                            <div className="border border-green-500/20 rounded-xl overflow-hidden shadow-[0_0_20px_rgba(34,197,94,0.05)] bg-surface">
                                <div className="bg-green-500/10 px-4 py-2 border-b border-green-500/20">
                                    <h4 className="font-black text-green-400 text-sm flex items-center gap-2">
                                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                        LIVE HASH VERIFIER
                                    </h4>
                                </div>
                                <div className="p-4 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-mono text-gray-500 uppercase">Unhashed Server Seed</label>
                                            <input
                                                type="text"
                                                value={serverSeed}
                                                onChange={(e) => setServerSeed(e.target.value)}
                                                className="crt-input w-full p-2.5 text-sm rounded bg-surface-card border border-surface-border text-white outline-none focus:border-green-500"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-mono text-gray-500 uppercase">Client Seed</label>
                                            <input
                                                type="text"
                                                value={clientSeed}
                                                onChange={(e) => setClientSeed(e.target.value)}
                                                className="crt-input w-full p-2.5 text-sm rounded bg-surface-card border border-surface-border text-white outline-none focus:border-green-500"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-mono text-gray-500 uppercase">Nonce</label>
                                        <input
                                            type="number"
                                            value={nonce}
                                            onChange={(e) => setNonce(e.target.value)}
                                            className="crt-input w-24 p-2.5 text-sm rounded bg-surface-card border border-surface-border text-white outline-none focus:border-green-500"
                                        />
                                    </div>

                                    {/* RESULTS */}
                                    <div className="mt-6 p-4 rounded bg-surface-card border border-surface-border flex flex-col items-center justify-center space-y-2">
                                        <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Calculated Hash Result (HMAC-SHA256)</div>
                                        <div className="font-mono text-xs sm:text-sm md:text-base text-gray-300 break-all text-center w-full">
                                            {outputHash || "Waiting for valid inputs..."}
                                        </div>

                                        <div className="mt-4 text-[10px] font-mono text-gray-500 uppercase tracking-widest pt-2">Final Crash Point</div>
                                        <div className="font-black font-mono text-4xl neon-green glitch-active" data-text={crashPoint !== null ? `${crashPoint.toFixed(2)}×` : "---"}>
                                            {crashPoint !== null ? `${crashPoint.toFixed(2)}×` : "---"}
                                        </div>
                                        <p className="text-[10px] text-gray-500 font-mono mt-1">Based on hex logic (Float conversion modulo max Uint64, 1% House Edge)</p>
                                    </div>

                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
