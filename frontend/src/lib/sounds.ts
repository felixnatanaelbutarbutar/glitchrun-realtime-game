// Sound manager — safe for SSR (Next.js)
// Sounds are loaded lazily when first played.

const sounds: Record<string, HTMLAudioElement | null> = {};

function getAudio(path: string): HTMLAudioElement | null {
    if (typeof window === "undefined") return null;
    if (!sounds[path]) {
        sounds[path] = new Audio(path);
        sounds[path]!.preload = "auto";
    }
    return sounds[path];
}

export function playSound(path: string, volume = 0.7) {
    const audio = getAudio(path);
    if (!audio) return;
    audio.volume = volume;
    audio.currentTime = 0;
    audio.play().catch(() => {
        // Autoplay blocked — ignore silently
    });
}

// Convenience exports for each sound
export const SOUNDS = {
    /** Place when you drop the file into /public/sounds/ */
    crash: "/sounds/crash.mp3",
    cashout: "/sounds/cashout.mp3",
    bet: "/sounds/bet.mp3",
} as const;
