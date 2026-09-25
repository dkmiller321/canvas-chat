import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import Script from "next/script";
import { AppStateProvider } from "@/components/app-state";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Canvas Chat",
  description: "Chat with an LLM that drafts documents and diagrams beside the conversation.",
};

// Self-hosted by next/font at build time; no request to Google at runtime.
const sans = Inter({ subsets: ["latin"], variable: "--font-inter" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", style: ["normal", "italic"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

// Applies the saved or system theme before first paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <Script id="theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <AppStateProvider>
          <AppShell>{children}</AppShell>
        </AppStateProvider>
      </body>
    </html>
  );
}
