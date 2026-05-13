import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voice Reach — AI conversations for career and company decisions",
  description: "Two AI conversations to help you figure out what's next. RoleMatch for your career, Pitch Perfect for your business.",
  metadataBase: new URL("https://voicereach.io"),
  openGraph: {
    title: "Voice Reach — Career or company. We'll help you figure it out.",
    description: "Two honest AI conversations. Pick the one you need.",
    url: "https://voicereach.io",
    siteName: "Voice Reach",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Voice Reach",
    description: "Two honest AI conversations. Pick the one you need.",
  },
   icons: {
    icon: [
      { url: "/favicon.svg?v=2", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg?v=2",
    apple: "/favicon.svg?v=2",
  },
  robots: {
    index: false,
    follow: false,
  },
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
