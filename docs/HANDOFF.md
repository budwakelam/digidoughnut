# DigiDoughnut Platform: Handoff (platform locked, first real product next)

Written 2026-10-08, 09:00. Read this first, then `docs/handoff-notes.md` (running log, newest at the
bottom). The spec `digidoughnut-platform-spec-2026-10-06.md` and the earlier handoffs
(`claude/digidoughnut-handoff-phase7.md`, `…phase7b.md`) are in the claude.ai Project; this document
replaces them for day-to-day work.
Anything marked "Oran's call" is his: ask, don't decide.

## What's next

The platform is close to locked. **Next: build ONE real product on it, in a real setting.** Oran
picks the product (likely a popular Etsy-style tool remade with an AI helper, e.g. a profit/loss
calculator or a budget). The goal is to find out what the platform is missing when a real program
sits on top, not to polish the demo further.

First steps for the next session:
1. Ask Oran which product, and what it must do (screens, numbers, what the helper should be able
   to do for the buyer). Use his own words for things (rule 8).
2. Copy `programs/demo/` to `programs/<id>/` (id = lowercase letters/digits, e.g. `budget`).
   Write the program against the contract below. Do NOT edit the platform for one program; if the
   program needs something the platform lacks, add it to the platform for every program, with tests.
3. `node build.mjs <id>` → `dist/<id>.html`. Send Oran that file (fixed name, version inside).
4. Add `tests/<id>_test.py` (copy the shape of `platform_test.py` + `helper_test.py`): example data,
   saving, migrate, every tool, the helper's summary, and the platform suites still green.
5. Oran's run on PC + iPhone before anything is called done (rule 6).

## Where everything is

