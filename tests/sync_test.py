"""Phase 5 tests: keep devices in step (dd.sync) and backup / restore (dd.backup).

    node build.mjs && python3 tests/sync_test.py

Two browser contexts (a computer and an iPhone, each with its own storage) talk to a FAKE
Firebase (tests/fakefirebase.py). Proves our side only: the gate is Oran's PC + iPhone against
his real Firebase project on a github.io address.
"""
import json, os, re, threading, http.server, functools, time
from playwright.sync_api import sync_playwright
from fakefirebase import FakeFirebase, BAD_KEY

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIST = os.path.join(ROOT, "dist")
SCRATCH = os.path.join(ROOT, "tests", "screenshots"); os.makedirs(SCRATCH, exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=DIST))
threading.Thread(target=srv.serve_forever, daemon=True).start()
HOSTED = f"http://127.0.0.1:{srv.server_address[1]}/demo.html"
NOTES_URL = "https://budwakelam.github.io/digidoughnut/noticeboard/notes.json"
FB = FakeFirebase()

def cfg(key="AIzaFakeKeyForTests1234", project="my-dd", url=True):
    return ("const firebaseConfig = {\n  apiKey: \"%s\",\n  authDomain: \"%s.firebaseapp.com\",\n" % (key, project) +
            ("  databaseURL: \"https://%s-default-rtdb.firebaseio.com\",\n" % project if url else "") +
            "  projectId: \"%s\",\n  storageBucket: \"%s.firebasestorage.app\",\n  messagingSenderId: \"1234\",\n  appId: \"1:1234:web:abcd\"\n};" % (project, project))
CFG = cfg()

results = []
def check(name, ok, extra=""):
    results.append(bool(ok)); print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({extra})" if extra and not ok else ""))

def serve_sdk(route):
    name = route.request.url.rsplit("/", 1)[1]
    route.fulfill(status=200, content_type="text/javascript", headers={"Access-Control-Allow-Origin": "*"}, body=FB.module(name))

