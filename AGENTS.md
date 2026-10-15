# lost-footing agent notes

- A browser game: plain ES modules and Canvas 2D in `web/`, no build step and
  no third-party code. The simulation in `src/` stays free of rendering, input
  and DOM code, so Node tests can run it headless.
- The owner's brief, `docs/brief.md`, is fixed; the design that follows from
  it lives in `docs/design.md`, kept in step with the code.
- Private repository: GitHub Actions does not run; verify locally and say so
  in the PR.
