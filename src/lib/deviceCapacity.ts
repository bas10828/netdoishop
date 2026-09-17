// Shared name-parsing helpers for matching a customer's camera count to a
// recorder/switch that actually fits it — used by both the storage
// calculator (/calculator) and the RAG bundle-sizing retrieval
// (ragRetrieval.ts). No structured "channels"/"ports" column exists on
// Product, so this is parsed from the free-text `name` field, same
// convention distributor pricelists already use ("NVR 8CH", "PoE switch
// 8-port Gigabit").

// extract channel count from an NVR's name, e.g. "AcuSense NVR 8CH, 2 HDD"
// or "VIGI 16 Channel Network Video Recorder" -> 8, 16.
export function channelsFromName(name: string): number | null {
  const m = name.match(/(\d+)\s*-?\s*(?:ch\b|channel)/i);
  return m ? Number(m[1]) : null;
}

// Built-in PoE ports on an NVR — 0 when it has none (needs a full external
// PoE switch for every camera). Two real naming conventions in this catalog:
//   Hikvision/Dahua state it explicitly:   "NVR 8CH 8-PoE, 1 HDD" -> 8
//   TP-Link VIGI just says "PoE"/"PoE+"
//     with no separate digit, because ALL its channels are PoE when the
//     word appears at all: "VIGI 4 Channel PoE Network Video Recorder" ->
//     channel count (4) IS the PoE count. A VIGI NVR with no "PoE" in the
//     name (e.g. "VIGI 16 Channel Network Video Recorder") has none.
// A camera bundle only needs a separate PoE switch when the recommended
// NVR's built-in PoE can't cover every camera on its own — see the
// self-sufficient-NVR check in ragRetrieval.ts's bundle sizing.
export function nvrPoePortsFromName(name: string): number {
  const explicit = name.match(/(\d+)\s*-?\s*poe/i);
  if (explicit) return Number(explicit[1]);
  if (/\bpoe\b/i.test(name)) return channelsFromName(name) ?? 0;
  return 0;
}

// Total Ethernet port count from a switch's name (every RJ45/SFP port,
// PoE-capable or not), e.g. "24-Port Gigabit Unmanaged PoE Switch" -> 24.
// NOT what "does this switch have enough ports to POWER N cameras" should
// use — many switches in this catalog only run PoE on a subset of their
// ports (e.g. "Omada ES220GMP: 20-Port ... with 16-Port PoE+" is 20 total
// Ethernet ports but only 16 actually deliver PoE, the other 4 are
// non-PoE uplinks). Use poePortsFromName() for camera-bundle sizing.
export function portsFromName(name: string): number | null {
  const m = name.match(/(\d+)\s*-?\s*port/i);
  return m ? Number(m[1]) : null;
}

// any run of characters that never starts another "<digits>-port"
// declaration — lets a port-count/"poe" pairing span over unrelated digits
// (speed ratings like "10/100/1000", wattage like "125W"/"120W") while still
// refusing to bridge past a DIFFERENT port-count number in between.
const UNTIL_NEXT_PORT = "(?:(?!\\d+\\s*-?\\s*port).)*?";

// PoE-capable port count specifically — the number that actually matters
// for "will this switch power N cameras". Names in this catalog always
// pair it with the word "PoE"/"PoE+" on one side, with no OTHER port-count
// number in between, even when a different (larger) total-port number sits
// elsewhere in the same name and/or unrelated digits (speed/wattage) sit
// between the real pair:
//   "20-Port ... with 16-Port PoE+"          -> port-number, then "poe" (16)
//   "8-Port 10/100/1000 PoE+ + 1-Port ..."   -> port-number, then "poe" (8,
//                                                skipping over "10/100/1000")
//   "PoE switch 8-port 10/100M"              -> "poe", then port-number (8)
// Try "port-number -> poe" first (the more common convention when a switch
// states two different port counts), then fall back to "poe -> port-number"
// for names phrased the other way. Two earlier, simpler attempts both got
// real catalog entries wrong: excluding NO characters (picks the first
// port-count in the string, e.g. the "20" in "20-Port...16-Port PoE+")
// under-restricts; excluding ALL digits between the pair (`[^0-9]*?`)
// over-restricts and breaks on any speed-rating/wattage digit sitting
// between the real port-count and "poe" (e.g. returned null for
// "8-Port 10/100/1000 PoE+..."). Excluding only another PORT declaration
// specifically is what the naming convention actually needs blocked.
export function poePortsFromName(name: string): number | null {
  const portThenPoe = name.match(new RegExp(`(\\d+)\\s*-?\\s*port${UNTIL_NEXT_PORT}poe`, "i"));
  if (portThenPoe) return Number(portThenPoe[1]);
  const poeThenPort = name.match(new RegExp(`poe${UNTIL_NEXT_PORT}(\\d+)\\s*-?\\s*port`, "i"));
  return poeThenPort ? Number(poeThenPort[1]) : null;
}
