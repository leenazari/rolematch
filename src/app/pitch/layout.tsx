import "./results/report-motion.css";
import type { Metadata } from "next";

const title = "Pitch Perfect | Talk to an AI investor";
const description = "Practise your seed-stage pitch with an AI investor and download feedback on what to improve.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    url: "https://voicereach.io/pitch",
    siteName: "Voice Reach",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function PitchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
