import type { Metadata, Viewport } from "next";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/nunito/900.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kỳ họp đặc biệt – Ai sẽ bị bãi nhiệm?",
  description: "Trò chơi biểu quyết ôn tập phần III: Dân chủ XHCN và Nhà nước pháp quyền XHCN ở Việt Nam (MLN131).",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#DA251D" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
