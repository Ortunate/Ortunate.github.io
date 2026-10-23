# Performance and resource use

The October 2026 optimization preserves game rules, AI budgets (150/500/1200 ms),
visual quality and active animation rates. Measurements compare against commit
`c39194a`; baseline bytes are recorded in `performance-baseline.json`.

| Artifact measurement | Before | After |
| --- | ---: | ---: |
| Complete production build | 5,557,113 B | 5,556,603 B |
| All games' cached resource bodies | 1,206,945 B (repeated per game) | 226,383 B (shared) |
| Offline manifest | — | 14,433 B |

Resource bodies for a fresh download of all games fall by 81.2%. Manifest and
runtime metadata are additional; old versions pinned by open tabs use extra space.
The complete build is effectively unchanged because the physics and 3D engines
remain available. The main gains are deferred loading, smaller page-specific
transfers, shared offline storage and less idle CPU work.

- Shared CSS stays global; home, directory, tools, arcade and visual-detail styles
  load only on their relevant routes. Repeated inline styles are external files.
- Kinetic creates its physics Worker on the first Run or Step. Editing does not
  load the 3.25 MiB physics Worker. Loading failures expose Retry; hidden or closed
  pages cannot start a simulation after a delayed initialization response.
- Kinetic and Loom stop requesting frames when static. Visuals stop when offscreen
  or frozen and clean, while active scenes retain their existing frame rates.
  Minesweeper's timer only runs during visible play; Lab has no idle FPS interval.
- Chess reuses cells, legal-move analysis and its AI Worker. Undo keeps compact
  position records; search requests omit repetition logs. Selection and board
  flipping do not save. Card games reuse cards/piles/seats and save only changes;
  poker evaluates each contender once per showdown, including side pots.
- Offline downloads share hash-verified resources, publish metadata atomically,
  migrate old caches and protect versions used by open pages. Storage remains
  capped at 20 MiB. Removing a download preserves game saves.

`npm run build` enforces the baseline total build size (5,557,113 bytes), 6 KiB
eager JavaScript budgets for the six classic card/board games, a 10 KiB Play index
budget, and 400 KiB for unique offline content plus its manifest. It also checks
static links and offline Worker dependencies. Eager script figures exclude lazy
engines, CSS and fonts; these are artifact measurements, not network benchmarks.

Controller tests use DOM/event adapters, not browser automation. They cover idle
frame scheduling, lazy physics, cancellation, retry, stable game nodes, reduced
save traffic, AI reuse and offline update/migration failures. Mobile layout,
touch gestures and real airplane-mode acceptance still require manual checks.
