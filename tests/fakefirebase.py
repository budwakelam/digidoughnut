"""A fake Firebase (Realtime Database + Anonymous sign-in) for the sync tests.

Two parts:
- FakeFirebase: a small HTTP server holding the database tree. It streams changes to listeners
  (server-sent events), applies writes, checks rules like the ones dd.sync gives the buyer, and
  issues anonymous sign-ins. Test switches: anon_disabled, rules_closed.
- module(name): stand-ins for the three SDK files (firebase-app.js, firebase-auth.js,
  firebase-database.js) served in place of https://www.gstatic.com/firebasejs/<ver>/..., with the
  same function names dd.sync uses. Like the real SDK, a write shows locally at once and is kept
  "pending" until the database has it. window.__fakeNet(false) cuts this page off (goOffline).

It proves our side only. The gate is Oran's PC + iPhone against his real Firebase project.
"""
import json, queue, re, threading, http.server, uuid, time
from urllib.parse import urlparse, parse_qs

BAD_KEY = "AIzaBadKeyForTests000000"


def _get(tree, segs):
    n = tree
    for s in segs:
        if not isinstance(n, dict) or s not in n:
            return None
        n = n[s]
    return n


def _prune(n):
    if isinstance(n, dict):
        for k in list(n):
            n[k] = _prune(n[k])
            if n[k] is None:
                del n[k]
        return n or None
    return n


def _set(tree, segs, val):
    if not segs:
        return val
    root = tree if isinstance(tree, dict) else {}
    n = root
    for s in segs[:-1]:
        if not isinstance(n.get(s), dict):
            n[s] = {}
        n = n[s]
    if val is None:
        n.pop(segs[-1], None)
    else:
        n[segs[-1]] = json.loads(json.dumps(val))
    return _prune(root)


def _stamp(v):
    """Firebase's {".sv": "timestamp"} placeholder becomes the server's clock."""
    if isinstance(v, dict):
        if v == {".sv": "timestamp"}: return int(time.time() * 1000)
        return {k: _stamp(x) for k, x in v.items()}
    return v


def _segs(path):
    return [s for s in str(path or "").split("/") if s]


