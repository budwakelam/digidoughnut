"""Phase 6 tests: connect your own AI agent (dd.agent).

    node build.mjs && python3 tests/agent_test.py

The "agent" here is plain Python using ONLY the REST API described in the instructions the buyer
copies (sign in, read the view, drop an instruction in the inbox, read the result), against the
fake Firebase (tests/fakefirebase.py). The buyer's devices are real browser copies of demo.html.
Proves our side only: the gate is Oran's Muse changing his list on his PC + iPhone.
"""
import json, os, re, threading, http.server, functools, time, urllib.request
from playwright.sync_api import sync_playwright
from fakefirebase import FakeFirebase

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIST = os.path.join(ROOT, "dist")
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=DIST))
threading.Thread(target=srv.serve_forever, daemon=True).start()
HOSTED = f"http://127.0.0.1:{srv.server_address[1]}/demo.html"
NOTES_URL = "https://budwakelam.github.io/digidoughnut/noticeboard/notes.json"
FB = FakeFirebase()
API_KEY = "AIzaFakeKeyForTests1234"
CFG = ('const firebaseConfig = {\n  apiKey: "%s",\n  authDomain: "my-dd.firebaseapp.com",\n  databaseURL: "https://my-dd-default-rtdb.firebaseio.com",\n'
       '  projectId: "my-dd",\n  storageBucket: "my-dd.firebasestorage.app",\n  messagingSenderId: "1234",\n  appId: "1:1234:web:abcd"\n};' % API_KEY)

results = []
def check(name, ok, extra=""):
    results.append(bool(ok)); print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({extra})" if extra and not ok else ""))

def serve_sdk(route):
    name = route.request.url.rsplit("/", 1)[1]
    route.fulfill(status=200, content_type="text/javascript", headers={"Access-Control-Allow-Origin": "*"}, body=FB.module(name))

