export const workspaceTemplate = /* HTML */ `<div class="workspace-heading">
    <div>
      <div class="eyebrow">YOUR RESEARCH / YOUR PERSPECTIVE</div>
      <h1>Research workspace</h1>
      <p>Papers, a focus, your AI. Everything you need in one place.</p>
    </div>
    <div class="workspace-actions">
      <button
        type="button"
        id="edit-setup"
        class="button secondary small"
        hidden
      >
        Research setup</button
      ><button class="text-button" id="import-analysis">Import graph</button
      ><input id="import-file" type="file" accept=".json" hidden />
    </div>
  </div>
  <div id="status" role="status" aria-live="polite" hidden></div>
  <section
    id="run-progress"
    class="mission-control"
    aria-label="Live analysis progress"
    hidden
  >
    <div class="mission-heading">
      <div>
        <span id="run-badge" class="live-badge">LIVE ANALYSIS</span>
        <h2 id="run-stage">Connecting your research</h2>
      </div>
      <button id="resume-run" class="button primary small" hidden>
        Continue analysis →</button
      ><button id="cancel-request" class="button secondary small" hidden>
        Pause & save
      </button>
    </div>
    <div class="progress-track">
      <progress
        id="run-progress-bar"
        max="100"
        value="0"
        aria-label="Analysis progress"
      ></progress
      ><span id="run-percent">0%</span>
    </div>
    <p id="run-detail" class="fine-print"></p>
    <div class="mission-metrics">
      <div><strong id="run-calls">0</strong><span>API calls</span></div>
      <div><strong id="run-tokens">0</strong><span>reported tokens</span></div>
      <div>
        <strong id="run-time">—</strong><span>time remaining · estimate</span>
      </div>
      <div>
        <strong id="run-cost">—</strong><span>provider charge · estimate</span>
      </div>
    </div>
    <details id="run-paid-comparison" class="paid-comparison" hidden>
      <summary>Paid providers can reduce this wait</summary>
      <div id="run-paid-options"></div>
    </details>
    <p id="run-usage-note" class="fine-print"></p>
    <ol
      id="run-activity"
      class="run-activity"
      aria-label="Recent analysis activity"
    ></ol>
  </section>
  <div id="workspace-composer">
    <fieldset id="workflow-inputs" class="composer-grid">
      <section class="panel" id="source-form">
        <div class="section-head">
          <div>
            <span class="panel-icon" aria-hidden="true">▤</span>
            <h2>Upload your papers</h2>
          </div>
          <span class="local-badge">● Local parsing</span>
        </div>
        <label class="upload-zone" id="drop-zone" tabindex="0"
          ><input
            id="document-file"
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,.csv,.tsv"
            hidden
          /><span class="upload-icon">↥</span
          ><strong>Drop your research papers here</strong
          ><span>or click to browse your files</span
          ><small
            >Up to 10 files · PDF, DOCX or text · 30 MB per file</small
          ></label
        >
        <p class="fine-print">
          Automatic local OCR for scanned pages. Unreadable files/pages are
          clearly listed.
        </p>
        <div id="document-summary" hidden></div>
        <details id="text-preview" hidden>
          <summary>Review extracted text</summary>
          <div id="extracted-text"></div>
          <button type="button" id="export-text" class="text-button">
            Download extracted TXT ↓
          </button>
        </details>
        <label
          >Your focus <span class="optional-label">optional</span
          ><textarea
            id="focus"
            rows="2"
            maxlength="1000"
            placeholder="e.g. Compare the proposed method, key findings and supporting evidence."
          ></textarea>
        </label>
        <p class="fine-print">
          Leave blank to explore the paper broadly, or describe what matters to
          you.
        </p>
        <div id="manual-terms">
          <label
            >A few keywords (optional)<textarea
              id="terms"
              maxlength="1000"
              rows="1"
              placeholder="e.g. attention, renewable energy, materials"
            ></textarea>
          </label>
          <div class="input-note">
            Separate keywords with commas.<button
              type="button"
              id="add-terms"
              class="text-button"
            >
              Find keywords
            </button>
          </div>
        </div>
        <details id="discovery-controls">
          <summary>Review suggested concepts</summary>
          <p class="fine-print">
            Review all readable paper sections in bounded requests. Refine
            suggestions before extracting relationships.
          </p>
          <button
            type="button"
            id="discover-concepts"
            class="button secondary full"
          >
            Discover concepts with AI ✧
          </button>
        </details>
        <details class="concept-review">
          <summary>Refine concepts (optional)</summary>
          <div class="review-toolbar">
            <span id="concept-count">0 concepts selected</span
            ><button type="button" id="select-all" class="text-button">
              All</button
            ><button type="button" id="select-none" class="text-button">
              None
            </button>
          </div>
          <input
            id="concept-search"
            aria-label="Search concepts"
            placeholder="Filter concepts or categories…"
          />
          <div id="concepts" class="concept-chips">
            <p class="fine-print">Your reviewed concepts will appear here.</p>
          </div>
        </details>
      </section>
      <section class="panel" id="provider-form"></section>
      <section class="panel context-panel">
        <div class="section-head">
          <div>
            <span class="panel-icon" aria-hidden="true">⌁</span>
            <h2>Your graph</h2>
          </div>
        </div>
        <div id="run-estimate" class="run-estimate" aria-live="polite"></div>
        <p id="provider-budget" class="fine-print" hidden></p>
        <details>
          <summary>
            Graph quality & context budget <span>Advanced</span>
          </summary>
          <div class="advanced-grid">
            <label
              >Maximum concepts<input
                id="max-nodes"
                type="number"
                min="2"
                max="150"
                value="150" /></label
            ><label
              >Maximum relationships<input
                id="max-edges"
                type="number"
                min="1"
                max="500"
                value="500" /></label
            ><label
              >Context budget (approx. tokens)<input
                id="context-budget"
                type="number"
                min="500"
                max="12000"
                step="500"
                value="6000" /></label
            ><label class="check-label"
              ><input id="include-inferred" type="checkbox" />Include
              AI-inferred relationships</label
            >
          </div>
          <p class="fine-print">
            Evidence is always required. Inferred connections use dashed lines.
            Confidence filtering is available in the graph.
          </p>
        </details>
        <details class="send-preview">
          <summary>See what gets sent to AI</summary>
          <div id="context-estimate" class="estimate-grid">
            <div><strong>—</strong><span>document characters</span></div>
            <div><strong>—</strong><span>matched passages</span></div>
            <div><strong>—</strong><span>approx. input tokens</span></div>
          </div>
          <div id="context-note" class="context-note">
            Upload a paper and select concepts to preview exactly which excerpts
            will be sent.
          </div>
          <details id="context-preview">
            <summary>
              Preview context sent to AI
              <span id="preview-count">0 passages</span>
            </summary>
            <div id="selected-passages"></div>
          </details>
          <div id="discovery-estimate" class="fine-print" hidden></div>
          <details id="discovery-preview" hidden>
            <summary>Preview first discovery section</summary>
            <div id="discovery-passages"></div>
          </details>
        </details>
        <div class="build-actions">
          <div class="send-disclosure">
            Excerpts go directly to your AI provider. You pay any API charges to
            them; Evidence Atlas charges nothing. ChatGPT subscriptions do not
            include OpenAI API usage.
          </div>
          <button id="analyze" class="button primary full" disabled>
            Build my graph <span>↗</span>
          </button>
        </div>
        <p class="fine-print center">
          Concept discovery + relationship extraction · Exports are built
          locally
        </p>
      </section>
    </fieldset>
  </div>
  <section class="panel workflow-guide" hidden id="graph-placeholder">
    <div class="orbital-icon live-orbit">⌘</div>
    <div class="eyebrow">RESEARCH, CONNECTED</div>
    <h2>Your research is<br />coming into view.</h2>
    <p>
      Concepts appear as sections are read. Verified connections follow, each
      with its quoted source.
    </p>
    <div class="guide-steps">
      <span><i>1</i> Find relevant passages</span
      ><span><i>2</i> Extract relationships</span
      ><span><i>3</i> Verify supporting text</span>
    </div>
  </section>
  <section id="graph-result" hidden>
    <div class="result-heading">
      <div>
        <div class="eyebrow">ANALYSIS COMPLETE</div>
        <h2 id="analysis-title"></h2>
        <p id="analysis-meta"></p>
      </div>
      <div class="result-actions">
        <button id="save-analysis" class="button secondary small">
          Save changes</button
        ><button id="export-json" class="button secondary small">JSON ↓</button
        ><button id="export-html" class="button primary small">HTML ↓</button>
      </div>
    </div>
    <div id="analysis-usage" class="run-receipt" hidden></div>
    <div id="graph-warnings"></div>
    <div id="graph-root"></div>
  </section>`;
