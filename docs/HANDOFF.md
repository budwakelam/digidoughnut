# DigiDoughnut Platform: Handoff (Phase 7 in progress, after 7.1–7.3)

Written 2026-10-08, 00:20. Read this first, then `docs/handoff-notes.md` (running log, newest at the
bottom), then the spec `digidoughnut-platform-spec-2026-10-06.md` (claude.ai Project). The Phase 6 →
7 handoff (`claude/digidoughnut-handoff-phase7.md`) still holds the full Phase 7 plan, the Phase 6
summary and the rules; this document says what changed since then and what's next.
Anything marked "Oran's call" is his: ask, don't decide.

## Where everything is

- Repo `budwakelam/digidoughnut`, branch **`platform-phase-1`** (last commit `22b53d8`). `master` =
  original POC + the live noticeboard (`noticeboard/notes.json`, GitHub Pages).
- Build: `node build.mjs` → `dist/<program>.html`. Commit, then rebuild so the support report shows
  the commit (the "Rebuild with commit stamp" commits).
- **The file sent to Oran is always `demo.html`** (one fixed name; uploading it replaces the old copy
  and keeps the list). The version lives inside: **bump `version` in `programs/demo/program.js`
  with every send** (now **0.1.6**) and update the `0.1.x` strings in `tests/platform_test.py` and
  `tests/move_test.py`. Last file sent: demo.html 0.1.6.
- Tests (headless Chromium, fakes only), all green at 0.1.6:
  `platform_test.py` 110 · `ai_test.py` 61 · `setup_test.py` 202 · `helper_test.py` 79 ·
  `sync_test.py` 101 · `agent_test.py` 91 · **`move_test.py` 108 (new)** ·
  `QR_DECODER=<node script> pair_test.py` 22. The decoder: `npm i jsqr pngjs`, then a 6-line
  script reading a PNG with pngjs and printing `jsQR(...).data`. Ignore Playwright's
  `CancelledError` tracebacks; the last line is the verdict.
- `move_test.py` runs two local servers on different ports (DigiDoughnut copy and "own" copy) and
  writes a copy of the build with `"home"` filled in; the shipped build must have `"home":""`.

## Modules (platform/js, load order in build.mjs)

dd.core · dd.store · dd.errors · dd.ui · **dd.menu (new)** · dd.diag · dd.pair · dd.ai · dd.notes ·
dd.setup · dd.helper · dd.sync · dd.backup · **dd.move (new)** · dd.agent.

## Oran's calls made this session (2026-10-07/08)

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Menu | On the program's name, top-left: yes |
| 2 | Receiving guard | Ask "Replace or keep mine?", Undo after Replace: yes |
| 3 | AI addresses | The noticeboard can never add a new address; a new company = a program update |
| 4 | AI companies at launch | Google (free default), Groq, OpenRouter, OpenAI, Anthropic |
| – | File naming | One fixed file name; version inside the file |
| – | Where it lives | One clear screen: current place highlighted, every other place with scales and pros/cons, one "bring my data" switch; the setup row just says "Now: …" with one **Change** button; DigiDoughnut always offered |
| – | Step 3 | Always ticked; a file shows "⚠ Limited: this computer only, not on your phone" |
| – | Hosted address | Not ready yet, "we will get to that": `DD_BUILD.home` stays blank for now |

## What was built (Phase 7.1–7.3)

**Menu = the app's menu first (Oran, 2026-10-08).** Top level: the program's own items
(`DD_PROGRAM.menu = [{id, icon, label, note?, show?, run(ctx)}]`, registered as `app-<id>`; the demo
has 🧹 Clear the list and 🖨️ Print my list) and 💬 Ask Penny (dd.helper, group app) → separator →
**⚙️ Settings ›** (submenu `menu.openSettings()`, "‹ Menu" back) → 🛟 Help & support details → ℹ️ About.
Settings holds every platform item: Setup & connections, Where it lives, Send to my phone, Backup &
new versions, Privacy. `dd.menu.add` takes `group: "app" | "settings" (default) | "end"`. A new
platform item goes under Settings unless the buyer needs it daily.

