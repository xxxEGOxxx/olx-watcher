import type { AgencyFee } from "./listing.ts";
import { type Grosze, parsePln } from "./money.ts";

/**
 * Costs that Polish rental listings usually state only in free text.
 * Structured fields from the source always win over these heuristics.
 */
export type DescriptionCosts = {
  adminRent: Grosze | null;
  utilities: Grosze | null;
  deposit: Grosze | null;
  agencyFee: AgencyFee;
};

const AMOUNT_AFTER = String.raw`[^\d\n]{0,40}?(\d[\d  .]*(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln)`;

const DEPOSIT = new RegExp(String.raw`kaucj\p{L}*${AMOUNT_AFTER}`, "iu");
// "czynsz" alone often means the rent itself, so require the admin wording or a "+ czynsz" add-on.
const ADMIN_RENT = new RegExp(
  String.raw`(?:czynsz\p{L}*\s+(?:administracyjn|do\s+wsp\p{L}*|do\s+sp\p{L}*)\p{L}*|\+\s*czynsz\p{L}*)${AMOUNT_AFTER}`,
  "iu",
);
const UTILITIES = new RegExp(String.raw`media(?!\s+(?:w\s+cenie|wliczon))${AMOUNT_AFTER}`, "iu");
const FEE_AMOUNT = new RegExp(String.raw`prowizj\p{L}*${AMOUNT_AFTER}`, "iu");
const FEE_PERCENT = /prowizj\p{L}*[^\d\n]{0,30}?(\d{1,3}(?:[.,]\d+)?)\s*%/iu;
const NO_FEE =
  /(bez\s+prowizji|brak\s+prowizji|0\s*%\s*prowizji|prowizj\p{L}*\s*:?\s*(?:0\s*%|0\s*zł|brak|nie\s+pobieramy))/iu;

// "czynsz administracyjny (w tym wszystkie media)", "media wliczone": nothing extra to pay.
const UTILITIES_INCLUDED =
  /(w\s+tym\s+(?:wszystkie\s+)?media|media\s+(?:s[aą]\s+)?(?:w\s+cenie|wliczon)|z\s+mediami)/iu;

export function extractDescriptionCosts(description: string): DescriptionCosts {
  return {
    adminRent: amount(ADMIN_RENT, description),
    utilities: amount(UTILITIES, description) ?? (UTILITIES_INCLUDED.test(description) ? 0 : null),
    deposit: amount(DEPOSIT, description),
    agencyFee: agencyFee(description),
  };
}

function amount(pattern: RegExp, text: string): Grosze | null {
  const match = pattern.exec(text);
  return match?.[1] ? parsePln(match[1]) : null;
}

function agencyFee(text: string): AgencyFee {
  if (NO_FEE.test(text)) return { kind: "none" };
  const percent = FEE_PERCENT.exec(text);
  if (percent?.[1]) return { kind: "percent", percent: Number(percent[1].replace(",", ".")) };
  const fixed = amount(FEE_AMOUNT, text);
  if (fixed !== null) return { kind: "amount", amount: fixed };
  return { kind: "unknown" };
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"' };

/** Listing descriptions arrive as HTML; costs and messages need plain text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>\r?\n?|<\/p>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot);/g, (_, name: string) => ENTITIES[name] ?? "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
