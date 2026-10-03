import type { PDFPreview, PDFPreviewOptions } from "../documents/pdf-preview";
import cytoscape from "cytoscape";
import type {
  Analysis,
  KnowledgeGraph,
  GraphSettings,
  SourceReference,
} from "../types";
import { editNode, deleteNode, editRelationship, nodeColor } from "./edit";
import { quoteRange } from "./provenance";
import { $, escapeHTML as esc, download } from "../ui/dom";
const palette = [
  "#78dcbc",
  "#a5a0fa",
  "#ebbb77",
  "#78b8ed",
  "#e896b6",
  "#c4ce79",
  "#a5c2ce",
];
// Exact hex colors are normalized on load and on edit. Shade locally for
// readable dimensional fills shared by the canvas, PNG and SVG exports.
function gradientStops(color: string, light: boolean) {
  const rgb = [1, 3, 5].map((offset) =>
    parseInt(color.slice(offset, offset + 2), 16),
  );
  const base = light ? 255 : 12;
  return (light ? [0.13, 0.24, 0.1] : [0.25, 0.14, 0.06]).map(
    (mix) =>
      "#" +
      rgb
        .map((channel) =>
          Math.round(base + (channel - base) * mix)
            .toString(16)
            .padStart(2, "0"),
        )
        .join(""),
  );
}
// Keep the label inside its node so layouts reserve space for the actual text.
function nodeLabel(label: string, circle = false) {
  const textWidth = circle ? 136 : 160;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  context.font = "600 15px system-ui";
  const lines: string[] = [];
  let line = "";
  const words = label.split(/\s+/).flatMap((word) => {
    const parts: string[] = [];
    let part = "";
    for (const character of word) {
      if (part && context.measureText(part + character).width > textWidth) {
        parts.push(part);
        part = "";
      }
      part += character;
    }
    if (part) parts.push(part);
    return parts;
  });
  for (const word of words) {
    const next = (line + " " + word.trim()).trim();
    if (line && context.measureText(next).width > textWidth) {
      lines.push(line);
      line = word.trim();
    } else line = next;
  }
  if (line) lines.push(line);
  const diameter = Math.max(
    112,
    Math.hypot(
      Math.max(0, ...lines.map((line) => context.measureText(line).width)),
      lines.length * 21,
    ) + 32,
  );
  return {
    nodeWidth: circle ? diameter : 188,
    displayLabel: lines.join("\n"),
    labelHeight: circle ? diameter : Math.max(64, lines.length * 21 + 28),
  };
}
export class GraphViewer {
  private cy: cytoscape.Core;
  private types: string[];
  private selected: string | null = null;
  private pdfPreview: PDFPreview | null = null;
  private resize: ResizeObserver;
  private events = new AbortController();
  private undoStack: KnowledgeGraph[] = [];
  private redoStack: KnowledgeGraph[] = [];
  private physicsFrame = 0;
  private positionCache: NonNullable<GraphSettings["positions"]> = {};
  settings: GraphSettings;
  constructor(
    private root: HTMLElement,
    public analysis: Analysis,
    private changed: () => void = () => {},
    private pdfOptions: PDFPreviewOptions = {},
  ) {
    this.settings = {
      ...analysis.settings,
      nodeShape: analysis.settings.nodeShape === "circle" ? "circle" : "card",
      physics: analysis.settings.physics !== false,
      hiddenTypes: [...analysis.settings.hiddenTypes],
    };
    analysis.graph.nodes.forEach((n, i) => {
      if (!/^#[0-9a-f]{6}$/i.test(n.color || "")) n.color = nodeColor(i);
    });
    this.types = [...new Set(analysis.graph.nodes.map((n) => n.type))];
    root.classList.add("graph-viewer");
    root.dataset.theme = this.settings.theme;
    root.innerHTML = `<div class="graph-tools"><label class="graph-search"><span aria-hidden="true">⌕</span><input aria-label="Search graph nodes" placeholder="Find a concept…"></label><select aria-label="Graph layout"><option value="cose">Force directed</option><option value="circle">Radial</option><option value="breadthfirst">Hierarchical</option><option value="concentric">Concentric</option><option value="grid">Grid</option></select><select aria-label="Node shape"><option value="circle">Circles</option><option value="card">Cards</option></select><button data-action="physics" aria-pressed="${this.settings.physics}" title="Automatically settle after dragging; stops when stable">Physics ${this.settings.physics ? "on" : "off"}</button><button data-action="fit" title="Show the entire graph">Overview</button><button data-action="readable" title="Show readable labels; drag to explore">Read labels</button><button data-action="zoom-in" aria-label="Zoom in">+</button><button data-action="zoom-out" aria-label="Zoom out">−</button><button data-action="reset">Arrange</button><button data-action="undo" disabled>Undo</button><button data-action="redo" disabled>Redo</button><button data-action="fullscreen" aria-label="Fullscreen graph">⛶</button><button data-action="theme" aria-label="Toggle graph theme">◐</button><details class="graph-export"><summary>Image ↓</summary><div><button data-action="png">PNG</button><button data-action="svg">SVG</button></div></details></div><div class="graph-filter"><span>ENTITY TYPES</span>${this.types.map((t, i) => `<label class="type-toggle"><input type="checkbox" data-type="${esc(t)}" ${this.settings.hiddenTypes.includes(t) ? "" : "checked"}><i style="background:${palette[i % palette.length]}"></i>${esc(t)}</label>`).join("")}<label class="confidence">Confidence ≥ <output>${Math.round(this.settings.confidence * 100)}%</output><input aria-label="Minimum confidence" type="range" min="0" max="100" value="${this.settings.confidence * 100}"></label></div><div class="graph-body"><div class="graph-stage"><div class="graph-canvas" role="img" aria-label="Interactive research knowledge graph. Use the concept and relationship lists to inspect evidence with a keyboard."></div><div class="graph-hint">Drag to explore · Scroll to zoom · Select a concept or connection for evidence</div><div class="graph-count"></div><aside class="evidence-panel" popover="manual" tabindex="-1" aria-label="Evidence inspector"><div class="evidence-header"><div><span class="inspector-eyebrow">EVIDENCE INSPECTOR</span><small class="evidence-scroll-hint">Scroll for sources and details</small></div><button data-action="close-evidence" aria-label="Close evidence">×</button></div><div class="evidence-content"></div></aside></div></div><details class="accessible-graph"><summary>Browse concepts & relationships <span>Keyboard accessible</span></summary><div class="graph-list"></div></details>`;
    root.style.setProperty(
      "--graph-height",
      `${Math.min(1200, Math.max(760, 760 + (analysis.graph.nodes.length - 20) * 12))}px`,
    );
    this.cy = cytoscape({
      container: $(".graph-canvas", root),
      elements: [
        ...analysis.graph.nodes.map((n, i) => ({
          data: {
            ...n,
            ...nodeLabel(n.label, this.settings.nodeShape === "circle"),
            color: n.color || nodeColor(analysis.graph.nodes.indexOf(n)),
          },
          position: this.settings.positions?.[n.id] || {
            x: (i % Math.ceil(Math.sqrt(analysis.graph.nodes.length))) * 280,
            y:
              Math.floor(
                i / Math.ceil(Math.sqrt(analysis.graph.nodes.length)),
              ) * 160,
          },
        })),
        ...analysis.graph.edges.map((e) => ({
          data: { ...e, display: e.relationship.replace(/_/g, " ") },
        })),
      ],
      style: this.style(),
      layout: {
        name: analysis.settings.positions ? "preset" : this.settings.layout,
        animate: false,
        randomize: false,
        padding: 90,
        nodeRepulsion: () => 45000,
        idealEdgeLength: () => 240,
        nodeOverlap: 35,
        componentSpacing: 180,
        spacingFactor: 1.6,
        avoidOverlap: true,
        nodeDimensionsIncludeLabels: true,
      } as cytoscape.LayoutOptions,
      minZoom: 0.15,
      maxZoom: 4,
      wheelSensitivity: 0.2,
    });
    if (this.settings.positions) {
      this.cy.nodes().forEach((n) => {
        const p = this.settings.positions?.[n.id()];
        if (p) n.position(p);
      });
      this.cy.fit(undefined, 65);
    }
    if (!this.settings.positions) this.orientLayout();
    this.separateNodes();
    this.placeEdgeLabels();
    this.fitReadable();
    this.cy.on("tap", "node", (event) => this.inspectNode(event.target.id()));
    this.cy.on("tap", "edge", (event) => this.inspectEdge(event.target.id()));
    this.cy.on("tap", (event) => {
      if (event.target === this.cy) {
        this.selected = null;
        this.cy.elements().removeClass("muted focused");
        this.emptyEvidence();
      }
    });
    $('input[aria-label="Search graph nodes"]', root).addEventListener(
      "input",
      () => this.search(),
    );
    const layout = $<HTMLSelectElement>("select", root);
    layout.value = this.settings.layout;
    layout.addEventListener("change", () => {
      this.settings.layout = layout.value;
      this.runLayout();
      this.changed();
    });
    const shape = $<HTMLSelectElement>('select[aria-label="Node shape"]', root);
    shape.value = this.settings.nodeShape!;
    shape.addEventListener("change", () => {
      this.settings.nodeShape = shape.value === "circle" ? "circle" : "card";
      this.cy.nodes().forEach((node) => {
        node.data(
          nodeLabel(node.data("label"), this.settings.nodeShape === "circle"),
        );
      });
      this.cy.style(this.style());
      this.runLayout();
      this.changed();
    });
    root.addEventListener(
      "change",
      (event) => {
        const input = event.target as HTMLInputElement;
        if (input.dataset.type) {
          this.settings.hiddenTypes = Array.from(
            root.querySelectorAll<HTMLInputElement>(
              "[data-type]:not(:checked)",
            ),
          ).map((el) => el.dataset.type!);
          this.filter();
          this.changed();
        }
      },
      { signal: this.events.signal },
    );
    const confidence = $<HTMLInputElement>('input[type="range"]', root);
    confidence.addEventListener("input", () => {
      this.settings.confidence = Number(confidence.value) / 100;
      $("output", root).textContent = confidence.value + "%";
      this.filter();
      this.changed();
    });
    this.cy.on("grab", "node", () => this.stopPhysics());
    this.cy.on("dragfree", "node", (event) => {
      if (this.settings.physics) this.settlePhysics(event.target.id());
      else {
        this.placeEdgeLabels();
        this.changed();
      }
    });
    root.addEventListener(
      "click",
      (event) => {
        const el = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-action],[data-node],[data-edge]",
        );
        if (!el) return;
        if (el.dataset.node) this.inspectNode(el.dataset.node);
        else if (el.dataset.edge) this.inspectEdge(el.dataset.edge);
        else if (el.dataset.action === "preview-source")
          void this.previewSource(el.dataset.passage!, el.dataset.quote!);
        else this.action(el.dataset.action!);
      },
      { signal: this.events.signal },
    );
    this.resize = new ResizeObserver(() => {
      this.cy.resize();
      this.fitReadable();
      this.positionEvidence();
    });
    this.resize.observe($(".graph-stage", root));
    const reposition = () => this.positionEvidence();
    window.addEventListener("scroll", reposition, {
      capture: true,
      signal: this.events.signal,
    });
    window.addEventListener("resize", reposition, {
      signal: this.events.signal,
    });
    root.addEventListener("toggle", reposition, {
      capture: true,
      signal: this.events.signal,
    });
    window.addEventListener("hashchange", () => this.closeEvidence(), {
      signal: this.events.signal,
    });
    window.addEventListener("popstate", () => this.closeEvidence(), {
      signal: this.events.signal,
    });
    document.addEventListener(
      "click",
      (event) => {
        if (this.selected && !root.contains(event.target as Node))
          this.closeEvidence();
      },
      { capture: true, signal: this.events.signal },
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && this.selected && !this.pdfPreview?.isOpen)
          this.closeEvidence();
      },
      { signal: this.events.signal },
    );
    this.emptyEvidence();
    this.filter();
  }
  private style(): cytoscape.StylesheetJson {
    const light = this.settings.theme === "light";
    return [
      {
        selector: "node",
        style: {
          label: "data(displayLabel)",
          "background-color": "data(color)",
          "border-color": "data(color)",
          "background-opacity": 1,
          "background-fill":
            this.settings.nodeShape === "circle"
              ? "radial-gradient"
              : "linear-gradient",
          "background-gradient-stop-colors": (node) =>
            gradientStops(node.data("color"), light),
          "background-gradient-stop-positions": ["0%", "55%", "100%"],
          "background-gradient-direction": "to-bottom-right",
          "outline-width": 3,
          "outline-color": "data(color)",
          "outline-opacity": 0.06,
          "outline-offset": 3,
          "border-width": 1.5,
          "border-opacity": 0.75,
          shape:
            this.settings.nodeShape === "circle"
              ? "ellipse"
              : "round-rectangle",
          width: "data(nodeWidth)",
          height: "data(labelHeight)",
          color: light ? "#292b24" : "#f3f1ec",
          "font-family": "system-ui",
          "font-size": 15,
          "font-weight": 600,
          "text-valign": "center",
          "text-halign": "center",
          "text-wrap": "wrap",
          "text-max-width": "164px",
          "z-index": 10,
          "overlay-opacity": 0,
        },
      },
      {
        selector: "edge",
        style: {
          label: "data(display)",
          width: 1.5,
          "line-color": light ? "#91a18c" : "#647365",
          "target-arrow-color": light ? "#91a18c" : "#647365",
          "target-arrow-shape": "triangle",
          "arrow-scale": 0.8,
          "curve-style": "bezier",
          color: light ? "#616958" : "#b2bcae",
          "font-size": 11,
          "text-rotation": "none",
          "text-background-color": light ? "#faf9f3" : "#11120f",
          "text-background-opacity": 1,
          "text-background-padding": "5px",
          "text-margin-y": -12,
          "text-wrap": "wrap",
          "text-max-width": "110px",
        },
      },
      {
        selector: 'edge[kind="inferred"]',
        style: { "line-style": "dashed", "line-color": "#e896b6" },
      },
      { selector: 'edge[kind="implied"]', style: { "line-style": "dotted" } },
      { selector: ".muted", style: { opacity: 0.15 } },
      {
        selector: ".focused",
        style: {
          "border-width": 8,
          "border-opacity": 0.5,
          "line-color": "#78dcbc",
          "target-arrow-color": "#78dcbc",
        },
      },
      { selector: "edge.focused", style: { width: 3 } },
      { selector: ".hidden", style: { display: "none" } },
    ];
  }
  private filter() {
    this.cy.batch(() => {
      this.cy.nodes().forEach((n) => {
        n.toggleClass(
          "hidden",
          this.settings.hiddenTypes.includes(n.data("type")),
        );
      });
      this.cy.edges().forEach((e) => {
        e.toggleClass(
          "hidden",
          e.data("confidence") < this.settings.confidence ||
            e.source().hasClass("hidden") ||
            e.target().hasClass("hidden"),
        );
      });
    });
    const shownNodes = this.analysis.graph.nodes.filter(
      (n) => !this.settings.hiddenTypes.includes(n.type),
    );
    const shownIds = new Set(shownNodes.map((n) => n.id));
    const shownEdges = this.analysis.graph.edges.filter(
      (e) =>
        e.confidence >= this.settings.confidence &&
        shownIds.has(e.source) &&
        shownIds.has(e.target),
    );
    $(".graph-count", this.root).textContent =
      `${shownNodes.length} concepts · ${shownEdges.length} relationships`;
    $(".graph-list", this.root).innerHTML =
      `<div><h4>Concepts</h4>${this.analysis.graph.nodes
        .filter((n) => !this.settings.hiddenTypes.includes(n.type))
        .map((n) => `<button data-node="${esc(n.id)}">${esc(n.label)}</button>`)
        .join("")}</div><div><h4>Relationships</h4>${
        this.analysis.graph.edges
          .filter(
            (e) =>
              e.confidence >= this.settings.confidence &&
              !this.settings.hiddenTypes.includes(
                this.node(e.source)?.type || "",
              ) &&
              !this.settings.hiddenTypes.includes(
                this.node(e.target)?.type || "",
              ),
          )
          .map(
            (e) =>
              `<button data-edge="${esc(e.id)}">${esc(this.node(e.source)?.label)} → ${esc(e.relationship.replace(/_/g, " "))} → ${esc(this.node(e.target)?.label)}</button>`,
          )
          .join("") || "<p>No relationships match these filters.</p>"
      }</div>`;
    if (
      this.selected &&
      this.cy.getElementById(this.selected).hasClass("hidden")
    ) {
      this.selected = null;
      this.emptyEvidence();
    }
    this.search();
  }
  private search() {
    const term = $<HTMLInputElement>(
      'input[aria-label="Search graph nodes"]',
      this.root,
    )
      .value.trim()
      .toLowerCase();
    this.cy.elements().removeClass("muted focused");
    if (!term) return;
    const found = this.cy
      .nodes(":visible")
      .filter(
        (n) =>
          n.data("label").toLowerCase().includes(term) ||
          n.data("aliases").some((a: string) => a.toLowerCase().includes(term)),
      );
    this.cy.elements().addClass("muted");
    found.closedNeighborhood().removeClass("muted");
    found.addClass("focused");
    if (found.length) this.cy.fit(found.closedNeighborhood(), 100);
  }
  private focus(id: string) {
    this.root.classList.add("has-selection");
    this.selected = id;
    const el = this.cy.getElementById(id);
    this.cy.elements().removeClass("focused").addClass("muted");
    (el.group() === "edges"
      ? el.connectedNodes().add(el)
      : el.closedNeighborhood()
    ).removeClass("muted");
    el.addClass("focused");
  }
  private node(id: string) {
    return this.analysis.graph.nodes.find((n) => n.id === id);
  }
  private emptyEvidence() {
    this.root.classList.remove("has-selection");
    const panel = $(".evidence-panel", this.root);
    if (panel.matches(":popover-open")) panel.hidePopover();
    $(".evidence-content", this.root).innerHTML =
      `<div class="inspector-mark">⌁</div><h3>Follow the evidence.</h3><p>Select a concept or connection to see its supporting passage, source location, and interpretation.</p><div class="evidence-note">A quoted passage confirms the source text exists. It does not independently verify the AI’s interpretation.</div>`;
  }
  private closeEvidence() {
    this.pdfPreview?.close();
    const panel = $(".evidence-panel", this.root);
    const hadFocus = panel.contains(document.activeElement);
    this.selected = null;
    this.cy.elements().removeClass("muted focused");
    this.emptyEvidence();
    if (hadFocus) {
      const canvas = $(".graph-canvas", this.root);
      canvas.tabIndex = 0;
      canvas.focus({ preventScroll: true });
    }
  }
  private positionEvidence() {
    const panel = $(".evidence-panel", this.root);
    if (!this.selected) return;
    const graph = this.root.getBoundingClientRect();
    const stage = $(".graph-stage", this.root).getBoundingClientRect();
    const left = Math.max(12, graph.left + 12);
    const right = Math.min(window.innerWidth - 12, graph.right - 12);
    const bottom = Math.min(window.innerHeight - 12, graph.bottom - 12);
    let top = Math.max(12, stage.top + 12);
    // A short workspace canvas needs the full graph area for readable evidence.
    if (bottom - top < 280) top = Math.max(12, graph.top + 12);
    if (bottom - top < 100 || right - left < 100) {
      if (panel.matches(":popover-open")) panel.hidePopover();
      return;
    }
    const width = Math.min(420, right - left);
    Object.assign(panel.style, {
      left: `${right - width}px`,
      top: `${top}px`,
      width: `${width}px`,
      maxHeight: `${Math.min(620, bottom - top)}px`,
    });
    if (!panel.matches(":popover-open")) panel.showPopover();
    panel.classList.toggle(
      "is-scrollable",
      panel.scrollHeight > panel.clientHeight + 1,
    );
  }
  private revealEvidence() {
    const graph = this.root.getBoundingClientRect();
    if (
      Math.min(window.innerHeight, graph.bottom) - Math.max(0, graph.top) <
      280
    )
      $(".graph-stage", this.root).scrollIntoView({
        block: "center",
        behavior: "instant",
      });
    this.positionEvidence();
    const panel = $(".evidence-panel", this.root);
    panel.scrollTop = 0;
    panel.focus({ preventScroll: true });
  }
  private sourceLocation(
    ref: Pick<
      SourceReference,
      "passageId" | "paperId" | "paperName" | "page" | "paragraph" | "section"
    >,
  ) {
    const saved = this.analysis.sources?.find((p) => p.id === ref.passageId);
    const paperId = saved?.paperId || ref.paperId;
    const paper = this.analysis.papers?.find((p) => p.id === paperId);
    const page = saved?.page ?? ref.page;
    const paragraph = saved?.paragraph || ref.paragraph;
    return [
      saved?.paperName ||
        ref.paperName ||
        paper?.name ||
        this.analysis.documentName,
      page ? `PDF page ${page}` : "",
      paragraph ? `Paragraph ${paragraph}` : "",
      saved?.section || ref.section,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  private paperCitation(paperId?: string) {
    const paper = this.analysis.papers?.find((p) => p.id === paperId);
    if (!paper?.citation) return "";
    const doi =
      paper.doi && /^10\.\d{4,9}\/[\w.()/:-]+$/i.test(paper.doi)
        ? paper.doi
        : "";
    return `<p class="paper-citation"><cite>${esc(paper.citation)}</cite>${doi ? ` <a href="https://doi.org/${esc(doi)}" target="_blank" rel="noopener">DOI: ${esc(doi)} ↗</a>` : ""}</p>`;
  }
  private jumpMarkup(ref: SourceReference) {
    if (
      !ref.page ||
      !/\.pdf$/i.test(ref.paperName || this.analysis.documentName)
    )
      return "";
    return `<button class="source-jump" data-action="preview-source" data-passage="${esc(ref.passageId)}" data-quote="${esc(ref.quote)}">Go to this line</button>`;
  }
  private async previewSource(passageId: string, quote: string) {
    const saved = this.analysis.sources?.find((p) => p.id === passageId);
    const edge = this.analysis.graph.edges.find(
      (e) => e.passageId === passageId,
    );
    const ref = this.analysis.graph.nodes
      .flatMap((n) => n.sources || [])
      .find((r) => r.passageId === passageId);
    const source =
      saved ||
      (edge || ref
        ? {
            id: passageId,
            text: quote,
            page: edge?.page || ref?.page || null,
            paragraph: edge?.paragraph || ref?.paragraph || 0,
            section: edge?.section || ref?.section || "Source",
            paperId: edge?.paperId || ref?.paperId,
            paperName:
              edge?.paperName || ref?.paperName || this.analysis.documentName,
            terms: [],
          }
        : null);
    if (!source?.page) return;
    const { PDFPreview } = await import("../documents/pdf-preview");
    if (this.events.signal.aborted) return;
    this.pdfPreview ||= new PDFPreview(this.root, this.pdfOptions);
    const paper = this.analysis.papers?.find((p) => p.id === source.paperId);
    await this.pdfPreview.open(source, quote, paper);
  }
  inspectNode(id: string) {
    const n = this.node(id);
    if (!n) return;
    this.focus(id);
    const edges = this.analysis.graph.edges.filter(
      (e) => e.source === id || e.target === id,
    );
    const references = n.sources || [];
    $(".evidence-content", this.root).innerHTML =
      `<span class="evidence-badge">${esc(n.type)}</span><h3>${esc(n.label)}</h3>${n.aliases.length ? `<p>Also known as: ${esc(n.aliases.join(", "))}</p>` : ""}
      <h4>Evidence from the paper</h4>${references[0] ? `<div class="evidence-location">${esc(this.sourceLocation(references[0]))}</div><blockquote>${esc(references[0].quote)}</blockquote>${this.jumpMarkup(references[0])}` : ""}${references.map((r) => this.sourceMarkup(r)).join("") || "<p>This saved graph has no separate concept passage. Select a connection below to read its saved evidence.</p>"}
      <h4>${edges.length} connections</h4>${edges.map((e) => `<button class="relationship-card" data-edge="${esc(e.id)}">${esc(this.node(e.source)?.label)} <span>${esc(e.relationship.replace(/_/g, " "))}</span> ${esc(this.node(e.target)?.label)} <small>${esc(this.sourceLocation({ ...e, paragraph: e.paragraph || 0 }))}</small></button>`).join("") || "<p>No relationships. A concept’s presence alone does not establish a connection.</p>"}
      ${n.edited ? '<p class="user-edit">Edited by you · original evidence retained</p>' : ""}<div class="edit-actions"><button data-action="edit-node">Edit concept</button><button data-action="delete-node">Delete concept</button></div>`;
    this.revealEvidence();
  }
  inspectEdge(id: string) {
    const e = this.analysis.graph.edges.find((e) => e.id === id);
    if (!e) return;
    this.focus(id);
    const reference = { ...e, paragraph: e.paragraph || 0, quote: e.evidence };
    const curated = this.analysis.provider === "Curated demo";
    $(".evidence-content", this.root).innerHTML =
      `<span class="evidence-badge">${esc(e.kind === "stated" ? "Directly stated" : e.kind === "implied" ? "Strongly implied" : "AI inferred")}</span><h3>${esc(this.node(e.source)?.label)}</h3><div class="predicate">↓ ${esc(e.relationship.replace(/_/g, " "))}</div><h3>${esc(this.node(e.target)?.label)}</h3><div class="evidence-location">${esc(this.sourceLocation(reference))}</div><blockquote>${esc(e.evidence)}</blockquote>${this.jumpMarkup(reference)}
      ${this.sourceMarkup(reference)}
      <details class="evidence-interpretation"><summary>${curated ? "Curated sample interpretation" : "Model interpretation"}</summary><p>${esc(e.explanation || "No additional explanation supplied.")}</p>${curated ? "" : `<div class="confidence-score">${Math.round(e.confidence * 100)}% <span>model confidence</span></div><div class="evidence-note">Confidence is an uncalibrated model estimate. Check the source and scientific context before drawing conclusions.</div>`}</details>
      ${e.edited ? '<p class="user-edit">Edited by you · evidence quote unchanged</p>' : ""}<div class="edit-actions"><button data-action="edit-edge">Edit relationship</button><button data-action="delete-edge">Delete relationship</button></div>`;
    this.revealEvidence();
  }
  private runLayout() {
    this.stopPhysics();
    this.cy
      .elements(":visible")
      .layout({
        name: this.settings.layout,
        animate: false,
        randomize: false,
        padding: 35,
        nodeRepulsion: () => 45000,
        idealEdgeLength: () => 240,
        nodeOverlap: 35,
        componentSpacing: 180,
        spacingFactor: 1.6,
        avoidOverlap: true,
        nodeDimensionsIncludeLabels: true,
      } as cytoscape.LayoutOptions)
      .run();
    this.orientLayout();
    this.separateNodes();
    this.placeEdgeLabels();
    this.fitReadable();
  }
  private fitReadable() {
    // Navigation can hide a running graph. Keep its layout intact until the
    // actual canvas becomes visible and ResizeObserver supplies its dimensions.
    if (this.cy.width() < 1 || this.cy.height() < 1) return;
    const elements = this.cy.elements(":visible");
    this.cy.fit(elements, 35);
    // Keep both endpoints readable when a small graph moves between a wide,
    // short workspace and a tall phone canvas.
    const nodes = this.cy.nodes(":visible");
    if (nodes.length === 2 && this.cy.zoom() < 0.8) {
      const a = nodes[0].position(),
        b = nodes[1].position();
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const horizontal = this.cy.width() > this.cy.height() * 1.3;
      const nodeExtent = horizontal
        ? Math.max(nodes[0].width(), nodes[1].width())
        : Math.max(nodes[0].height(), nodes[1].height());
      const available = horizontal ? this.cy.width() : this.cy.height();
      const spacing = Math.max(
        240,
        Math.min(
          Math.hypot(b.x - a.x, b.y - a.y),
          (available - 70) / 0.8 - nodeExtent,
        ),
      );
      nodes[0].position({
        x: center.x - (horizontal ? spacing / 2 : 0),
        y: center.y - (horizontal ? 0 : spacing / 2),
      });
      nodes[1].position({
        x: center.x + (horizontal ? spacing / 2 : 0),
        y: center.y + (horizontal ? 0 : spacing / 2),
      });
      this.placeEdgeLabels();
      this.cy.fit(elements, 35);
    }
    // Large graphs remain complete; initial text must still be legible.
    // Overview deliberately fits every node; panning/zooming explores details.
    if (this.cy.zoom() < 0.8) {
      this.cy.zoom(0.8);
      this.cy.center(elements);
    }
  }
  private orientLayout() {
    if (this.settings.layout !== "cose") return;
    const nodes = this.cy.nodes(":visible");
    if (nodes.length < 2) return;
    const bounds = this.cy.nodes(":visible").boundingBox();
    const width = this.cy.width() - 70,
      height = this.cy.height() - 70;
    const current = Math.min(width / bounds.w, height / bounds.h);
    const rotated = Math.min(width / bounds.h, height / bounds.w);
    const center = {
      x: (bounds.x1 + bounds.x2) / 2,
      y: (bounds.y1 + bounds.y2) / 2,
    };
    if (rotated > current * 1.1)
      nodes.forEach((node) => {
        const p = node.position();
        node.position({
          x: center.x - (p.y - center.y),
          y: center.y + (p.x - center.x),
        });
      });
    // Use both canvas dimensions instead of fitting a tall, narrow cluster into
    // the available height and shrinking all of its labels.
    const positions = nodes.map((node) => node.position());
    const minX = Math.min(...positions.map((p) => p.x)),
      maxX = Math.max(...positions.map((p) => p.x));
    const minY = Math.min(...positions.map((p) => p.y)),
      maxY = Math.max(...positions.map((p) => p.y));
    const columns = Math.ceil(Math.sqrt(nodes.length));
    const spanX = Math.max(this.cy.width() - 300, columns * 240);
    const spanY = Math.max(this.cy.height() - 170, columns * 130);
    nodes.forEach((node) => {
      const p = node.position();
      node.position({
        x: maxX > minX ? ((p.x - minX) / (maxX - minX)) * spanX : 0,
        y: maxY > minY ? ((p.y - minY) / (maxY - minY)) * spanY : 0,
      });
    });
  }
  private placeEdgeLabels() {
    const occupied = this.cy
      .nodes(":visible")
      .map((node) => node.boundingBox());
    for (const edge of this.cy.edges(":visible")) {
      let best = { x: 0, y: -12, score: Infinity };
      for (const y of [-12, -35, 35, -65, 65, -100, 100]) {
        for (const x of [0, -45, 45, -90, 90]) {
          edge.style({ "text-margin-x": x, "text-margin-y": y });
          const box = edge.boundingBox({
            includeNodes: false,
            includeEdges: false,
            includeLabels: true,
          });
          const collisions = occupied.reduce(
            (sum, other) =>
              sum +
              Math.max(
                0,
                Math.min(box.x2 + 8, other.x2) - Math.max(box.x1 - 8, other.x1),
              ) *
                Math.max(
                  0,
                  Math.min(box.y2 + 8, other.y2) -
                    Math.max(box.y1 - 8, other.y1),
                ),
            0,
          );
          const score = collisions * 1000 + Math.abs(x) + Math.abs(y + 12);
          if (score < best.score) best = { x, y, score };
          if (collisions === 0 && x === 0 && y === -12) break;
        }
        if (best.score === 0) break;
      }
      edge.style({ "text-margin-x": best.x, "text-margin-y": best.y });
      occupied.push(
        edge.boundingBox({
          includeNodes: false,
          includeEdges: false,
          includeLabels: true,
        }),
      );
    }
  }
  private stopPhysics() {
    if (this.physicsFrame) cancelAnimationFrame(this.physicsFrame);
    this.physicsFrame = 0;
    this.root.dataset.physics = "idle";
  }
  private settlePhysics(pinned?: string) {
    this.stopPhysics();
    if (!this.settings.physics || this.cy.nodes(":visible").length < 2) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.separateNodes(pinned);
      this.placeEdgeLabels();
      this.changed();
      return;
    }
    const nodes = this.cy.nodes(":visible").toArray();
    const index = new Map(nodes.map((node, i) => [node.id(), i]));
    const edges = this.cy.edges(":visible").toArray();
    const velocity = nodes.map(() => ({ x: 0, y: 0 }));
    let frames = 0,
      quiet = 0;
    const started = performance.now();
    this.root.dataset.physics = "settling";
    const tick = () => {
      const forces = nodes.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i],
            b = nodes[j];
          const dx = b.position("x") - a.position("x"),
            dy = b.position("y") - a.position("y");
          const distance = Math.max(1, Math.hypot(dx, dy));
          const repulsion = Math.min(5, 2500 / (distance * distance));
          let fx = (dx / distance) * repulsion,
            fy = (dy / distance) * repulsion;
          const overlapX =
            (a.outerWidth() + b.outerWidth()) / 2 + 48 - Math.abs(dx);
          const overlapY =
            (a.outerHeight() + b.outerHeight()) / 2 + 48 - Math.abs(dy);
          if (overlapX > 0 && overlapY > 0) {
            if (overlapX < overlapY) fx += (dx >= 0 ? 1 : -1) * overlapX * 0.12;
            else fy += (dy >= 0 ? 1 : -1) * overlapY * 0.12;
          }
          forces[i].x -= fx;
          forces[i].y -= fy;
          forces[j].x += fx;
          forces[j].y += fy;
        }
      }
      for (const edge of edges) {
        const i = index.get(edge.source().id())!,
          j = index.get(edge.target().id())!;
        const a = nodes[i],
          b = nodes[j];
        const dx = b.position("x") - a.position("x"),
          dy = b.position("y") - a.position("y");
        const distance = Math.max(1, Math.hypot(dx, dy));
        const rest = Math.max(240, (a.outerWidth() + b.outerWidth()) / 2 + 100);
        const spring = (distance - rest) * 0.006;
        const fx = (dx / distance) * spring,
          fy = (dy / distance) * spring;
        forces[i].x += fx;
        forces[i].y += fy;
        forces[j].x -= fx;
        forces[j].y -= fy;
      }
      let movement = 0;
      this.cy.batch(() =>
        nodes.forEach((node, i) => {
          if (node.id() === pinned || node.grabbed() || node.locked()) return;
          const v = velocity[i];
          v.x = (v.x + forces[i].x) * 0.75;
          v.y = (v.y + forces[i].y) * 0.75;
          const speed = Math.hypot(v.x, v.y),
            scale = speed > 8 ? 8 / speed : 1;
          const dx = v.x * scale,
            dy = v.y * scale;
          node.position({
            x: node.position("x") + dx,
            y: node.position("y") + dy,
          });
          movement = Math.max(movement, Math.hypot(dx, dy));
        }),
      );
      quiet = movement < 0.12 ? quiet + 1 : 0;
      if (
        ++frames >= 120 ||
        performance.now() - started >= 1800 ||
        quiet >= 8
      ) {
        this.physicsFrame = 0;
        this.separateNodes(pinned);
        this.placeEdgeLabels();
        this.root.dataset.physics = "idle";
        this.changed();
      } else this.physicsFrame = requestAnimationFrame(tick);
    };
    this.physicsFrame = requestAnimationFrame(tick);
  }
  private separateNodes(pinned?: string) {
    const nodes = this.cy.nodes(":visible").toArray();
    // CoSE does not guarantee rectangle separation; resolve remaining collisions.
    for (let pass = 0; pass < 100; pass++) {
      let moved = false;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i],
            b = nodes[j];
          const pa = a.position(),
            pb = b.position();
          const dx = pb.x - pa.x,
            dy = pb.y - pa.y;
          const overlapX =
            (a.outerWidth() + b.outerWidth()) / 2 + 48 - Math.abs(dx);
          const overlapY =
            (a.outerHeight() + b.outerHeight()) / 2 + 48 - Math.abs(dy);
          if (overlapX <= 0 || overlapY <= 0) continue;
          const horizontal = overlapX < overlapY;
          const shift = (horizontal ? overlapX : overlapY) / 2 + 1;
          const direction = (horizontal ? dx : dy) >= 0 ? 1 : -1;
          const aScale = a.id() === pinned ? 0 : b.id() === pinned ? 2 : 1;
          const bScale = b.id() === pinned ? 0 : a.id() === pinned ? 2 : 1;
          a.position({
            x: pa.x - (horizontal ? shift * direction * aScale : 0),
            y: pa.y - (horizontal ? 0 : shift * direction * aScale),
          });
          b.position({
            x: pb.x + (horizontal ? shift * direction * bScale : 0),
            y: pb.y + (horizontal ? 0 : shift * direction * bScale),
          });
          moved = true;
        }
      }
      if (!moved) break;
    }
  }
  private liveReadOnly = false;
  setReadOnly(value: boolean) {
    this.liveReadOnly = value;
    this.root.classList.toggle("is-building", value);
  }
  updateLive(analysis: Analysis) {
    this.analysis = analysis;
    this.refreshGraph();
  }
  private sourceMarkup(ref: SourceReference) {
    const source = this.analysis.sources?.find((p) => p.id === ref.passageId);
    const text = source?.text || ref.quote;
    const range = quoteRange(text, ref.quote);
    const highlighted = range
      ? esc(text.slice(0, range[0])) +
        "<mark>" +
        esc(text.slice(range[0], range[1])) +
        "</mark>" +
        esc(text.slice(range[1]))
      : esc(text);
    const lines = range ? text.slice(0, range[0]).split("\n").length : 1;
    const end = range ? text.slice(0, range[1]).split("\n").length : lines;
    return `${this.paperCitation(source?.paperId || ref.paperId)}<details class="source-passage"><summary>${esc(this.sourceLocation(ref))}</summary><p class="source-text">${highlighted}</p>${this.jumpMarkup(ref)}<small>${source ? `Extracted text lines ${lines}${end !== lines ? "–" + end : ""}. Highlighted text supports this element.` : "Saved evidence quote; full source paragraph was not included in this graph."}</small></details>`;
  }
  private commit(graph: KnowledgeGraph) {
    if (this.liveReadOnly) return;
    this.undoStack.push(structuredClone(this.analysis.graph));
    if (this.undoStack.length > 20) this.undoStack.shift();
    this.redoStack = [];
    this.analysis.graph = graph;
    this.refreshGraph();
  }
  private refreshGraph() {
    this.stopPhysics();
    Object.assign(this.positionCache, this.snapshot().positions);
    const positions = this.positionCache;
    this.types = [...new Set(this.analysis.graph.nodes.map((n) => n.type))];
    this.settings.hiddenTypes = this.settings.hiddenTypes.filter((t) =>
      this.types.includes(t),
    );
    this.cy.elements().remove();
    this.cy.add([
      ...this.analysis.graph.nodes.map((n, i) => ({
        data: {
          ...n,
          ...nodeLabel(n.label, this.settings.nodeShape === "circle"),
          color: n.color || nodeColor(i),
        },
        position: positions?.[n.id] || {
          x: (i % Math.ceil(Math.sqrt(this.analysis.graph.nodes.length))) * 280,
          y:
            Math.floor(
              i / Math.ceil(Math.sqrt(this.analysis.graph.nodes.length)),
            ) * 280,
        },
      })),
      ...this.analysis.graph.edges.map((e) => ({
        data: { ...e, display: e.relationship.replace(/_/g, " ") },
      })),
    ]);
    this.root.querySelectorAll(".type-toggle").forEach((e) => e.remove());
    $(".graph-filter > span", this.root).insertAdjacentHTML(
      "afterend",
      this.types
        .map(
          (t, i) =>
            `<label class="type-toggle"><input type="checkbox" data-type="${esc(t)}" ${this.settings.hiddenTypes.includes(t) ? "" : "checked"}><i style="background:${palette[i % palette.length]}"></i>${esc(t)}</label>`,
        )
        .join(""),
    );
    $<HTMLButtonElement>('[data-action="undo"]', this.root).disabled =
      !this.undoStack.length;
    $<HTMLButtonElement>('[data-action="redo"]', this.root).disabled =
      !this.redoStack.length;
    this.filter();
    this.separateNodes();
    this.placeEdgeLabels();
    if (this.selected && this.node(this.selected))
      this.inspectNode(this.selected);
    else if (
      this.selected &&
      this.analysis.graph.edges.some((e) => e.id === this.selected)
    )
      this.inspectEdge(this.selected);
    else {
      this.selected = null;
      this.emptyEvidence();
    }
    this.changed();
  }
  private editor(kind: "node" | "edge") {
    if (!this.selected) return;
    const node = this.node(this.selected),
      edge = this.analysis.graph.edges.find((e) => e.id === this.selected);
    const fields =
      kind === "node" && node
        ? `<label>Name<input name="label" maxlength="120" value="${esc(node.label)}" required></label><label>Category<input name="type" maxlength="60" value="${esc(node.type)}" required></label><label>Color<input name="color" type="color" value="${node.color || nodeColor(this.analysis.graph.nodes.indexOf(node))}"></label>`
        : edge
          ? `<label>Relationship<input name="relationship" maxlength="100" value="${esc(edge.relationship.replace(/_/g, " "))}" required></label><label>Your interpretation<textarea name="explanation" maxlength="1200" rows="4">${esc(edge.explanation)}</textarea></label><p>Original quote and source stay unchanged. Changes are labeled as your edits.</p>`
          : "";
    $(".evidence-content", this.root).innerHTML =
      `<form class="graph-editor"><h3>${kind === "node" ? "Edit concept" : "Edit relationship"}</h3>${fields}<p class="edit-error" role="alert"></p><div class="edit-actions"><button type="submit">Save changes</button><button type="button" data-action="cancel-edit">Cancel</button></div></form>`;
    $(".graph-editor", this.root).addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.target as HTMLFormElement),
        id = this.selected!;
      try {
        this.commit(
          kind === "node"
            ? editNode(
                this.analysis.graph,
                id,
                String(data.get("label")),
                String(data.get("type")),
                String(data.get("color")),
              )
            : editRelationship(
                this.analysis.graph,
                id,
                String(data.get("relationship")),
                String(data.get("explanation")),
              ),
        );
      } catch (error) {
        $(".edit-error", this.root).textContent = (error as Error).message;
      }
    });
    $<HTMLInputElement>(".graph-editor input", this.root).focus();
  }
  private action(action: string) {
    if (action === "close-evidence") this.closeEvidence();
    if (action === "physics") {
      this.settings.physics = !this.settings.physics;
      const button = $<HTMLButtonElement>('[data-action="physics"]', this.root);
      button.textContent = `Physics ${this.settings.physics ? "on" : "off"}`;
      button.setAttribute("aria-pressed", String(this.settings.physics));
      if (this.settings.physics) this.settlePhysics();
      else {
        this.stopPhysics();
        this.placeEdgeLabels();
        this.changed();
      }
    }
    if (["png", "svg"].includes(action) && !this.cy.nodes(":visible").length) {
      $(".graph-count", this.root).textContent =
        "No visible concepts to export. Undo a deletion or clear filters.";
      return;
    }
    if (
      this.liveReadOnly &&
      [
        "edit-node",
        "edit-edge",
        "delete-node",
        "delete-edge",
        "confirm-delete",
        "undo",
        "redo",
      ].includes(action)
    )
      return;
    if (action === "edit-node") this.editor("node");
    if (action === "edit-edge") this.editor("edge");
    if (action === "cancel-edit" && this.selected)
      this.node(this.selected)
        ? this.inspectNode(this.selected)
        : this.inspectEdge(this.selected);
    if (
      (action === "delete-node" || action === "delete-edge") &&
      this.selected
    ) {
      const node = this.node(this.selected);
      $(".evidence-content", this.root).innerHTML =
        `<h3>Delete ${node ? esc(node.label) : "this relationship"}?</h3><p>${node ? "Its connected relationships will also be removed." : "The concepts will remain."} You can undo this.</p><div class="edit-actions"><button data-action="confirm-delete">Delete</button><button data-action="cancel-edit">Cancel</button></div>`;
    }
    if (action === "confirm-delete" && this.selected)
      this.commit(
        this.node(this.selected)
          ? deleteNode(this.analysis.graph, this.selected)
          : {
              ...this.analysis.graph,
              edges: this.analysis.graph.edges.filter(
                (e) => e.id !== this.selected,
              ),
            },
      );
    if (action === "undo" && this.undoStack.length) {
      this.redoStack.push(structuredClone(this.analysis.graph));
      this.analysis.graph = this.undoStack.pop()!;
      this.refreshGraph();
    }
    if (action === "redo" && this.redoStack.length) {
      this.undoStack.push(structuredClone(this.analysis.graph));
      this.analysis.graph = this.redoStack.pop()!;
      this.refreshGraph();
    }
    if (action === "fit") this.cy.fit(this.cy.elements(":visible"), 35);
    if (action === "readable") this.fitReadable();
    if (action === "zoom-in" || action === "zoom-out")
      this.cy.zoom({
        level: Math.max(
          0.15,
          Math.min(4, this.cy.zoom() * (action === "zoom-in" ? 1.3 : 1 / 1.3)),
        ),
        renderedPosition: { x: this.cy.width() / 2, y: this.cy.height() / 2 },
      });
    if (action === "reset") {
      this.settings.hiddenTypes = [];
      this.settings.confidence = 0;
      this.root
        .querySelectorAll<HTMLInputElement>("[data-type]")
        .forEach((x) => (x.checked = true));
      $<HTMLInputElement>('input[type="range"]', this.root).value = "0";
      $("output", this.root).textContent = "0%";
      $<HTMLInputElement>(
        'input[aria-label="Search graph nodes"]',
        this.root,
      ).value = "";
      this.selected = null;
      this.filter();
      this.emptyEvidence();
      this.runLayout();
      this.changed();
    }
    if (action === "theme")
      this.setTheme(this.settings.theme === "dark" ? "light" : "dark");
    if (action === "fullscreen") {
      const promise = document.fullscreenElement
        ? document.exitFullscreen()
        : this.root.requestFullscreen();
      promise.catch(() => {
        $(".graph-count", this.root).textContent =
          "Fullscreen is unavailable in this browser.";
      });
    }
    if (action === "png" || action === "svg") this.snapshot();
    if (action === "png")
      download(
        this.cy.png({
          output: "blob",
          full: true,
          bg: this.settings.theme === "light" ? "#faf9f3" : "#11120f",
          maxWidth: 4000,
          maxHeight: 4000,
        }) as Blob,
        "knowledge-graph.png",
      );
    if (action === "svg")
      download(
        new Blob([this.svg()], { type: "image/svg+xml" }),
        "knowledge-graph.svg",
      );
  }
  setTheme(theme: "dark" | "light") {
    this.settings.theme = theme;
    this.root.dataset.theme = theme;
    this.cy.style(this.style());
    this.changed();
    this.root.dispatchEvent(
      new CustomEvent("graph-theme-change", { bubbles: true, detail: theme }),
    );
  }
  snapshot(): GraphSettings {
    if (this.physicsFrame) {
      this.stopPhysics();
      this.separateNodes();
      this.placeEdgeLabels();
    }
    const positions: Record<string, { x: number; y: number }> = {};
    this.cy.nodes().forEach((n) => {
      positions[n.id()] = { ...n.position() };
    });
    return {
      ...this.settings,
      hiddenTypes: [...this.settings.hiddenTypes],
      positions,
    };
  }
  private svg() {
    const bounds = this.cy.elements(":visible").boundingBox(),
      padding = 130;
    const fg = this.settings.theme === "light" ? "#292b24" : "#f3f1ec";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x1 - padding} ${bounds.y1 - padding} ${bounds.w + padding * 2} ${bounds.h + padding * 2}"><rect x="${bounds.x1 - padding}" y="${bounds.y1 - padding}" width="${bounds.w + padding * 2}" height="${bounds.h + padding * 2}" fill="${this.settings.theme === "light" ? "#faf9f3" : "#11120f"}"/><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0 0L7 3L0 6" fill="#7192a4"/></marker></defs>${this.cy
      .edges(":visible")
      .map((e) => {
        const a = e.sourceEndpoint(),
          b = e.targetEndpoint(),
          midpoint = e.midpoint();
        const mid = {
          x: midpoint.x + parseFloat(e.style("text-margin-x")),
          y: midpoint.y + parseFloat(e.style("text-margin-y")) + 12,
        };
        const label = String(e.data("display"));
        const lines = label.split(/\s+/).reduce<string[]>((out, word) => {
          const last = out.length - 1;
          if (last >= 0 && (out[last] + " " + word).length <= 18)
            out[last] += " " + word;
          else out.push(word);
          return out;
        }, []);
        const w = Math.max(...lines.map((line) => line.length)) * 6 + 12;
        const h = lines.length * 14 + 10;
        return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#7192a4" ${e.data("kind") === "stated" ? "" : 'stroke-dasharray="5 4"'} marker-end="url(#arrow)"/><rect x="${mid.x - w / 2}" y="${mid.y - 12 - h / 2}" width="${w}" height="${h}" rx="4" fill="${this.settings.theme === "light" ? "#faf9f3" : "#11120f"}"/><text text-anchor="middle" font-family="system-ui" font-size="11" fill="${fg}">${lines.map((line, i) => `<tspan x="${mid.x}" y="${mid.y - 12 - (lines.length - 1) * 7 + i * 14 + 4}">${esc(line)}</tspan>`).join("")}</text>`;
      })
      .join("")}${this.cy
      .nodes(":visible")
      .map((n, i) => {
        const p = n.position();
        const width = n.width(),
          height = n.height();
        const lines = String(n.data("displayLabel")).split("\n");
        const stops = gradientStops(
          n.data("color"),
          this.settings.theme === "light",
        );
        const gradient =
          this.settings.nodeShape === "circle"
            ? "radialGradient"
            : "linearGradient";
        const fill = `<defs><${gradient} id="node-fill-${i}">${stops.map((color, index) => `<stop offset="${[0, 55, 100][index]}%" stop-color="${color}"/>`).join("")}</${gradient}></defs>`;
        const shape =
          this.settings.nodeShape === "circle"
            ? `<circle cx="${p.x}" cy="${p.y}" r="${width / 2}" fill="url(#node-fill-${i})" stroke="${n.data("color")}" stroke-width="2"/>`
            : `<rect x="${p.x - width / 2}" y="${p.y - height / 2}" width="${width}" height="${height}" rx="12" fill="url(#node-fill-${i})" stroke="${n.data("color")}" stroke-width="2"/>`;
        return `${fill}${shape}<text text-anchor="middle" font-family="system-ui" font-size="15" font-weight="600" fill="${fg}">${lines.map((line, i) => `<tspan x="${p.x}" y="${p.y - (lines.length - 1) * 10.5 + i * 21 + 5}">${esc(line)}</tspan>`).join("")}</text>`;
      })
      .join("")}</svg>`;
  }
  destroy() {
    this.pdfPreview?.destroy();
    this.stopPhysics();
    this.events.abort();
    this.resize.disconnect();
    this.cy.destroy();
    this.root.innerHTML = "";
  }
}
export const mount = (root: HTMLElement, analysis: Analysis) =>
  new GraphViewer(root, analysis);