**Hide setup (Oran, 2026-10-08).** The card's "Hide setup" link (and the ✕ beside the chip) asks
"Hide the setup reminder? You can open it any time from the main menu: tap <name> at the top left,
then ⚙️ Settings → Setup & connections." Hide it → nothing on the page (`state.hidden`). Menu →
Settings → Setup shows "Show the setup reminder on the page again" (`setup.showReminder()`).

**7.1 Program menu (`dd.menu`).** The header name is the button `#dd-menu-btn` ("☰ Demo List ▾").
Modules register items with `dd.menu.add({id, icon, label, order, show, run, note, badge})`:
setup 10 (`dd.setup.openSheet()`, works after "Hide this for now" and offers to unfold) · where 20
(dd.move) · phone 30 (dd.pair, hidden on phones) · backup 40 · privacy 50 · help 60 (dd.diag) ·
about 70 (`menu.about()`, `menu.aboutExtras` is the hook for 7.4). `badge()` lights a red dot on the
button (for 7.4). The menu sheet is sticky (rule 9). Footer links and triple-click unchanged.

**7.2 Where it lives.**
- `DD_BUILD.home`: build.mjs reads optional `build.config.json` (`{"home": "https://…/{name}.html"}`
  or `{"homes": {"demo": "…"}}`); env `DD_HOME` overrides. Empty by default.
  `dd.env.home`, `dd.env.isHome` (wording only, never features), `dd.env.sameAddress(a, b)`.
- Setup step 3 (id still `phone`, wizard `host`) is "🏠 Where it lives": always ticked; text
  "Now: a file on this computer." / "Now: the DigiDoughnut version." / "Now: your own copy at
  <host>."; a file adds the amber `.dd-step-warn`. One button: **Change** (`[data-start=host]`).
- `setup.open("host")` opens **`dd.move.where()`** (unless only one host service is offered). The
  old chooser screen in `setup.wizards.host` stays only as the parent of the GitHub / tiiny / own
  host / Neocities wizards (Back / Start over return to the Where it lives screen).
- **The Where it lives screen**: "Where it lives now" (current place, green, "✓ You are here"),
  then "Other places it could live": 🍩 DigiDoughnut (Recommended) → `setup.hostChoices` (🐙 GitHub
  "Best do-it-yourself choice", 🌱 tiiny.host, 🌐 own website) → 💻 a file on this computer. Each
  card: what it is, scales (Easy to set up, Looks after itself), time, works on your phone or not,
  ✓ pros / ✗ cons, one action. Wording lives in `dd.move.places`. Current place is detected from
  the host name (github.io, tiiny, neocities, else own website). Also on the screen: Send to my
  phone (computer, hosted), Add to Home Screen (phone, hosted), and one line on new versions
  (same place, same file name).
- Actions: DigiDoughnut → "Use the DigiDoughnut version" (with no address yet: "Almost ready…
  in the next update", no link). Own hosts → "Open my copy at <host>" (remembered by
  `setup.ownAddress()`), "Set it up, step by step" / "Continue setting it up"
  (`setup.startHost(id)`, `setup.hostInProgress(id)`), "I already have one" (paste the address).
  File → how to open the file + Download a backup.

**7.3 Moving between copies + receiving guard.**
- One switch above the options: "Bring my <list>, free access code and live sync along" (on by
  default; disabled with example data). On: `dd.pair.makeLink({base, includeCode:true,
  maxLink:60000})`. Off: `makeLink({bare:true})` carries nothing. Link: 10 minutes, once.
- Too big for a link: says so in the card, offers Download a backup + Open the other copy.
- Live sync on: the other copy joins the same database (sync.join merges, never replaces).
- **Receiving guard (rule 15)**: the `d` pairing piece goes through `dd.move.receiveData(body)`.
  If this copy holds the buyer's own data (not example, not empty) and it differs: sticky question
  "Replace what's here with the <list> from your other copy?" → Keep mine / Replace, then an Undo
  notice (`#dd-notice-moved`). Same for phone pairing and move links.
