import { escapeHTML as esc } from "./dom";

/** Short, labeled facts for notices and expanded explanations. */
export function noticeList(items: { label: string; text: string }[]) {
  return `<dl class="notice-list">${items.map(({ label, text }) => `<div><dt>${esc(label)}</dt><dd>${esc(text)}</dd></div>`).join("")}</dl>`;
}

/** Keep the actionable first sentence visible; retain longer context on demand. */
export function statusNotice(text: string, error = false) {
  const split = text.indexOf(". ");
  const compact = text.length > 180 && split >= 0 && split < 180;
  const main = compact ? text.slice(0, split + 1) : text;
  const extra = compact ? text.slice(split + 2) : "";
  return `<span class="notice-kind">${error ? "Action needed" : "Update"}</span><span class="notice-message">${esc(main)}</span>${extra ? `<details class="notice-details"><summary>Details</summary><p>${esc(extra)}</p></details>` : ""}`;
}