class FakeFirebase:
    def __init__(self):
        self.tree = None
        self.lock = threading.Lock()
        self.seq = 0
        self.subs = []          # (path segs, queue)
        self.tokens = set()
        self.anon_disabled = False
        self.rules_closed = False
        self.writes = 0
        self.pushn = 0
        me = self

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a): pass

            def cors(self):
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Headers", "content-type")

            def reply(self, code, body):
                b = json.dumps(body).encode()
                self.send_response(code); self.cors()
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(b))); self.end_headers()
                self.wfile.write(b)

            def do_OPTIONS(self):
                self.send_response(204); self.cors(); self.end_headers()

            def do_POST(self):
                u = urlparse(self.path); q = parse_qs(u.query)
                n = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(n).decode() if n else ""
                if u.path == "/v1/accounts:signUp":   # REST sign-in, as an AI agent does it
                    if me.anon_disabled: return self.reply(400, {"error": {"message": "ADMIN_ONLY_OPERATION"}})
                    t = uuid.uuid4().hex; me.tokens.add(t)
                    return self.reply(200, {"idToken": t, "refreshToken": "r" + t, "expiresIn": "3600", "localId": t})
                if u.path.endswith(".json"):
                    return self.rest("POST", u, q, body)
                if u.path == "/auth":
                    key = (q.get("key") or [""])[0]
                    if key == BAD_KEY:
                        return self.reply(400, {"code": "auth/api-key-not-valid.-please-pass-a-valid-api-key."})
                    if me.anon_disabled:
                        return self.reply(400, {"code": "auth/admin-restricted-operation"})
                    t = uuid.uuid4().hex; me.tokens.add(t)
                    return self.reply(200, {"uid": t})
                if u.path == "/write":
                    w = json.loads(body)
                    if w.get("op") == "cas":
                        ok, seq = me.cas(w.get("path"), w.get("expect"), w.get("value"), w.get("token"))
                        return self.reply(200 if ok is not None else 403, {"seq": seq, "committed": bool(ok)} if ok is not None else {"error": "PERMISSION_DENIED"})
                    ok, seq = me.write(w.get("op"), w.get("path"), w.get("value"), w.get("token"))
                    return self.reply(200 if ok else 403, {"seq": seq} if ok else {"error": "PERMISSION_DENIED"})
                if u.path == "/_set":   # test backdoor: no rules
                    w = json.loads(body); me.write("set", w["path"], w["value"], None, force=True)
                    return self.reply(200, {})
                self.reply(404, {})

            def rest(self, method, u, q, body):
                path = u.path[:-len(".json")]; token = (q.get("auth") or [""])[0]
                if method == "GET":
                    if not me.can_read(_segs(path), token): return self.reply(401, {"error": "Permission denied"})
                    with me.lock: return self.reply(200, _get(me.tree, _segs(path)))
                val = json.loads(body) if body else None
                if method == "POST":
                    me.pushn += 1; k = "-%013d%04d" % (int(time.time() * 1000), me.pushn)
                    ok, _ = me.write("set", path + "/" + k, val, token)
                    return self.reply(200, {"name": k}) if ok else self.reply(401, {"error": "Permission denied"})
                ok, _ = me.write("set", path, None if method == "DELETE" else val, token)
                return self.reply(200, val) if ok else self.reply(401, {"error": "Permission denied"})

            def do_PUT(self):
                u = urlparse(self.path); n = int(self.headers.get("Content-Length") or 0)
                return self.rest("PUT", u, parse_qs(u.query), self.rfile.read(n).decode() if n else "")

            def do_DELETE(self):
                u = urlparse(self.path); return self.rest("DELETE", u, parse_qs(u.query), "")

            def do_GET(self):
                u = urlparse(self.path); q = parse_qs(u.query)
                if u.path.endswith(".json") and u.path != "/_dump":
                    return self.rest("GET", u, q, "")
                if u.path == "/_dump":
                    with me.lock: return self.reply(200, {"tree": me.tree})
                if u.path == "/get":
                    path = _segs((q.get("path") or [""])[0]); token = (q.get("token") or [""])[0]
                    if not me.can_read(path, token): return self.reply(403, {"error": "PERMISSION_DENIED"})
                    with me.lock: return self.reply(200, {"value": _get(me.tree, path), "seq": me.seq})
                if u.path != "/listen":
                    return self.reply(404, {})
                path = _segs((q.get("path") or [""])[0]); token = (q.get("token") or [""])[0]
                self.send_response(200); self.cors()
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache"); self.end_headers()
                try:
                    self.wfile.write(b"retry: 300\n\n")
                    if not me.can_read(path, token):
                        self.wfile.write(b"event: denied\ndata: {}\n\n"); self.wfile.flush(); return
                    qu = queue.Queue()
                    with me.lock:
                        me.subs.append((path, qu)); qu.put((me.seq, _get(me.tree, path)))
                    while True:
                        try:
                            seq, val = qu.get(timeout=10)
                            self.wfile.write(("event: value\ndata: " + json.dumps({"seq": seq, "value": val}) + "\n\n").encode())
                        except queue.Empty:
                            self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError, OSError):
                    pass
                finally:
                    with me.lock:
                        me.subs = [s for s in me.subs if s[1] is not locals().get("qu")]

        self.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.srv.daemon_threads = True
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.srv.server_address[1]}"

    # ---- rules, like dd.sync.rules ----
    def _ledger(self, segs):
        return len(segs) >= 3 and segs[0] == "sync" and re.fullmatch(r"[a-z0-9]+", segs[1]) and len(segs[2]) == 32

    def can_read(self, segs, token):
        return not self.rules_closed and token in self.tokens and self._ledger(segs)

    @staticmethod
    def valid_ledger(v):
        if v is None: return True
        if not isinstance(v, dict): return False
        for k, x in v.items():
            if k == "meta":
                if not isinstance(x, dict) or any(m not in ("v", "schema") or not isinstance(n, (int, float)) for m, n in x.items()): return False
            elif k == "lists":
                if not isinstance(x, dict): return False
                for l in x.values():
                    if not isinstance(l, dict): return False
                    for lk, lv in l.items():
                        if lk == "order" and isinstance(lv, str): continue
                        if lk == "items" and isinstance(lv, dict) and all(isinstance(i, str) for i in lv.values()): continue
                        return False
            elif k == "fields":
                if not isinstance(x, dict) or not all(isinstance(f, str) for f in x.values()): return False
            else:
                return False
        return True

    def write(self, op, path, value, token, force=False):
        segs = _segs(path)
        changes = [(segs + _segs(k), v) for k, v in (value or {}).items()] if op == "update" else [(segs, value)]
        with self.lock:
            if not force:
                if self.rules_closed or token not in self.tokens: return False, 0
                for s, _ in changes:
                    if not self._ledger(s): return False, 0
            for s, v in changes: self.tree = _set(self.tree, s, _stamp(v))
            self.seq += 1; self.writes += 1
            for sp, qu in self.subs:
                if any(sp[:len(s)] == s or s[:len(sp)] == sp for s, _ in changes):
                    qu.put((self.seq, _get(self.tree, sp)))
            return True, self.seq

    def cas(self, path, expect, value, token):
        """Compare-and-set, for the SDK's runTransaction. None = refused by the rules."""
        segs = _segs(path)
        with self.lock:
            if self.rules_closed or token not in self.tokens or not self._ledger(segs): return None, 0
            if json.dumps(_get(self.tree, segs), sort_keys=True) != json.dumps(expect, sort_keys=True): return False, self.seq
        ok, seq = self.write("set", path, value, token)
        return (True if ok else None), seq

    def reset(self):
        with self.lock: self.tree = None
        self.anon_disabled = False; self.rules_closed = False

    def at(self, path):
        with self.lock: return json.loads(json.dumps(_get(self.tree, _segs(path))))

    def module(self, name):
        return MODULES[name].replace("__FAKE__", self.url)


