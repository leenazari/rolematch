"use client";

type OrbState = "idle" | "speaking" | "listening" | "thinking";

type Props = {
  state: OrbState;
};

export default function VoiceOrb(props: Props) {
  const { state } = props;

  const stateClasses = {
    idle: "scale-100 opacity-90",
    speaking: "scale-110 opacity-100",
    listening: "scale-105 opacity-100",
    thinking: "scale-95 opacity-80",
  };

  const ringPulse = state === "listening" || state === "speaking";
  const slowPulse = state === "thinking" || state === "idle";

  return (
    <div className="relative flex items-center justify-center w-48 h-48 mx-auto">
      {/* Outer ring 1 */}
      <div
        className={`absolute inset-0 rounded-full ${
          ringPulse ? "animate-ping" : ""
        }`}
        style={{
          background: state === "listening"
            ? "radial-gradient(circle, rgba(99, 102, 241, 0.25), transparent 70%)"
            : state === "speaking"
            ? "radial-gradient(circle, rgba(168, 85, 247, 0.25), transparent 70%)"
            : "radial-gradient(circle, rgba(99, 102, 241, 0.1), transparent 70%)",
          animationDuration: state === "listening" ? "1.6s" : "2.4s",
        }}
      />

      {/* Outer ring 2 (offset for richer pulse) */}
      <div
        className={`absolute inset-4 rounded-full ${
          ringPulse ? "animate-ping" : ""
        }`}
        style={{
          background: state === "listening"
            ? "radial-gradient(circle, rgba(99, 102, 241, 0.35), transparent 70%)"
            : state === "speaking"
            ? "radial-gradient(circle, rgba(168, 85, 247, 0.35), transparent 70%)"
            : "radial-gradient(circle, rgba(99, 102, 241, 0.15), transparent 70%)",
          animationDuration: state === "listening" ? "2.0s" : "3.0s",
          animationDelay: "0.4s",
        }}
      />

      {/* Main orb */}
      <div
        className={`relative w-36 h-36 rounded-full transition-all duration-700 ease-in-out ${stateClasses[state]} ${
          slowPulse ? "animate-pulse" : ""
        }`}
        style={{
          background: state === "speaking"
            ? "radial-gradient(circle at 30% 30%, #c4b5fd, #8b5cf6 40%, #6366f1 80%)"
            : state === "listening"
            ? "radial-gradient(circle at 30% 30%, #a5b4fc, #6366f1 40%, #4338ca 80%)"
            : state === "thinking"
            ? "radial-gradient(circle at 30% 30%, #d1d5db, #6b7280 40%, #374151 80%)"
            : "radial-gradient(circle at 30% 30%, #c7d2fe, #818cf8 40%, #4f46e5 80%)",
          boxShadow: state === "speaking"
            ? "0 0 60px rgba(168, 85, 247, 0.6), inset 0 -10px 30px rgba(0, 0, 0, 0.2), inset 0 10px 30px rgba(255, 255, 255, 0.3)"
            : state === "listening"
            ? "0 0 60px rgba(99, 102, 241, 0.6), inset 0 -10px 30px rgba(0, 0, 0, 0.2), inset 0 10px 30px rgba(255, 255, 255, 0.3)"
            : "0 0 40px rgba(99, 102, 241, 0.3), inset 0 -10px 30px rgba(0, 0, 0, 0.2), inset 0 10px 30px rgba(255, 255, 255, 0.2)",
        }}
      >
        {/* Inner highlight for depth */}
        <div
          className="absolute top-6 left-8 w-12 h-12 rounded-full opacity-40 blur-lg"
          style={{ background: "rgba(255, 255, 255, 0.6)" }}
        />

        {/* Inner core that responds to state */}
        <div
          className={`absolute inset-8 rounded-full transition-opacity duration-500 ${
            state === "speaking" ? "opacity-100" : "opacity-0"
          }`}
          style={{
            background: "radial-gradient(circle, rgba(255, 255, 255, 0.4), transparent 70%)",
            animation: state === "speaking" ? "pulse 0.8s ease-in-out infinite" : "none",
          }}
        />
      </div>

      {/* State label below the orb */}
      <div className="absolute -bottom-8 left-0 right-0 text-center">
        <div
          className={`inline-block text-xs uppercase tracking-widest font-semibold transition-opacity duration-300 ${
            state === "idle" ? "opacity-0" : "opacity-100"
          } ${
            state === "speaking"
              ? "text-purple-600"
              : state === "listening"
              ? "text-indigo-600"
              : "text-slate-500"
          }`}
        >
          {state === "speaking"
            ? "Speaking"
            : state === "listening"
            ? "Listening"
            : state === "thinking"
            ? "Thinking"
            : ""}
        </div>
      </div>
    </div>
  );
}
