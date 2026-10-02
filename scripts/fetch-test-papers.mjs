import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
const papers = JSON.parse(
  await readFile(
    new URL("../tests/fixtures/online-papers.json", import.meta.url),
    "utf8",
  ),
);
const folder = new URL("../.artifacts/online-papers/", import.meta.url);
await mkdir(folder, { recursive: true });
const results = [];
for (const paper of papers) {
  const file = new URL(paper.id + ".pdf", folder);
  try {
    let bytes;
    try {
      await stat(file);
      bytes = await readFile(file);
      console.log("Cached " + paper.id);
    } catch {
      const response = await fetch(paper.pdf, {
        signal: AbortSignal.timeout(90000),
        headers: {
          "User-Agent":
            "EvidenceAtlas-test/1.0 (public research paper compatibility testing)",
        },
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.subarray(0, 1024).toString().includes("%PDF-"))
        throw new Error("Download is not a PDF");
      if (bytes.length > 30 * 1024 * 1024)
        throw new Error("Paper exceeds app size limit");
      await writeFile(file, bytes);
      console.log("Downloaded " + paper.id + " (" + bytes.length + " bytes)");
    }
    results.push({
      id: paper.id,
      source: paper.source,
      pdf: paper.pdf,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  } catch (error) {
    results.push({ id: paper.id, error: error.message });
    console.error(paper.id + ": " + error.message);
  }
}
await writeFile(
  new URL("downloads.json", folder),
  JSON.stringify(results, null, 2),
);
if (results.some((x) => x.error)) process.exitCode = 1;
