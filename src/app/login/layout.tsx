import type { Metadata } from "next";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "OpenSlot";

export const metadata: Metadata = {
  title: `Вход — ${appName}`,
  description: `Вход в панель администратора ${appName}`,
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
