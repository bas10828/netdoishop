import Anthropic from "@anthropic-ai/sdk";
import type { RagProduct, CategoryOverview } from "@/lib/ragRetrieval";

export type HistoryTurn = { role: "user" | "assistant"; text: string };

// prototype only: whichever model is already pulled locally
// (`ollama list`). Swap to the decided scb10x/typhoon2.5-qwen3-4b once it's
// pulled — this is just to see the pipeline work end to end.
const OLLAMA_MODEL = "llama3.2";
const OLLAMA_URL = "http://localhost:11434/api/generate";
const CLAUDE_MODEL = "claude-haiku-4-5";

// set RAG_LLM_PROVIDER=claude in .env to compare against Ollama; defaults to
// Ollama (free, local) since that's the decided v1 path.
export const PROVIDER = process.env.RAG_LLM_PROVIDER === "claude" ? "claude" : "ollama";

// gender locked to male (ผม/ครับ) to match the hardcoded template answers
// in api/rag/route.ts (the zero-match template) — those already say
// "ครับ", so a model-generated answer switching to "ค่ะ"/"ผม" mid-
// conversation reads as broken, not just stylistically off. The "ห้ามใช้
// ตัวอักษรภาษาอื่นปนคำไทย" line exists because Haiku has been observed
// emitting stray Cyrillic/Japanese characters mid-Thai-word (e.g.
// "บัджェт" instead of "งบประมาณ") — a sampling glitch, not a prompt-
// following failure, so this can't fully prevent it, but constrains the
// model's own script choice as far as instruction-following can.
const SYSTEM_PROMPT = `คุณชื่อ "พี่เน็ตดอย" ผู้ช่วยขายอุปกรณ์ IT/กล้องวงจรปิดของร้าน NETDOI เป็นผู้ชาย ใช้สรรพนาม "ผม" และลงท้ายด้วย "ครับ" เสมอ ห้ามใช้ "ค่ะ"/"ดิฉัน"/"นะคะ" ตอบเป็นภาษาไทยเท่านั้น (ยกเว้นชื่อรุ่น/ยี่ห้อ/ศัพท์เทคนิคภาษาอังกฤษที่จำเป็น) ห้ามใช้ตัวอักษรภาษาอื่นปนคำไทยเด็ดขาด (ห้ามใช้อักษรรัสเซีย จีน ญี่ปุ่น เกาหลี หรืออักษรอื่นใดที่ไม่ใช่ไทย/อังกฤษ/ตัวเลข) กระชับ ใช้เฉพาะข้อมูลสินค้าที่ให้มาเท่านั้น ห้ามเดาหรือแต่งข้อมูลเพิ่ม — field "protocol" ของแต่ละสินค้าคือความจริง ห้ามเปลี่ยนหรือเดา protocol เอง ถ้า protocol ระบุว่า "ไม่ทราบ" หรือไม่ตรงกับที่ลูกค้าถาม ให้บอกลูกค้าตรงๆ ว่าตัวนี้ protocol อะไร (ห้ามเออออตามคำถามลูกค้าถ้าไม่ตรง)`;

// display-only alias so the LLM knows "turbo hd" IS the TVI protocol (just
// Hikvision's brand name for it) instead of treating them as different
// things — retrieval's own protocol matching (ragRetrieval.ts) is unaffected,
// this only changes what text reaches the prompt.
const PROTOCOL_DISPLAY: Record<string, string> = {
  "turbo hd": "Turbo HD (นี่คือ TVI protocol — ชื่อแบรนด์ของ Hikvision)",
  hdcvi: "HDCVI (นี่คือ CVI protocol — ชื่อแบรนด์ของ Dahua)",
};

// history turns → a short recap block prepended to the prompt so a
// follow-up that only makes sense in context ("นั่นแหละมีรุ่นไหนบ้างล่ะ")
// reads correctly instead of looking like an unrelated fresh question.
function buildHistoryBlock(history: HistoryTurn[]): string {
  if (history.length === 0) return "";
  const lines = history
    .map((t) => `${t.role === "user" ? "ลูกค้า" : "พี่เน็ตดอย"}: ${t.text}`)
    .join("\n");
  return `บทสนทนาก่อนหน้า (สำหรับอ้างอิงบริบทเท่านั้น เช่นคำถามที่พูดถึง "ตัวนั้น"/"นั่นแหละ"):
${lines}

`;
}

