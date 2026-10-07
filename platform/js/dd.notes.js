/* ===== DigiDoughnut Platform · dd.notes — the DigiDoughnut noticeboard =====
   Once a week, at most, the program downloads one small public file that DigiDoughnut keeps
   up to date. It can only carry:
     helpLinks   updated "I'm stuck" / help page links            (https only)
     labels      corrected button wording for setup screens        (plain text, short)
     notice      one short message for buyers                      (plain text)
     modelHints  AI models to prefer or avoid                      (model ids)
     codePatterns how to recognise an AI company's code            (pattern text)
   It can NEVER change where codes, numbers or messages are sent: those addresses are built
   into the program. Nothing is sent with the request: no codes, numbers, ids or settings.
   If the file can't be reached, the program works exactly the same with its built-in values.
   The buyer can read this in plain words under "Privacy" in the footer (Oran, 2026-10-06). */
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  var notes = dd.notes = {};

  // PROGRAM-INDEPENDENT. Where the noticeboard lives (GitHub Pages on the public repo).
  notes.url = "https://budwakelam.github.io/digidoughnut/noticeboard/notes.json";
  var KEY = "dd_notes_v1", WEEK = 7 * 24 * 3600 * 1000;
  var LIMITS = { link: 300, label: 60, notice: 240, id: 40, list: 20 };

  var cached = dd.store.getJSON(KEY) || null;   // {fetchedAt, data, dismissed:[ids]}
  var data = (cached && cached.data) || {};

  notes.get = function (section) { return data[section]; };
  /* Help link by key, falling back to the built-in one. */
  notes.link = function (key, fallback) { var h = data.helpLinks || {}; return h[key] || fallback; };
  /* Button wording by key, falling back to the built-in one. Always plain text. */
  notes.label = function (key, fallback) { var l = data.labels || {}; return l[key] || fallback; };
  notes.lastChecked = function () { return cached && cached.fetchedAt ? new Date(cached.fetchedAt) : null; };

  /* ---------- validation: anything unexpected is dropped, never trusted ---------- */
  // Text from the file is only ever shown as plain text (never as HTML), so "</>" is safe.
  function str(v, max) { return typeof v === "string" && v.length > 0 && v.length <= max ? v : null; }
  function httpsUrl(v) {
    if (!str(v, LIMITS.link)) return null;
    try { var u = new URL(v); return u.protocol === "https:" ? u.href : null; } catch (e) { return null; }
  }
  function map(obj, fn) {
    var out = {}, n = 0;
    if (obj && typeof obj === "object") Object.keys(obj).forEach(function (k) {
      if (n >= 100 || !/^[A-Za-z0-9_.-]{1,60}$/.test(k)) return;
      var v = fn(obj[k]); if (v != null) { out[k] = v; n++; }
    });
    return out;
  }
  function idList(v) {
    return Array.isArray(v) ? v.filter(function (x) { return /^[a-z0-9.\-]{1,60}$/i.test(x); }).slice(0, LIMITS.list) : [];
  }
  notes.validate = function (raw) {
    if (!raw || typeof raw !== "object" || raw.version !== 1) return null;
    var out = {
      helpLinks: map(raw.helpLinks, httpsUrl),
      labels: map(raw.labels, function (v) { return str(v, LIMITS.label); }),
      modelHints: map(raw.modelHints, function (v) { return v && typeof v === "object" ? { prefer: idList(v.prefer), avoid: idList(v.avoid) } : null; }),
      codePatterns: map(raw.codePatterns, function (v) {
        if (!str(v, 120) || !/^\^/.test(v)) return null;
        try { new RegExp(v); return v; } catch (e) { return null; }
      })
    };
    var n = raw.notice;
    if (n && typeof n === "object" && str(n.id, LIMITS.id) && str(n.text, LIMITS.notice)) {
      var until = n.until && !isNaN(Date.parse(n.until)) ? n.until : null;
      out.notice = { id: n.id, text: n.text, until: until, link: httpsUrl(n.link) || null };
    }
    return out;
  };

  /* ---------- weekly check ---------- */
  notes.check = function (force) {
    if (!force && cached && cached.fetchedAt && Date.now() - cached.fetchedAt < WEEK) return Promise.resolve(false);
    if (navigator.onLine === false) return Promise.resolve(false);
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 8000);
    // A plain GET: no cookies, no query string, no headers carrying anything about the buyer.
    return fetch(notes.url, { method: "GET", credentials: "omit", cache: "no-cache", referrerPolicy: "no-referrer", signal: ctl.signal })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (raw) {
        var clean = notes.validate(raw);
        if (!clean) throw new Error("noticeboard file not in the expected shape");
        data = clean;
        cached = { fetchedAt: Date.now(), data: clean, dismissed: (cached && cached.dismissed) || [] };
        dd.store.setJSON(KEY, cached);
        showNotice();
        dd.emit("notes:updated", clean);
        return true;
      })
      .catch(function (e) {
        dd.errors.record("noticeboard", e);
        // Try again in a day rather than on every page load.
        cached = cached || { data: {}, dismissed: [] };
        cached.fetchedAt = Date.now() - WEEK + 24 * 3600 * 1000;
        dd.store.setJSON(KEY, cached);
        return false;
      })
      .finally(function () { clearTimeout(t); });
  };

  function showNotice() {
    var n = data.notice;
    if (!n || !dd.ui) return;
    if (n.until && Date.parse(n.until) < Date.now()) return;
    if (cached && (cached.dismissed || []).indexOf(n.id) >= 0) return;
    var buttons = [{ label: "Got it", onClick: function () {
      cached.dismissed = (cached.dismissed || []).concat(n.id).slice(-20);
      dd.store.setJSON(KEY, cached); dd.ui.clearNotice("board");
    } }];
    if (n.link) buttons.unshift({ label: "Read more", primary: true, onClick: function () { window.open(n.link, "_blank", "noopener"); } });
    dd.ui.notice("board", n.text, "info", buttons);
  }

  /* Started by dd.core after the program is on screen, so it never delays the page. */
  notes.start = function () { showNotice(); setTimeout(function () { notes.check(false); }, 1500); };

  if (dd.diag) dd.diag.addSection("Noticeboard", function () {
    var d = notes.lastChecked();
    return ["Last checked: " + (d ? d.toLocaleString() : "never") +
            " · help links " + Object.keys(data.helpLinks || {}).length +
            " · labels " + Object.keys(data.labels || {}).length +
            (data.notice ? " · notice " + data.notice.id : "")];
  });
})();
