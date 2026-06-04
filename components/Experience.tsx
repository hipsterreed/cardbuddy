"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DidAvatar, {
  DID_CONFIGURED,
  type DidAvatarHandle,
  type DidStatus,
} from "@/components/DidAvatar";
import Webcam, { type WebcamHandle } from "@/components/Webcam";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useSpeech } from "@/lib/useSpeech";

type Turn = { id: string; role: "user" | "assistant"; text: string };

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function friendlyError(code?: string, detail?: string) {
  if (code === "no_anthropic_key")
    return "Add ANTHROPIC_API_KEY to .env.local and restart the dev server.";
  if (code === "missing_keys")
    return "Missing ELEVENLABS_API_KEY or D_ID_API_KEY in .env.local.";
  return detail || code || "Something went wrong.";
}

export default function Experience() {
  const didRef = useRef<DidAvatarHandle>(null);
  const webcamRef = useRef<WebcamHandle>(null);
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState<DidStatus>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = status === "connected";

  const handleSpeakingChange = useCallback((s: boolean) => {
    setSpeaking(s);
    if (!s && speakTimerRef.current) {
      clearTimeout(speakTimerRef.current);
      speakTimerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    setError(null);
    setStarted(true);
  }, []);

  // Connect only after <DidAvatar> has mounted (so didRef is attached).
  useEffect(() => {
    if (started) void didRef.current?.connect();
  }, [started]);

  const stop = useCallback(async () => {
    await didRef.current?.disconnect();
    setStarted(false);
    setStatus("idle");
    setSpeaking(false);
    setTurns([]);
    setInterim("");
    setError(null);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const msg = text.trim();
      if (!msg || busy) return;
      setInput("");
      setInterim("");
      setBusy(true);
      setError(null);

      const userTurn: Turn = { id: crypto.randomUUID(), role: "user", text: msg };
      const history = [...turns, userTurn];
      setTurns(history);

      try {
        let imageBase64: string | undefined;
        const blob = await webcamRef.current?.captureFrame();
        if (blob) imageBase64 = await blobToBase64(blob);

        const res = await fetch("/api/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map((t) => ({ role: t.role, text: t.text })),
            imageBase64,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(friendlyError(data?.error, data?.detail));
          return;
        }
        setTurns((t) => [
          ...t,
          { id: crypto.randomUUID(), role: "assistant", text: data.text },
        ]);

        setSpeaking(true);
        if (speakTimerRef.current) clearTimeout(speakTimerRef.current);
        const ms = (data.duration ? data.duration * 1000 : 8000) + 1500;
        speakTimerRef.current = setTimeout(() => setSpeaking(false), ms);

        await didRef.current?.speakAudio(data.audio_url);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setSpeaking(false);
      } finally {
        setBusy(false);
      }
    },
    [busy, turns],
  );

  const { supported: micSupported, listening } = useSpeech({
    active: live && started && !busy && !speaking && !micMuted,
    onResult: (t) => void send(t),
    onInterim: setInterim,
  });

  // ── Missing config ────────────────────────────────────────────────
  if (!DID_CONFIGURED) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="max-w-xl border-l-4 border-l-amber-500 p-6">
          <h2 className="text-base font-semibold text-foreground">
            Add your D-ID credentials
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Set{" "}
            <code className="rounded bg-muted px-1 text-foreground">
              NEXT_PUBLIC_DID_AGENT_ID
            </code>{" "}
            and{" "}
            <code className="rounded bg-muted px-1 text-foreground">
              NEXT_PUBLIC_DID_CLIENT_KEY
            </code>{" "}
            in{" "}
            <code className="rounded bg-muted px-1 text-foreground">.env.local</code>.
          </p>
        </Card>
      </div>
    );
  }

  // ── Landing (gesture needed for camera/mic + autoplay) ────────────
  if (!started) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-7 px-6 text-center">
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Avatar that sees you
          </h1>
          <p className="mx-auto max-w-md text-muted-foreground">
            A digital human with an ElevenLabs voice that can watch your webcam
            and react. Start it, then just talk.
          </p>
        </div>
        <Button onClick={start} className="h-12 px-8 text-base">
          Start conversation
        </Button>
      </div>
    );
  }

  const badge = speaking
    ? { label: "Speaking", cls: "bg-primary text-primary-foreground" }
    : listening
      ? { label: "● Listening", cls: "bg-emerald-500 text-white" }
      : { label: "Live", cls: "bg-primary/80 text-primary-foreground" };

  // ── Live experience (loading overlay until the stream is up) ──────
  return (
    <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">
          Avatar that sees you
        </h1>
        <div className="flex gap-2">
          {micSupported && (
            <Button
              variant={micMuted ? "secondary" : "outline"}
              onClick={() => setMicMuted((m) => !m)}
              className="h-9"
            >
              {micMuted ? "Unmute" : "Mute mic"}
            </Button>
          )}
          <Button variant="outline" onClick={stop} className="h-9">
            End
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* Left column: avatar over webcam, same size */}
        <div className="flex flex-col gap-4">
          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-primary/20">
            <DidAvatar
              ref={didRef}
              onStatusChange={setStatus}
              onSpeakingChange={handleSpeakingChange}
            />
            <span
              className={`absolute left-3 top-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${badge.cls}`}
            >
              <span className="h-2 w-2 rounded-full bg-current opacity-80" />
              {badge.label}
            </span>
          </div>

          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black ring-1 ring-border">
            <Webcam ref={webcamRef} onError={setError} />
            <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
              You
            </span>
          </div>
        </div>

        {/* Right: transcript */}
        <Card className="flex min-h-0 flex-col gap-0 py-0">
          <div className="border-b border-border px-4 py-3 text-sm font-medium text-foreground">
            Transcript
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {turns.length === 0 && !interim && (
              <p className="text-sm text-muted-foreground">
                {micMuted
                  ? "Mic muted — type below, or unmute to talk."
                  : "Just talk — it can see you through the camera."}
              </p>
            )}
            {turns.map((t) => (
              <div
                key={t.id}
                className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                    t.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {t.text}
                </div>
              </div>
            ))}
            {interim && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl bg-primary/40 px-4 py-2 text-sm text-primary-foreground italic">
                  {interim}
                </div>
              </div>
            )}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
                  …
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="mx-3 mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <form
            className="flex gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="…or type a message"
              disabled={busy}
              className="h-10 flex-1 rounded-full px-4"
            />
            <Button
              type="submit"
              disabled={busy || !input.trim()}
              className="h-10 rounded-full px-5"
            >
              {busy ? "…" : "Send"}
            </Button>
          </form>
        </Card>
      </div>

      {/* Full-cover loading / error until the live stream is up */}
      {!live && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-xl bg-background px-6 text-center">
          {status === "error" ? (
            <>
              <p className="text-lg font-medium text-foreground">
                Couldn&apos;t connect
              </p>
              <p className="max-w-md text-sm text-destructive">
                {error ?? "The avatar stream failed to start."}
              </p>
              <Button variant="outline" onClick={stop} className="h-10">
                Back
              </Button>
            </>
          ) : (
            <>
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
              <p className="text-lg font-medium text-foreground">
                Waking up your avatar…
              </p>
              <p className="text-sm text-muted-foreground">
                Connecting the live video stream
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
