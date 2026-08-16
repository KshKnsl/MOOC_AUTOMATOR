import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NPTEL Automator & AI Assignment Solver",
  description: "Next.js frontend powered by Astryx design system, REST API automator, and Google Gemini AI solver.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-astryx-theme="neutral" className="dark">
      <body className="min-h-screen bg-[#090d16] text-slate-100 antialiased selection:bg-cyan-500/20 selection:text-cyan-300">
        {children}
      </body>
    </html>
  );
}
