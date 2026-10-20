# AGENTS.md

## Shipping

Tier: **push-and-watch**. This repo uses trunk-based development: no pull requests.

The default branch is `claude/modern-interactive-histomap-5dd3w4` (there is no `main`; confirm with `git ls-remote --symref origin HEAD`). Where the steps below say `origin/<default>`, use that branch.

1. Work in an isolated worktree or session for the task.
2. Prove it: run `npm run lint && npm run build && npm run test:film && npm test` (needs `npm ci` once; `npm test` uses Playwright's chromium and takes about 90 seconds; make sure nothing else is serving on port 4173 before pushing, because Playwright reuses an existing server); for user-visible changes also run the app end to end and say what you ran.
3. Land: `git fetch`, rebase onto `origin/claude/modern-interactive-histomap-5dd3w4`, re-run verify if new commits came in, then `git push origin HEAD:claude/modern-interactive-histomap-5dd3w4` with a 10-minute command timeout. The push runs the shipgate review (bugbot) and can take several minutes. If it is blocked, fix the `[high]` findings, commit, and push again.
4. Never use `--no-verify`, change `core.hooksPath`, set `BUGBOT_OVERRIDE`, or force-push the default branch.
5. Ask-first paths (`.shipgate.toml` itself, plus any `ask_first` entries in it) need Ben's approval before landing; stop and tell Ben.
6. After landing, watch the "Deploy to GitHub Pages" run (`gh run list --workflow deploy.yml --limit 1`, then `gh run watch`) and load https://by32.github.io/interactive-histomap/ and https://by32.github.io/interactive-histomap/thermopylae.html; if it breaks, push a revert (also gated) and report.
7. Record what landed and the proof with `ledger note`.

Cloud agents: push a branch named `land/<task>` instead of pushing the default branch (the lander arrives later; until then tell Ben the branch name). Do not name task branches `claude/...`: `deploy.yml` runs on every `claude/**` push.