MODULES = {
"firebase-app.js": r"""
const apps = [];
export const __SERVER = "__FAKE__";
export function initializeApp(options, name = "[DEFAULT]") {
  if (apps.some(a => a.name === name)) { const e = new Error("Firebase: duplicate app"); e.code = "app/duplicate-app"; throw e; }
  const a = { name, options: { ...options } }; apps.push(a); return a;
}
export function getApps() { return apps.slice(); }
export function deleteApp(a) { const i = apps.indexOf(a); if (i >= 0) apps.splice(i, 1); if (a._db) a._db._close(); return Promise.resolve(); }
""",
"firebase-auth.js": r"""
import { __SERVER } from "./firebase-app.js";
export function getAuth(app) {
  if (!app._auth) {
    const t = localStorage.getItem("fakeauth_" + app.options.apiKey);
    app._token = t;
    app._auth = { app, currentUser: t ? { uid: t, isAnonymous: true } : null, authStateReady: () => Promise.resolve() };
  }
  return app._auth;
}
export function signOut(auth) {
  localStorage.removeItem("fakeauth_" + auth.app.options.apiKey);
  auth.currentUser = null; auth.app._token = null; return Promise.resolve();
}
export async function signInAnonymously(auth) {
  if (window.__fakeOffline) { const e = new Error("Firebase: Error (auth/network-request-failed)."); e.code = "auth/network-request-failed"; throw e; }
  const r = await fetch(__SERVER + "/auth?key=" + encodeURIComponent(auth.app.options.apiKey), { method: "POST" });
  const j = await r.json();
  if (!r.ok) { const e = new Error("Firebase: Error (" + j.code + ")."); e.code = j.code; throw e; }
  localStorage.setItem("fakeauth_" + auth.app.options.apiKey, j.uid);
  auth.currentUser = { uid: j.uid, isAnonymous: true }; auth.app._token = j.uid;
  return { user: auth.currentUser };
}
""",
"firebase-database.js": r"""
import { __SERVER } from "./firebase-app.js";
const norm = p => String(p || "").split("/").filter(Boolean).join("/");
const clone = v => v == null ? null : JSON.parse(JSON.stringify(v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function getAt(n, path) { for (const s of path ? path.split("/") : []) { if (n == null || typeof n !== "object") return null; n = n[s]; } return n === undefined ? null : n; }
function prune(n) { if (n && typeof n === "object") { for (const k of Object.keys(n)) { n[k] = prune(n[k]); if (n[k] == null) delete n[k]; } return Object.keys(n).length ? n : null; } return n; }
function setAt(t, path, val) {
  const segs = path ? path.split("/") : [];
  if (!segs.length) { t.root = clone(val); return; }
  if (!t.root || typeof t.root !== "object") t.root = {};
  let n = t.root; for (const s of segs.slice(0, -1)) { if (!n[s] || typeof n[s] !== "object") n[s] = {}; n = n[s]; }
  if (val == null) delete n[segs[segs.length - 1]]; else n[segs[segs.length - 1]] = clone(val);
  t.root = prune(t.root);
}
const join = (a, b) => [a, b].map(norm).filter(Boolean).join("/");
const overlap = (a, b) => a === b || a.startsWith(b + "/") || b.startsWith(a + "/") || !a || !b;
const dbs = [];
window.__fakeOffline = !!window.__fakeOffline;
window.__fakeNet = function (online) { window.__fakeOffline = !online; dbs.forEach(d => online ? d._reopen() : d._drop()); };
class DB {
  constructor(app) { this.app = app; this.server = {}; this.pending = []; this.listeners = []; this.conn = []; this.connected = false; this.flushing = false; dbs.push(this); }
  view(path) { const t = { root: null }; setAt(t, path, this.server[path]); for (const w of this.pending) { if (w.op === "update") for (const k of Object.keys(w.value)) setAt(t, join(w.path, k), w.value[k]); else setAt(t, w.path, w.value); } return getAt(t.root, path); }
  fire(l) { if (!l.ready) return; const v = this.view(l.path), s = JSON.stringify(v); if (s === l.last) return; l.last = s; l.cb({ val: () => clone(v), exists: () => v != null }); }
  fireAll() { Promise.resolve().then(() => this.listeners.slice().forEach(l => this.fire(l))); }
  setConnected(v) { if (this.connected === v) return; this.connected = v; this.conn.forEach(c => c({ val: () => v })); }
  open(l) {
    if (window.__fakeOffline) return;
    const es = new EventSource(__SERVER + "/listen?path=" + encodeURIComponent(l.path) + "&token=" + encodeURIComponent(this.app._token || ""));
    l.es = es;
    es.addEventListener("value", e => {
      const d = JSON.parse(e.data); this.server[l.path] = d.value; l.ready = true; this.setConnected(true);
      this.pending = this.pending.filter(w => !(w.acked && w.seq <= d.seq));
      this.listeners.filter(x => x.path === l.path).forEach(x => { x.ready = true; this.fire(x); });
    });
    es.addEventListener("denied", () => {
      es.close(); this.listeners = this.listeners.filter(x => x !== l);
      const err = new Error("permission_denied at /" + l.path + ": Client doesn't have permission to access the desired data."); err.code = "PERMISSION_DENIED";
      if (l.cancel) l.cancel(err);
    });
    es.onerror = () => this.setConnected(false);
  }
  _drop() { this.listeners.forEach(l => { if (l.es) l.es.close(); l.es = null; }); this.setConnected(false); }
  _reopen() { this.listeners.forEach(l => { if (!l.es) this.open(l); }); this.flush(); }
  _close() { this._drop(); this.listeners = []; this.closed = true; }
  write(w) {
    this.pending.push(w); this.fireAll();
    return new Promise((res, rej) => { w.res = res; w.rej = rej; this.flush(); });
  }
  async flush() {
    if (this.flushing) return; this.flushing = true;
    try {
      while (!this.closed) {
        const w = this.pending.find(x => !x.acked); if (!w) break;
        if (window.__fakeOffline) { await sleep(200); continue; }
        let r;
        try { r = await fetch(__SERVER + "/write", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ op: w.op, path: w.path, value: w.value, token: this.app._token }) }); }
        catch (e) { this.setConnected(false); await sleep(300); continue; }
        if (r.status === 403) {
          this.pending = this.pending.filter(x => x !== w); this.fireAll();
          const err = new Error("PERMISSION_DENIED: Permission denied"); err.code = "PERMISSION_DENIED"; w.rej(err); continue;
        }
        if (!r.ok) { await sleep(300); continue; }
        const j = await r.json(); w.acked = true; w.seq = j.seq;
        if (!this.listeners.some(l => overlap(l.path, w.path))) this.pending = this.pending.filter(x => x !== w);
        w.res();
      }
    } finally { this.flushing = false; }
  }
}
export function getDatabase(app) { if (!app._db || app._db.closed) app._db = new DB(app); return app._db; }
export function ref(db, path) { return { db, path: norm(path) }; }
export function onValue(r, cb, cancel) {
  const db = r.db;
  if (r.path.startsWith(".info/") && r.path !== ".info/connected") { setTimeout(() => cb({ val: () => 0 })); return () => {}; }
  if (r.path === ".info/connected") { db.conn.push(cb); setTimeout(() => cb({ val: () => db.connected })); return () => { db.conn = db.conn.filter(c => c !== cb); }; }
  const l = { path: r.path, cb, cancel, ready: false, last: undefined };
  db.listeners.push(l); db.open(l);
  return () => { if (l.es) l.es.close(); db.listeners = db.listeners.filter(x => x !== l); };
}
export async function get(r) {
  if (window.__fakeOffline) { const e = new Error("Error: Client is offline."); throw e; }
  const res = await fetch(__SERVER + "/get?path=" + encodeURIComponent(r.path) + "&token=" + encodeURIComponent(r.db.app._token || ""));
  if (res.status === 403) { const e = new Error("permission_denied"); e.code = "PERMISSION_DENIED"; throw e; }
  const j = await res.json(); const v = j.value;
  return { val: () => clone(v), exists: () => v != null };
}
export function update(r, values) { return r.db.write({ op: "update", path: r.path, value: clone(values) }); }
export function set(r, value) { return r.db.write({ op: "set", path: r.path, value: clone(value) }); }
export async function runTransaction(r, fn) {
  for (let i = 0; i < 5; i++) {
    if (window.__fakeOffline) throw new Error("Error: Client is offline.");
    const cur = (await get(r)).val(), next = fn(clone(cur));
    if (next === undefined) return { committed: false, snapshot: { val: () => clone(cur) } };
    const res = await fetch(__SERVER + "/write", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ op: "cas", path: r.path, expect: cur, value: next, token: r.db.app._token }) });
    if (res.status === 403) { const e = new Error("permission_denied"); e.code = "PERMISSION_DENIED"; throw e; }
    const j = await res.json();
    if (j.committed) return { committed: true, snapshot: { val: () => clone(next) } };
  }
  return { committed: false, snapshot: { val: () => null } };
}
export function goOffline() { window.__fakeNet(false); }
export function goOnline() { window.__fakeNet(true); }
""",
}
