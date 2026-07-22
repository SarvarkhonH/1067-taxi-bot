// 🎤 Voice transcription — Telegram voice note → Uzbek text via Gemini (multimodal audio).
// People SPEAK their request ("uyimga taksi", "ertaga 7 da bozorga eslat") and the same AI
// pipeline handles it. Reuses GEMINI_API_KEY; no separate STT service (tiny-VPS rule). Returns
// null on any failure so the bot gracefully asks the user to type instead.
const MAX_AUDIO_BYTES = 8 * 1024 * 1024; // ~8 MB — a normal voice note is far smaller

export async function transcribeVoice(filePath: string): Promise<string | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const botToken = process.env.BOT_TOKEN;
  if (!geminiKey || !botToken || !filePath) return null;

  // 1) download the OGG/Opus voice note from Telegram
  const res = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_AUDIO_BYTES) return null;

  // 2) transcribe with Gemini (audio inlineData). temperature 0 → faithful transcription.
  const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: "Sen audio-transkripsiya vositasisan. O'zbekcha (Koson shevasi) ovozni MATNGA aylantir. FAQAT eshitilgan gapni yoz — izoh, tirnoq yoki qo'shimcha so'z QO'SHMA. Agar hech narsa eshitilmasa, bo'sh qoldir." }],
      },
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: "audio/ogg", data: buf.toString("base64") } }, { text: "Ushbu ovozni o'zbekcha matnga aylantir." }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 300, thinkingConfig: { thinkingBudget: 128 } },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!gRes.ok) return null;
  const data = (await gRes.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  return text.length >= 2 ? text.slice(0, 500) : null;
}
