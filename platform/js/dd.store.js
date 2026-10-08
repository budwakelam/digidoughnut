/* ===== DigiDoughnut Platform · dd.store =====
   Everything saved in the browser goes through here.

   Storage names (plan, "Template architecture"):
     shared by every program on the same web address:  dd_<thing>_v1           e.g. dd_ai_connections_v1
     belonging to one program:                          dd_<program>_<thing>_v1 e.g. dd_profitcoach_data_v1

   Program data is saved inside an envelope so we always know which program and which schema
   version wrote it:
     { dd:1, program:"profitcoach", schemaVersion:1, savedAt:"2026-10-06T…", example:false, data:{…} }
   Data saved without an envelope (the Profit Coach POC) is read as schema version 0 and handed
   to the program's migrate(). Nothing is ever thrown away: anything we can't read is copied to
   dd_<program>_data_recovery_v1 first. */
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  var store = dd.store = {};

  store.sharedKey = function (thing) { return "dd_" + thing + "_v1"; };
  store.programKey = function (programId, thing) { return "dd_" + programId + "_" + thing + "_v1"; };

  /* ---------- safe access: browsers can block or fill storage ---------- */
  function ls() { try { return window.localStorage; } catch (e) { return null; } }

  store.available = function () {
    var s = ls(); if (!s) return false;
    try { s.setItem("dd__probe", "1"); s.removeItem("dd__probe"); return true; } catch (e) { return false; }
  };
  store.get = function (key) { var s = ls(); if (!s) return null; try { return s.getItem(key); } catch (e) { return null; } };
  /* returns {ok:true} or {ok:false, reason:"storage_full"|"storage_blocked"} */
  store.set = function (key, value) {
    var s = ls(); if (!s) return { ok: false, reason: "storage_blocked" };
    try { s.setItem(key, value); return { ok: true }; }
    catch (e) {
      var full = e && (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014);
      dd.errors.record("store.set", e);
      return { ok: false, reason: full ? "storage_full" : "storage_blocked" };
    }
  };
  store.remove = function (key) { var s = ls(); if (s) try { s.removeItem(key); } catch (e) {} };
  store.getJSON = function (key) { var t = store.get(key); if (t == null) return null; try { return JSON.parse(t); } catch (e) { return undefined; } };
  store.setJSON = function (key, value) { return store.set(key, JSON.stringify(value)); };

  /* ---------- program data ---------- */
  function keepForRecovery(programId, raw, why) {
    dd.errors.record("store.recovery", why);
    store.set(store.programKey(programId, "data_recovery"), typeof raw === "string" ? raw : JSON.stringify(raw));
  }

  /* Load this program's data. Returns {data, meta:{example}, source, notice?}
     source: "example" (first visit), "saved", "migrated", "recovered" */
  store.loadData = function (program) {
    var key = store.programKey(program.id, "data");
    var rawText = store.get(key);

    if (rawText == null) {
      return { data: program.exampleData(), meta: { example: true }, source: "example" };
    }

    var raw; try { raw = JSON.parse(rawText); } catch (e) { raw = undefined; }
    var isEnvelope = raw && raw.dd === 1 && "data" in raw;
    var fromVersion = isEnvelope ? (raw.schemaVersion | 0) : 0;
    var body = isEnvelope ? raw.data : raw;
    var example = isEnvelope ? !!raw.example : false;
    var source = "saved";

    try {
      // Text that isn't readable data must never reach migrate(): a lenient migrate could
      // turn it into an empty list and the original would be overwritten on the next save.
      if (raw === undefined || raw === null || typeof raw !== "object") throw new Error("saved data is not readable");
      if (isEnvelope && raw.program && raw.program !== program.id) throw new Error("saved by program " + raw.program);
      if (fromVersion > program.schemaVersion) {
        // Saved by a NEWER version of this program. Keep a copy, then try to carry on.
        keepForRecovery(program.id, rawText, "newer schema " + fromVersion);
      } else if (fromVersion < program.schemaVersion) {
        body = dd.migrateData(program, body, fromVersion);
        source = "migrated";
      }
      if (!program.validateData(body)) throw new Error("validateData said no (from v" + fromVersion + ")");
    } catch (e) {
      keepForRecovery(program.id, rawText, e);
      return {
        data: program.emptyData(), meta: { example: false }, source: "recovered",
        notice: "We couldn't read your saved numbers, so we've started a fresh page. Your old numbers are kept safe on this device. Contact DigiDoughnut and we'll help you get them back."
      };
    }

    if (source === "migrated") store.saveData(program, body, { example: example });
    return { data: body, meta: { example: example }, source: source };
  };

  store.saveData = function (program, data, meta) {
    var res = store.setJSON(store.programKey(program.id, "data"), {
      dd: 1, program: program.id, schemaVersion: program.schemaVersion,
      savedAt: new Date().toISOString(), example: !!(meta && meta.example), data: data
    });
    if (res.ok) { askToKeepStorage(program); store.checkRoom(); }
    return res;
  };

  store.dataBytes = function (programId) { var t = store.get(store.programKey(programId, "data")); return t ? t.length : 0; };

  /* Everything this web address keeps in the browser, in characters (browsers allow about 5 million
     per address). Live sync keeps a second copy of the data, so a program uses about 3x its data. */
  store.LIMIT = 5000000;
  store.usedChars = function () {
    var s = ls(), n = 0; if (!s) return 0;
    try { for (var i = 0; i < s.length; i++) { var k = s.key(i), v = s.getItem(k); n += k.length + (v ? v.length : 0); } } catch (e) {}
    return n;
  };
  /* Nearly full (over 80%): warn once per visit, before a save actually fails. */
  var warnedFull = false;
  store.checkRoom = function () {
    if (warnedFull || store.usedChars() < store.LIMIT * 0.8) return;
    warnedFull = true;
    dd.errors.record("store", "browser storage over 80% full: " + store.usedChars() + " characters");
    if (dd.ui) dd.ui.notice("storage", "This browser's storage for this web address is nearly full. Download a backup now (menu → ⚙️ Settings → 💾 Backup & new versions), and contact DigiDoughnut if this keeps showing.", "warn");
  };

  /* ---------- ask the browser to keep our storage ----------
     Asked once, after the buyer's first real save, so browsers that show a prompt
     (Firefox) show it at a moment that makes sense. Chrome and Safari decide silently. */
  store.persisted = "not asked";
  // On load, report what the browser already decided (from an earlier visit), so the
  // diagnostic doesn't say "not asked" just because nothing was saved on this visit yet.
  try {
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(function (already) {
        if (store.persisted === "not asked") store.persisted = already ? "yes" : "not yet";
      }, function () {});
    } else { store.persisted = "unsupported"; }
  } catch (e) {}
  function askToKeepStorage(program) {
    if (store.persisted === "not yet") store.persisted = "not asked";
    if (store.persisted !== "not asked") return;
    if (!(navigator.storage && navigator.storage.persist)) { store.persisted = "unsupported"; return; }
    store.persisted = "asking";
    navigator.storage.persisted().then(function (already) {
      return already || navigator.storage.persist();
    }).then(function (granted) { store.persisted = granted ? "yes" : "no"; })
      .catch(function (e) { store.persisted = "error"; dd.errors.record("store.persist", e); });
  }
})();
