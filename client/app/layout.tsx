import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";
import { Toaster } from "@/components/ui/toast";

const bodyFont = localFont({
  src: [
    {
      path: "./fonts/outfit-latin.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "./fonts/outfit-latin-ext.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-sans",
  display: "swap",
});

const headingFont = localFont({
  src: [
    {
      path: "./fonts/spacegrotesk-latin.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "./fonts/spacegrotesk-latin-ext.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "./fonts/spacegrotesk-cyrillic.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Smart Academy Portal",
  description:
    "A modern learning portal focused on clear progress, human-centered teaching, and smooth role-based experiences.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${headingFont.variable}`}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}