- Repo `budwakelam/digidoughnut`, branch **`platform-phase-1`** (last commit `ea6334c`). `master` =
  original POC + the live noticeboard (`noticeboard/notes.json`, GitHub Pages).
  `profit-coach/index.html` is the old proof of concept (Penny's origin); reference only.
- Build: `node build.mjs` (all) or `node build.mjs demo` → `dist/<program>.html`. Commit, then
  rebuild so the support report shows the commit (the "Rebuild with commit stamp" commits).
- **One fixed file name per program** (`demo.html`); the version lives inside. Bump `version` in
  `programs/<id>/program.js` with every send. Tests read the version from there (one edit).
  Last file sent: **demo.html 0.1.9**.
- Tests (headless Chromium, fakes only), all green at 0.1.9:
  `platform_test.py` 134 · `ai_test.py` 61 · `setup_test.py` 190 · `helper_test.py` 81 ·
  `sync_test.py` 109 · `agent_test.py` 91 · `move_test.py` 108 ·
  `QR_DECODER=<node script> pair_test.py` 22. The decoder: `npm i jsqr pngjs`, then a script that
  reads a PNG with pngjs and prints `jsQR(...).data`. Ignore Playwright's `CancelledError`
  tracebacks; the last line is the verdict.
- Size: ~383 KB per program file. The build warns over 500 KB and refuses over 3 MB.

## Modules (platform/js, load order in build.mjs)

dd.core (data, example mode, update) · dd.store (localStorage, storage room check) · dd.errors
(friendly messages) · dd.ui (sheets, toasts, notices, confirm) · dd.menu · dd.diag (support report)
· dd.pair (QR / links between copies) · dd.ai (Google Gemini) · dd.notes (noticeboard) · dd.setup
(setup card + wizards) · dd.helper (Penny) · dd.sync (live sync, Firebase) · dd.backup · dd.move
(Where it lives) · dd.agent (buyer's own AI agent).

## The program contract (what a product writes)

Everything lives in one `DD_PROGRAM` object in `programs/<id>/program.js`, plus optional
`program.html` (markup inside `<main id="dd-app">`, use `dd-*` classes) and `program.css`.

**Required:** `id`, `name`, `version`, `schemaVersion`, `emptyData()`, `exampleData()`,
`validateData(d)`, `migrate(d, fromVersion)`, `render(ctx)`.

**Optional:** `tagline`, `accent`, `dataLabel` ("list", "budget": used in wording everywhere),
`exampleNotice`, `showExampleNotice`, `mount(ctx)` (wire static buttons once), `menu` (the app's
own menu items), `helper` ({name, face, role, greeting, place, slot}), `knowledge` (what the program
is, for the helper), `summarizeForAI(ctx)` (short text of the current data; capped at 12,000
characters), `suggestions` (3 chips), `tools` (what the helper and the agent may do), `sync`
(`false`, or `{toParts, fromParts}` for odd data).

**ctx:** `ctx.data`, `ctx.update(fn)` (edit or return new data; saves, renders, syncs),
`ctx.replaceData(next, opts)`, `ctx.ui` ($, esc, uid, status, confirm, toast…), `ctx.env`.

**Rules a product must follow:**
- **Example ids must stay fixed** and example items must have string `id`s. The buyer's first real
  change removes untouched example items (`dd.withoutExamples`), keeps changed or added ones.
- **Data shape for sync:** a top-level array whose items all have a string `id` syncs item by item
  (two devices can edit different items at once). Any other top-level value syncs as one field,
  last change wins. Design the data so the things a buyer edits often are id'd list items.
- **Tools:** `{name, description, params, run(args, ctx) → {ok, message}}`. Big or destructive
  changes add `confirm(args, ctx)` (returns the question, or null) and `yesLabel`. Tools find
  things by id first, then by words, and never guess between two matches (see `pick()` in the demo).
  Every change a tool makes can be undone from Penny's reply.
- `validateData` must reject anything malformed: it guards restores, sync and links.
- `migrate` must handle every older `schemaVersion` (0 = before envelopes). Bump `schemaVersion`
  whenever the data shape changes.
- Never put a literal `</script>` in program code.
- Program wording: plain, short, no jargon (Oran's buyers know nothing about hosting or APIs).

## Oran's calls (current)

| Topic | Decision |
| --- | --- |
| AI | **Google Gemini only for launch** (free, easy with a Gmail account). Other companies only if buyers ask; the listing says Google. 7.5 is off the build list. |
| Busy AI | No automatic backup AI. |
| Noticeboard | Can never add an address. A new company or address = a program update. |
| Menu | On the program's name, top-left. The app's own items first; platform items under ⚙️ Settings. |
| Setup | Hideable; Menu → Settings → 🧰 Setup & connections brings it back. |
| Where it lives | One screen: current place highlighted, other places with scales and pros/cons. Step 3 always ticked; a file shows "⚠ Limited". |
| DigiDoughnut hosted copy | Not ready; `DD_BUILD.home` stays blank. Shown as "almost ready". |
| Receiving guard | Ask "Replace or keep mine?", with Undo. |
| File name | One fixed name; buyers download once, so **no "rename it first" step** (the "(10)" names were Oran's testing). |
| Sync wording | **"Sync", never "in step".** Step 4 = "Sync my devices"; chip "Synced" / "Not syncing". Say it backs up to the cloud. |

## What changed today (2026-10-08), demo 0.1.7 → 0.1.9

- First real change ends example mode (untouched examples go, the buyer's own stay).
- Setup guide answers rewritten GitHub-first; tiiny.host answers only in the tiiny wizard.
- Backup file carries the live sync address + setup code when sync is on; restoring it on a
  cleared device reconnects sync. Backup sheet says "Keep it private" and warns about clearing
  "cookies and site data". Where it lives has one line on it too.
- "Finish later" points to the menu when the setup card is hidden.
- Removed: Neocities wizard, old host chooser, dead helpers.
- Storage use in the support report; warning notice at 80% of ~5M characters.
- Penny's data summary capped at 12,000 characters per message.
- QR says "Scan it with your own phone"; Setup & connections icon 🧰.
- Live sync: "Sync my devices", "☁️ Backed up to the cloud" (a live copy: deletions sync too, so a
  backup file is still the dated copy), "Synced" / "Not syncing".

## Open

1. **Oran is testing on his iPhone:** does a Home Screen app start empty? (iOS has kept Home Screen
   apps' storage separate from Safari's: WebKit bug 181849.) Scan the QR → Add to Home Screen →
   open the icon → are the list and Penny there? If empty, the fix is to tell phone buyers to add
   to the Home Screen FIRST and pair from the icon (or re-pair inside it); decide with Oran.
2. **Clearing the browser** (answered): "cached images and files" loses nothing; "cookies and site
   data" wipes the data, the access code and the sync address on that device. Live sync + a backup
   file is the recovery. Suggested for the listing / thank-you page: "Your data is saved in your
   browser. Clearing your browser's site data removes it, so use Backup or live sync."
3. Still to build before selling: **7.4 "A newer version is ready"** (noticeboard `latest` per
   program; About shows it; menu badge) and **7.6 the thank-you page**
   (`claude/thanks-template.html` → `platform/start/thanks.html`, filled per program by build.mjs).
   These can wait until the first product exists, then be built for it.
4. Older runs Oran hasn't done: demo13 (offline + backup), demo15 (Penny's box while Muse waits),
   demo16 (Backup & new versions).
5. Later, not launch: sheets don't trap Tab; Penny's side column leaves ~600 px on 960–1,200 px
   laptops (watch this with a table-heavy product); iPads count as phones.

## Lessons (keep these)

- Oran wants **one obvious screen with everything laid out** over clever multi-step flows. A setup
  row says where things are **now**, with one button.
- Don't put Oran's testing problems on buyers (the rename step was one).
- Plain words the buyer already uses ("sync", not "in step"; "access code", not "API key").
- When Oran's message is ambiguous, check his screenshot: it points at the exact row.

## Rules learned the hard way

1. Try every model; remember the one that worked; race slow ones. 2. Never refuse a code on a
format guess. 3. Oran's screenshots beat docs. 4. Diagnostics show in-flight requests.
5. Drills leave no trace. 6. Never report done without Oran's run on the buyer's device class.
7. Check a host's security headers and overlays. 8. Accept buyers' own names for things.
9. Toasts never block clicks; sheets never close on a stray click; focus without scrolling.
10. Example data never travels; always say what does. 11. Never hand Firebase an offline write to
send blindly; merge first. 12. An SDK's "local" view includes our unconfirmed writes.
13. After finishing one queued item, look at the queue again. 14. Anything that checks a key inside
the HTML can be read: don't build security on it. 15. A copy that receives data asks before
replacing the buyer's own. 16. Never hide an option the buyer should know about; show it and say
when it's not ready. **17. The buyer's first real change ends example mode; never keep their own
data marked as example.**

## Working with Oran

Architect and reviewer; the builder builds. Plain language, short numbered test steps. He dictates:
verify names (he says "digidonut", "Cloudflare" for Firebase, "Grok" may mean Groq, etc.). He tests
by opening the HTML file and sends screenshots and the support report; send him the built file
every time, with screenshots of what changed. Brand: **DigiDoughnut** (D-O-U-G-H, no S). Commit
messages end with the Co-Authored-By / Claude-Session lines; push to `platform-phase-1`.