- `move.open()` now just opens `move.where()` (the Backup sheet's "Move to another copy" link).

## Open now

1. **Oran's run of demo.html 0.1.5 on PC + iPhone** (rule 6): menu items; step 3 → Change →
   Where it lives; GitHub/tiiny copy shows "Now: your own copy at…"; the Replace / Keep mine
   question via Send to my phone (phone with its own different list) incl. Undo.
2. **Clearing the browser (Oran asked 00:11; my proposals, his call):**
   - No cookies are used (localStorage only, nothing tracks). Not legal advice; a consent banner
     generally isn't needed for strictly functional storage.
   - Clearing "cookies and site data" wipes, on that device: the data, the AI code AND the live sync
     address (`dd_<id>_sync_id_v1`, `dd_firebase_config_v1`). With sync, the data survives in
     Firebase but a single-device buyer can't find it again. Safari clears website storage after
     ~7 days without a visit (not Home Screen apps). `navigator.storage.persist()` is already asked.
   - Proposed: (a) put the sync address + config in the backup file so Restore reconnects (say
     plainly that the file then opens the data); (b) say it in Backup & new versions and Where it
     lives; (c) stronger Safari advice (Home Screen or backup) when sync is off. Suggested a + b first.
3. **The DigiDoughnut hosted address** (`DD_BUILD.home`): Oran will supply it later.
4. Oran's calls still open: 5 (backup AI company Penny falls back to: suggested yes, optional),
   6 (may the noticeboard switch the default free company if Google drops its free tier?).
5. Older runs still not done by Oran: demo13 (offline + backup), demo15 (Penny's box while Muse
   waits), demo16 (Backup & new versions). Unreproduced reports from Phase 6 still stand (see the
   Phase 7 handoff, "Still open").

## Next, in build order (from the Phase 7 plan)

4. **7.4 "A newer version is ready"**: noticeboard `latest` per program (version + help link; strict
   validation; can't change where codes or data go). About shows it, `menu` badge dot, one notice:
   home copy → Reload (and `sync_newer` offers Reload); own copy / file → "Get the new file from
   your thank-you link" + the Backup & new versions steps.
5. **7.6 Thank-you page** from `claude/thanks-template.html` → `platform/start/thanks.html`, filled
   by build.mjs per program; bundled fonts; download hidden on phones.
6. **7.5 AI companies**: live browser tests first (CORS, free tier, tool calling) for Groq,
   OpenRouter, OpenAI, Anthropic → adapters (Gemini / OpenAI-style / Anthropic messages) → setup
   step 2 picker ("Free with Google (recommended)" stays the big button) → backup company → the
   noticeboard `providers` switches.
7. Tests for each, existing suites green, then Oran's gate on PC + iPhone.

## Lessons from this session

- Oran wants **one obvious screen with everything laid out** (current state highlighted, options
  with plain pros/cons and scales) over clever multi-step flows or options hidden until a setting
  exists. Never hide a choice because its address isn't ready: show it and say "almost ready".
- A setup row says where things are **now**, with one button. Extra actions go inside.
- When Oran's message is ambiguous, check the screenshot he sent: it points at the exact row.

## Rules learned the hard way (keep these)

1. Try every model; remember the one that worked; race slow ones. 2. Never refuse a code on a
format guess. 3. Oran's screenshots beat docs. 4. Diagnostics show in-flight requests.
5. Drills leave no trace. 6. Never report done without Oran's run on the buyer's device class.
7. Check a host's security headers and overlays. 8. Accept buyers' own names for things.
9. Toasts never block clicks; sheets never close on a stray click; focus without scrolling.
10. Example data never travels; always say what does. 11. Never hand Firebase an offline write
to send blindly; merge first. 12. An SDK's "local" view includes our unconfirmed writes.
13. After finishing one queued item, look at the queue again. 14. Anything that checks a key
inside the HTML can be read: don't build security on it. 15. A copy that receives data asks
before replacing the buyer's own. **16. Never hide an option the buyer should know about; show it
and say when it's not ready.**

## Working with Oran

Architect and reviewer; the builder builds. Plain language, short numbered test steps. He
dictates: verify names (he says "digidonut", "Cloudflare" for Firebase, etc.). He tests by
opening `demo.html` and sends screenshots and the support report; send him the built file every
time, with screenshots of what changed. Brand: **DigiDoughnut** (D-O-U-G-H, no S). Commit
messages end with the Co-Authored-By / Claude-Session lines; push to `platform-phase-1`.
