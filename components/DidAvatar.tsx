"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { AgentManager } from "@d-id/client-sdk";

// Public client credentials (safe in the browser).
// D-ID Studio -> your Agent -> "Integrate" / "Embed".
const AGENT_ID = process.env.NEXT_PUBLIC_DID_AGENT_ID;
const CLIENT_KEY = process.env.NEXT_PUBLIC_DID_CLIENT_KEY;

export const DID_CONFIGURED = Boolean(AGENT_ID && CLIENT_KEY);

// Video codec: "on" = VP8, "off" = H264, "auto" = browser picks.
// Smoothness is machine-specific — try "on" vs "off" to see which decodes best.
const CODEC =
  (process.env.NEXT_PUBLIC_DID_CODEC as "on" | "off" | "auto") || "on";

export type DidStatus = "idle" | "connecting" | "connected" | "error";

/** Imperative handle the parent (Experience) uses to drive the avatar. */
export type DidAvatarHandle = {
  connect: () => Promise<void>;
  /** Lip-sync + play a pre-rendered audio clip (our ElevenLabs voice). */
  speakAudio: (audioUrl: string) => Promise<void>;
  disconnect: () => Promise<void>;
  isConnected: () => boolean;
};

type Props = {
  /** Mute the avatar's audio. Default false — D-ID plays our ElevenLabs clip. */
  muted?: boolean;
  onStatusChange?: (status: DidStatus) => void;
  /** Fires true when the avatar starts talking, false when it stops. */
  onSpeakingChange?: (speaking: boolean) => void;
};

const DidAvatar = forwardRef<DidAvatarHandle, Props>(function DidAvatar(
  { muted = false, onStatusChange, onSpeakingChange },
  ref,
) {
  // Two stacked layers we crossfade between — no element reload = no flicker.
  const liveVideoRef = useRef<HTMLVideoElement>(null); // WebRTC stream (talking)
  const idleVideoRef = useRef<HTMLVideoElement>(null); // looping idle clip
  const managerRef = useRef<AgentManager | null>(null);
  const connectedRef = useRef(false);

  const [speaking, setSpeaking] = useState(false);
  const [hasIdle, setHasIdle] = useState(false);

  const onSpeakingChangeRef = useRef(onSpeakingChange);
  useEffect(() => {
    onSpeakingChangeRef.current = onSpeakingChange;
  });

  const setStatus = useCallback(
    (s: DidStatus) => onStatusChange?.(s),
    [onStatusChange],
  );

  const setSpeakingState = useCallback((s: boolean) => {
    setSpeaking(s);
    onSpeakingChangeRef.current?.(s);
    if (s) void liveVideoRef.current?.play().catch(() => {});
  }, []);

  const connect = useCallback(async () => {
    if (!DID_CONFIGURED || managerRef.current) return;
    setStatus("connecting");
    try {
      const sdk = await import("@d-id/client-sdk");
      const manager = await sdk.createAgentManager(AGENT_ID as string, {
        auth: { type: "key", clientKey: CLIENT_KEY as string },
        streamOptions: { compatibilityMode: CODEC, streamWarmup: true },
        callbacks: {
          onSrcObjectReady(stream) {
            const v = liveVideoRef.current;
            if (v) {
              v.srcObject = stream;
              void v.play().catch(() => {});
            }
          },
          onConnectionStateChange(state) {
            const s = String(state);
            if (s === "connected") {
              connectedRef.current = true;
              setStatus("connected");
            }
            if (s === "fail") {
              connectedRef.current = false;
              setStatus("error");
            }
          },
          onVideoStateChange(state) {
            // START -> talking (show live), STOP -> idle (crossfade to loop).
            setSpeakingState(String(state) !== "STOP");
          },
          onError() {
            setStatus("error");
          },
        },
      });
      managerRef.current = manager;

      // Preload the looping idle clip into the back layer.
      const idle = manager.agent?.presenter?.idle_video;
      const iv = idleVideoRef.current;
      if (idle && iv) {
        iv.src = idle;
        iv.loop = true;
        setHasIdle(true);
        void iv.play().catch(() => {});
      }

      await manager.connect();
    } catch {
      setStatus("error");
    }
  }, [setStatus, setSpeakingState]);

  const speakAudio = useCallback(async (audioUrl: string) => {
    const manager = managerRef.current;
    if (!manager || !connectedRef.current || !audioUrl) return;
    try {
      await manager.speak({ type: "audio", audio_url: audioUrl });
    } catch {
      /* a failed utterance shouldn't break the session */
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await managerRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    managerRef.current = null;
    connectedRef.current = false;
    setSpeaking(false);
    setHasIdle(false);
    setStatus("idle");
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
    if (idleVideoRef.current) idleVideoRef.current.src = "";
  }, [setStatus]);

  useImperativeHandle(
    ref,
    () => ({
      connect,
      speakAudio,
      disconnect,
      isConnected: () => connectedRef.current,
    }),
    [connect, speakAudio, disconnect],
  );

  useEffect(() => {
    return () => {
      managerRef.current?.disconnect().catch(() => {});
    };
  }, []);

  // Live layer is visible while talking (or whenever there's no idle clip);
  // the idle loop shows the rest of the time. CSS opacity crossfade.
  const liveVisible = speaking || !hasIdle;

  return (
    <div className="relative h-full w-full">
      <video
        ref={idleVideoRef}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${
          liveVisible ? "opacity-0" : "opacity-100"
        }`}
        autoPlay
        loop
        playsInline
        muted
      />
      <video
        ref={liveVideoRef}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${
          liveVisible ? "opacity-100" : "opacity-0"
        }`}
        autoPlay
        playsInline
        muted={muted}
      />
    </div>
  );
});

export default DidAvatar;
