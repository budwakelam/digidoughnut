"""Phone pairing (QR) tests: make the QR on a 'computer', read it from a screenshot like a
phone camera would, open the link on an emulated iPhone.

    node build.mjs && python3 tests/pair_test.py

Needs a QR reader: set QR_DECODER to a node script that prints the text of a QR in a PNG
(jsQR + pngjs). Emulation is not a real iPhone: the real scan is Oran's gate.
"""
import json, os, sys, subprocess, threading, http.server, functools, base64, time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIST = os.path.join(ROOT, "dist")
DECODER = os.environ.get("QR_DECODER")
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=DIST))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{srv.server_address[1]}"
CODE = "AIzaSyPAIR0123456789abcdefghijklmnopqrs"
SHOT = os.path.join(ROOT, "tests", "screenshots"); os.makedirs(SHOT, exist_ok=True)

results = []
def check(name, ok, extra=""):
    results.append(ok); print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({extra})" if extra and not ok else ""))

def read_qr(page, name):
    path = os.path.join(SHOT, name)
    page.locator("#dd-qr svg").screenshot(path=path)
    if not DECODER: return None
    return subprocess.run(["node", DECODER, path], capture_output=True, text=True).stdout

def payload_of(link):
    parts = link.split("#dd=")[1].split("~"); out = {"t": parts[1], "i": parts[2]}
    for piece in parts[3:]:
        k, rest = piece[0], piece[1:]
        if rest.startswith("*"):
            r = rest[1:]; r += "=" * (-len(r) % 4); out[k] = json.loads(base64.urlsafe_b64decode(r).decode())
        else: out[k] = rest
    return out

