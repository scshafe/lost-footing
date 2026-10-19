# lost-footing agent notes

- A browser game: plain ES modules and Canvas 2D in `web/`, no build step and
  no third-party code. The simulation in `src/` stays free of rendering, input
  and DOM code, so Node tests can run it headless.
- The owner's brief, `docs/brief.md`, is fixed; the design that follows from
  it lives in `docs/design.md`, kept in step with the code.
- Public, MIT (`LICENSE`): CI runs on GitHub; wait for it before merging.
- Deployed by the runner lane (`dev.toml [deploy]`): a merge to `main` builds the
  `Dockerfile` and deploys `deploy/stack/` on the laptop, served on the tailnet
  only at `https://lost-footing.<tailnet>/`. `server/serve.js` serves `web/` and
  `src/` and nothing else; keep anything private out of those two directories.

<!-- scshafe-dev:begin landing -->
## Verify and landing

Managed by scshafe-dev: `dev adopt` and `dev update` refresh this section from `dev.toml`; change `dev.toml`, not these lines.

Before finishing, both of these must pass:

```sh
./scripts/verify-linux
dev check .
```

How a change lands:

1. Work on a branch and open a PR.
2. Run the two commands above. If the repository is private, GitHub Actions does not run for it: verify locally and say in the PR what you ran. If it is public, wait for CI to be green.
3. Merge your own PR with a merge commit, one change at a time: `gh pr merge <N> --merge --subject "Merge #<N>: <title>"`. Never squash or rebase (both are off on the repository), and pass `--subject`: `gh pr merge` does not make the `Merge #N: <title>` subject by itself.

The project's agent may merge its own PR and push `main`; there is no approval gate.

Merging deploys to production ([deploy] lane `runner`: `.github/workflows/deploy.yml` verifies on a GitHub-hosted runner, deploys through the host entrypoint on the `lost-footing-prod` self-hosted runner, then checks health).
Watch the run yourself with `gh run list -w deploy`, `gh run watch <id>` and `gh run view <id> --log` (a public repository's deploy log is a summary only); say in your reply what the run did, naming the merge commit.
Roll back by merging a `git revert`, or by dispatching `deploy.yml` with `sha=<older commit on main>` and `allow_rollback=true` (`gh workflow run deploy.yml -f sha=<sha> -f allow_rollback=true`).

Central concepts are defined in VOCABULARY.toml; refer to them as `lost-footing:<slug>` (e.g. `lost-footing:crumble-platform`), and add a term with `dev vocab add` when you introduce one.
<!-- scshafe-dev:end landing -->
