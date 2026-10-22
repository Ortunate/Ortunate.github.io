# Classic games

Play now contains 11 games. Minesweeper is first, followed by Klondike, Spider,
FreeCell, Texas Hold’em, Chess, Xiangqi, 2048, Snake, Falling Blocks and Breakout.
English labels have Chinese search aliases. Kinetic Workshop remains in Create
at its existing URL and bookmark ID. Memory, sliding puzzle and Game of Life
have retirement pages; existing local saves are not deleted.

Rules live in `src/lib/tabletop/`; controllers and the cancellable chess Worker
live in `src/scripts/games/`. Each new route loads its game on demand. Chess AI
uses iterative deepening with 150 / 500 / 1200 ms budgets, not a rated engine.
Xiangqi uses casual repetition rules: unilateral perpetual check loses, other
threefold repetitions draw. Perpetual chase adjudication is not implemented.
Chess detects common insufficient-material cases, not every theoretical dead
position. Solitaire deals are random and are not guaranteed winnable.

Hold’em uses six local seats, 1/2 blinds, and 200 free chips per seat. Bots receive
only their own hole cards and public state. No accounts, network opponents,
payments, or redeemable balances exist. A new table is free when the player busts.

Game saves use `classic:<game>:<mode>:v1`; Minesweeper uses its arcade save key.
These saves are deliberately separate from personal backup exports. Undo history
is held for the current page session. Storage failures leave the current game
playable and display a notice.

## Offline

The Play directory offers explicit Download / Update and Remove download actions.
`scripts/offline-manifest.mjs` follows built page assets, lazy modules and Workers.
The service worker is scoped to `/play/`; it does not cache Worlds, Create,
external fonts or external websites. Downloads include the Play directory.
Each game version downloads into a staging cache and becomes active only after
all assets succeed. Failed updates preserve the old active version. Previous
versions are retained for already-open pages until the user removes the game.
Total cache size is capped at 20 MiB, including retained versions. Removal does
not touch localStorage. Browser eviction can remove downloads outside our control.

## Validation

`npm test` covers chess perft, castling, promotion, en passant, mate/draw rules,
Xiangqi screens and movement, card conservation, FreeCell capacity, Hold’em hand
ranking, side pots, raise reopening and chip conservation. Controller tests run
with a lightweight DOM adapter and exercise undo, storage failures, hidden cards,
AI cancellation and background suspension. Cache API adapters test offline
fallback, incomplete updates, rollback and removal. `npm run build` checks static
links, per-page script budgets and complete offline Worker dependencies.

No browser automation is used. Manual device acceptance remains:

1. On a phone, test all five themes in day and night mode. Tap and drag cards,
   promote a pawn, flip each board, and scroll the Expert Minesweeper field.
2. Download selected games online. Close the tab, enable airplane mode, reopen
   `/play/`, and play each downloaded game, including an AI turn.
3. Confirm an undownloaded game explains how to reconnect. Remove a download
   and confirm its saved progress returns after downloading again.
4. During AI thinking, undo or switch apps and return. No stale move should land.
5. Test desktop keyboard focus with Tab, arrows and Enter.
