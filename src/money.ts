/**
 * Money is integer grosze (1 PLN = 100 grosze). Never store or add złoty as floats.
 */
export type Grosze = number;

const AMOUNT = /(\d{1,3}(?:[  .]\d{3})+|\d+)(?:[.,](\d{1,2}))?/;

/** Parses "2 500 zł", "2.500,50", "2500" into grosze; returns null when no amount is present. */
export function parsePln(text: string): Grosze | null {
  const match = AMOUNT.exec(text);
  if (!match?.[1]) return null;
  const whole = Number.parseInt(match[1].replace(/[  .]/g, ""), 10);
  const fraction = match[2] ? Number.parseInt(match[2].padEnd(2, "0"), 10) : 0;
  if (!Number.isSafeInteger(whole)) return null;
  return whole * 100 + fraction;
}

/** Converts an OLX numeric price (whole złoty, possibly fractional) to grosze without float drift. */
export function plnToGrosze(pln: number): Grosze {
  return Math.round(pln * 100);
}

/** Formats grosze as "2 500 zł" (or "2 500,50 zł" when there is a fractional part). */
export function formatPln(grosze: Grosze): string {
  const sign = grosze < 0 ? "-" : "";
  const abs = Math.abs(grosze);
  const whole = Math.trunc(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const fraction = abs % 100;
  return `${sign}${whole}${fraction ? `,${fraction.toString().padStart(2, "0")}` : ""} zł`;
}

/** Percentage of an amount, rounded to whole grosze. */
export function percentOf(grosze: Grosze, percent: number): Grosze {
  return Math.round((grosze * percent) / 100);
}
