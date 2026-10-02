import { $, escapeHTML as esc, readableError } from "./dom";
import {
  LLMProvider,
  providers,
  type ProviderConfig,
  type ProviderId,
} from "../providers/client";
import { requestGuard, requestPolicy } from "../providers/limits";
import { clearLegacyKeys } from "../storage/history";
export class ProviderForm {
  private checking = false;
  constructor(
    private root: HTMLElement,
    private message: (text: string, error?: boolean) => void,
    private changed: () => void = () => {},
  ) {
    clearLegacyKeys();
    root.innerHTML = `<div class="section-head"><div><span class="panel-icon" aria-hidden="true">✧</span><h2>Connect your AI</h2></div><span class="section-note">Direct to your provider</span></div>
      <div class="provider-grid"><label>Provider<select id="provider">${Object.entries(
        providers,
      )
        .filter(([id]) => id !== "cerebras")
        .map(([id, p]) => `<option value="${id}">${esc(p.label)}</option>`)
        .join("")}</select></label>
      <label>Model ID<input id="model" list="models" autocomplete="off"><datalist id="models"></datalist></label></div>
      <p id="model-recommendation" class="fine-print"></p><button id="recommended-model" type="button" class="text-button" hidden>Use recommended model</button>
      <p id="provider-start" class="fine-print">For a first run, <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">Groq</a> offers a free tier. Usage limits apply.</p>
      <label id="endpoint-label" hidden>API base URL<input id="endpoint" type="url" value="https://api.groq.com/openai/v1" placeholder="https://your-provider.example/v1"><small>Your key and context go to this address. Only use a trusted endpoint with browser CORS.</small></label>
      <div class="key-label"><label for="api-key">API key</label><span class="key-info"><button id="key-info" type="button" aria-label="API key privacy" aria-describedby="key-privacy">ⓘ</button><span id="key-privacy" class="key-tooltip" role="tooltip">Memory only. No browser storage. Refresh clears your key.</span></span></div>
      <div class="key-input"><input id="api-key" type="password" placeholder="Enter your API key" autocomplete="off" spellcheck="false"><button type="button" id="reveal-key" aria-label="Reveal API key">Show</button></div>
      <div class="key-controls"><span class="fine-print">Cleared on refresh.</span><button type="button" id="clear-key" class="text-button">Clear key</button></div>
      <label id="billing-plan-label" hidden>API plan<select id="billing-plan"><option value="standard">Paid / not sure</option><option value="free">Using a free tier</option></select><small>Used for cost estimates only. We cannot read your billing plan.</small></label>
      <details class="connection-options"><summary>Models & connection options</summary><p id="provider-note" class="fine-print"></p><p id="provider-links" class="fine-print" hidden><a id="provider-key-link" target="_blank" rel="noopener noreferrer"></a> · <a id="provider-limits-link" target="_blank" rel="noopener noreferrer">Usage limits</a></p>
      <div class="provider-actions"><button type="button" id="check-key" class="button secondary small">Check key & load models</button><span class="fine-print">Optional. No document text sent.</span></div></details><p id="request-state" class="fine-print" role="status"></p>`;
    $("#provider", root).addEventListener("change", () => {
      this.changeProvider();
      this.changed();
    });
    $("#model", root).addEventListener("change", () => {
      this.recommendation();
      this.changed();
      this.availability();
    });
    $("#recommended-model", root).addEventListener("click", () => {
      $<HTMLInputElement>("#model", root).value =
        providers[this.config().provider].models[0];
      this.recommendation();
      this.changed();
      this.availability();
    });
    $("#billing-plan", root).addEventListener("change", () => this.changed());
    $("#endpoint", root).addEventListener("change", () => {
      this.clearKey();
      this.changed();
    });
    $("#reveal-key", root).addEventListener("click", () => {
      const input = $<HTMLInputElement>("#api-key", root),
        show = input.type === "password";
      input.type = show ? "text" : "password";
      $("#reveal-key", root).textContent = show ? "Hide" : "Show";
      $("#reveal-key", root).setAttribute(
        "aria-label",
        show ? "Hide API key" : "Reveal API key",
      );
    });
    $("#key-info", root).addEventListener("click", () =>
      $(".key-info", root).classList.toggle("is-open"),
    );
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        $(".key-info", root).classList.remove("is-open");
        (document.activeElement as HTMLElement)?.blur();
      }
    });
    document.addEventListener("pointerdown", (e) => {
      if (!(e.target as Element).closest(".key-info"))
        $(".key-info", root).classList.remove("is-open");
    });
    $("#api-key", root).addEventListener("input", () => {
      this.availability();
      this.changed();
    });
    $("#clear-key", root).addEventListener("click", () => {
      this.clearKey();
      this.changed();
      this.message("API key cleared.");
    });
    $("#check-key", root).addEventListener("click", async () => {
      this.checking = true;
      this.availability();
      try {
        const models = await new LLMProvider(this.config()).listModels();
        $("#models", root).innerHTML = models
          .map(
            (m) =>
              `<option value="${esc(m)}" label="${m === providers[this.config().provider].models[0] ? "Recommended" : ""}">`,
          )
          .join("");
        this.message(
          `Key accepted. ${models.length} model IDs available; choose a model supporting structured extraction.`,
        );
      } catch (e) {
        this.message(readableError(e), true);
      } finally {
        this.checking = false;
        this.availability();
      }
    });
    requestGuard.subscribe(() => this.availability());
    window.setInterval(() => this.availability(), 1000);
    this.changeProvider();
  }
  restore(config: Omit<ProviderConfig, "key">) {
    $<HTMLSelectElement>("#provider", this.root).value =
      config.provider === "cerebras" ? "compatible" : config.provider;
    this.changeProvider();
    $<HTMLInputElement>("#model", this.root).value = config.model;
    $<HTMLInputElement>("#endpoint", this.root).value = config.endpoint;
    $<HTMLSelectElement>("#billing-plan", this.root).value =
      config.billing || "standard";
    this.recommendation();
    this.availability();
  }
  clear() {
    this.clearKey();
  }
  config(): ProviderConfig {
    return {
      provider: $<HTMLSelectElement>("#provider", this.root)
        .value as ProviderId,
      key: $<HTMLInputElement>("#api-key", this.root).value.trim(),
      model: $<HTMLInputElement>("#model", this.root).value.trim(),
      endpoint: $<HTMLInputElement>("#endpoint", this.root).value.trim(),
      billing:
        ["groq", "gemini"].includes(
          $<HTMLSelectElement>("#provider", this.root).value,
        ) && $<HTMLSelectElement>("#billing-plan", this.root).value === "free"
          ? "free"
          : "standard",
    };
  }
  private clearKey() {
    $<HTMLInputElement>("#api-key", this.root).value = "";
    $<HTMLInputElement>("#api-key", this.root).type = "password";
    $("#reveal-key", this.root).textContent = "Show";
    $("#reveal-key", this.root).setAttribute("aria-label", "Reveal API key");
    this.availability();
  }
  private recommendation() {
    const config = this.config(),
      p = providers[config.provider];
    $("#model-recommendation", this.root).textContent =
      config.provider === "groq"
        ? "Recommended: GPT-OSS 20B for a first run. GPT-OSS 120B is also supported."
        : "Choose a model supporting structured output. Presets are editable and account-dependent.";
    $("#recommended-model", this.root).hidden =
      !["groq", "cerebras"].includes(config.provider) ||
      config.model === p.models[0];
  }
  private availability() {
    const config = this.config(),
      policy = requestPolicy(config);
    const state = requestGuard.availability(
      config,
      policy ? policy.inputTokens + policy.outputTokens : 0,
    );
    const checkState = requestGuard.availability(config);
    $("#request-state", this.root).textContent = config.key ? state.reason : "";
    $<HTMLButtonElement>("#check-key", this.root).disabled =
      this.checking || !config.key || checkState.blocked;
  }
  private changeProvider() {
    const config = this.config(),
      p = providers[config.provider];
    $<HTMLInputElement>("#model", this.root).value = p.models[0];
    $("#models", this.root).innerHTML = p.models
      .map(
        (m, i) =>
          `<option value="${esc(m)}" label="${i === 0 && ["groq", "cerebras"].includes(config.provider) ? "Recommended" : ""}">`,
      )
      .join("");
    $("#endpoint-label", this.root).hidden = config.provider !== "compatible";
    $("#billing-plan-label", this.root).hidden = !["groq", "gemini"].includes(
      config.provider,
    );
    $<HTMLSelectElement>("#billing-plan", this.root).value = "standard";
    $("#provider-note", this.root).textContent = p.note;
    $("#provider-links", this.root).hidden = !p.keyUrl;
    const keyLink = $<HTMLAnchorElement>("#provider-key-link", this.root),
      limitsLink = $<HTMLAnchorElement>("#provider-limits-link", this.root);
    if (p.keyUrl && p.limitsUrl) {
      keyLink.href = p.keyUrl;
      keyLink.textContent = `Get a ${p.label} API key`;
      limitsLink.href = p.limitsUrl;
    } else {
      keyLink.removeAttribute("href");
      limitsLink.removeAttribute("href");
    }
    $<HTMLInputElement>("#api-key", this.root).placeholder =
      `Enter your ${p.label} API key`;
    this.clearKey();
    this.recommendation();
  }
}
