/* ===== DigiDoughnut Platform · dd.ui =====
   Page frame (header, footer), status boxes, top-of-page notices, sheets, toasts and a
   friendly confirm(). Programs use these instead of alert()/confirm() so every program
   looks and behaves the same. */
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  var ui = dd.ui = {};

  ui.$ = function (id) { return document.getElementById(id); };
  ui.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  /* ---------- frame ---------- */
  ui.mount = function (program) {
    if (program.accent) ui.setAccent(program.accent);
    ui.$("dd-top").innerHTML =
      '<div><h1>' + ui.esc(program.name) + '</h1>' + (program.tagline ? '<div class="dd-tag">' + ui.esc(program.tagline) + '</div>' : "") + '</div>' +
      '<div class="dd-spacer"></div><div class="dd-slot" id="dd-top-slot"></div>';
    ui.$("dd-footer").innerHTML =
      '<p>Made with care by DigiDoughnut · ' + ui.esc(program.name) + ' ' + ui.esc(program.version) + '</p>' +
      '<p>Your ' + ui.esc(program.dataLabel || "numbers") + ' ' + (program.dataLabel && !/s$/.test(program.dataLabel) ? "is" : "are") + ' stored on this device. ' +
      (dd.backup ? '<button class="dd-linkbtn dd-foot-link" id="dd-data-link">Backup</button> · ' : "") +
      '<button class="dd-linkbtn dd-foot-link" id="dd-privacy-link">Privacy</button></p>';
    var link = ui.$("dd-privacy-link");
    link.addEventListener("click", function (e) { e.stopPropagation(); ui.privacy(); });
    var data = ui.$("dd-data-link");
    if (data) data.addEventListener("click", function (e) { e.stopPropagation(); dd.backup.open(); });
  };

  /* "What this program connects to": every outside connection, in plain words.
     Oran's rule: no silent phone-home, so the noticeboard check is spelled out here. */
  ui.privacy = function () {
    var p = dd.getProgram ? dd.getProgram() : null, name = p ? p.name : "This program";
    var ai = dd.ai && dd.ai.providers && dd.ai.providers.google;
    var sh = ui.sheet('<h2>What ' + ui.esc(name) + ' connects to</h2>' +
      '<p><b>Your numbers</b> are stored in this browser, on this device. DigiDoughnut never sees them.</p>' +
      '<p><b>The helper.</b> When you use an AI feature, your question and the numbers it needs go to Google, using your own free access code. ' +
        (ai ? ui.esc(ai.privacyNote) : "") + '</p>' +
      (dd.helper && dd.helper.enabled() ? '<p><b>Your chats with ' + ui.esc(dd.helper.name()) + '</b> are kept in this browser, on this device, so you can pick up where you left off. "New chat" clears them. They are never sent to your phone or synced.</p>' : "") +
      '<p><b>Live sync</b> (only if you turn it on) keeps a copy in your own Firebase database, in your own Google account. DigiDoughnut never sees it. ' +
        'Each program\'s copy sits at a long secret address that only your devices know, and the program signs in to your database before it reads or writes.</p>' +
      '<p><b>Backups</b> are files you download and keep yourself. Nothing is sent anywhere.</p>' +
      '<p><b>The DigiDoughnut noticeboard.</b> Once a week, ' + ui.esc(name) + ' checks the DigiDoughnut noticeboard for updated help links and notices. ' +
        'It only downloads a small file. Your numbers, your code and anything you type are never sent.</p>' +
      '<div class="dd-btnrow"><button class="dd-btn" data-close>Close</button></div>');
    sh.querySelector("[data-close]").addEventListener("click", ui.closeSheet);
  };

  /* Set the program's accent colour, with a darker shade for hover. */
  ui.setAccent = function (hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
    var r = document.documentElement.style;
    r.setProperty("--dd-brand", hex);
    r.setProperty("--dd-brand-d", shade(hex, -0.15));
    r.setProperty("--dd-brand-soft", mix(hex, 0.9));
    r.setProperty("--dd-brand-soft-d", mix(hex, 0.82));
  };
  function rgb(hex) { return [1, 3, 5].map(function (i) { return parseInt(hex.substr(i, 2), 16); }); }
  function toHex(a) { return "#" + a.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? "0" : "") + v.toString(16); }).join(""); }
  function shade(hex, f) { return toHex(rgb(hex).map(function (v) { return v * (1 + f); })); }
  function mix(hex, towardWhite) { return toHex(rgb(hex).map(function (v) { return v + (255 - v) * towardWhite; })); }

  /* ---------- status box: kind = ok | err | warn | info ---------- */
  ui.status = function (el, kind, title, help) {
    if (typeof el === "string") el = ui.$(el);
    if (!el) return;
    el.className = "dd-status show " + kind;
    el.setAttribute("role", kind === "err" ? "alert" : "status");
    el.innerHTML = help ? "<b>" + ui.esc(title) + "</b><br>" + ui.esc(help) : ui.esc(title);
  };
  ui.clearStatus = function (el) { if (typeof el === "string") el = ui.$(el); if (el) { el.className = "dd-status"; el.textContent = ""; } };

  /* ---------- notices: one per id, shown at the top of the page ---------- */
  ui.notice = function (id, text, kind, buttons) {
    var host = ui.$("dd-notices"); if (!host) return;
    var box = ui.$("dd-notice-" + id);
    if (!box) { box = document.createElement("div"); box.id = "dd-notice-" + id; host.appendChild(box); }
    box.className = "dd-notice " + (kind || "info");
    box.innerHTML = '<div class="dd-notice-text">' + ui.esc(text) + '</div>';
    if (buttons && buttons.length) {
      var row = document.createElement("div"); row.className = "dd-btnrow";
      buttons.forEach(function (b) {
        var btn = document.createElement("button");
        btn.className = "dd-btn small" + (b.primary ? "" : " ghost");
        btn.textContent = b.label;
        btn.addEventListener("click", b.onClick);
        row.appendChild(btn);
      });
      box.appendChild(row);
    }
  };
  ui.clearNotice = function (id) { var b = ui.$("dd-notice-" + id); if (b) b.remove(); };

  /* ---------- sheet (modal) ----------
     ui.sheet(html) opens a sheet; returns the sheet element. Esc or tapping outside closes it. */
  var openSheet = null, lastFocus = null;
  ui.sheet = function (html, opts) {
    opts = opts || {};
    ui.closeSheet();
    lastFocus = document.activeElement;
    var overlay = document.createElement("div");
    overlay.className = "dd-overlay";
    overlay.innerHTML = '<div class="dd-sheet" role="dialog" aria-modal="true">' + html + '</div>';
    // sticky: a click beside the sheet doesn't close it (Oran: "older people click off to the
    // side and it's gone"). The sheet gives a little nudge instead, and opts.onOutside can explain.
    overlay.addEventListener("click", function (e) {
      if (e.target !== overlay) return;
      if (!opts.sticky) { ui.closeSheet(); return; }
      var box = overlay.firstChild; box.classList.remove("dd-nudge"); void box.offsetWidth; box.classList.add("dd-nudge");
      if (opts.onOutside) opts.onOutside();
    });
    ui.$("dd-layer").appendChild(overlay);
    openSheet = { el: overlay, onClose: opts.onClose, onEscape: opts.onEscape };
    // On a phone, focusing a text box pops the keyboard over the sheet: focus a button instead.
    var first = overlay.querySelector("[data-autofocus]") ||
                overlay.querySelector(dd.env && dd.env.isPhone ? "button, a[href]" : "button, input, textarea, select, a[href]");
    // Focus without scrolling: the top of a sheet (title, picture) is what people should see first.
    if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } overlay.firstChild.scrollTop = 0; }
    return overlay.firstChild;
  };
  ui.closeSheet = function () {
    if (!openSheet) return;
    var s = openSheet; openSheet = null;
    s.el.remove();
    if (s.onClose) try { s.onClose(); } catch (e) {}
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  };
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !openSheet) return;
    if (openSheet.onEscape) openSheet.onEscape(); else ui.closeSheet();
  });

  /* ---------- confirm: friendly Yes/No, returns a Promise<boolean> ---------- */
  ui.confirm = function (title, body, yesLabel, noLabel, danger) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (done) return; done = true; ui.closeSheet(); resolve(v); }
      var sh = ui.sheet('<h2>' + ui.esc(title) + '</h2>' + (body ? '<p>' + ui.esc(body) + '</p>' : "") +
        '<div class="dd-btnrow"><button class="dd-btn ghost" data-no>' + ui.esc(noLabel || "No, keep it") + '</button>' +
        '<button class="dd-btn' + (danger ? " danger" : "") + '" data-yes>' + ui.esc(yesLabel || "Yes") + '</button></div>',
        { onClose: function () { finish(false); } });
      sh.querySelector("[data-yes]").addEventListener("click", function () { finish(true); });
      sh.querySelector("[data-no]").addEventListener("click", function () { finish(false); });
    });
  };

  /* ---------- toast: short confirmation that fades out ---------- */
  var toastTimer = null;
  ui.toast = function (text, ms) {
    var old = document.querySelector(".dd-toast"); if (old) old.remove();
    var t = document.createElement("div");
    t.className = "dd-toast"; t.setAttribute("role", "status"); t.textContent = text;
    ui.$("dd-layer").appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, ms || 2600);
  };

  /* ---------- formatting helpers ---------- */
  ui.money = function (n) {
    n = Number(n) || 0;
    return (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  ui.isoDate = function (d) { d = d || new Date(); var p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };
  ui.uid = function (prefix) {
    var b = new Uint8Array(6);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b); else for (var i = 0; i < 6; i++) b[i] = Math.random() * 256;
    return (prefix || "i") + Date.now().toString(36) + Array.prototype.map.call(b, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join("");
  };

  /* ---------- the hosting website's own bars ----------
     Some free hosts lay a bar over the page (tiiny.host: "Shared with tiiny.host" across the
     bottom, about 42 px, seen 2026-10-07 covering Penny's message box). We look for anything
     fixed to the top or bottom edge that isn't ours, measure it, and set --dd-host-top and
     --dd-host-bottom so the helper, the corner button, toasts and the page's end move clear. */
  var OURS = "#dd-layer,#dd-helper-home,#dd-helper-fab,.dd-top,.dd-overlay,.dd-toast";
  function hostBar(y, atTop) {
    var w = window.innerWidth, h = window.innerHeight, best = 0;
    [12, Math.round(w * 0.3), Math.round(w * 0.5)].forEach(function (x) {
      var el = document.elementFromPoint(x, y);
      while (el && el !== document.body && el !== document.documentElement) {
        if (el.closest && el.closest(OURS)) return;
        var pos = getComputedStyle(el).position;
        if (pos === "fixed" || pos === "sticky") {
          var r = el.getBoundingClientRect();
          if (r.width >= w * 0.5 && r.height > 0 && r.height < h * 0.3)
            best = Math.max(best, Math.round(atTop ? r.bottom : h - r.top));
          return;
        }
        el = el.parentElement;
      }
    });
    return best;
  }
  ui.hostBars = { top: 0, bottom: 0 };
  ui.measureHostBars = function () {
    if (!document.body || !document.elementFromPoint) return;
    var top = hostBar(2, true), bottom = hostBar(window.innerHeight - 3, false);
    if (top === ui.hostBars.top && bottom === ui.hostBars.bottom) return;
    ui.hostBars = { top: top, bottom: bottom };
    var r = document.documentElement.style;
    r.setProperty("--dd-host-top", top + "px");
    r.setProperty("--dd-host-bottom", bottom + "px");
    if ((top || bottom) && dd.errors) dd.errors.record("page", "this website lays its own bar over the page: top " + top + " px, bottom " + bottom + " px");
  };
  function watchHostBars() {
    ui.measureHostBars();
    [500, 1500, 3000, 6000, 10000].forEach(function (ms) { setTimeout(ui.measureHostBars, ms); });
    window.addEventListener("resize", function () { setTimeout(ui.measureHostBars, 150); });
    try { new MutationObserver(function () { setTimeout(ui.measureHostBars, 50); }).observe(document.body, { childList: true }); } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchHostBars); else watchHostBars();
})();
