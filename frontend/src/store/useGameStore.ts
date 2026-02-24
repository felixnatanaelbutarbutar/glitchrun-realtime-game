import { create } from "zustand";

export type GamePhase = "waiting" | "running" | "crashed";

export interface ActiveBetInfo {
    amount: number;
    placedAt: number;
}

export interface GameState {
    phase: GamePhase;
    multiplier: number;
    crashPoint: number | null;
    roundId: string;
    seedHash: string;
    nextRoundIn: number;
    userId: string;
    alias: string;
    email: string;
    balance: number;
    activeBet: ActiveBetInfo | null;
    history: number[];
    lastCrashRoundId: string; // guard duplikat history
    connected: boolean;
    lastCashout: { payout: number; multiplier: number } | null;

    setConnected: (v: boolean) => void;
    setUserId: (id: string, alias?: string, email?: string) => void;
    setBalance: (b: number) => void;
    handleInit: (state: { phase: GamePhase; multiplier: number; roundId: string; seedHash: string; recentHistory?: number[] }) => void;
    handleTick: (multiplier: number, roundId: string) => void;
    handleCrash: (crashPoint: number, roundId: string) => void;
    handleReset: (nextRoundIn: number, seedHash: string, roundId: string) => void;
    handleBetPlaced: (amount: number) => void;
    handleCashoutOk: (multiplier: number) => void;
    clearActiveBet: () => void;
    setActiveBet: (bet: ActiveBetInfo | null) => void;
    clearLastCashout: () => void;
}

export const useGameStore = create<GameState>((set) => ({
    phase: "waiting",
    multiplier: 1.0,
    crashPoint: null,
    roundId: "",
    seedHash: "",
    nextRoundIn: 5,
    userId: "",
    alias: "",
    email: "",
    balance: 0,
    activeBet: null,
    history: [],
    lastCrashRoundId: "",
    connected: false,
    lastCashout: null,

    setConnected: (v) => set({ connected: v }),
    setUserId: (id, alias = "", email = "") => set({ userId: id, alias, email }),
    setBalance: (b) => set({ balance: b }),

    handleInit: (state) => set((existing) => ({
        phase: state.phase,
        multiplier: state.multiplier,
        roundId: state.roundId,
        seedHash: state.seedHash,
        // Only restore history from server if it has items AND we currently have none
        // This prevents overwriting freshly-game-accumulated history on reconnect
        history: (state.recentHistory && state.recentHistory.length > 0)
            ? state.recentHistory
            : existing.history,
    })),

    handleTick: (multiplier, roundId) =>
        set({ phase: "running", multiplier, roundId }),

    handleCrash: (crashPoint, roundId) =>
        set((state) => {
            // ✅ Guard: jangan masukkan history yang sama dua kali
            if (state.lastCrashRoundId === roundId) return {};
            return {
                phase: "crashed",
                crashPoint,
                roundId,
                multiplier: crashPoint,
                activeBet: null,
                lastCrashRoundId: roundId,
                history: [crashPoint, ...state.history].slice(0, 50),
            };
        }),

    handleReset: (nextRoundIn, seedHash, roundId) =>
        set({
            phase: "waiting",
            multiplier: 1.0,
            crashPoint: null,
            roundId,
            seedHash,
            nextRoundIn,
            lastCashout: null,
        }),

    handleBetPlaced: (amount) =>
        set((state) => ({
            balance: parseFloat((state.balance - amount).toFixed(2)),
            activeBet: { amount, placedAt: state.multiplier },
        })),

    handleCashoutOk: (multiplier) =>
        set((state) => {
            if (!state.activeBet) return { activeBet: null };
            const payout = parseFloat((state.activeBet.amount * multiplier).toFixed(2));
            return {
                balance: parseFloat((state.balance + payout).toFixed(2)),
                activeBet: null,
                lastCashout: { payout, multiplier },
            };
        }),

    clearLastCashout: () => set({ lastCashout: null }),
    clearActiveBet: () => set({ activeBet: null }),
    setActiveBet: (bet) => set({ activeBet: bet }),
}));
