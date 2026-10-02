import { appShell } from "./ui/shell";
import { setupResearchScene } from "./ui/scene";
import "./style.css";
import "./ui/presentation.css";
import "./graph/viewer.css";
import { $, escapeHTML as esc, readableError } from "./ui/dom";
import { Workspace } from "./ui/workspace";
import { showInfo } from "./ui/dialogs";
import { demoAnalysis } from "./ui/demo";
import type { GraphViewer } from "./graph/viewer";
import { history } from "./storage/history";
import { drafts, type Draft } from "./storage/drafts";
import type { Analysis } from "./types";
import { exportAnalysis } from "./graph/export";
let theme: "dark" | "light" = "dark";
try {
  theme =
    localStorage.getItem("evidence-atlas-theme") === "light" ? "light" : "dark";
} catch {}
document.documentElement.dataset.theme = theme;
$("#app").innerHTML = appShell;
setupResearchScene();
const workspace = new Workspace($("#workspace"), () => void renderHistory());
let demo: GraphViewer | null = null;
type View = "home" | "workspace" | "sample";
let sampleReturn: View = "home";
function showView(view: View, updateHash = true) {
  const previous = document.documentElement.dataset.view;
  document.documentElement.dataset.view = view;
  $("#home").hidden = view !== "home";
  $("#workspace").hidden = view !== "workspace";
  $("#demo-section").hidden = view !== "sample";
  closeMenu();
  if (previous !== view) window.scrollTo({ top: 0, behavior: "instant" });
  if (updateHash && location.hash !== "#" + view)
    window.history.pushState(null, "", "#" + view);
}
function route() {
  if (location.hash === "#sample") void openDemo(false);
  else showView(location.hash === "#workspace" ? "workspace" : "home", false);
}
window.addEventListener("hashchange", route);
window.addEventListener("popstate", route);
route();

function closeMenu() {
  $("#app-menu").hidden = true;
  $("#menu-toggle").setAttribute("aria-expanded", "false");
}
$("#menu-toggle").addEventListener("click", () => {
  const menu = $("#app-menu");
  menu.hidden = !menu.hidden;
  $("#menu-toggle").setAttribute("aria-expanded", String(!menu.hidden));
});
document.addEventListener("pointerdown", (event) => {
  if (!(event.target as Element).closest("#app-menu, #menu-toggle"))
    closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});
