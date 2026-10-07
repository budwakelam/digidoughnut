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
      '<p>Your numbers are stored on this device.</p>';
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
    overlay.addEventListener("click", function (e) { if (e.target === overlay && !opts.sticky) ui.closeSheet(); });
    ui.$("dd-layer").appendChild(overlay);
    openSheet = { el: overlay, onClose: opts.onClose };
    var first = overlay.querySelector("button, input, textarea, select, a[href]");
    if (first) first.focus();
    return overlay.firstChild;
  };
  ui.closeSheet = function () {
    if (!openSheet) return;
    var s = openSheet; openSheet = null;
    s.el.remove();
    if (s.onClose) try { s.onClose(); } catch (e) {}
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) {}
  };
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && openSheet) ui.closeSheet(); });

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
})();
