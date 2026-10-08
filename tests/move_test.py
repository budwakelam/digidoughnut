"""Phase 7 tests: the program menu (7.1), "Where it lives" (7.2), moving between copies and the
receiving guard (7.3). Headless Chromium, no outside connections.

    node build.mjs demo && python3 tests/move_test.py

Two local servers on different ports stand in for two web addresses:
  HOME = the DigiDoughnut version (DD_BUILD.home points here)
  OWN  = the buyer's own copy
The built file is copied into a temp folder with "home" filled in (the shipped build has it empty).
"""
import json, os, re, sys, tempfile, threading, http.server, functools, shutil
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "dist", "demo.html")
SHOTS = os.path.join(ROOT, "tests", "screenshots")
os.makedirs(SHOTS, exist_ok=True)
KEY = "dd_demo_data_v1"

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve(d):
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=d))
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s

TMP = tempfile.mkdtemp()
HOME_DIR, OWN_DIR, NOHOME_DIR = (os.path.join(TMP, x) for x in ("home", "own", "nohome"))
for d in (HOME_DIR, OWN_DIR, NOHOME_DIR): os.makedirs(d)
home_srv, own_srv = serve(HOME_DIR), serve(OWN_DIR)
HOME = f"http://127.0.0.1:{home_srv.server_address[1]}/demo.html"
OWN = f"http://127.0.0.1:{own_srv.server_address[1]}/demo.html"
html = open(SRC, encoding="utf8").read()
assert '"home":""' in html, "build the shipped file with no home address first"
with_home = html.replace('"home":""', '"home":' + json.dumps(HOME))
for d in (HOME_DIR, OWN_DIR): open(os.path.join(d, "demo.html"), "w", encoding="utf8").write(with_home)
open(os.path.join(NOHOME_DIR, "demo.html"), "w", encoding="utf8").write(html)
FILE_HOME = "file://" + os.path.join(OWN_DIR, "demo.html")      # a file, with a DigiDoughnut version offered
FILE_NOHOME = "file://" + os.path.join(NOHOME_DIR, "demo.html")  # a file, no DigiDoughnut version

results = []
def check(name, ok, extra=""):
    results.append(bool(ok))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({extra})" if extra and not ok else ""))

def items(page): return page.locator(".demo-row span").all_inner_texts()
def fresh(page, url):
    page.goto(url); page.evaluate("() => localStorage.clear()"); page.reload(); page.wait_for_timeout(300)
def mine(page, texts):
    """Give this copy the buyer's own list (not example data)."""
    page.evaluate("""(texts) => dd.replaceData({items: texts.map((t, i) => ({id: 'b' + i, text: t, done: false}))}, {example: false, source: 'test'})""", texts)
def menu_labels(page):
    page.click("#dd-menu-btn"); page.wait_for_timeout(100)
    out = page.locator(".dd-menu-item b").all_inner_texts()
    page.click(".dd-sheet [data-close]")
    return out
def open_item(page, item):
    page.click("#dd-menu-btn"); page.click(f"[data-item={item}]"); page.wait_for_timeout(150)
def new_page(ctx, errors):
    p = ctx.new_page()
    p.on("pageerror", lambda e: errors.append(str(e)))
    return p

