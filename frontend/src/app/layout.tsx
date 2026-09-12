import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NPTEL Automator",
  description: "REST automation and Gemini-powered assignment solver for NPTEL and Swayam courses.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" data-astryx-theme="neutral" className={figtree.className}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
