# Third-party notices

The permission-required [application license](LICENSE) applies to original Evidence Atlas code. It does **not** replace the licenses of dependencies or claim ownership of uploaded research, quotations, or materials in `legacy/`.

| Runtime library                                                  | Purpose                                  | Upstream license |
| ---------------------------------------------------------------- | ---------------------------------------- | ---------------- |
| [Cytoscape.js](https://github.com/cytoscape/cytoscape.js)        | Graph rendering, interaction and layouts | MIT              |
| [PDF.js](https://github.com/mozilla/pdf.js)                      | PDF text and page rendering              | Apache-2.0       |
| [Mammoth](https://github.com/mwilliamson/mammoth.js)             | Raw DOCX text extraction                 | BSD-2-Clause     |
| [Tesseract.js](https://github.com/naptha/tesseract.js)           | Browser OCR                              | Apache-2.0       |
| [Tesseract.js Core](https://github.com/naptha/tesseract.js-core) | OCR WebAssembly engine                   | Apache-2.0       |

`package-lock.json` records installed versions and transitive dependency license metadata. `scripts/dependency-notices.mjs` collects the installed runtime packages’ license/notice texts during the build, including their transitive dependencies. The static distribution contains `dist/licenses/THIRD-PARTY-NOTICES.txt`, the application terms, and this overview. Optional platform packages appear only when installed.

Standalone graph HTML includes the complete Cytoscape copyright and MIT notice in its bundled viewer, along with retained upstream legal comments. HTML exports have no external dependencies or network requests. The application’s license explicitly permits sharing generated exports, including the viewer needed to display them; it does not grant permission to extract that viewer as a separate software product.

English OCR language data is downloaded from the configured Tesseract language-data host when required; it is not committed to this repository. The upstream data retains its own terms. Papers and quotations likewise retain their authors’ or publishers’ rights. Original legacy examples remain preserved with their existing notices.

Build and development tools keep their own upstream licenses. This inventory documents dependencies; it is not a claim that all third-party works belong to the application’s author.
