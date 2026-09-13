import { strFromU8, unzipSync } from "fflate";
import { splitLegacyName } from "../utils/studentName";
import type { NamedStudent } from "../utils/studentName";

export interface ParsedRoster {
  /** Class/period name inferred from the file name, e.g. "Period 1". */
  period: string;
  /** Students in the file's row order (= seating order). */
  students: NamedStudent[];
  /** Original file name, for display. */
  fileName: string;
}

/**
 * Splits a roster name cell into first/last. The column is normally
 * "Last, First" (comma-delimited, unambiguous); a cell with no comma falls
 * back to the same first-space rule used to migrate pre-split records.
 */
export function splitRosterName(raw: string): NamedStudent {
  const s = raw.trim().replace(/\s+/g, " ");
  const comma = s.indexOf(",");
  if (comma === -1) return splitLegacyName(s);
  const lastName = s.slice(0, comma).trim();
  const firstName = s.slice(comma + 1).trim();
  return { firstName, lastName };
}

/** Infer a period name from a file name like "01 Names.xlsx" -> "Period 1". */
export function periodFromFileName(fileName: string): string {
  const m = fileName.match(/\d+/);
  return m ? `Period ${parseInt(m[0], 10)}` : fileName.replace(/\.[^.]+$/, "");
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return Array.from(doc.getElementsByTagName("si")).map((si) =>
    // A <si> may hold one <t> or several (rich text runs); concatenate them.
    Array.from(si.getElementsByTagName("t"))
      .map((t) => t.textContent ?? "")
      .join("")
  );
}

function colLetters(cellRef: string): string {
  return cellRef.replace(/[0-9]+/g, "");
}

function cellText(cell: Element, shared: string[]): string {
  const type = cell.getAttribute("t");
  if (type === "s") {
    const idx = Number(cell.getElementsByTagName("v")[0]?.textContent ?? "");
    return shared[idx] ?? "";
  }
  if (type === "inlineStr") {
    return Array.from(cell.getElementsByTagName("t"))
      .map((t) => t.textContent ?? "")
      .join("");
  }
  return cell.getElementsByTagName("v")[0]?.textContent ?? "";
}

/** Path of the first worksheet inside the xlsx zip. */
function firstSheetPath(files: Record<string, Uint8Array>): string {
  const sheets = Object.keys(files)
    .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
    .sort();
  return sheets[0] ?? "xl/worksheets/sheet1.xml";
}

/**
 * Parse an xlsx roster file into an ordered list of students.
 *
 * Format handled: a single sheet with a header row; the column whose header
 * contains "name" holds the students (falls back to column A). Names are
 * normally "Last, First" and are split into first/last on the comma.
 */
export async function parseRosterFile(file: File): Promise<ParsedRoster> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(bytes);

  const shared = parseSharedStrings(
    files["xl/sharedStrings.xml"] ? strFromU8(files["xl/sharedStrings.xml"]) : undefined
  );

  const sheetXml = strFromU8(files[firstSheetPath(files)]);
  const doc = new DOMParser().parseFromString(sheetXml, "application/xml");
  const rows = Array.from(doc.getElementsByTagName("row"));
  if (rows.length === 0) {
    return { period: periodFromFileName(file.name), students: [], fileName: file.name };
  }

  // Locate the name column from the header row (else default to column A).
  let nameCol = "A";
  const headerCells = Array.from(rows[0].getElementsByTagName("c"));
  for (const cell of headerCells) {
    if (cellText(cell, shared).trim().toLowerCase().includes("name")) {
      nameCol = colLetters(cell.getAttribute("r") ?? "A");
      break;
    }
  }

  const students: NamedStudent[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cell = Array.from(rows[i].getElementsByTagName("c")).find(
      (c) => colLetters(c.getAttribute("r") ?? "") === nameCol
    );
    const raw = cell ? cellText(cell, shared).trim() : "";
    if (raw) students.push(splitRosterName(raw));
  }

  return { period: periodFromFileName(file.name), students, fileName: file.name };
}

/** Parse several roster files, sorted by period name for a stable order. */
export async function parseRosterFiles(fileList: File[]): Promise<ParsedRoster[]> {
  const parsed = await Promise.all(fileList.map(parseRosterFile));
  return parsed.sort((a, b) => a.period.localeCompare(b.period, undefined, { numeric: true }));
}
