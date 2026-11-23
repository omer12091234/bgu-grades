// Low-level helpers for talking to BGU's Oracle-era servers, which speak Windows-1255.

/** Encode a string as Windows-1255 and percent-escape it for a form body. */
export function encodeCp1255(value: string): string {
  // Normalise Hebrew punctuation users may paste in.
  const s = value.replace(/[״]/g, '"').replace(/[׳]/g, "'");
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    let byte: number | null = null;
    if (cp < 0x80) byte = cp;
    else if (cp >= 0x05d0 && cp <= 0x05ea) byte = cp - 0x05d0 + 0xe0; // א..ת
    if (byte === null) continue; // drop characters the server can't represent
    const c = String.fromCharCode(byte);
    out += /[A-Za-z0-9\-_.~]/.test(c) ? c : byte === 0x20 ? "+" : "%" + byte.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

export function formBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${k}=${encodeCp1255(v)}`)
    .join("&");
}

export function decodeCp1255(buf: ArrayBuffer): string {
  return new TextDecoder("windows-1255").decode(buf);
}

export function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/** Strip tags and HTML entities, collapse whitespace. */
export function cleanText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * BGU academic year: the year in which the academic year ends.
 * October 2026 onward is year 2027 (תשפ"ז).
 */
export function currentAcademicYear(now = new Date()): number {
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}
