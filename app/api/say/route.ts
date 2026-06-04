import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Baked TTS: text -> ElevenLabs voice -> upload to D-ID for lip-sync.
// No brain — used by the scripted /demo so the avatar speaks pre-written lines.

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "cjVigY5qzO86Huf0OWal";
const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5";

export async function POST(req: Request) {
  if (!process.env.ELEVENLABS_API_KEY || !process.env.D_ID_API_KEY)
    return NextResponse.json({ error: "missing_keys" }, { status: 501 });

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "no_text" }, { status: 400 });

  let audio: Buffer;
  try {
    const tts = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({ text, model_id: TTS_MODEL }),
      },
    );
    if (!tts.ok)
      return NextResponse.json(
        { error: "tts_error", detail: (await tts.text()).slice(0, 200) },
        { status: 502 },
      );
    audio = Buffer.from(await tts.arrayBuffer());
  } catch (e) {
    return NextResponse.json(
      { error: "tts_fetch", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  try {
    const form = new FormData();
    form.append(
      "audio",
      new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }),
      "speech.mp3",
    );
    const up = await fetch("https://api.d-id.com/audios", {
      method: "POST",
      headers: { Authorization: "Basic " + process.env.D_ID_API_KEY },
      body: form,
    });
    if (!up.ok)
      return NextResponse.json(
        { error: "did_upload", detail: (await up.text()).slice(0, 200) },
        { status: 502 },
      );
    const u = (await up.json()) as { url: string; duration?: number };
    return NextResponse.json({ audio_url: u.url, duration: u.duration });
  } catch (e) {
    return NextResponse.json(
      { error: "did_fetch", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
