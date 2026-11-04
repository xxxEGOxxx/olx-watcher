import { costBreakdown, type Listing } from "../listing.ts";
import { formatPln, type Grosze } from "../money.ts";

/** Telegram HTML parse mode: only &, < and > need escaping. */
export function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

const money = (value: Grosze | null) => (value === null ? "—" : formatPln(value));

export function formatListing(listing: Listing): string {
  const cost = costBreakdown(listing);
  const { location } = listing;
  const place = [location.city, location.district].filter(Boolean).join(", ");
  const facts = [
    listing.rooms ? `${listing.rooms} комн.` : null,
    listing.areaM2 ? `${listing.areaM2} м²` : null,
    listing.isAgency === null ? null : listing.isAgency ? "агентство" : "собственник",
  ].filter(Boolean);

  const fee =
    listing.agencyFee.kind === "percent"
      ? `${money(cost.agencyFee)} (${listing.agencyFee.percent}%)`
      : money(cost.agencyFee);

  const lines = [
    `<b>${escapeHtml(listing.title)}</b>`,
    [place, ...facts]
      .filter((part): part is string => Boolean(part))
      .map(escapeHtml)
      .join(" · "),
    "",
    `💰 <b>В месяц: ${money(cost.monthly)}</b>`,
    `   аренда ${money(listing.price)} + czynsz ${money(listing.adminRent)} + media ${money(listing.utilities)}`,
    `🔑 <b>На въезд: ${money(cost.moveIn)}</b>`,
    `   kaucja ${money(listing.deposit)} · prowizja ${fee}`,
  ];
  if (cost.missing.length > 0) {
    lines.push(`⚠️ Не указано: ${escapeHtml(cost.missing.join(", "))}`);
  }
  if (location.lat !== null && location.lon !== null) {
    const maps = `https://www.google.com/maps?q=${location.lat},${location.lon}`;
    lines.push(`📍 <a href="${maps}">Карта</a>${location.approximate ? " (примерно)" : ""}`);
  }
  lines.push(`🔗 <a href="${escapeHtml(listing.url)}">Объявление</a>`);
  return lines.join("\n");
}
