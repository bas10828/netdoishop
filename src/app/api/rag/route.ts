import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { readMemberSession } from "@/lib/memberAuth";
import { prisma } from "@/lib/prisma";
import {
  retrieveProducts,
  getProductsByIds,
  isCatalogOverviewQuery,
  isBundleQuery,
  getCatalogOverview,
  estimateApCoverageNote,
  extractQuantity,
  type RagProduct,
} from "@/lib/ragRetrieval";
import { askLlm, askOverviewAnswer, PROVIDER, type HistoryTurn } from "@/lib/ragChat";

// keeps the prompt from growing unbounded turn over turn — recent context is
// what resolves a follow-up's pronouns ("นั่นแหละ", "ตัวนั้น"); older turns
// add little and cost tokens on every subsequent request.
const MAX_HISTORY_TURNS = 6;

function parseHistory(body: unknown): HistoryTurn[] {
  const raw = (body as { history?: unknown }).history;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (t): t is HistoryTurn =>
        !!t &&
        typeof t === "object" &&
        (t as HistoryTurn).role &&
        ["user", "assistant"].includes((t as HistoryTurn).role) &&
        typeof (t as HistoryTurn).text === "string"
    )
    .slice(-MAX_HISTORY_TURNS);
}

function parsePreviousProductIds(body: unknown): number[] {
  const raw = (body as { previousProductIds?: unknown }).previousProductIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is number => typeof id === "number").slice(0, 10);
}

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

// POST /api/rag — gated to logged-in staff (NextAuth) OR a สมาชิกช่าง member
// session (public storefront widget), same two-way check as
// /api/member-auth/me. Keeps this a real API cost (Claude Haiku per call)
// from being open to anonymous storefront visitors. Retrieval is read-only
// (SELECT via the normal prisma client); no DB writes happen here.
export async function POST(req: Request) {
  const [staffSession, memberSession] = await Promise.all([
    getServerSession(authOptions),
    readMemberSession(),
  ]);
  if (!staffSession && !memberSession) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
  const history = parseHistory(body);
  const previousProductIds = parsePreviousProductIds(body);

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
      answer = await askOverviewAnswer(message, categories);
    } catch (err) {
      answer = flatList; // LLM unreachable — deterministic fallback, still accurate
      console.error(`[rag] ${PROVIDER} error (overview):`, err);
    }

    await logChat(message, answer, PROVIDER, []);
    return NextResponse.json({ answer, products: [], provider: PROVIDER });
  }

  // default limit (3) is too narrow for a "จัดชุด" bundle answer (cuts off
  // the NVR/switch picks retrieveProducts appends) — and, a real gap found
  // live, also too narrow for a plain quote request that states a real unit
  // count ("กล้อง 4 ล้าน สี่ตัว"): only 3 of the catalog's 8 real 4MP camera
  // SKUs made it into context, so the LLM (accurately reporting what it was
  // shown, just shown too little) told the customer only 2-3 models exist
  // and refused to quote 4 units. Any query with a stated quantity gets the
  // same wider limit as a bundle, whether or not "จัดชุด" was said.
  const wideLimit = isBundleQuery(message) || extractQuantity(message) !== null;
  let products = await retrieveProducts(message, wideLimit ? 8 : 3);

  // Chat is otherwise fully stateless per turn — a follow-up that only
  // makes sense with prior context ("นั่นแหละมีรุ่นไหนบ้างล่ะ") has no
  // product keywords of its own, so fresh retrieval comes up empty even
  // though the customer is clearly still talking about the same items.
  // Fall back to whichever product set the client last saw (re-fetched from
  // the DB, not trusted client data) instead of the canned no-match reply.
  if (products.length === 0 && previousProductIds.length > 0) {
    products = await getProductsByIds(previousProductIds);
  }

  // No retrieval match (fresh or fallback) -> never call the LLM. It only
  // ever proved it will invent products (fake models, fake prices) rather
  // than say "ไม่มี" when handed an empty context, no matter what the
  // prompt instructs — a small local model's "don't guess" compliance can't
  // be trusted, so the empty case is handled in code instead of asking it
  // nicely.
  if (products.length === 0) {
    const answer = "ไม่พบสินค้าที่ตรงกับคำถามนี้ในสต็อกครับ ลองถามด้วยคำอื่น หรือระบุรุ่น/ยี่ห้อที่ต้องการดูก็ได้";
    await logChat(message, answer, "none", []);
    return NextResponse.json({ answer, products: [] });
  }

  // Rough AP-count estimate ("ครอบคลุมบ้าน 3 ชั้น 300 ตรม กี่ตัว") — only
  // ever computed from a stated area/floor count, never invented; null for
  // any query that doesn't give that signal (see estimateApCoverageNote's
  // own comment for the disclosed-assumption reasoning).
  const apCoverageNote = estimateApCoverageNote(message);

  let answer: string;
  try {
    answer = await askLlm(message, products, history, apCoverageNote);
  } catch (err) {
    // LLM unreachable (Ollama down, or bad/missing ANTHROPIC_API_KEY) — fall
    // back to a plain product list (products is non-empty here; the empty
    // case already returned above) so the retrieval half is still visible.
    answer =
      "แนะนำ:\n" +
      products
        .map(
          (p) =>
            `- ${p.brand} ${p.model} (${p.name}) ${
              p.price !== null ? `${p.price.toLocaleString("th-TH")} บาท` : "ยังไม่เปิดราคา (Coming Soon)"
            }`
        )
        .join("\n") +
      `\n\n(${PROVIDER} ไม่ตอบสนอง — แสดงผล retrieval ดิบ)`;
    console.error(`[rag] ${PROVIDER} error:`, err);
  }

  await logChat(message, answer, PROVIDER, products);

  return NextResponse.json({ answer, products, provider: PROVIDER });
}
