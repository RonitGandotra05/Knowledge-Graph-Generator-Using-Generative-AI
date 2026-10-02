export const homePage = /* HTML */ `<section
  id="home"
  aria-label="Welcome to Evidence Atlas"
>
  <div class="hero">
    <div class="hero-copy">
      <div class="eyebrow">
        <span class="status-dot"></span>KNOWLEDGE HIDES IN THE CONNECTIONS
      </div>
      <h1>Your paper.<br />A new<br /><em>perspective.</em></h1>
      <p>
        Turn research papers into interactive knowledge graphs. Uncover
        relationships, trace the evidence, and see how the ideas fit together.
      </p>
      <div class="hero-actions">
        <a class="button primary" href="#workspace"
          >Map your research <span aria-hidden="true">↗</span></a
        ><button id="home-demo" class="button ghost">
          Explore a sample <span aria-hidden="true">→</span>
        </button>
      </div>
      <div class="hero-footnote">
        <span>◇ Parsed locally</span><span>⌁ Your AI provider</span
        ><span>↧ Export &amp; keep</span>
      </div>
    </div>
    <div class="hero-visual">
      <div class="visual-tag">
        <span class="status-dot"></span>LIVE CONNECTIONS / NEW PERSPECTIVES
      </div>
      <svg
        viewBox="0 0 600 450"
        role="img"
        aria-label="Illustrative connections between a gut microbiome, biomarkers, machine learning, and gene features"
      >
        <g fill="none" stroke="var(--border)" stroke-width="1">
          <circle cx="295" cy="230" r="100" />
          <circle cx="295" cy="230" r="162" />
          <circle cx="295" cy="230" r="214" />
          <path d="M30 230H570M295 25V435" stroke-dasharray="3 7" />
        </g>
        <g fill="none" stroke="#78dcbc" stroke-opacity=".38">
          <path
            d="M295 230 133 145 295 72 400 132 430 326 295 230 180 320 133 145M295 72 295 230 400 132 512 212 430 326 295 230M180 320 295 230M133 145 225 112 295 72M180 320 200 403 295 230 409 406 430 326"
          />
        </g>
        <g fill="var(--surface)" stroke="#78dcbc" stroke-opacity=".4">
          <circle cx="133" cy="145" r="20" />
          <circle cx="295" cy="72" r="11" />
          <circle cx="400" cy="132" r="18" />
          <circle cx="430" cy="326" r="20" />
          <circle cx="180" cy="320" r="16" />
          <circle cx="295" cy="230" r="31" />
          <circle cx="225" cy="112" r="6" />
          <circle cx="512" cy="212" r="8" />
          <circle cx="200" cy="403" r="8" />
          <circle cx="409" cy="406" r="8" />
        </g>
        <g fill="#78dcbc">
          <circle cx="133" cy="145" r="7" />
          <circle cx="430" cy="326" r="8" />
          <circle cx="180" cy="320" r="6" />
          <circle cx="295" cy="230" r="13" />
        </g>
        <g fill="#a5a0fa">
          <circle cx="295" cy="72" r="4" />
          <circle cx="400" cy="132" r="7" />
        </g>
        <g
          fill="var(--muted)"
          font-family="system-ui, sans-serif"
          font-size="11"
          text-anchor="middle"
        >
          <text x="133" y="109">Autism spectrum disorder</text>
          <text x="400" y="99">Gene features</text>
          <text x="295" y="286">Gut microbiome</text>
          <text x="180" y="357">Microbial biomarkers</text>
          <text x="430" y="369">Machine learning</text>
        </g>
        <g
          fill="var(--muted)"
          font-family="system-ui, sans-serif"
          font-size="9"
        >
          <text transform="translate(192 187) rotate(28)">associated with</text>
          <text transform="translate(323 207) rotate(-44)">reveals</text>
          <text transform="translate(335 274) rotate(35)">analyzed using</text>
        </g>
      </svg>
      <div class="visual-footer">
        <span>CONCEPT → RELATIONSHIP → EVIDENCE</span
        ><span>ILLUSTRATIVE GRAPH</span>
      </div>
    </div>
  </div>
  <div class="feature-strip">
    <article>
      <i>01 / EXPLORE</i>
      <h3>Your paper, your focus</h3>
      <p>Upload your research and describe what you want to understand.</p>
    </article>
    <article>
      <i>02 / CONNECT</i>
      <h3>Find the relationships</h3>
      <p>Discover ideas and connections with your chosen AI provider.</p>
    </article>
    <article>
      <i>03 / VERIFY</i>
      <h3>Follow the evidence</h3>
      <p>Inspect supporting quotations, paragraphs, and PDF pages.</p>
    </article>
    <article>
      <i>04 / KEEP</i>
      <h3>Make it yours</h3>
      <p>Edit your graph and export it as an image or interactive HTML.</p>
    </article>
  </div>
  <footer class="home-footer">
    <span>Your paper, connected.</span>
    <div class="footer-links">
      <button data-info="privacy">Privacy</button
      ><button data-info="security">API key security</button
      ><button data-info="terms">Terms of use</button>
    </div>
  </footer>
</section>`;
