import localFont from "next/font/local";
import type { Metadata } from "next";
import "./globals.css";
const montserrat = localFont({ src: [{ path: "./fonts/montserrat-400.ttf", weight: "400", style: "normal" }, { path: "./fonts/montserrat-600.ttf", weight: "600", style: "normal" }], variable: "--font-montserrat", display: "swap" });
export const metadata: Metadata = {
  title: "Rev3 Studio",
  description:
    "Create your AI receptionist, choose a voice and try a conversation in Rev3 Studio.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB">
      <body className={montserrat.variable}>{children}</body>
    </html>
  );
}
