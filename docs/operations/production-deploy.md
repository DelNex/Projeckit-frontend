# Project KIT production deployment

Git-triggered Vercel deployments are disabled in `vercel.json` to avoid consuming deployment/API quota on every push. Production releases are intentionally manual.

## Required GitHub configuration

1. Add the Vercel access token as the repository or `production` environment secret named `VERCEL_TOKEN`. Do not commit or paste the token into source files.
2. Configure the GitHub `production` environment with required reviewers if a second-person release gate is desired.
3. Keep the environment restricted to the `main` branch.

The workflow pins Vercel CLI 66.2.0 and uses the already-verified Vercel project and team IDs. It runs on `workflow_dispatch` only, requires the explicit `confirm_production` checkbox, checks out `main`, runs TypeScript and the complete test suite, pulls production environment variables, builds with the production environment, and deploys that prebuilt output.

## Release procedure

1. Merge a reviewed PR into `main` only after required GitHub checks pass.
2. Open **Actions → Manual Vercel production deployment → Run workflow**.
3. Select `main` and explicitly check `confirm_production`.
4. Confirm the run completed and the workflow's production-domain HTTP check passed.

Do not run this workflow repeatedly to troubleshoot a failed build. Inspect the first failing step and correct it in a PR first. The workflow is serialized so two production releases cannot overlap.

## Current known release constraints

- The Vercel project is `projeckit`; production domain: `https://projeckit.vercel.app`.
- Git deployment is disabled by `vercel.json`.
- Vercel has previously reported a 100-deployments-per-day API limit. The exact remaining quota and billing balance are not available through the connected billing endpoint.
- The workflow requires a valid `VERCEL_TOKEN` secret. The token itself is never stored in this repository.
