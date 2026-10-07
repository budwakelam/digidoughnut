# DigiDoughnut Platform

One shared foundation for every DigiDoughnut program. Each program ships to the buyer as a
single self-contained HTML file; this repo holds the readable source.

```
platform/           shared by every program (edit here once, every program gets it)
  shell.html        page skeleton with {{DD_…}} markers
  css/dd.ui.css     the shared look (Profit Coach's card UI)
  js/dd.core.js     dd namespace, events, device detection, dd.start()
  js/dd.store.js    storage names, data envelope, upgrades, recovery copy
  js/dd.errors.js   friendly error types, masked support log
  js/dd.ui.js       header/footer, status boxes, notices, sheets, confirm, toast
  js/dd.diag.js     triple-click footer support report
  js/dd.ai.js       AI connection: company registry (Google at launch), model picking,
                    tool translation, 30 s / 60 s / 5-round limits, Stop, friendly errors
  js/dd.notes.js    weekly DigiDoughnut noticeboard check (help links, labels, notice, model hints)
noticeboard/        notes.json, served by GitHub Pages; see noticeboard/README.md
programs/<name>/    one folder per program (PROGRAM-SPECIFIC)
  program.js        the DD_PROGRAM object (id, name, version, data, render, …)
  program.html      the program's screen markup
  program.css       the program's own styles
dist/<name>.html    the assembled file the buyer gets (never edit by hand)
profit-coach/       the original proof of concept (Phase 6 rebuilds it on the platform)
tests/              headless browser tests
```

## Build

```
node build.mjs demo        # -> dist/demo.html
node build.mjs             # every program
```

No dependencies (Node 18+). The build fails if a marker is left unfilled, an external
script or stylesheet sneaks in, the brand is misspelled, or the file passes 3 MB (warns past 500 KB).
Buyers never run this.

## Test

```
pip install playwright && python3 -m playwright install chromium
python3 tests/platform_test.py     # platform basics (110 checks)
python3 tests/ai_test.py           # AI layer + noticeboard against a fake Google (43 checks)
```

`programs/aitest` is an internal page for testing a real Google code (never sold).

Runs on desktop and an emulated iPhone, from a file and from a web address. Emulation is not
a real iPhone: every phase gate is still tested on a real iPhone from a tiiny.host link.

## Storage names

- Shared by every program on one address: `dd_<thing>_v1` (e.g. `dd_ai_connections_v1`)
- One program: `dd_<program>_<thing>_v1` (e.g. `dd_demo_data_v1`, `dd_demo_data_recovery_v1`)

Program data is saved in an envelope `{dd:1, program, schemaVersion, savedAt, example, data}`.
Older data goes through the program's `migrate(data, fromVersion)`; data saved without an
envelope (the POC) counts as version 0. Anything unreadable is copied to the recovery key
before the program starts fresh, so nothing is ever lost.

## Starting a new program

Copy `programs/demo/`, change `id`, `name`, `version`, `accent`, then the data functions,
`render()` and the markup. Everything else comes from the platform.
