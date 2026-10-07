# The DigiDoughnut noticeboard

Every DigiDoughnut program checks `notes.json` at most once a week (served by GitHub Pages at
`https://budwakelam.github.io/digidoughnut/noticeboard/notes.json`). Edit it here, commit, and
every buyer's program picks it up within a week. Programs work fine if it's missing.

What it may contain (anything else is ignored, and anything malformed is dropped):

| Section | What it does | Rules |
| --- | --- | --- |
| `helpLinks` | Replaces built-in help / "I'm stuck" links by key | `https://` only, under 300 characters |
| `labels` | Corrects button wording shown in setup screens, by key | Plain text, under 60 characters |
| `notice` | One message at the top of every program | `{ "id": "oct-outage", "text": "...", "until": "2026-10-20", "link": "https://..." }`, text under 240 characters; each id is shown until the buyer taps Got it |
| `modelHints` | AI models to prefer or avoid, per company | Model ids only, up to 20 each |
| `codePatterns` | How to recognise a company's access code | Pattern text starting with `^` |

It can never change where codes, numbers or messages are sent: those addresses are built into
each program. To publish: repo Settings → Pages → deploy from branch `master`, folder `/ (root)`.
