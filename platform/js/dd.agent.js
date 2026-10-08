/* ===== DigiDoughnut Platform · dd.agent — connect your own AI agent (Muse and the like) =====
   Phase 6 (Oran, 2026-10-07). The buyer's agent gets an API without DigiDoughnut running any
   server: the buyer's OWN Firebase database (live sync, setup step 4) is the API.

   Inside this program's ledger (/sync/<program>/<ledger>/agent):
     view          what the agent reads: {v, program, name, example, summary, data, tools, updatedAt}.
                   data and tools are JSON text (Firebase drops empty lists and mangles arrays).
                   Written by the buyer's devices whenever the data changes.
     inbox/<id>    instructions the agent drops in: {tool, args, at}. The program carries them
                   out with its OWN tools (the same ones Penny uses), so every check still applies.
     done/<id>     the result for the agent: {ok, message, tool, at} or {waiting:true, …}.
   Oran's decisions:
   - An instruction waits in the inbox until the program is open somewhere (any of the buyer's
     devices, or the agent's own browser via the agent link). The agent is told so.
   - Big changes (tools with `confirm`) wait for the buyer's Yes on their OWN device. A copy opened
     from the agent link never shows the question.
   - The buyer is told plainly: anyone with the instructions can read and change their data.
     "Disconnect my agent" moves the program to a new secret address (dd.sync.newAddress).
   Two devices open at once: each instruction is claimed with a transaction, so it runs once. */
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  var agent = dd.agent = {};
  var program = null, unsub = null, me = null, remoteView = null, viewTimer = null, lastViewAt = 0;
  var busy = {}, asked = {}, undoBefore = null, undoLines = [];
  var CLAIM_MS = 60000, DONE_KEEP_MS = 7 * 24 * 3600 * 1000, MAX_ARGS = 4000;
  var diag = { link: "no", ran: 0, refused: 0, waiting: 0, last: "-", views: 0, error: "-" };
  var esc = function (s) { return dd.ui.esc(s); };
  var TS = { ".sv": "timestamp" };

  function key(t) { return dd.store.programKey(program.id, t); }
  function label() { return (program && program.dataLabel) || "numbers"; }
  agent.available = function () { return !!(program && program.sync !== false && (program.tools || []).length && dd.sync); };
  agent.isAgentDevice = function () { return !!program && dd.store.get(key("agent_device")) === "1"; };
  agent.connected = function () { return !!program && !!dd.store.getJSON(key("agent")); };

  /* ---------- the agent link: opens the program in the agent's own browser, joined to sync ---------- */
  function b64(str) {
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  agent.link = function () {
    var cfg = dd.sync.config(), led = dd.sync.ledger();
    if (!cfg || !led) return null;
    return location.href.split("#")[0] + "#ddagent=" + b64(JSON.stringify({ v: 1, s: led, f: dd.sync.strip(cfg) }));
  };
  /* Called by dd.sync.attach. Unlike the phone QR it never expires and can be used again and
     again: agents often start a fresh browser for every task. */
  agent.readLink = function () {
    var m = location.hash.match(/[#&]ddagent=([A-Za-z0-9_-]+)/);
    if (!m) return null;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    try {
      var j = JSON.parse(unb64(m[1])), cfg = j && j.f ? dd.sync.parseConfig(JSON.stringify(j.f)) : null;
      if (!j || j.v !== 1 || !/^[0-9a-f]{32}$/.test(String(j.s)) || !cfg) throw new Error("bad agent link");
      dd.store.set(key("agent_device"), "1");
      diag.link = "opened " + new Date().toLocaleTimeString();
      deviceNotice();
      return { s: j.s, f: cfg };
    } catch (e) {
      dd.errors.record("agent.link", e);
      dd.ui.notice("agentlink", "That link for your AI agent didn't come through completely. Copy the instructions again from your own device.", "warn");
      return null;
    }
  };
  function deviceNotice() {
    if (!agent.isAgentDevice()) return;
    dd.ui.notice("agentdev", "This copy was opened from your AI agent's link. Waiting instructions are done here; big changes still wait for your Yes on your own device.", "info", [
      { label: "This is my own device", onClick: function () { dd.store.remove(key("agent_device")); dd.ui.clearNotice("agentdev"); onAgent(lastAgent); } }
    ]);
  }

  /* ---------- what the agent reads ---------- */
  function toolList() {
    return (program.tools || []).map(function (t) {
      var inputs = {};
      Object.keys(t.params || {}).forEach(function (k) {
        var s = t.params[k] || {};
        inputs[k] = { type: s.type || "string", required: !s.optional, description: s.description || "" };
      });
      return { name: t.name, description: t.description || t.name, inputs: inputs, needsYes: !!t.confirm };
    });
  }
  agent.view = function () {
    var ex = dd.isExample(), summary = "";
    if (ex) summary = "The person hasn't started their own " + label() + " yet (the program is only showing example data, which isn't theirs).";
    else try { summary = program.summarizeForAI ? String(program.summarizeForAI(dd.ctx()) || "") : ""; } catch (e) { dd.errors.record("summarizeForAI", e); }
    return { v: 1, program: program.id, name: program.name, example: ex, summary: summary,
             data: JSON.stringify(ex ? null : dd.getData()), tools: JSON.stringify(toolList()) };
  };
  function sameView(a, b) {
    if (!a || !b) return false;
    return ["v", "program", "name", "example", "summary", "data", "tools"].every(function (k) { return a[k] === b[k]; });
  }
  function scheduleView(ms) { clearTimeout(viewTimer); viewTimer = setTimeout(writeView, ms == null ? 800 : ms); }
  function writeView() {
    viewTimer = null;
    var h = dd.sync.handle(); if (!h) return;
    var v = agent.view();
    if (sameView(remoteView, v)) return;
    // Never more than one write every 3 seconds, whatever happens.
    var wait = 3000 - (Date.now() - lastViewAt);
    if (wait > 0) { scheduleView(wait); return; }
    lastViewAt = Date.now(); diag.views++;
    v.updatedAt = TS;
    h.fb.D.update(h.fb.D.ref(h.db, h.path + "/agent"), { view: v }).catch(function (e) { fail("view", e); });
  }

  /* ---------- the inbox ---------- */
  var lastAgent = null;
  function listen() {
    unlisten();
    var h = dd.sync.handle(); if (!h || !agent.available()) return;
    me = me || dd.ui.uid("dev");
    unsub = h.fb.D.onValue(h.fb.D.ref(h.db, h.path + "/agent"), function (snap) { onAgent(snap.val()); }, function (e) { fail("listening", e); });
  }
  function unlisten() { if (unsub) try { unsub(); } catch (e) {} unsub = null; }

  function onAgent(v) {
    lastAgent = v = v || {};
    remoteView = v.view || null;
    if (!sameView(remoteView, agent.view())) scheduleView(viewTimer ? undefined : 200);
    var inbox = v.inbox && typeof v.inbox === "object" ? v.inbox : {}, ids = Object.keys(inbox).sort(), next = true;
    // Instructions run one at a time, oldest first, across ALL open devices, so they land in the
    // order the agent sent them. A fresh claim by another device means: that one is on it, wait.
    ids.forEach(function (id) {
      var item = inbox[id];
      if (!item || typeof item !== "object") return;
      if (item.state === "waiting") { if (!agent.isAgentDevice() && !busy[id]) ask(id, item); return; }
      if (!next) return;
      next = false;
      var c = item.claim, takenElsewhere = c && c.by !== me && Date.now() - (Number(c.at) || 0) < CLAIM_MS;
      if (!busy[id] && !takenElsewhere) process(id, item);
    });
    // Questions answered elsewhere (or withdrawn) disappear here too.
    Object.keys(asked).forEach(function (id) { if (!inbox[id] || inbox[id].state !== "waiting") { delete asked[id]; dd.ui.clearNotice("agentask-" + id); } });
    prune(v.done);
  }

  /* One device takes an instruction at a time (a transaction), so it's only done once. */
  function claim(id, approving) {
    var h = dd.sync.handle(); if (!h) return Promise.resolve(false);
    return h.fb.D.runTransaction(h.fb.D.ref(h.db, h.path + "/agent/inbox/" + id), function (cur) {
      if (!cur || typeof cur !== "object") return;
      if (cur.state === "waiting" && !approving) return;
      var c = cur.claim;
      if (c && c.by !== me && Date.now() - (Number(c.at) || 0) < CLAIM_MS) return;
      cur.claim = { by: me, at: Date.now() };
      return cur;
    }).then(function (r) { return !!(r && r.committed); }, function (e) { fail("claiming", e); return false; });
  }

  /* Done with an instruction: look over the inbox again (a parked question shows straight away). */
  function release(id) { delete busy[id]; setTimeout(function () { if (lastAgent) onAgent(lastAgent); }, 0); }

  function findTool(name) { return (program.tools || []).filter(function (t) { return t.name === name; })[0]; }
  function actionNames() { return (program.tools || []).map(function (t) { return t.name; }).join(", "); }

  /* Check the agent's inputs against the tool's own description; tidy the obvious ones. */
  function checkArgs(t, args) {
    if (JSON.stringify(args).length > MAX_ARGS) return "The inputs are too long.";
    var params = t.params || {}, keys = Object.keys(params);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], s = params[k] || {}, v = args[k];
      if (v === undefined || v === null || v === "") { if (!s.optional) return "The input '" + k + "' is missing."; delete args[k]; continue; }
      var type = s.type || "string";
      if (type === "string") { if (typeof v === "number" || typeof v === "boolean") args[k] = String(v); else if (typeof v !== "string") return "The input '" + k + "' should be text."; }
      else if (type === "boolean") { if (v === "true" || v === "false") args[k] = v === "true"; else if (typeof v !== "boolean") return "The input '" + k + "' should be true or false."; }
      else if (type === "number" || type === "integer") { var num = Number(v); if (typeof v === "boolean" || isNaN(num)) return "The input '" + k + "' should be a number."; args[k] = num; }
      if (s.enum && s.enum.indexOf(args[k]) < 0) return "The input '" + k + "' should be one of: " + s.enum.join(", ") + ".";
    }
    return null;
  }

  function process(id, item) {
    busy[id] = 1;
    claim(id, false).then(function (ok) {
      if (!ok) { delete busy[id]; return; }
      var t = findTool(item.tool), args = item.args && typeof item.args === "object" && !Array.isArray(item.args) ? JSON.parse(JSON.stringify(item.args)) : {};
      if (!t) return finish(id, { ok: false, tool: String(item.tool || ""), message: "There's no action called '" + String(item.tool || "") + "'. The actions are: " + actionNames() + "." });
      var bad = checkArgs(t, args);
      if (bad) return finish(id, { ok: false, tool: t.name, message: bad + " Not done." });
      var q = null;
      try { q = typeof t.confirm === "function" ? t.confirm(args, dd.ctx()) : t.confirm; } catch (e) { dd.errors.record("confirm:" + t.name, e); }
      if (q) return park(id, t, args, typeof q === "string" ? q : "Do you want to go ahead?");
      return run(id, t, args);
    }).catch(function (e) { fail("running", e); delete busy[id]; });
  }

  /* Big change: leave it in the inbox, waiting for the buyer's Yes on their own device. */
  function park(id, t, args, question) {
    var h = dd.sync.handle(); if (!h) { delete busy[id]; return; }
    var u = {};
    u["inbox/" + id + "/state"] = "waiting"; u["inbox/" + id + "/question"] = question; u["inbox/" + id + "/args"] = args; u["inbox/" + id + "/claim"] = null;
    u["done/" + id] = { ok: false, waiting: true, tool: t.name, message: "Waiting: this is a big change, so the person has to tap Yes on their own device first. The question shown: " + question, at: TS };
    diag.waiting++; diag.last = new Date().toLocaleTimeString() + " · " + t.name + " waits for Yes";
    return h.fb.D.update(h.fb.D.ref(h.db, h.path + "/agent"), u).then(function () { release(id); }, function (e) { fail("parking", e); delete busy[id]; });
  }

  function run(id, t, args) {
    var note = "";
    if (dd.isExample()) {   // example data never travels: start the buyer's own, empty, first
      dd.replaceData(program.emptyData(), { example: false, source: "agent" });
      note = " (The program was showing example data, so that was cleared first.)";
    }
    var before = JSON.stringify(dd.getData());
    return Promise.resolve().then(function () { return t.run(args, dd.ctx()); }).then(function (res) {
      res = res || {};
      var changed = JSON.stringify(dd.getData()) !== before;
      if (changed) remember(before, res.message || t.name);
      return finish(id, { ok: !!res.ok, tool: t.name, message: (res.message || (res.ok ? "Done." : "That didn't work.")) + note });
    }, function (e) {
      dd.errors.record("agent tool:" + t.name, e);
      return finish(id, { ok: false, tool: t.name, message: "That didn't work." });
    });
  }

  function finish(id, res) {
    var h = dd.sync.handle(); if (!h) { delete busy[id]; return; }
    res.at = TS;
    if (res.ok) diag.ran++; else diag.refused++;
    diag.last = new Date().toLocaleTimeString() + " · " + (res.tool || "?") + " · " + (res.ok ? "done" : "not done");
    var u = {}; u["inbox/" + id] = null; u["done/" + id] = res;
    return h.fb.D.update(h.fb.D.ref(h.db, h.path + "/agent"), u).then(function () { release(id); }, function (e) { fail("answering", e); delete busy[id]; });
  }

  /* The buyer sees what their agent changed on this device, and can put it back. */
  function remember(before, line) {
    if (agent.isAgentDevice()) return;
    if (!undoBefore) undoBefore = before;
    undoLines.push(line); if (undoLines.length > 3) undoLines.shift();
    dd.ui.notice("agent-undo", "Your AI agent made a change: " + undoLines.join(" · "), "info", [
      { label: "Undo", onClick: function () {
          var b = undoBefore; undoBefore = null; undoLines = []; dd.ui.clearNotice("agent-undo");
          try { if (dd.replaceData(JSON.parse(b), { source: "agent-undo" })) dd.ui.toast("Put back the way it was."); } catch (e) { dd.errors.record("agent.undo", e); }
        } },
      { label: "OK", primary: true, onClick: function () { undoBefore = null; undoLines = []; dd.ui.clearNotice("agent-undo"); } }
    ]);
  }

  /* The Yes / No question for a big change, on the buyer's own device only. */
  function ask(id, item) {
    if (asked[id]) return;
    var t = findTool(item.tool); if (!t) return;
    asked[id] = 1;
    dd.ui.notice("agentask-" + id, "Your AI agent asks: " + (item.question || "Do you want to go ahead?"), "warn", [
      { label: t.yesLabel || "Yes, do it", primary: true, onClick: function () { answer(id, true); } },
      { label: "No, leave it", onClick: function () { answer(id, false); } }
    ]);
  }
  function answer(id, yes) {
    if (busy[id]) return;
    busy[id] = 1; dd.ui.clearNotice("agentask-" + id); delete asked[id];
    claim(id, true).then(function (ok) {
      if (!ok) { delete busy[id]; dd.ui.toast("That was already answered on another device."); return; }
      var item = (lastAgent && lastAgent.inbox && lastAgent.inbox[id]) || {}, t = findTool(item.tool);
      if (!yes || !t) return finish(id, { ok: false, declined: true, tool: item.tool, message: "The person tapped No, so nothing was changed." }).then(function () { dd.ui.toast("Okay, nothing was changed."); });
      var args = item.args && typeof item.args === "object" ? item.args : {};
      return run(id, t, args);
    });
  }

  /* Results older than a week are cleared away (one small write, any device). */
  function prune(done) {
    if (!done || typeof done !== "object") return;
    var h = dd.sync.handle(); if (!h) return;
    var cut = Date.now() - DONE_KEEP_MS, u = {}, n = 0;
    Object.keys(done).forEach(function (id) { var r = done[id]; if (r && typeof r.at === "number" && r.at < cut && n < 50) { u["done/" + id] = null; n++; } });
    if (n) h.fb.D.update(h.fb.D.ref(h.db, h.path + "/agent"), u).catch(function () {});
  }

  function fail(where, e) {
    diag.error = new Date().toLocaleTimeString() + " · " + where + " · " + dd.errors.scrub(String((e && (e.code || e.message)) || e)).slice(0, 160);
    dd.errors.record("agent " + where, e);
  }

  /* ---------- the instructions the buyer pastes into their agent ---------- */
  agent.brief = function () {
    var cfg = dd.sync.config(), led = dd.sync.ledger();
    if (!cfg || !led) return "";
    var base = String(cfg.databaseURL).replace(/\/+$/, "") + "/sync/" + program.id + "/" + led + "/agent";
    var L = label(), lines = [];
    lines.push('You can use my "' + program.name + '" app for me. It is a DigiDoughnut program that keeps my ' + L + '.');
    if (program.knowledge) lines.push("About it: " + program.knowledge);
    lines.push("", "It is reached through my own private Firebase Realtime Database, using its REST API.",
      "", "1. SIGN IN (do this once, then keep the refresh token):",
      "   POST https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + cfg.apiKey,
      '   Body (JSON): {"returnSecureToken": true}',
      '   Use "idToken" from the answer as TOKEN below. It lasts 1 hour. To get a new one:',
      "   POST https://securetoken.googleapis.com/v1/token?key=" + cfg.apiKey,
      "   Body (form): grant_type=refresh_token&refresh_token=<your refreshToken>   (use \"id_token\" from the answer)",
      "", "   BASE = " + base,
      "   Add ?auth=TOKEN to every address below.",
      "", "2. READ MY " + L.toUpperCase() + ":",
      "   GET BASE/view.json?auth=TOKEN",
      '   "summary" is plain text. "data" is all my data as JSON text. "tools" lists the actions as JSON text.',
      '   "updatedAt" is when it last changed (milliseconds). If "example" is true, I haven\'t started my own data yet.',
      "", "3. MAKE A CHANGE (one instruction per change):",
      "   POST BASE/inbox.json?auth=TOKEN",
      '   Body (JSON): {"tool": "<action name>", "args": { <inputs> }, "at": {".sv": "timestamp"}}',
      '   The answer {"name": "<id>"} is your instruction\'s id.',
      "   The app carries it out the next time it is open on any of my devices, so it may not happen straight away.",
      "   To make it happen now, open this link in your web browser and leave it open for about 15 seconds:",
      "   " + agent.link(),
      "", "4. CHECK THE RESULT:",
      "   GET BASE/done/<id>.json?auth=TOKEN",
      "   - null: not done yet (the app isn't open anywhere). Tell me it will happen when I next open the app.",
      '   - "ok": true: done; "message" says what changed.',
      '   - "ok": false: not done; "message" says why.',
      '   - "waiting": true: a big change. It waits until I tap Yes on my own device. Tell me to do that.',
      "", "ACTIONS:");
    toolList().forEach(function (t) {
      var ins = Object.keys(t.inputs).map(function (k) { var i = t.inputs[k]; return k + " (" + (i.type === "string" ? "text" : i.type) + (i.required ? ", required" : ", optional") + ")" + (i.description ? ": " + i.description : ""); });
      lines.push("- " + t.name + ": " + t.description + (t.needsYes ? " (Big change: waits for my Yes.)" : ""),
                 "    args: " + (ins.length ? ins.join("; ") : "none, send {}"));
    });
    lines.push("", "RULES:",
      "- Read the view before changing things, and never make up items or numbers.",
      "- Only use the addresses above. Don't change anything else in the database.",
      "- Keep these instructions private: anyone who has them can read and change my " + L + ".");
    return lines.join("\n");
  };

  /* ---------- the sheet behind setup step 5 ---------- */
  agent.openSheet = function () {
    if (!(dd.sync.isOn() && dd.sync.config())) {
      var s0 = dd.ui.sheet('<h2>Connect your AI agent</h2><p>Your agent reaches ' + esc(program.name) + ' through live sync, so turn that on first (setup step 4).</p>' +
        '<div class="dd-btnrow"><button class="dd-btn" data-sync>Set up live sync</button><button class="dd-btn ghost" data-close>Close</button></div>');
      s0.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
      s0.querySelector("[data-sync]").addEventListener("click", function () { dd.ui.closeSheet(); dd.setup.open("sync"); });
      return;
    }
    var L = label(), conn = agent.connected();
    var sh = dd.ui.sheet('<h2>Connect your AI agent</h2>' +
      '<p>Your own AI agent, like Muse, can read your ' + esc(L) + ' and make changes for you. It goes through your own Firebase database: DigiDoughnut never sees any of it.</p>' +
      '<ol class="dd-home-steps"><li>Tap <b>Copy instructions for my agent</b>.</li><li>Paste them into a chat with your agent, then ask for what you want, for example <i>"Add bread to my list."</i></li></ol>' +
      '<p class="dd-status show warn"><b>Keep the instructions private.</b> Anyone who has them can read and change your ' + esc(L) + '. ' +
        'To cut your agent off at any time, tap <b>Disconnect my agent</b>: your ' + esc(L) + ' moves to a new private address, and your other devices need one more scan with Send to my phone.</p>' +
      '<p class="dd-note">Changes your agent asks for happen the next time ' + esc(program.name) + ' is open on any of your devices, or straight away if your agent opens its link. ' +
        'Big changes, like clearing everything, wait until you tap Yes on your own device. Whatever your agent reads also goes to the company that runs it (for Muse, that\'s Meta).</p>' +
      '<div class="dd-btnrow"><button class="dd-btn" data-copy>📋 Copy instructions for my agent</button>' +
        (conn ? '<button class="dd-btn ghost" data-off>Disconnect my agent</button>' : "") +
        '<button class="dd-btn ghost" data-close>Close</button></div>' +
      '<details class="dd-wiz-more"><summary>See the instructions</summary><pre id="dd-agent-brief"></pre></details>');
    var brief = agent.brief();
    sh.querySelector("#dd-agent-brief").textContent = brief;
    sh.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
    sh.querySelector("[data-copy]").addEventListener("click", function (e) {
      var b = e.currentTarget;
      copy(brief, sh.querySelector("#dd-agent-brief")).then(function (ok) {
        dd.store.setJSON(key("agent"), { madeAt: new Date().toISOString() });
        diag.made = new Date().toLocaleTimeString();
        b.textContent = ok ? "✓ Copied. Paste it into your agent." : "Select the instructions below and copy them";
        if (!ok) sh.querySelector("details").open = true;
        if (dd.setup) dd.setup.paint();
      });
    });
    var off = sh.querySelector("[data-off]");
    if (off) off.addEventListener("click", function () { agent.disconnect(); });
  };
  function copy(text, pre) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    return Promise.resolve(fallback());
    function fallback() {
      try { var r = document.createRange(); r.selectNodeContents(pre); var s = getSelection(); s.removeAllRanges(); s.addRange(r); return document.execCommand("copy"); } catch (e) { return false; }
    }
  }

  agent.disconnect = function () {
    var L = label();
    return dd.ui.confirm("Disconnect your AI agent?",
      "Your " + L + " moves to a new private address that your agent doesn't know. Everything here is kept. Your other devices stop syncing until you scan Send to my phone on them once more.",
      "Yes, disconnect", "No, keep it connected", true).then(function (yes) {
      if (!yes) return false;
      return dd.sync.newAddress().then(function (r) {
        if (!r.ok) { dd.ui.toast(r.title, 5000); return false; }
        dd.store.remove(key("agent"));
        if (dd.setup) dd.setup.paint();
        dd.ui.toast("Disconnected. Your agent can't reach your " + L + " any more.", 4500);
        if (dd.pair && !dd.env.isPhone) setTimeout(dd.pair.open, 400);
        return true;
      });
    });
  };

  /* ---------- start ---------- */
  agent.attach = function (p) {
    program = p;
    if (!agent.available()) return;
    dd.on("sync:changed", function (ev) { if (ev && ev.on && !ev.problem) listen(); else unlisten(); });
    dd.on("change", function () { if (unsub) scheduleView(); });
    deviceNotice();
  };

  if (dd.diag) dd.diag.addSection("AI agent", function () {
    if (!program || !agent.available()) return ["Not available in this program."];
    return ["Instructions copied: " + (agent.connected() ? "yes (" + (dd.store.getJSON(key("agent")) || {}).madeAt + ")" : "no") +
              " · this is the agent's browser: " + (agent.isAgentDevice() ? "yes" : "no") + " · agent link this visit: " + diag.link + " · listening: " + (unsub ? "yes" : "no"),
            "Instructions done: " + diag.ran + " · not done: " + diag.refused + " · waiting for Yes: " + diag.waiting + " · last: " + diag.last + " · view updates sent: " + diag.views,
            "Last agent problem: " + diag.error];
  });
})();
