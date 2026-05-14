import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pitch Perfect — AI investor feedback for seed-stage founders",
  description: "Pitch your business to an AI investor, get an honest written breakdown. Built for seed-stage UK founders who want real feedback before they raise.",
  openGraph: {
    title: "Pitch Perfect — AI investor feedback for seed-stage founders",
    description: "Have a friendly conversation about your business. Get honest written feedback that doesn't pull punches.",
    url: "https://voicereach.io/pitch",
    siteName: "Voice Reach",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pitch Perfect — AI investor feedback for seed-stage founders",
    description: "Have a friendly conversation about your business. Get honest written feedback that doesn't pull punches.",
  },
};

export default function PitchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
