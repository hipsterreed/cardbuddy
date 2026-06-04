"use client";

import { PokeBall } from "@/components/PokeBall";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: "👁️",
    title: "It sees your cards",
    body: "Just hold any card up to your webcam — no typing, no searching, no app to fumble with.",
  },
  {
    icon: "🧠",
    title: "Knows every set",
    body: "Real Pokémon expertise: the Pokémon, its type, the set and era, the artist, and why a card matters.",
  },
  {
    icon: "💰",
    title: "Live market prices",
    body: "Pulls the current market value from real card-price data — and tells you what moves it (condition, 1st Edition, grading).",
  },
];

const STEPS = [
  { n: "1", t: "Start & allow your camera", d: "One tap. CardBuddy comes to life and starts listening." },
  { n: "2", t: "Hold up a card", d: "Any Pokémon card, any set. Hold it steady for a second." },
  { n: "3", t: "Get the full story", d: "It identifies the card, tells you about it, and prices it — out loud." },
];

// Iconic Base Set holos that drift behind the hero.
const FLOATERS = [
  { src: "base1/4.png", pos: "left-[3%] top-[14%]", rot: "-rotate-12", h: "h-44", op: "opacity-70", dur: 7, delay: 0 },
  { src: "base1/2.png", pos: "right-[4%] top-[9%]", rot: "rotate-[10deg]", h: "h-48", op: "opacity-60", dur: 8.5, delay: 0.8, blur: true },
  { src: "base1/15.png", pos: "left-[8%] bottom-[8%]", rot: "rotate-6", h: "h-40", op: "opacity-45", dur: 9.2, delay: 1.6, blur: true },
  { src: "base1/10.png", pos: "right-[7%] bottom-[6%]", rot: "-rotate-6", h: "h-44", op: "opacity-65", dur: 7.8, delay: 0.4 },
  { src: "base1/1.png", pos: "left-[19%] top-[5%]", rot: "rotate-[14deg]", h: "h-32", op: "opacity-35", dur: 10, delay: 2.2, blur: true },
  { src: "base1/6.png", pos: "right-[17%] bottom-[12%]", rot: "-rotate-[14deg]", h: "h-32", op: "opacity-40", dur: 8.2, delay: 1.1, blur: true },
];

export default function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(65%_55%_at_50%_-5%,#EE151524,transparent)]" />
        {/* Drifting holo cards */}
        <div
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
          aria-hidden="true"
        >
          {FLOATERS.map((f, i) => (
            <div key={i} className={`absolute ${f.pos} ${f.rot} ${f.op} hidden md:block`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://images.pokemontcg.io/${f.src}`}
                alt=""
                className={`${f.h} w-auto animate-float rounded-xl shadow-2xl ${f.blur ? "blur-[1.5px]" : ""}`}
                style={{
                  animationDuration: `${f.dur}s`,
                  animationDelay: `${f.delay}s`,
                }}
              />
            </div>
          ))}
        </div>
        <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center gap-6 px-6 pb-16 pt-16 text-center sm:pt-24">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground">
            <PokeBall className="h-4 w-4" /> CardBuddy
          </div>

          <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
            Point your camera at any{" "}
            <span className="text-primary">Pokémon card.</span>
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            CardBuddy is a digital human that{" "}
            <strong className="font-semibold text-foreground">
              sees your cards
            </strong>
            , knows every set, and tells you what they&apos;re worth — out loud,
            in real time.
          </p>

          <div className="flex flex-col items-center gap-2">
            <Button onClick={onStart} className="h-12 px-8 text-base font-semibold">
              Try CardBuddy →
            </Button>
            <span className="text-xs text-muted-foreground">
              Best in Chrome · uses your camera &amp; mic
            </span>
          </div>

          {/* Product preview */}
          <div className="mt-8 w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card text-left shadow-2xl ring-1 ring-foreground/5">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">
              <PokeBall className="h-4 w-4" /> Card notes
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-white" /> Live
              </span>
            </div>
            <div className="space-y-3 p-4">
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2 text-sm text-foreground">
                  Whoa — Base Set Charizard! The Fire-type that kicked off the
                  whole craze in &apos;99, with that legendary Ken Sugimori art.
                  Raw market&apos;s around $580 — a graded 1st Edition runs into
                  five figures.
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-2 pr-4 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.pokemontcg.io/base1/4.png"
                  alt="Charizard"
                  className="h-28 w-auto rounded-md"
                />
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-foreground">
                    Charizard
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Base Set · #4 · Rare Holo
                  </div>
                  <div className="pt-1 text-2xl font-extrabold text-primary">
                    ~$580{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      market
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-5xl gap-4 px-6 py-10 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-border bg-card p-6"
          >
            <div className="text-3xl">{f.icon}</div>
            <h3 className="mt-3 text-lg font-bold text-foreground">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              {f.body}
            </p>
          </div>
        ))}
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="text-center text-3xl font-bold tracking-tight text-foreground">
          How it works
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-extrabold text-primary-foreground">
                {s.n}
              </div>
              <h3 className="mt-4 font-semibold text-foreground">{s.t}</h3>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                {s.d}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_120%,#EE151524,transparent)]" />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-5 px-6 py-20 text-center">
          <PokeBall className="h-14 w-14" />
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Grab a card. Let&apos;s see what you&apos;ve got.
          </h2>
          <Button onClick={onStart} className="h-12 px-8 text-base font-semibold">
            Try CardBuddy →
          </Button>
          <p className="pt-3 text-xs font-medium text-muted-foreground">
            Vision &amp; brain by Claude · Voice by ElevenLabs · Face by D-ID
          </p>
        </div>
      </section>
    </div>
  );
}
