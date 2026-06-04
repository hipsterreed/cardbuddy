"use client";

import { useEffect, useRef, useState } from "react";

// Hands-free speech recognition (Chrome/Edge). Driven by a single `active`
// flag: while active, the mic listens continuously and fires onResult for each
// finished phrase; flip active false (avatar speaking / busy / muted) and the
// mic is aborted so it never hears the avatar's own voice.

type Options = {
  active: boolean;
  onResult: (text: string) => void;
  onInterim?: (text: string) => void;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export function useSpeech({ active, onResult, onInterim }: Options) {
  const recRef = useRef<any>(null);
  const activeRef = useRef(active);
  const onResultRef = useRef(onResult);
  const onInterimRef = useRef(onInterim);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    onResultRef.current = onResult;
    onInterimRef.current = onInterim;
  });

  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    setSupported(Boolean(SR));
  }, []);

  useEffect(() => {
    activeRef.current = active;
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return;

    function startRec() {
      if (recRef.current || !activeRef.current) return;
      const rec = new SR();
      rec.lang = "en-US";
      rec.interimResults = true;
      rec.continuous = true;

      rec.onresult = (e: any) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) {
            const t = r[0].transcript.trim();
            if (t) onResultRef.current(t);
          } else {
            interim += r[0].transcript;
          }
        }
        onInterimRef.current?.(interim);
      };
      rec.onerror = (e: any) => {
        if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
          activeRef.current = false; // permission denied — stop trying
        }
      };
      rec.onend = () => {
        recRef.current = null;
        setListening(false);
        // Chrome ends the session after long silence — restart if still wanted.
        if (activeRef.current) setTimeout(startRec, 250);
      };

      recRef.current = rec;
      try {
        rec.start();
        setListening(true);
      } catch {
        recRef.current = null;
      }
    }

    function stopRec() {
      const rec = recRef.current;
      recRef.current = null;
      setListening(false);
      // abort() (not stop()) discards any buffered audio so a stray bit of the
      // avatar's voice can't slip through as a final result.
      try {
        rec?.abort?.();
      } catch {
        /* ignore */
      }
    }

    if (active) startRec();
    else stopRec();
  }, [active]);

  useEffect(
    () => () => {
      activeRef.current = false;
      try {
        recRef.current?.abort?.();
      } catch {
        /* ignore */
      }
    },
    [],
  );

  return { supported, listening };
}
