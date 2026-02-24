/**
 * ConnectionStatus.tsx
 * Shows a small pill in the top-right indicating WebSocket connection health.
 */
"use client";

import { motion } from "framer-motion";
import { useGameStore } from "@/store/useGameStore";

export default function ConnectionStatus() {
    const connected = useGameStore((s) => s.connected);

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-full border ${connected
                    ? "border-green-500/30 bg-green-500/10 text-green-400"
                    : "border-red-500/30 bg-red-500/10 text-red-400"
                }`}
        >
            <span
                className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-red-400"
                    }`}
            />
            {connected ? "Live" : "Reconnecting…"}
        </motion.div>
    );
}
