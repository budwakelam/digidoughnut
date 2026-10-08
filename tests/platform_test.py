"""Phase 1 platform tests: run the assembled demo in headless Chromium.

    python3 tests/platform_test.py            (after: node build.mjs demo)

Every check runs twice per device: opened as a file (file://) and from a web address.
Devices: desktop and an emulated iPhone 13. Emulation is not a real iPhone; the Phase 1
gate still needs the demo opened from tiiny.host on Oran's iPhone.
"""
import json, os, sys, threading, http.server, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIST = os.path.join(ROOT, "dist")
SHOTS = os.path.join(ROOT, "tests", "screenshots")
os.makedirs(SHOTS, exist_ok=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=DIST))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URLS = {"file": "file://" + os.path.join(DIST, "demo.html"),
        "hosted": f"http://127.0.0.1:{srv.server_address[1]}/demo.html"}
KEY = "dd_demo_data_v1"

results = []
def check(name, ok, extra=""):
    results.append(ok)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({extra})" if extra and not ok else ""))

def items(page): return page.locator(".demo-row span").all_inner_texts()
def stored(page): return page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}'))")

def suite(browser, device_name, device, mode):
    print(f"\n== {device_name} · {mode} ==")
    ctx = browser.new_context(**device)
    page = ctx.new_page()
    errors, requests = [], []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    # The weekly noticeboard check is the only outside request allowed (and it's optional).
    ctx.route("https://budwakelam.github.io/**", lambda r: r.fulfill(status=404, body="", headers={"Access-Control-Allow-Origin": "*"}))
    page.on("request", lambda r: requests.append(r.url) if not r.url.startswith(("file:", "http://127.0.0.1", "data:", "https://budwakelam.github.io/digidoughnut/noticeboard/")) else None)
    url = URLS[mode]
    page.goto(url); page.evaluate("() => localStorage.clear()"); page.reload()

    # 1. Works before setup: example data, a notice, the shared frame
    check("first run shows example data", items(page) == ["Buy flour", "Book the market table", "Print price tags"], str(items(page)))
    check("example notice is shown", page.locator("#dd-notice-example").is_visible())
    check("nothing saved until the buyer acts", page.evaluate(f"() => localStorage.getItem('{KEY}')") is None)
    check("footer has brand line + version", "Made with care by DigiDoughnut · Demo List 0.1.5" in page.inner_text("#dd-footer"))
    check("page title is the bookmark name", page.title() == "Demo List · DigiDoughnut", page.title())
    page.screenshot(path=os.path.join(SHOTS, f"{device_name}-{mode}-first-run.png"), full_page=True)

    # 2. Saving
    page.fill("#demoNew", "Call the bakery"); page.click("#demoAdd")
    page.reload()
    check("added item survives a reload", "Call the bakery" in items(page))
    env = stored(page)
    check("saved inside the envelope", env.get("dd") == 1 and env.get("program") == "demo" and env.get("schemaVersion") == 2, json.dumps(env)[:120])
    check("example flag still on after an edit", env.get("example") is True)

    # 3. Clear example and start fresh
    page.click("#dd-notice-example >> text=Clear them and start mine")
    check("start-mine empties the list", items(page) == [])
    check("example notice goes away", page.locator("#dd-notice-example").count() == 0)
    check("toast confirms", page.locator(".dd-toast").is_visible())
    page.reload()
    check("still empty, no notice after reload", items(page) == [] and page.locator("#dd-notice-example").count() == 0)

    # 4. Friendly confirm instead of window.confirm
    page.fill("#demoNew", "Keep me"); page.press("#demoNew", "Enter")
    page.click("#demoClear"); page.click("text=No, keep it")
    check("confirm 'No' keeps data", items(page) == ["Keep me"])
    page.click("#demoClear"); page.click("text=Yes, clear it")
    check("confirm 'Yes' clears data", items(page) == [])

    # 5. Upgrade from data saved before envelopes existed (schema 0, like the POC)
    page.evaluate(f"() => localStorage.setItem('{KEY}', JSON.stringify({{items:['old one','old two']}}))")
    page.reload()
    check("legacy data migrates and shows", items(page) == ["old one", "old two"], str(items(page)))
    env = stored(page)
    check("migrated data re-saved at schema 2", env.get("schemaVersion") == 2 and isinstance(env["data"]["items"][0], dict))

    # 6. Unreadable data is never thrown away
    page.evaluate(f"() => localStorage.setItem('{KEY}', 'not json {{')")
    page.reload()
    check("unreadable data: friendly notice", page.locator("#dd-notice-load").is_visible())
    check("unreadable data: recovery copy kept", page.evaluate("() => localStorage.getItem('dd_demo_data_recovery_v1')") == "not json {")
    check("unreadable data: no technical words shown", not any(w in page.inner_text("body").lower() for w in ["json", "undefined", "error:", "exception", "null"]))

    # 7. Data from a newer version: kept as a recovery copy, still used if it validates
    page.evaluate(f"""() => localStorage.setItem('{KEY}', JSON.stringify({{dd:1,program:'demo',schemaVersion:9,example:false,
        data:{{items:[{{id:'n1',text:'from the future',done:false}}]}}}}))""")
    page.reload()
    check("newer data still loads", items(page) == ["from the future"])

    # 8. Support diagnostic: triple-click footer, masked codes, no scary text to the buyer
    page.evaluate("() => dd.errors.record('test', 'GET https://x/v1?key=AIzaSyA1234567890abcdefghijklmnopqrstu failed sk-or-v1-abcdefghijklmnop123456')")
    page.click("#dd-footer p", click_count=3)
    txt = page.inner_text("#dd-diag-text") if page.locator("#dd-diag-text").count() else ""
    check("triple-click opens support details", "--- Program ---" in txt and "Demo List 0.1.5" in txt)
    check("codes are masked in the diagnostic", "AIzaSyA1234567890abc" not in txt and "abcdefghijklmnop123456" not in txt and "[hidden]" in txt)
    check("diagnostic knows file vs hosted", ("Opened from a file" in txt) == (mode == "file"))
    page.keyboard.press("Escape")
    check("Esc closes the sheet", page.locator(".dd-overlay").count() == 0)

    # 9. Phone layout: no sideways scrolling
    if device.get("is_mobile"):
        check("no horizontal scroll on phone", page.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth"))
        page.click("#dd-footer p", click_count=3)
        page.screenshot(path=os.path.join(SHOTS, f"{device_name}-{mode}-diagnostic.png"))
        page.keyboard.press("Escape")

    check("no page or console errors", not errors, "; ".join(errors[:3]))
    check("no outside requests except the noticeboard", not requests, ", ".join(requests[:3]))
    ctx.close()

def blocked_storage(browser):
    """A browser that refuses to save (e.g. some private windows). Page must still work and say so kindly."""
    print("\n== desktop · hosted · storage blocked ==")
    ctx = browser.new_context()
    ctx.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new DOMException('denied','SecurityError')}})")
    page = ctx.new_page(); errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URLS["hosted"])
    check("still opens with example data", len(items(page)) == 3)
    page.fill("#demoNew", "x"); page.click("#demoAdd")
    note = page.locator("#dd-notice-save-fail")
    check("explains saving is blocked, in plain words", note.count() == 1 and "private" in note.inner_text().lower(), note.inner_text() if note.count() else "no notice")
    check("no page errors", not errors, "; ".join(errors[:3]))
    ctx.close()

def offline(browser):
    print("\n== desktop · file · offline ==")
    ctx = browser.new_context(offline=True)
    page = ctx.new_page(); errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URLS["file"]); page.evaluate("() => localStorage.clear()"); page.reload()
    page.fill("#demoNew", "offline item"); page.click("#demoAdd")
    check("works fully offline", "offline item" in items(page) and not errors)
    ctx.close()

with sync_playwright() as p:
    b = p.chromium.launch()
    devices = {"desktop": {"viewport": {"width": 1280, "height": 900}}, "iphone13": p.devices["iPhone 13"]}
    for dn, dv in devices.items():
        for mode in ("file", "hosted"):
            suite(b, dn, dv, mode)
    blocked_storage(b)
    offline(b)
    b.close()
srv.shutdown()
print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
