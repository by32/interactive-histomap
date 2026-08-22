# Deploying to GitHub Pages

The repository ships a workflow at `.github/workflows/deploy.yml` that builds the site and
deploys it to GitHub Pages on every push to `main`, `master`, or any `claude/**` branch
(the branch this project was developed on is the repository's default branch until a `main`
is created). You can also run it manually from the Actions tab (*workflow_dispatch*).

## One-time setup

1. Open the repository on GitHub → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push any commit (or re-run the latest *Deploy to GitHub Pages* run from the Actions tab).

The site then publishes at:

> **https://by32.github.io/interactive-histomap/**

Until step 2 is done, the deploy job fails with a "Pages site not found /
Get Pages site failed" error — that is expected, not a build problem. Enabling Pages
cannot be done by the workflow itself with the default `GITHUB_TOKEN`; it needs the one
manual click above.

## Notes

- The Vite build is configured with `base: '/interactive-histomap/'`; if the repository is
  ever renamed, update `vite.config.ts` to match.
- If the default branch changes later, keep the `github-pages` environment's
  deployment-branch policy in sync (Settings → Environments → github-pages).

## If the workflow file is missing

Git credentials without the `workflows` scope cannot push files under `.github/workflows/`.
If that happened, the same YAML lives at `docs/github-pages-workflow.yml` — copy it into
place from any environment with normal permissions:

```sh
mkdir -p .github/workflows
git mv docs/github-pages-workflow.yml .github/workflows/deploy.yml
git commit -m "Add Pages deploy workflow" && git push
```
