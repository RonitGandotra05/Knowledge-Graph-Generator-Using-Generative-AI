import { $ } from "./dom";
const pages: Record<string, { title: string; text: string }> = {
  privacy: {
    title: "Privacy, in plain language",
    text: "Files are parsed in your browser. The application has no document storage backend, accounts, or analytics. When you run AI discovery or extraction, the previewed excerpts and reviewed concepts go directly to your selected AI provider. That provider has its own data retention and usage policies. Local history stores unfinished drafts, parsed document text, your focus and settings, graphs, source paragraphs, and metadata in IndexedDB in this browser. It does not store the original file or API key. Use History in the menu to resume or delete your work. Exported graphs contain quotations from your document; share them thoughtfully. Automatic local OCR downloads English language data from tessdata.projectnaptha.com; page images are processed locally. A static hosting service may collect ordinary access logs when you visit the site.",
  },
  security: {
    title: "Your API key, your control",
    text: "API keys stay in this tab’s memory and are cleared on refresh. They are never saved to localStorage, sessionStorage, IndexedDB, history, exports, or diagnostics. Keys remembered by older versions are removed when the app opens. Your key is sent only in request headers to the provider you choose. Scripts on the same origin and browser extensions may access browser memory; use a trusted device. A compatible endpoint receives your key and selected excerpts, so choose an endpoint you trust. Groq and recognized compatible providers use smaller request budgets and per-tab pacing. Account quotas and other usage can still cause limits; the app stops on rejected keys and observes provider cooldowns without automatic retries.",
  },
  license: {
    title: "Source code permissions",
    text: "You may use the hosted application and the knowledge graphs you generate. Reusing, modifying or redistributing Evidence Atlas’s original source code requires prior written permission from Ronit Gandotra. Third-party libraries and legacy materials retain their own rights and terms. Public GitHub viewing/forking rights and applicable legal rights remain unaffected. See LICENSE in the repository and contact its maintainer for permission.",
  },
  terms: {
    title: "Terms of use",
    text: "Evidence Atlas is a research exploration tool provided as-is. AI output and OCR can be wrong. A validated quotation establishes that the text was in the selected context; it does not prove the scientific claim or the model interpretation is correct. Model confidence is not a calibrated probability. Review the original paper before relying on a relationship. This tool is not medical, legal, or financial advice. You are responsible for permission to process documents, third-party API usage, provider charges, and any exported content. Browser history can be lost if you clear site data; export important analyses. Source code licensing is described in the repository.",
  },
  how: {
    title: "From document to evidence",
    text: "Upload up to ten papers, optionally describe your focus, and connect your AI provider in one workspace. Native PDF text is read locally; scanned pages use automatic English OCR. Check the estimated tokens, provider cost and duration, then build. AI reviews bounded sections across research disciplines and identifies concepts and supported relationships. The graph grows as results are validated, with quoted sources, paragraphs and original PDF page indices. Layout, editing, image export and self-contained HTML are local. Returning to the homepage does not stop an active analysis. Drafts save automatically; New graph preserves previous work in History. Refresh clears your API key but retains saved progress.",
  },
};
export function showInfo(name: string) {
  const page = pages[name];
  if (!page) return;
  const dialog = $<HTMLDialogElement>("#info-dialog");
  $("h2", dialog).textContent = page.title;
  $("p", dialog).textContent = page.text;
  dialog.showModal();
}