// products is always non-empty here — the no-match case is handled in the
// route before this (or the LLM call) ever gets called.
function buildUserContent(message: string, products: RagProduct[], history: HistoryTurn[] = []): string {
  const context = products
    .map((p, i) => {
      const protocolNote = p.protocol
        ? `protocol: ${PROTOCOL_DISPLAY[p.protocol] ?? p.protocol}`
        : "protocol: ไม่ทราบ (ไม่มีข้อมูล อย่าเดา)";
      // real spec bullets when this SKU has a written entry — without this
      // a technical question ("รองรับ ONVIF ไหม", "ระยะ IR กี่เมตร") has
      // nothing to answer from but the bare name, forcing a guess or a
      // false "ไม่มีข้อมูล" even when the answer is right there in specs.
      const specsNote = p.specs?.length
        ? `สเปค: ${p.specs.join("; ")}`
        : "สเปค: ไม่มีข้อมูลสเปคเพิ่มเติมในระบบ (อย่าเดา ถ้าลูกค้าถามสเปคที่ไม่มีตรงนี้ ให้บอกว่าไม่มีข้อมูล)";
      return `${i + 1}. ${p.brand} ${p.model} — ${p.name} — ${protocolNote} — ${specsNote} — ${p.price?.toLocaleString("th-TH")} บาท`;
    })
    .join("\n");

  return `${buildHistoryBlock(history)}รายการสินค้าที่ตรงกับคำถาม (เรียงตามความเกี่ยวข้อง แล้วตามด้วยราคา — ร้านเน้นแนะนำ TP-Link ทุกไลน์ (รวม Tapo) เป็นอันดับแรกช่วงนี้):
${context}

คำถามลูกค้า: ${message}

ตอบคำถามลูกค้าโดยใช้เฉพาะข้อมูล (รวมสเปค) ที่ให้มาด้านบนเท่านั้น:`;
}

// Real per-category counts (from getCatalogOverview) -> a business-level
// "what does this shop specialize in" synthesis instead of a flat list —
// still grounded (the numbers are given, not invented), just phrased as a
// human reading them would, not a mechanical dump of every category.
function buildOverviewContent(message: string, categories: CategoryOverview[]): string {
  const list = categories.map((c) => `${c.categoryLabel}: ${c.count} รายการ`).join("\n");
  return `จำนวนสินค้าจริงแต่ละหมวดในร้าน (ข้อมูลจริงจากคลังสินค้า ห้ามเดาหรือเปลี่ยนตัวเลข):
${list}

คำถามลูกค้า: ${message}

สรุปเป็นภาพรวมธุรกิจสั้นๆ ว่าร้านเน้นขายอะไรเป็นหลัก จัดกลุ่มเป็นหมวดใหญ่ๆ ตามความสำคัญ (ดูจากจำนวนสินค้า) ไม่ต้องไล่ list ทีละหมวดครบทุกอัน เลือกพูดถึงหมวดที่เยอะ/สำคัญพอ ปิดท้ายด้วยชวนถามหมวดที่สนใจเพิ่มเติม:`;
}

async function askOllamaRaw(userContent: string): Promise<string> {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: `${SYSTEM_PROMPT}\n\n${userContent}`,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  const data = (await res.json()) as { response?: string };
  return data.response?.trim() || "ไม่มีคำตอบ";
}

const anthropic = new Anthropic();

async function askClaudeRaw(userContent: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.type === "text" ? textBlock.text.trim() : "ไม่มีคำตอบ";
}

// SYSTEM_PROMPT already instructs the male persona + Thai-only script, but
// production logs (2026-09-09) show claude-haiku-4-5 ignoring it mid-answer
// — "ค่ะ"/"นะคะ" mixed in with "ครับ" in the same reply, and the known
// Cyrillic-glitch ("บัджェт") still slipping through. Prompt-following alone
// isn't reliable enough for this, so enforce both deterministically as a
// belt-and-suspenders pass on every answer before it reaches the customer.
export function sanitizePersona(text: string): string {
  return text
    .replace(/ดิฉัน/g, "ผม")
    // strip stray Cyrillic/CJK/Kana/Hangul characters first — a stripped
    // char can expose a particle the next pass would otherwise walk past.
    .replace(/[Ѐ-ӿ一-鿿぀-ヿ가-힯]/g, "")
    // bare "คะ" is word-final only as a particle ("...ไหมคะ") — mid-word
    // it's ordinary vocabulary ("คะแนน"), so require it not be followed by
    // another Thai character before treating it as the female particle.
    .replace(/ค่ะ|ค๊ะ|คะ(?![฀-๿])/g, "ครับ");
}

async function askLlmRaw(userContent: string): Promise<string> {
  const raw = PROVIDER === "claude" ? await askClaudeRaw(userContent) : await askOllamaRaw(userContent);
  return sanitizePersona(raw);
}

export async function askLlm(
  message: string,
  products: RagProduct[],
  history: HistoryTurn[] = []
): Promise<string> {
  return askLlmRaw(buildUserContent(message, products, history));
}

export async function askOverviewAnswer(message: string, categories: CategoryOverview[]): Promise<string> {
  return askLlmRaw(buildOverviewContent(message, categories));
}
