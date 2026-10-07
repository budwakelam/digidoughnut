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
    var out = fn(data);
    if (out !== undefined) data = out;
    persist(opts.source);
    if (opts.render !== false) render();
    return data;
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
  dd.getProgram = function () { return program; };
  dd.isExample = function () { return meta.example; };

  /* "Works before setup": a first-time buyer sees example data plus one clear way out. */
  function paintExampleNotice() {
    if (!meta.example) { dd.ui.clearNotice("example"); return; }
    dd.ui.notice("example", program.exampleNotice || "You're looking at example numbers so you can try things out.", "info", [
      { label: "Clear them and start mine", primary: true, onClick: function () {
          dd.replaceData(program.emptyData(), { example: false, source: "start-fresh" });
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
      render();
      paintExampleNotice();
      dd.diag.attach();
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