with sync_playwright() as p:
    b = p.chromium.launch()
    def fresh(device=None, url=HOSTED, clear=True):
        ctx = b.new_context(**(device or {"viewport": {"width": 1280, "height": 800}}), accept_downloads=True)
        ctx.route("https://www.gstatic.com/firebasejs/**", serve_sdk)
        ctx.route("https://generativelanguage.googleapis.com/**", lambda r: r.fulfill(status=404, body=""))
        ctx.route(NOTES_URL, lambda r: r.fulfill(status=404, body="", headers={"Access-Control-Allow-Origin": "*"}))
        page = ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(url)
        if clear: page.evaluate("() => localStorage.clear()"); page.reload()
        fast(page)
        return ctx, page, errs
    def fast(page): page.evaluate("() => { dd.sync.limits.debounce = 150; dd.sync.limits.connect = 6000; }")
    def items(page): return page.locator("#demoList .demo-row span").all_inner_texts()
    def wait_items(page, want, ms=6000):
        try: page.wait_for_function("(w) => JSON.stringify([...document.querySelectorAll('#demoList .demo-row span')].map(e => e.textContent)) === JSON.stringify(w)", arg=want, timeout=ms); return True
        except Exception: return False
    def chip(page):
        c = page.locator("#dd-sync-chip"); return c.inner_text().strip() if c.count() else ""
    def wait_chip(page, text, ms=6000):
        try: page.wait_for_function("(t) => { const c = document.getElementById('dd-sync-chip'); return c && c.textContent.trim() === t; }", arg=text, timeout=ms); return True
        except Exception: return False
    def add(page, text):
        page.fill("#demoNew", text); page.click("#demoAdd")
    def ledger(page): return page.evaluate("() => localStorage.getItem('dd_demo_sync_id_v1')")
    def remote_items(page):
        v = FB.at("sync/demo/" + ledger(page) + "/lists/items/items") or {}
        return sorted(json.loads(x)["text"] for x in v.values())
    def settle(page): page.wait_for_timeout(400)

    # ------------------------------------------------------------------
    print("Setup code, rules and the data format")
    ctx, page, errs = fresh()
    r = page.evaluate("(t) => dd.sync.parseConfig(t)", CFG)
    check("reads the console's const firebaseConfig = {...} form", r and r["apiKey"] == "AIzaFakeKeyForTests1234" and r["databaseURL"] == "https://my-dd-default-rtdb.firebaseio.com", r)
    r = page.evaluate("(t) => dd.sync.parseConfig(t)", json.dumps({"apiKey": "AIzaX1234567890", "projectId": "pj", "databaseURL": "https://pj-default-rtdb.europe-west1.firebasedatabase.app"}))
    check("reads strict JSON, keeps a European database address", r and r["databaseURL"].endswith("europe-west1.firebasedatabase.app"), r)
    r = page.evaluate("(t) => dd.sync.parseConfig(t)", cfg(url=False))
    check("no databaseURL (database made after the app): guesses the default address", r and r["databaseURL"] == "https://my-dd-default-rtdb.firebaseio.com" and r.get("guessedURL"), r)
    check("garbage is refused", page.evaluate("() => [dd.sync.parseConfig('hello'), dd.sync.parseConfig(''), dd.sync.parseConfig('{\"apiKey\":\"x\"}')].every(x => x === null)"))
    rules = page.evaluate("() => JSON.parse(dd.sync.rules)")
    led = rules["rules"]["sync"]["$program"]["$ledger"]
    check("rules: short, signed-in only, 32-character ledgers, nothing else readable", "auth != null" in led[".read"] and "length == 32" in led[".write"] and list(rules["rules"].keys()) == ["sync"] and len(json.dumps(rules, indent=2).splitlines()) <= 12)
    weird = {"items": [{"id": "a.b/c#1", "text": "x", "n": None, "arr": [1, 2], "o": {"k": ""}}, {"id": "z", "text": "y"}], "title": "t", "count": 0, "empty": [], "tags": ["a", "b"]}
    back = page.evaluate("(d) => dd.sync.fromFlat(dd.sync.toFlat(d))", weird)
    check("round trip keeps nulls, empty text, empty lists, order and odd ids", back == weird, back)
    flat = page.evaluate("(d) => dd.sync.toFlat(d)", weird)
    check("every Firebase key is legal (no . # $ [ ] /)", all(not re.search(r"[.#$\[\]]", k) for k in flat), list(flat))
    m = page.evaluate("""() => {
      const b = {'fields/x': '1', 'lists/l/items/a': '"A"', 'lists/l/items/b': '"B"', 'lists/l/order': 'o:a,b'};
      const l = Object.assign({}, b, {'lists/l/items/a': '"A2"'}); delete l['lists/l/items/b']; l['lists/l/order'] = 'o:a';
      const r = Object.assign({}, b, {'fields/x': '2', 'lists/l/items/c': '"C"', 'lists/l/order': 'o:a,b,c'});
      return dd.sync.merge(b, l, r);
    }""")
    check("merge: keeps my edit and my delete, takes their edit and their new item", m.get("lists/l/items/a") == '"A2"' and "lists/l/items/b" not in m and m.get("fields/x") == "2" and m.get("lists/l/items/c") == '"C"', m)
    m = page.evaluate("() => dd.sync.merge(null, {'lists/l/items/a': '1', 'lists/l/items/m': '9', 'lists/l/order': 'o:a,m'}, {'lists/l/items/a': '2', 'lists/l/items/r': '5', 'lists/l/order': 'o:r,a'})")
    check("first join: union by id, database wins the same id, my extras go last", m == {"lists/l/items/a": "2", "lists/l/items/m": "9", "lists/l/items/r": "5", "lists/l/order": "o:r,a,m"}, m)
    check("no sync chip while sync has never been on", chip(page) == "")
    ctx.close()

    # ------------------------------------------------------------------
    print("Example data never travels")
    FB.reset()
    ctx, page, errs = fresh()
    r = page.evaluate("(t) => dd.sync.connect(t)", CFG)
    check("connects with example data on screen", r["ok"], r)
    settle(page)
    check("nothing went to the database (example data stays home)", remote_items(page) == [], remote_items(page))
    check("example notice still showing", page.locator("#dd-notice-example").count() == 1)
    check("the QR leaves out example data but carries live sync", page.evaluate("() => { const m = dd.pair.makeLink({}); return m.included.indexOf('d') < 0 && m.included.indexOf('s') >= 0; }"))
    ctx.close()

    # ------------------------------------------------------------------
    print("Computer: turn on live sync with the wizard")
    FB.reset()
    pc_ctx, pc, pc_errs = fresh()
    pc.click("#dd-notice-example >> text=Clear them and start mine")
    add(pc, "Milk"); add(pc, "Eggs"); add(pc, "Flour")
    check("step 4 offers Start", pc.locator(".dd-step").nth(3).locator("[data-start=sync]").count() == 1)
    pc.click("[data-start=sync]")
    titles = []
    for i in range(6):
        titles.append(pc.locator(".dd-wiz h2").inner_text()); pc.click("[data-next]")
    titles.append(pc.locator(".dd-wiz h2").inner_text())
    check("wizard: intro, project, sign-in, database, rules, setup code, paste", titles == ["Your own free database", "Make a Firebase project", "Let the program sign in", "Make the database", "Paste the rules", "Copy your setup code", "Paste it here"], titles)
    pc.fill("#dd-wiz-fb", "this is not it"); pc.click("[data-action]")
    pc.wait_for_selector("#dd-wiz-status.err", timeout=4000)
    check("wrong paste: friendly words, no jargon", "setup code didn't work" in pc.inner_text("#dd-wiz-status"), pc.inner_text("#dd-wiz-status"))
    pc.fill("#dd-wiz-fb", CFG); pc.click("[data-action]")
    try: pc.wait_for_function("() => (document.querySelector('.dd-wiz h2') || {}).textContent === 'Live sync is on!'", timeout=8000); ok = True
    except Exception: ok = False
    check("Connect signs in and reaches 'Live sync is on!'", ok, pc.inner_text("#dd-wiz-status") if pc.locator("#dd-wiz-status").count() else "")
    pc.screenshot(path=os.path.join(SCRATCH, "sync_wizard_done.png"))
    pc.click("[data-next]")
    check("header chip says In step", wait_chip(pc, "In step"), chip(pc))
    settle(pc)
    check("the list is in the database", remote_items(pc) == ["Eggs", "Flour", "Milk"], remote_items(pc))
    check("setup code saved for every program on this address", pc.evaluate("() => !!JSON.parse(localStorage.getItem('dd_firebase_config_v1')).apiKey"))
    check("ledger id is 32 hex characters", re.fullmatch(r"[0-9a-f]{32}", ledger(pc) or "") is not None)
    check("setup step 4 ticked, with Settings", "done" in pc.locator(".dd-step").nth(3).get_attribute("class") and pc.locator("[data-syncsheet]").count() == 1)

    # ------------------------------------------------------------------
    print("Phone joins by scanning")
    made = pc.evaluate("() => { const m = dd.pair.makeLink({ includeCode: false }); return { link: m.link, inc: m.included, says: dd.pair.whatTravels(m) }; }")
    check("QR carries ledger + setup code, not the list", "s" in made["inc"] and "f" in made["inc"] and "d" not in made["inc"], made["inc"])
    check("QR sheet says the list comes across through live sync", "through live sync" in made["says"], made["says"])
    check("QR link stays small enough for a simple square", len(made["link"]) < 900, len(made["link"]))
    phone_ctx = b.new_context(**p.devices["iPhone 13"])
    phone_ctx.route("https://www.gstatic.com/firebasejs/**", serve_sdk)
    phone_ctx.route(NOTES_URL, lambda r: r.fulfill(status=404, body="", headers={"Access-Control-Allow-Origin": "*"}))
    ph = phone_ctx.new_page(); ph_errs = []; ph.on("pageerror", lambda e: ph_errs.append(str(e)))
    ph.goto(made["link"])
    check("phone shows the computer's list (it had example data)", wait_items(ph, ["Milk", "Eggs", "Flour"]), items(ph))
    fast(ph)
    check("phone chip says In step", wait_chip(ph, "In step"), chip(ph))
    check("phone is on the same ledger", ledger(ph) == ledger(pc))
    check("phone's setup step 4 ticks itself", "done" in (ph.locator(".dd-step").nth(3).get_attribute("class") or "") or "4 of 4" in ph.inner_text("#dd-setup") or "All set up" in ph.inner_text("#dd-setup"), ph.inner_text("#dd-setup")[:200])
    check("the code is gone from the phone's address bar", "#dd=" not in ph.url)
    check("example notice gone on the phone", ph.locator("#dd-notice-example").count() == 0)

    print("Changes go both ways")
    add(ph, "Bread")
    check("PHONE -> COMPUTER: phone adds Bread, computer shows it (the POC bug)", wait_items(pc, ["Milk", "Eggs", "Flour", "Bread"]), items(pc))
    pc.locator(".demo-row", has_text="Milk").locator("input").check()
    try: ph.wait_for_function("() => [...document.querySelectorAll('.demo-row.done span')].some(e => e.textContent === 'Milk')", timeout=5000); ok = True
    except Exception: ok = False
    check("computer ticks Milk, phone shows it ticked", ok)
    pc.locator(".demo-row", has_text="Eggs").locator(".demo-x").click()
    check("computer removes Eggs, phone loses it", wait_items(ph, ["Milk", "Flour", "Bread"]), items(ph))
    pushes = pc.evaluate("() => dd.diag.text().match(/Pushes sent \\/ confirmed: (\\d+)/)[1]")
    add(ph, "Jam")
    wait_items(pc, ["Milk", "Flour", "Bread", "Jam"]); settle(pc)
    pushes2 = pc.evaluate("() => dd.diag.text().match(/Pushes sent \\/ confirmed: (\\d+)/)[1]")
    check("a change from the phone isn't echoed back by the computer", pushes == pushes2, (pushes, pushes2))

    print("Offline, then back")
    ph.evaluate("() => window.__fakeNet(false)")
    check("phone chip says Offline", wait_chip(ph, "Offline"), chip(ph))
    add(ph, "Phone tea"); add(pc, "PC butter")
    check("while offline the computer doesn't see the phone's item", not wait_items(pc, ["Milk", "Flour", "Bread", "Jam", "Phone tea", "PC butter"], 800))
    ph.evaluate("() => window.__fakeNet(true)")
    want = ["Milk", "Flour", "Bread", "Jam", "PC butter", "Phone tea"]
    ok_pc = wait_items(pc, ["Milk", "Flour", "Bread", "Jam", "PC butter", "Phone tea"], 6000) or wait_items(pc, ["Milk", "Flour", "Bread", "Jam", "Phone tea", "PC butter"], 500)
    check("back online: the computer gets the phone's item", ok_pc, items(pc))
    check("...and the phone gets the computer's", sorted(items(ph)) == sorted(want) or wait_items(ph, items(pc)), items(ph))
    check("both devices end up with the same order", wait_items(ph, items(pc)), (items(ph), items(pc)))
    check("phone chip back to In step", wait_chip(ph, "In step"), chip(ph))

    print("The same item changed on both while the phone is offline: the newer edit wins")
    def rename(page, old, new): page.evaluate("(a) => dd.update(d => { d.items.find(i => i.text === a[0]).text = a[1]; })", [old, new])
    def tick(page, text, on=True): page.evaluate("(a) => dd.update(d => { d.items.find(i => i.text === a[0]).done = a[1]; })", [text, on])
    def row(page, text): return page.evaluate("(t) => { const i = dd.getData().items.find(x => x.text === t); return i ? i.done : null; }", text)
    ph.evaluate("() => window.__fakeNet(false)")
    rename(ph, "Milk", "Oat milk"); ph.wait_for_timeout(400)          # older edit, on the phone
    tick(pc, "Milk", False); pc.wait_for_timeout(400)                 # newer edit, on the computer
    ph.evaluate("() => window.__fakeNet(true)")
    try: ph.wait_for_function("() => dd.getData().items.some(i => i.text === 'Milk' && !i.done)", timeout=6000); ok = True
    except Exception: ok = False
    check("phone renamed Milk first, computer un-ticked it later: the computer's newer edit wins on the phone", ok, items(ph))
    settle(pc)
    check("...and the computer keeps it", row(pc, "Milk") is False and "Oat milk" not in items(pc), items(pc))
    ph.evaluate("() => window.__fakeNet(false)")
    tick(pc, "Flour", True); pc.wait_for_timeout(400)                 # older, on the computer
    rename(ph, "Flour", "Rye flour"); ph.wait_for_timeout(400)        # newer, on the offline phone
    ph.evaluate("() => window.__fakeNet(true)")
    try: pc.wait_for_function("() => dd.getData().items.some(i => i.text === 'Rye flour')", timeout=6000); ok = True
    except Exception: ok = False
    check("computer ticked Flour first, offline phone renamed it later: the phone's newer edit wins", ok, items(pc))
    check("...on both devices", wait_items(ph, items(pc)), (items(ph), items(pc)))
    ph.evaluate("() => window.__fakeNet(false)")
    ph.locator(".demo-row", has_text="Bread").locator(".demo-x").click(); ph.wait_for_timeout(400)   # older: delete
    rename(pc, "Bread", "Sliced bread"); pc.wait_for_timeout(400)                                     # newer: edit
    ph.evaluate("() => window.__fakeNet(true)")
    try: ph.wait_for_function("() => dd.getData().items.some(i => i.text === 'Sliced bread')", timeout=6000); ok = True
    except Exception: ok = False
    check("phone deleted Bread, computer edited it later: the edit wins and Bread comes back", ok, items(ph))
    check("both devices agree after all that", wait_items(pc, items(ph)), (items(ph), items(pc)))
    m = page_merge = pc.evaluate("""() => dd.sync.merge({'p': 'old'}, {'p': 'mine'}, {'p': 'theirs'}, { real: {'p': 'old'}, lt: {'p': 5}, rt: {'p': 9} })""")
    check("merge: both changed, theirs newer -> theirs", m == {"p": "theirs"}, m)
    m = pc.evaluate("""() => dd.sync.merge({'p': 'old'}, {'p': 'mine'}, {'p': 'theirs'}, { real: {'p': 'old'}, lt: {'p': 9}, rt: {'p': 5} })""")
    check("merge: both changed, mine newer -> mine", m == {"p": "mine"}, m)
    m = pc.evaluate("""() => dd.sync.merge({'p': 'old'}, {'p': 'mine'}, {'p': 'theirs'}, { real: {'p': 'old'}, lt: {'p': 5}, rt: {} })""")
    check("merge: their edit has no time (older version) -> mine", m == {"p": "mine"}, m)

    print("A change made offline survives a reload")
    ph.evaluate("() => window.__fakeNet(false)")
    add(ph, "Reload rice"); ph.wait_for_timeout(300)
    ph.reload(); fast(ph)
    try: pc.wait_for_function("() => [...document.querySelectorAll('#demoList .demo-row span')].some(e => e.textContent === 'Reload rice')", timeout=6000); ok = True
    except Exception: ok = False
    check("after the reload the computer gets it", ok, items(pc))
    check("phone resumed sync on its own", wait_chip(ph, "In step"), chip(ph))
    check("support report says it resumed", "resumed on load: yes" in ph.evaluate("() => dd.diag.text()"))

    print("Undo, clear and the helper's big changes sync like anything else")
    before = items(pc)
    snap = pc.evaluate("() => JSON.stringify(dd.getData())")
    pc.click("#demoClear"); pc.click("[data-yes]")
    check("computer clears the list, phone empties too", wait_items(ph, []), items(ph))
    pc.evaluate("(s) => dd.replaceData(JSON.parse(s), { source: 'helper-undo' })", snap)
    check("Undo (replaceData) brings it back on the phone", wait_items(ph, before), items(ph))

    print("Backup and restore")
    pc.click("#dd-data-link")
    check("footer Backup opens Your data", pc.locator(".dd-sheet h2").inner_text() == "Your list", pc.locator(".dd-sheet h2").inner_text())
    with pc.expect_download() as dl: pc.click("[data-down]")
    path = dl.value.path(); name = dl.value.suggested_filename
    bk = json.load(open(path))
    check("file name demo-list-backup-YYYY-MM-DD.json", re.fullmatch(r"demo-list-backup-\d{4}-\d{2}-\d{2}\.json", name) is not None, name)
    check("backup holds the list, program and version", bk["kind"] == "backup" and bk["program"] == "demo" and bk["schemaVersion"] == 2 and [i["text"] for i in bk["data"]["items"]] == before)
    pc.click("[data-close]")
    pc.click("#demoClear"); pc.click("[data-yes]"); wait_items(ph, [])
    pc.click("#dd-data-link")
    with pc.expect_file_chooser() as fc: pc.click("[data-up]")
    fc.value.set_files(path)
    pc.wait_for_selector("[data-yes]")
    check("restore asks first, and says the other devices get it", "other devices" in pc.inner_text(".dd-sheet"))
    pc.click("[data-yes]")
    check("restored on the computer", wait_items(pc, before), items(pc))
    check("...and on the phone through sync", wait_items(ph, before), items(ph))
    check("an Undo is offered after restoring", pc.locator("#dd-notice-restore >> text=Undo").count() == 1)
    pc.click("#dd-notice-restore >> text=Undo")
    check("Undo restore puts back the empty list", wait_items(pc, []), items(pc))
    pc.evaluate("(s) => dd.replaceData(JSON.parse(s), { source: 'test' })", snap)
    garbage = os.path.join(SCRATCH, "not-a-backup.json"); open(garbage, "w").write("hello")
    other = os.path.join(SCRATCH, "other-backup.json"); json.dump({"dd": 1, "kind": "backup", "program": "aitest", "name": "AI Test", "schemaVersion": 1, "data": {}}, open(other, "w"))
    newer = os.path.join(SCRATCH, "newer-backup.json"); json.dump({**bk, "schemaVersion": 9}, open(newer, "w"))
    old = os.path.join(SCRATCH, "old-backup.json"); json.dump({"dd": 1, "kind": "backup", "program": "demo", "schemaVersion": 1, "data": {"items": ["Old one", "Old two"]}}, open(old, "w"))
    for f, words, label in [(garbage, "didn't look like a backup", "garbage"), (other, "backup from AI Test", "another program's"), (newer, "newer version", "a newer version's")]:
        r = pc.evaluate("(t) => dd.backup.restoreText(t)", open(f).read())
        check(f"restore refuses {label} file kindly", not r["ok"] and words in r["title"], r)
    r = pc.evaluate("(t) => { const x = dd.backup.read(t); return x.ok && x.data.items.map(i => i.text); }", open(old).read())
    check("a backup from an older version is upgraded", r == ["Old one", "Old two"], r)

    print("Support report")
    d = pc.evaluate("() => dd.diag.text()")
    check("Sync section: state, database, pushes, remote updates", all(w in d for w in ["--- Sync ---", "State: on", "my-dd", "Pushes sent / confirmed", "Remote updates", "connected: yes"]), d[-900:])
    check("only the first 6 characters of the ledger", ledger(pc)[:6] + "…" in d and ledger(pc) not in d)
    check("Backup section", "--- Backup ---" in d)

    print("A stale sign-in (Firebase's Auto clean-up) heals itself")
    FB.tokens.clear()
    add(pc, "After cleanup")
    ok = wait_items(ph, items(pc)) and "After cleanup" in items(ph)
    check("the database says no, the program signs in again, and the change arrives", ok, items(ph))
    check("chip back to In step", wait_chip(pc, "In step"), chip(pc))
    check("support report notes the fresh sign-in", "signed in again 1x" in pc.evaluate("() => dd.diag.text()"))

    print("Turn off, and a reload remembers")
    ph.evaluate("() => dd.sync.stop()")
    add(pc, "After off")
    pc.wait_for_timeout(800)
    check("phone that turned sync off doesn't get new changes", "After off" not in items(ph))
    ph.reload(); fast(ph); ph.wait_for_timeout(800)
    check("still off after a reload", ph.evaluate("() => dd.sync.state().state") == "off" and "After off" not in items(ph))
    pc.reload(); fast(pc)
    check("computer resumes on reload", wait_chip(pc, "In step"), chip(pc))

    print("A newer version on the other device")
    FB.write("set", "sync/demo/" + ledger(pc) + "/meta/schema", 99, None, force=True)
    check("chip says Update needed", wait_chip(pc, "Update needed"), chip(pc))
    check("notice explains in plain words", "newer version" in pc.inner_text("#dd-notices"))
    FB.write("set", "sync/demo/" + ledger(pc) + "/meta/schema", 2, None, force=True)
    pc.reload(); fast(pc)
    check("back to In step once versions match", wait_chip(pc, "In step"), chip(pc))
    check("no page errors on the computer", not pc_errs, pc_errs[:3])
    check("no page errors on the phone", not ph_errs, ph_errs[:3])
    phone_ctx.close(); pc_ctx.close()

    # ------------------------------------------------------------------
    print("Problems get friendly words")
    for setup_fn, text, want, label in [
        (lambda: setattr(FB, "anon_disabled", True), CFG, "sign in", "Anonymous sign-in switched off"),
        (lambda: setattr(FB, "rules_closed", True), CFG, "said no", "rules not pasted"),
        (lambda: None, cfg(key=BAD_KEY), "setup code didn't work", "a wrong setup code"),
    ]:
        FB.reset(); setup_fn()
        ctx, page, errs = fresh()
        r = page.evaluate("(t) => dd.sync.connect(t)", text)
        check(f"{label}: '{r.get('title')}'", not r["ok"] and want in r["title"] and not re.search(r"auth/|PERMISSION|HTTP|Error", r["title"] + r["help"]), r)
        check(f"{label}: nothing saved, chip shows the problem", page.evaluate("() => localStorage.getItem('dd_firebase_config_v1')") is None and chip(page) == "Not in step", chip(page))
        ctx.close()
    FB.reset()
    ctx, page, errs = fresh()
    page.evaluate("() => { window.__fakeOffline = true; }")
    r = page.evaluate("(t) => dd.sync.connect(t)", CFG)
    check("no internet: says so", not r["ok"] and r["type"] == "sync_offline", r)
    ctx.close()
    ctx = b.new_context(); ctx.route("https://www.gstatic.com/firebasejs/**", serve_sdk)
    page = ctx.new_page(); page.goto("file://" + os.path.join(DIST, "demo.html"))
    r = page.evaluate("(t) => dd.sync.connect(t)", CFG)
    check("opened as a file: asks to put it online first", not r["ok"] and r["type"] == "sync_file", r)
    ctx.close()
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