$("#new-analysis").addEventListener("click", async () => {
  try {
    await workspace.newAnalysis();
    showView("workspace");
  } catch (error) {
    $("#draft-state").textContent = readableError(error);
  }
});
async function openDemo(updateHash = true) {
  if (document.documentElement.dataset.view !== "sample")
    sampleReturn =
      document.documentElement.dataset.view === "workspace"
        ? "workspace"
        : "home";
  showView("sample", updateHash);
  $("#close-demo").textContent =
    sampleReturn === "home" ? "Back to homepage" : "Back to my work";
  if (!demo) {
    const a = demoAnalysis();
    a.settings.theme = theme;
    const { GraphViewer } = await import("./graph/viewer");
    demo = new GraphViewer($("#demo-graph"), a);
  }
}
$("#explore-demo").addEventListener("click", () => void openDemo());
$("#home-demo").addEventListener("click", () => void openDemo());
$("#close-demo").addEventListener("click", () => {
  showView(sampleReturn);
  demo?.destroy();
  demo = null;
});
function themeLabel() {
  $("#home-theme").setAttribute(
    "aria-label",
    `Switch to ${theme === "dark" ? "light" : "dark"} mode`,
  );
  $("#theme-toggle").textContent =
    `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
}
themeLabel();
function toggleTheme() {
  theme = theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  workspace.setTheme(theme);
  demo?.setTheme(theme);
  themeLabel();
  closeMenu();
  try {
    localStorage.setItem("evidence-atlas-theme", theme);
  } catch {}
}
$("#theme-toggle").addEventListener("click", toggleTheme);
$("#home-theme").addEventListener("click", toggleTheme);
document.querySelectorAll<HTMLElement>("[data-info]").forEach((b) =>
  b.addEventListener("click", () => {
    closeMenu();
    showInfo(b.dataset.info!);
  }),
);
$(".dialog-close").addEventListener("click", () =>
  $<HTMLDialogElement>("#info-dialog").close(),
);
$("#info-dialog").addEventListener("click", (e) => {
  if (e.target === $("#info-dialog"))
    $<HTMLDialogElement>("#info-dialog").close();
});
type LibraryItem = {
  id: string;
  name: string;
  updated: string;
  draft?: Draft;
  analysis?: Analysis;
};
let library: LibraryItem[] = [],
  page = 0;
const pageSize = 6;
async function renderHistory() {
  try {
    const [saved, ongoing] = await Promise.all([history.list(), drafts.list()]);
    const items = new Map<string, LibraryItem>(
      saved.map((a) => [
        a.id,
        { id: a.id, name: a.name, updated: a.createdAt, analysis: a },
      ]),
    );
    for (const d of ongoing)
      items.set(d.id, {
        id: d.id,
        name: d.name,
        updated: d.updatedAt,
        draft: d,
        analysis: d.analysis || undefined,
      });
    library = [...items.values()].sort((a, b) =>
      b.updated.localeCompare(a.updated),
    );
    renderLibraryPage();
  } catch (e) {
    $("#history-items").textContent = readableError(e);
  }
}
function renderLibraryPage() {
  page = Math.min(page, Math.max(0, Math.ceil(library.length / pageSize) - 1));
  $("#history-items").innerHTML = library.length
    ? library
        .slice(page * pageSize, (page + 1) * pageSize)
        .map(
          (item) =>
            `<article class="history-card"><div><h3>${esc(item.name)}</h3><span class="history-status">${item.draft?.status === "ongoing" || item.analysis?.state === "paused" || item.analysis?.state === "building" || !item.analysis ? "Ongoing" : "Complete"}</span><p>${item.analysis ? item.analysis.graph.nodes.length + " concepts · " + item.analysis.graph.edges.length + " relationships" : "Step " + ((item.draft?.step || 0) + 1) + " · Your progress is saved"}</p><small>${new Date(item.updated).toLocaleString()}</small></div><div class="history-actions"><button class="button secondary small" data-open="${esc(item.id)}">${item.draft?.status === "ongoing" || !item.analysis ? "Resume" : "Open"} →</button>${item.analysis ? `<button class="text-button" data-export="${esc(item.id)}">Export</button>` : ""}<button class="text-button" data-delete="${esc(item.id)}" aria-label="Delete ${esc(item.name)}">Delete</button></div></article>`,
        )
        .join("")
    : '<div class="empty-history"><p>Your next discovery starts here.</p><small>Unfinished work and completed graphs appear automatically.</small></div>';
  $("#history-page").textContent =
    `${library.length ? page + 1 : 0} / ${Math.ceil(library.length / pageSize)}`;
  $<HTMLButtonElement>("#history-prev").disabled = page === 0;
  $<HTMLButtonElement>("#history-next").disabled =
    (page + 1) * pageSize >= library.length;
  $<HTMLButtonElement>("#clear-history").disabled = !library.length;
}
async function openHistory() {
  closeMenu();
  await workspace.flushDraft().catch(() => {});
  await renderHistory();
  $<HTMLDialogElement>("#history-dialog").showModal();
}
$("#show-history").addEventListener("click", () => void openHistory());
document
  .querySelectorAll("[data-history]")
  .forEach((button) =>
    button.addEventListener("click", () => void openHistory()),
  );
$("#close-history").addEventListener("click", () =>
  $<HTMLDialogElement>("#history-dialog").close(),
);
$("#history-prev").addEventListener("click", () => {
  page--;
  renderLibraryPage();
});
$("#history-next").addEventListener("click", () => {
  page++;
  renderLibraryPage();
});
$("#history-items").addEventListener("click", async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>(
    "[data-open],[data-delete],[data-export]",
  );
  if (!b || workspace.isBusy) return;
  const id = b.dataset.open || b.dataset.delete || b.dataset.export,
    item = library.find((i) => i.id === id);
  if (!item) return;
  try {
    if (b.dataset.delete) {
      if (workspace.currentId === item.id) await workspace.newAnalysis();
      await Promise.all([history.remove(item.id), drafts.remove(item.id)]);
      await renderHistory();
      return;
    }
    if (b.dataset.open) {
      if (item.draft) await workspace.resume(item.draft);
      else if (item.analysis) await workspace.openSaved(item.analysis);
      showView("workspace");
      $<HTMLDialogElement>("#history-dialog").close();
    }
    if (b.dataset.export && item.analysis)
      await exportAnalysis(item.analysis, "json");
  } catch (error) {
    $("#history-items").textContent = readableError(error);
  }
});
$("#clear-history").addEventListener("click", () =>
  $<HTMLDialogElement>("#confirm-dialog").showModal(),
);
$("#cancel-delete").addEventListener("click", () =>
  $<HTMLDialogElement>("#confirm-dialog").close(),
);
$("#confirm-delete").addEventListener("click", async () => {
  try {
    await workspace.newAnalysis();
    await Promise.all([history.clear(), drafts.clear()]);
    await renderHistory();
  } catch (error) {
    $("#history-items").textContent = readableError(error);
  } finally {
    $<HTMLDialogElement>("#confirm-dialog").close();
  }
});
void renderHistory();
