# Cloudflare Pages Deployment

The authorized Cloudflare account is `73b73674d8e5a551f49cedbc8e754872` (Webertechdevs@gmail.com's Account). A Pages project named `onfonticket` was created on 2026-10-31 with the public subdomain `https://onfonticket.pages.dev`.

The configured build is `pnpm install --frozen-lockfile && pnpm build`, with `dist` as the output directory and `main` as the production branch. The project currently has no deployment until the built assets are uploaded or the GitHub source is connected.

Cloudflare API sources used:
- Pages projects: https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/list/
- Pages direct deployment: https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/methods/create/
- Pages continuous direct upload: https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/

The GitHub transfer for the Manus project is a separate workflow and is currently awaiting confirmation. No secret token is stored in this repository.
