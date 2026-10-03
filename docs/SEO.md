# Search visibility

Public website: [Evidence Atlas](https://evidence-atlas.netlify.app/). The [research graph guide](https://evidence-atlas.netlify.app/guide/) explains uploading papers, reviewing evidence, editing, exports and privacy.

## Implemented

- The homepage ships its visible content and links in the initial HTML response, without requiring JavaScript. The app attaches its controls without replacing that content.
- Relevant titles and descriptions describe an AI knowledge graph generator for research. Each public page has one canonical HTTPS URL, with permanent redirects for `index.html` aliases.
- [robots.txt](https://evidence-atlas.netlify.app/robots.txt) permits crawling and advertises the [XML sitemap](https://evidence-atlas.netlify.app/sitemap.xml).
- The sitemap contains the homepage and guide. Workspace and sample hashes are application views, not separate indexable documents. Private drafts and uploaded documents have no public URLs.
- The homepage and guide link to each other. The guide opens in another tab from the app so active research continues.
- WebSite, SoftwareApplication and WebPage structured data describe actual features and application pricing. No reviews, star ratings or testimonials are invented.
- Open Graph and Twitter metadata use the site's original 1200 × 630 sharing image.
- Build checks enforce public HTML, canonical links, metadata, valid structured JSON, robots, sitemap and the share asset. Browser checks cover JavaScript disabled, mobile layout and preserved workspace state.

## Connect Google Search Console

Google account ownership verification cannot be completed from the Netlify login alone:

1. Open [Google Search Console](https://search.google.com/search-console) and add the URL-prefix property `https://evidence-atlas.netlify.app/`.
2. Choose HTML tag verification. Add the exact supplied `google-site-verification` meta tag to the homepage's head, then commit and push it. This verification value is public, not an API key.
3. Verify ownership, submit `sitemap.xml`, and use URL Inspection to request indexing for `/` and `/guide/`.
4. Monitor indexing, search queries, impressions and clicks. Use PageSpeed Insights and Search Console's Core Web Vitals report to guide improvements using measured results.

A sitemap is a discovery signal, not proof that Google has crawled or indexed a page. See Google's [JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [sitemap documentation](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) and [Search Console setup](https://developers.google.com/search/docs/monitor-debug/search-console-start).

## Improve relevance over time

Publish useful examples only when their source references and permissions can be checked. Seek genuine references from relevant research projects, documentation and communities; do not buy links, mass-submit directories or manufacture reviews. Real feedback can improve the product, but there is no universal SEO “rating” to increase.

Ranking first for a broad term such as “knowledge graph” cannot be promised. This site is more specifically relevant to research PDF analysis and evidence-linked graph generation. Google's [ranking systems](https://developers.google.com/search/docs/appearance/ranking-systems-guide) evaluate relevance and quality; neither structured data nor additional links guarantees a position.
