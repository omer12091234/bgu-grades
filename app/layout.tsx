import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "התפלגות ציונים – BGU",
  description: "צפייה בהתפלגות ציונים לפי קורס וסמסטר באוניברסיטת בן-גוריון",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
