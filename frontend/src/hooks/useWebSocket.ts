/**
 * useWebSocket — custom hook yang me-manage satu WebSocket connection per page.
 *
 * Fix v2:
 *  - userId TIDAK lagi masuk dependency connect() → stop reconnect loop
 *  - Pakai useRef untuk userId agar tetap ter-update tanpa recreate connect
 *  - Tambah effect terpisah untuk kirim "auth" ketika userId berubah
 *  - Handle "balance_update" dari server agar saldo real-time sync
 */
"use client";

import { useEffect, useRef, useCallback } from "react";
import { useGameStore } from "@/store/useGameStore";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080/ws";
const RECONNECT_DELAY_MS = 3000;

// ── Tipe pesan dari server ────────────────────────────────────────────────────

interface TickMsg { type: "tick"; multiplier: number; roundId: string }
interface CrashMsg { type: "crash"; crashPoint: number; roundId: string; serverSeed: string }
interface ResetMsg { type: "reset"; nextRoundIn: number; serverSeedHash: string; roundId?: string }
interface AuthOkMsg { type: "auth_ok"; userId: string; balance?: number }
interface BetPlacedMsg { type: "bet_placed"; amount: number }
interface CashoutOkMsg { type: "cashout_ok"; multiplier: number }
interface ErrorMsg { type: "error"; message: string }
interface InitMsg { type: "init"; state: { phase: "waiting" | "running" | "crashed"; multiplier: number; roundId: string; seedHash: string; recentHistory?: number[] } }

type ServerMessage =
    | TickMsg | CrashMsg | ResetMsg
    | AuthOkMsg | BetPlacedMsg | CashoutOkMsg
    | ErrorMsg | InitMsg;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWebSocket() {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ✅ Gunakan REF untuk userId, bukan state langsung di dependency
    // Ini mencegah connect() di-recreate setiap kali userId berubah
    const userIdRef = useRef<string>("");

    const {
        handleInit,
        handleTick,
        handleCrash,
        handleReset,
        setConnected,
        handleBetPlaced,   // ✅ kurangi balance + set activeBet
        handleCashoutOk,   // ✅ tambah payout + clear activeBet
        clearActiveBet,
        setBalance,
        userId,
    } = useGameStore();

    // Sync ref setiap kali userId dari store berubah
    useEffect(() => {
        userIdRef.current = userId;
    }, [userId]);

    // ── Message handler ─────────────────────────────────────────────────────────
    const onMessage = useCallback(
        (event: MessageEvent) => {
            let msg: ServerMessage;
            try {
                msg = JSON.parse(event.data as string) as ServerMessage;
            } catch {
                console.warn("[WS] Non-JSON message:", event.data);
                return;
            }

            switch (msg.type) {
                case "init":
                    handleInit(msg.state);
                    break;

                case "tick":
                    handleTick(msg.multiplier, msg.roundId);
                    break;

                case "crash":
                    clearActiveBet();
                    handleCrash(msg.crashPoint, msg.roundId);
                    console.log(`[GlitchRun] Crashed at ${msg.crashPoint}x | seed: ${msg.serverSeed}`);
                    break;

                case "reset":
                    handleReset(msg.nextRoundIn, msg.serverSeedHash, msg.roundId ?? "");
                    break;

                case "auth_ok":
                    // Jika server kirim balance real (setelah fetch dari DB), update store
                    if (msg.balance !== undefined) {
                        setBalance(msg.balance / 100); // cents → dollars
                    }
                    console.log(`[WS] Auth OK userId=${msg.userId}`);
                    break;

                case "bet_placed":
                    // ✅ Kurangi balance DAN set activeBet sekaligus
                    handleBetPlaced(msg.amount);
                    break;

                case "cashout_ok":
                    // ✅ Hitung payout dari activeBet.amount × multiplier, tambah ke balance
                    handleCashoutOk(msg.multiplier);
                    console.log(`[GlitchRun] Cashed out at ${msg.multiplier}x`);
                    break;

                case "error":
                    // Tampilkan error ke user (bisa diganti dengan toast notification)
                    console.error("[WS] Server error:", msg.message);
                    // Show browser alert untuk visibility di MVP
                    if (typeof window !== "undefined") {
                        // Gunakan alert ringan – di production ganti dengan toast
                        const el = document.getElementById("ws-error-banner");
                        if (el) {
                            el.textContent = `❌ ${msg.message}`;
                            el.style.display = "block";
                            setTimeout(() => { el.style.display = "none"; }, 3000);
                        }
                    }
                    break;

                default:
                    break;
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [handleInit, handleTick, handleCrash, handleReset, handleBetPlaced, handleCashoutOk, clearActiveBet, setBalance]
    );

    // ── Connect (TANPA userId di dependencies) ─────────────────────────────────
    const connect = useCallback(() => {
        // Jangan buka koneksi baru kalau sudah OPEN
        if (wsRef.current?.readyState === WebSocket.OPEN) return;
        // Jangan buka kalau sedang CONNECTING
        if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            console.log("[WS] Connected to GlitchRun server");

            // Kirim auth dengan userId dari REF (bukan dari closure yang stale)
            if (userIdRef.current && userIdRef.current !== "") {
                ws.send(JSON.stringify({ type: "auth", userId: userIdRef.current }));
            }
        };

        ws.onmessage = onMessage;

        ws.onerror = (e) => {
            console.error("[WS] Error event:", e);
        };

        ws.onclose = (event) => {
            setConnected(false);
            wsRef.current = null;
            console.warn(`[WS] Disconnected (code=${event.code}). Reconnecting in 3s…`);
            // Reconnect otomatis setelah 3 detik
            reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
        };
    }, [onMessage, setConnected]); // ✅ TIDAK ada userId di sini!

    // Buka koneksi pertama kali halaman dimuat
    useEffect(() => {
        connect();
        return () => {
            // Cleanup saat component unmount
            reconnectTimer.current && clearTimeout(reconnectTimer.current);
            // Tutup dengan kode normal (1000) agar onclose tidak trigger reconnect
            if (wsRef.current) {
                wsRef.current.onclose = null; // Hapus handler dulu
                wsRef.current.close(1000, "component unmount");
            }
        };
    }, [connect]);

    // ✅ Effect terpisah: kirim auth ketika userId BARU tersedia & WS sudah open
    useEffect(() => {
        if (userId && userId !== "" && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "auth", userId }));
        }
    }, [userId]);

    // ── Public API ──────────────────────────────────────────────────────────────
    const sendMessage = useCallback((payload: object) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(payload));
        } else {
            console.warn("[WS] Cannot send — socket not OPEN");
        }
    }, []);

    return { sendMessage };
}
