import { noticeList } from "./notices";
import { safeCapacity, capacityProfile } from "../providers/capacity";
import { $, escapeHTML as esc, readableError } from "./dom";
import {
  LLMProvider,
  geminiModelId,
  providers,
  type ProviderConfig,
  type ProviderId,
} from "../providers/client";
import { requestGuard, requestPolicy, freeProvider } from "../providers/limits";
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
      <div class="key-label"><label for="api-key">API key</label><span class="key-info"><button id="key-info" type="button" aria-label="API key privacy" aria-describedby="key-privacy" aria-controls="key-privacy" aria-expanded="false">ⓘ</button><span id="key-privacy" class="key-tooltip" role="tooltip"><strong>API key privacy</strong>Never saved. Cleared on refresh.</span></span></div>
      <div class="key-input"><input id="api-key" type="password" placeholder="Enter your API key" autocomplete="off" spellcheck="false"><button type="button" id="reveal-key" aria-label="Reveal API key">Show</button></div>
      <div class="key-controls"><span class="fine-print">Cleared on refresh.</span><button type="button" id="clear-key" class="text-button">Clear key</button></div>
      <label id="billing-plan-label" hidden>API plan<select id="billing-plan"><option value="standard">Paid / not sure</option><option value="free">Using a free tier</option></select><small>Free estimates apply only to eligible models/accounts. Your key does not reveal your plan.</small></label>
      <details class="connection-options"><summary>Models & connection options</summary><p id="provider-note" class="fine-print"></p><p id="provider-links" class="fine-print" hidden><a id="provider-key-link" target="_blank" rel="noopener noreferrer"></a> · <a id="provider-limits-link" target="_blank" rel="noopener noreferrer">Usage limits</a></p>
      <div id="capacity-options" hidden><div id="capacity-note" class="fine-print"></div><label><input id="custom-capacity" type="checkbox"> Use my dashboard rate limits</label><div id="capacity-fields" class="provider-grid" hidden><label>Requests / minute<input id="capacity-rpm" type="number" min="1" max="100000" step="1"></label><label>Tokens / minute<input id="capacity-tpm" type="number" min="1" max="1000000000" step="1"></label><label>Requests / day<input id="capacity-rpd" type="number" min="0" max="1000000000" step="1"><small>0 = no daily cap configured</small></label></div><p class="fine-print">Use limits from your provider dashboard. For Claude, enter the smaller of input and output TPM for conservative pacing; its separate quotas still apply. We keep 20% headroom; shared usage can reduce capacity.</p></div><div class="provider-actions"><button type="button" id="check-key" class="button secondary small">Check key & load models</button><span class="fine-print">Optional. No document text sent.</span></div></details><p id="request-state" class="fine-print" role="status"></p>`;
    $("#provider", root).addEventListener("change", () => {
      this.changeProvider();
      this.changed();
    });
    $("#model", root).addEventListener("change", () => {
      this.recommendation();
      this.capacity();
      this.changed();
      this.availability();
    });
    $("#recommended-model", root).addEventListener("click", () => {
      $<HTMLInputElement>("#model", root).value =
        providers[this.config().provider].models[0];
      this.recommendation();
      this.capacity();
      this.changed();
      this.availability();
    });
    $("#billing-plan", root).addEventListener("change", () => {
      this.capacity();
      this.changed();
    });
    ["custom-capacity", "capacity-rpm", "capacity-tpm", "capacity-rpd"].forEach(
      (id) =>
        $("#" + id, root).addEventListener("change", () => {
          $("#capacity-fields", root).hidden = !$<HTMLInputElement>(
            "#custom-capacity",
            root,
          ).checked;
          this.changed();
          this.availability();
        }),
    );
    $("#endpoint", root).addEventListener("change", () => {
      this.clearKey();
      this.capacity();
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
    const keyInfo = $(".key-info", root),
      keyButton = $("#key-info", root);
    keyButton.addEventListener("click", () => {
      keyInfo.classList.remove("is-dismissed");
      const open = keyInfo.classList.toggle("is-open");
      keyButton.setAttribute("aria-expanded", String(open));
      if (!open) keyInfo.classList.add("is-dismissed");
    });
    for (const event of ["pointerenter", "focusin"])
      keyInfo.addEventListener(event, () =>
        keyInfo.classList.remove("is-dismissed"),
      );
    const dismissKeyInfo = () => {
      keyInfo.classList.remove("is-open");
      keyInfo.classList.add("is-dismissed");
      keyButton.setAttribute("aria-expanded", "false");
    };
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") dismissKeyInfo();
    });
    document.addEventListener("pointerdown", (e) => {
      if (!(e.target as Element).closest(".key-info")) dismissKeyInfo();
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
        const config = this.config();
        const client = new LLMProvider(config);
        const current = () => {
          const now = this.config();
          return (
            now.provider === config.provider &&
            now.key === config.key &&
            now.model === config.model &&
            now.endpoint === config.endpoint
          );
        };
        const models = await client.listModels();
        if (!current()) return;
        if (config.provider === "gemini") {
          this.message(
            `Checking structured JSON with ${geminiModelId(config.model)}…`,
          );
          while (true) {
            if (!current()) return;
            const state = requestGuard.availability(config);
            if (!state.blocked) break;
            if (!state.retryAt || state.retryAt - Date.now() > 20000)
              throw new Error(state.reason);
            await new Promise((resolve) =>
              setTimeout(
                resolve,
                Math.max(1, Math.min(1000, state.retryAt! - Date.now())),
              ),
            );
          }
          await client.checkStructuredOutput();
          if (!current()) return;
        }
        $("#models", root).innerHTML = models
          .map(
            (m) =>
              `<option value="${esc(m)}" label="${m === providers[this.config().provider].models[0] ? "Recommended" : ""}">`,
          )
          .join("");
        this.message(
          config.provider === "gemini"
            ? `Key accepted. ${geminiModelId(config.model)} passed structured JSON generation. ${models.length} text model IDs listed; account access can vary.`
            : `Key accepted. ${models.length} model IDs available; choose a model supporting structured extraction.`,
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
    const custom = safeCapacity(config.capacity);
    $<HTMLInputElement>("#custom-capacity", this.root).checked = !!custom;
    if (custom)
      for (const id of ["rpm", "tpm", "rpd"] as const)
        $<HTMLInputElement>("#capacity-" + id, this.root).value = String(
          custom[id],
        );
    this.capacity();
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
      capacity:
        [
          "openai",
          "gemini",
          "anthropic",
          "groq",
          "cerebras",
          "compatible",
        ].includes($<HTMLSelectElement>("#provider", this.root).value) &&
        $<HTMLInputElement>("#custom-capacity", this.root).checked
          ? safeCapacity({
              rpm: Number(
                $<HTMLInputElement>("#capacity-rpm", this.root).value,
              ),
              tpm: Number(
                $<HTMLInputElement>("#capacity-tpm", this.root).value,
              ),
              rpd: Number(
                $<HTMLInputElement>("#capacity-rpd", this.root).value,
              ),
            })
          : undefined,
      billing:
        ["groq", "gemini"].includes(
          $<HTMLSelectElement>("#provider", this.root).value,
        ) && $<HTMLSelectElement>("#billing-plan", this.root).value === "free"
          ? "free"
          : "standard",
    };
  }
  validCapacity() {
    return (
      ![
        "openai",
        "gemini",
        "anthropic",
        "groq",
        "cerebras",
        "compatible",
      ].includes(this.config().provider) ||
      !$<HTMLInputElement>("#custom-capacity", this.root).checked ||
      !!this.config().capacity
    );
  }
  private capacity() {
    const config = this.config(),
      profile = capacityProfile({ ...config, capacity: undefined });
    $("#capacity-options", this.root).hidden =
      config.provider === "compatible" && !profile;
    $("#capacity-note", this.root).innerHTML = profile
      ? noticeList([
          { label: "Quota basis", text: profile.label },
          {
            label: "Per minute",
            text: `${profile.rpm} requests · ${profile.tpm.toLocaleString()} ${profile.inputOnly ? "input " : ""}tokens`,
          },
          { label: "Checked", text: "2026-10-03" },
        ])
      : "Enter your dashboard limits for an account-specific estimate. This model’s quotas are unknown.";
    if (!$<HTMLInputElement>("#custom-capacity", this.root).checked && profile)
      for (const id of ["rpm", "tpm", "rpd"] as const)
        $<HTMLInputElement>("#capacity-" + id, this.root).value = String(
          profile[id],
        );
    $("#capacity-fields", this.root).hidden = !$<HTMLInputElement>(
      "#custom-capacity",
      this.root,
    ).checked;
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
        ? "First run: GPT-OSS 20B recommended."
        : "Choose a model available to your account. Presets are editable.";
    $("#recommended-model", this.root).hidden =
      !["groq", "cerebras", "gemini"].includes(config.provider) ||
      config.model === p.models[0];
  }
  private availability() {
    const config = this.config(),
      policy = requestPolicy(config);
    const state = requestGuard.availability(
      config,
      policy && freeProvider(config)
        ? policy.inputTokens + policy.outputTokens
        : 0,
    );
    const checkState = requestGuard.availability(config);
    $("#request-state", this.root).textContent = config.key
      ? !this.validCapacity()
        ? "Enter valid whole-number dashboard limits."
        : state.reason
      : "";
    $<HTMLButtonElement>("#check-key", this.root).disabled =
      this.checking ||
      !config.key ||
      !this.validCapacity() ||
      checkState.blocked;
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
    $(".provider-actions .fine-print", this.root).textContent =
      config.provider === "gemini"
        ? "Optional. Small JSON generation uses your API quota. No document text sent."
        : "Optional. No document text sent.";
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
    $<HTMLInputElement>("#custom-capacity", this.root).checked = false;
    this.capacity();
    this.clearKey();
    this.recommendation();
  }
}
