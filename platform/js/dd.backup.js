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
  /* With live sync on, the backup also carries this program's sync address and the setup code
     (audit 2026-10-08), so restoring it on a cleared or new device reconnects to the buyer's own
     database. That makes the file a key to the data: the Backup sheet says to keep it private. */
  function syncPart() {
    if (!(dd.sync && dd.sync.isOn && dd.sync.isOn())) return null;
    var led = dd.sync.ledger && dd.sync.ledger(), cfg = dd.sync.config && dd.sync.config();
    return led && cfg ? { ledger: led, config: dd.sync.strip(cfg) } : null;
  }
  backup.make = function () {
    var p = dd.getProgram(), out = { dd: 1, kind: "backup", program: p.id, name: p.name, schemaVersion: p.schemaVersion,
                                     savedAt: new Date().toISOString(), data: dd.getData() };
    var sp = syncPart(); if (sp) out.sync = sp;
    return JSON.stringify(out, null, 1);
  };

  /* Download the file. Returns false (and says why) when there's nothing of the buyer's to keep. */
  backup.download = function () {
    if (dd.isExample()) { dd.ui.toast("These are example numbers, so there's nothing of yours to back up yet."); return false; }
    var blob = new Blob([backup.make()], { type: "application/json" }), url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = backup.fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    last.made = new Date().toLocaleTimeString();
    dd.store.set(lastKey(), new Date().toISOString());
    dd.store.set(dd.store.programKey(dd.getProgram().id, "backup_nudge"), String(Date.now()));
    dd.ui.clearNotice("backup");
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
    var sync = null;
    if (raw.sync && typeof raw.sync === "object" && /^[0-9a-f]{32}$/.test(String(raw.sync.ledger)) && dd.sync) {
      var cfg = raw.sync.config && typeof raw.sync.config === "object" ? dd.sync.parseConfig(JSON.stringify(raw.sync.config)) : null;
      if (cfg) sync = { ledger: raw.sync.ledger, config: cfg };
    }
    return { ok: true, data: body, savedAt: raw.savedAt, sync: sync };
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
      // Live sync isn't on here but the backup knows the buyer's database: reconnect (this device was
      // probably cleared). Anything newer in the database comes back too. On a device that already
      // syncs somewhere, nothing changes: the restored data goes to that database as usual.
      if (r.sync && !dd.sync.isOn()) {
        dd.sync.join(r.sync.ledger, r.sync.config).then(function (j) {
          last.restored += j.ok ? " · live sync reconnected" : " · live sync not reconnected (" + j.type + ")";
          if (j.ok) dd.ui.toast("Live sync is back on. Anything newer from your other devices comes in too.", 4500);
          else dd.ui.notice("sync", "Your backup was restored, but live sync couldn't reconnect. " + j.title + " " + j.help, "warn");
        });
      }
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

  /* ---------- "Backup & new versions" (footer, sync sheet) ----------
     Oran, 2026-10-07: make backing up obvious, and say plainly how data reaches a new version:
     same web address = it just stays; live sync on = it's already safe in their own Firebase;
     otherwise download a backup and restore it in the new version. */
  function lastKey() { return dd.store.programKey(dd.getProgram().id, "backup_at"); }
  backup.lastMade = function () { var t = dd.store.get(lastKey()); return t && !isNaN(Date.parse(t)) ? new Date(t) : null; };
  function synced() { return !!(dd.sync && dd.sync.status && dd.sync.status().kind === "ok"); }

  backup.open = function () {
    var p = dd.getProgram(), thing = p.dataLabel || "numbers", on = synced(), last = backup.lastMade();
    var sh = dd.ui.sheet('<h2>💾 Backup &amp; new versions</h2>' +
      (on ? '<p class="dd-status show ok"><b>✓ Your ' + esc(thing) + ' is backed up live</b> in your own Firebase database (live sync). A new version of ' + esc(p.name) + ' picks it all up by itself.</p>'
          : '<p class="dd-status show warn"><b>Your ' + esc(thing) + ' is saved on this device only.</b> Download a backup now and then, and always before you move to a new version.</p>') +
      '<h3 class="dd-sub">Keep a copy</h3>' +
      '<p class="dd-note">A backup is a small file you keep (your Documents folder, a USB stick or your email). Last backup on this device: <b>' +
        (last ? esc(last.toLocaleDateString()) : "never") + '</b>.</p>' +
      (on ? '<p class="dd-note">With live sync on, the backup also holds your live sync address, so restoring it on a new or cleared device reconnects everything. <b>Keep it private</b>: anyone with the file could open your ' + esc(thing) + '.</p>' : "") +
      '<p class="dd-note"><b>Careful when clearing your browser:</b> clearing "cookies and site data" (or "history and website data") removes your ' + esc(thing) + ', your access code and your live sync address from this device. ' +
        (on ? 'Your live copy stays safe in your own Firebase; restore a recent backup to reconnect.' : 'Download a backup first.') + '</p>' +
      '<div class="dd-btnrow"><button class="dd-btn" data-down>⬇ Download a backup</button><button class="dd-btn ghost" data-up>Restore from a backup</button></div>' +
      '<h3 class="dd-sub">Moving to a new version?</h3>' +
      '<ol class="dd-home-steps">' +
        '<li><b>Same place, same name:</b> upload the new file over the old one, keeping its file name. Your ' + esc(thing) + ' just stays. This is the easiest way.</li>' +
        '<li><b>Live sync on:</b> ' + (on ? "you're all set. Open the new version, turn on live sync there, and everything comes across."
            : 'turn it on first (setup step 4), and the new version gets everything from your own database.') + '</li>' +
        '<li><b>Neither:</b> tap <b>Download a backup</b> here. Then, in the new version, tap <b>💾 Backup &amp; new versions</b> at the bottom and <b>Restore from a backup</b>.</li>' +
      '</ol>' +
      '<p class="dd-note">The new version always comes from the same link you were given when you bought it.</p>' +
      (dd.move ? '<p class="dd-note">Switching between the DigiDoughnut version and your own copy? <button class="dd-linkbtn" data-move style="padding:0">Move to another copy</button> takes your ' + esc(thing) + ' with you.</p>' : "") +
      '<div class="dd-btnrow">' + (!on && dd.sync && dd.setup ? '<button class="dd-btn ghost" data-sync>Set up live sync</button>' : "") +
        '<button class="dd-btn ghost" data-close>Close</button></div>');
    sh.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
    sh.querySelector("[data-down]").addEventListener("click", function () { backup.download(); });
    sh.querySelector("[data-up]").addEventListener("click", function () { dd.ui.closeSheet(); backup.pick(); });
    var mv = sh.querySelector("[data-move]"); if (mv) mv.addEventListener("click", function () { dd.move.open(); });
    var sy = sh.querySelector("[data-sync]"); if (sy) sy.addEventListener("click", function () { dd.ui.closeSheet(); dd.setup.open("sync"); });
  };

  /* A gentle monthly nudge when the data lives on this device only and hasn't been backed up. */
  var NUDGE_MS = 30 * 24 * 3600 * 1000;
  backup.nudge = function () {
    var p = dd.getProgram(); if (!p || dd.isExample() || synced() || (dd.sync && dd.sync.isOn && dd.sync.isOn())) return;
    var k = dd.store.programKey(p.id, "backup_nudge"), snooze = Number(dd.store.get(k)) || 0, last = backup.lastMade();
    if (!snooze) { dd.store.set(k, String(Date.now())); return; }   // first visit with real data: start the clock, don't nag
    if (Date.now() - snooze < NUDGE_MS || (last && Date.now() - last.getTime() < NUDGE_MS)) return;
    var thing = p.dataLabel || "numbers";
    dd.ui.notice("backup", "Your " + thing + " is only on this device, and it's been a while since your last backup.", "info", [
      { label: "Download a backup", primary: true, onClick: function () { dd.ui.clearNotice("backup"); backup.download(); } },
      { label: "Later", onClick: function () { dd.store.set(k, String(Date.now())); dd.ui.clearNotice("backup"); } }
    ]);
  };
  dd.on("ready", function () { setTimeout(backup.nudge, 3000); });

  if (dd.menu) dd.menu.add({ id: "backup", icon: "💾", label: "Backup & new versions", order: 40,
    note: function () { return synced() ? "Backed up live in your own Firebase" : "Saved on this device only"; },
    run: function () { backup.open(); } });

  if (dd.diag) dd.diag.addSection("Backup", function () { return ["Backup downloaded this visit: " + last.made + " · restored this visit: " + last.restored]; });
})();
