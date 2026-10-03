# Evidence Atlas deployment

**Live website:** https://evidence-atlas.netlify.app

Deployed and verified on **3 October 2026**, as a separate project in the existing MotionLabz team. The existing `nearbycivic` and `motionlabzz` sites retained their names, published deployments, domains and status.

## Free plan

The account is on Netlify Free, with 300 shared credits per billing month. This production deployment used 15 credits; the verified balance after deployment and smoke checks was **209.91 credits remaining**. There are no credit add-ons, and automatic top-up is disabled. Usage across the team's websites shares this balance.

Netlify documents [production deployment and traffic credit costs](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/) and the [Free plan's hard limit](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/). Check the current team balance before publishing again.

## What is hosted

Only the built `dist` directory is published: static HTML, styles, JavaScript, PDF/OCR workers and third-party notices. No source PDFs, API keys, local history, source files or dependencies are uploaded. There are no serverless or edge functions. User documents are parsed in their browser; AI requests go directly to their selected provider.

`netlify.toml` defines the build and immutable caching for hashed assets. The local CLI link is ignored under `.netlify/`. Git-based continuous deployment was not connected.

## Redeploy this project

From this repository, after reviewing changes and checking the team's remaining credits:

```sh
npm run build
netlify deploy --prod --dir dist --no-build \
  --site b2427916-2263-4025-8151-3f26556ac370
```

The explicit site ID prevents accidentally publishing to another linked project. Each production deployment consumes credits, even with a local build.

## Hosted verification

- Public HTTPS homepage and workspace load without authentication.
- Local document parsing and provider estimates work on the hosted workspace.
- Two intercepted AI responses produced an evidence-linked graph and a downloaded offline HTML export. This smoke test made no real AI API calls.
- PDF worker, OCR worker/WASM and third-party notices return successfully with the expected content types.
- Hashed assets have immutable caching; the browser reported no page errors.
- The authenticated account confirmed the new project is Free, its deployment is ready, and both existing sites are unchanged.
