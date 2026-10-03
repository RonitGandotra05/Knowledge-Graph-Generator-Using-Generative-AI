import { noticeList, statusNotice } from "./notices";
import { capacityProfile } from "../providers/capacity";
import { workspaceTemplate } from "./workspace-template";
import type {
  Analysis,
  Concept,
  ExtractionOptions,
  ResearchDocument,
  PaperRecord,
  UsageTotals,
  KnowledgeGraph,
} from "../types";
import { defaults } from "../types";
import { parseCollection, maxPapers } from "../documents/collection";
import {
  emptyUsage,
  addUsage,
  money,
  duration,
  priceFor,
  type UsageEvent,
} from "../providers/usage";
import { estimateRun, paidAlternatives } from "../providers/estimate";
import {
  parseTerms,
  selectContext,
  occurrences,
  type ContextSelection,
} from "../retrieval/context";
import { LLMProvider, providers } from "../providers/client";
import {
  safeOptions,
  requestPolicy,
  requestGuard,
  freeProvider,
} from "../providers/limits";
import {
  discoverCoverage,
  extractCoverage,
  coverageBatches,
} from "../providers/coverage";
import type { GraphViewer } from "../graph/viewer";
import { exportAnalysis, importAnalysis } from "../graph/export";
import { drafts, type Draft } from "../storage/drafts";
import { attachProvenance } from "../graph/provenance";
import { history } from "../storage/history";
import { ProviderForm } from "./provider-form";
import { $, escapeHTML as esc, readableError, download } from "./dom";
export class Workspace {
  private doc: ResearchDocument | null = null;
  private concepts: Concept[] = [];
  private provider: ProviderForm;
  private viewer: GraphViewer | null = null;
  private pdfFiles = new Map<string, File>();
  private analysis: Analysis | null = null;
  private controller: AbortController | null = null;
  private busy = false;
  private analysisReady = false;
  private step = 0;
  private draftId: string = crypto.randomUUID();
  private discoverySignature = "";
  private discoveryCoverage = {
    batches: 0,
    discovered: 0,
    omitted: [] as string[],
  };
  private extractionProgress: Draft["extractionProgress"];
  private papers: PaperRecord[] = [];
  private usage: UsageTotals = emptyUsage();
  private discoveryProgress: Draft["discoveryProgress"];
  private phase:
    "idle" | "discovery" | "relationships" | "complete" | "paused" = "idle";
  private runStarted = 0;
  private waitingUntil = 0;
  private activity: string[] = [];
  private saveTimer = 0;
  private writes: Promise<unknown> = Promise.resolve();
  private restoring = false;
  private automaticContext: number | null = null;
  private comparisonCache: {
    key: string;
    html: string;
    summary: string;
  } | null = null;
  get currentId() {
    return this.draftId;
  }
  get isBusy() {
    return this.busy;
  }
  constructor(
    private root: HTMLElement,
    private historyChanged: () => void,
  ) {
    root.innerHTML = workspaceTemplate;
    this.provider = new ProviderForm(
      $("#provider-form", root),
      (text, error) => this.message(text, error),
      () => {
        this.renderConcepts();
        this.updateContext();
        this.scheduleSave();
      },
    );
    requestGuard.subscribe(() => this.updateAvailability());
    window.setInterval(() => {
      this.updateAvailability();
      this.renderProgress();
    }, 1000);
    const upload = $<HTMLInputElement>("#document-file", root);
    upload.addEventListener("change", () => {
      if (upload.files?.length) void this.upload([...upload.files]);
    });
    $("#add-pasted-paper", root).addEventListener("click", () => {
      const text = $<HTMLTextAreaElement>("#paper-text", root).value.trim();
      if (!text) {
        this.message("Paste the research paper text first.", true);
        return;
      }
      void this.upload([
        new File([text], "Pasted research paper.txt", { type: "text/plain" }),
      ]).then(() => {
        if (
          this.papers.some(
            (paper) =>
              paper.name === "Pasted research paper.txt" &&
              paper.status !== "failed",
          )
        )
          $<HTMLTextAreaElement>("#paper-text", root).value = "";
      });
    });
    $("#document-summary", root).addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-remove-paper]",
      );
      if (button) void this.removePaper(button.dataset.removePaper || "");
      if ((event.target as HTMLElement).closest("[data-clear-papers]"))
        void this.clearPapers();
    });
    const drop = $("#drop-zone", root);
    drop.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        upload.click();
      }
    });
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("dragging");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("dragging"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("dragging");
      const files = e.dataTransfer?.files;
      if (files?.length && !this.busy) void this.upload([...files]);
    });
    $("#edit-setup", root).addEventListener("click", () => this.goStep(0));
    for (const id of ["focus", "terms"])
      $("#" + id, root).addEventListener("input", () => {
        this.discoverySignature = "";
        this.updateContext();
        this.scheduleSave();
      });
    root.addEventListener("change", () => this.scheduleSave());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden")
        void this.flushDraft().catch(() => {});
    });
    $("#concept-search", root).addEventListener("input", () =>
      this.renderConcepts(),
    );
    $("#concepts", root).addEventListener("change", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.dataset.index !== undefined) {
        this.concepts[Number(target.dataset.index)].selected = target.checked;
        this.renderConcepts();
        this.updateContext();
        this.scheduleSave();
      }
    });
    $("#select-all", root).addEventListener("click", () => {
      const max = this.options().maxNodes;
      this.concepts.forEach((c, i) => (c.selected = i < max));
      this.renderConcepts();
      this.updateContext();
      this.scheduleSave();
    });
    $("#select-none", root).addEventListener("click", () => {
      this.concepts.forEach((c) => (c.selected = false));
      this.renderConcepts();
      this.updateContext();
      this.scheduleSave();
    });
    ["max-nodes", "max-edges", "context-budget", "include-inferred"].forEach(
      (id) =>
        $("#" + id, root).addEventListener("change", () =>
          this.updateContext(),
        ),
    );
    $("#analyze", root).addEventListener("click", () => void this.analyze());
    $("#resume-run", root).addEventListener("click", () => {
      if (this.provider.config().key) void this.analyze();
      else {
        this.goStep(2);
        $("#api-key", this.root).focus();
      }
    });
    $("#cancel-request", root).addEventListener("click", () =>
      this.controller?.abort(),
    );
    $("#export-text", root).addEventListener("click", () => {
      if (this.doc)
        download(
          new Blob(
            [
              this.doc.passages
                .map(
                  (p) =>
                    `${p.paperName ? "[Paper: " + p.paperName + "] " : ""}${p.page ? "[PDF page " + p.page + "] " : "[Paragraph " + p.paragraph + "] "}${p.section}\n${p.text}`,
                )
                .join("\n\n"),
            ],
            { type: "text/plain" },
          ),
          this.doc.name.replace(/\.[^.]+$/, "") + "-extracted.txt",
        );
    });
    $("#import-analysis", root).addEventListener("click", () =>
      $<HTMLInputElement>("#import-file", root).click(),
    );
    $("#import-file", root).addEventListener("change", async () => {
      const input = $<HTMLInputElement>("#import-file", root),
        file = input.files?.[0];
      if (!file) return;
      try {
        if (file.size > 30_000_000)
          throw new Error("Analysis exceeds the 30 MB import limit.");
        await this.openSaved(importAnalysis(await file.text()));
        this.message(
          "Analysis imported. Evidence has not been checked against the original document.",
        );
      } catch (e) {
        this.message(readableError(e), true);
      } finally {
        input.value = "";
      }
    });
    $("#save-analysis", root).addEventListener("click", () => void this.save());
    $("#export-json", root).addEventListener(
      "click",
      () => void this.export("json"),
    );
    $("#export-html", root).addEventListener(
      "click",
      () => void this.export("html"),
    );
    this.renderConcepts();
    this.updateContext();
    this.goStep(0);
  }
  private beginRun(phase: "discovery" | "relationships") {
    this.phase = phase;
    if (this.analysis) this.analysis.state = "building";
    if (this.discoveryProgress?.signature !== this.signature())
      this.discoveryProgress = undefined;
    this.runStarted = Date.now();
    this.waitingUntil = 0;
    if (!this.usage.calls)
      this.usage.billing = this.provider.config().billing || "standard";
    this.logActivity(
      "Analysis started · credentials remain in this tab’s memory",
    );
  }
  private currentUsage() {
    return {
      ...this.usage,
      elapsedMs:
        this.usage.elapsedMs +
        (this.runStarted ? Date.now() - this.runStarted : 0),
    };
  }
  private aiProvider() {
    return new LLMProvider(
      this.provider.config(),
      requestGuard,
      (tokens) => this.waitForProvider("Continuing analysis", tokens),
      (event: UsageEvent) => {
        this.usage = addUsage(this.usage, event);
        this.waitingUntil = 0;
        if (this.analysis) this.analysis.usage = this.currentUsage();
        this.renderProgress();
        this.scheduleSave();
      },
    );
  }
  private logActivity(text: string) {
    this.activity = [text, ...this.activity].slice(0, 3);
    $("#run-activity", this.root).innerHTML = this.activity
      .map((a) => `<li>${esc(a)}</li>`)
      .join("");
    this.renderProgress();
  }
  private estimateCache: {
    key: string;
    value: ReturnType<typeof estimateRun>;
  } | null = null;
  private estimate() {
    if (!this.doc) return null;
    const config = this.provider.config(),
      options = this.options();
    const discoveryDone = this.discoverySignature === this.signature();
    const discovery =
      this.discoveryProgress?.signature === this.signature()
        ? this.discoveryProgress.completed
        : [];
    const relationshipSignature = JSON.stringify([
      this.signature(),
      this.concepts.filter((c) => c.selected),
    ]);
    const relationships =
      this.extractionProgress?.signature === relationshipSignature
        ? this.extractionProgress.completed
        : [];
    const key = JSON.stringify([
      this.signature(),
      config.billing,
      config.capacity,
      requestGuard.effectivePolicy(config),
      this.concepts,
      discoveryDone,
      discovery,
      relationships,
      (this.discoveryProgress?.signature === this.signature() ||
        this.discoverySignature === this.signature()) &&
      this.usage.calls
        ? Math.max(1000, this.usage.requestDurationMs / this.usage.calls)
        : null,
    ]);
    if (this.estimateCache?.key === key) return this.estimateCache.value;
    const value = estimateRun(
      this.doc,
      this.concepts,
      config,
      options,
      discoveryDone,
      discovery,
      relationships,
      config.billing === "free",
      (this.discoveryProgress?.signature === this.signature() ||
        this.discoverySignature === this.signature()) &&
        this.usage.calls
        ? Math.max(1000, this.usage.requestDurationMs / this.usage.calls)
        : undefined,
      requestGuard.effectivePolicy(config),
    );
    this.estimateCache = { key, value };
    return value;
  }
  private comparison() {
    if (!this.doc) return "";
    const config = this.provider.config(),
      options = this.options();
    const key = JSON.stringify([
      this.draftId,
      this.doc.name,
      this.doc.characters,
      this.doc.pages,
      config.provider,
      config.model,
      config.capacity,
      config.billing,
      options,
    ]);
    if (this.comparisonCache?.key === key) return this.comparisonCache.html;
    const alternatives = paidAlternatives(this.doc, [], options, config);
    const summary = alternatives
      .map(
        ({ config: c, estimate: e }) =>
          `${c.provider === "openai" ? "OpenAI" : "Gemini"} ${duration(e.durationMs)}–${duration(e.durationCeilingMs)}`,
      )
      .join(" · ");
    const rows = alternatives
      .map(({ config: alternative, estimate: e }) => {
        const profile = capacityProfile(alternative)!;
        return `<tr><th scope="row">${esc(providers[alternative.provider].label)} · ${esc(alternative.model)}</th><td>${duration(e.durationMs)}–${duration(e.durationCeilingMs)}</td><td>${e.calls.toLocaleString()} calls</td><td>${money(e.costUSD!)}–${money(e.costCeilingUSD!)} USD</td></tr><tr class="capacity-basis"><td colspan="4">${esc(profile.label)} · app pacing ${e.requestsPerMinute} calls/min · ${e.tokensPerMinute?.toLocaleString()} ${profile.inputOnly ? "input " : ""}tokens/min. <a href="${profile.source}" target="_blank" rel="noopener noreferrer">Check limits ↗</a></td></tr>`;
      })
      .join("");
    const html = `<p class="fine-print">Paid API capacity can shorten long quota waits. Calculated for these papers using each provider’s context size and pacing.</p><div class="provider-comparison"><table><caption class="sr-only">Paid provider timing and charges</caption><thead><tr><th>Provider</th><th>Time estimate</th><th>Requests</th><th>API charge</th></tr></thead><tbody>${rows}</tbody></table></div>${noticeList(
      [
        {
          label: "Basis",
          text: "Fresh run with 20% quota headroom. OpenAI uses Tier 1; enter your Gemini dashboard limits for an account-specific estimate.",
        },
        {
          label: "Timing",
          text: "Local parsing/OCR is additional. Paid access does not guarantee completion time.",
        },
        {
          label: "Billing",
          text: "API charges are separate from ChatGPT subscriptions.",
        },
        {
          label: "Switching",
          text: "Changing provider starts fresh extraction.",
        },
      ],
    )}`;
    this.comparisonCache = { key, html, summary };
    return html;
  }
  private renderEstimate() {
    const plan = this.estimate(),
      target = $("#run-estimate", this.root);
    if (!plan) {
      target.innerHTML =
        '<p class="fine-print">Upload papers to estimate tokens, time and API charges.</p>';
      return;
    }
    const comparison = this.comparison();
    const config = this.provider.config(),
      price = priceFor(config);
    const included =
      this.papers.filter((p) => p.status !== "failed").length || 1;
    const cost =
      plan.costUSD === null
        ? "Unknown"
        : `${money(plan.costUSD)}–${money(plan.costCeilingUSD!)}`;
    target.innerHTML = `<div class="estimate-label"><span>YOUR RUN, ESTIMATED</span><small>${included} paper${included === 1 ? "" : "s"} included</small></div><div class="estimate-summary"><div><strong>${plan.calls.toLocaleString()}</strong><span>API calls · up to</span></div><div><strong>${(plan.inputTokens + plan.outputTokens).toLocaleString()}–${plan.tokenCeiling.toLocaleString()}</strong><span>tokens · estimate</span></div><div><strong>${cost}</strong><span>provider API charge · USD</span></div><div><strong>${duration(plan.durationMs)}–${duration(plan.durationCeilingMs)}</strong><span>remaining time · estimate</span></div></div>${plan.quotaDays > 1 ? `<div class="quota-notice"><strong>May need ${plan.quotaDays} quota windows.</strong><span>Progress is saved between resets. Paid API providers may finish much sooner.</span></div>` : ""}<details class="paid-comparison"><summary>Compare paid providers</summary>${comparison}</details><details class="estimate-assumptions"><summary>Estimate details & provider rates</summary>${noticeList(
      [
        {
          label: "Requests",
          text: `${plan.discoveryCalls} discovery + up to ${plan.relationshipCalls} relationship requests.`,
        },
        {
          label: "Pacing",
          text: plan.requestsPerMinute
            ? `App pacing: up to ${plan.requestsPerMinute} calls/min · ${plan.tokensPerMinute?.toLocaleString()} ${requestPolicy(config)?.inputOnly ? "input " : ""}tokens/min. ${capacityProfile(config)?.label || "Conservative app quota"}.`
            : "One request at a time. Timing updates during the run.",
        },
        {
          label: "Your plan",
          text:
            config.billing === "free" && priceFor(config)?.free
              ? "Free tier selected: $0 only within your provider’s free quota. Your key does not reveal eligibility or quota."
              : config.provider === "groq" || config.provider === "gemini"
                ? "Paid rates shown. Eligible free-tier usage may cost $0; choose your API plan above."
                : "You pay your provider directly.",
        },
        {
          label: "App fee",
          text: "Evidence Atlas: $0. Parsing/OCR is local and free.",
        },
        {
          label: "Accuracy",
          text: "Estimates vary with output and account limits. Taxes and credits are excluded.",
        },
      ],
    )}<p class="fine-print">${price ? `<a href="${price.source}" target="_blank" rel="noopener noreferrer">Provider pricing ↗</a> · checked ${this.usage.pricingDate}` : "No verified rate for this model. Check provider pricing before starting."}</p></details>`;
  }

  private renderProgress() {
    const visible = this.phase !== "idle";
    this.root.dataset.runPhase = this.phase;
    document.dispatchEvent(
      new CustomEvent("atlas-run-state", {
        detail: {
          phase: this.phase,
          busy: this.busy && !!this.controller,
          percent:
            this.phase === "complete"
              ? 100
              : Number(
                  $("#run-percent", this.root).textContent?.replace("%", ""),
                ) || 0,
        },
      }),
    );
    $("#run-progress", this.root).hidden = !visible;
    if (!visible) return;
    $("#resume-run", this.root).hidden = this.phase !== "paused" || this.busy;
    const u = this.currentUsage(),
      plan = this.estimate();
    const n = plan?.sections || 0,
      discovered = this.discoveryProgress?.completed.length || 0;
    const relationDone = this.extractionProgress?.completed.length || 0;
    const relationTotal =
      this.discoverySignature === this.signature()
        ? (plan?.relationshipCalls || 0) + relationDone
        : n;
    const done = Math.min(n, discovered) + relationDone,
      total = Math.max(1, n + relationTotal);
    const percent =
      this.phase === "complete"
        ? 100
        : Math.min(99, Math.round((done / total) * 100));
    const waiting = this.waitingUntil > Date.now();
    $<HTMLProgressElement>("#run-progress-bar", this.root).value = percent;
    $("#run-percent", this.root).textContent = `${percent}%`;
    $("#run-badge", this.root).textContent =
      this.phase === "complete"
        ? "ANALYSIS COMPLETE"
        : this.phase === "paused"
          ? "PROGRESS SAVED"
          : waiting
            ? "PACING REQUESTS"
            : "LIVE ANALYSIS";
    $("#run-progress", this.root).classList.toggle("is-live", this.busy);
    const alternatives = $("#run-paid-options", this.root);
    const longWait =
      this.phase !== "complete" &&
      !!plan &&
      (plan.quotaDays > 1 || plan.durationCeilingMs >= 3600000);
    $("#run-paid-comparison", this.root).hidden = !longWait;
    const comparison = longWait ? this.comparison() : "";
    $("#run-paid-comparison summary", this.root).textContent =
      "Compare paid providers";
    if (alternatives.innerHTML !== comparison)
      alternatives.innerHTML = comparison;
    $("#run-calls", this.root).textContent = u.calls.toLocaleString();
    $("#run-tokens", this.root).textContent = u.totalTokens.toLocaleString();
    $("#run-cost", this.root).textContent =
      u.estimatedCostUSD === null ? "Unknown" : money(u.estimatedCostUSD);
    const remaining = Math.max(
        plan?.durationMs || 0,
        waiting ? this.waitingUntil - Date.now() : 0,
      ),
      upper = Math.max(plan?.durationCeilingMs || 0, remaining);
    $("#run-time", this.root).textContent =
      this.phase === "complete"
        ? "Complete"
        : `${duration(remaining)}–${duration(upper)}`;
    $("#run-detail", this.root).textContent =
      this.phase === "complete"
        ? `Finished in ${duration(u.elapsedMs)}. Every displayed relationship has quoted evidence.`
        : `${done} of ${total} planned sections completed · ${duration(u.elapsedMs)} elapsed${waiting ? ` · Next request in ${Math.ceil((this.waitingUntil - Date.now()) / 1000)} seconds` : ""}${this.phase === "paused" ? " · Continue analysis to resume saved sections; refresh requires your key again." : ""}`;
    $("#run-usage-note", this.root).textContent =
      `Reported: ${u.inputTokens.toLocaleString()} input + ${u.outputTokens.toLocaleString()} output tokens${u.cachedInputTokens ? ` (${u.cachedInputTokens.toLocaleString()} cached input)` : ""}. ${u.unknownCalls ? `${u.unknownCalls} request(s) have no usage report; their token count and charge are unknown.` : "Charges are estimated from reported usage and your selected plan; your provider’s invoice is authoritative."} Evidence Atlas fee: $0.`;
  }
  private makeAnalysis(
    graph: KnowledgeGraph,
    state: Analysis["state"],
  ): Analysis {
    const config = this.provider.config(),
      sources = attachProvenance(graph, this.doc!, this.doc!.passages);
    return {
      version: 1,
      id: this.draftId,
      name: this.doc!.name.replace(/\.[^.]+$/, ""),
      documentName: this.doc!.name,
      createdAt: this.analysis?.createdAt || new Date().toISOString(),
      provider: config.provider,
      model: config.model,
      concepts: this.concepts.map((c) => ({ ...c, aliases: [...c.aliases] })),
      graph,
      sources,
      papers: this.papers,
      usage: this.currentUsage(),
      state,
      settings: this.viewer
        ? this.viewer.snapshot()
        : {
            theme:
              document.documentElement.dataset.theme === "light"
                ? "light"
                : "dark",
            layout: "cose",
            nodeShape: "circle",
            physics: true,
            confidence: 0,
            hiddenTypes: [],
          },
      stats: {
        documentCharacters: this.doc!.characters,
        sentCharacters: sources.reduce((n, p) => n + p.text.length, 0),
        passages: sources.length,
        estimatedTokens: this.usage.totalTokens,
      },
      warnings: [...this.doc!.warnings],
    };
  }
  private async liveGraph(graph: KnowledgeGraph) {
    if (!graph.nodes.length) return;
    const analysis = this.makeAnalysis(graph, "building");
    await this.showAnalysis(analysis);
    this.renderProgress();
  }
  private renderReceipt(analysis: Analysis) {
    const u = analysis.usage,
      target = $("#analysis-usage", this.root);
    target.hidden = !u || analysis.state === "building";
    if (!u) return;
    const excluded =
      analysis.papers?.filter((p) => p.status === "failed") || [];
    target.innerHTML = `<details class="receipt-details"><summary>${u.calls} calls · ${u.totalTokens.toLocaleString()} reported tokens · ${u.estimatedCostUSD === null ? "charge unknown" : money(u.estimatedCostUSD) + " USD estimate"} <span>API usage ↓</span></summary>${noticeList(
      [
        {
          label: "Tokens",
          text: `${u.inputTokens.toLocaleString()} input + ${u.outputTokens.toLocaleString()} output = ${u.totalTokens.toLocaleString()} reported tokens.`,
        },
        { label: "Elapsed", text: duration(u.elapsedMs) },
        {
          label: "Provider",
          text: `${u.estimatedCostUSD === null ? "Charge unknown" : money(u.estimatedCostUSD) + " USD estimated"}. Final billing may differ.`,
        },
        { label: "App fee", text: "Evidence Atlas: $0." },
        ...(u.unknownCalls
          ? [
              {
                label: "Missing usage",
                text: `${u.unknownCalls} call(s) have no report. Tokens and charges are incomplete.`,
              },
            ]
          : []),
        ...(u.billing === "free" && u.estimatedCostUSD === 0
          ? [
              {
                label: "Free tier",
                text: "Assumes your account is eligible and within quota.",
              },
            ]
          : []),
        ...(excluded.length
          ? [
              {
                label: "Excluded papers",
                text:
                  excluded.map((p) => p.name).join(", ") +
                  ". No text from these papers was used.",
              },
            ]
          : []),
      ],
    )}</details>`;
  }

  private options(): ExtractionOptions {
    const number = (id: string, min: number, max: number, fallback: number) => {
      const input = $<HTMLInputElement>("#" + id, this.root),
        parsed = Number(input.value);
      const value = Number.isFinite(parsed)
        ? Math.max(min, Math.min(max, Math.round(parsed)))
        : fallback;
      input.value = String(value);
      return value;
    };
    const auto = Math.min(
      defaults.contextTokens,
      requestPolicy(this.provider.config())?.contextTokens ??
        defaults.contextTokens,
    );
    const contextInput = $<HTMLInputElement>("#context-budget", this.root);
    if (
      !this.restoring &&
      this.automaticContext !== null &&
      this.automaticContext !== auto &&
      Number(contextInput.value) === this.automaticContext
    )
      contextInput.value = String(auto);
    this.automaticContext = auto;
    const options = {
      maxNodes: number("max-nodes", 2, 1500, defaults.maxNodes),
      maxEdges: number("max-edges", 1, 5000, defaults.maxEdges),
      contextTokens: number(
        "context-budget",
        500,
        12000,
        defaults.contextTokens,
      ),
      includeInferred: $<HTMLInputElement>("#include-inferred", this.root)
        .checked,
    };
    const config = this.provider.config(),
      safe = safeOptions(config, options),
      policy = requestPolicy(config);
    const factor = Math.max(
      1,
      this.papers.filter((p) => p.status !== "failed").length,
    );
    safe.maxNodes = Math.min(
      options.maxNodes,
      (policy?.maxNodes || 150) * factor,
    );
    safe.maxEdges = Math.min(
      options.maxEdges,
      (policy?.maxEdges || 500) * factor,
    );
    for (const [id, value, max] of [
      ["max-nodes", safe.maxNodes, (policy?.maxNodes || 150) * factor],
      ["max-edges", safe.maxEdges, (policy?.maxEdges || 500) * factor],
      ["context-budget", safe.contextTokens, policy?.contextTokens || 12000],
    ] as const) {
      const input = $<HTMLInputElement>("#" + id, this.root);
      input.value = String(value);
      input.max = String(max);
    }
    $("#provider-budget", this.root).hidden = !policy;
    $("#provider-budget", this.root).textContent = policy
      ? `Request limits: ${policy.maxNodes * factor} concepts, ${policy.maxEdges * factor} relationships, ${policy.contextTokens.toLocaleString()} context tokens. Calls are paced; account limits may vary.`
      : "";
    return safe;
  }
  private message(text: string, error = false) {
    const status = $("#status", this.root);
    status.hidden = false;
    status.innerHTML = statusNotice(text, error);
    status.className = error ? "status error" : "status";
    status.setAttribute("role", error ? "alert" : "status");
    if (this.busy && this.controller) {
      $("#run-stage", this.root).textContent = text;
      this.renderProgress();
    }
  }
  private setBusy(busy: boolean, ai = false) {
    this.busy = busy;
    $<HTMLFieldSetElement>("#workflow-inputs", this.root).disabled = busy;
    $<HTMLButtonElement>("#import-analysis", this.root).disabled = busy;
    $("#cancel-request", this.root).hidden = !busy || !ai;
    $<HTMLButtonElement>("#analyze", this.root).disabled =
      busy || !this.doc || !this.concepts.some((c) => c.selected);
    $<HTMLButtonElement>("#new-analysis").disabled = busy;
    this.root.classList.toggle("is-generating", busy && ai);
    this.viewer?.setReadOnly(busy && ai);
    this.updateNavigation();
    if (!busy) {
      if (this.runStarted) {
        this.usage.elapsedMs += Date.now() - this.runStarted;
        this.runStarted = 0;
      }
      if (this.phase !== "complete" && this.controller) {
        this.phase = "paused";
        if (this.analysis) this.analysis.state = "paused";
        void this.flushDraft().catch(() => {});
      }
      this.controller = null;
      if (this.analysis) {
        this.analysis.usage = this.currentUsage();
        this.renderReceipt(this.analysis);
      }
    }
    this.renderProgress();
  }
  private async upload(files: File[]) {
    if (!files.length || files.length > maxPapers) {
      this.message(
        `Choose up to ${maxPapers} files. Your current work is kept.`,
        true,
      );
      return;
    }
    if (this.doc || this.analysis || this.papers.length) {
      try {
        await this.newAnalysis();
      } catch {
        return;
      }
    }
    this.setBusy(true);
    $("#parse-progress", this.root).hidden = false;
    $("#parse-detail", this.root).textContent = "Preparing local parser…";
    this.papers = [];
    this.doc = null;
    this.concepts = [];
    this.extractionProgress = undefined;
    this.discoveryProgress = undefined;
    this.discoverySignature = "";
    this.renderConcepts();
    this.updateContext();
    try {
      const result = await parseCollection(
        files,
        (text) => {
          $("#parse-detail", this.root).textContent = text;
          this.message(text);
        },
        (entries) => {
          this.papers = entries.map((e) => e.paper);
          this.renderDocument();
        },
      );
      this.doc = result.document;
      this.papers = result.papers;
      this.pdfFiles.clear();
      for (const [index, file] of files.entries()) {
        const paper = result.papers[index];
        if (paper.status !== "failed" && /\.pdf$/i.test(file.name))
          this.pdfFiles.set(paper.id, file);
      }
      const count = this.papers.filter((p) => p.status !== "failed").length;
      $<HTMLInputElement>("#max-nodes", this.root).value = String(
        defaults.maxNodes * Math.max(1, count),
      );
      $<HTMLInputElement>("#max-edges", this.root).value = String(
        defaults.maxEdges * Math.max(1, count),
      );
      this.renderDocument();
      this.message(
        count
          ? `${count} paper${count === 1 ? "" : "s"} ready. Tell us what you’d like to explore.${count < files.length ? ` ${files.length - count} excluded file(s) are listed above.` : ""}`
          : files.length === 1
            ? `${this.papers[0]?.name || files[0].name}: ${this.papers[0]?.error || "Unreadable file"} This file is excluded.`
            : "None of these papers could be read, including automatic OCR. See each file’s reason above.",
        !count,
      );
      if (this.keywords().trim()) this.addTerms();
    } catch (error) {
      this.message(readableError(error), true);
    } finally {
      $("#parse-progress", this.root).hidden = true;
      this.setBusy(false);
      this.updateContext();
      $<HTMLInputElement>("#document-file", this.root).value = "";
      this.scheduleSave();
    }
  }
  private addTerms() {
    const terms = parseTerms($<HTMLTextAreaElement>("#terms", this.root).value);
    const map = new Map(this.concepts.map((c) => [c.label.toLowerCase(), c]));
    for (const c of terms)
      if (!map.has(c.label.toLowerCase())) map.set(c.label.toLowerCase(), c);
    this.concepts = [...map.values()].slice(0, 150);
    this.renderConcepts();
    this.updateContext();
    this.scheduleSave();
  }
  private renderConcepts() {
    const query = $<HTMLInputElement>(
        "#concept-search",
        this.root,
      ).value.toLowerCase(),
      selected = this.concepts.filter((c) => c.selected).length;
    $(".concept-review", this.root).hidden = !this.concepts.length;
    $("#concept-count", this.root).textContent =
      `${selected} / ${this.concepts.length} selected`;
    $("#concepts", this.root).innerHTML =
      this.concepts
        .map((c, i) => ({ c, i }))
        .filter(({ c }) =>
          (c.label + " " + c.type).toLowerCase().includes(query),
        )
        .map(
          ({ c, i }) =>
            `<label class="concept-chip ${c.selected ? "selected" : ""}"><input type="checkbox" data-index="${i}" ${c.selected ? "checked" : ""}><span>${esc(c.label)}<small>${esc(c.type)}</small></span></label>`,
        )
        .join("") || '<p class="fine-print">No concepts to show.</p>';
  }
  private context(): ContextSelection | null {
    return this.doc
      ? selectContext(this.doc, this.concepts, this.options().contextTokens)
      : null;
  }
  private updateContext() {
    const selection = this.context(),
      selected = this.concepts.filter((c) => c.selected).length,
      options = this.options();
    const discoveryMode = true;
    $("#discovery-estimate", this.root).hidden = !discoveryMode;
    $("#discovery-preview", this.root).hidden = !discoveryMode;
    const discoveryPassages = this.discoveryPassages();
    $("#discovery-passages", this.root).textContent = discoveryPassages
      .map(
        (p) =>
          `[${p.id}] ${p.page ? "PDF page " + p.page + " · Paragraph " + p.paragraph : "Paragraph " + p.paragraph}: ${p.text}`,
      )
      .join("\n\n");
    const batches = this.doc
      ? coverageBatches(this.doc, options.contextTokens)
      : [];
    $("#discovery-estimate", this.root).textContent =
      `${batches.length} paper sections will be reviewed in small requests. Preview shows the first section. Relationships are checked separately; output tokens are additional.`;
    $("#context-estimate", this.root).innerHTML =
      `<div><strong>${this.doc?.characters.toLocaleString() || "—"}</strong><span>document characters</span></div><div><strong>${selection?.passages.length || "—"}</strong><span>selected passages</span></div><div><strong>${selection?.passages.length ? (selection.estimatedTokens + 1000 + selected * 35).toLocaleString() : "—"}</strong><span>approx. input tokens</span></div>`;
    $("#preview-count", this.root).textContent =
      (selection?.passages.length || 0) + " passages";
    $("#selected-passages", this.root).innerHTML =
      selection?.passages
        .map(
          (p) =>
            `<article><strong>${p.page ? "PDF page " + p.page + " · Paragraph " + p.paragraph : "Paragraph " + p.paragraph} · ${esc(p.section)}</strong><small>${esc(p.terms.join(" · "))}</small><p>${esc(p.text)}</p></article>`,
        )
        .join("") ||
      '<p class="fine-print">No context selected yet. Add terms found in the document.</p>';
    this.renderEstimate();
    $("#context-note", this.root).textContent = this.doc
      ? `All parsed sections are reviewed. Preview shows keyword matches. ${selection?.missing.length ? "Not found: " + selection.missing.join(", ") + ". " : ""}${selected > options.maxNodes ? "Increase the concept limit or select fewer concepts." : ""} Token estimates vary by model.`
      : "Upload a paper to preview evidence.";
    this.analysisReady = !!this.doc;
    this.updateNavigation();
    this.updateAvailability();
  }
  private updateAvailability() {
    const config = this.provider.config(),
      policy = requestPolicy(config);
    const state = requestGuard.availability(
      config,
      policy && freeProvider(config)
        ? policy.inputTokens + policy.outputTokens
        : 0,
    );
    $<HTMLButtonElement>("#analyze", this.root).disabled =
      this.busy ||
      !this.analysisReady ||
      !config.key ||
      !this.provider.validCapacity() ||
      state.blocked;
  }
  private focus() {
    return $<HTMLTextAreaElement>("#focus", this.root).value;
  }
  private keywords() {
    return $<HTMLTextAreaElement>("#terms", this.root).value;
  }
  private signature() {
    const c = this.provider.config();
    return JSON.stringify([
      "coverage-v2",
      this.doc?.name,
      this.doc?.characters,
      this.doc?.passages.map((p) => p.id),
      this.focus(),
      this.keywords(),
      c.provider,
      c.model,
      c.endpoint,
      this.options(),
    ]);
  }
  private localSeeds() {
    if (!this.doc) return [];
    const explicit = parseTerms(this.keywords()).filter((c) =>
      this.doc!.passages.some((p) => occurrences(p.text, c.label).length),
    );
    return explicit.slice(0, this.options().maxNodes);
  }

  private discoveryPassages() {
    return this.doc
      ? coverageBatches(this.doc, this.options().contextTokens)[0] || []
      : [];
  }
  private async discover(inPipeline = false) {
    if (!this.doc || !this.provider.config().key)
      throw new Error("Upload a paper and enter your API key first.");
    if (!inPipeline) {
      this.controller = new AbortController();
      this.beginRun("discovery");
      this.setBusy(true, true);
    }
    try {
      const result = await discoverCoverage(
        this.aiProvider(),
        this.doc,
        this.localSeeds(),
        this.options(),
        this.focus(),
        this.controller!.signal,
        async (stage) => {
          this.message(stage);
        },
        async (concepts, progress) => {
          this.discoveryProgress = { ...progress, signature: this.signature() };
          this.concepts = concepts.slice(0, this.options().maxNodes);
          this.renderConcepts();
          if (inPipeline)
            await this.liveGraph({
              nodes: this.concepts.map((c, i) => ({
                id: `n${i + 1}`,
                label: c.label,
                type: c.type,
                aliases: [...c.aliases],
              })),
              edges: [],
            });
          this.logActivity(
            `Read ${progress.completed.length} section(s) · ${this.concepts.length} grounded concepts`,
          );
          await this.flushDraft();
        },
        this.discoveryProgress?.signature === this.signature()
          ? this.discoveryProgress
          : undefined,
      );
      this.concepts = result.concepts;
      if (!this.concepts.length)
        throw new Error(
          "No document-grounded concepts found. Try a more specific focus.",
        );
      this.discoveryCoverage = {
        batches: result.batches,
        discovered: result.discovered,
        omitted: result.omitted,
      };
      this.discoverySignature = this.signature();
      this.renderConcepts();
      this.updateContext();
      await this.flushDraft();
      this.message(
        `${this.concepts.length} document-grounded concepts discovered. You can refine them before building the graph.`,
      );
    } finally {
      if (!inPipeline) {
        this.setBusy(false);
        this.updateContext();
      }
    }
  }
  private async waitForProvider(
    stage = "Building relationships",
    reservedTokens = 0,
  ) {
    const signal = this.controller!.signal;
    while (true) {
      if (signal.aborted)
        throw new Error("Request cancelled. Your progress is saved.");
      const config = this.provider.config();
      const state = requestGuard.availability(config, reservedTokens);
      if (!state.blocked) {
        this.waitingUntil = 0;
        return;
      }
      this.waitingUntil = state.retryAt;
      this.renderProgress();
      if (!state.retryAt || state.retryAt - Date.now() > 120000)
        throw new Error(
          state.reason +
            " Your concepts are saved; continue when your quota resets.",
        );
      this.message(state.reason + ` Your progress is saved. ${stage}`);
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(new Error("Request cancelled. Your progress is saved."));
        };
        const timer = window.setTimeout(
          () => {
            signal.removeEventListener("abort", abort);
            resolve();
          },
          Math.min(1000, state.retryAt - Date.now()),
        );
        signal.addEventListener("abort", abort, { once: true });
      });
    }
  }
  private async analyze() {
    if (!this.doc || !this.provider.config().key) {
      this.message("Upload a paper and enter your API key first.", true);
      return;
    }
    this.controller = new AbortController();
    this.beginRun(
      this.discoverySignature === this.signature()
        ? "relationships"
        : "discovery",
    );
    this.setBusy(true, true);
    this.goStep(3);
    requestAnimationFrame(() =>
      $("#run-progress", this.root).scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
    try {
      if (this.discoverySignature !== this.signature())
        await this.discover(true);
      const context = this.context();
      if (!context?.passages.length)
        throw new Error(
          "No matching passages found for the selected concepts.",
        );
      if (
        this.concepts.filter((c) => c.selected).length > this.options().maxNodes
      )
        throw new Error("Select fewer concepts before building the graph.");
      this.phase = "relationships";
      const config = this.provider.config();
      const extractionSignature = JSON.stringify([
        this.signature(),
        this.concepts.filter((c) => c.selected),
      ]);
      const result = await extractCoverage(
        this.aiProvider(),
        this.doc,
        this.concepts,
        this.options(),
        this.controller!.signal,
        async (stage) => {
          this.message(stage);
        },
        async (progress) => {
          this.extractionProgress = {
            ...progress,
            signature: extractionSignature,
          };
          const nodes = this.concepts
            .filter((c) => c.selected)
            .map((c, i) => ({
              id: `n${i + 1}`,
              label: c.label,
              type: c.type,
              aliases: [...c.aliases],
            }));
          await this.liveGraph({
            nodes,
            edges: progress.edges.slice(0, this.options().maxEdges),
          });
          this.logActivity(
            `Checked ${progress.completed.length} section(s) · ${progress.edges.length} evidence-backed connections`,
          );
          await this.flushDraft();
        },
        this.extractionProgress?.signature === extractionSignature
          ? this.extractionProgress
          : undefined,
      );
      const { graph, warnings } = result;
      if (this.discoveryCoverage.omitted.length)
        warnings.push(
          `${this.discoveryCoverage.omitted.length} additional grounded concepts exceed Maximum concepts: ${this.discoveryCoverage.omitted.join(", ")}. Increase the limit to retain them.`,
        );
      this.message("Validating evidence and building visualization…");
      const sources = attachProvenance(graph, this.doc, result.passages);
      const analysis = this.makeAnalysis(graph, "complete");
      analysis.sources = sources;
      analysis.coverage = {
        discoveryBatches: this.discoveryCoverage.batches,
        relationshipBatches: result.calls,
        reviewedPassages: this.doc.passages.length,
        totalPassages: this.doc.passages.length,
        discoveredConcepts: this.discoveryCoverage.discovered,
        omittedConcepts: this.discoveryCoverage.omitted,
      };
      analysis.warnings = [...this.doc.warnings, ...warnings];
      this.phase = "complete";
      this.logActivity(
        "Source validation complete · ready to explore and export",
      );
      this.extractionProgress = undefined;
      await this.showAnalysis(analysis);
      this.renderProgress();
      await this.flushDraft();
      try {
        await history.save(analysis);
        this.historyChanged();
        this.message(
          `Graph ready: ${graph.nodes.length} concepts, ${graph.edges.length} validated relationships. Saved only in this browser.`,
        );
      } catch (e) {
        this.message("Graph ready. " + readableError(e), true);
      }
    } catch (e) {
      this.message(readableError(e), true);
    } finally {
      this.setBusy(false);
      this.updateContext();
    }
  }
  async openSaved(analysis: Analysis) {
    await this.newAnalysis();
    this.draftId = analysis.id;
    await this.showAnalysis(analysis);
    await this.flushDraft();
  }
  async showAnalysis(analysis: Analysis) {
    this.analysis = analysis;
    $("#graph-result", this.root).hidden = false;
    $("#analysis-title", this.root).textContent = analysis.name;
    $("#analysis-meta", this.root).textContent =
      `${analysis.graph.nodes.length} concepts · ${analysis.graph.edges.length} relationships · ${analysis.provider} / ${analysis.model}`;
    this.renderReceipt(analysis);
    $("#graph-result .eyebrow", this.root).textContent =
      analysis.state === "building"
        ? "YOUR GRAPH, TAKING SHAPE"
        : analysis.state === "paused"
          ? "PROGRESS SAVED"
          : "ANALYSIS COMPLETE";
    $("#graph-warnings", this.root).innerHTML = analysis.warnings.length
      ? `<details class="source-notes"><summary>Source notes · ${analysis.warnings.length}</summary><ul class="notice-bullets">${analysis.warnings.map((w) => `<li class="graph-warning">${esc(w)}</li>`).join("")}</ul></details>`
      : "";
    if (this.viewer && this.viewer.analysis.id === analysis.id) {
      this.viewer.updateLive(analysis);
      this.viewer.setReadOnly(this.busy);
      this.goStep(3);
      return;
    }
    this.viewer?.destroy();
    const { GraphViewer } = await import("../graph/viewer");
    this.viewer = new GraphViewer(
      $("#graph-root", this.root),
      analysis,
      () => {
        this.updateAnalysisHeading();
        this.scheduleSave();
      },
      { files: this.pdfFiles },
    );
    this.viewer.setReadOnly(this.busy);
    this.goStep(3);
    if (!this.busy)
      requestAnimationFrame(() =>
        $("#graph-result", this.root).scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
  }
  setTheme(theme: "dark" | "light") {
    this.viewer?.setTheme(theme);
    this.scheduleSave();
  }
  private snapshot() {
    if (!this.analysis || !this.viewer) return null;
    return { ...this.analysis, settings: this.viewer.snapshot() };
  }
  private updateAnalysisHeading() {
    if (!this.analysis) return;
    $("#analysis-meta", this.root).textContent =
      `${this.analysis.graph.nodes.length} concepts · ${this.analysis.graph.edges.length} relationships · ${this.analysis.provider} / ${this.analysis.model}`;
  }
  private updateNavigation() {
    const active = this.step === 3;
    $("#workspace-composer", this.root).hidden = active;
    $("#edit-setup", this.root).hidden = !active || this.busy;
    $("#graph-result", this.root).hidden = !active || !this.analysis;
    $("#graph-placeholder", this.root).hidden = !active || !!this.analysis;
    this.root.dataset.stage = active ? "analysis" : "setup";
  }
  goStep(step: number) {
    if (step !== 3 && this.busy) return;
    this.step = step === 3 ? 3 : 0;
    this.updateNavigation();
    this.scheduleSave();
  }
  private renderDocument() {
    const papers = this.papers.length ? this.papers : this.doc?.papers || [];
    this.root.classList.toggle("has-papers", papers.length > 0);
    $("#document-summary", this.root).hidden = !this.doc && !papers.length;
    $("#text-preview", this.root).hidden = !this.doc;
    if (papers.length) {
      $("#document-summary", this.root).innerHTML =
        `<div class="paper-list-heading"><strong>Uploaded papers and parsed content</strong><button type="button" class="text-button" data-clear-papers>Clear all</button></div><div class="paper-collection" aria-label="Uploaded papers">${papers.map((p) => `<article class="paper-row ${p.status}"><span class="paper-icon">${p.status === "failed" ? "!" : "▤"}</span><div><strong>${esc(p.name)}</strong><small>${p.status === "failed" ? `Excluded · ${esc(p.error || "Unreadable file")}` : `${p.pages ? p.pages + " pages · " : "paragraph references · "}${p.characters.toLocaleString()} characters · Parsed locally${p.ocrPages.length ? " · automatic OCR on " + p.ocrPages.length + " page(s)" : ""}${p.skippedPages.length ? " · excluded pages " + p.skippedPages.join(", ") : ""}`}</small></div><span class="paper-status">${p.status === "failed" ? "Excluded" : p.status === "partial" ? "Partially included" : "Included"}</span><button type="button" class="paper-remove" data-remove-paper="${esc(p.id)}" aria-label="Remove ${esc(p.name)} and its parsed content" title="Remove paper and parsed content">×</button></article>`).join("")}</div>`;
    } else if (this.doc)
      $("#document-summary", this.root).innerHTML =
        `<div class="paper-list-heading"><strong>Uploaded paper and parsed content</strong><button type="button" class="text-button" data-clear-papers>Clear all</button></div><div class="document-card"><span>▤</span><div><strong>${esc(this.doc.name)}</strong><small>${this.doc.pages ? this.doc.pages + " pages · " : ""}${this.doc.characters.toLocaleString()} characters · Parsed locally</small></div><i>✓</i></div>`;
    if (this.doc)
      $("#extracted-text", this.root).textContent = this.doc.passages
        .slice(0, 12)
        .map(
          (p) =>
            `${p.paperName ? p.paperName + " · " : ""}${p.page ? "PDF page " + p.page + " · " : ""}Paragraph ${p.paragraph}\n${p.text}`,
        )
        .join("\n\n");
  }
  private async removePaper(id: string) {
    if (!id || this.busy) return;
    await this.flushDraft();
    const removed = this.papers.find((paper) => paper.id === id);
    if (!removed) return;
    this.papers = this.papers.filter((paper) => paper.id !== id);
    this.pdfFiles.delete(id);
    if (this.doc) {
      const remaining = new Set(this.papers.map((paper) => paper.id));
      const passages = this.doc.passages.filter((passage) =>
        passage.paperId
          ? remaining.has(passage.paperId)
          : passage.paperName !== removed.name,
      );
      this.doc = this.papers.length
        ? {
            ...this.doc,
            name:
              this.papers.length === 1
                ? this.papers[0].name
                : `${this.papers.length} research papers`,
            pages: this.papers.reduce((sum, paper) => sum + paper.pages, 0),
            characters: this.papers.reduce(
              (sum, paper) => sum + paper.characters,
              0,
            ),
            passages,
            papers: this.papers,
            warnings: this.doc.warnings.filter(
              (warning) => !warning.startsWith(`${removed.name}:`),
            ),
            ocrPages: this.papers.flatMap((paper) => paper.ocrPages),
            skippedPages: this.papers.flatMap((paper) => paper.skippedPages),
          }
        : null;
    }
    this.resetAnalysisForSources();
    this.renderDocument();
    this.updateContext();
    this.scheduleSave();
    this.message(`${removed.name} and its parsed content were removed.`);
  }
  private async clearPapers() {
    if (this.busy || (!this.papers.length && !this.doc)) return;
    await this.flushDraft();
    this.papers = [];
    this.doc = null;
    this.pdfFiles.clear();
    this.resetAnalysisForSources();
    this.renderDocument();
    this.updateContext();
    this.scheduleSave();
    this.message("Uploaded papers and parsed content were removed.");
  }
  private resetAnalysisForSources() {
    this.viewer?.destroy();
    this.viewer = null;
    this.analysis = null;
    this.phase = "idle";
    this.activity = [];
    this.discoveryProgress = undefined;
    this.extractionProgress = undefined;
    this.discoverySignature = "";
    this.concepts = [];
    this.draftId = crypto.randomUUID();
    this.renderConcepts();
    this.goStep(0);
  }
  private draft(): Draft | null {
    if (
      !this.doc &&
      !this.focus().trim() &&
      !this.keywords().trim() &&
      !this.analysis &&
      !this.papers.length
    )
      return null;
    const config = this.provider.config();
    return {
      id: this.draftId,
      name: this.doc?.name || this.analysis?.name || "Untitled research",
      updatedAt: new Date().toISOString(),
      status:
        this.analysis &&
        (!this.analysis.state || this.analysis.state === "complete")
          ? "complete"
          : "ongoing",
      step: this.step,
      focus: this.focus(),
      keywords: this.keywords(),
      document: this.doc,
      concepts: this.concepts,
      options: this.options(),
      provider: {
        provider: config.provider,
        model: config.model,
        endpoint: config.endpoint,
        billing: config.billing,
        capacity: config.capacity,
      },
      analysis: this.snapshot(),
      discoverySignature: this.discoverySignature,
      discoveryCoverage: this.discoveryCoverage,
      extractionProgress: this.extractionProgress,
      discoveryProgress: this.discoveryProgress,
      papers: this.papers,
      usage: this.currentUsage(),
    };
  }
  private scheduleSave() {
    if (this.restoring) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(
      () => void this.flushDraft().catch(() => {}),
      250,
    );
  }
  async flushDraft() {
    clearTimeout(this.saveTimer);
    const draft = this.draft();
    if (!draft) return this.writes;
    const copy = structuredClone(draft);
    this.writes = this.writes
      .catch(() => {})
      .then(async () => {
        try {
          await drafts.save(copy);
          if (copy.analysis && copy.status === "complete")
            await history.save(copy.analysis);
          $("#draft-state").textContent = "Saved in this browser";
          this.historyChanged();
        } catch (error) {
          $("#draft-state").textContent = "Could not save — keep this tab open";
          this.message(readableError(error), true);
          throw error;
        }
      });
    return this.writes;
  }
  async newAnalysis() {
    if (this.busy) return;
    await this.flushDraft();
    this.restoring = true;
    this.viewer?.destroy();
    this.viewer = null;
    this.pdfFiles.clear();
    this.analysis = null;
    this.doc = null;
    this.papers = [];
    this.usage = emptyUsage();
    this.phase = "idle";
    this.activity = [];
    $("#run-activity", this.root).innerHTML = "";
    this.discoveryProgress = undefined;
    this.concepts = [];
    this.extractionProgress = undefined;
    this.draftId = crypto.randomUUID();
    this.discoverySignature = "";
    this.discoveryCoverage = { batches: 0, discovered: 0, omitted: [] };
    for (const id of ["focus", "terms", "concept-search"])
      $<HTMLInputElement>("#" + id, this.root).value = "";
    for (const [id, value] of [
      ["max-nodes", defaults.maxNodes],
      ["max-edges", defaults.maxEdges],
      ["context-budget", defaults.contextTokens],
    ] as const)
      $<HTMLInputElement>("#" + id, this.root).value = String(value);
    $<HTMLInputElement>("#include-inferred", this.root).checked = false;
    this.provider.clear();
    this.renderDocument();
    this.renderConcepts();
    this.updateContext();
    this.goStep(0);
    this.renderProgress();
    $("#status", this.root).hidden = true;
    $("#draft-state").textContent = "Your work stays in this browser";
    this.restoring = false;
  }
  async resume(draft: Draft) {
    if (this.busy) return;
    await this.flushDraft();
    this.restoring = true;
    this.pdfFiles.clear();
    this.draftId = draft.id;
    this.doc = draft.document;
    this.comparisonCache = null;
    this.papers = draft.papers || draft.document?.papers || [];
    this.usage = draft.usage || draft.analysis?.usage || emptyUsage();
    this.phase =
      draft.status === "complete"
        ? "complete"
        : this.usage.calls
          ? "paused"
          : "idle";
    this.discoveryProgress = draft.discoveryProgress;
    this.concepts = draft.concepts;
    this.discoverySignature = draft.discoverySignature;
    this.extractionProgress = draft.extractionProgress;
    this.discoveryCoverage = draft.discoveryCoverage || {
      batches: 0,
      discovered: 0,
      omitted: [],
    };
    this.viewer?.destroy();
    this.viewer = null;
    this.pdfFiles.clear();
    this.analysis = null;
    $<HTMLTextAreaElement>("#focus", this.root).value = draft.focus;
    $<HTMLTextAreaElement>("#terms", this.root).value = draft.keywords;
    this.provider.restore(draft.provider);
    for (const [id, value] of [
      ["max-nodes", draft.options.maxNodes],
      ["max-edges", draft.options.maxEdges],
      ["context-budget", draft.options.contextTokens],
    ] as const)
      $<HTMLInputElement>("#" + id, this.root).value = String(value);
    $<HTMLInputElement>("#include-inferred", this.root).checked =
      draft.options.includeInferred;
    this.renderDocument();
    this.renderConcepts();
    this.updateContext();
    if (draft.analysis) await this.showAnalysis(draft.analysis);
    this.goStep(draft.analysis ? 3 : 0);
    this.restoring = false;
    this.renderProgress();
    this.message(
      "Work restored. Enter your API key again when you’re ready to use AI.",
    );
  }
  private async save() {
    const a = this.snapshot();
    if (!a) return;
    try {
      await this.flushDraft();
      this.historyChanged();
      this.message("Analysis and graph settings saved in this browser.");
    } catch (e) {
      this.message(readableError(e), true);
    }
  }
  private async export(format: "html" | "json") {
    const a = this.snapshot();
    if (!a) return;
    try {
      await exportAnalysis(a, format);
      this.message(
        `${format.toUpperCase()} export downloaded. API keys and the original document are excluded.`,
      );
    } catch (e) {
      this.message(readableError(e), true);
    }
  }
}
