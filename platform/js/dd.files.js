/* ===== DigiDoughnut Platform · dd.files — "Add a file" (first product, 2026-10-08) =====
   The first real product (the Etsy pricing tool) needed to read a seller's Etsy downloads, so
   every program can now take a file in, three ways, all handled here:
     1. Menu → "📂 Add a file" (a sheet with a big drop area and the program's how-to)
     2. The 📎 button in the helper's chat, or dropping a file onto the chat
     3. The program's own drop area: dd.files.dropZone(el)
   Files are read on this device only. Nothing is uploaded: the program keeps what it needs and the
   file itself is never stored.

   Program contract (optional):
     files: {
       accept:  ".csv"                       what the file picker offers
       label:   "your Etsy download"          used in wording ("Add your Etsy download")
       howTo:   "<p>…</p>"                     short HTML shown in the Add a file sheet
       take(file, text, ctx) -> {ok, message}  read it; change data with ctx.update as usual
     }
   take() may return a Promise. Its message is plain words for the buyer ("Added 214 sales from
   September."). A file over MAX_BYTES is refused with a friendly line, never read.

   Helpers for programs: dd.files.parseCSV(text) -> rows (arrays), dd.files.table(text) ->
   [{header: value}], dd.files.number("CA$1,234.50") -> 1234.5. */
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  var files = dd.files = {};
  var MAX_BYTES = files.MAX_BYTES = 15 * 1024 * 1024;
  var lastTake = null;

  function cfg() { var p = dd.getProgram && dd.getProgram(); return p && p.files ? p.files : null; }
  files.enabled = function () { return !!cfg(); };
  files.label = function () { var c = cfg(); return (c && c.label) || "a file"; };

  /* ---------- CSV ---------- */
  // RFC 4180: quoted fields, "" inside quotes, commas and newlines inside quotes, CRLF or LF,
  // a byte-order mark at the start. Also takes ; or tab when the first line clearly uses them.
  files.parseCSV = function (text) {
    text = String(text || "").replace(/^﻿/, "");
    var first = text.split(/\r?\n/, 1)[0] || "";
    var sep = ",";
    if (first.indexOf(",") < 0) { if (first.indexOf("\t") >= 0) sep = "\t"; else if (first.indexOf(";") >= 0) sep = ";"; }
    var rows = [], row = [], field = "", q = false, i = 0, n = text.length, c;
    while (i < n) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
        field += c; i++; continue;
      }
      if (c === '"' && field === "") { q = true; i++; continue; }
      if (c === sep) { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (v) { return String(v).trim() !== ""; }); });
  };
  /* Rows as objects keyed by the (trimmed) header line. */
  files.table = function (text) {
    var rows = files.parseCSV(text); if (!rows.length) return [];
    var head = rows[0].map(function (h) { return String(h).trim(); });
    return rows.slice(1).map(function (r) {
      var o = {}; head.forEach(function (h, k) { if (h) o[h] = r[k] == null ? "" : String(r[k]).trim(); }); return o;
    });
  };
  /* "CA$1,234.50", "-£3.20", "(4.00)", "1.234,50 €", "--" -> numbers (or 0). */
  files.number = function (v) {
    var s = String(v == null ? "" : v).trim(); if (!s || s === "--") return 0;
    var neg = /^\(.*\)$/.test(s) || /^-|−/.test(s) || /-\s*$/.test(s);
    s = s.replace(/[^\d.,]/g, "");
    // The last of "." or "," followed by 1-2 digits is the decimal point: 1,234.50 and 1.234,50 both work.
    var dot = s.lastIndexOf("."), com = s.lastIndexOf(",");
    if (com > dot && /,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    var x = parseFloat(s); if (!isFinite(x)) return 0;
    return neg ? -x : x;
  };

  /* ---------- reading ---------- */
  files.read = function (file) {
    return new Promise(function (resolve) {
      if (!file) return resolve({ ok: false, title: "No file was chosen." });
      if (file.size > MAX_BYTES) return resolve({ ok: false, title: "That file is too big.", help: "Files up to 15 MB work. If it's an Etsy download, pick a shorter date range and try again." });
      var r = new FileReader();
      r.onload = function () { resolve({ ok: true, text: String(r.result || "") }); };
      r.onerror = function () { resolve({ ok: false, title: "That file couldn't be opened.", help: "Try downloading it again, then add the new copy." }); };
      try { r.readAsText(file); } catch (e) { resolve({ ok: false, title: "That file couldn't be opened." }); }
    });
  };

  /* Hand a file to the program. Returns {ok, message, before, after}. */
  files.take = function (file) {
    var c = cfg();
    if (!c) return Promise.resolve({ ok: false, message: "This program doesn't take files." });
    var before = JSON.stringify(dd.getData()), wasExample = dd.isExample();
    return files.read(file).then(function (got) {
      if (!got.ok) return { ok: false, message: got.title + (got.help ? " " + got.help : "") };
      var res;
      try { res = c.take(file, got.text, dd.ctx()); } catch (e) { dd.errors.record("files", e); res = { ok: false, message: "Something went wrong reading that file. Nothing was changed." }; }
      return Promise.resolve(res).then(function (out) {
        out = out || { ok: false, message: "Nothing was added." };
        lastTake = { at: new Date().toLocaleTimeString(), name: String(file.name || "").slice(0, 60), kb: Math.round((file.size || 0) / 1024), ok: !!out.ok };
        if (!out.ok) dd.errors.record("files", "not taken: " + out.message);
        return { ok: !!out.ok, message: String(out.message || ""), before: before, after: JSON.stringify(dd.getData()), example: wasExample };
      });
    });
  };

  /* Open the computer's file picker. Resolves with a File, or null. */
  files.pick = function () {
    return new Promise(function (resolve) {
      var c = cfg(), inp = document.createElement("input");
      inp.type = "file"; if (c && c.accept) inp.accept = c.accept;
      inp.style.display = "none";
      inp.addEventListener("change", function () { var f = inp.files && inp.files[0]; inp.remove(); resolve(f || null); });
      document.body.appendChild(inp);
      inp.click();
    });
  };

  /* Make any element a drop area. onFile(file) gets the first dropped file. */
  files.dropZone = function (el, onFile) {
    if (!el) return;
    var on = function (e) { e.preventDefault(); el.classList.add("dd-drop-over"); };
    var off = function () { el.classList.remove("dd-drop-over"); };
    el.addEventListener("dragenter", on); el.addEventListener("dragover", on);
    el.addEventListener("dragleave", off);
    el.addEventListener("drop", function (e) {
      e.preventDefault(); off();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) (onFile || files.takeAndTell)(f);
    });
  };

  /* Take a file and tell the buyer how it went (toast + status), with Undo when something changed. */
  files.takeAndTell = function (file) {
    return files.take(file).then(function (r) {
      if (r.ok && r.before !== r.after) files.showDone(r);
      else dd.ui.toast(r.message || (r.ok ? "Nothing new in that file." : "That file didn't work."), 4500);
      return r;
    });
  };

  /* The Add a file sheet: a big drop area, a Choose button and the program's how-to. */
  files.open = function () {
    var c = cfg(); if (!c) return;
    var sh = dd.ui.sheet('<h2>📂 Add ' + dd.ui.esc(files.label()) + '</h2>' +
      '<div class="dd-drop" id="dd-drop"><div class="dd-drop-big" aria-hidden="true">📄</div>' +
      '<b>' + (dd.env.isPhone ? "Choose the file" : "Drop the file here") + '</b>' +
      '<span>' + (dd.env.isPhone ? "" : "or ") + '<button class="dd-btn small" data-pick>Choose a file</button></span></div>' +
      '<div class="dd-status" id="dd-drop-status"></div>' +
      (c.howTo ? '<div class="dd-drop-how">' + c.howTo + '</div>' : "") +
      '<p class="dd-note">The file is read on this device only. Nothing is uploaded.</p>' +
      '<div class="dd-btnrow"><button class="dd-btn ghost" data-close>Close</button></div>', { sticky: true });
    var go = function (f) {
      if (!f) return;
      dd.ui.status("dd-drop-status", "info", "Reading " + (f.name || "the file") + "…");
      files.take(f).then(function (r) {
        if (!r.ok) { dd.ui.status("dd-drop-status", "warn", r.message); return; }
        dd.ui.closeSheet();
        if (r.before !== r.after) files.showDone(r); else dd.ui.toast(r.message || "Nothing new in that file.", 4500);
      });
    };
    sh.querySelector("[data-pick]").addEventListener("click", function () { files.pick().then(go); });
    sh.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
    files.dropZone(sh.querySelector("#dd-drop"), go);
  };
  files.showDone = function (r) {
    dd.ui.notice("file-taken", r.message, "ok", [{ label: "↩ Undo", onClick: function () {
      try { dd.replaceData(JSON.parse(r.before), { source: "file-undo", example: r.example }); dd.ui.clearNotice("file-taken"); dd.ui.toast("Undone. It's back the way it was."); } catch (e) {}
    } }, { label: "OK", primary: true, onClick: function () { dd.ui.clearNotice("file-taken"); } }]);
  };

  // Dropping a file anywhere on the page (outside a drop area) shouldn't make the browser leave
  // the program to show the file. Catch it and treat it as "Add a file".
  window.addEventListener("dragover", function (e) { if (cfg()) e.preventDefault(); });
  window.addEventListener("drop", function (e) {
    if (!cfg() || e.defaultPrevented) return;
    e.preventDefault();
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) files.takeAndTell(f);
  });

  if (dd.menu) dd.menu.add({ id: "file", icon: "📂", group: "app", order: 40,
    get label() { return "Add " + files.label(); },
    show: function () { return files.enabled(); }, note: function () { return "Read on this device only"; },
    run: function () { files.open(); } });

  if (dd.diag) dd.diag.addSection("Files", function () {
    if (!cfg()) return ["This program doesn't take files."];
    return ["Last file: " + (lastTake ? lastTake.at + " · " + lastTake.name + " · " + lastTake.kb + " KB · " + (lastTake.ok ? "taken" : "not taken") : "none this visit")];
  });
})();
