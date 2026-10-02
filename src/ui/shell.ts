import { homePage } from "./home";
export const appShell = /* HTML */ `<header class="app-header">
    <a class="brand" href="#home" aria-label="Evidence Atlas home"
      ><img src="${import.meta.env.BASE_URL}favicon.svg" alt="" /><span
        >evidence<span class="brand-light">atlas</span
        ><small>RESEARCH, CONNECTED</small></span
      ></a
    >
    <nav id="home-nav" aria-label="Homepage navigation">
      <a href="#workspace">Workspace</a
      ><button data-history>Local history</button
      ><button data-info="how">How it works</button
      ><button id="home-theme" aria-label="Switch to light mode">◐</button>
    </nav>
    <div class="header-right">
      <a id="home-start" class="button secondary" href="#workspace"
        >Start mapping ↗</a
      >
      <div id="workspace-header">
        <span id="draft-state" role="status"
          >Your work stays in this browser</span
        ><button id="new-analysis" class="button secondary small">
          New graph +
        </button>
      </div>
      <button
        id="menu-toggle"
        aria-label="Open menu"
        aria-expanded="false"
        aria-controls="app-menu"
      >
        ☰
      </button>
    </div>
    <nav id="app-menu" hidden aria-label="Application menu">
      <button id="show-history">History</button
      ><button id="theme-toggle">Switch to light mode</button
      ><button id="explore-demo">Try a sample</button
      ><button data-info="how">How it works</button
      ><button data-info="privacy">Privacy</button
      ><button data-info="security">API key security</button
      ><button data-info="terms">Terms of use</button>
    </nav>
  </header>
  <main>
    ${homePage}
    <section id="workspace" hidden></section>
    <section id="demo-section" hidden>
      <div class="result-heading">
        <div>
          <h2>A sample research graph</h2>
          <p>Curated from the uploaded paper. No AI request.</p>
        </div>
        <button id="close-demo" class="button secondary small">
          Back to my work
        </button>
      </div>
      <div id="demo-graph"></div>
    </section>
  </main>
  <dialog
    id="history-dialog"
    class="library-dialog"
    aria-labelledby="history-title"
  >
    <div class="result-heading">
      <div>
        <h2 id="history-title">Your graphs</h2>
        <p>Pick up where you left off. Saved only in this browser.</p>
      </div>
      <button id="close-history" aria-label="Close history">×</button>
    </div>
    <div id="history-items"></div>
    <div class="history-pagination">
      <button id="history-prev" class="button secondary small">Previous</button
      ><span id="history-page"></span
      ><button id="history-next" class="button secondary small">Next</button>
    </div>
    <button id="clear-history" class="text-button">Delete all history</button>
  </dialog>
  <dialog id="info-dialog">
    <button class="dialog-close" aria-label="Close information">×</button>
    <h2></h2>
    <p></p>
  </dialog>
  <dialog id="confirm-dialog">
    <h2>Delete all local work?</h2>
    <p>This removes saved graphs and unfinished drafts from this browser.</p>
    <div class="dialog-actions">
      <button id="cancel-delete" class="button secondary">Cancel</button
      ><button id="confirm-delete" class="button primary">
        Delete all history
      </button>
    </div>
  </dialog>`;
