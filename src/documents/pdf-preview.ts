import * as pdfjs from "pdfjs-dist";
import workerText from "pdfjs-dist/build/pdf.worker.min.mjs?raw";
import type { PaperRecord, Passage, PDFLine } from "../types";
import { locatePDFQuote } from "./pdf-location";

export interface PDFPreviewOptions {
  files?: Map<string, File | Blob>;
  load?: (paperId: string) => Promise<Blob | null>;
}
class PreviewInputError extends Error {}
let workerURL: string | undefined;
function prepareWorker() {
  if (!workerURL)
    workerURL = URL.createObjectURL(
      new Blob([workerText], { type: "text/javascript" }),
    );
  pdfjs.GlobalWorkerOptions.workerSrc = workerURL;
}

export class PDFPreview {
  private dialog: HTMLDialogElement;
  private generation = 0;
  private task: pdfjs.PDFDocumentLoadingTask | null = null;
  private source: Passage | null = null;
  private paper: PaperRecord | undefined;
  private quote = "";
  private zoom = 1;
  private page: pdfjs.PDFPageProxy | null = null;
  private highlights: PDFLine[] = [];
  private rendering: pdfjs.RenderTask | null = null;
  private files: Map<string, File | Blob>;
  private returnFocus: HTMLElement | null = null;
  private events = new AbortController();
  constructor(
    private host: HTMLElement,
    private options: PDFPreviewOptions = {},
  ) {
    this.files = options.files || new Map();
    this.dialog = document.createElement("dialog");
    this.dialog.className = "pdf-preview";
    this.dialog.setAttribute("aria-label", "Source PDF preview");
    this.dialog.innerHTML = `<div class="pdf-preview-header"><div><span class="inspector-eyebrow">SOURCE PDF</span><h3></h3><p class="pdf-preview-location"></p></div><button data-pdf-action="close" aria-label="Close PDF preview">×</button></div><div class="pdf-preview-zoom" aria-label="PDF zoom controls"><button data-pdf-action="zoom-out" aria-label="Zoom PDF out">−</button><output aria-label="PDF zoom">100%</output><button data-pdf-action="zoom-in" aria-label="Zoom PDF in">+</button><button data-pdf-action="fit">Fit width</button></div><p class="pdf-preview-status" role="status"></p><div class="pdf-preview-attach"><button data-pdf-action="choose">Choose source PDF</button><input type="file" accept="application/pdf,.pdf" aria-label="Source PDF" hidden></div><div class="pdf-preview-scroll" tabindex="0" aria-label="PDF page preview"><div class="pdf-preview-page"><canvas aria-label="Original PDF page"></canvas><div class="pdf-highlights" aria-hidden="true"></div></div></div>`;
    host.append(this.dialog);
    const scroll = this.dialog.querySelector<HTMLElement>(
      ".pdf-preview-scroll",
    )!;
    let drag: {
      id: number;
      x: number;
      y: number;
      left: number;
      top: number;
    } | null = null;
    scroll.addEventListener(
      "pointerdown",
      (event) => {
        if (
          event.pointerType !== "mouse" ||
          event.button !== 0 ||
          !(event.target as HTMLElement).closest(".pdf-preview-page")
        )
          return;
        drag = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: scroll.scrollLeft,
          top: scroll.scrollTop,
        };
        scroll.setPointerCapture(event.pointerId);
        scroll.classList.add("is-panning");
        event.preventDefault();
      },
      { signal: this.events.signal },
    );
    scroll.addEventListener(
      "pointermove",
      (event) => {
        if (drag?.id !== event.pointerId) return;
        scroll.scrollLeft = drag.left + drag.x - event.clientX;
        scroll.scrollTop = drag.top + drag.y - event.clientY;
      },
      { signal: this.events.signal },
    );
    const endPan = () => {
      drag = null;
      scroll.classList.remove("is-panning");
    };
    scroll.addEventListener("pointerup", endPan, {
      signal: this.events.signal,
    });
    scroll.addEventListener("pointercancel", endPan, {
      signal: this.events.signal,
    });
    this.dialog.addEventListener(
      "cancel",
      (event) => {
        event.preventDefault();
        this.close();
      },
      { signal: this.events.signal },
    );
    this.dialog.addEventListener(
      "click",
      (event) => {
        const action = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-pdf-action]",
        )?.dataset.pdfAction;
        if (action === "close") this.close();
        if (
          ["zoom-in", "zoom-out", "fit"].includes(action || "") &&
          this.page
        ) {
          this.zoom =
            action === "fit"
              ? 1
              : Math.max(
                  1,
                  Math.min(4, this.zoom + (action === "zoom-in" ? 0.5 : -0.5)),
                );
          void this.paint(this.page, this.highlights, ++this.generation);
        }
        if (action === "choose")
          this.dialog.querySelector<HTMLInputElement>("input")!.click();
        if (event.target === this.dialog) {
          const box = this.dialog.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            this.close();
        }
      },
      { signal: this.events.signal },
    );
    this.dialog.querySelector<HTMLInputElement>("input")!.addEventListener(
      "change",
      (event) => {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (file) void this.render(file, ++this.generation);
      },
      { signal: this.events.signal },
    );
  }
  get isOpen() {
    return this.dialog.open;
  }
  async open(source: Passage, quote: string, paper?: PaperRecord) {
    this.returnFocus = this.host.querySelector<HTMLElement>(".evidence-panel");
    this.source = source;
    this.paper = paper;
    this.quote = quote;
    this.page = null;
    this.zoom = 1;
    const generation = ++this.generation;
    this.dialog.querySelector("h3")!.textContent =
      source.paperName || paper?.name || "Source paper";
    this.dialog.querySelector(".pdf-preview-location")!.textContent =
      `PDF page ${source.page} · ${source.section}`;
    this.dialog.querySelector<HTMLElement>(".pdf-preview-scroll")!.hidden =
      true;
    this.dialog.showModal();
    this.status("Opening the cited PDF page…");
    let file = this.files.get(source.paperId || "single");
    try {
      if (!file && this.options.load)
        file =
          (await this.options.load(source.paperId || "single")) || undefined;
      if (generation !== this.generation) return;
      if (file) await this.render(file, generation);
      else
        this.status(
          "Choose the original PDF to preview this line here. The file stays local.",
          true,
        );
    } catch {
      if (generation === this.generation)
        this.status("Choose the original PDF to preview this source.", true);
    }
  }
  private status(text: string, attach = false) {
    this.dialog.querySelector(".pdf-preview-status")!.textContent = text;
    this.dialog.querySelector<HTMLElement>(".pdf-preview-attach")!.hidden =
      !attach;
  }
  private setBusy(value: boolean) {
    this.dialog.setAttribute("aria-busy", String(value));
    this.dialog
      .querySelectorAll<HTMLButtonElement>(".pdf-preview-zoom button")
      .forEach((button) => {
        button.disabled = value;
      });
  }
  private async render(file: File | Blob, generation: number) {
    const source = this.source!;
    const scroll = this.dialog.querySelector<HTMLElement>(
      ".pdf-preview-scroll",
    )!;
    scroll.hidden = true;
    this.page = null;
    this.setBusy(true);
    this.status("Opening the cited PDF page…");
    const previous = this.task;
    this.task = null;
    try {
      await previous?.destroy();
      if (file.size > 30 * 1024 * 1024)
        throw new PreviewInputError("Choose a PDF smaller than 30 MB.");
      const bytes = await file.arrayBuffer();
      if (generation !== this.generation) return;
      if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-"))
        throw new PreviewInputError(
          "This file is not a valid PDF. Choose the original paper.",
        );
      if (this.paper?.fingerprint) {
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const hash = Array.from(new Uint8Array(digest), (n) =>
          n.toString(16).padStart(2, "0"),
        ).join("");
        if (hash !== this.paper.fingerprint)
          throw new PreviewInputError(
            "This is a different PDF. Choose the original source paper.",
          );
      } else if (
        file instanceof File &&
        source.paperName &&
        file.name !== source.paperName
      ) {
        throw new PreviewInputError(
          `Choose ${source.paperName} to preview this source.`,
        );
      }
      if (generation !== this.generation) return;
      prepareWorker();
      const task = pdfjs.getDocument({
        data: new Uint8Array(bytes),
        useSystemFonts: true,
      });
      this.task = task;
      const pdf = await task.promise;
      if (generation !== this.generation) return;
      if (!source.page || source.page > pdf.numPages || pdf.numPages > 500)
        throw new PreviewInputError(
          "The cited page is not available in this PDF. Choose the original paper.",
        );
      const page = await pdf.getPage(source.page);
      const native = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const nativeLines: PDFLine[] = content.items.flatMap((item) => {
        if (!("str" in item) || !item.str.trim()) return [];
        const transform = pdfjs.Util.transform(
          native.transform,
          item.transform,
        );
        const height = Math.hypot(transform[2], transform[3]);
        return [
          {
            text: item.str,
            x: transform[4] / native.width,
            y: (transform[5] - height) / native.height,
            width: item.width / native.width,
            height: height / native.height,
          },
        ];
      });
      const matches = locatePDFQuote(nativeLines, this.quote);
      const highlights = matches.length
        ? matches
        : locatePDFQuote(source.pdfLines || [], this.quote);
      if (generation !== this.generation) return;
      this.page = page;
      this.highlights = highlights;
      this.zoom = nativeLines.length ? 1 : window.innerWidth < 600 ? 3 : 2;
      await this.paint(page, highlights, generation);
      if (generation !== this.generation) return;
      this.dialog.querySelector(".pdf-preview-location")!.textContent =
        `PDF page ${source.page} of ${pdf.numPages} · ${source.section}`;
      this.status(
        highlights.length
          ? "Supporting lines highlighted. Drag to pan or zoom for more detail."
          : "Showing the cited page. Exact line highlighting is unavailable for this saved source.",
      );
      this.files.set(source.paperId || "single", file);
      this.dialog.dataset.page = String(source.page);
    } catch (error) {
      if (generation !== this.generation) return;
      scroll.hidden = true;
      this.status(
        error instanceof PreviewInputError
          ? error.message
          : error instanceof Error && error.name === "PasswordException"
            ? "This PDF needs a password. Choose an unlocked copy."
            : "Could not preview this PDF. Choose the original paper or reopen the preview.",
        true,
      );
    } finally {
      if (generation === this.generation) this.setBusy(false);
    }
  }
  private async paint(
    page: pdfjs.PDFPageProxy,
    highlights: PDFLine[],
    generation: number,
  ) {
    const previous = this.rendering;
    previous?.cancel();
    await previous?.promise.catch(() => {});
    if (generation !== this.generation) return;
    const scroll = this.dialog.querySelector<HTMLElement>(
      ".pdf-preview-scroll",
    )!;
    scroll.hidden = false;
    const pageBox =
      this.dialog.querySelector<HTMLElement>(".pdf-preview-page")!;
    pageBox.style.width = `${this.zoom * 100}%`;
    const native = page.getViewport({ scale: 1 });
    const width = (scroll.clientWidth - 24) * this.zoom;
    const scale = Math.min(
      (Math.min(2, window.devicePixelRatio || 1) * width) / native.width,
      Math.sqrt(8_000_000 / (native.width * native.height)),
    );
    const viewport = page.getViewport({ scale });
    const canvas = this.dialog.querySelector("canvas")!;
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context)
      throw new PreviewInputError(
        "PDF rendering is unavailable in this browser.",
      );
    this.dialog.querySelector(".pdf-highlights")!.innerHTML = "";
    this.rendering = page.render({ canvas, canvasContext: context, viewport });
    try {
      await this.rendering.promise;
    } catch (error) {
      if (
        generation !== this.generation ||
        (error as Error).name === "RenderingCancelledException"
      )
        return;
      this.status("Could not render this page. Try reopening the preview.");
      return;
    }
    if (generation !== this.generation) return;
    this.dialog.querySelector(".pdf-highlights")!.innerHTML = highlights
      .map(
        (line) =>
          `<span class="pdf-highlight" style="left:${line.x * 100}%;top:${line.y * 100}%;width:${line.width * 100}%;height:${line.height * 100}%"></span>`,
      )
      .join("");
    this.dialog.querySelector("output")!.textContent =
      `${Math.round(this.zoom * 100)}%`;
    const first = highlights[0];
    scroll.scrollTop = first
      ? Math.max(
          0,
          first.y * canvas.getBoundingClientRect().height -
            scroll.clientHeight * 0.35,
        )
      : 0;
    scroll.scrollLeft = first
      ? Math.max(0, first.x * canvas.getBoundingClientRect().width - 12)
      : 0;
  }
  close() {
    ++this.generation;
    this.rendering?.cancel();
    this.page = null;
    if (this.dialog.open) this.dialog.close();
    void this.task?.destroy().catch(() => {});
    this.task = null;
    this.dialog.querySelector(".pdf-highlights")!.innerHTML = "";
    this.returnFocus?.focus({ preventScroll: true });
  }
  destroy() {
    this.close();
    this.events.abort();
    this.dialog.remove();
  }
}
