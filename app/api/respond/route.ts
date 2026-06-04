import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Brain (Claude) -> Voice (ElevenLabs TTS) -> upload to D-ID so the avatar
// lip-syncs the EXACT audio the user hears. One audio stream = perfect sync.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "cjVigY5qzO86Huf0OWal";
const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5";

const SYSTEM = `You are an expressive digital human on a live video call. \
Reply in 1-2 short, natural spoken sentences — conversational, like real speech. \
No markdown, no emoji, no stage directions or asterisks, no preamble like "Sure" or "Of course". \
Just say the reply itself. If an image of the user is included, react naturally to what you actually see.`;

type Turn = { role: "user" | "assistant"; text: string };

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "no_anthropic_key" }, { status: 501 });
  }
  if (!process.env.ELEVENLABS_API_KEY || !process.env.D_ID_API_KEY) {
    return NextResponse.json({ error: "missing_keys" }, { status: 501 });
  }

  let body: { messages?: Turn[]; imageBase64?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const turns = body.messages ?? [];
  if (turns.length === 0) {
    return NextResponse.json({ error: "no_messages" }, { status: 400 });
  }

  // 1) Brain — attach the webcam frame (if any) to the latest user turn.
  const messages: Anthropic.MessageParam[] = turns.map((m, i) => {
    const isLast = i === turns.length - 1;
    if (isLast && m.role === "user" && body.imageBase64) {
      return {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: body.imageBase64,
            },
          },
          { type: "text", text: m.text },
        ],
      };
    }
    return { role: m.role, content: m.text };
  });

  let text: string;
  try {
    const reply = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      messages,
    });
    text = reply.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
  } catch (e) {
    return NextResponse.json(
      { error: "brain_error", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
  if (!text) return NextResponse.json({ error: "empty_reply" }, { status: 502 });

  // 2) Voice — ElevenLabs TTS for that exact text.
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
    if (!tts.ok) {
      return NextResponse.json(
        { error: "tts_error", detail: (await tts.text()).slice(0, 300) },
        { status: 502 },
      );
    }
    audio = Buffer.from(await tts.arrayBuffer());
  } catch (e) {
    return NextResponse.json(
      { error: "tts_fetch", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  // 3) Avatar — upload the audio to D-ID; it returns a hosted URL the client
  // feeds to manager.speak({ type: "audio", audio_url }) for lip-sync.
  try {
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "speech.mp3");
    const up = await fetch("https://api.d-id.com/audios", {
      method: "POST",
      headers: { Authorization: "Basic " + process.env.D_ID_API_KEY },
      body: form,
    });
    if (!up.ok) {
      return NextResponse.json(
        { error: "did_upload", detail: (await up.text()).slice(0, 300) },
        { status: 502 },
      );
    }
    const uploaded = (await up.json()) as { url: string; duration?: number };
    return NextResponse.json({
      text,
      audio_url: uploaded.url,
      duration: uploaded.duration,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "did_fetch", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
