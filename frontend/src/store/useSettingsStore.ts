import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SettingsState {
    // Auto cashout
    autoCashoutEnabled: boolean;
    autoCashoutMultiplier: number; // e.g. 2.0

    // Sound
    soundEnabled: boolean;

    // Animations (disable for low-spec devices)
    animationsEnabled: boolean;

    // Setters
    setAutoCashoutEnabled: (v: boolean) => void;
    setAutoCashoutMultiplier: (v: number) => void;
    setSoundEnabled: (v: boolean) => void;
    setAnimationsEnabled: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            autoCashoutEnabled: false,
            autoCashoutMultiplier: 2.0,
            soundEnabled: true,
            animationsEnabled: true,

            setAutoCashoutEnabled: (v) => set({ autoCashoutEnabled: v }),
            setAutoCashoutMultiplier: (v) => set({ autoCashoutMultiplier: v }),
            setSoundEnabled: (v) => set({ soundEnabled: v }),
            setAnimationsEnabled: (v) => set({ animationsEnabled: v }),
        }),
        {
            name: "glitchrun-settings", // localStorage key
        }
    )
);
