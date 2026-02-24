"use client";

import Image from "next/image";
import GameBoard from "@/components/GameBoard";
import Controls from "@/components/Controls";
import ConnectionStatus from "@/components/ConnectionStatus";
import Auth from "@/components/Auth";
import ProvablyFairInfo from "@/components/ProvablyFairInfo";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useGameStore } from "@/store/useGameStore";

// WebSocketProvider starts WS only if userId exists
function WebSocketProvider() {
    useWebSocket();
    return null;
}

export default function HomePage() {
    const { userId, alias, email, balance } = useGameStore();

    return (
        <main className="min-h-screen bg-surface flex flex-col">
            {userId && <WebSocketProvider />}

            {/* Error banner */}
            <div
                id="ws-error-banner"
                style={{ display: "none" }}
                className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500/95 text-white
                   text-sm font-mono px-5 py-2.5 rounded-xl shadow-xl border border-red-400/60
                   backdrop-blur-sm whitespace-nowrap"
            />

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <header className="flex-shrink-0 border-b border-surface-border px-3 sm:px-6 py-2 sm:py-3
                         flex items-center justify-between sticky top-0 z-30
                         bg-surface/90 backdrop-blur-md relative">

                {/* LEFT: User Profile (logged in) OR Logo (logged out) */}
                <div className="flex items-center gap-3 z-10 min-w-0 flex-1 lg:flex-none lg:w-[280px]">
                    {!userId ? (
                        /* Show logo on left when logged out */
                        <Image
                            src="/GlitchRun-Logo.png"
                            alt="GlitchRun"
                            width={110}
                            height={30}
                            className="object-contain h-7"
                            priority
                        />
                    ) : (
                        /* User profile avatar + name */
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-surface-card border border-cyan-500/30
                                          overflow-hidden flex items-center justify-center flex-shrink-0 relative group">
                                <span className="text-cyan-400 font-black text-lg sm:text-xl uppercase transition-all">
                                    {alias ? alias.charAt(0) : "U"}
                                </span>
                                <div className="absolute inset-0 bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <div className="flex flex-col justify-center min-w-0">
                                <h2 className="font-black text-white text-sm sm:text-base leading-none capitalize tracking-wide truncate">
                                    {alias || "Operator"}
                                </h2>
                                <p className="text-gray-500 text-[9px] sm:text-[10px] font-mono leading-tight truncate max-w-[110px] sm:max-w-[180px]">
                                    {email || "connected@glitchrun.io"}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* CENTER: GlitchRun Logo — visible on all sizes when logged in */}
                <div className="flex absolute left-1/2 -translate-x-1/2 items-center z-10">
                    <Image
                        src="/GlitchRun-Logo.png"
                        alt="GlitchRun"
                        width={120}
                        height={34}
                        className="object-contain h-6 sm:h-8 w-auto"
                        priority
                    />
                </div>

                {/* RIGHT: Balance + Connection */}
                <div className="flex items-center justify-end gap-2 sm:gap-3 z-10 flex-shrink-0 lg:w-[280px]">
                    {userId && (
                        <div className="flex items-center gap-1.5 sm:gap-2.5 bg-surface-card border border-surface-border
                                        px-3 py-1.5 rounded-full cursor-default hover:border-green-500/50 transition-colors">
                            <span className="text-gray-500 text-[10px] sm:text-xs font-mono font-bold uppercase hidden sm:inline">
                                Balance
                            </span>
                            <span className="text-green-400 text-sm sm:text-base font-black font-mono tracking-tight">
                                ${balance.toFixed(2)}
                            </span>
                        </div>
                    )}
                    {userId && <ConnectionStatus />}
                </div>
            </header>

            {/* ── Main Content ────────────────────────────────────────────────── */}
            <div className="flex-1 w-full flex flex-col items-center p-1.5 sm:p-4">
                {!userId ? (
                    <div className="flex flex-col items-center w-full mt-8 md:mt-16 mb-20 gap-8">
                        <Auth />
                        <ProvablyFairInfo />
                    </div>
                ) : (
                    <div className="w-full max-w-screen-xl mx-auto">
                        {/* ── Game Layout: stacked on mobile, side-by-side on lg ── */}
                        <div className="flex flex-col lg:flex-row gap-2 sm:gap-4 lg:items-stretch">

                            {/* GameBoard — 60% on desktop */}
                            <div className="w-full lg:w-[60%] min-w-0">
                                <GameBoard />
                            </div>

                            {/* Controls — 40% on desktop, full-height stretch */}
                            <div className="w-full lg:w-[40%] min-w-0 lg:sticky lg:top-[64px] lg:self-start">
                                <Controls />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Footer ──────────────────────────────────────────────────────── */}
            <footer className="hidden sm:block text-center text-gray-800 text-xs font-mono py-3 mt-auto">
                GlitchRun © {new Date().getFullYear()} — Portfolio Demo · Not a real gambling site
            </footer>
        </main>
    );
}
