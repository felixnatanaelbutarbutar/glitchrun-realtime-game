import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
    subsets: ["latin"],
    variable: "--font-outfit",
    display: "swap",
});

const jetbrains = JetBrains_Mono({
    subsets: ["latin"],
    variable: "--font-jetbrains",
    display: "swap",
});

export const metadata: Metadata = {
    title: "GlitchRun — Provably Fair Crash Game",
    description:
        "A real-time crash game powered by Go WebSockets, Redis, and Next.js. " +
        "Place your bet, watch the multiplier climb, and cash out before the rocket crashes.",
    keywords: ["crash game", "provably fair", "websocket", "golang", "react"],
    openGraph: {
        title: "GlitchRun",
        description: "Provably Fair Crash Game",
        type: "website",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={`${outfit.variable} ${jetbrains.variable}`}>
            <body className="bg-surface text-white antialiased min-h-screen">
                {children}
            </body>
        </html>
    );
}
