import { homePage } from "./home";
const menuIcon = (drawing: string) =>
  `<svg class="app-menu-icon" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${drawing}</svg>`;
export const appShell = /* HTML */ `<header class="app-header">
    <a class="brand" href="#home" aria-label="Evidence Atlas home"
      ><img src="./favicon.svg" alt="" width="34" height="34" /><span
        >evidence<span class="brand-light">atlas</span
        ><small>RESEARCH, CONNECTED</small></span
      ></a
    >
    <div class="header-right">
      <div id="workspace-header">
        <span id="draft-state" role="status">Work stays in this browser</span>
      </div>
      <a
        class="header-guide"
        href="/guide/"
        target="_blank"
        rel="noopener"
        aria-label="How to use — research graph guide (opens in a new tab)"
        >How to use ↗</a
      >
      <button
        id="menu-toggle"
        aria-label="Open menu"
        aria-expanded="false"
        aria-controls="app-menu"
      >
        <span class="menu-icon" aria-hidden="true"><i></i><i></i><i></i></span>
      </button>
    </div>
    <nav id="app-menu" hidden aria-label="Application menu">
      <button id="show-history">
        ${menuIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}<span
          >History</span
        >
      </button>
      <button id="theme-toggle">
        ${menuIcon('<circle cx="12" cy="12" r="9"/><path d="M12 3v18M12 3a9 9 0 0 1 0 18" fill="currentColor"/>')}<span
          class="app-menu-label"
          >Switch to light mode</span
        >
      </button>
      <button id="explore-demo">
        ${menuIcon('<circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><path d="M9 6h6M7.5 9l3 6M16.5 9l-3 6"/>')}<span
          >Try a sample</span
        >
      </button>
      <button data-info="privacy">
        ${menuIcon('<path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="M8 12l3 3 5-6"/>')}<span
          >Privacy</span
        >
      </button>
      <button data-info="security">
        ${menuIcon('<circle cx="8" cy="9" r="5"/><path d="M12 13l8 8M16 17l3-3M18 19l3-3"/>')}<span
          >API key security</span
        >
      </button>
      <button data-info="terms">
        ${menuIcon('<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/>')}<span
          >Terms of use</span
        >
      </button>
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
        <p>Saved in this browser. Resume, export or delete.</p>
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
  <dialog id="info-dialog" aria-labelledby="info-title">
    <div class="notice-heading">
      <h2 id="info-title"></h2>
      <button class="dialog-close" aria-label="Close information">×</button>
    </div>
    <div class="info-content"></div>
  </dialog>
  <dialog
    id="confirm-dialog"
    aria-labelledby="delete-title"
    aria-describedby="delete-description"
  >
    <h2 id="delete-title">Delete all local work?</h2>
    <p id="delete-description">
      Saved graphs and drafts will be removed from this browser. This cannot be
      undone.
    </p>
    <div class="dialog-actions">
      <button id="cancel-delete" class="button secondary">Cancel</button
      ><button id="confirm-delete" class="button danger">
        Delete all history
      </button>
    </div>
  </dialog>`;