# ---------- the agent: REST only, following the brief ----------
class Agent:
    def __init__(self, brief):
        self.brief = brief
        m = re.search(r"BASE = (https://\S+)", brief); self.base_real = m.group(1)
        # Swap the real database address for the fake one, keep the path from the brief.
        self.base = FB.url + "/" + self.base_real.split("/", 3)[3]
        key = re.search(r"accounts:signUp\?key=(\S+)", brief).group(1)
        r = self.call("POST", FB.url + "/v1/accounts:signUp?key=" + key, {"returnSecureToken": True})
        self.token = r["idToken"]
        self.link = re.search(r"(http\S+#ddagent=\S+)", brief).group(1)
    def call(self, method, url, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers={"content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as res: return json.loads(res.read().decode() or "null")
    def get(self, sub): return self.call("GET", self.base + sub + ".json?auth=" + self.token)
    def send(self, tool, args=None):
        return self.call("POST", self.base + "/inbox.json?auth=" + self.token, {"tool": tool, "args": args or {}, "at": {".sv": "timestamp"}})["name"]
    def result(self, id_, ms=8000, until=lambda r: r is not None):
        end = time.time() + ms / 1000
        while True:
            r = self.get("/done/" + id_)
            if until(r) or time.time() > end: return r
            time.sleep(0.2)

with sync_playwright() as p:
    b = p.chromium.launch()
    def fresh(device=None, url=HOSTED, clear=True):
        ctx = b.new_context(**(device or {"viewport": {"width": 1280, "height": 800}}))
        ctx.route("https://www.gstatic.com/firebasejs/**", serve_sdk)
        ctx.route("https://generativelanguage.googleapis.com/**", lambda r: r.fulfill(status=404, body=""))
        ctx.route(NOTES_URL, lambda r: r.fulfill(status=404, body="", headers={"Access-Control-Allow-Origin": "*"}))
        page = ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(HOSTED)
        if clear: page.evaluate("() => localStorage.clear()")
        page.goto("about:blank"); page.goto(url)
        fast(page)
        return ctx, page, errs
    def fast(page): page.evaluate("() => { dd.sync.limits.debounce = 150; dd.sync.limits.connect = 6000; }")
    def items(page): return page.locator("#demoList .demo-row span").all_inner_texts()
    def wait_items(page, want, ms=8000):
        try: page.wait_for_function("(w) => JSON.stringify([...document.querySelectorAll('#demoList .demo-row span')].map(e => e.textContent)) === JSON.stringify(w)", arg=want, timeout=ms); return True
        except Exception: return False
    def wait_chip(page, text, ms=8000):
        try: page.wait_for_function("(t) => { const c = document.getElementById('dd-sync-chip'); return c && c.textContent.trim() === t; }", arg=text, timeout=ms); return True
        except Exception: return False
    def add(page, text): page.fill("#demoNew", text); page.click("#demoAdd")
    def ledger(page): return page.evaluate("() => localStorage.getItem('dd_demo_sync_id_v1')")
    def connect(page):
        return page.evaluate("(t) => dd.sync.connect(t)", CFG)

    # ------------------------------------------------------------------
    print("Setup step 5 and the instructions")
    ctx, page, errs = fresh()
    check("step 5 is listed: Connect your AI agent", "Connect your AI agent" in page.locator("#dd-setup").inner_text())
    check("before sync it says it needs step 4 first", "Needs step 4 first" in page.locator("#dd-setup").inner_text())
    check("the card counts five steps", "of 5 done" in page.locator("#dd-setup").inner_text())
    page.click("#demoClear"); page.click("[data-yes]")   # start with an empty list of our own
    add(page, "Flour"); add(page, "Sugar")
    r = connect(page)
    check("live sync connects", r.get("ok"), r)
    page.wait_for_selector("[data-agent]")
    page.click("[data-agent]")
    page.wait_for_selector("#dd-agent-brief", state="attached")
    sheet = page.locator(".dd-sheet").inner_text()
    check("the sheet says plainly that anyone with the instructions can change the data", "Anyone who has them can read and change your list" in sheet)
    check("the sheet says big changes wait for the Yes", "wait until you tap Yes on your own device" in sheet)
    check("the sheet names where the agent's reading goes (Meta for Muse)", "Meta" in sheet)
    brief = page.evaluate("() => document.getElementById('dd-agent-brief').textContent")
    led = ledger(page)
    check("the instructions hold the database address and this program's private ledger",
          f"https://my-dd-default-rtdb.firebaseio.com/sync/demo/{led}/agent" in brief)
    check("the instructions explain sign-in, read, change and result", all(w in brief for w in ["accounts:signUp?key=" + API_KEY, "securetoken.googleapis.com", "/view.json", "/inbox.json", "/done/<id>.json"]))
    check("every action is listed, with its inputs", all(t in brief for t in ["add_item", "set_done", "remove_item", "clear_list", "text (text, required)", "done (boolean, optional)"]))
    check("clear_list is marked as a big change", re.search(r"clear_list:.*waits for my Yes", brief))
    check("the instructions tell the agent the change happens when the app is next open", "next time it is open" in brief)
    check("the instructions carry the agent link", "#ddagent=" in brief)
    check("no access code (Penny's Google code) in the instructions", "AQ." not in brief and "generativelanguage" not in brief)
    page.click("[data-copy]"); page.wait_for_timeout(300)
    check("copying marks step 5 done", page.evaluate("() => dd.agent.connected()"))
    page.click("[data-close]")
    check("the setup card shows step 5 as done", page.locator(".dd-step.done").filter(has_text="Connect your AI agent").count() == 1)

    # ------------------------------------------------------------------
    print("The agent reads the list")
    agent = Agent(brief)
    view = None
    for _ in range(40):
        view = agent.get("/view")
        if view and "Flour" in (view.get("summary") or ""): break
        time.sleep(0.2)
    check("the view is there and its summary matches the list", view and "Flour" in view["summary"] and "Sugar" in view["summary"], view)
    check("the view's data is the real data as JSON text", view and [i["text"] for i in json.loads(view["data"])["items"]] == ["Flour", "Sugar"])
    check("the view lists the tools", view and {t["name"] for t in json.loads(view["tools"])} == {"add_item", "set_done", "remove_item", "clear_list"})
    check("the view has a server time", view and isinstance(view.get("updatedAt"), int))
    add(page, "Eggs")
    ok = False
    for _ in range(40):
        v = agent.get("/view")
        if v and "Eggs" in v["summary"]: ok = True; break
        time.sleep(0.2)
    check("a change on the computer updates the view", ok)
    w0 = FB.writes; page.wait_for_timeout(3500)
    check("the view isn't rewritten when nothing changed", FB.writes - w0 <= 1, FB.writes - w0)

    # ------------------------------------------------------------------
    print("The agent makes changes while the computer is open")
    id1 = agent.send("add_item", {"text": "Bread"})
    r = agent.result(id1)
    check("add_item: the result says done", r and r["ok"] and "Bread" in r["message"], r)
    check("the computer's list shows it", wait_items(page, ["Flour", "Sugar", "Eggs", "Bread"]))
    check("the instruction is cleared from the inbox", agent.get("/inbox/" + id1) is None)
    check("the buyer sees what the agent changed, with Undo", page.locator("#dd-notice-agent-undo").count() and "Bread" in page.locator("#dd-notice-agent-undo").inner_text())
    id2 = agent.send("set_done", {"text": "flour", "done": "true"})
    r = agent.result(id2)
    check("set_done with \"true\" as text still works", r and r["ok"], r)
    check("Flour is ticked on the computer", page.locator(".demo-row.done").filter(has_text="Flour").count() == 1)
    page.locator("#dd-notice-agent-undo button", has_text="Undo").click()
    check("Undo puts back what the agent changed", wait_items(page, ["Flour", "Sugar", "Eggs"]) and page.locator(".demo-row.done").count() == 0)
    r = agent.result(agent.send("fly_to_moon", {}))
    check("an unknown action: not done, and the message lists the real ones", r and not r["ok"] and "add_item" in r["message"], r)
    r = agent.result(agent.send("add_item", {}))
    check("a missing input: not done, says which", r and not r["ok"] and "'text' is missing" in r["message"], r)
    r = agent.result(agent.send("remove_item", {"text": "Caviar"}))
    check("the tool's own refusal comes back to the agent", r and not r["ok"] and "No item matches" in r["message"], r)
    check("the list wasn't touched by the refusals", items(page) == ["Flour", "Sugar", "Eggs"])

    # ------------------------------------------------------------------
    print("Big changes wait for the buyer's Yes")
    idc = agent.send("clear_list")
    r = agent.result(idc, until=lambda r: r is not None and r.get("waiting"))
    check("clear_list: the agent is told it waits for the person's Yes", r and r.get("waiting") and not r["ok"], r)
    check("the list is untouched so far", items(page) == ["Flour", "Sugar", "Eggs"])
    page.wait_for_selector(f"#dd-notice-agentask-{idc}", timeout=5000)
    q = page.locator(f"#dd-notice-agentask-{idc}").inner_text()
    check("the computer asks the question in plain words", "Your AI agent asks: Clear all 3 items" in q, q)
    page.locator(f"#dd-notice-agentask-{idc} button", has_text="No, leave it").click()
    r = agent.result(idc, until=lambda r: r and not r.get("waiting"))
    check("No: the agent is told nothing was changed", r and not r["ok"] and r.get("declined"), r)
    check("No: the list is kept", items(page) == ["Flour", "Sugar", "Eggs"])
    idc = agent.send("clear_list")
    page.wait_for_selector(f"#dd-notice-agentask-{idc}", timeout=5000)
    page.locator(f"#dd-notice-agentask-{idc} button", has_text="Yes, clear it").click()
    r = agent.result(idc, until=lambda r: r and not r.get("waiting"))
    check("Yes: the agent is told it's done", r and r["ok"] and "Cleared" in r["message"], r)
    check("Yes: the list is cleared", wait_items(page, []))
    for t in ["Apples", "Pears"]: agent.result(agent.send("add_item", {"text": t}))
    check("the agent's adds land after the clear", wait_items(page, ["Apples", "Pears"]))

    # ------------------------------------------------------------------
    print("Nothing open: the instruction waits")
    ctx.close()
    idw = agent.send("add_item", {"text": "Milk"})
    time.sleep(1.5)
    check("with the app closed everywhere there's no result yet", agent.get("/done/" + idw) is None)
    check("the instruction sits in the inbox", (agent.get("/inbox/" + idw) or {}).get("tool") == "add_item")

    print("The agent opens its link (its own fresh browser)")
    actx, apage, aerrs = fresh(url=agent.link)
    r = agent.result(idw)
    check("opening the link carries out the waiting instruction", r and r["ok"] and "Milk" in r["message"], r)
    check("the agent's browser shows the list", wait_items(apage, ["Apples", "Pears", "Milk"]))
    check("the link is gone from the address bar", "ddagent" not in apage.url)
    check("it's marked as the agent's browser, and says so", apage.evaluate("() => dd.agent.isAgentDevice()") and apage.locator("#dd-notice-agentdev").count() == 1)
    idc2 = agent.send("clear_list")
    r = agent.result(idc2, until=lambda r: r is not None and r.get("waiting"))
    apage.wait_for_timeout(800)
    check("in the agent's browser a big change still waits, and no Yes is offered there", r and r.get("waiting") and apage.locator(f"#dd-notice-agentask-{idc2}").count() == 0, r)
    check("the agent's browser can't approve it", items(apage) == ["Apples", "Pears", "Milk"])
    check("no errors in the agent's browser", not aerrs, aerrs)
    actx.close()

    print("The buyer opens the program again later")
    ctx, page, errs = fresh()
    # a new context has no storage: join the same ledger, as the buyer's computer would have
    page.evaluate("([l, t]) => dd.sync.join(l, dd.sync.parseConfig(t))", [led, CFG])
    check("the waiting question shows on the buyer's device", page.wait_for_selector(f"#dd-notice-agentask-{idc2}", timeout=6000) is not None)
    check("the agent's earlier change is there", wait_items(page, ["Apples", "Pears", "Milk"]))
    page.locator(f"#dd-notice-agentask-{idc2} button", has_text="No, leave it").click()
    r = agent.result(idc2, until=lambda r: r and not r.get("waiting"))
    check("answered here, the agent gets the answer", r and r.get("declined"), r)

    # ------------------------------------------------------------------
    print("Two of the buyer's devices open at once: each instruction runs once")
    pctx, ppage, perrs = fresh({"viewport": {"width": 390, "height": 844}, "is_mobile": True, "has_touch": True})
    ppage.evaluate("([l, t]) => dd.sync.join(l, dd.sync.parseConfig(t))", [led, CFG])
    check("the phone joins the same list", wait_items(ppage, ["Apples", "Pears", "Milk"]))
    ids = [agent.send("add_item", {"text": "Jam %d" % n}) for n in range(5)]
    rs = [agent.result(i) for i in ids]
    check("all five are done", all(r and r["ok"] for r in rs), rs)
    want = ["Apples", "Pears", "Milk"] + ["Jam %d" % n for n in range(5)]
    check("each one was added exactly once, on both devices", wait_items(page, want) and wait_items(ppage, want), (items(page), items(ppage)))
    led_items = FB.at(f"sync/demo/{led}/lists/items/items") or {}
    check("the database holds each once too", sorted(json.loads(x)["text"] for x in led_items.values()) == sorted(want))

    # ------------------------------------------------------------------
    print("Disconnect my agent")
    page.evaluate("() => { dd.agent.disconnect(); }")
    page.click("[data-yes]")
    try: page.wait_for_function("(old) => { const l = localStorage.getItem('dd_demo_sync_id_v1'); return l && l !== old && dd.sync.state().state === 'on'; }", arg=led, timeout=8000); moved = True
    except Exception: moved = False
    check("the computer moves to a new private address and stays in step", moved)
    new = ledger(page)
    old_tree = FB.at(f"sync/demo/{led}") or {}
    check("the old address is emptied, only a 'moved' mark is left", old_tree == {"meta": {"v": 1, "schema": 2, "moved": True}} or (set(old_tree) == {"meta"} and old_tree["meta"].get("moved")), old_tree)
    check("the agent can't read the list any more", agent.get("/view") is None)
    check("the new address holds the whole list", sorted(json.loads(x)["text"] for x in (FB.at(f"sync/demo/{new}/lists/items/items") or {}).values()) == sorted(want))
    try: ppage.wait_for_selector("#dd-notice-sync", timeout=6000); told = "moved to a new private address" in ppage.locator("#dd-notice-sync").inner_text()
    except Exception: told = False
    check("the phone stops and says how to get back in step", told and not ppage.evaluate("() => dd.sync.isOn()"))
    check("the phone keeps its list", items(ppage) == want, items(ppage))
    check("step 5 is no longer marked done", not page.evaluate("() => dd.agent.connected()"))
    idx = agent.send("add_item", {"text": "Sneaky"})
    time.sleep(1.5)
    check("an old instruction sent to the old address goes nowhere", "Sneaky" not in items(page))
    page.keyboard.press("Escape")

    # ------------------------------------------------------------------
    print("Example data, support report, privacy")
    ectx, epage, eerrs = fresh()
    check("a first visit shows example data", epage.evaluate("() => dd.isExample()"))
    epage.evaluate("(t) => dd.sync.connect(t)", CFG)
    ebrief = epage.evaluate("() => dd.agent.brief()")
    eagent = Agent(ebrief)
    v = None
    for _ in range(30):
        v = eagent.get("/view")
        if v: break
        time.sleep(0.2)
    check("with example data the agent is told it isn't theirs, and gets no data", v and v["example"] and json.loads(v["data"]) is None and "example" in v["summary"], v)
    r = eagent.result(eagent.send("add_item", {"text": "Real thing"}))
    check("the agent's first change starts the buyer's own list (example cleared, and said so)", r and r["ok"] and "example data" in r["message"] and wait_items(epage, ["Real thing"]), r)
    check("…and it travels through sync", any(json.loads(x)["text"] == "Real thing" for x in (FB.at("sync/demo/" + ledger(epage) + "/lists/items/items") or {}).values()))
    rep = epage.evaluate("() => dd.diag.text()")
    check("the support report has an AI agent section", "--- AI agent ---" in rep and "Instructions done: 1" in rep, rep[-600:])
    check("the support report hides the setup code's key", API_KEY not in rep)
    epage.evaluate("() => dd.ui.privacy()")
    check("the privacy sheet mentions the AI agent", "Your AI agent" in epage.locator(".dd-sheet").inner_text())
    check("no page errors on the buyer's devices", not errs and not perrs and not eerrs, errs + perrs + eerrs)
    b.close()

print(f"\n{sum(results)}/{len(results)} checks passed")