def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        devices = {"desktop": {"viewport": {"width": 1280, "height": 800}}, "iphone": pw.devices["iPhone 13"]}

        # ---------- 7.1 the menu, same place in every state ----------
        for dev_name, dev in devices.items():
            for mode, url in (("file", FILE_NOHOME), ("home", HOME), ("own", OWN)):
                print(f"\n== menu · {dev_name} · {mode} ==")
                ctx = browser.new_context(**dev); errors = []
                ctx.route("https://budwakelam.github.io/**", lambda r: r.fulfill(status=404, body=""))
                page = new_page(ctx, errors); fresh(page, url)
                btn = page.locator("#dd-menu-btn")
                box = btn.bounding_box(); vw = page.viewport_size["width"]
                check("menu button is top-left", box and box["x"] < 40 and box["y"] < 80 and box["x"] + box["width"] < vw * 0.7, str(box))
                check("button shows the program's name", "Demo List" in btn.inner_text())
                labels = menu_labels(page)
                want = ["Setup & connections", "Where it lives"] + ([] if dev_name == "iphone" else ["Send to my phone"]) + \
                       ["Backup & new versions", "Privacy", "Help & support details", "About"]
                check("items in the fixed order" + (" (no Send to my phone on a phone)" if dev_name == "iphone" else ""), labels == want, str(labels))
                # The menu doesn't close on a stray click (rule 9)
                page.click("#dd-menu-btn"); page.mouse.click(5, page.viewport_size["height"] - 5); page.wait_for_timeout(100)
                check("a click beside the menu doesn't close it", page.locator(".dd-menu-list").is_visible())
                page.keyboard.press("Escape")
                if mode == "file":
                    open_item(page, "setup")
                    check("Setup & connections opens the steps as a sheet", page.locator(".dd-sheet .dd-steps .dd-step").count() == 5)
                    page.click(".dd-sheet [data-close]")
                    page.click("#dd-setup-fold")
                    open_item(page, "setup")
                    check("works after Hide this for now", page.locator(".dd-sheet .dd-steps").is_visible() and page.locator(".dd-sheet [data-unfold]").is_visible())
                    page.click(".dd-sheet [data-unfold]")
                    check("Show the setup card again unfolds it", page.locator(".dd-setup-card").is_visible())
                    open_item(page, "backup"); check("Backup & new versions opens", "Backup & new versions" in page.inner_text(".dd-sheet h2")); page.keyboard.press("Escape")
                    open_item(page, "privacy"); check("Privacy opens", "connects to" in page.inner_text(".dd-sheet h2")); page.keyboard.press("Escape")
                    open_item(page, "help"); check("Help opens the support details", "--- Program ---" in page.inner_text("#dd-diag-text")); page.keyboard.press("Escape")
                    open_item(page, "about"); check("About shows name and version", "Version 0.1.4" in page.inner_text(".dd-sheet")); page.keyboard.press("Escape")
                    page.click("#dd-footer p", click_count=3); page.wait_for_timeout(100)
                    check("footer triple-click still opens support details", page.locator("#dd-diag-text").is_visible()); page.keyboard.press("Escape")
                    if dev_name == "desktop":
                        open_item(page, "phone"); check("Send to my phone from a file explains step 3", "can't open a file" in page.inner_text(".dd-sheet")); page.keyboard.press("Escape")
                page.screenshot(path=os.path.join(SHOTS, f"menu-{dev_name}-{mode}.png"))
                check("no page errors", not errors, "; ".join(errors[:3]))
                ctx.close()

        # ---------- 7.2 step 3 "Where it lives" ----------
        print("\n== step 3 · where it lives ==")
        ctx = browser.new_context(viewport={"width": 1280, "height": 800}); errors = []
        ctx.route("https://budwakelam.github.io/**", lambda r: r.fulfill(status=404, body=""))
        page = new_page(ctx, errors)
        fresh(page, FILE_NOHOME)
        s3 = page.locator('.dd-setup-card [data-step="phone"]')
        check("file, no home: step 3 not done", "done" not in (s3.get_attribute("class") or ""))
        check("file, no home: step 3 is called Where it lives", "Where it lives" in s3.inner_text())
        check("file: the row just says where it lives now", "Now: a file on this computer." in s3.inner_text(), s3.inner_text())
        check("file: one button, Change", s3.locator("button").all_inner_texts() == ["Change"], str(s3.locator("button").all_inner_texts()))
        s3.locator("[data-start=host]").click(); page.wait_for_timeout(150)
        here = page.locator(".dd-place.here")
        check("Change opens Where it lives with the current place highlighted", here.count() == 1 and "A file on this computer" in here.inner_text() and "You are here" in here.inner_text())
        places = page.evaluate("() => [...document.querySelectorAll('.dd-place')].map(c => c.dataset.place)")
        check("every place is shown: here first, then DigiDoughnut, GitHub, tiiny.host, own website", places == ["computer", "digidoughnut", "github", "tiiny", "other"], str(places))
        dd_card = page.locator("[data-place=digidoughnut]")
        check("DigiDoughnut is offered even before its address is set, marked Recommended", "Recommended" in dd_card.inner_text())
        check("each place shows scales and pros and cons", all(page.locator(f"[data-place={x}] .dd-pros li").count() > 0 and page.locator(f"[data-place={x}] .dd-cons li").count() > 0 for x in places)
              and page.locator("[data-place=github] .dd-bars").count() == 2 and "Works on your phone" in dd_card.inner_text())
        check("no 'Free. No credit card' list any more", "No credit card" not in page.inner_text(".dd-sheet"))
        check("example data: the bring-along switch says there's nothing to bring yet", page.locator("#dd-bring").is_disabled())
        dd_card.locator("[data-act]").click(); page.wait_for_timeout(100)
        check("no address yet: Use the DigiDoughnut version says Almost ready", "Almost ready" in dd_card.inner_text())
        page.screenshot(path=os.path.join(SHOTS, "where-file.png"), full_page=True)
        page.locator("[data-place=github] [data-act]").click(); page.wait_for_timeout(150)
        check("GitHub: Set it up opens its step-by-step", "GitHub" in page.inner_text(".dd-wiz-name"))
        page.keyboard.press("Escape")
        fresh(page, FILE_HOME)
        check("file with home: same row and button", page.locator('.dd-setup-card [data-step="phone"] button').all_inner_texts() == ["Change"])
        fresh(page, HOME)
        s3 = page.locator('.dd-setup-card [data-step="phone"]')
        check("home address: step 3 done, Now: the DigiDoughnut version", "done" in s3.get_attribute("class") and "Now: the DigiDoughnut version." in s3.inner_text(), s3.inner_text())
        check("home address: isHome", page.evaluate("dd.env.isHome") is True)
        open_item(page, "where")
        check("on the home copy, DigiDoughnut is the highlighted place and isn't offered again",
              page.locator(".dd-place.here[data-place=digidoughnut]").count() == 1 and page.locator(".dd-place:not(.here)[data-place=digidoughnut]").count() == 0)
        check("hosted on a computer: Send to my phone is in Where it lives", page.locator(".dd-sheet [data-phone]").is_visible())
        page.keyboard.press("Escape")
        fresh(page, OWN)
        s3 = page.locator('.dd-setup-card [data-step="phone"]')
        host = OWN.split("/")[2]
        check("other address: step 3 done, Now: your own copy at <host>", "done" in s3.get_attribute("class") and f"Now: your own copy at {host}." in s3.inner_text(), s3.inner_text())
        open_item(page, "where")
        check("own website is the highlighted place there", page.locator(".dd-place.here[data-place=other]").count() == 1)
        page.keyboard.press("Escape")
        check("other address: not isHome", page.evaluate("dd.env.isHome") is False)
        check("no page errors", not errors, "; ".join(errors[:3]))
        ctx.close()

        # ---------- 7.3 move both ways + the receiving guard ----------
        print("\n== move + receiving guard ==")
        ctx = browser.new_context(viewport={"width": 1280, "height": 800}); errors = []
        ctx.route("https://budwakelam.github.io/**", lambda r: r.fulfill(status=404, body=""))
        own = new_page(ctx, errors); fresh(own, OWN)
        home = new_page(ctx, errors); fresh(home, HOME)

        def move_from(page, to, paste=None, bring=True):
            open_item(page, "where")
            box = page.locator("#dd-bring")
            if not box.is_disabled() and box.is_checked() != bring: box.click()
            place = "digidoughnut" if to == "home" else "other"
            with ctx.expect_page() as pop:
                if paste:
                    page.click(f"[data-place={place}] [data-have]"); page.fill(f"[data-place={place}] [data-addr]", paste); page.click(f"[data-place={place}] [data-open]")
                else:
                    page.click(f"[data-place={place}] [data-act]")
            page.keyboard.press("Escape")
            p = pop.value; p.on("pageerror", lambda e: errors.append(str(e))); p.wait_for_load_state(); p.wait_for_timeout(400)
            return p

        # Example data never travels
        p = move_from(own, "home")
        check("example data doesn't travel", "#" not in p.url and items(p) == ["Buy flour", "Book the market table", "Print price tags"])
        check("the link is gone from the address bar", "#dd=" not in p.url)
        p.close()
        # Own copy -> home copy (home holds only examples): goes straight in
        mine(own, ["Milk", "Eggs"])
        p = move_from(own, "home")
        check("own → home: the list arrives", items(p) == ["Milk", "Eggs"], str(items(p)))
        check("own → home: no question when the home copy had nothing of the buyer's", p.locator(".dd-sheet").count() == 0)
        check("arrived data is the buyer's own (not example)", p.evaluate("dd.isExample()") is False)
        p.close()
        # The other way: home -> own, by pasting the address (own copy not remembered on home)
        home.reload(); home.wait_for_timeout(200)
        mine(home, ["Milk", "Eggs", "Bread"])
        p = move_from(home, "own", paste=OWN)
        check("home → own: asks first when the own copy has different data", p.locator(".dd-sheet h2").is_visible() and "Replace what's here" in p.inner_text(".dd-sheet h2"))
        check("nothing changed while it asks", items(p) == ["Milk", "Eggs"])
        p.screenshot(path=os.path.join(SHOTS, "move-guard.png"))
        p.mouse.click(5, 795); p.wait_for_timeout(100)
        check("the question doesn't close on a stray click", p.locator(".dd-sheet [data-replace]").is_visible())
        p.click("[data-keep]"); p.wait_for_timeout(100)
        check("Keep mine: nothing changes", items(p) == ["Milk", "Eggs"])
        p.close()
        check("pasted address is remembered", home.evaluate("dd.setup.ownAddress()") == OWN)
        p = move_from(home, "own")
        p.click("[data-replace]"); p.wait_for_timeout(150)
        check("Replace: the list from the other copy is put in", items(p) == ["Milk", "Eggs", "Bread"])
        check("Replace offers Undo", p.locator("#dd-notice-moved").is_visible())
        p.click("#dd-notice-moved >> text=Undo"); p.wait_for_timeout(150)
        check("Undo puts it back", items(p) == ["Milk", "Eggs"])
        p.close()
        # Same data: no question
        p = move_from(home, "own")
        p.click("[data-replace]"); p.wait_for_timeout(100); p.close()
        p = move_from(home, "own")
        check("same data arriving again: no question", p.locator(".dd-sheet").count() == 0 and items(p) == ["Milk", "Eggs", "Bread"])
        p.close()
        # Bring-along switched off: the other copy opens carrying nothing
        p = move_from(home, "own", bring=False)
        check("bring along off: nothing carried, no question", p.locator(".dd-sheet").count() == 0 and items(p) == ["Milk", "Eggs", "Bread"])
        p.close()
        # A newer version: the screen says how (same place, same file name)
        open_item(own, "where")
        check("Where it lives explains new versions (same place, same file name)", "same file name" in own.inner_text(".dd-sheet"))
        own.keyboard.press("Escape")
        # Too big for a link
        own.evaluate("""() => dd.replaceData({items: Array.from({length: 900}, (_, i) => ({id: 'x' + i, text: 'A long item to fill the list up ' + i + ' ' + 'x'.repeat(60), done: false}))}, {example: false, source: 'test'})""")
        open_item(own, "where"); own.click("[data-place=digidoughnut] [data-act]"); own.wait_for_timeout(150)
        st = own.inner_text("[data-place=digidoughnut] .dd-place-msg")
        check("too big: says so and offers the backup way", "too big" in st and own.locator("[data-place=digidoughnut] [data-down]").is_visible(), st)
        own.screenshot(path=os.path.join(SHOTS, "move-too-big.png"))
        own.keyboard.press("Escape")
        # Live sync on: it comes along
        own.evaluate("() => { dd.sync.isOn = () => true; }")
        open_item(own, "where")
        check("sync on: the bring-along switch includes live sync", "live sync" in own.inner_text(".dd-bring"))
        own.keyboard.press("Escape")
        check("no page errors", not errors, "; ".join(errors[:3]))
        ctx.close()

        # ---------- phone pairing goes through the same guard ----------
        print("\n== pairing guard ==")
        ctx = browser.new_context(viewport={"width": 1280, "height": 800}); errors = []
        ctx.route("https://budwakelam.github.io/**", lambda r: r.fulfill(status=404, body=""))
        pc = new_page(ctx, errors); fresh(pc, OWN); mine(pc, ["From the computer"])
        link = pc.evaluate("() => dd.pair.makeLink({includeCode: false}).link")
        phone_ctx = browser.new_context(**devices["iphone"])
        phone_ctx.route("https://budwakelam.github.io/**", lambda r: r.fulfill(status=404, body=""))
        ph = new_page(phone_ctx, errors)
        ph.goto(OWN); ph.evaluate("() => localStorage.clear()"); ph.reload(); mine(ph, ["On the phone"])
        ph.goto(link); ph.wait_for_timeout(400)
        if "#dd=" in link and items(ph) == ["On the phone"] and ph.locator("[data-replace]").count() == 0:
            ph.reload(); ph.wait_for_timeout(400)   # same-page hash navigation: hashchange handles it
        check("pairing into a phone with its own list asks first", ph.locator("[data-replace]").is_visible() and items(ph) == ["On the phone"], str(items(ph)))
        ph.click("[data-replace]"); ph.wait_for_timeout(100)
        check("Replace brings the computer's list", items(ph) == ["From the computer"])
        check("no page errors", not errors, "; ".join(errors[:3]))
        phone_ctx.close(); ctx.close()
        browser.close()

    shutil.rmtree(TMP, ignore_errors=True)
    print(f"\n{sum(results)}/{len(results)} checks passed")
    sys.exit(0 if all(results) else 1)

main()
