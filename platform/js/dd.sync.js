/* ===== DigiDoughnut Platform · dd.sync — keep devices in step =====
   Phase 5 (Oran, 2026-10-07). Live sync through the buyer's OWN free Firebase project.

   Decisions:
   - Firebase Realtime Database + Firebase Authentication "Anonymous" sign-in (Oran chose this
     over open rules: open rules make Google email the buyer an "insecure rules" warning).
     The real lock is still the long secret ledger id; signing in keeps the scanners quiet and
     turns away drive-by visitors.
   - The setup code (firebaseConfig) is SHARED by every program on the same web address
     (dd_firebase_config_v1): one Firebase project holds all of a buyer's programs. Each program
     keeps its own ledger: /sync/<program>/<ledger id>, ledger id = 128-bit random (32 hex).
   - Each item travels as ONE sealed piece of text (its JSON). Firebase drops empty values and
     mangles lists; a sealed item comes back exactly as it went in, and comparing two versions
     of an item is a plain text comparison.

   What's stored (one ledger):
     meta/v = 1, meta/schema = program.schemaVersion
     lists/<name>/order        "o:" + item ids joined by ","   (never empty, so empty lists survive)
     lists/<name>/items/<id>   JSON text of one item
     fields/<key>              JSON text of any other top-level value
   By default every top-level array whose items all have a string `id` is a list; everything
   else is a field (last change wins). Programs with odd data can give sync: {toParts, fromParts}
   or sync: false.

   How changes move (the POC engine, made three-way):
   - base = what we believe the database holds, kept on this device (dd_<id>_sync_base_v1), so a
     change made offline survives a reload.
   - A local change: 700 ms later, push only the paths that differ from base.
   - A remote snapshot: for each path, if this device didn't change it since base, take the
     remote one; if it did, keep ours (and push it). First join (no base yet): union by id,
     the database wins on the same id.
   - Echoes of our own pushes match what we have, so nothing happens. Example data never travels.
*/
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  var sync = dd.sync = {};

  sync.sdkVersion = "12.19.0";   // 13.0.0 came out 2026-10-07; stay on the last 12.x until it settles
  sync.sdkBase = function () { return "https://www.gstatic.com/firebasejs/" + sync.sdkVersion + "/"; };
  sync.limits = { debounce: 700, connect: 20000 };   // tests may shrink these

  var CONFIG_KEY = "dd_firebase_config_v1";

  /* The rules the buyer pastes into Firebase (Realtime Database, Rules tab). Only a signed-in copy
     of a program may read or write, and only inside /sync/<program>/<32-character ledger>. Nothing
     else in the database can be read. Kept short on purpose (Oran, 2026-10-07): buyers paste it,
     and the program checks the data's shape itself (validateData) before using anything. */
  sync.rules = JSON.stringify({ rules: { sync: { "$program": { "$ledger": {
    ".read": "auth != null && $ledger.length == 32",
    ".write": "auth != null && $ledger.length == 32"
  } } } } }, null, 2);
  var program = null, fb = null, app = null, db = null;
  var ledgerRef = null, unsubs = [], pushTimer = null, starting = null;
  var base = null, pend = {}, stamps = {}, timeOffset = 0, needFresh = false, pendSeq = 0, events = 0, connectedNow = false, resumeAfterPair = false;
  var state = "off";   // off | connecting | on | problem | newer
  var problem = null;  // friendly error type
  var diag = { pushes: 0, acked: 0, lastPush: "-", remote: 0, applied: 0, lastRemote: "-", lastError: "-", signedIn: "-", resumed: "no", joined: "-", reauths: 0 };

  function key(thing) { return dd.store.programKey(program.id, thing); }
  function now() { return new Date().toLocaleTimeString(); }

  /* ---------- the setup code (shared per web address) ---------- */
  var FIELDS = ["apiKey", "authDomain", "databaseURL", "projectId", "storageBucket", "messagingSenderId", "appId", "measurementId"];
  /* Accepts what the Firebase console shows (a JS object, with or without "const firebaseConfig ="),
     strict JSON, or text with stray quotes. Returns a config or null. */
  sync.parseConfig = function (text) {
    var t = String(text || ""), cfg = null;
    try { var j = JSON.parse(t); if (j && typeof j === "object") cfg = j; } catch (e) {}
    if (!cfg) {
      cfg = {};
      var re = /(["']?)(apiKey|authDomain|databaseURL|projectId|storageBucket|messagingSenderId|appId|measurementId)\1\s*:\s*["'`]([^"'`]+)["'`]/g, m;
      while ((m = re.exec(t))) cfg[m[2]] = m[3].trim();
    }
    var out = {};
    FIELDS.forEach(function (f) { if (typeof cfg[f] === "string" && cfg[f].trim()) out[f] = cfg[f].trim(); });
    if (!out.apiKey || !out.projectId) return null;
    // The console leaves databaseURL out when the database was made after the app was
    // registered. The default database of a project lives at a predictable address (US).
    if (!out.databaseURL) { out.databaseURL = "https://" + out.projectId + "-default-rtdb.firebaseio.com"; out.guessedURL = true; }
    if (!/^https:\/\/[a-z0-9.-]+\/?$/i.test(out.databaseURL)) return null;
    if (!out.authDomain) out.authDomain = out.projectId + ".firebaseapp.com";
    return out;
  };
  sync.config = function () { var c = dd.store.getJSON(CONFIG_KEY); return c && c.apiKey && c.databaseURL ? c : null; };
  function saveConfig(c) { return dd.store.setJSON(CONFIG_KEY, c).ok; }

  /* ---------- ledger id (per program) ---------- */
  function ledger() { var v = dd.store.get(key("sync_id")); return /^[0-9a-f]{32}$/.test(v || "") ? v : null; }
  function newLedger() {
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join("");
  }
  function wasOn() { return dd.store.get(key("sync_on")) === "1"; }
  function rememberOn(on) { if (on) dd.store.set(key("sync_on"), "1"); else dd.store.remove(key("sync_on")); }
  /* base: what the database last showed us. pend: paths this device sent that the database hasn't
     confirmed yet. Both are kept on the device, so a change made offline survives a reload
     (the Firebase library forgets unsent writes when the page closes). */
  function loadBase() {
    var b = dd.store.getJSON(key("sync_base")), mine = b && typeof b === "object" && b.ledger === ledger();
    base = mine ? b.flat : null; pend = mine && b.pend && typeof b.pend === "object" ? b.pend : {};
    stamps = mine && b.stamps && typeof b.stamps === "object" ? b.stamps : {};
  }
  function saveBase() { dd.store.setJSON(key("sync_base"), { ledger: ledger(), flat: base, pend: pend, stamps: stamps }); }
  /* When this device last changed each path (Firebase's clock, so a wrong device clock doesn't matter). */
  function clock() { return Date.now() + (timeOffset || 0); }
  function tkey(p) { return p.replace(/\//g, "|"); }
  /* base, with every unconfirmed path marked as changed here, so it's kept and sent again */
  function effBase() {
    if (!base) return null;
    var b = {}; Object.keys(base).forEach(function (p) { b[p] = base[p]; });
    Object.keys(pend).forEach(function (p) { b[p] = "\u0000unconfirmed"; });
    return b;
  }

  sync.isOn = function () { return state === "on" || state === "connecting" || (state === "problem" && wasOn()); };
  sync.state = function () { return { state: state, problem: problem, connected: connectedNow }; };

  /* ---------- data <-> parts ---------- */
  function enc(k) { return String(k).replace(/[.#$\[\]\/%,|]/g, function (c) { return "%" + c.charCodeAt(0).toString(16).toUpperCase(); }); }
  function dec(k) { return String(k).replace(/%([0-9A-F]{2})/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); }); }
  function isList(v) { return Array.isArray(v) && v.every(function (i) { return i && typeof i === "object" && !Array.isArray(i) && typeof i.id === "string" && i.id; }); }

  /* data -> flat map of path -> text */
  sync.toFlat = function (data) {
    if (program && program.sync && program.sync.toParts) data = program.sync.toParts(data);
    var flat = {};
    Object.keys(data || {}).forEach(function (k) {
      var v = data[k];
      if (v === undefined) return;
      if (isList(v)) {
        var seen = {}, ids = [];
        v.forEach(function (item) { if (seen[item.id]) return; seen[item.id] = 1; ids.push(enc(item.id)); flat["lists/" + enc(k) + "/items/" + enc(item.id)] = JSON.stringify(item); });
        flat["lists/" + enc(k) + "/order"] = "o:" + ids.join(",");
      } else flat["fields/" + enc(k)] = JSON.stringify(v);
    });
    return flat;
  };
  /* flat map -> data (null if something can't be read) */
  sync.fromFlat = function (flat) {
    var out = {}, lists = {};
    try {
      Object.keys(flat).forEach(function (p) {
        var s = p.split("/");
        if (s[0] === "fields" && s.length === 2) out[dec(s[1])] = JSON.parse(flat[p]);
        else if (s[0] === "lists") {
          var l = lists[s[1]] = lists[s[1]] || { items: {}, order: null };
          if (s[2] === "order" && s.length === 3) l.order = flat[p];
          else if (s[2] === "items" && s.length === 4) l.items[s[3]] = JSON.parse(flat[p]);
        }
      });
    } catch (e) { dd.errors.record("sync.read", e); return null; }
    Object.keys(lists).forEach(function (name) {
      var l = lists[name], arr = [], used = {};
      String(l.order || "o:").slice(2).split(",").forEach(function (id) { if (id && l.items[id] && !used[id]) { used[id] = 1; arr.push(l.items[id]); } });
      Object.keys(l.items).forEach(function (id) { if (!used[id]) arr.push(l.items[id]); });   // items the order doesn't mention yet
      out[dec(name)] = arr;
    });
    if (program && program.sync && program.sync.fromParts) out = program.sync.fromParts(out);
    return out;
  };
  /* the ledger as Firebase gives it -> flat map */
  function remoteFlat(v) {
    var flat = {};
    if (!v || typeof v !== "object") return flat;
    Object.keys(v.fields || {}).forEach(function (k) { if (typeof v.fields[k] === "string") flat["fields/" + k] = v.fields[k]; });
    Object.keys(v.lists || {}).forEach(function (n) {
      var l = v.lists[n] || {};
      if (typeof l.order === "string") flat["lists/" + n + "/order"] = l.order;
      Object.keys(l.items || {}).forEach(function (id) { if (typeof l.items[id] === "string") flat["lists/" + n + "/items/" + id] = l.items[id]; });
    });
    return flat;
  }
  function same(a, b) {
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) if (a[ka[i]] !== b[ka[i]]) return false;
    return true;
  }
  function diff(from, to) {
    var u = {}, n = 0;
    Object.keys(to).forEach(function (p) { if (from[p] !== to[p]) { u[p] = to[p]; n++; } });
    Object.keys(from).forEach(function (p) { if (!(p in to)) { u[p] = null; n++; } });
    return n ? u : null;
  }
  /* three-way merge. b = base (null on first join), l = this device, r = the database.
     t (optional) = {real: base without unconfirmed marks, lt: this device's edit times, rt: the
     database's edit times}. When BOTH sides changed the same path, the newer edit wins
     (Oran, 2026-10-07: "newest edit wins", option a); with no times, this device wins. */
  sync.merge = function (b, l, r, t) {
    var out = {}, all = {}, real = t && t.real, lt = (t && t.lt) || {}, rt = (t && t.rt) || {};
    [l, r].concat(b ? [b] : []).forEach(function (m) { Object.keys(m).forEach(function (p) { all[p] = 1; }); });
    Object.keys(all).forEach(function (p) {
      var v;
      if (!b) v = p in r ? r[p] : l[p];                                     // first join: union, database wins
      else if (l[p] === b[p]) v = r[p];                                     // we didn't touch it: take theirs
      else if (real && r[p] !== real[p] && (rt[p] || 0) > (lt[p] || 0)) v = r[p];   // both changed it: theirs is newer
      else v = l[p];                                                        // we changed it: keep ours
      if (v !== undefined && v !== null) out[p] = v;
    });
    // Lists: an order that both sides changed keeps ours; items it doesn't mention are added at the
    // end by fromFlat. On first join, put this device's own extra items after the database's.
    if (!b) Object.keys(out).forEach(function (p) {
      if (!/\/order$/.test(p) || !(p in l) || !(p in r)) return;
      var ids = r[p].slice(2).split(",").filter(Boolean);
      l[p].slice(2).split(",").forEach(function (id) { if (id && ids.indexOf(id) < 0) ids.push(id); });
      out[p] = "o:" + ids.join(",");
    });
    return out;
  };

  function localFlat() { return dd.isExample() ? {} : sync.toFlat(dd.getData()); }

  /* ---------- Firebase ---------- */
  function loadSdk() {
    if (fb) return Promise.resolve(fb);
    var B = sync.sdkBase();
    return Promise.all([import(B + "firebase-app.js"), import(B + "firebase-auth.js"), import(B + "firebase-database.js")]).then(function (m) {
      fb = { A: m[0], U: m[1], D: m[2] };
      return fb;
    });
  }
  function useApp(cfg) {
    var A = fb.A, existing = A.getApps().filter(function (a) { return a.name === "dd"; })[0];
    var p = existing && JSON.stringify(existing.options) !== JSON.stringify(strip(cfg)) ? A.deleteApp(existing).then(function () { existing = null; }) : Promise.resolve();
    return p.then(function () {
      app = existing || A.initializeApp(strip(cfg), "dd");
      return app;
    });
  }
  function strip(cfg) { var o = {}; FIELDS.forEach(function (f) { if (cfg[f]) o[f] = cfg[f]; }); return o; }
  function signIn() {
    var auth = fb.U.getAuth(app);
    return Promise.resolve(auth.authStateReady ? auth.authStateReady() : null).then(function () {
      if (auth.currentUser) return auth.currentUser;
      return fb.U.signInAnonymously(auth).then(function (c) { return c.user; });
    }).then(function (u) { diag.signedIn = "yes"; return u; });
  }
  function withTimeout(p, ms, what) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej({ ddType: "sync_offline", raw: what + ": no answer in " + Math.round(ms / 1000) + " s" }); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }

  /* Firebase error -> one of our friendly types */
  sync.classify = function (e) {
    if (e && e.ddType) return e.ddType;
    var code = String((e && e.code) || ""), msg = String((e && e.message) || e || "");
    if (/admin-restricted-operation|operation-not-allowed|configuration-not-found|ADMIN_ONLY/i.test(code + msg)) return "sync_auth";
    if (/api-key|API_KEY|invalid-api-key|project.*not.*found|app-not-authorized|invalid-app-id/i.test(code + msg)) return "sync_config";
    if (/permission|PERMISSION_DENIED/i.test(code + msg)) return "sync_rules";
    if (/different region|firebasedatabase\.app|Database lives/i.test(msg)) return "sync_config";
    if (/network-request-failed|Failed to fetch|NetworkError|offline/i.test(code + msg)) {
      var cfg = sync.config();
      if (dd.errors.blockedRecently(sync.sdkBase()) || (cfg && dd.errors.blockedRecently(cfg.databaseURL)) || dd.errors.blockedRecently("https://identitytoolkit.googleapis.com")) return "host_blocked";
      return "sync_offline";
    }
    if (/import|module|dynamically imported/i.test(msg)) return dd.errors.blockedRecently(sync.sdkBase()) ? "host_blocked" : "sync_offline";
    return "unexpected";
  };
  function fail(where, e) {
    var type = sync.classify(e);
    diag.lastError = now() + " · " + where + " · " + dd.errors.scrub(String((e && (e.raw || e.code || e.message)) || e)).slice(0, 200);
    dd.errors.record("sync " + where, (e && (e.raw || e.message)) || e);
    return type;
  }

  /* ---------- start / stop ---------- */
  /* Connect this program's ledger. Resolves {ok:true} or {ok:false, type, title, help}. */
  /* If the database says no, the sign-in may be stale (Firebase's "Auto clean-up" deletes
     anonymous sign-ins older than 30 days, or the buyer removed it). Sign in afresh and try once more. */
  var lastReauth = 0;
  sync.start = function (opts) {
    opts = opts || {};
    return startOnce(opts).then(function (r) {
      if (r.ok || r.type !== "sync_rules" || opts.reauthed || !app || Date.now() - lastReauth < 60000) return r;
      lastReauth = Date.now(); diag.reauths++;
      var auth = fb.U.getAuth(app);
      return Promise.resolve(fb.U.signOut ? fb.U.signOut(auth) : null).catch(function () {})
        .then(function () { return startOnce(Object.assign({}, opts, { reauthed: true })); });
    });
  };
  function startOnce(opts) {
    if (starting) return starting;
    var cfg = opts.config || sync.config();
    if (!program || program.sync === false) return Promise.resolve(friendly("unexpected"));
    if (!cfg) return Promise.resolve(friendly("sync_config"));
    if (dd.env.isFile && !opts.allowFile) return Promise.resolve(friendly("sync_file"));
    if (!ledger()) dd.store.set(key("sync_id"), newLedger());
    stopListening();
    state = "connecting"; problem = null; paint();
    var gotFirst = false;
    starting = loadSdk().catch(function (e) { throw { stage: "loading", e: e }; })
      .then(function () { return useApp(cfg); })
      .then(function () { return withTimeout(signIn(), sync.limits.connect, "sign-in").catch(function (e) { throw { stage: "sign-in", e: e }; }); })
      .then(function () {
        db = fb.D.getDatabase(app);
        ledgerRef = fb.D.ref(db, "sync/" + program.id + "/" + ledger());
        loadBase();
        return withTimeout(new Promise(function (resolve, reject) {
          unsubs.push(fb.D.onValue(ledgerRef, function (snap) {
            diag.remote++; diag.lastRemote = now(); events++;
            var ok = onRemote(snap.val());
            if (!gotFirst) { gotFirst = true; ok ? resolve() : reject({ ddType: state === "newer" ? "sync_newer" : "unexpected", raw: "first snapshot not usable" }); }
          }, function (e) {
            var t = fail("listening", e);
            if (!gotFirst) { gotFirst = true; reject({ stage: "listening", e: e }); return; }
            setProblem(t);
            if (t === "sync_rules") sync.start();
          }));
        }), sync.limits.connect, "first read").catch(function (e) { throw e.stage ? e : { stage: "reading", e: e }; });
      })
      .then(function () {
        // Prove we can write too (rules), and record which version wrote here.
        return withTimeout(fb.D.update(ledgerRef, { "meta/v": 1, "meta/schema": program.schemaVersion }), sync.limits.connect, "first write")
          .catch(function (e) { throw { stage: "writing", e: e }; });
      })
      .then(function () {
        try {
          unsubs.push(fb.D.onValue(fb.D.ref(db, ".info/connected"), function (s) {
            var c = !!s.val();
            if (!c) needFresh = true;
            if (c && !connectedNow && state === "on") refresh();   // back online: read first, then send
            connectedNow = c; paint();
          }));
          unsubs.push(fb.D.onValue(fb.D.ref(db, ".info/serverTimeOffset"), function (s) { timeOffset = Number(s.val()) || 0; }));
        } catch (e) {}
        state = "on"; problem = null; rememberOn(true); diag.joined = now(); dd.ui.clearNotice("sync");
        connectedNow = true;   // the first read came from the database itself
        pushNow();
        paint(); dd.emit("sync:changed", { on: true });
        return { ok: true };
      })
      .catch(function (err) {
        stopListening();
        var type = fail(err.stage || "start", err.e || err);
        setProblem(type);
        return friendly(type);
      })
      .finally(function () { starting = null; });
    return starting;
  }

  function friendly(type) {
    var f = dd.errors.friendly(type, { company: "Firebase" });
    return { ok: false, type: type, title: f.title, help: f.help };
  }
  function setProblem(type) { state = "problem"; problem = type; paint(); dd.emit("sync:changed", { on: wasOn(), problem: type }); }

  function stopListening() {
    unsubs.forEach(function (u) { try { u(); } catch (e) {} });
    unsubs = []; ledgerRef = null; connectedNow = false;
    clearTimeout(pushTimer); pushTimer = null;
  }

  /* Turn sync off on this device. The database and the setup code are left alone. */
  sync.stop = function () {
    stopListening();
    rememberOn(false); state = "off"; problem = null;
    paint(); dd.emit("sync:changed", { on: false });
  };

  /* Connect with a pasted setup code (the wizard's Connect button). */
  sync.connect = function (text) {
    var cfg = sync.parseConfig(text);
    if (!cfg) return Promise.resolve(friendly("sync_config"));
    var old = sync.config();
    if (old && (old.databaseURL !== cfg.databaseURL || old.apiKey !== cfg.apiKey)) {
      // A different Firebase project: start a fresh ledger there.
      dd.store.remove(key("sync_id")); dd.store.remove(key("sync_base"));
    }
    return sync.start({ config: cfg }).then(function (r) {
      if (r.ok) saveConfig(cfg);
      return r;
    });
  };

  /* Forget the setup code on this device (all programs on this web address). */
  sync.forget = function () { sync.stop(); dd.store.remove(CONFIG_KEY); dd.store.remove(key("sync_base")); };

  /* ---------- the two directions ---------- */
  function onRemote(v) {
    needFresh = false;
    var remote = remoteFlat(v), rschema = v && v.meta && typeof v.meta.schema === "number" ? v.meta.schema : null;
    if (rschema !== null && rschema > program.schemaVersion) {
      state = "newer"; problem = "sync_newer"; paint();
      dd.ui.notice("sync-newer", dd.errors.friendly("sync_newer").title + " " + dd.errors.friendly("sync_newer").help, "warn");
      return false;
    }
    dd.ui.clearNotice("sync-newer");
    var example = dd.isExample(), local = localFlat();
    // Example data never travels, and an empty database doesn't replace example data.
    if (example && !Object.keys(remote).length) { base = remote; saveBase(); return true; }
    var rt = {};
    Object.keys((v && v.times) || {}).forEach(function (k) { if (typeof v.times[k] === "number") rt[k.replace(/\|/g, "/")] = v.times[k]; });
    var lt = {}; Object.keys(stamps).forEach(function (p) { if (stamps[p] && typeof stamps[p].t === "number") lt[p] = stamps[p].t; });
    var merged = sync.merge(example ? null : effBase(), local, remote, { real: base, lt: lt, rt: rt });
    // A change held here (offline) that lost to a newer one, or matches the database already, has nothing
    // left to send. Only held ones: Firebase shows our SENT-but-unconfirmed writes as if they were already
    // in the database, and if the database then refuses one, forgetting it here would lose the change.
    Object.keys(pend).forEach(function (p) { if (pend[p] === "held" && merged[p] === remote[p]) delete pend[p]; });
    if (rschema !== null && rschema < program.schemaVersion && Object.keys(remote).length) {
      // Written by an older version: bring it up to date before using it.
      var old = sync.fromFlat(merged);
      try { if (old) merged = sync.toFlat(program.migrate(old, rschema)); } catch (e) { dd.errors.record("sync.migrate", e); return false; }
    }
    if (!example && same(merged, local)) { base = remote; saveBase(); if (!same(remote, local)) schedulePush(0); return true; }
    var next = sync.fromFlat(merged);
    if (!next || !program.validateData(next)) {
      fail("applying", "the database holds data this program can't read");
      dd.ui.toast("A change from your other device couldn't be read, so it was skipped.");
      base = remote; saveBase();
      return true;
    }
    dd.replaceData(next, { source: "sync", example: false });
    diag.applied++;
    base = remote; saveBase();
    if (!same(remote, merged)) schedulePush(0);
    return true;
  }

  function schedulePush(ms) {
    if (state !== "on" && state !== "connecting") return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, ms == null ? sync.limits.debounce : ms);
  }
  /* Remember when this device changed a path (kept until the value changes again). */
  function stamp(p, v) { if (!stamps[p] || stamps[p].v !== v) stamps[p] = { t: clock(), v: v }; }
  function pushNow() {
    pushTimer = null;
    if (!ledgerRef || state !== "on" || dd.isExample()) return;
    var local = localFlat(), from = effBase() || {};
    var u = diff(from, local);
    if (!u) return;
    if (!connectedNow || needFresh) {
      // Offline: DON'T hand Firebase a write to send blindly on reconnect (it would overwrite a newer
      // edit from the other device). Keep the change here; on reconnect we read the database first,
      // merge by edit time, then send what's left.
      Object.keys(u).forEach(function (p) { stamp(p, local[p]); pend[p] = "held"; });
      saveBase(); paint();
      return;
    }
    var seq = ++pendSeq;
    Object.keys(u).forEach(function (p) {
      pend[p] = seq; stamp(p, local[p]);
      u["times/" + tkey(p)] = stamps[p].t;
    });
    base = local; saveBase();
    diag.pushes++;
    fb.D.update(ledgerRef, u).then(function () {
      Object.keys(u).forEach(function (p) { if (pend[p] === seq) delete pend[p]; });
      saveBase(); diag.acked++; diag.lastPush = now(); paint();
    }, function (e) { var t = fail("saving", e); setProblem(t); if (t === "sync_rules") sync.start(); });   // pend keeps the change, so it's sent again
    paint();
  }

  /* Read the ledger from the database now (after reconnecting), then merge and send. */
  function refresh() {
    if (!ledgerRef || !fb.D.get) return;
    needFresh = true;
    var r = ledgerRef, at = events + ":" + pendSeq;
    // Ignore the answer if anything moved meanwhile (a live update came in, or we sent something):
    // it would be older than what we already have, and would undo our own change here.
    fb.D.get(r).then(function (snap) { if (r === ledgerRef && at === events + ":" + pendSeq) { diag.remote++; diag.lastRemote = now(); onRemote(snap.val()); paint(); } },
      function (e) { fail("re-reading", e); });
  }

  /* ---------- the QR: the phone joins on scan ---------- */
  var arrived = null;
  if (dd.pair) {
    dd.pair.register({
      key: "s", label: "live sync",
      give: function () { return sync.isOn() && ledger() ? ledger() : undefined; },
      take: function (v) {
        if (!/^[0-9a-f]{32}$/.test(String(v))) return false;
        arrived = arrived || {}; arrived.ledger = v; return true;
      }
    });
    dd.pair.register({
      key: "f", label: "sync setup", hidden: true,
      give: function () { var c = sync.config(); return sync.isOn() && c ? strip(c) : undefined; },
      take: function (v) {
        var c = v && typeof v === "object" ? sync.parseConfig(JSON.stringify(v)) : null;
        if (!c) return false;
        arrived = arrived || {}; arrived.config = c; return true;
      }
    });
  }
  function joinFromPair() {
    var a = arrived; arrived = null;
    if (!a || !a.ledger || !a.config || !program) {
      if (resumeAfterPair) { resumeAfterPair = false; if (wasOn() && sync.config()) { diag.resumed = "yes"; sync.start(); } }
      return;
    }
    resumeAfterPair = false;
    if (ledger() !== a.ledger) { dd.store.set(key("sync_id"), a.ledger); dd.store.remove(key("sync_base")); base = null; pend = {}; }
    saveConfig(a.config);
    sync.start().then(function (r) {
      if (r.ok) dd.ui.toast("Live sync is on. This phone and your computer are in step.", 4000);
      else dd.ui.notice("sync", r.title + " " + r.help, "warn");
    });
  }

  /* ---------- the little status chip in the header ---------- */
  function paint() {
    var slot = document.getElementById("dd-top-slot"); if (!slot) return;
    var chip = document.getElementById("dd-sync-chip");
    if (state === "off" && !wasOn()) { if (chip) chip.remove(); return; }
    if (!chip) {
      chip = document.createElement("button"); chip.id = "dd-sync-chip"; chip.className = "dd-sync-chip";
      chip.addEventListener("click", function () { sync.openSheet(); });
      slot.appendChild(chip);
    }
    var pending = !!pushTimer, s = sync.status();
    chip.className = "dd-sync-chip " + s.kind + (pending ? " busy" : "");
    chip.innerHTML = '<i aria-hidden="true"></i>' + dd.ui.esc(s.short);
    chip.title = s.long;
  }
  /* {kind: ok|wait|bad|off, short, long} in plain words */
  sync.status = function () {
    if (state === "connecting") return { kind: "wait", short: "Connecting…", long: "Connecting to your Firebase database." };
    if (state === "on" && connectedNow) return { kind: "ok", short: "In step", long: "Live sync is on. Changes go to your other devices straight away." };
    if (state === "on") return { kind: "wait", short: "Offline", long: "Can't reach your database right now. Your changes are kept here and go across when you're back online." };
    if (state === "newer") { var n = dd.errors.friendly("sync_newer"); return { kind: "bad", short: "Update needed", long: n.title + " " + n.help }; }
    if (state === "problem") { var f = dd.errors.friendly(problem, { company: "Firebase" }); return { kind: "bad", short: "Not in step", long: f.title + " " + f.help }; }
    return { kind: "off", short: "Sync off", long: "Live sync is off on this device." };
  };

  /* The sheet behind the chip (also Setup step 4's "Change"). */
  sync.openSheet = function () {
    var s = sync.status(), on = sync.isOn(), cfg = sync.config();
    var sh = dd.ui.sheet('<h2>Keep devices in step</h2>' +
      '<p class="dd-status show ' + (s.kind === "ok" ? "ok" : s.kind === "bad" ? "err" : "info") + '">' + dd.ui.esc(s.long) + '</p>' +
      (cfg ? '<p class="dd-note">Your database: <b>' + dd.ui.esc(cfg.projectId) + '</b></p>' : "") +
      '<div class="dd-btnrow">' +
        (on && dd.pair && !dd.env.isPhone ? '<button class="dd-btn" data-phone>📲 Add my phone</button>' : "") +
        (on ? (s.kind !== "ok" ? '<button class="dd-btn ghost" data-retry>Try again now</button>' : "") + '<button class="dd-btn ghost" data-off>Turn off on this device</button>'
            : (cfg ? '<button class="dd-btn" data-on>Turn it on</button>' : '<button class="dd-btn" data-setup>Set it up</button>')) +
        '<button class="dd-btn ghost" data-close>Close</button></div>' +
      '<p class="dd-note">Turning it off keeps everything on this device. Your other devices carry on as before.</p>');
    var q = function (s) { return sh.querySelector(s); };
    q("[data-close]").addEventListener("click", dd.ui.closeSheet);
    if (q("[data-phone]")) q("[data-phone]").addEventListener("click", function () { dd.ui.closeSheet(); dd.pair.open(); });
    if (q("[data-off]")) q("[data-off]").addEventListener("click", function () { sync.stop(); dd.ui.closeSheet(); dd.ui.toast("Live sync is off on this device."); });
    if (q("[data-retry]")) q("[data-retry]").addEventListener("click", function () { dd.ui.closeSheet(); sync.start(); });
    if (q("[data-on]")) q("[data-on]").addEventListener("click", function () { dd.ui.closeSheet(); sync.start().then(function (r) { if (!r.ok) dd.ui.notice("sync", r.title + " " + r.help, "warn"); }); });
    if (q("[data-setup]")) q("[data-setup]").addEventListener("click", function () { dd.ui.closeSheet(); dd.setup.open("sync"); });
  };

  /* ---------- start with the program ---------- */
  sync.attach = function (p) {
    program = p;
    if (p.sync === false) return;
    dd.on("change", function (ev) {
      if (!ev || ev.source === "sync") return;
      if (state === "on") { schedulePush(); paint(); }
    });
    dd.on("pair:received", joinFromPair);
    // Phones pause pages in the background. Coming back: reconnect at once rather than waiting for
    // Firebase's own retry, and restart if it had given up.
    function back() {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      if (state === "on" && db && fb && fb.D.goOnline) try { fb.D.goOnline(db); } catch (e) {}
      else if (state === "problem" && wasOn() && sync.config()) sync.start();
    }
    document.addEventListener("visibilitychange", back);
    window.addEventListener("pageshow", function (e) { if (e.persisted) back(); });
    window.addEventListener("online", function () { if (wasOn() && state === "problem" && problem === "sync_offline") sync.start(); });
    // A pairing link in the address is read just after this; it may bring a different ledger.
    if (/[#&]dd=/.test(location.hash)) { resumeAfterPair = true; paint(); }
    else if (wasOn() && sync.config()) { diag.resumed = "yes"; sync.start(); }
    else paint();
  };

  if (dd.diag) dd.diag.addSection("Sync", function () {
    if (!program) return ["-"];
    var cfg = sync.config(), id = ledger();
    return [
      "State: " + state + (problem ? " (" + problem + ")" : "") + " · remembered on: " + (wasOn() ? "yes" : "no") + " · resumed on load: " + diag.resumed,
      "Database: " + (cfg ? cfg.projectId + " · " + String(cfg.databaseURL).replace(/^https:\/\//, "") + (cfg.guessedURL ? " (address guessed)" : "") : "none") +
        " · SDK " + sync.sdkVersion + " · signed in: " + diag.signedIn + (diag.reauths ? " (signed in again " + diag.reauths + "x)" : "") + " · connected: " + (connectedNow ? "yes" : "no"),
      "Ledger: " + (id ? id.slice(0, 6) + "…" : "-") + " · joined: " + diag.joined + " · base kept: " + (base ? Object.keys(base).length + " paths" : "none"),
      "Pushes sent / confirmed: " + diag.pushes + " / " + diag.acked + " · last confirmed: " + diag.lastPush + (pushTimer ? " · a change is waiting to go" : "") +
        " · unconfirmed: " + Object.keys(pend).length,
      "Remote updates: " + diag.remote + " · applied: " + diag.applied + " · last: " + diag.lastRemote,
      "Last sync problem: " + diag.lastError
    ];
  });
})();
