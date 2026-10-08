/* ===== DigiDoughnut Platform · dd.core =====
   The `dd` namespace, a tiny event bus, device/page detection, and dd.start(), which boots
   a program. Programs never touch storage or the page skeleton directly: they get a `ctx`
   with the current data and an update() function. */
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  dd.platformVersion = (window.DD_BUILD && window.DD_BUILD.platform) || "dev";

  /* ---------- event bus ---------- */
  var handlers = {};
  dd.on = function (name, fn) { (handlers[name] = handlers[name] || []).push(fn); };
  dd.emit = function (name, payload) {
    (handlers[name] || []).forEach(function (fn) {
      try { fn(payload); } catch (e) { if (dd.errors) dd.errors.record("event:" + name, e); }
    });
  };

  /* ---------- detect, don't ask (wizard rule 6) ---------- */
  var ua = navigator.userAgent || "";
  // iPadOS reports itself as a Mac; a touch-capable "Mac" is an iPad.
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/.test(ua);
  dd.env = {
    isFile: location.protocol === "file:",
    isHosted: location.protocol === "https:" || location.protocol === "http:",
    isIOS: isIOS,
    isAndroid: isAndroid,
    isPhone: isIOS || isAndroid || /Mobi/.test(ua),
    // true when opened from a Home Screen icon rather than a browser tab
    isStandalone: (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true
  };
  /* Phase 7.2: the DigiDoughnut-hosted copy's address is one build setting, DD_BUILD.home.
     Left empty, anything that depends on it simply doesn't show. isHome may change wording
     only, never features: both copies are the same file. */
  dd.env.home = (function (h) { try { if (!h) return ""; var u = new URL(h); u.hash = ""; u.search = ""; return /^https?:$/.test(u.protocol) ? u.href : ""; } catch (e) { return ""; } })(window.DD_BUILD && window.DD_BUILD.home);
  dd.env.sameAddress = function (a, b) {
    var norm = function (x) { try { var u = new URL(x, location.href); return (u.origin + u.pathname).replace(/\/index\.html?$/i, "/").toLowerCase(); } catch (e) { return ""; } };
    return !!a && !!b && norm(a) === norm(b);
  };
  dd.env.isHome = !!dd.env.home && dd.env.isHosted && dd.env.sameAddress(location.href, dd.env.home);

  /* ---------- program contract ---------- */
  var REQUIRED = ["id", "name", "version", "schemaVersion", "emptyData", "exampleData", "validateData", "migrate", "render"];
  function checkContract(p) {
    if (!p) return "DD_PROGRAM is missing";
    for (var i = 0; i < REQUIRED.length; i++) if (p[REQUIRED[i]] == null) return "DD_PROGRAM." + REQUIRED[i] + " is missing";
    if (!/^[a-z0-9]+$/.test(p.id)) return "DD_PROGRAM.id must be lowercase letters and digits";
    return null;
  }

  /* ---------- the running program ---------- */
  var program = null, data = null, meta = { example: false };

  function ctx() {
    return { data: data, update: dd.update, replaceData: dd.replaceData, ui: dd.ui, root: document.getElementById("dd-app"), env: dd.env };
  }
  function render() {
    try { program.render(ctx()); }
    catch (e) { dd.errors.record("render", e); dd.ui.notice("render-fail", "Something on this page didn't draw properly. Reloading usually fixes it.", "warn"); }
  }
  function persist(source) {
    var res = dd.store.saveData(program, data, meta);
    if (!res.ok) dd.ui.notice("save-fail", dd.errors.friendly(res.reason).title + " " + dd.errors.friendly(res.reason).help, "warn");
    else dd.ui.clearNotice("save-fail");
    dd.emit("change", { data: data, source: source || "local" });
    return res.ok;
  }

  /* Change the data. `fn` either edits the data it's given or returns a replacement.
     Pass {render:false} when the screen already shows the change (typing in a box),
     so the box doesn't lose focus. */
  dd.update = function (fn, opts) {
    opts = opts || {};
    var wasExample = meta.example;
    var out = fn(data);
    if (out !== undefined) data = out;
    // The buyer's first real change ends "example mode" (audit 2026-10-08): untouched example items
    // go, anything the buyer added or changed stays and is theirs from now on, so it syncs, travels
    // and can be backed up. Before this, an edit kept the whole list marked "example" forever.
    var cleared = false;
    if (wasExample) {
      var mine = dd.withoutExamples(data);
      cleared = JSON.stringify(mine) !== JSON.stringify(data);
      data = mine; meta.example = false;
      paintExampleNotice();
    }
    persist(opts.source);
    if (opts.render !== false || cleared) render();
    if (cleared) dd.ui.toast("Took out the example items. The rest is yours now.", 3500);
    return data;
  };

  /* The data minus the program's untouched example items. Lists: an item is dropped when its id is
     one of exampleData()'s AND it is unchanged (so example ids must stay fixed). Other values still
     equal to the example go back to emptyData()'s. Anything the buyer added or changed stays.
     If the result doesn't check out: empty data. Used by dd.update and dd.agent. */
  dd.withoutExamples = function (d) {
    try {
      var ex = program.exampleData(), empty = program.emptyData(), out = JSON.parse(JSON.stringify(d));
      Object.keys(out).forEach(function (k) {
        if (Array.isArray(out[k]) && Array.isArray(ex[k])) {
          var orig = {};
          ex[k].forEach(function (i) { if (i && i.id) orig[i.id] = JSON.stringify(i); });
          out[k] = out[k].filter(function (i) { return !(i && i.id && orig[i.id] === JSON.stringify(i)); });
        } else if (k in ex && JSON.stringify(out[k]) === JSON.stringify(ex[k])) out[k] = empty[k];
      });
      return program.validateData(out) ? out : empty;
    } catch (e) { dd.errors.record("examples", e); return program.emptyData(); }
  };

  /* Swap in a whole new data set (restore, sync, "start fresh"). Checked before it's used. */
  dd.replaceData = function (next, opts) {
    opts = opts || {};
    if (!program.validateData(next)) return false;
    data = next;
    if (opts.example !== undefined) meta.example = !!opts.example;
    persist(opts.source || "replace");
    render();
    paintExampleNotice();
    return true;
  };

  dd.getData = function () { return data; };

  /* Upgrade older data with the program's migrate(), keeping the platform's own key (data.brand,
     the buyer's look) that the program doesn't know about. Use this, never program.migrate(). */
  dd.migrateData = function (p, body, fromVersion) {
    var keep = body && typeof body === "object" ? body.brand : undefined;
    var out = p.migrate(body, fromVersion);
    if (keep !== undefined && out && typeof out === "object" && out.brand === undefined) out.brand = keep;
    return out;
  };
  dd.ctx = function () { return ctx(); };
  dd.getProgram = function () { return program; };
  dd.isExample = function () { return meta.example; };

  /* "Works before setup": a first-time buyer sees example data plus one clear way out. */
  function paintExampleNotice() {
    if (!meta.example || program.showExampleNotice === false) { dd.ui.clearNotice("example"); return; }
    dd.ui.notice("example", program.exampleNotice || "You're looking at example numbers so you can try things out.", "info", [
      { label: "Clear them and start mine", primary: true, onClick: function () {
          var fresh = program.emptyData();
          if (data && data.brand) fresh.brand = data.brand;   // the buyer's look stays
          dd.replaceData(fresh, { example: false, source: "start-fresh" });
          dd.ui.toast("All clear. It's yours now.");
        } },
      { label: "Keep these", onClick: function () { meta.example = false; persist("keep-example"); paintExampleNotice(); } }
    ]);
  }

  /* ---------- boot ---------- */
  dd.start = function (p) {
    var problem = checkContract(p);
    if (problem) { bootFailed(problem); return; }
    program = p;
    try {
      dd.ui.mount(program);
      var loaded = dd.store.loadData(program);
      data = loaded.data; meta = loaded.meta;
      if (loaded.notice) dd.ui.notice("load", loaded.notice, "warn");
      if (program.mount) program.mount(ctx());
      if (dd.menu) dd.menu.fromProgram(program);   // the program's own menu items, at the top
      render();
      if (dd.brand) dd.brand.start(program);
      // Sync listens for changes and for pairing links, so it starts before the link is read.
      if (dd.agent) dd.agent.attach(program);   // before sync: an agent link picks the ledger
      if (dd.sync) dd.sync.attach(program);
      if (dd.pair) {
        // The program's numbers can ride along in the QR while they're small. Example numbers don't.
        dd.pair.register({
          key: "d", label: "numbers", optional: true,
          // With live sync on, the phone gets the numbers from the database instead.
          give: function () { return (program.pairData === false || meta.example || (dd.sync && dd.sync.isOn())) ? undefined : [program.schemaVersion, data]; },
          take: function (v) {
            if (!Array.isArray(v) || v.length !== 2) return false;
            var body = v[1];
            if (v[0] < program.schemaVersion) body = dd.migrateData(program, body, v[0]);
            if (!program.validateData(body)) return false;
            // Rule 15: a copy that receives data asks before replacing the buyer's own.
            if (dd.move) return dd.move.receiveData(body, "pair");
            return dd.replaceData(body, { example: false, source: "pair" });
          }
        });
        dd.pair.receive();
      }
      paintExampleNotice();
      if (dd.setup && program.setup !== false) dd.setup.start(program);
      if (dd.helper) dd.helper.start(program);
      dd.diag.attach();
      if (dd.notes) dd.notes.start();
      dd.emit("ready", { source: loaded.source });
    } catch (e) { bootFailed(e); }
  };

  function bootFailed(why) {
    if (dd.errors) dd.errors.record("boot", why);
    var box = document.getElementById("dd-app");
    if (box) box.innerHTML = '<div class="dd-card"><h2>This page didn\'t start properly</h2>' +
      '<p>Please reload the page. If it keeps happening, contact DigiDoughnut and we\'ll sort it out.</p></div>';
    try { dd.diag.attach(); } catch (e) {}
  }
})();
