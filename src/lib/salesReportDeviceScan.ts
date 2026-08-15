import type ExcelJS from "exceljs";

export type ParsedDevice = {
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  macAddress: string | null;
  deviceName: string | null;
};

// Column names as they appear in the phone-scanner app's export
// (autoscan_results.xlsx, sheet "Barcode Results"). Matched case-insensitive
// so a re-export with different casing still works. BarcodeText is
// deliberately not mapped — it's the raw scanned string, Serial already has
// the parsed value out of it (per explicit direction, 2026-08-15).
const COLUMN_MAP: Record<string, keyof ParsedDevice> = {
  brand: "brand",
  model: "model",
  mac: "macAddress",
  serial: "serialNumber",
  filename: "deviceName",
};

export const MAX_DEVICE_SCAN_BYTES = 20 * 1024 * 1024;

export function parseDeviceScanSheet(workbook: ExcelJS.Workbook): ParsedDevice[] {
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) return [];

  const fieldCol = new Map<keyof ParsedDevice, number>();
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const key = String(cell.value ?? "").trim().toLowerCase();
    const field = COLUMN_MAP[key];
    if (field) fieldCol.set(field, colNumber);
  });
  if (fieldCol.size === 0) return [];

  const cellText = (row: ExcelJS.Row, field: keyof ParsedDevice): string | null => {
    const col = fieldCol.get(field);
    if (!col) return null;
    const v = row.getCell(col).value;
    if (v === null || v === undefined) return null;
    const s = String(typeof v === "object" && "text" in v ? v.text : v).trim();
    return s || null;
  };

  const devices: ParsedDevice[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const device: ParsedDevice = {
      brand: cellText(row, "brand"),
      model: cellText(row, "model"),
      serialNumber: cellText(row, "serialNumber"),
      macAddress: cellText(row, "macAddress"),
      deviceName: cellText(row, "deviceName"),
    };
    if (!device.brand && !device.model && !device.serialNumber && !device.macAddress && !device.deviceName) return;
    devices.push(device);
  });
  return devices;
}
