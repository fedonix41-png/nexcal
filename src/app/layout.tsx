import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const appName = process.env.NEXT_PUBLIC_APP_NAME || "OpenSlot";

export const metadata: Metadata = {
  title: {
    default: `${appName} — Система онлайн-бронирования`,
    template: `%s — ${appName}`,
  },
  description:
    "Автономная система бронирования и управления очередью для различных видов бизнеса.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
