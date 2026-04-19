import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoleMatch",
  description: "Your AI career coach. Find roles that fit, not just roles that exist.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