with sync_playwright() as p:
    b = p.chromium.launch()
    def ctx_for(device=None):
        c = b.new_context(**(device or {}))
        c.route("https://budwakelam.github.io/**", lambda r: r.fulfill(status=404, body=""))
        return c

    print("\n== computer makes the QR ==")
    pc_ctx = ctx_for({"viewport": {"width": 1280, "height": 900}})
    pc = pc_ctx.new_page(); pc_errs = []; pc.on("pageerror", lambda e: pc_errs.append(str(e)))
    pc.goto(BASE + "/aitest.html"); pc.evaluate("() => localStorage.clear()")
    pc.evaluate(f"() => localStorage.setItem('dd_ai_connections_v1', JSON.stringify({{main:{{provider:'google',code:'{CODE}'}}}}))")
    pc.reload()
    pc.click("#tPhone")
    check("sheet shows a QR with a fixed size (not an empty box)", pc.evaluate("() => { const s=document.querySelector('#dd-qr svg'); return !!s && s.getAttribute('width') && s.getBoundingClientRect().width > 150; }"))
    check("warning says it contains the access code", "contains your access code" in pc.inner_text(".dd-sheet"))
    check("countdown shows 10 minutes", "Works for 10:00" in pc.inner_text("#dd-qr-timer") or "Works for 9:5" in pc.inner_text("#dd-qr-timer"), pc.inner_text("#dd-qr-timer"))
    link = read_qr(pc, "pair-qr-with-code.png")
    if link is None:
        link = pc.evaluate("() => dd.pair.makeLink({includeCode:true}).link"); print("  (no QR reader set: using the link directly)")
    check("QR reads back as a link to this same program", link.startswith(BASE + "/aitest.html#dd="), link[:80])
    check("compact: code-only link under 120 characters", len(link) < 120, str(len(link)))
    pl = payload_of(link)
    check("carries the code, a time stamp and a one-time id", pl.get("k") == CODE and "t" in pl and len(pl.get("i", "")) == 6, json.dumps(pl)[:100])
    modules = pc.evaluate("() => dd.pair.qrSvg(dd.pair.makeLink({includeCode:true}).link).modules")
    check("simple QR (41x41 or smaller, version 6 or lower)", modules <= 41, str(modules))
    pc.click("#dd-qr-code")  # leave the code out
    link_nocode = read_qr(pc, "pair-qr-no-code.png") or pc.evaluate("() => dd.pair.makeLink({includeCode:false}).link")
    check("unticking 'include my code' leaves it out", "k" not in payload_of(link_nocode))
    pc.screenshot(path=os.path.join(SHOT, "pair-sheet-desktop.png"))
    pc.keyboard.press("Escape")

    print("\n== phone scans it ==")
    ph_ctx = ctx_for(p.devices["iPhone 13"])
    ph = ph_ctx.new_page(); ph_errs = []; ph.on("pageerror", lambda e: ph_errs.append(str(e)))
    ph.goto(link); ph.wait_for_timeout(800)
    check("phone now has the access code", ph.evaluate(f"() => dd.ai.hasCode() && JSON.parse(localStorage.getItem('dd_ai_connections_v1')).main.code === '{CODE}'"))
    check("friendly 'came across' message", "came across from your computer" in ph.inner_text("body"))
    check("code removed from the address bar straight away", "#dd=" not in ph.url and CODE not in ph.url, ph.url)
    check("phone header shows connected", "Connected to Google" in ph.inner_text("#tConn"))
    ph.screenshot(path=os.path.join(SHOT, "pair-phone-received.png"))
    ph.goto(link); ph.wait_for_timeout(500)
    check("same QR again: 'already used'", "already used" in ph.inner_text("#dd-notices"))
    old = json.dumps({"v": 1, "t": format(int(time.time()) - 700, "x"), "i": "aaaabbbb", "k": CODE})
    def b36(n):
        s = "0123456789abcdefghijklmnopqrstuvwxyz"; o = ""
        while n: o = s[n % 36] + o; n //= 36
        return o
    old = {"v": 1, "t": b36(int(time.time()) - 700), "i": "aaaabbbb", "k": CODE}
    stale = BASE + "/aitest.html#dd=1~" + old["t"] + "~aaaabb~k" + CODE
    ph2 = ph_ctx.new_page(); ph2.goto(stale); ph2.wait_for_timeout(500)
    check("QR older than 10 minutes: 'expired, make a new one'", "expired" in ph2.inner_text("#dd-notices"))
    ph2.goto(BASE + "/aitest.html#dd=%%%garbage"); ph2.wait_for_timeout(300)
    check("damaged link: page still works, no crash", not ph_errs)
    check("phone layout: no sideways scroll", ph.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth"))

    print("\n== numbers travel too (demo program) ==")
    pc.goto(BASE + "/demo.html"); pc.wait_for_timeout(300)
    pc.click("#dd-notice-example >> text=Clear them and start mine")
    for t in ["Flour", "Sugar", "Market table"]:
        pc.fill("#demoNew", t); pc.click("#demoAdd")
    pc.click("#demoPhone")
    dlink = read_qr(pc, "pair-qr-demo.png") or pc.evaluate("() => dd.pair.makeLink({includeCode:true}).link")
    pc.keyboard.press("Escape")
    ph3 = ph_ctx.new_page(); ph3.goto(dlink); ph3.wait_for_timeout(600)
    items = ph3.locator(".demo-row span").all_inner_texts()
    check("the list arrives on the phone", items == ["Flour", "Sugar", "Market table"], str(items))
    check("...with no 'example' notice", ph3.locator("#dd-notice-example").count() == 0)
    pc.evaluate("() => dd.update(d => { for (let i = 0; i < 80; i++) d.items.push({id:'x'+i, text:'A fairly long item name number ' + i, done:false}); })")
    big = pc.evaluate("() => dd.pair.makeLink({includeCode:true})")
    check("too many numbers: left out, code still sent, QR stays simple", "d" not in payload_of(big["link"]) and "k" in payload_of(big["link"]) and big["left"] == ["numbers"])
    pc.click("#demoPhone")
    check("...and the sheet says so in plain words", "too much for one square" in pc.inner_text(".dd-sheet"))
    pc.keyboard.press("Escape")

    print("\n== from a file on the computer ==")
    fpage = pc_ctx.new_page(); fpage.goto("file://" + os.path.join(DIST, "aitest.html"))
    fpage.click("#tPhone")
    check("file: friendly 'put it online first', no QR", "can't open a file that lives on this computer" in fpage.inner_text(".dd-sheet") and fpage.locator("#dd-qr").count() == 0)
    check("no page errors on computer or phone", not pc_errs and not ph_errs, "; ".join((pc_errs + ph_errs)[:3]))
    b.close()
srv.shutdown()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
