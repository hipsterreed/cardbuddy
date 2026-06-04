"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DidAvatar, {
  DID_CONFIGURED,
  type DidAvatarHandle,
  type DidStatus,
} from "@/components/DidAvatar";
import Webcam, { type WebcamHandle } from "@/components/Webcam";
import Landing from "@/components/Landing";
import { PokeBall } from "@/components/PokeBall";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useSpeech } from "@/lib/useSpeech";

type CardInfo = {
  name: string;
  set: string;
  number: string;
  rarity: string;
  market: number | null;
  image: string | null;
  url: string | null;
};
type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  card?: CardInfo | null;
};

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
  const scrollRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (started) void didRef.current?.connect();
  }, [started]);

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, interim, busy]);

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
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: data.text,
            card: data.card ?? null,
          },
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

  // ── Landing ───────────────────────────────────────────────────────
  if (!started) {
    return <Landing onStart={start} />;
  }

  const badge = speaking
    ? { label: "Speaking", cls: "bg-primary text-primary-foreground" }
    : listening
      ? { label: "● Listening", cls: "bg-emerald-500 text-white" }
      : { label: "Live", cls: "bg-primary/85 text-primary-foreground" };

  // ── Live (full screen; only the transcript scrolls) ───────────────
  return (
    <div className="relative flex h-screen flex-col gap-3 overflow-hidden p-4">
      <header className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2">
          <PokeBall className="h-6 w-6" />
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            CardBuddy
          </h1>
        </div>
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

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* Left: avatar over webcam, equal halves */}
        <div className="flex shrink-0 gap-3 lg:w-[240px] lg:flex-col lg:justify-center">
          <div className="relative aspect-square min-h-0 flex-1 overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-primary/30 lg:flex-none">
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

          <div className="relative aspect-square min-h-0 flex-1 overflow-hidden rounded-xl bg-black ring-1 ring-border lg:flex-none">
            <Webcam ref={webcamRef} onError={setError} />
            <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
              You
            </span>
          </div>
        </div>

        {/* Right: transcript (scrolls) */}
        <Card className="flex min-h-0 flex-1 flex-col gap-0 py-0">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
            <PokeBall className="h-4 w-4" />
            Card notes
          </div>
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
          >
            {turns.length === 0 && !interim && (
              <p className="text-sm text-muted-foreground">
                {micMuted
                  ? "Mic muted — type below, or unmute to talk."
                  : "Hold a card up to the camera and I'll tell you all about it."}
              </p>
            )}
            {turns.map((t) => (
              <div
                key={t.id}
                className={`flex flex-col gap-2 ${t.role === "user" ? "items-end" : "items-start"}`}
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
                {t.card && (
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2 pr-4 shadow-sm">
                    {t.card.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.card.image}
                        alt={t.card.name}
                        className="h-28 w-auto rounded-md"
                      />
                    )}
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold text-foreground">
                        {t.card.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[
                          t.card.set,
                          t.card.number && `#${t.card.number}`,
                          t.card.rarity,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      {t.card.market != null && (
                        <div className="pt-1 text-xl font-extrabold text-primary">
                          ~${Math.round(t.card.market)}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            market
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <PokeBall spinning className="h-4 w-4" />
                Appraising…
              </div>
            )}
          </div>

          {error && (
            <p className="mx-3 mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <form
            className="flex shrink-0 gap-2 border-t border-border p-3"
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

      {/* Loading / error overlay until the stream is up */}
      {!live && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
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
              <PokeBall spinning className="h-16 w-16" />
              <p className="text-lg font-medium text-foreground">
                Waking up your appraiser…
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
