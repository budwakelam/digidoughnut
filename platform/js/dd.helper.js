/* ===== DigiDoughnut Platform · dd.helper — the AI helper with hands ("Penny") =====
   Phase 4 (Oran, 2026-10-07):
   - Every program gets a helper that can change the program for the buyer (its tools), not
     just talk. Default name "Penny"; each program can rename her (DD_PROGRAM.helper.name).
   - WHERE she sits is the program's choice, separately for computers and phones:
       "side"    a column docked to the right of the page, always open (computers)
       "inline"  a card on the page itself, at DD_PROGRAM.helper.slot (or under the setup card)
       "bubble"  a labelled button in the corner that opens a panel
       "none"    no chat window (the program can still use dd.helper.ask from its own buttons)
     DD_PROGRAM.helper.place = "inline" or { computer: "side", phone: "inline" } (the default).
   - Undo: one tap under a reply puts back everything that reply changed.
   - Big changes (a tool marked `confirm`) aren't done straight away: a Yes / No question
     appears under the reply, and only the buyer's tap does it.
   - The chat is kept on this device (last 40 messages) with "New chat" to clear it. It is never
     put in the phone QR and never synced.
   - No code yet: the window explains in one line and opens "Turn on the helper"; when that's
     done the buyer is back here with whatever they had typed still in the box.
   - Try again after any failure; Stop while she's working.

   Program contract (all optional):
     helper:  false | { name, face, role, greeting, place, slot }
     tools:   [{ name, description, params, run(args, ctx) -> {ok, message},
                 confirm: true | "question" | function(args, ctx) -> "question" | null,
                 yesLabel }]
     summarizeForAI(ctx) -> text describing the current data (sent each turn)
     knowledge: text about the program (what it does, what the buttons mean)
     suggestions: example questions shown as chips in an empty chat */
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  var helper = dd.helper = {};
  var program = null, cfg = null;
  var MAX_MSGS = 40, MAX_UNDO = 5, HISTORY_MSGS = 16, WIDE = "(min-width: 960px)";
  var msgs = [], undos = {}, busy = false, lastTurn = null, root = null, mode = null, mq = null;
  var esc = function (s) { return dd.ui.esc(s); };

  helper.SUMMARY_MAX = 12000;   // characters of summarizeForAI sent per message
  helper.name = function () { return (cfg && cfg.name) || "Penny"; };
  helper.enabled = function () { return !!cfg; };

  /* ---------- saved chat ---------- */
  function chatKey() { return dd.store.programKey(program.id, "chat"); }
  function undoKey() { return dd.store.programKey(program.id, "undo"); }
  function load() {
    var c = dd.store.getJSON(chatKey());
    msgs = c && Array.isArray(c.msgs) ? c.msgs.filter(function (m) { return m && typeof m.text === "string"; }) : [];
    // A Yes/No question from an earlier visit is never left waiting for a stray tap.
    msgs.forEach(function (m) { if (m.pending && m.pending.state === "waiting") m.pending.state = "expired"; });
    var u = dd.store.getJSON(undoKey());
    undos = u && typeof u === "object" ? u : {};
  }
  function save() {
    if (msgs.length > MAX_MSGS) msgs = msgs.slice(-MAX_MSGS);
    var ids = Object.keys(undos);
    if (ids.length > MAX_UNDO) ids.slice(0, ids.length - MAX_UNDO).forEach(function (id) { delete undos[id]; });
    msgs.forEach(function (m) { if (m.undo && !undos[m.id]) m.undo = false; });
    dd.store.setJSON(chatKey(), { v: 1, msgs: msgs });
    dd.store.setJSON(undoKey(), undos);
  }
  helper.clear = function () { msgs = []; undos = {}; save(); paint(); };
  helper.messages = function () { return msgs.slice(); };

  /* ---------- where the window goes ---------- */
  function placeFor(wide) {
    var p = cfg.place;
    if (typeof p === "string") return p === "side" && !wide ? "inline" : p;
    p = p || {};
    var m = (wide ? p.computer : p.phone) || (wide ? "side" : "inline");
    return m === "side" && !wide ? "inline" : m;   // a narrow screen has no room for a column
  }
  function place() {
    var wide = mq ? mq.matches : true;
    var want = placeFor(wide);
    if (want === mode && root && document.body.contains(root)) return;
    mode = want;
    document.body.classList.remove("dd-has-side");
    var old = document.getElementById("dd-helper-home"); if (old) old.remove();
    var fab = document.getElementById("dd-helper-fab"); if (fab) fab.remove();
    if (mode === "none") { root = null; return; }
    var home = document.createElement(mode === "inline" ? "div" : "aside");
    home.id = "dd-helper-home";
    home.className = "dd-helper-home dd-helper-" + mode;
    if (mode === "inline") {
      var slot = cfg.slot && document.getElementById(cfg.slot);
      if (slot) slot.appendChild(home);
      else { var setupBox = document.getElementById("dd-setup"); setupBox.parentNode.insertBefore(home, setupBox.nextSibling); }
    } else {
      document.body.appendChild(home);
      if (mode === "side") document.body.classList.add("dd-has-side");
      if (mode === "bubble") {
        fab = document.createElement("button");
        fab.id = "dd-helper-fab"; fab.className = "dd-helper-fab";
        fab.innerHTML = '<span aria-hidden="true">' + esc(cfg.face) + '</span> Ask ' + esc(helper.name());
        fab.addEventListener("click", function () { helper.open(); });
        document.body.appendChild(fab);
      }
    }
    root = home;
    if (dd.files) dd.files.dropZone(home, function (f) { if (dd.files.enabled()) helper.addFile(f); });
    paint();
  }
  helper.mode = function () { return mode; };
  /* Bring the window into view (bubble: open it) and put the cursor in the box. */
  helper.open = function () {
    if (!root) return;
    if (mode === "bubble") { root.classList.add("open"); var f = document.getElementById("dd-helper-fab"); if (f) f.hidden = true; }
    if (mode === "inline") try { root.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {}
    var i = root.querySelector(".dd-helper-in"); if (i && !dd.env.isPhone) i.focus();
  };
  function closeBubble() { if (!root) return; root.classList.remove("open"); var f = document.getElementById("dd-helper-fab"); if (f) f.hidden = false; }

  /* ---------- drawing ---------- */
  function paint() {
    if (!root) return;
    var name = helper.name(), live = dd.ai && dd.ai.hasCode();
    var keep = root.querySelector(".dd-helper-in"), typed = keep ? keep.value : "";
    root.innerHTML =
      '<div class="dd-helper-head"><span class="dd-helper-face" aria-hidden="true">' + esc(cfg.face) + '</span>' +
        '<div class="dd-helper-who"><b>' + esc(name) + '</b><span>' + esc(cfg.role) + '</span></div>' +
        (msgs.length ? '<button class="dd-linkbtn dd-helper-new" data-new>New chat</button>' : "") +
        (mode === "bubble" ? '<button class="dd-linkbtn" data-hide aria-label="Hide the chat">Hide</button>' : "") + '</div>' +
      '<div class="dd-helper-msgs" role="log" aria-live="polite"></div>' +
      agentAsks() +
      (live ? "" : '<div class="dd-helper-need"><p><b>' + esc(name) + ' needs a free access code from Google first.</b> It\'s free and takes about 2 minutes.</p>' +
        '<button class="dd-btn dd-helper-turnon" data-turnon>Turn on ' + esc(name) + '</button></div>') +
      (live && !msgs.length && program.suggestions && program.suggestions.length ? '<div class="dd-helper-chips">' +
        program.suggestions.slice(0, 4).map(function (t) { return '<button class="dd-helper-chip">' + esc(t) + '</button>'; }).join("") + '</div>' : "") +
      '<div class="dd-helper-row"><input class="dd-input dd-helper-in" placeholder="' + esc(live ? "Tell " + name + " what to do…" : "Type your question…") +
        '" autocomplete="off" aria-label="Message for ' + esc(name) + '">' +
        (dd.files && dd.files.enabled() ? '<button class="dd-btn ghost dd-helper-clip" data-clip aria-label="Add ' + esc(dd.files.label()) + '" title="Add ' + esc(dd.files.label()) + '">📎</button>' : "") +
        '<button class="dd-btn dd-helper-send" data-send>' + (busy ? "Stop" : "Send") + '</button></div>';
    var box = root.querySelector(".dd-helper-msgs");
    if (!msgs.length) bubble(box, { who: "bot", text: cfg.greeting });
    msgs.forEach(function (m) { bubble(box, m); });
    if (busy) bubble(box, { who: "bot pending", text: busyText });
    box.scrollTop = box.scrollHeight;
    var input = root.querySelector(".dd-helper-in");
    input.value = typed;
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !busy) helper.ask(); });
    root.querySelector("[data-send]").addEventListener("click", function () { if (busy) dd.ai.stop(); else helper.ask(); });
    root.querySelectorAll("[data-agentyes],[data-agentno]").forEach(function (b) {
      b.addEventListener("click", function () { dd.agent.answer(b.getAttribute("data-agentyes") || b.getAttribute("data-agentno"), b.hasAttribute("data-agentyes")); });
    });
    var cb = root.querySelector("[data-clip]"); if (cb) cb.addEventListener("click", function () { if (!busy) dd.files.pick().then(function (f) { if (f) helper.addFile(f); }); });
    var nb = root.querySelector("[data-new]"); if (nb) nb.addEventListener("click", newChat);
    var hb = root.querySelector("[data-hide]"); if (hb) hb.addEventListener("click", closeBubble);
    var tb = root.querySelector("[data-turnon]"); if (tb) tb.addEventListener("click", function () { helper.need(); });
    root.querySelectorAll(".dd-helper-chip").forEach(function (c) { c.addEventListener("click", function () { helper.ask(c.textContent); }); });
  }

  function bubble(box, m) {
    var el = document.createElement("div");
    el.className = "dd-helper-msg " + m.who;
    var t = document.createElement("div"); t.className = "dd-helper-text"; t.textContent = m.text; el.appendChild(t);
    if (m.help) { var h = document.createElement("div"); h.className = "dd-helper-help"; h.textContent = m.help; el.appendChild(h); }
    var row = document.createElement("div"); row.className = "dd-helper-acts";
    function btn(label, cls, fn) { var b = document.createElement("button"); b.className = "dd-btn small " + (cls || "ghost"); b.textContent = label; b.addEventListener("click", fn); row.appendChild(b); return b; }
    if (m.pending) {
      var p = m.pending;
      if (p.state === "waiting") {
        var q = document.createElement("div"); q.className = "dd-helper-ask"; q.textContent = p.question; el.appendChild(q);
        btn(p.yes || "Yes, do it", "danger", function () { answerPending(m, true); });
        btn("No, leave it", "ghost", function () { answerPending(m, false); });
      } else if (p.state === "expired") {
        var x = document.createElement("div"); x.className = "dd-helper-note"; x.textContent = "(That question has expired. Ask again if you still want it.)"; el.appendChild(x);
      }
    }
    if (m.undo && undos[m.id]) btn("↩ Undo", "ghost dd-helper-undo", function () { undo(m); });
    if (m.undone) { var u = document.createElement("div"); u.className = "dd-helper-note"; u.textContent = "Undone."; el.appendChild(u); }
    if (m.retry) btn("Try again", "", function () { retry(m); });
    if (m.fix) btn("Fix my access code", "ghost", function () { dd.setup.open("ai"); });
    if (row.childNodes.length) el.appendChild(row);
    box.appendChild(el);
    return el;
  }

  var busyText = "";
  function setBusy(on, text) {
    busy = on; busyText = text || "";
    if (!root) return;
    var pend = root.querySelector(".dd-helper-msg.pending");
    if (on && pend) { pend.firstChild.textContent = busyText; return; }
    paint();
  }

  function newChat() {
    if (busy) return;
    msgs = []; undos = {}; save(); paint();
    dd.ui.toast("Started a new chat.");
  }

  /* ---------- no code yet ---------- */
  var waitingForCode = false;
  helper.need = function (why) {
    waitingForCode = true;
    if (dd.setup) dd.setup.needAI(why || "To help you, " + helper.name() + " needs a free access code from Google.");
  };

  /* ---------- one conversation turn ---------- */
  function add(m) { m.id = m.id || dd.ui.uid("m"); m.at = Date.now(); msgs.push(m); save(); return m; }
  function snapshot() { return JSON.stringify(dd.getData()); }

  /* What the AI sees of the conversation so far: plain words only, oldest first. */
  function history() {
    var out = [];
    msgs.slice(-HISTORY_MSGS).forEach(function (m) {
      var role = m.who === "me" ? "user" : m.who === "note" ? "user" : m.who === "bot" ? "model" : null;
      if (!role || !m.text) return;
      var text = m.who === "note" ? "[" + m.text + "]" : m.text;
      var last = out[out.length - 1];
      if (last && last.role === role) last.text += "\n" + text; else out.push({ role: role, text: text });
    });
    while (out.length && out[0].role !== "user") out.shift();
    return out;
  }

  /* The buyer's AI agent (dd.agent) may be waiting for a Yes / No on a big change. Show it right
     here too (Oran, 2026-10-07: "I was confused at why Penny wasn't working"), and say plainly
     that it doesn't stop Penny. */
  function waitingAsks() { return dd.agent && dd.agent.waiting && !dd.agent.isAgentDevice() ? dd.agent.waiting() : []; }
  function agentAsks() {
    var w = waitingAsks(); if (!w.length) return "";
    return '<div class="dd-helper-need dd-helper-agentask"><p><b>Your AI agent is waiting for your answer' + (w.length > 1 ? " (" + w.length + ")" : "") + ':</b></p>' +
      w.slice(0, 2).map(function (a) {
        return '<p>' + esc(a.question) + '</p><div class="dd-helper-acts"><button class="dd-btn small danger" data-agentyes="' + esc(a.id) + '">' + esc(a.yes) + '</button>' +
          '<button class="dd-btn small ghost" data-agentno="' + esc(a.id) + '">No, leave it</button></div>';
      }).join("") +
      '<p class="dd-helper-note">Nothing changes until you answer. ' + esc(helper.name()) + ' can still help with anything else meanwhile.</p></div>';
  }

  helper.systemPrompt = function () {
    var name = helper.name(), c = dd.ctx();
    var data = ""; try { data = program.summarizeForAI ? String(program.summarizeForAI(c) || "") : ""; } catch (e) { dd.errors.record("summarizeForAI", e); }
    // A big program's summary goes with every message and eats the free daily share: cap it.
    if (data.length > helper.SUMMARY_MAX) { dd.errors.record("helper", "summary cut from " + data.length + " characters"); data = data.slice(0, helper.SUMMARY_MAX) + "\n(The rest was cut short to keep messages small. Say so if the person asks about something not shown.)"; }
    return "You are " + name + ", the friendly helper inside " + program.name + ", a one-page program made by DigiDoughnut. " +
      "The person using it is not technical. " + (program.knowledge ? "About the program: " + program.knowledge + " " : "") +
      ((program.tools || []).length ? "You have tools that change the program directly. When the person asks you to add, change, tick, remove or clear something, " +
        "USE THE TOOLS: never describe button steps instead, and never say you can't click buttons. Call a tool once for each thing to change. " +
        "After changing something, confirm it in one short sentence. Every change you make can be undone with the Undo button under your reply, so don't ask permission for small changes. " +
        "If a tool says the person must confirm first, tell them in one sentence to tap Yes under your reply. If what they want is unclear, ask one short question first. " : "") +
      "Answer in plain everyday words, 1 to 3 short sentences unless they ask for more. Say 'free access code', never 'API key'. Never show code, JSON or error text. " +
      "Use only the real data below; never make up items or numbers. Don't give tax, legal or medical advice beyond suggesting a professional. " +
      (dd.isExample() ? "Right now the program is showing EXAMPLE data, not theirs. " : "") +
      (waitingAsks().length ? "The person's own AI agent (a separate assistant, like Muse) asked for a big change that is WAITING for their answer: " +
        waitingAsks().map(function (a) { return '"' + a.question + '"'; }).join(" and ") + ". You can't answer it for them. If it comes up, tell them to tap Yes or No in the box at the top of this chat. " +
        "It does not stop you: carry on with what they ask. " : "") +
      "\n\nCurrent data in the program:\n" + (data || "(nothing yet)");
  };

  /* Send a message (from the box, a chip, or a program button: dd.helper.ask("…")). */
  helper.ask = function (text) {
    if (busy) return Promise.resolve(null);
    var input = root && root.querySelector(".dd-helper-in");
    text = String(text != null ? text : (input ? input.value : "")).trim();
    if (!text) { if (input) input.focus(); return Promise.resolve(null); }
    if (!(dd.ai && dd.ai.hasCode())) {
      if (input) input.value = text;   // kept, so it's still there when they come back
      helper.need();
      return Promise.resolve(null);
    }
    if (input) input.value = "";
    if (mode === "bubble") helper.open();
    add({ who: "me", text: text.slice(0, 2000) });
    return turn(text);
  };

  var STATUS = { thinking: " is thinking…", working: " is working on it…", retrying: " is still working: trying again…" };
  function turn(text) {
    var name = helper.name(), before = snapshot(), wasExample = dd.isExample(), pendings = [], started = Date.now();
    setBusy(true, name + STATUS.thinking);
    var hist = history();
    var tools = (program.tools || []).map(function (t) {
      return { name: t.name, description: t.description, params: t.params, run: function (args) {
        var q = null;
        try { q = typeof t.confirm === "function" ? t.confirm(args, dd.ctx()) : t.confirm; } catch (e) { dd.errors.record("confirm:" + t.name, e); }
        if (q) {
          pendings.push({ tool: t.name, args: args, question: typeof q === "string" ? q : "Are you sure?", yes: t.yesLabel, state: "waiting" });
          return { ok: false, waiting: true, message: "Not done yet: this is a big change, so a Yes / No question is now shown under your reply. Tell the person to tap Yes if they want it." };
        }
        return t.run(args, dd.ctx());
      } };
    });
    return dd.ai.chat({
      system: helper.systemPrompt(), history: hist, tools: tools,
      onStatus: function (s) { setBusy(true, name + (STATUS[s] || STATUS.thinking)); }
    }).then(function (r) {
      var after = snapshot(), changed = after !== before;
      lastTurn = { at: new Date().toLocaleTimeString(), secs: ((Date.now() - started) / 1000).toFixed(1), ok: !!r.ok, model: r.model || (r.tried || []).join(">") || "-",
                   tools: (r.calls || []).map(function (c) { return c.name; }).join(", ") || "none", changed: changed, type: r.type || "" };
      var m;
      if (r.ok) m = { who: "bot", text: r.text || (changed ? "Done." : pendings.length ? "Please confirm below." : "Sorry, I lost my train of thought. Could you ask me again?") };
      else if (r.stopped) m = { who: "bot", text: "Okay, I stopped." };
      else {
        m = { who: "bot err", text: r.title, help: r.help };
        if (r.type !== "bad_code" && r.type !== "not_allowed" && r.type !== "host_blocked") m.retry = text;
        if (r.type === "bad_code" || r.type === "not_allowed") m.fix = true;
      }
      if (changed) { m.undo = true; m.id = dd.ui.uid("m"); undos[m.id] = { before: before, after: after, example: wasExample }; }
      if (pendings.length) m.pending = pendings[0];   // one question at a time
      add(m);
      setBusy(false);
      return m;
    });
  }

  function retry(m) {
    if (busy) return;
    msgs = msgs.filter(function (x) { return x !== m; });
    save();
    return turn(m.retry);
  }

  /* ---------- a file handed to the helper (📎 or dropped on the chat) ----------
     The program reads it (dd.files); the result shows as her reply, with Undo. If she's switched
     on, she then says what stands out, so the buyer gets the answer without asking. */
  helper.addFile = function (file) {
    if (busy || !dd.files) return Promise.resolve(null);
    add({ who: "me", text: "📎 " + String(file.name || "a file").slice(0, 80) });
    setBusy(true, helper.name() + " is reading the file…");
    return dd.files.take(file).then(function (r) {
      var m = { who: r.ok ? "bot" : "bot err", text: r.message || (r.ok ? "Done." : "That file didn't work.") };
      if (r.ok && r.before !== r.after) { m.id = dd.ui.uid("m"); m.undo = true; undos[m.id] = { before: r.before, after: r.after, example: r.example }; }
      add(m); setBusy(false);
      if (r.ok && r.before !== r.after && dd.ai && dd.ai.hasCode()) {
        add({ who: "note", text: "The person just added " + dd.files.label() + ": " + m.text });
        add({ who: "me", text: "What stands out?" });
        return turn("What stands out?");
      }
      return m;
    });
  };

  /* ---------- Yes / No for big changes ---------- */
  function answerPending(m, yes) {
    var p = m.pending; if (!p || p.state !== "waiting") return;
    p.state = yes ? "yes" : "no";
    if (!yes) { add({ who: "note", text: "The person tapped No, so nothing was changed." }); paint(); return; }
    var tool = (program.tools || []).filter(function (t) { return t.name === p.tool; })[0];
    var before = snapshot(), wasExample = dd.isExample(), res;
    try { res = tool ? tool.run(p.args || {}, dd.ctx()) : { ok: false, message: "That can't be done any more." }; }
    catch (e) { dd.errors.record("tool:" + p.tool, e); res = { ok: false, message: "That didn't work." }; }
    var done = function (out) {
      var after = snapshot(), r = { who: "bot", text: (out && out.message) || (out && out.ok ? "Done." : "That didn't work.") };
      if (after !== before) { r.id = dd.ui.uid("m"); r.undo = true; undos[r.id] = { before: before, after: after, example: wasExample }; }
      add(r); paint();
    };
    if (res && typeof res.then === "function") res.then(done, function () { done({ ok: false }); }); else done(res);
  }

  /* ---------- Undo ---------- */
  function undo(m) {
    var u = undos[m.id]; if (!u || busy) return;
    var go = function () {
      var before; try { before = JSON.parse(u.before); } catch (e) { before = null; }
      if (!before || !dd.replaceData(before, { source: "helper-undo", example: !!u.example })) { dd.ui.toast("Sorry, that can't be undone any more."); return; }
      delete undos[m.id]; m.undo = false; m.undone = true;
      add({ who: "note", text: "The person tapped Undo, so that change was reversed." });
      paint();
      dd.ui.toast("Undone. It's back the way it was.");
    };
    if (snapshot() === u.after) return go();
    dd.ui.confirm("Undo " + helper.name() + "'s change?",
      "Things have changed since then. Undo puts everything back exactly as it was before " + helper.name() + "'s change, so your newer changes go too.",
      "Yes, undo it", "No, keep things as they are").then(function (yes) { if (yes) go(); });
  }

  /* ---------- start ---------- */
  helper.start = function (p) {
    program = p;
    var h = p.helper;
    if (h === false) { cfg = null; return; }
    h = h || {};
    var name = h.name || "Penny";
    cfg = {
      name: name, face: h.face || "🪙", role: h.role || "your helper",
      greeting: h.greeting || ("Hi, I'm " + name + "! I can make changes for you or answer questions about " + p.name + ". Just tell me what you need."),
      place: h.place, slot: h.slot
    };
    load();
    if (window.matchMedia) { mq = window.matchMedia(WIDE); var onChange = function () { place(); }; if (mq.addEventListener) mq.addEventListener("change", onChange); else if (mq.addListener) mq.addListener(onChange); }
    place();
    dd.on("agent:asks", function () { paint(); });
    dd.on("ai:changed", function (ev) {
      paint();
      if (ev && ev.connected && waitingForCode) { waitingForCode = false; setTimeout(helper.open, 300); }
    });
    // Data changed by something else (sync, restore): nothing to redraw in the chat itself.
  };

  // The helper is part of the app, so it sits with the program's own menu items.
  if (dd.menu) dd.menu.add({ id: "helper", icon: "💬", group: "app", order: 50,
    get label() { return "Ask " + helper.name(); },
    show: function () { return helper.enabled(); }, note: function () { return "Your AI helper"; },
    run: function () { helper.open(); } });

  if (dd.diag) dd.diag.addSection("Helper", function () {
    if (!cfg) return ["No helper in this program."];
    var n = Object.keys(undos).length;
    return [helper.name() + " · window: " + (mode || "-") + " · messages saved: " + msgs.length + " · undo steps kept: " + n + " · tools: " + ((program.tools || []).map(function (t) { return t.name; }).join(", ") || "none"),
            "Last turn: " + (lastTurn ? lastTurn.at + " · " + lastTurn.secs + " s · " + (lastTurn.ok ? "answered" : "failed " + lastTurn.type) + " · model " + lastTurn.model + " · tools used: " + lastTurn.tools + (lastTurn.changed ? " · changed data" : "") : "none this visit")];
  });
})();
