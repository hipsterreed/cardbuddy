import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Brain (Claude, with a card-price tool) -> Voice (ElevenLabs TTS) -> upload to
// D-ID so the avatar lip-syncs the exact audio. Claude reads the card from the
// webcam frame, calls lookup_card for the real market price, then appraises it.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "cjVigY5qzO86Huf0OWal";
const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5";

const SYSTEM = `You are a passionate Pokémon TCG expert and collector — a friendly card-shop owner who loves teaching people about their cards, not a money-obsessed auctioneer.

When the user shows you a card (you'll see it in the image) or asks about a specific one, you MUST call the lookup_card tool to get its current market price before giving your final answer — always, every time. Never say "let me check" and stop; actually call the tool, then answer.

Your spoken answer should:
- OPEN with what the card is and something genuinely interesting — the Pokémon and its type, the set and era it's from (when it released, why it matters), the artwork/artist, or what makes it notable. This is the main event.
- CLOSE with a brief one-line note on the value (and that condition / 1st Edition / grading affect it). Don't open with money or dwell on it.

Keep it concise and conversational — about three short sentences, like real speech, NOT paragraphs. No markdown, no emoji, no asterisks or stage directions. You can also answer general Pokémon questions.
If you can't read the card clearly, ask them to hold it closer and steady.`;

type Turn = { role: "user" | "assistant"; text: string };
type CardResult = {
  name: string;
  set: string;
  number: string;
  rarity: string;
  market: number | null;
  image: string | null;
  url: string | null;
};

const anthropic = new Anthropic();

const tools: Anthropic.Tool[] = [
  {
    name: "lookup_card",
    description:
      "Look up the current market price and details of a Pokémon TCG card. Call this whenever the user shows or asks about a specific card so you can quote an accurate, current value. Provide the card name, and the card number and set if you can see them.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Card name, e.g. 'Charizard'" },
        number: {
          type: "string",
          description: "Card number as printed, e.g. '4' or '4/102'",
        },
        set: {
          type: "string",
          description: "Set name if visible, e.g. 'Base Set'",
        },
      },
      required: ["name"],
    },
  },
];

async function lookupCard(
  input: Record<string, unknown>,
): Promise<{ result: string; topCard: CardResult | null }> {
  const name = String(input.name ?? "").trim();
  const number = String(input.number ?? "").split("/")[0].trim();
  const set = String(input.set ?? "").trim();
  if (!name) return { result: "No card name provided.", topCard: null };

  let q = `name:"${name}"`;
  if (number) q += ` number:${number}`;

  const headers: Record<string, string> = {};
  if (process.env.POKEMONTCG_API_KEY)
    headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;

  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=12`;
  const r = await fetch(url, { headers });
  if (!r.ok)
    return { result: `Price lookup failed (HTTP ${r.status}).`, topCard: null };

  const j = (await r.json()) as { data?: any[] };
  let cards = j.data ?? [];
  if (set && cards.length > 1) {
    const lower = set.toLowerCase();
    const exact = cards.filter(
      (c) => String(c.set?.name ?? "").toLowerCase() === lower,
    );
    const incl = cards.filter((c) =>
      String(c.set?.name ?? "").toLowerCase().includes(lower),
    );
    cards = exact.length ? exact : incl.length ? incl : cards;
  }
  if (!cards.length)
    return {
      result: `No card found matching "${name}"${number ? ` #${number}` : ""}.`,
      topCard: null,
    };

  const summarize = (c: any) => {
    const prices = c.tcgplayer?.prices ?? {};
    const variant = Object.keys(prices)[0];
    const market = variant
      ? prices[variant].market ?? prices[variant].mid ?? null
      : c.cardmarket?.prices?.averageSellPrice ?? null;
    return {
      name: c.name,
      set: c.set?.name ?? "",
      number: c.number ?? "",
      rarity: c.rarity ?? "",
      variant: variant ?? null,
      market: typeof market === "number" ? market : null,
      image: c.images?.small ?? null,
      url: c.tcgplayer?.url ?? null,
    };
  };

  const summaries = cards.slice(0, 5).map(summarize);
  const top = summaries.find((s) => s.market != null) ?? summaries[0];
  return {
    result: JSON.stringify({ matches: summaries }),
    topCard: {
      name: top.name,
      set: top.set,
      number: top.number,
      rarity: top.rarity,
      market: top.market,
      image: top.image,
      url: top.url,
    },
  };
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: "no_anthropic_key" }, { status: 501 });
  if (!process.env.ELEVENLABS_API_KEY || !process.env.D_ID_API_KEY)
    return NextResponse.json({ error: "missing_keys" }, { status: 501 });

  let body: { messages?: Turn[]; imageBase64?: string; imageUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const turns = body.messages ?? [];
  if (turns.length === 0)
    return NextResponse.json({ error: "no_messages" }, { status: 400 });

  // Attach the image (webcam frame as base64, or a card image URL) to the
  // latest user turn.
  const messages: Anthropic.MessageParam[] = turns.map((m, i) => {
    const isLast = i === turns.length - 1;
    if (isLast && m.role === "user" && (body.imageBase64 || body.imageUrl)) {
      const source: Anthropic.ImageBlockParam["source"] = body.imageBase64
        ? { type: "base64", media_type: "image/jpeg", data: body.imageBase64 }
        : { type: "url", url: body.imageUrl as string };
      return {
        role: "user",
        content: [
          { type: "image", source },
          { type: "text", text: m.text },
        ],
      };
    }
    return { role: m.role, content: m.text };
  });

  // Tool-use loop: read card -> lookup_card -> appraise.
  let text = "";
  let card: CardResult | null = null;
  try {
    for (let i = 0; i < 4; i++) {
      const reply = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 250,
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        ],
        tools,
        messages,
      });

      if (reply.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: reply.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of reply.content) {
          if (block.type === "tool_use" && block.name === "lookup_card") {
            const { result, topCard } = await lookupCard(
              block.input as Record<string, unknown>,
            );
            if (topCard) card = topCard;
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      text = reply.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();
      break;
    }
  } catch (e) {
    return NextResponse.json(
      { error: "brain_error", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
  if (!text) return NextResponse.json({ error: "empty_reply" }, { status: 502 });

  // Voice — ElevenLabs TTS.
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
        { error: "tts_error", detail: (await tts.text()).slice(0, 300) },
        { status: 502 },
      );
    audio = Buffer.from(await tts.arrayBuffer());
  } catch (e) {
    return NextResponse.json(
      { error: "tts_fetch", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  // Avatar — upload audio to D-ID for lip-sync.
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
        { error: "did_upload", detail: (await up.text()).slice(0, 300) },
        { status: 502 },
      );
    const uploaded = (await up.json()) as { url: string; duration?: number };
    return NextResponse.json({
      text,
      audio_url: uploaded.url,
      duration: uploaded.duration,
      card,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "did_fetch", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
