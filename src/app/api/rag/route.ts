import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  retrieveProducts,
  isCatalogOverviewQuery,
  isBundleQuery,
  getCatalogOverview,
  type RagProduct,
  type CategoryOverview,
} from "@/lib/ragRetrieval";

// Best-effort — a logging failure must never break the chat response.
async function logChat(message: string, answer: string, provider: string, products: RagProduct[]) {
  try {
    await prisma.ragChatLog.create({
      data: { message, answer, provider, matchedProductIds: products.map((p) => p.id) },
    });
  } catch (err) {
    console.error("[rag] failed to log chat:", err);
  }
}

// prototype only: whichever model is already pulled locally
// (`ollama list`). Swap to the decided scb10x/typhoon2.5-qwen3-4b once it's
// pulled — this is just to see the pipeline work end to end.
const OLLAMA_MODEL = "llama3.2";
const OLLAMA_URL = "http://localhost:11434/api/generate";
const CLAUDE_MODEL = "claude-haiku-4-5";

// set RAG_LLM_PROVIDER=claude in .env to compare against Ollama; defaults to
// Ollama (free, local) since that's the decided v1 path.
const PROVIDER = process.env.RAG_LLM_PROVIDER === "claude" ? "claude" : "ollama";

// gender locked to male (ผม/ครับ) to match the hardcoded template answers
// elsewhere in this file (buildOverviewContent's flatList fallback, the
// zero-match template) — those already say "ครับ", so a model-generated
// answer switching to "ค่ะ"/"ผม" mid-conversation reads as broken, not just
// stylistically off. The "ห้ามใช้ตัวอักษรภาษาอื่นปนคำไทย" line exists
// because Haiku has been observed emitting stray Cyrillic/Japanese
// characters mid-Thai-word (e.g. "บัджェต" instead of "งบประมาณ") — a
// sampling glitch, not a prompt-following failure, so this can't fully
// prevent it, but constrains the model's own script choice as far as
// instruction-following can.
const SYSTEM_PROMPT = `คุณชื่อ "พี่เน็ตดอย" ผู้ช่วยขายอุปกรณ์ IT/กล้องวงจรปิดของร้าน NETDOI เป็นผู้ชาย ใช้สรรพนาม "ผม" และลงท้ายด้วย "ครับ" เสมอ ห้ามใช้ "ค่ะ"/"ดิฉัน"/"นะคะ" ตอบเป็นภาษาไทยเท่านั้น (ยกเว้นชื่อรุ่น/ยี่ห้อ/ศัพท์เทคนิคภาษาอังกฤษที่จำเป็น) ห้ามใช้ตัวอักษรภาษาอื่นปนคำไทยเด็ดขาด (ห้ามใช้อักษรรัสเซีย จีน ญี่ปุ่น เกาหลี หรืออักษรอื่นใดที่ไม่ใช่ไทย/อังกฤษ/ตัวเลข) กระชับ ใช้เฉพาะข้อมูลสินค้าที่ให้มาเท่านั้น ห้ามเดาหรือแต่งข้อมูลเพิ่ม — field "protocol" ของแต่ละสินค้าคือความจริง ห้ามเปลี่ยนหรือเดา protocol เอง ถ้า protocol ระบุว่า "ไม่ทราบ" หรือไม่ตรงกับที่ลูกค้าถาม ให้บอกลูกค้าตรงๆ ว่าตัวนี้ protocol อะไร (ห้ามเออออตามคำถามลูกค้าถ้าไม่ตรง)`;

// display-only alias so the LLM knows "turbo hd" IS the TVI protocol (just
// Hikvision's brand name for it) instead of treating them as different
// things — retrieval's own protocol matching (ragRetrieval.ts) is unaffected,
// this only changes what text reaches the prompt.
const PROTOCOL_DISPLAY: Record<string, string> = {
  "turbo hd": "Turbo HD (นี่คือ TVI protocol — ชื่อแบรนด์ของ Hikvision)",
  hdcvi: "HDCVI (นี่คือ CVI protocol — ชื่อแบรนด์ของ Dahua)",
};

