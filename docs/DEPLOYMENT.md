# Evidence Atlas deployment

**Live website:** https://evidence-atlas.netlify.app

Production project ID: `b2427916-2263-4025-8151-3f26556ac370`.

## Continuous integration and deployment

This site's native Netlify Git integration uses the existing repository and its `main` branch. **Pushes**, rather than local commits alone, trigger deployment. The integration has a read-only repository deploy key and a push webhook; no hosting or AI credentials are committed or placed in GitHub Actions.

- Netlify runs `npm test && npm run build`. Failed unit tests, TypeScript checks, builds or SEO checks prevent publishing.
- GitHub Actions runs formatting, unit tests, build/SEO checks and selected browser tests on pushes to `main` and pull requests. These checks run separately from the Netlify build; production does not wait for the Actions browser job.
- The build-ignore rule skips documentation-only changes. Application code, public assets, guide pages and build configuration changes trigger production builds.
- Other sites and repositories are not part of this integration.

## Free quota

The project uses Netlify Free. Production deployments and website traffic consume the team's shared credits. No paid plan, credit add-ons or automatic top-up are enabled. Check the current team balance before a large batch of pushes; the build-ignore rule avoids production charges for documentation-only changes.

See Netlify's [deployment and traffic credit costs](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/) and [Free plan limits](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/).

## What is hosted

Only built `dist` files are published: the app, public guide, search files, sharing image, workers and third-party notices. No source PDFs, test downloads, generated evaluation graphs, API keys, local history or node_modules are uploaded. The repository keeps reproducible tests and the original legacy graphs; generated benchmark measurements remain ignored locally.

There are no serverless or edge functions. Documents are parsed in the user's browser, and AI requests go directly to their chosen provider. Hashed assets use immutable caching. Canonical aliases redirect permanently to the homepage and guide. `.netlify/` local link state is ignored.

## Manual fallback

After reviewing changes, running checks and checking the current free balance:

```sh
npm test
npm run build
netlify deploy --prod --dir dist --no-build \
  --site b2427916-2263-4025-8151-3f26556ac370
```

Do not manually deploy a change that already has a successful automatic deployment; each production deployment consumes credits.

## Verification

The initial public HTTPS deployment passed local-document parsing, provider estimates, evidence-linked graph generation using intercepted AI responses, offline HTML download and worker delivery checks. The crawling update adds built HTML checks and browser tests without JavaScript. Neither test path makes paid AI calls.
