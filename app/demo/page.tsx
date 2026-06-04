"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DidAvatar, {
  DID_CONFIGURED,
  type DidAvatarHandle,
  type DidStatus,
} from "@/components/DidAvatar";
import Webcam, { type WebcamHandle } from "@/components/Webcam";
import { PokeBall } from "@/components/PokeBall";
import { Button } from "@/components/ui/button";

type Card = {
  name: string;
  set: string;
  number: string;
  rarity: string;
  market: number;
  image: string;
};
type Turn = { id: string; role: "user" | "assistant"; text: string; card?: Card };

// Baked lines — the avatar speaks these; hold up the matching card on cue.
const SCRIPT: { user: string; say: string; card: Card }[] = [
  {
    user: "Alright buddy — what's this Charizard?",
    say: "Oh, that's a Mega Charizard X ex — a special illustration rare from the new Mega Evolution set. That full-art is absolutely stunning, and it is not cheap: this one's sitting around eight hundred and seventy-five dollars. A serious modern chase card.",
    card: {
      name: "Mega Charizard X ex",
      set: "Phantasmal Flames",
      number: "125",
      rarity: "Special Illustration Rare",
      market: 877,
      image: "https://images.pokemontcg.io/me2/125.png",
    },
  },
  {
    user: "No way. Okay, my son's favorite — this Gengar?",
    say: "Oh, now we're talking. That's Gengar VMAX from Fusion Strike, and it's the rainbow rare — the gold-tier secret chase card. This one's sitting around nine hundred dollars. Yeah... definitely not a school-bag card.",
    card: {
      name: "Gengar VMAX",
      set: "Fusion Strike",
      number: "271",
      rarity: "Rare Rainbow",
      market: 893,
      image: "https://images.pokemontcg.io/swsh8/271.png",
    },
  },
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function DemoPage() {
  const didRef = useRef<DidAvatarHandle>(null);
  const webcamRef = useRef<WebcamHandle>(null);
  const ranRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState<DidStatus>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = status === "connected";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, busy]);

  const start = useCallback(() => {
    setError(null);
    setStarted(true);
  }, []);

  useEffect(() => {
    if (started) void didRef.current?.connect();
  }, [started]);

  const runScript = useCallback(async () => {
    const built: Turn[] = [];
    for (const s of SCRIPT) {
      built.push({ id: crypto.randomUUID(), role: "user", text: s.user });
      setTurns([...built]);
      await sleep(900);
      setBusy(true);
      try {
        const res = await fetch("/api/say", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: s.say }),
        });
        const data = await res.json();
        setBusy(false);
        if (!res.ok) {
          setError(data?.detail || data?.error || "Request failed");
          return;
        }
        built.push({
          id: crypto.randomUUID(),
          role: "assistant",
          text: s.say,
          card: s.card,
        });
        setTurns([...built]);
        setSpeaking(true);
        await didRef.current?.speakAudio(data.audio_url);
        await sleep((data.duration ? data.duration * 1000 : 8000) + 1500);
        setSpeaking(false);
        await sleep(800);
      } catch (e) {
        setBusy(false);
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
  }, []);

  useEffect(() => {
    if (live && started && !ranRef.current) {
      ranRef.current = true;
      void runScript();
    }
  }, [live, started, runScript]);

  if (!DID_CONFIGURED) {
    return (
      <main className="flex h-screen items-center justify-center p-6 text-muted-foreground">
        Add your D-ID credentials to .env.local to run the demo.
      </main>
    );
  }

  if (!started) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <PokeBall className="h-16 w-16" />
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            CardBuddy — Demo
          </h1>
          <p className="mx-auto max-w-md text-muted-foreground">
            The real avatar + your camera, running a scripted appraisal. Hit
            start, then hold up your Charizard and Gengar on cue.
          </p>
        </div>
        <Button onClick={start} className="h-12 px-8 text-base font-semibold">
          Start demo
        </Button>
      </main>
    );
  }

  const badge = speaking
    ? { label: "Speaking", cls: "bg-primary text-primary-foreground" }
    : { label: "● Listening", cls: "bg-emerald-500 text-white" };

  return (
    <main className="relative flex h-screen flex-col gap-3 overflow-hidden p-4">
      <header className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2">
          <PokeBall className="h-6 w-6" />
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            CardBuddy
          </h1>
        </div>
        <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
          DEMO
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <div className="flex shrink-0 gap-3 lg:w-[300px] lg:flex-col lg:justify-center">
          <div className="relative aspect-square min-h-0 flex-1 overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-primary/30 lg:flex-none">
            <DidAvatar
              ref={didRef}
              onStatusChange={setStatus}
              onSpeakingChange={setSpeaking}
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

        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
            <PokeBall className="h-4 w-4" /> Card notes
          </div>
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
          >
            {turns.length === 0 && (
              <p className="text-sm text-muted-foreground">Starting the demo…</p>
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
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-2 pr-4 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={t.card.image}
                      alt={t.card.name}
                      className="h-28 w-auto rounded-md"
                    />
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold text-foreground">
                        {t.card.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.card.set} · #{t.card.number} · {t.card.rarity}
                      </div>
                      <div className="pt-1 text-xl font-extrabold text-primary">
                        ~${t.card.market}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          market
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <PokeBall spinning className="h-4 w-4" />
                Appraising…
              </div>
            )}
            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      {!live && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background">
          {status === "error" ? (
            <p className="text-sm text-destructive">
              {error ?? "The avatar stream failed to start."}
            </p>
          ) : (
            <>
              <PokeBall spinning className="h-16 w-16" />
              <p className="text-lg font-medium text-foreground">
                Waking up your appraiser…
              </p>
            </>
          )}
        </div>
      )}
    </main>
  );
}