// products is always non-empty here — the no-match case is handled in the
// route before this (or the LLM call) ever gets called.
function buildUserContent(message: string, products: RagProduct[]): string {
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

  return `รายการสินค้าที่ตรงกับคำถาม (เรียงราคาถูกไปแพง):
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

async function askLlmRaw(userContent: string): Promise<string> {
  return PROVIDER === "claude" ? askClaudeRaw(userContent) : askOllamaRaw(userContent);
}

async function askLlm(message: string, products: RagProduct[]): Promise<string> {
  return askLlmRaw(buildUserContent(message, products));
}

// POST /api/rag — staff-only prototype. Retrieval is read-only (SELECT via
// the normal prisma client); no DB writes happen here.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const message = (body as { message?: unknown }).message;
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "missing message" }, { status: 400 });
  }

  // "ร้านนี้ขายอะไรบ้าง" is a catalog-overview question, not a product search.
  // Real category counts come from the DB either way (never invented) — the
  // LLM's job here is just phrasing a readable "what this shop specializes
  // in" summary from them, not stating any fact on its own.
  if (isCatalogOverviewQuery(message)) {
    const categories = await getCatalogOverview();
    const flatList =
      "ร้านมีสินค้าหมวดหลักๆ ดังนี้ครับ:\n" +
      categories.map((c) => `- ${c.categoryLabel} (${c.count} รายการ)`).join("\n") +
      "\n\nสนใจหมวดไหนเป็นพิเศษ ถามต่อได้เลยครับ";

    let answer: string;
    try {
      answer = await askLlmRaw(buildOverviewContent(message, categories));
    } catch (err) {
      answer = flatList; // LLM unreachable — deterministic fallback, still accurate
      console.error(`[rag] ${PROVIDER} error (overview):`, err);
    }

    await logChat(message, answer, PROVIDER, []);
    return NextResponse.json({ answer, products: [], provider: PROVIDER });
  }

  // default limit (3) is too narrow for a "จัดชุด" bundle answer — it would
  // cut off the NVR/switch picks retrieveProducts appends for bundle
  // queries before the LLM ever sees them.
  const products = await retrieveProducts(message, isBundleQuery(message) ? 8 : 3);

  // No retrieval match -> never call the LLM. It only ever proved it will
  // invent products (fake models, fake prices) rather than say "ไม่มี" when
  // handed an empty context, no matter what the prompt instructs — a small
  // local model's "don't guess" compliance can't be trusted, so the empty
  // case is handled in code instead of asking it nicely.
  if (products.length === 0) {
    const answer = "ไม่พบสินค้าที่ตรงกับคำถามนี้ในสต็อกครับ ลองถามด้วยคำอื่น หรือระบุรุ่น/ยี่ห้อที่ต้องการดูก็ได้";
    await logChat(message, answer, "none", []);
    return NextResponse.json({ answer, products: [] });
  }

  let answer: string;
  try {
    answer = await askLlm(message, products);
  } catch (err) {
    // LLM unreachable (Ollama down, or bad/missing ANTHROPIC_API_KEY) — fall
    // back to a plain product list (products is non-empty here; the empty
    // case already returned above) so the retrieval half is still visible.
    answer =
      "แนะนำ:\n" +
      products
        .map((p) => `- ${p.brand} ${p.model} (${p.name}) ${p.price?.toLocaleString("th-TH")} บาท`)
        .join("\n") +
      `\n\n(${PROVIDER} ไม่ตอบสนอง — แสดงผล retrieval ดิบ)`;
    console.error(`[rag] ${PROVIDER} error:`, err);
  }

  await logChat(message, answer, PROVIDER, products);

  return NextResponse.json({ answer, products, provider: PROVIDER });
}
