/* ===== DigiDoughnut Platform · dd.backup — download a backup, restore from one =====
   Spec 3.5 (Oran, 2026-10-07: "build it in this phase; it's the safety net if sync ever mangles
   data"). Browsers can't quietly save files, so a backup is a download the buyer keeps:
     <program>-backup-YYYY-MM-DD.json
   It uses the same envelope as saved data, marked as a backup:
     { dd:1, kind:"backup", program, name, schemaVersion, savedAt, data }
   Restore reads a file, checks it belongs to this program, upgrades older data with the program's
   migrate(), checks it with validateData(), asks first, and offers Undo. A restore is an ordinary
   dd.replaceData, so live sync carries it to the other devices.
   Example data is never put in a backup. */
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  var backup = dd.backup = {};
  var esc = function (s) { return dd.ui.esc(s); };
  var last = { made: "-", restored: "-" };

  backup.fileName = function () {
    var p = dd.getProgram();
    return p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-backup-" + dd.ui.isoDate() + ".json";
  };
  backup.make = function () {
    var p = dd.getProgram();
    return JSON.stringify({ dd: 1, kind: "backup", program: p.id, name: p.name, schemaVersion: p.schemaVersion,
                            savedAt: new Date().toISOString(), data: dd.getData() }, null, 1);
  };

  /* Download the file. Returns false (and says why) when there's nothing of the buyer's to keep. */
  backup.download = function () {
    if (dd.isExample()) { dd.ui.toast("These are example numbers, so there's nothing of yours to back up yet."); return false; }
    var blob = new Blob([backup.make()], { type: "application/json" }), url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = backup.fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    last.made = new Date().toLocaleTimeString();
    dd.ui.toast("Backup downloaded. Keep it somewhere safe.", 3500);
    return true;
  };

  /* Read a backup's text. Returns {ok, data, savedAt} or {ok:false, type, title, help}. */
  backup.read = function (text) {
    var p = dd.getProgram(), raw = null, bad = function () { var f = dd.errors.friendly("backup_bad"); return { ok: false, type: "backup_bad", title: f.title, help: f.help }; };
    try { raw = JSON.parse(String(text || "")); } catch (e) { return bad(); }
    if (!raw || typeof raw !== "object" || raw.dd !== 1 || !("data" in raw)) return bad();
    if (raw.program && raw.program !== p.id) {
      var f = dd.errors.friendly("backup_bad");
      return { ok: false, type: "backup_other", title: "That's a backup from " + (raw.name || "a different program") + ", not " + p.name + ".", help: f.help };
    }
    var v = raw.schemaVersion | 0, body = raw.data;
    if (v > p.schemaVersion) return { ok: false, type: "backup_newer", title: "That backup was made by a newer version of " + p.name + ".", help: "Open it in the newer version instead, or contact DigiDoughnut and we'll help." };
    try { if (v < p.schemaVersion) body = p.migrate(body, v); } catch (e) { dd.errors.record("backup.migrate", e); return bad(); }
    if (!p.validateData(body)) return bad();
    return { ok: true, data: body, savedAt: raw.savedAt };
  };

  /* Ask, then swap in the backup. Keeps what was there so it can be undone. */
  backup.restoreText = function (text) {
    var r = backup.read(text);
    if (!r.ok) { dd.ui.toast(r.title, 5000); dd.errors.record("backup.restore", r.type); return Promise.resolve(r); }
    var when = r.savedAt && !isNaN(Date.parse(r.savedAt)) ? new Date(r.savedAt).toLocaleString() : "an earlier date";
    var p = dd.getProgram(), thing = p.dataLabel || "numbers";
    return dd.ui.confirm("Restore the backup from " + when + "?",
      "Your " + thing + " on this device will be replaced with the backup." + (dd.sync && dd.sync.isOn() ? " Your other devices will get it too." : "") + " You can undo this straight after.",
      "Yes, restore it", "No, keep what I have").then(function (yes) {
      if (!yes) return { ok: false, type: "cancelled" };
      var before = JSON.stringify(dd.getData()), wasExample = dd.isExample();
      if (!dd.replaceData(r.data, { example: false, source: "restore" })) { var f = dd.errors.friendly("backup_bad"); dd.ui.toast(f.title, 5000); return { ok: false, type: "backup_bad" }; }
      last.restored = new Date().toLocaleTimeString();
      dd.ui.notice("restore", "Restored the backup from " + when + ".", "info", [
        { label: "Undo", onClick: function () { dd.replaceData(JSON.parse(before), { example: wasExample, source: "restore-undo" }); dd.ui.clearNotice("restore"); dd.ui.toast("Put back the way it was."); } },
        { label: "OK", primary: true, onClick: function () { dd.ui.clearNotice("restore"); } }
      ]);
      return { ok: true };
    });
  };

  /* Open the file picker, then restore. */
  backup.pick = function () {
    var input = document.createElement("input");
    input.type = "file"; input.accept = ".json,application/json"; input.style.display = "none";
    input.addEventListener("change", function () {
      var f = input.files && input.files[0]; input.remove();
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { var x = dd.errors.friendly("backup_bad"); dd.ui.toast(x.title, 5000); return; }
      f.text().then(backup.restoreText, function (e) { dd.errors.record("backup.file", e); dd.ui.toast("That file couldn't be opened.", 4000); });
    });
    document.body.appendChild(input); input.click();
  };

  /* "Your data": backup, restore, and where things stand with sync. Opened from the footer. */
  backup.open = function () {
    var p = dd.getProgram(), thing = p.dataLabel || "numbers", s = dd.sync && dd.sync.status ? dd.sync.status() : null;
    var sh = dd.ui.sheet('<h2>Your ' + esc(thing) + '</h2>' +
      '<p>Everything here is saved in this browser, on this device.</p>' +
      '<h3 class="dd-sub">Keep a copy</h3>' +
      '<p class="dd-note">Download a backup file now and then, and keep it somewhere safe (your Documents folder, a USB stick or your email). If anything goes wrong, you can put it back.</p>' +
      '<div class="dd-btnrow"><button class="dd-btn" data-down>⬇ Download a backup</button><button class="dd-btn ghost" data-up>Restore from a backup</button></div>' +
      (s ? '<h3 class="dd-sub">Other devices</h3><p class="dd-note">' + esc(s.kind === "off" ? "Live sync is off. Set it up in step 4 of the setup card to keep your devices in step." : s.long) + '</p>' : "") +
      '<div class="dd-btnrow"><button class="dd-btn ghost" data-close>Close</button></div>');
    sh.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
    sh.querySelector("[data-down]").addEventListener("click", function () { backup.download(); });
    sh.querySelector("[data-up]").addEventListener("click", function () { dd.ui.closeSheet(); backup.pick(); });
  };

  if (dd.diag) dd.diag.addSection("Backup", function () { return ["Backup downloaded this visit: " + last.made + " · restored this visit: " + last.restored]; });
})();
