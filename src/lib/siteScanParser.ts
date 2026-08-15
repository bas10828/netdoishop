import type ExcelJS from "exceljs";

export type ParsedDevice = {
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  macAddress: string | null;
  deviceName: string | null;
  extra: Record<string, string>;
};

type CoreField = "brand" | "model" | "serialNumber" | "macAddress" | "deviceName";

// Header text (any casing/spacing) -> core field. Matched against a
// whitespace-stripped, lowercased version of the header — deliberately NOT
// stripping underscores, so "MAC" and "MAC_" (format 1's redundant
// no-colon duplicate) stay distinct instead of colliding.
const CORE_ALIASES: Record<string, CoreField> = {
  brand: "brand",
  model: "model",
  mac: "macAddress",
  macaddress: "macAddress",
  serial: "serialNumber",
  serialnumber: "serialNumber",
  serailnumber: "serialNumber", // typo seen in a real site's master inventory export
  filename: "deviceName",
  devicename: "deviceName",
};

// Columns we recognize but intentionally drop rather than route to `extra`:
// BarcodeText is the raw scanned string (Serial already has the parsed
// value — per explicit direction, 2026-08-15); "NO."/"No" is just a row
// index, not device data.
const IGNORED_HEADERS = new Set(["barcodetext", "no", "no."]);

function normalizeHeader(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, "");
}

function cellToText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    const v = value as { text?: unknown; result?: unknown };
    if ("text" in v) return String(v.text ?? "").trim() || null;
    if ("result" in v) return String(v.result ?? "").trim() || null;
  }
  const s = String(value).trim();
  return s || null;
}

function emptyDevice(): ParsedDevice {
  return { brand: null, model: null, serialNumber: null, macAddress: null, deviceName: null, extra: {} };
}

// Table-shaped sheets: a header row somewhere in the first few rows (not
// necessarily row 1 — the manual master-inventory format has two title
// rows above it), one device per row after that. Returns null if no row
// in the scan window looks like a real header (title rows like
// "INVENTORY" only have one cell, so they don't qualify).
function parseTableSheet(sheet: ExcelJS.Worksheet): ParsedDevice[] | null {
  const scanRows = Math.min(6, sheet.rowCount);
  let headerRowNumber = -1;
  let headerCols: { col: number; normalized: string; original: string }[] = [];

  for (let r = 1; r <= scanRows; r++) {
    const cols: { col: number; normalized: string; original: string }[] = [];
    sheet.getRow(r).eachCell((cell, colNumber) => {
      const text = cellToText(cell.value);
      if (text) cols.push({ col: colNumber, normalized: normalizeHeader(text), original: text });
    });
    const coreMatches = cols.filter((c) => CORE_ALIASES[c.normalized]).length;
    if (cols.length >= 3 && coreMatches >= 1) {
      headerRowNumber = r;
      headerCols = cols;
      break;
    }
  }
  if (headerRowNumber === -1) return null;

  const devices: ParsedDevice[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const device = emptyDevice();
    let hasAny = false;
    for (const { col, normalized, original } of headerCols) {
      if (IGNORED_HEADERS.has(normalized)) continue;
      const text = cellToText(row.getCell(col).value);
      if (!text) continue;
      hasAny = true;
      const coreField = CORE_ALIASES[normalized];
      if (coreField) device[coreField] = text;
      else device.extra[original] = text;
    }
    if (hasAny) devices.push(device);
  });
  return devices;
}

// Key-value sheets: label in column A, value in column B, the whole block
// is ONE device (e.g. a "NVR3" sheet with deviceName/model/serialNumber/
// macAddress/firmwareVersion as row pairs). Real NVR exports keep going
// past that block into unrelated per-channel tables further down the same
// sheet (an "HDD" mini-table, then a 32-row channel-ID -> camera-name
// list) — a purely-numeric label ("1", "2", ...) is what that channel
// table looks like, and is never a real device-field label, so it's used
// as the stop signal. A 20-row cap is a second, cruder backstop for sheets
// that don't happen to hit a numeric label. Returns null if the block
// doesn't look like this shape at all, or none of its labels are
// recognized (so a stray non-device sheet doesn't get imported as junk).
function parseKeyValueSheet(sheet: ExcelJS.Worksheet): ParsedDevice | null {
  const device = emptyDevice();
  let matchedCore = 0;
  let anyField = false;
  const maxRows = Math.min(sheet.rowCount, 20);
  for (let r = 1; r <= maxRows; r++) {
    const row = sheet.getRow(r);
    const label = cellToText(row.getCell(1).value);
    const value = cellToText(row.getCell(2).value);
    if (!label || !value) continue;
    if (/^\d+$/.test(label)) break;
    const normalized = normalizeHeader(label);
    if (IGNORED_HEADERS.has(normalized)) continue;
    anyField = true;
    const coreField = CORE_ALIASES[normalized];
    if (coreField) {
      device[coreField] = value;
      matchedCore++;
    } else {
      device.extra[label] = value;
    }
  }
  if (!anyField || matchedCore === 0) return null;
  return device;
}

// Parses every worksheet in a workbook, trying table shape first and
// falling back to key-value shape. Sheets that match neither (truly empty,
// or genuinely unrelated content) are silently skipped rather than erroring
// the whole upload — one bad sheet shouldn't block the other three.
export function parseScanWorkbook(workbook: ExcelJS.Workbook): ParsedDevice[] {
  const devices: ParsedDevice[] = [];
  for (const sheet of workbook.worksheets) {
    const tableDevices = parseTableSheet(sheet);
    if (tableDevices && tableDevices.length > 0) {
      for (const d of tableDevices) devices.push({ ...d, extra: { ...d.extra, sheet: sheet.name } });
      continue;
    }
    const kv = parseKeyValueSheet(sheet);
    if (kv) devices.push({ ...kv, extra: { ...kv.extra, sheet: sheet.name } });
  }
  return devices;
}
