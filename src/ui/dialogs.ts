import { $ } from "./dom";
import { noticeList } from "./notices";

type InfoPage = {
  title: string;
  points: { label: string; text: string }[];
  details?: { label: string; text: string }[];
};
const pages: Record<string, InfoPage> = {
  privacy: {
    title: "Privacy",
    points: [
      {
        label: "Files",
        text: "Parsed in your browser. No document backend, accounts or analytics.",
      },
      {
        label: "AI requests",
        text: "Selected excerpts and reviewed concepts go directly to your selected AI provider. Its retention policies apply.",
      },
      {
        label: "Local history",
        text: "Drafts, parsed text, settings and graphs stay in this browser. Original files and API keys are not saved.",
      },
      {
        label: "Your control",
        text: "Resume or delete work in History. Exports include source quotes; check them before sharing.",
      },
    ],
    details: [
      {
        label: "OCR",
        text: "English language data downloads from tessdata.projectnaptha.com. Page images are processed locally.",
      },
      {
        label: "Hosting",
        text: "The hosting service may keep ordinary site access logs.",
      },
    ],
  },
  security: {
    title: "API key security",
    points: [
      {
        label: "Memory only",
        text: "Your key stays in this tab and is cleared on refresh.",
      },
      {
        label: "Never saved",
        text: "No key in browser storage, History, exports or diagnostics. Older saved keys are removed.",
      },
      {
        label: "Provider only",
        text: "Sent in request headers to your chosen provider. Use a trusted device and endpoint.",
      },
    ],
    details: [
      {
        label: "Browser access",
        text: "Same-origin scripts and browser extensions may access tab memory.",
      },
      {
        label: "Custom endpoints",
        text: "Receive your key and selected excerpts. Choose one you trust.",
      },
      {
        label: "Rate limits",
        text: "Requests are paced. Rejected keys stop the run; provider cooldowns are observed without automatic retries. Shared account usage can still cause limits.",
      },
    ],
  },
  license: {
    title: "Code permissions",
    points: [
      {
        label: "App and graphs",
        text: "You may use the hosted app and the graphs you generate.",
      },
      {
        label: "Original source",
        text: "Reusing, modifying or redistributing the source requires prior written permission from Ronit Gandotra. See LICENSE in the repository.",
      },
      {
        label: "Other rights",
        text: "Third-party and legacy materials keep their own terms. GitHub viewing/forking rights and applicable legal rights remain unaffected.",
      },
    ],
  },
  terms: {
    title: "Terms of use",
    points: [
      {
        label: "Review evidence",
        text: "AI and OCR can be wrong. A matching quote does not prove a claim or interpretation. Check the original paper.",
      },
      {
        label: "Your responsibility",
        text: "You are responsible for document permissions, API usage, provider charges and exports.",
      },
      {
        label: "Keep a copy",
        text: "Clearing site data can erase local work. Export important analyses.",
      },
    ],
    details: [
      {
        label: "Research tool",
        text: "Provided as-is; not medical, legal or financial advice. Model confidence is not a calibrated probability.",
      },
      {
        label: "Source licensing",
        text: "See LICENSE in the repository for source code terms.",
      },
    ],
  },
};
export function showInfo(name: string) {
  const page = pages[name];
  if (!page) return;
  const dialog = $<HTMLDialogElement>("#info-dialog");
  $("h2", dialog).textContent = page.title;
  $(".info-content", dialog).innerHTML =
    noticeList(page.points) +
    (page.details
      ? `<details class="notice-details"><summary>More details</summary>${noticeList(page.details)}</details>`
      : "");
  dialog.showModal();
}
