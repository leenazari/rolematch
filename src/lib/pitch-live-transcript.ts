export type LiveTextStatus = "connecting" | "live" | "unavailable";

// Live events are keyed by audio item. A completed transcript replaces its deltas.
export function createLiveTranscript() {
  const items = new Map<string, { text: string; complete: boolean }>();
  const seen = new Set<string>();
  return (event: Record<string, unknown>) => {
    if (typeof event.event_id === "string") {
      if (seen.has(event.event_id)) return null;
      seen.add(event.event_id);
    }
    if (typeof event.item_id !== "string") return null;
    const id = event.item_id;
    if (event.type === "conversation.item.input_audio_transcription.delta" && typeof event.delta === "string") {
      const item = items.get(id) || { text: "", complete: false };
      if (item.complete) return null;
      item.text += event.delta;
      items.set(id, item);
    } else if (event.type === "conversation.item.input_audio_transcription.completed" && typeof event.transcript === "string") {
      items.set(id, { text: event.transcript, complete: true });
    } else return null;
    return [...items.values()].map(item => item.text.trim()).filter(Boolean).join(" ");
  };
}

export function connectPitchLiveTranscript(stream: MediaStream, options: {
  companyName: string;
  onText: (text: string) => void;
  onStatus: (status: LiveTextStatus) => void;
}) {
  const peer = new RTCPeerConnection();
  const controller = new AbortController();
  let closed = false;
  const applyEvent = createLiveTranscript();
  stream.getAudioTracks().forEach(track => peer.addTrack(track, stream));
  const channel = peer.createDataChannel("oai-events");
  let finishOpen!: () => void;
  const opened = new Promise<void>(resolve => { finishOpen = resolve; });
  const timeout = setTimeout(() => { controller.abort(); finishOpen(); }, 15_000);

  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(timeout);
    controller.abort();
    finishOpen();
    channel.onopen = null;
    channel.onmessage = null;
    peer.onconnectionstatechange = null;
    channel.close();
    peer.close();
  }

  channel.onopen = () => {
    if (closed) return;
    clearTimeout(timeout);
    options.onStatus("live");
    finishOpen();
  };
  channel.onmessage = message => {
    if (closed) return;
    try {
      const event = JSON.parse(message.data);
      if (event.type === "error" || event.type === "conversation.item.input_audio_transcription.failed") {
        options.onStatus("unavailable");
        close();
        return;
      }
      const text = applyEvent(event);
      if (text !== null) options.onText(text);
    } catch { /* Ignore non-transcription or malformed events. */ }
  };
  peer.onconnectionstatechange = () => {
    if (!closed && ["failed", "disconnected"].includes(peer.connectionState)) {
      options.onStatus("unavailable");
      close();
    }
  };

  const ready = (async () => {
    try {
      options.onStatus("connecting");
      const offer = await peer.createOffer();
      if (closed) return;
      await peer.setLocalDescription(offer);
      const response = await fetch("/api/pitch-live-transcription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: peer.localDescription?.sdp || offer.sdp, companyName: options.companyName }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || !result.ok || typeof result.sdp !== "string") throw new Error("Live text unavailable");
      if (closed) return;
      await peer.setRemoteDescription({ type: "answer", sdp: result.sdp });
      await opened;
      if (!closed && channel.readyState !== "open") throw new Error("Live text timed out");
    } catch {
      if (!closed) options.onStatus("unavailable");
      close();
    }
  })();
  return { ready, close };
}
