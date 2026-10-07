# DigiDoughnut Platform: Handoff (end of Phase 4, start of Phase 5 "Keep devices in step")

Written 2026-10-07 (evening). Read this first, then `docs/handoff-notes.md` (running log, newest
at the bottom), then the spec `digidoughnut-platform-spec-2026-10-06.md` (claude.ai Project):
3.3 live sync, 3.5 backup/restore. Anything marked "Oran's call" is his: ask, don't decide.

## Where everything is

- Repo `budwakelam/digidoughnut`, branch **`platform-phase-1`**. `master` = original POC +
  the live noticeboard (`noticeboard/notes.json`, platform format, served by GitHub Pages).
- Build: `node build.mjs` → `dist/<program>.html`. Rebuild after committing (support report
  shows the commit). Before a handoff, diff the last file sent to Oran against the repo build
  (Phase 3's final touches were once missing from the repo).
- Tests (headless Chromium, fakes only): `platform_test.py` 110 · `ai_test.py` 61 ·
  `setup_test.py` 200 · `helper_test.py` 79 · `QR_DECODER=<node jsqr+pngjs script> pair_test.py` 22.
  Ignore the `CancelledError` noise Playwright prints; the last line is the verdict.
- Last file Oran passed on PC + iPhone (tiiny + GitHub Pages): demo10 (commit 5a0ced0).

## Modules (platform/js, load order in build.mjs)

dd.core · dd.store · dd.errors · dd.ui (+ host-bar detection) · dd.diag · dd.pair · dd.ai
(model race) · dd.notes · dd.setup · **dd.helper (Phase 4)**. Next: **dd.sync**.

## Phase 4: what was built (passed Oran's runs 2026-10-07)

- **dd.helper ("Penny")**: per-program `helper: {name, face, role, greeting, place, slot}`;
  `place` = side / inline / bubble / none, or `{computer, phone}` (default side + inline,
  960 px line, moves live). Tools from `DD_PROGRAM.tools` (+ `confirm`, `yesLabel`),
  `summarizeForAI`, `knowledge`, `suggestions`. Undo per reply (snapshots, last 5 kept),
  Yes/No for big changes (run only by the buyer's tap), saved chat (`dd_<id>_chat_v1`, 40
  messages, New chat), Try again / Fix my access code / Stop, no-code path into the wizard.
  `dd.helper.ask(text)` for program buttons; `dd.ctx()` exposed by core.
- **Model race** (dd.ai.chat): a model silent for 6 s gets the next one asked alongside it
  (up to 3); first answer wins, others cancelled; the winner goes first next time.
- **Host bars**: `dd.ui.measureHostBars` sets `--dd-host-top/bottom` for any full-width fixed
  bar the host lays over the page (tiiny's ~42 px bottom bar covered Penny's box).
- **QR sheet** always says what it carries; example data never travels; programs name their
  data with `dataLabel`.

## Decisions log (Oran) — Phase 4

| Topic | Decision |
| --- | --- |
| Where the helper sits | Per program, and prominent; corner bubble is not the default |
| Helper name | "Penny" by default, changeable per program |
| Undo (#5), save chat (#6) | Yes, as built |
| Code in the QR (#7) | Keep as built (on by default, warning + switch) |
| Noticeboard | Fixed on master (builder's call, approved) |
| QR and big data | Fine that big data can't travel by QR, as long as the screen says so; sync moves it |

## Phase 5: Keep devices in step (to build)

Start from the POC (`profit-coach/index.html`, "live sync" section): Firebase Realtime Database,
SDK by `import()` from gstatic (12.19.0 in the POC; check current), tolerant config parser,
128-bit ledger id, "sync was on" remembered, diff-on-save (700 ms), content-based echo
suppression, first join = union by id, last write wins on the same line.

- `platform/js/dd.sync.js` with a generic program hook (data → map of items by id + scalar
  fields; programs already have stable ids). Config is SHARED per web address
  (`dd_firebase_config_v1`: one Firebase project for all the buyer's programs); ledger per
  program (`dd_<id>_sync_id_v1`, path `/sync/<program>/<id>` or similar).
- `dd.pair` pieces `s` (ledger id) and `f` (config, public by design) so the phone joins on scan.
  When sync is on, the QR doesn't need to carry the data.
- Support report Sync section (on/off, connected, pushes/acks, remote events, last error).
- Firebase wizard = `setup.wizards.sync` (same engine). **Verify Firebase's console screens from
  Oran's screenshots first.** Free Spark plan (checked 2026-10-07): Realtime Database 100
  connections, 1 GB stored, 10 GB/month download, one database per project.
- Undo + sync: Undo = `dd.replaceData`, which must push like any change.
- Tests: two browser contexts against a fake database (or the Firebase emulator).

## Rules learned the hard way (keep these)

1. Try every model; remember the one that worked; race slow ones. 2. Never refuse a code on a
format guess. 3. Oran's screenshots beat docs. 4. Diagnostics show in-flight requests.
5. Drills leave no trace. 6. Never report done without Oran's run on the buyer's device class.
7. Check a host's security headers and overlays (Neocities CSP; tiiny's banner). 8. Accept
buyers' own names for things. 9. Toasts never block clicks; sheets never close on a stray
click; focus without scrolling. 10. Example data never travels; always say what does.

## Working with Oran

Architect and reviewer; the builder builds. Plain language, short numbered test steps. He
dictates: verify names. He tests by uploading `dist/*.html` and sends the support report and
screenshots; send him the built file every time. Brand: **DigiDoughnut** (D-O-U-G-H, no S).
Commit messages end with the Co-Authored-By / Claude-Session lines; push to `platform-phase-1`.
