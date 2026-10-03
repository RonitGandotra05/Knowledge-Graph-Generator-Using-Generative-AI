import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const origin = "https://evidence-atlas.netlify.app";
const sitemap = await readFile("dist/sitemap.xml", "utf8");
const robots = await readFile("dist/robots.txt", "utf8");
assert.match(robots, /User-agent: \*/);
assert.match(robots, /Allow: \//);
assert(!/Disallow: \//.test(robots), "Public pages must be crawlable");
assert(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
assert.deepEqual(urls.sort(), [`${origin}/`, `${origin}/guide/`].sort());
for (const path of ["/", "/guide/"]) {
  const html = await readFile(`dist${path}index.html`, "utf8");
  assert(
    html.includes(`rel="canonical" href="${origin}${path}"`),
    `${path}: canonical URL`,
  );
  assert.match(html, /<title>[^<]*Knowledge Graph[^<]*<\/title>/i);
  assert.match(html, /name="description"/);
  assert.match(html, /name="robots" content="index, follow/);
  assert.match(html, /property="og:image"/);
  assert.match(html, /<h1[ >]/);
  assert.match(html, /<a[^>]+href="(?:\/)?#workspace"/);
  const blocks = [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ];
  assert(blocks.length, `${path}: structured data is present`);
  for (const [, json] of blocks) {
    const data = JSON.parse(json);
    assert.equal(data["@context"], "https://schema.org");
    assert(
      !/aggregateRating|reviewRating/.test(json),
      "Do not fabricate ratings",
    );
  }
}
const home = await readFile("dist/index.html", "utf8");
assert.match(home, /Turn research papers into interactive knowledge graphs/);
assert.match(home, /href="\/guide\/"/);
assert.match(home, /id="home-start"/);
await access("dist/social-card.png");
console.log(
  "SEO checks passed: readable HTML, canonical pages, metadata, structured data, robots, sitemap and share image.",
);
