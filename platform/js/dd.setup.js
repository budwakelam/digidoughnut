/* ===== DigiDoughnut Platform · dd.setup — the Setup Center and its wizards =====
   Spec 3.8 (Oran, 2026-10-06/07):
   - One checklist card, four steps, green ticks; identical in every program.
   - Popup wizards: one action per screen, progress, big buttons, checkmarks. Every Google/tiiny
     button label quoted exactly (labels can be corrected through the noticeboard). Every
     "you can ignore this" said out loud. "Start over" on every screen. Dismissible and resumable.
   - Two layers of help inside a wizard: before the access code works, a SCRIPTED guide answers
     the predictable questions by keyword (offline, free, and it never pretends to be the AI).
     Once the code works, the live AI answers inside the same wizard.
   Wizard screens are DATA (see dd.setup.wizards below): copy lives in one place Oran can edit. */
(function () {
  "use strict";
  var dd = window.dd = window.dd || {};
  var setup = dd.setup = {};
  var program = null;

  function stateKey() { return dd.store.programKey(program.id, "setup"); }
  function state() { return dd.store.getJSON(stateKey()) || { folded: false, wizards: {} }; }
  function saveState(s) { dd.store.setJSON(stateKey(), s); }
  var esc = function (s) { return dd.ui.esc(s); };
  var L = function (key, fallback) { return dd.notes ? dd.notes.label(key, fallback) : fallback; };
  var link = function (key, fallback) { return dd.notes ? dd.notes.link(key, fallback) : fallback; };

  /* ---------- the four steps ---------- */
  setup.steps = [
    { id: "try", icon: "✨", title: "Try it", gives: "Everything works right now, saved in this browser.", time: "Done",
      done: function () { return true; } },
    { id: "ai", icon: "🤖", title: "Turn on the helper", gives: "The AI helper and every smart feature.", time: "About 2 minutes",
      done: function () { return !!(dd.ai && dd.ai.hasCode()); }, wizard: "ai" },
    // Phase 7.2: "Where it lives". Done when opened from any web address; a file on this computer
    // gets the choice (the DigiDoughnut version, or the buyer's own copy).
    { id: "phone", icon: "🏠", title: "Where it lives", gives: "Put it online, so it works on your phone too.", time: "About 1 minute",
      // Always ticked: it lives somewhere. A file gets a small "limited" warning (Oran, 2026-10-08).
      done: function () { return true; }, wizard: "host",
      // Oran, 2026-10-07: the row just says where it lives now; "Change" opens the Where it lives screen.
      text: function () {
        var h = dd.move ? dd.move.here() : null;
        return { gives: "Now: " + (h ? h.title.charAt(0).toLowerCase() + h.title.slice(1) : dd.env.isHosted ? "online at " + location.host : "a file on this computer") + ".", time: "",
                 warn: dd.env.isFile ? "Limited: this computer only, not on your phone" : "" };
      } },
    { id: "sync", icon: "🔄", title: "Sync my devices", gives: "Changes on one device show up on the other, and a copy is kept safe in the cloud.", time: "About 10 minutes",
      done: function () { return !!(dd.sync && dd.sync.isOn && dd.sync.isOn()); }, wizard: "sync" },
    { id: "agent", icon: "🦾", title: "Connect your AI agent", gives: "Your own AI agent, like Muse, can read and change this program for you.", time: "About 2 minutes",
      done: function () { return !!(dd.agent && dd.agent.connected()); },
      shown: function () { return !!(dd.agent && dd.agent.available()); } }
  ];

  function inProgress(st, id) { return !!(st.wizards[id] || (id === "host" && (st.wizards.host_github || st.wizards.host_tiiny || st.wizards.host_other))); }
  function visibleSteps() { return setup.steps.filter(function (s) { return !s.shown || s.shown(); }); }
  setup.visibleSteps = visibleSteps;
  setup.doneCount = function () { return visibleSteps().filter(function (s) { return s.done(); }).length; };

  /* ---------- the card / chip ---------- */
  setup.paint = function () {
    var host = document.getElementById("dd-setup"); if (!host || !program) return;
    var st = state(), n = setup.doneCount(), total = visibleSteps().length;
    if (dd.menu) dd.menu.refreshDot();
    // Hidden for good (Oran, 2026-10-08): nothing on the page; Setup stays in Menu → Settings.
    if (st.hidden) { host.innerHTML = ""; return; }
    if (st.folded || n === total) {
      host.innerHTML = '<span class="dd-setup-chipwrap"><button class="dd-setup-chip" id="dd-setup-chip">' + (n === total ? "✓ All set up" : "Setup: " + n + " of " + total + " done") + '</button>' +
        '<button class="dd-setup-chip-x" id="dd-setup-hide" aria-label="Hide the setup reminder" title="Hide the setup reminder">✕</button></span>';
      document.getElementById("dd-setup-chip").addEventListener("click", function () { var s = state(); s.folded = false; saveState(s); setup.paint(); });
      document.getElementById("dd-setup-hide").addEventListener("click", setup.askHide);
      return;
    }
    host.innerHTML = '<div class="dd-card dd-setup-card"><h2>Set up ' + esc(program.name) + ' <span class="dd-setup-count">' + n + ' of ' + total + ' done</span></h2>' +
      '<p class="dd-note" style="margin:0 0 8px">Each step is optional. Do them in any order, any time.</p><ol class="dd-steps">' + stepRows() + '</ol>' +
      '<div class="dd-btnrow"><button class="dd-linkbtn" id="dd-setup-fold">Hide setup</button></div></div>';
    wireSteps(host);
    document.getElementById("dd-setup-fold").addEventListener("click", setup.askHide);
  };

  function stepRows() {
    var st = state(), syncOn = !!(dd.sync && dd.sync.isOn && dd.sync.isOn());
    return visibleSteps().map(function (s, i) {
      var done = s.done(), wiz = s.wizard && setup.wizards[s.wizard];
      var btn = s.id === "agent" ? (syncOn ? '<button class="' + (done ? 'dd-linkbtn' : 'dd-btn small') + '" data-agent>' + (done ? "Settings" : "Start") + '</button>'
                                           : '<span class="dd-note">Needs step 4 first</span>')
        : s.id === "phone" && dd.move ? '<button class="dd-btn small' + (done ? " ghost" : "") + '" data-start="host">Change</button>'
        : done && s.id === "sync" && dd.sync ? '<button class="dd-linkbtn" data-syncsheet>Settings</button>' : done
        ? (wiz && wiz.ready !== false && s.id !== "try" ? '<button class="dd-linkbtn" data-start="' + s.wizard + '">Change</button>' : "")
        : (wiz && wiz.ready !== false ? '<button class="dd-btn small" data-start="' + s.wizard + '">' + (inProgress(st, s.wizard) ? "Continue" : "Start") + '</button>'
                                      : '<span class="dd-note">Coming soon</span>');
      var text = s.text ? s.text(done) : null;   // a step may word itself by state (step 3, Phase 7.2)
      return '<li class="dd-step' + (done ? " done" : "") + '" data-step="' + s.id + '"><span class="dd-tick" aria-hidden="true">' + (done ? "✓" : i + 1) + '</span>' +
        '<div class="dd-step-text"><b><span class="dd-step-icon" aria-hidden="true">' + (s.icon || "") + '</span> ' + esc(text && text.title || s.title) + '</b><span>' +
        esc(text && text.gives || s.gives) + (done || (text && text.time === "") ? "" : " · " + esc(text && text.time || s.time)) +
        (text && text.warn ? ' <i class="dd-step-warn">⚠ ' + esc(text.warn) + '</i>' : "") + '</span></div>' + btn + '</li>';
    }).join("");
  }
  // Buttons inside the steps list work the same on the page card and in the menu's sheet.
  function wireSteps(box) {
    var on = function (sel, fn) { var b = box.querySelector(sel); if (b) b.addEventListener("click", fn); };
    on("[data-agent]", function () { dd.agent.openSheet(); });
    on("[data-syncsheet]", function () { dd.sync.openSheet(); });
    box.querySelectorAll("[data-start]").forEach(function (b) { b.addEventListener("click", function () { setup.open(b.dataset.start); }); });
  }

  /* "Hide setup reminder?" Asked first, so nobody loses it by accident. */
  setup.askHide = function () {
    return dd.ui.confirm("Hide the setup reminder?",
      "You can open it any time from the main menu: tap " + program.name + " at the top left, then ⚙️ Settings → Setup & connections.",
      "Hide it", "Keep it").then(function (yes) {
        if (!yes) return false;
        var s = state(); s.hidden = true; s.folded = true; saveState(s); setup.paint();
        dd.ui.toast("Hidden. Setup is in the menu, under Settings.", 3500);
        return true;
      });
  };
  setup.showReminder = function () { var s = state(); s.hidden = false; s.folded = false; saveState(s); setup.paint(); };

  /* The Setup Center as a sheet, from the program menu. Works even after "Hide this for now". */
  setup.openSheet = function () {
    if (!program && dd.getProgram) program = dd.getProgram();
    var st = state(), n = setup.doneCount(), total = visibleSteps().length;
    var sh = dd.ui.sheet('<h2>🧰 Setup &amp; connections <span class="dd-setup-count">' + n + ' of ' + total + ' done</span></h2>' +
      '<p class="dd-note" style="margin:0 0 8px">Each step is optional. Do them in any order, any time.</p>' +
      '<ol class="dd-steps">' + stepRows() + '</ol>' +
      '<div class="dd-btnrow">' + (st.hidden || (st.folded && n < total) ? '<button class="dd-linkbtn" data-unfold>Show the setup reminder on the page again</button>' : "") +
      '<button class="dd-btn ghost" data-close>Close</button></div>', { sticky: true });
    wireSteps(sh);
    sh.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
    var u = sh.querySelector("[data-unfold]");
    if (u) u.addEventListener("click", function () { dd.ui.closeSheet(); setup.showReminder(); });
    return sh;
  };

  /* Just-in-time: an AI feature was tapped with no code. Opens the helper wizard with context. */
  setup.needAI = function (why) {
    setup.open("ai", { context: (why || "To do that, the helper needs a free access code from Google.") + " It takes about 2 minutes." });
  };

  /* ---------- the wizard ---------- */
  var cur = null;   // {id, wiz, at, context}
  setup.open = function (id, opts) {
    if (!program && dd.getProgram) program = dd.getProgram();   // programs with no setup card can still open a wizard
    // "Put it on your phone" picks up inside whichever service the buyer already chose.
    if (id === "host") {
      var only = hostChoice();
      if (only) id = "host_" + only;
      // Oran, 2026-10-07: one clear screen with every place it can live, the current one highlighted.
      else if (dd.move) { dd.move.where(); return; }
      else { var hs = state(); if (hs.hostWith && hs.wizards["host_" + hs.hostWith]) id = "host_" + hs.hostWith; }
    }
    var wiz = setup.wizards[id]; if (!wiz || wiz.ready === false || !wiz.screens.length) return;
    var st = state(), at = (st.wizards[id] && st.wizards[id].at) || 0;
    if (at >= wiz.screens.length) at = 0;
    cur = { id: id, wiz: wiz, at: at, context: opts && opts.context, own: !!(opts && opts.own) };
    draw();
  };
  // Screen 1 isn't progress: only remember a place once the buyer has moved past it.
  // Any wizard that's been opened and not finished shows "Continue" (Oran, 2026-10-07).
  function remember() { var s = state(); s.wizards[cur.id] = { at: cur.at }; saveState(s); }
  function finish() { var s = state(); delete s.wizards[cur.id]; if (cur.wiz.parent) delete s.wizards[cur.wiz.parent]; saveState(s); }

  function draw() {
    var wiz = cur.wiz, sc = wiz.screens[cur.at], total = wiz.screens.length;
    remember();
    // A wizard reached from a chooser (wiz.parent) counts the chooser as its step 1.
    var parent = wiz.parent && !hostChoice() ? wiz.parent : null;
    var off = parent ? 1 : 0, shownAt = cur.at + off, shownTotal = total + off;
    var dots = Array.apply(null, Array(shownTotal)).map(function (_, i) { return '<i class="' + (i < shownAt ? "done" : i === shownAt ? "now" : "") + '"></i>'; }).join("");
    var canBack = cur.at > 0 || !!parent;
    var body = typeof sc.body === "function" ? sc.body() : sc.body;
    var html =
      '<div class="dd-wiz-main">' +
      '<button class="dd-wiz-x" data-later aria-label="Close. Your place is saved.">✕</button>' +
      '<div class="dd-wiz-top"><span class="dd-wiz-name"><span class="dd-wiz-icon" aria-hidden="true">' + wizIcon(cur.id) + '</span>' + esc(wiz.title.split(" · ")[0]) +
        (wiz.title.indexOf(" · ") > 0 ? ' <span class="dd-wiz-tag">' + esc(wiz.title.split(" · ")[1]) + '</span>' : "") + '</span>' +
        '<span class="dd-wiz-progress">' + (shownTotal > 1 ? 'Step ' + (shownAt + 1) + ' of ' + shownTotal : '') + '</span></div>' +
      '<div class="dd-wiz-dots">' + dots + '</div>' +
      (cur.context && cur.at === 0 ? '<p class="dd-status show info">' + esc(cur.context) + '</p>' : "") +
      '<h2>' + esc(typeof sc.title === "function" ? sc.title() : sc.title) + '</h2>' +
      (sc.pic ? setup.pic(typeof sc.pic === "function" ? sc.pic() : sc.pic) : "") +
      (sc.todo ? '<p class="dd-todo"><span aria-hidden="true">👉</span> <b>Your turn:</b> ' + (typeof sc.todo === "function" ? sc.todo() : esc(sc.todo)) + '</p>' : "") +
      '<div class="dd-wiz-body">' + body + '</div>' +
      (sc.action ? '<div class="dd-btnrow"><button class="dd-btn dd-wiz-big" data-action data-autofocus>' + esc(sc.action.label) + '</button></div>' : "") +
      '<div class="dd-status" id="dd-wiz-status"></div>' +
      '<div class="dd-wiz-nav">' +
        (canBack ? '<button class="dd-btn ghost" data-back>Back</button>' : "") +
        (sc.next !== false ? '<button class="dd-btn" data-next' + (sc.action ? '' : ' data-autofocus') + '>' + esc(sc.nextLabel || "Next") + '</button>' : "") +
      '</div>' +
      '<div class="dd-wiz-help">' +
        '<button class="dd-linkbtn" data-stuck>I\'m stuck</button>' +
        (canBack ? '<button class="dd-linkbtn" data-over>Start over</button>' : "") +
        '<button class="dd-linkbtn" data-later>Finish later</button>' +
      '</div>' +
      '<div class="dd-wiz-stuck" id="dd-wiz-stuck" hidden></div>' +
      '</div>' +
      // The helper chat: a column beside the steps on computers; on phones a 💬 Ask button opens it.
      '<aside class="dd-wiz-ask' + (chatOpen ? " open" : "") + '" id="dd-wiz-ask" aria-label="Helper chat"></aside>' +
      '<button class="dd-ask-fab" data-askfab aria-label="Ask the helper a question"><span aria-hidden="true">💬</span> Ask</button>';
    // Where to pick up again: the setup card if it's on the page, otherwise the menu (audit 2026-10-08).
    var later = function () {
      dd.ui.closeSheet();
      var st = state(), onPage = !st.hidden && !st.folded;
      dd.ui.toast(onPage ? "Saved. Tap Continue in the setup card to pick up here."
                         : "Saved. To pick up here: menu (" + program.name + ", top left) → ⚙️ Settings → Setup & connections.", 4500);
    };
    var sh = dd.ui.sheet(html, { sticky: true, onClose: function () { setup.paint(); }, onEscape: later,
      onOutside: function () { dd.ui.toast("To close this, tap Finish later or ✕. Your place is saved."); } });
    sh.classList.add("dd-wiz");

    var q = function (sel) { return sh.querySelector(sel); };
    if (q("[data-back]")) q("[data-back]").addEventListener("click", function () { if (cur.at > 0) { cur.at--; draw(); } else toParent(); });
    if (q("[data-over]")) q("[data-over]").addEventListener("click", function () { if (parent) toParent(); else { cur.at = 0; draw(); } });
    sh.querySelectorAll("[data-later]").forEach(function (b) { b.addEventListener("click", later); });
    if (q("[data-action]")) q("[data-action]").addEventListener("click", function () { sc.action.run(ctxFor(sh)); });
    if (q("[data-next]")) q("[data-next]").addEventListener("click", function () { next(sh); });
    q("[data-stuck]").addEventListener("click", function () { toggleStuck(sh, sc); });
    mountChat(sh);
    var fab = sh.querySelector("[data-askfab]"), aside = sh.querySelector("#dd-wiz-ask");
    fab.addEventListener("click", function () {
      chatOpen = !aside.classList.contains("open"); aside.classList.toggle("open", chatOpen);
      if (chatOpen) { var i = aside.querySelector("#dd-ask-in"); if (i) i.focus(); }
    });
    if (sc.mount) sc.mount(ctxFor(sh));
  }

  /* Leave a sub-wizard for its chooser (e.g. pick a different service). Its place is forgotten. */
  function toParent() {
    var s = state(), parent = cur.wiz.parent; delete s.wizards[cur.id]; s.hostWith = null; saveState(s);
    setup.open(parent);
  }

  /* The same icon as the setup card's row, so it's always clear which step you're in. */
  function wizIcon(id) { var st = setup.steps.filter(function (x) { return x.wizard === id || (x.wizard === "host" && /^host/.test(id)); })[0]; return st ? st.icon : "✨"; }

  function ctxFor(sh) {
    return {
      el: sh, status: function (kind, title, help) { dd.ui.status(sh.querySelector("#dd-wiz-status"), kind, title, help); },
      next: function () { next(sh, true); }, open: function (url) { window.open(url, "_blank", "noopener"); }
    };
  }

  function next(sh, skipCheck) {
    var sc = cur.wiz.screens[cur.at];
    var go = function () {
      if (cur.at < cur.wiz.screens.length - 1) { cur.at++; draw(); }
      else { finish(); dd.ui.closeSheet(); setup.paint(); if (cur.wiz.onDone) cur.wiz.onDone(); }
    };
    if (skipCheck || !sc.check) return go();
    var c = ctxFor(sh);
    var btn = sh.querySelector("[data-next]"); if (btn) btn.disabled = true;
    Promise.resolve(sc.check(c)).then(function (ok) { if (btn) btn.disabled = false; if (ok) go(); });
  }

  /* "I'm stuck": common fixes for THIS screen, plus a link to the picture guide. */
  function toggleStuck(sh, sc) {
    var box = sh.querySelector("#dd-wiz-stuck");
    box.hidden = !box.hidden;
    if (box.hidden) return;
    var fixes = (sc.stuck || []).concat(["Close this and tap Continue later. Your place is saved.", "Nothing you do here can break the program. Every step can be done again."]);
    var guide = sc.guide ? link("guide_" + sc.guide, null) : null;
    box.innerHTML = "<b>Things that usually help:</b><ul>" + fixes.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" +
      (guide ? '<p><a href="' + esc(guide) + '" target="_blank" rel="noopener">See this step with pictures</a></p>' : "");
  }

  /* ---------- "Ask a question": scripted guide first, live AI once the code works ---------- */
  /* The helper chat sits at the bottom of every setup screen, always open (Oran, 2026-10-07):
     ready-made answers before the code works, the live AI after. The conversation carries on
     from screen to screen while the page is open. */
  var chatLog = [], chatOpen = false;
  function mountChat(sh) {
    var box = sh.querySelector("#dd-wiz-ask"), live = dd.ai && dd.ai.hasCode();
    box.innerHTML = '<button class="dd-chat-hide" data-chathide aria-label="Hide the chat">Hide</button>' +
      '<div class="dd-chat-head"><span aria-hidden="true">💬</span> <b>' + (live ? "Ask " + (dd.helper && dd.helper.enabled() ? dd.helper.name() : "the helper") : "Questions? Ask the setup guide") + '</b>' +
        '<span class="dd-note">' + (live ? " The AI helper answers." : " Ready-made answers; the AI helper takes over once your code is connected.") + '</span></div>' +
      '<div class="dd-ask-msgs" id="dd-ask-msgs"></div>' +
      '<div class="dd-ask-row"><input class="dd-input" id="dd-ask-in" placeholder="' + (live ? "Ask anything about this step…" : "e.g. Is it really free?") + '" autocomplete="off"><button class="dd-btn small" id="dd-ask-go">Ask</button></div>' +
      (chatLog.length ? "" : '<div class="dd-ask-chips">' + setup.suggestQuestions(cur.id).map(function (t) { return '<button class="dd-chip">' + esc(t) + '</button>'; }).join("") + '</div>');
    chatLog.slice(-6).forEach(function (m) { say(box, m.who, m.text, true); });
    box.querySelector("[data-chathide]").addEventListener("click", function () { chatOpen = false; box.classList.remove("open"); });
    var input = box.querySelector("#dd-ask-in"), go = box.querySelector("#dd-ask-go");
    var send = function (text) {
      text = (text || input.value).trim(); if (!text || go.disabled) return;
      input.value = "";
      var chips = box.querySelector(".dd-ask-chips"); if (chips) chips.remove();
      say(box, "me", text);
      var wait = (dd.ai && dd.ai.hasCode()) ? say(box, "bot pending", "The helper is thinking…", "pending") : null;
      go.disabled = true;
      setup.answer(text, cur).then(function (a) {
        if (wait) wait.remove();
        go.disabled = false;
        say(box, a.live ? "bot live" : "bot", a.text);
      });
    };
    go.addEventListener("click", function () { send(); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") send(); });
    box.querySelectorAll(".dd-chip").forEach(function (c) { c.addEventListener("click", function () { send(c.textContent); }); });
  }
  function say(box, who, text, noLog) {
    if (!noLog) { chatLog.push({ who: who, text: text }); if (chatLog.length > 30) chatLog.shift(); }
    var m = document.createElement("div"); m.className = "dd-ask-msg " + who;
    m.textContent = text; box.querySelector("#dd-ask-msgs").appendChild(m);
    if (noLog !== true) m.scrollIntoView({ block: "nearest" });   // not when restoring the chat on a new screen
    return m;
  }

  /* Returns Promise<{text, live}>. Live AI when a code works; otherwise (or if the AI fails)
     the scripted answer. The scripted guide never pretends to be the AI. */
  setup.answer = function (question, where) {
    var scripted = setup.scriptedAnswer(question, where && where.id);
    if (!(dd.ai && dd.ai.hasCode())) return Promise.resolve({ text: scripted || setup.noMatch, live: false });
    var wiz = where && where.wiz, sc = wiz && wiz.screens[where.at];
    var context = "The buyer is in the '" + (wiz ? wiz.title : "setup") + "' wizard, on step " + (where ? where.at + 1 : "?") +
      " ('" + (sc ? (typeof sc.title === "function" ? sc.title() : sc.title) : "") + "'). That screen says: " + (sc ? stripTags(typeof sc.body === "function" ? sc.body() : sc.body) : "");
    return dd.ai.chat({ system: setup.helperPrompt() + "\n\n" + context, history: [{ role: "user", text: question }] }).then(function (r) {
      if (r.ok && r.text) return { text: r.text, live: true };
      return { text: scripted || "The helper can't answer right now (" + r.title.replace(/\.$/, "") + "). " + setup.noMatch, live: false };
    });
  };
  function stripTags(h) { var d = document.createElement("div"); d.innerHTML = h; return d.textContent.replace(/\s+/g, " ").trim(); }

  setup.helperPrompt = function () {
    return "You are the friendly setup guide inside " + (program ? program.name : "a DigiDoughnut program") + ", a one-page program sold by DigiDoughnut. " +
      "The buyer is not technical. Answer in 1-3 short sentences, plain words, no jargon. Say 'free access code', not 'API key'. " +
      "Only help with the step they're on. If unsure what a screen shows, say so and suggest the 'I'm stuck' button. " +
      "Facts: the access code is free from Google AI Studio, no credit card. The program keeps the code only in this browser. " +
      "Nothing they do in setup can break the program; every step can be redone." +
      (cur && cur.id === "sync" ? " Sync facts: live sync uses the buyer's own free Firebase project (console.firebase.google.com, the free Spark plan, no card). " +
        "Steps: create a project (any name; Google Analytics and Gemini can be switched off). Left menu, Project shortcuts > Authentication (Get started the first time) > Sign-in method tab > Native providers > Anonymous > switch on Enable > Save; leave Enable Auto clean-up unticked. " +
        "Left menu, Databases & Storage > Realtime Database (under NoSQL, not Firestore) > Create Database > location United States for Canada/US, Belgium europe-west1 for the UK/Europe > Start in locked mode > Enable. " +
        "Rules tab (next to Data): select all, delete, paste the rules this program shows, tap Publish. " +
        "Left menu, Settings > General > Your apps > the </> web button > App nickname anything, Firebase Hosting unticked > Register app > under Add Firebase SDK, the copy icon at the bottom right of the big box with firebaseConfig > Continue to console. " +
        "Safe to ignore: Gemini cards and Ask Gemini, the Dynamic Links box, the yellow Sign in with Google bar, SMS Multi-factor, Rules playground, npm install, Use a script tag, the AI coding agent box. Never turn on App Check: it blocks the program. " +
        "The setup code is not a password: it only says where the database is. Google may change button names; if what they see differs, believe their screen. Never ask for passwords." : "") +
      (cur && /^host/.test(cur.id) ? " Hosting facts: the program is ONE self-contained HTML file. It must be uploaded unchanged, keeping its file name, to an https address, " +
        "not behind a password. The host must not block outside connections (a Content-Security-Policy with connect-src 'self' breaks the helper; Neocities' free plan does this). " +
        "Updates: upload the new file with the same name to the same place, because each web address keeps its own saved numbers. If the buyer names a host " +
        "(Netlify, Cloudflare Pages, Vercel, cPanel, Hostinger, GoDaddy, Bluehost, WordPress, Wix, Squarespace, Google Sites, etc.), give short, numbered steps for that host and say plainly " +
        "if it can't host a raw HTML file (many site builders can't), then suggest GitHub Pages. Never ask for their passwords." : "");
  };

  /* ---------- the scripted question bank (spec 3.8: all must be answered in-wizard) ---------- */
  setup.noMatch = "I don't have a ready answer for that one. Try the \"I'm stuck\" button, or tap Finish later and come back any time.";
  setup.bank = [
    { keys: ["free", "cost", "pay", "price", "charge", "money"], for: /^host_github/, a: "Yes. GitHub's free plan is all you need: no card, no trial, and your page doesn't expire." },
    { keys: ["free", "cost", "pay", "price", "charge", "money"], for: /^host_tiiny/, a: "Yes. tiiny.host's free plan is enough for one program. Skip the free trial they offer: it turns into a paid plan." },
    { keys: ["free", "cost", "pay", "price", "charge", "money"], a: "Yes, it's free. Google gives every account a free daily share. If you ever use it up, it refills on its own. You won't be charged." },
    { keys: ["credit card", "card", "billing", "bank"], a: "No credit card needed. If Google ever asks for billing, you've gone somewhere you don't need. Tap Back and use the button on the screen before." },
    { keys: ["account", "gmail", "sign in", "log in", "login", "google account"], a: "Any Google account works, the same one you use for Gmail or YouTube. If you don't have one, Google lets you make one for free." },
    { keys: ["name", "project", "call it", "what do i write", "title"], a: "Anything you like. Try \"My " + "Program" + "\". The name is only for you." },
    { keys: ["region", "location", "country", "where", "united states", "europe"], a: "Pick United States if you're in Canada or the US. In the UK, pick Belgium (europe-west1). It only decides where your copy is stored." },
    { keys: ["locked", "test mode", "mode", "security rules", "production"], a: "Choose \"Start in locked mode\". It sounds strict, but the next step opens exactly what this program needs and nothing more." },
    { keys: ["setup code", "config", "firebaseconfig", "where do i find", "find the code"], a: "It's the box of text Firebase shows after you register the app, starting with \"const firebaseConfig\". Copy the whole box." },
    { keys: ["paste", "what exactly", "copy", "which part", "whole thing"], a: "Copy the whole thing Google shows you, using Google's own Copy button. Then come back here and paste it in the box. Extra spaces don't matter." },
    { keys: ["mistake", "wrong", "messed up", "undo", "break", "broke", "start over"], a: "Nothing can break. Every step can be done again: tap Start over, or Back. Your numbers in the program are never touched by setup." },
    { keys: ["safe", "private", "privacy", "share", "who can see", "secure"], a: "Your code stays in this browser on this device. Your numbers stay here too. When you use the helper, the numbers it needs go to Google to get an answer." },
    { keys: ["ignore", "skip", "terms", "email", "updates", "checkbox", "tick"], a: "Tick the box agreeing to Google's terms (you have to). Any box about emails or news is up to you: you can leave it empty." },
    { keys: ["long", "time", "how many", "minutes"], a: "About 2 minutes for the helper, 5 to 10 for the phone, 10 for sync. You can stop any time and pick up where you left off." },
    { keys: ["api", "key", "what is", "access code"], a: "Google calls it an API key. We call it your free access code: it's how the helper gets to use Google's AI for free." },
    { keys: ["tiiny", "tiny host", "hosting", "online", "upload", "address", "link", "website"], a: "Putting the program online (on GitHub, tiiny.host or your own website) lets your phone open it. Your numbers and your code are never uploaded: they stay on your own devices." },
    { keys: ["which one", "difference", "better", "choose", "pick", "neocities"], for: /^host/, a: "Pick GitHub if you're not sure: it's free, shows no ads, never expires, and one account holds all your DigiDoughnut programs. tiiny.host is quicker to set up, but holds one program per free account and needs a log-in every 3 months." },
    { keys: ["github", "repository", "repo"], a: "GitHub is a free place to keep files online, and it can show a file as a web page. Your program file goes there; your numbers and your code never do." },
    { keys: ["public", "who can see"], for: /^host_github/, a: "Public means anyone could look at the program file itself, like any web page. Your numbers and your code are never in the file: they stay on your own devices." },
    { keys: ["not online", "not live", "404", "not found", "isn t there", "still waiting"], for: /^host_github/, a: "GitHub can take up to 10 minutes to put a new site online. Check Settings, Pages: Branch should say main, and Save should have been tapped." },
    { keys: ["private", "upgrade", "make this repository public", "enable pages"], for: /^host_github/, a: "GitHub only makes free web pages from Public repositories. In your repository: Settings, General, scroll to Danger Zone, Change visibility, Change to public, then confirm." },
    { keys: ["etsy", "folder", "different address", "wrong address", "github io"], for: /^host_github/, a: "Your address is username.github.io, then the repository's name, then the file. On the waiting step, open \"GitHub shows a different address?\" and paste what GitHub shows." },
    { keys: ["netlify", "cloudflare", "vercel", "cpanel", "hostinger", "godaddy", "bluehost", "file manager"], a: "Most hosts let you upload a file through a file manager or an upload page: upload this file unchanged and keep its name. For step-by-step help for your exact host, turn on the AI helper (setup step 2), then ask here." },
    { keys: ["wordpress", "wix", "squarespace", "google sites", "website builder"], a: "Most website builders can't host a whole web page file like this one. If yours won't take it, tap Start over and pick GitHub: it's free and made for this." },
    { keys: ["https", "http", "secure", "padlock"], a: "https:// means the page is sent securely (the padlock in the address bar). Phones and the helper need it. Most hosts switch it on for free, often called SSL." },
    { keys: ["readme"], for: /^host_github/, a: "Turn on Add README when you create the repository. It's a small text file GitHub needs to start the repository; you can ignore it after that." },
    { keys: ["username", "user name"], for: /^host_github/, a: "Your GitHub username becomes part of your web address: username.github.io. Letters, numbers and single hyphens, for example smith-tools." },
    { keys: ["confirmation", "token", "email code", "code", "didn t get", "no email"], for: /^host_github/, a: "GitHub emails you an 8-digit code: type it under Enter code and tap Continue. No email after a few minutes? Check your spam folder, or tap Resend the code." },
    { keys: ["expire", "taken down", "stay online", "disappear", "how long does it stay", "how long will it stay"], for: /^host_github/, a: "On GitHub it stays online for good. Free GitHub pages don't expire and need no looking after." },
    { keys: ["3 months", "expire", "taken down", "stay online", "disappear", "how long does it stay", "how long will it stay"], for: /^host_tiiny/, a: "On tiiny.host's free plan the page stays online as long as you log in to tiiny.host at least once every 3 months." },
    { keys: ["update", "new version", "upgrade"], a: "To put a new version online, upload the new file to the same place with exactly the same file name, replacing the old one. The address stays the same, so your numbers stay." },
    { keys: ["update", "new version", "upgrade"], for: /^host_tiiny/, a: "To put a new version online, log in to tiiny.host and use Update on the same project. That keeps the same address, so your numbers stay." },
    { keys: ["trial", "free trial", "solo"], for: /^host_tiiny/, a: "You don't need tiiny.host's free trial: tap Skip. The trial turns into a paid plan, and the free plan is all this program needs." },
    { keys: ["home screen", "icon", "app", "bookmark", "shortcut"], a: "Bookmark it on your computer and add it to your Home Screen on your phone. Then it opens like an app, always from the same address, so your numbers are always there." },
    { keys: ["phone", "iphone", "android", "mobile"], a: "Setting up the helper is easiest on a computer. Once it works, Send to my phone moves it over by scanning a code." }
  ];
  setup.suggestQuestions = function (wizardId) {
    if (wizardId === "host_other") return ["How do I upload it to Netlify?", "Can I use WordPress?", "What does https mean?"];
    if (wizardId === "host_github") return ["Is GitHub really free?", "What does Public mean?", "It's not online yet"];
    if (/^host/.test(wizardId || "")) return ["Is it really free?", "Do I need the free trial?", "How long does it stay online?"];
    return wizardId === "sync" ? ["Which region?", "Locked or test mode?", "Where's the setup code?"]
                               : ["Is it really free?", "Do I need a credit card?", "What if I make a mistake?"];
  };
  /* Best keyword match. Answers written for one wizard ("for") win inside it and lose elsewhere. */
  setup.scriptedAnswer = function (q, wizardId) {
    var wid = wizardId || (cur && cur.id) || "";
    var t = " " + String(q).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ") + " ";
    var best = null, bestScore = 0;
    setup.bank.forEach(function (e) {
      var score = 0;
      e.keys.forEach(function (k) { if (t.indexOf(" " + k + " ") >= 0 || (k.length > 4 && t.indexOf(k) >= 0)) score += k.split(" ").length; });
      if (score > 0 && e.for) score += e.for.test(wid) ? 2 : -100;
      if (score > bestScore) { bestScore = score; best = e; }
    });
    if (!best) return null;
    return best.a.replace("My Program", "My " + (program ? program.name : "Program"));
  };

  /* ---------- pictures: a tiny moving drawing on every wizard screen ----------
     Oran (2026-10-07): "think of this like a children's book". Each screen can show a little
     mock of the page the buyer is about to see, with the thing to do highlighted and a
     pointing hand that taps it, a box that types itself, a code that gets copied, and so on.
     Pure HTML + CSS (no images), labels from the same wording as the text, so they never
     disagree. Motion stops for people who ask their device to reduce motion.
       spec = { kind, site, items:[…], btn, … }  (see each kind below) */
  function hand() { return '<span class="dd-pic-hand" aria-hidden="true">👆</span>'; }
  function tapBtn(label, delay) {
    return '<span class="dd-pic-target" style="--d:' + (delay || 0) + 's"><span class="dd-pic-btn">' + esc(label) + '</span>' + hand() + '</span>';
  }
  function frame(site, inner) {
    return '<div class="dd-pic-frame"><div class="dd-pic-bar"><i></i><i></i><i></i><span>' + esc(site || "") + '</span></div><div class="dd-pic-page">' + inner + '</div></div>';
  }
  function item(it, i) {
    var d = (0.5 + i * 0.6).toFixed(1) + "s";
    if (it.type === "field") return '<div class="dd-pic-row"><span class="dd-pic-label">' + esc(it.label) + '</span><span class="dd-pic-input"><span class="dd-pic-typed" style="--n:' + Math.max(4, (it.value || "").length) + ';--d:' + d + '">' + esc(it.value || "") + '</span></span></div>';
    if (it.type === "toggle") return '<div class="dd-pic-row dd-pic-inline"><span class="dd-pic-label">' + esc(it.label) + '</span><span class="dd-pic-toggle" style="--d:' + d + '"><i></i></span></div>';
    if (it.type === "check") return '<div class="dd-pic-row dd-pic-inline"><span class="dd-pic-check" style="--d:' + d + '">✓</span><span class="dd-pic-label">' + esc(it.label) + '</span></div>';
    if (it.type === "select") return '<div class="dd-pic-row"><span class="dd-pic-label">' + esc(it.label) + '</span><span class="dd-pic-select" style="--d:' + d + '"><span>' + esc(it.value) + '</span> ▾</span></div>';
    if (it.type === "menu") return '<div class="dd-pic-row"><span class="dd-pic-menu" style="--d:' + d + '">' + esc(it.label) + ' ▾<span class="dd-pic-menuitem">' + esc(it.value) + '</span></span></div>';
    if (it.type === "file") return '<div class="dd-pic-row"><span class="dd-pic-file" style="--d:' + d + '">📄 ' + esc(it.value) + '</span></div>';
    if (it.type === "code") return '<div class="dd-pic-row dd-pic-inline"><span class="dd-pic-code">' + esc(it.value) + '</span>' + tapBtn(it.btn || "Copy", d.replace("s", "")) + '<span class="dd-pic-bubble" style="--d:' + d + '">Copied!</span></div>';
    if (it.type === "digits") return '<div class="dd-pic-row"><span class="dd-pic-label">' + esc(it.label) + '</span><span class="dd-pic-digits" style="--d:' + d + '">' + "12345678".split("").map(function (c, k) { return '<i style="--k:' + k + '">' + c + '</i>'; }).join("") + '</span></div>';
    if (it.type === "lines") return '<div class="dd-pic-lines"><i></i><i></i><i></i></div>';
    if (it.type === "popup") return '<div class="dd-pic-popup"><b>' + esc(it.label) + '</b><span class="dd-pic-ghostbtn">' + esc(it.value) + '</span>' + tapBtn(it.btn, 1) + '</div>';
    return "";
  }
  setup.pic = function (spec) {
    if (!spec) return "";
    var k = spec.kind, out = "";
    if (k === "hero") out = '<div class="dd-pic-hero">' + spec.icons.map(function (ic, i) { return '<span style="--i:' + i + '">' + ic + '</span>'; }).join('<b class="dd-pic-arrow">➜</b>') + '</div>' +
                           (spec.caption ? '<div class="dd-pic-caption">' + esc(spec.caption) + '</div>' : "");
    else if (k === "page") out = frame(spec.site, (spec.items || [{ type: "lines" }]).map(item).join("") +
                                 (spec.btn ? '<div class="dd-pic-row dd-pic-end">' + tapBtn(spec.btn, 0.5 + (spec.items || []).length * 0.6) + '</div>' : ""));
    else if (k === "email") out = '<div class="dd-pic-split"><div class="dd-pic-mail"><span class="dd-pic-env">✉️</span><span class="dd-pic-mailcode">12345678</span></div><b class="dd-pic-arrow">➜</b>' +
                                  frame(spec.site, item({ type: "digits", label: spec.label }, 0) + '<div class="dd-pic-row dd-pic-end">' + tapBtn(spec.btn, 2.4) + '</div>') + '</div>';
    else if (k === "wait") out = '<div class="dd-pic-hero"><span class="dd-pic-spin">⏳</span></div><div class="dd-pic-caption">' + esc(spec.caption || "") + '</div>';
    else if (k === "done") out = '<div class="dd-pic-burst"><span>✓</span>' + Array.from("🎉✨🎊⭐").map(function (c, i) { return '<em style="--i:' + i + '">' + c + '</em>'; }).join("") + '</div>';
    else if (k === "bookmark") out = frame(spec.site, '<div class="dd-pic-row dd-pic-inline"><span class="dd-pic-star">★</span><span class="dd-pic-input"><span class="dd-pic-typed" style="--n:' + spec.name.length + ';--d:1s">' + esc(spec.name) + '</span></span></div>');
    return '<div class="dd-pic dd-pic--' + k + '" aria-hidden="true">' + out + '</div>';
  };

  /* ---------- wizards (screens as data) ---------- */
  setup.wizards = {};

  setup.wizards.ai = {
    title: "Turn on the helper",
    onDone: function () { dd.ui.toast("The helper is turned on.", 4000); },
    screens: [
      { title: "A free code from Google",
        pic: { kind: "hero", icons: ["🤖", "🔑", "✨"], caption: "A free code turns the helper on" },
        todo: "Read this, then tap Next.",
        body: function () { return '<p>The helper runs on Google\'s AI. To use it, you need a free code from Google. <b>Google calls this an API key. We call it your free access code.</b></p>' +
          '<ul class="dd-facts"><li>✓ Free. No credit card.</li><li>✓ About 2 minutes.</li>' + (dd.env.isPhone ? "" : '<li>✓ Easiest on a computer, like you\'re using now.</li>') + '</ul>' +
          (dd.env.isPhone ? '<p class="dd-status show warn">This is easiest on a computer. You can do it there, then send it to your phone with one scan.</p>' : "") +
          '<p class="dd-note">' + esc(dd.ai.providers.google.privacyNote) + '</p>'; } },
      { title: "Open Google AI Studio",
        pic: function () { return { kind: "page", site: "this page", items: [{ type: "lines" }], btn: "Open Google AI Studio" }; },
        todo: "Tap the big blue button. Google opens in a new tab. Sign in there.",
        body: function () { return '<p>Tap the button. Google AI Studio opens in a new tab. Sign in with your Google account (the one you use for Gmail or YouTube).</p>' +
          '<p class="dd-note">Keep this page open. You\'ll come back here in a minute.</p>'; },
        action: { label: "Open Google AI Studio", run: function (c) { c.open(dd.ai.getCodeLink("google")); } },
        stuck: ["If Google asks you to make an account, that's free too.", "If the page is blank, close that tab and tap the button again."], guide: "ai_open" },
      { title: "Agree to Google's terms (first time only)",
        pic: function () { return { kind: "page", site: "aistudio.google.com", items: [{ type: "lines" }, { type: "check", label: "I agree to the terms" }], btn: L("ai_terms_continue", "Continue") }; },
        todo: function () { return "Tick the box, then tap <b>" + esc(L("ai_terms_continue", "Continue")) + "</b>. No box? Tap Next."; },
        body: function () { return '<p>The first time, Google shows its terms. Tick the box that you agree, then tap <b>' + esc(L("ai_terms_continue", "Continue")) + '</b>.</p>' +
          '<p><b>You can ignore</b> any box about emails, news or research. Leave those empty if you like.</p>' +
          '<p class="dd-note">Didn\'t see any terms? That\'s fine, you\'ve agreed before. Tap Next.</p>'; },
        stuck: ["You need to be 18 or older to use Google AI Studio.", "If Google says it isn't available in your country, the helper can't be used there yet."], guide: "ai_terms" },
      { title: "Find your code",
        pic: function () { return { kind: "page", site: "aistudio.google.com · " + L("ai_keys_page", "API Keys"), items: [{ type: "lines" }], btn: L("ai_create_key", "Create API key") }; },
        todo: function () { return "Tap <b>" + esc(L("ai_create_key", "Create API key")) + "</b>. Already see a code in the list? Skip it and tap Next."; },
        body: function () { return '<p>Look for the page called <b>' + esc(L("ai_keys_page", "API Keys")) + '</b> (Google sometimes opens it for you).</p>' +
          '<ul><li>If you see a code in the list already, you\'re done with this step: Google made one for you.</li>' +
          '<li>If the list is empty, tap <b>' + esc(L("ai_create_key", "Create API key")) + '</b>.</li></ul>' +
          '<p><b>You can ignore</b> anything about projects, billing or "upgrade". You don\'t need any of it.</p>'; },
        stuck: ["Can't find the API Keys page? Tap Back, then tap Open Google AI Studio again: it opens the right page.", "If Google asks you to choose or name a project, pick the one it suggests, or type anything, like \"My helper\"."], guide: "ai_find" },
      { title: "Copy your code",
        pic: function () { return { kind: "page", site: "aistudio.google.com · " + L("ai_keys_page", "API Keys"), items: [{ type: "code", value: "AQ.Ab8R••••••••", btn: L("ai_copy", "Copy") }] }; },
        todo: function () { return "Tap <b>" + esc(L("ai_copy", "Copy")) + "</b> next to your code."; },
        body: function () { return '<p>Next to your code, tap Google\'s <b>' + esc(L("ai_copy", "Copy")) + '</b> button (it may just be a small copy icon).</p>' +
          '<p class="dd-note">Copying the whole code with Google\'s button is the safest way. Don\'t worry about what it looks like.</p>'; },
        stuck: ["If you can only see part of the code, click on it first, then copy.", "On a phone, press and hold the code, then tap Copy."], guide: "ai_copy" },
      { title: "Paste it here",
        pic: { kind: "page", site: "this page", items: [{ type: "field", label: "Your free access code", value: "AQ.Ab8R••••••••" }], btn: "Connect" },
        todo: "Paste your code in the box below, then tap Connect.",
        body: '<p>Paste your code in the box, then tap <b>Connect</b>. We\'ll check it with Google straight away.</p>' +
              '<input class="dd-input" id="dd-wiz-code" placeholder="Paste your free access code" autocomplete="off" autocapitalize="off" spellcheck="false">',
        action: { label: "Connect", run: function (c) { connectFromWizard(c); } },
        mount: function (c) {
          var input = c.el.querySelector("#dd-wiz-code");
          input.addEventListener("keydown", function (e) { if (e.key === "Enter") connectFromWizard(c); });
          if (!dd.env.isPhone) input.focus();
        },
        next: false,
        stuck: ["Paste with Ctrl+V (Windows) or Cmd+V (Mac). On a phone, press and hold the box, then tap Paste.", "If it says the code didn't work, go back to Google, copy it again with Google's Copy button, and paste again."], guide: "ai_paste" },
      { title: "You're connected!",
        pic: { kind: "done" },
        body: '<p>The helper is ready. Your code stays in this browser, on this device.</p>' +
              '<p class="dd-note">To use the helper on your phone too, use <b>Send to my phone</b>: it brings your code across with one scan.</p>',
        nextLabel: "Done" }
    ]
  };

  function connectFromWizard(c) {
    var input = c.el.querySelector("#dd-wiz-code"), btn = c.el.querySelector("[data-action]");
    if (btn.disabled) return;
    if (!input.value.trim()) { c.status("warn", "Paste your code in the box first."); input.focus(); return; }
    btn.disabled = true; btn.textContent = "Checking with Google…";
    c.status("info", "Checking your code with Google. This can take up to a minute when Google is busy.");
    dd.ai.connect(input.value).then(function (r) {
      btn.disabled = false; btn.textContent = "Connect";
      if (r.ok) { c.status("ok", "It works!"); setTimeout(function () { if (document.body.contains(c.el)) c.next(); }, 600); }
      else c.status("err", r.title, r.help);
    });
  }

  /* ---------- "Put it on your phone": the buyer's own copy ----------
     The program file has to be online before a phone can open it. Offered (checked with Oran
     2026-10-07): GitHub Pages (recommended), tiiny.host (1 project per free account, small banner,
     log in every 3 months, a "Start your free trial" popup whose way out is "Skip"; "Upload file",
     "Update"), or the buyer's own host. Each wizard's last steps carry the code + numbers from the
     file to the new address in one link (dd.pair), then bookmark it (the page title is the
     bookmark name). */
  function fileName() {
    try { return decodeURIComponent(location.pathname.split("/").pop()) || "the program file"; } catch (e) { return "the program file"; }
  }
  function hostState(v) { var s = state(); if (v !== undefined) { s.hostUrl = v; saveState(s); } return s.hostUrl || ""; }
  setup.ownAddress = hostState;
  setup.hostInProgress = function (svc) { return !!state().wizards["host_" + svc]; };
  setup.startHost = function (svc) { var s = state(); s.hostWith = svc; saveState(s); setup.open("host_" + svc); };
  setup.fileName = fileName;   // the buyer's own copy, remembered from the host wizards (or pasted in Move)
  /* Tidy a pasted address. Returns a full https address, or null if it isn't one. */
  setup.cleanAddress = function (raw) {
    var t = String(raw || "").trim().replace(/^["'<]+|["'>]+$/g, "");
    if (!t) return null;
    if (!/^[a-z]+:\/\//i.test(t)) t = "https://" + t;
    try {
      var u = new URL(t);
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      if (!/\./.test(u.hostname) || /\s/.test(t)) return null;
      u.hash = "";
      return u.href;
    } catch (e) { return null; }
  };
  var facts = '<ul class="dd-facts"><li>✓ Free. No credit card.</li><li>✓ About 5 to 10 minutes.</li><li>✓ Your numbers and your code are never uploaded.</li></ul>';
  var publicNote = '<p class="dd-note">The page itself can be opened by anyone who has its address, like a shared link. What you type into it stays on each of your own devices.</p>';
  function phoneWarn() { return dd.env.isPhone ? '<p class="dd-status show warn">Do this step on the computer where you saved the program file. Then come back to your phone at the end.</p>' : ""; }

  /* Which services are offered. Neocities was dropped (2026-10-07): its free plan sends
     "connect-src 'self'", so a page there can't reach Google, Firebase or the noticeboard.
     When only one service is offered, the choice screen is skipped. */
  setup.hostChoices = ["github", "tiiny", "other"];
  function hostChoice() { return setup.hostChoices.length === 1 ? setup.hostChoices[0] : null; }

  /* The choice of where it lives is ONE screen, dd.move.where() (Phase 7.2). The old chooser screen
     and the Neocities wizard were removed in the 2026-10-08 audit; "host" is still the parent name the
     host wizards return to (Back / Start over open dd.move.where()). */

  /* The last three screens, shared by both services. */
  function finishScreens(svc) {
    return [
      { title: "Move your setup across",
        pic: { kind: "hero", icons: ["🔑", "📋", "🌐"], caption: "Your code and numbers come along" },
        todo: "Tap the big blue button. Your program opens in a new tab.",
        body: function () {
          var url = hostState(), host = url || "your new address"; try { host = new URL(url).host + new URL(url).pathname; } catch (e) {}
          return '<p>Tap the button. Your program opens at <b>' + esc(host) + '</b>' + (dd.ai && dd.ai.hasCode() ? ', with your free access code' : '') +
            (dd.isExample && !dd.isExample() ? ' and your numbers' : '') + ' already in it.</p>' +
            '<p class="dd-note">The button works for 10 minutes. If it runs out, just tap it again.</p>'; },
        action: { label: "Open my program at its new address", run: function (c) {
          var made = dd.pair.makeLink({ base: hostState(), includeCode: true, maxLink: 60000 });
          c.open(made.link);
          c.status(made.left.length ? "warn" : "ok", made.left.length ? "Opened. Your " + made.left.join(" and ") + " were too big to carry, so they stay here for now." : "Opened in a new tab. Check it, then come back here and tap Next.");
        } },
        stuck: ["Nothing opened? Your browser may have blocked the new tab. Allow pop-ups for this page, or tap the button again.",
                svc !== "tiiny" ? "Page not found? Check the upload finished, and that the address is right: tap Back to fix it."
                                    : "If the new page looks empty, check the address you pasted: tap Back and fix it."], guide: "host_move" },
      { title: "Bookmark it and keep it",
        pic: function () { return { kind: "bookmark", site: "Bookmark", name: setup.bookmarkName() }; },
        todo: function () { return "In the new tab, press <b>Ctrl+D</b> (Windows) or <b>Cmd+D</b> (Mac) and save the bookmark."; },
        body: function () { return '<p>In the new tab, <b>bookmark the page</b> (Ctrl+D on Windows, Cmd+D on a Mac). Name the bookmark:</p>' +
          '<p class="dd-filename">' + esc(setup.bookmarkName()) + '</p>' +
          '<p>From now on, always open the program from that bookmark.</p>' +
          '<ul><li><b>Same address, same numbers.</b> A different address, or the file on this computer, starts with its own separate numbers.</li>' +
          (svc === "github"
            ? '<li><b>Getting an update?</b> Upload the new file to the same GitHub repository with the <b>same file name</b>. It replaces the old one and keeps the same address.</li>'
            : svc === "tiiny"
            ? '<li><b>Log in to tiiny.host at least once every 3 months.</b> That keeps your free page online.</li>' +
              '<li><b>Getting an update?</b> On tiiny.host, use <b>' + esc(L("host_update", "Update")) + '</b> on this same project. Don\'t upload it as a new one.</li>'
            : '<li><b>Getting an update?</b> Upload the new file to the same place with the <b>same file name</b>, replacing the old one, so the address stays the same.</li>') +
          '</ul>' +
          '<p>Last step: in the new tab, tap the program\'s name at the top left (the menu), then <b>⚙️ Settings</b> → <b>📲 Send to my phone</b>. On your phone, add it to your Home Screen when it asks.</p>' +
          (svc === "tiiny" ? '<p class="dd-note">You can ignore the small tiiny.host banner on your page.</p>' : ""); },
        nextLabel: "Done" }
    ];
  }

  /* GitHub Pages (Oran's number one, 2026-10-07): the buyer's own free GitHub account, one
     repository named <username>.github.io that holds every DigiDoughnut program they buy, at
     https://<username>.github.io/<file name>. No outside-connection block (checked: the
     DigiDoughnut noticeboard is on Pages too), no ads, no expiry. Steps from GitHub's docs and
     Oran's screenshots (2026-10-07; sign-up = Email, Password, Username, Your Country/Region,
     "Create account"; 8-digit "Enter code" > "Continue"; then "Sign in"; new-repo page checked
     live: "Repository name", "Choose visibility" Public, "Add README" Off/On switch). Upload and
     Pages settings screens still to confirm. New repository (name <username>.github.io, Public, "Add README" on, "Create
     repository"); "Add file" > "Upload files" > "Commit changes"; Settings > Pages > "Deploy
     from a branch" > main > Save; live within ~10 minutes. Logged-out sign-up screens NOT yet
     seen: labels go through L() so the noticeboard can correct them. */
  function ghUser() { return (state().ghUser || "").toLowerCase(); }
  /* A GitHub username (or a pasted github.io address) -> where this file will be.
     Repository name: "digidoughnut" by default, so the address is
     https://<user>.github.io/digidoughnut/<file>. (A repository named exactly <user>.github.io
     would drop the folder, but buyers find that name confusing: Oran named his "etsy".) Any
     repository on the same account shares one web address, so programs still share the code. */
  setup.ghDefaultRepo = "digidoughnut";
  setup.githubAddress = function (user, repo) {
    var raw = String(user || "").trim();
    var m = raw.match(/^(?:https?:\/\/)?([a-z0-9-]+)\.github\.io\/?([^\/?#]*)/i);
    if (m) { user = m[1]; repo = repo || m[2] || (m[1] + ".github.io"); }
    else user = raw.toLowerCase().replace(/^@/, "").replace(/^https?:\/\//, "").replace(/^github\.com\//, "").replace(/\/.*$/, "");
    user = String(user).toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/.test(user)) return null;
    repo = String(repo || state().ghRepo || setup.ghDefaultRepo).replace(/^\/+|\/+$/g, "");
    var root = repo.toLowerCase() === user + ".github.io";
    return { user: user, repo: repo, url: "https://" + user + ".github.io/" + (root ? "" : encodeURIComponent(repo) + "/") + encodeURIComponent(fileName()) };
  };
  function copyBox(text) {
    return '<div class="dd-copyrow"><span class="dd-filename">' + esc(text) + '</span><button class="dd-btn small ghost" data-copytext="' + esc(text) + '">Copy</button></div>';
  }
  function wireCopy(c) {
    c.el.querySelectorAll("[data-copytext]").forEach(function (b) { b.addEventListener("click", function () {
      var t = b.dataset.copytext;
      (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.textContent = "Copied ✓"; },
        function () { var r = document.createRange(); r.selectNodeContents(b.previousSibling); var s = getSelection(); s.removeAllRanges(); s.addRange(r); try { document.execCommand("copy"); b.textContent = "Copied ✓"; } catch (e) {} });
    }); });
  }

  setup.wizards.host_github = {
    title: "Put it on your phone · GitHub", parent: "host",
    onDone: function () { dd.ui.toast("Use your new address from now on. Bookmark it!", 4500); },
    screens: [
      { title: "Make a free GitHub account",
        pic: function () { return { kind: "page", site: "github.com/signup", items: [{ type: "field", label: "Email", value: "you@email.com" }, { type: "field", label: "Password", value: "••••••••••••••••" }, { type: "field", label: "Username", value: "smith-tools" }], btn: L("gh_create_account", "Create account") }; },
        todo: function () { return "Tap the button below, fill in GitHub's boxes, then tap <b>" + esc(L("gh_create_account", "Create account")) + "</b>."; },
        body: function () { return '<p>GitHub keeps files online, and it can show a file as a web page for free. Tap the button. On <b>' + esc(L("gh_signup_title", "Sign up for GitHub")) + '</b>, fill in:</p>' +
          '<ul><li><b>Email</b>.</li>' +
          '<li><b>Password</b>: at least 15 characters, or at least 8 with a number and a small letter.</li>' +
          '<li><b>Username</b>: this becomes your web address, so keep it simple, like <i>smith-tools</i>. Letters, numbers and single hyphens. Write it down.</li>' +
          '<li><b>Your Country/Region</b>.</li></ul>' +
          '<p>Then tap <b>' + esc(L("gh_create_account", "Create account")) + '</b>. (Or tap <b>Continue with Google</b> to use your Google account instead.)</p>' +
          '<p class="dd-note">Already have GitHub? Just sign in and tap Next.</p>' + phoneWarn(); },
        action: { label: "Open GitHub sign-up", run: function (c) { c.open(link("gh_signup", "https://github.com/signup")); } },
        stuck: ["Password refused? Make it longer: 15 characters of anything works.",
                "Username taken? Add a word or a number, like smith-tools-2."], guide: "gh_signup" },
      { title: "Confirm your email and sign in",
        pic: function () { return { kind: "email", site: "github.com", label: L("gh_enter_code", "Enter code"), btn: L("gh_code_continue", "Continue") }; },
        todo: "Copy the 8-digit code from GitHub's email into GitHub's boxes. Then sign in.",
        body: function () { return '<p>GitHub emails you an <b>8-digit code</b>. Type it under <b>' + esc(L("gh_enter_code", "Enter code")) + '</b> and tap <b>' + esc(L("gh_code_continue", "Continue")) + '</b>.</p>' +
          '<p>GitHub then asks you to sign in: type your username (or email) and password, and tap <b>' + esc(L("gh_sign_in", "Sign in")) + '</b>.</p>' +
          '<p><b>You can ignore</b> everything on GitHub\'s welcome page: the "Ask anything" box, Copilot, videos, "Getting started", "Create project", and anything offering a <b>Download</b> (you don\'t need to install anything). We\'ll take you to the right pages from here.</p>'; },
        stuck: ["No email? Check your spam folder, or tap Resend the code.", "Code expired? Tap Resend the code and use the newest one."], guide: "gh_confirm" },
      { title: "Your GitHub username",
        pic: { kind: "page", site: "this page", items: [{ type: "field", label: "Your GitHub username", value: "smith-tools" }] },
        todo: "Type your GitHub username in the box below.",
        body: function () { return '<p>Type the username you picked on GitHub.</p>' +
          '<input class="dd-input" id="dd-wiz-user" placeholder="e.g. smith-tools" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(state().ghUser || "") + '">' +
          '<p class="dd-note">It\'s shown when you tap your picture at the top right of GitHub.</p>'; },
        mount: function (c) { var i = c.el.querySelector("#dd-wiz-user"); if (!dd.env.isPhone && !i.value) i.focus(); },
        check: function (c) {
          var a = setup.githubAddress(c.el.querySelector("#dd-wiz-user").value);
          if (!a) { c.status("warn", "Type your GitHub username first.", "Letters, numbers and single hyphens, like smith-tools."); return false; }
          var s = state(); s.ghUser = a.user; saveState(s); hostState(a.url); return true;
        } },
      { title: "Make a home for your programs",
        pic: function () { var a = setup.githubAddress(ghUser()) || { repo: "yourname.github.io" };
          return { kind: "page", site: "github.com/new", items: [{ type: "field", label: L("gh_repo_name", "Repository name"), value: a.repo }, { type: "toggle", label: L("gh_readme", "Add README") }], btn: L("gh_create_repo", "Create repository") }; },
        todo: function () { var a = setup.githubAddress(ghUser()) || { repo: "yourname.github.io"}; return "Name it <b>" + esc(a.repo) + "</b>, switch on " + esc(L("gh_readme", "Add README")) + ", then tap <b>" + esc(L("gh_create_repo", "Create repository")) + "</b>."; },
        body: function () { var a = setup.githubAddress(ghUser()) || { repo: "yourname.github.io" };
          return '<p>Tap the button. On GitHub\'s <b>' + esc(L("gh_new_repo", "Create a new repository")) + '</b> page:</p>' +
          '<ol><li>Under <b>' + esc(L("gh_repo_name", "Repository name")) + '</b>, type exactly:' + copyBox(a.repo) + '</li>' +
          '<li>Under <b>' + esc(L("gh_visibility", "Choose visibility")) + '</b>, make sure it says <b>' + esc(L("gh_public", "Public")) + '</b>. <i>Private won\'t work:</i> GitHub only makes free web pages from Public repositories.</li>' +
          '<li>Switch <b>' + esc(L("gh_readme", "Add README")) + '</b> from Off to <b>On</b>.</li>' +
          '<li>Tap <b>' + esc(L("gh_create_repo", "Create repository")) + '</b>.</li></ol>' +
          '<p><b>You can ignore</b> Owner (it\'s already you), Description, Add .gitignore and Add license.</p>' +
          '<p class="dd-note">Already made a repository with a different name? That works too: type its name here instead.</p>' +
          '<input class="dd-input" id="dd-wiz-repo" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(a.repo) + '">'; },
        mount: wireCopy,
        check: function (c) {
          var r = (c.el.querySelector("#dd-wiz-repo").value || "").trim().replace(/^.*\//, "") || setup.ghDefaultRepo;
          if (!/^[A-Za-z0-9._-]{1,100}$/.test(r)) { c.status("warn", "That repository name has odd characters.", "Use letters, numbers, hyphens or dots, like digidoughnut."); return false; }
          var s = state(); s.ghRepo = r; saveState(s);
          var a = setup.githubAddress(ghUser(), r); if (a) hostState(a.url); return true;
        },
        action: { label: "Open GitHub: new repository", run: function (c) { c.open(link("gh_new", "https://github.com/new")); } },
        stuck: ["Made it Private by mistake? Open the repository, tap Settings (along the top), stay on General, scroll to the very bottom (Danger Zone), tap Change visibility, then Change to public, then I have read and understand these effects, and confirm.",
                "Already made it before? Then it already exists: tap Next.",
                "\"Public\" only means the program file can be seen. Your numbers and your code are never in it."], guide: "gh_repo" },
      { title: "Upload this program",
        pic: function () { return { kind: "page", site: "github.com · your repository", items: [{ type: "menu", label: L("gh_add_file", "Add file"), value: L("gh_upload", "Upload files") }, { type: "file", value: fileName() }], btn: L("gh_commit", "Commit changes") }; },
        todo: function () { return "<b>" + esc(L("gh_add_file", "Add file")) + "</b> → <b>" + esc(L("gh_upload", "Upload files")) + "</b>, pick the file, then tap <b>" + esc(L("gh_commit", "Commit changes")) + "</b>."; },
        body: function () { return '<p>On your new repository\'s page, tap <b>' + esc(L("gh_add_file", "Add file")) + '</b>, then <b>' + esc(L("gh_upload", "Upload files")) + '</b>, and choose this file:</p>' +
          '<p class="dd-filename">' + esc(fileName()) + '</p>' +
          '<p>Then tap the green <b>' + esc(L("gh_commit", "Commit changes")) + '</b> button at the bottom.</p>' +
          '<p><b>You can ignore</b> the boxes for a message or description. Don\'t rename the file: its name becomes part of its address.</p>'; },
        action: { label: "Open my repository", run: function (c) { var a = setup.githubAddress(ghUser()); c.open(a ? "https://github.com/" + a.user + "/" + a.repo : "https://github.com/"); } },
        stuck: ["Can't find the file? On Windows, open File Explorer and look in Downloads. On a Mac, open Finder and look in Downloads.",
                "You can also drag the file from your folder onto the GitHub page, onto Drag files here to add them to your repository.",
                "See a Quick setup box instead of your files? Click uploading an existing file in that box."], guide: "gh_upload" },
      { title: "Turn on the website",
        pic: function () { return { kind: "page", site: "Settings · " + L("gh_pages", "Pages"), items: [{ type: "select", label: L("gh_source", "Source"), value: L("gh_deploy_branch", "Deploy from a branch") }, { type: "select", label: L("gh_branch", "Branch"), value: "main" }], btn: L("gh_save", "Save") }; },
        todo: function () { return "Pick <b>" + esc(L("gh_deploy_branch", "Deploy from a branch")) + "</b>, then <b>main</b>, then tap <b>" + esc(L("gh_save", "Save")) + "</b>."; },
        body: function () { return '<p>Tap the button. It opens your repository\'s <b>' + esc(L("gh_pages", "Pages")) + '</b> settings. There:</p>' +
          '<ol><li>Under <b>' + esc(L("gh_source", "Source")) + '</b>, pick <b>' + esc(L("gh_deploy_branch", "Deploy from a branch")) + '</b>.</li>' +
          '<li>Under <b>' + esc(L("gh_branch", "Branch")) + '</b>, change <b>None</b> to <b>main</b>, leave <b>/ (root)</b> as it is, and tap <b>' + esc(L("gh_save", "Save")) + '</b>.</li></ol>' +
          '<p>It worked when the page says your site is being built from the <b>main</b> branch.</p>' +
          '<p><b>You can ignore</b> custom domains, themes and everything else on that page.</p>' +
          '<p class="dd-note">Already says your site is live? Then it\'s on already: tap Next.</p>'; },
        action: { label: "Open the Pages settings", run: function (c) { var a = setup.githubAddress(ghUser()); c.open(a ? "https://github.com/" + a.user + "/" + a.repo + "/settings/pages" : "https://github.com/"); } },
        stuck: ["It says \"Upgrade or make this repository public to enable Pages\"? Your repository is Private. Tap General (top of the list on the left), scroll to the very bottom (Danger Zone), tap Change visibility, then Change to public, then I have read and understand these effects, and confirm. Then come back to Pages.",
                "Don't see Settings? It's along the top of your repository, on the right. Pages is in the list on the left.",
                "Branch shows \"None\"? Click it and choose main, then Save."], guide: "gh_pages" },
      { title: "Wait for it to go live",
        pic: { kind: "wait", caption: "GitHub is putting it online…" },
        todo: "Wait a minute or two, then tap Next.",
        body: function () { var a = setup.githubAddress(ghUser());
          var url = hostState() || (a && a.url) || "";
          return '<p>GitHub takes a few minutes, sometimes up to 10, to put a new website online. Your program\'s address will be:</p>' +
            (url ? '<p class="dd-filename">' + esc(url.replace(/^https:\/\//, "")) + '</p>' : "") +
            '<p>On your repository\'s page, a <b>green tick next to github-pages</b> (under Deployments, on the right) means it\'s online. Tap <b>Next</b> and we\'ll check too.</p>' +
            '<details class="dd-wiz-more"><summary>GitHub shows a different address?</summary>' +
            '<p class="dd-note">Paste the address GitHub shows (Settings, Pages, or the github-pages link). We\'ll add the file name.</p>' +
            '<input class="dd-input" id="dd-wiz-addr" placeholder="e.g. smith-tools.github.io/etsy/" autocomplete="off" autocapitalize="off" spellcheck="false"></details>'; },
        check: function (c) {
          var typed = c.el.querySelector("#dd-wiz-addr"), other = typed && typed.value.trim();
          if (other) {
            var u = setup.cleanAddress(other);
            if (!u) { c.status("warn", "That doesn't look like an address.", "It looks like yourname.github.io/something/"); return false; }
            if (!/\.html?$/i.test(u.split("?")[0])) u = u.replace(/\/?$/, "/") + encodeURIComponent(fileName());
            hostState(u);
          }
          var url = hostState(); if (!url) return true;
          c.status("info", "Checking your address…");
          return setup.isLive(url).then(function (live) {
            if (live === false) { c.status("warn", "Not online yet.", "GitHub can take up to 10 minutes. Wait a minute, then tap Next again."); return false; }
            return true;   // live, or we couldn't tell: carry on, the next screen shows the page itself
          });
        },
        stuck: ["Still not online after 10 minutes? Tap Back and check that Branch is set to main and saved.",
                "Check the file name on GitHub matches the one shown here exactly."], guide: "gh_wait" }
    ].concat(finishScreens("github"))
  };

  /* true = answers, false = not there yet (404), null = couldn't tell. GitHub Pages lets other
     pages read its answers, so a plain request shows whether the file is online yet. */
  setup.isLive = function (url) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 8000);
    return fetch(url, { method: "GET", cache: "no-store", credentials: "omit", signal: ctl.signal })
      .then(function (r) { return r.ok ? true : (r.status === 404 ? false : null); }, function () { return null; })
      .finally(function () { clearTimeout(t); });
  };

  /* "My own website or another host": general rules, the address, then the shared finish.
     The live helper gets hosting know-how in its instructions (see setup.helperPrompt). */
  setup.wizards.host_other = {
    title: "Put it on your phone · your own host", parent: "host",
    onDone: function () { dd.ui.toast("Use your new address from now on. Bookmark it!", 4500); },
    screens: [
      { title: "Upload it to your host",
        pic: function () { return { kind: "page", site: "your host's file manager", items: [{ type: "file", value: fileName() }], btn: "Upload" }; },
        todo: "Upload this program's file to your host, the same way you'd upload any web page.",
        body: function () { return '<p>Use your host\'s usual way to put a web page online (a file manager, an upload button, or a drag-and-drop page). Upload this file:</p>' +
          '<p class="dd-filename">' + esc(fileName()) + '</p>' +
          '<ul><li><b>Don\'t change the file.</b> Upload it exactly as it is, and keep its name.</li>' +
          '<li>The address must start with <b>https://</b>.</li>' +
          '<li>Don\'t put it in a password-protected or members-only area.</li></ul>' +
          '<p class="dd-note">Not sure how on your host? Ask the helper in the box below and say which host you use, for example "How do I upload it to Netlify?". ' +
          (dd.ai && dd.ai.hasCode() ? "" : "Tip: the AI helper gives step-by-step answers for your exact host once it's turned on (setup step 2).") + '</p>' + phoneWarn(); },
        stuck: ["Some website builders (WordPress, Wix, Squarespace) don't let you upload a whole web page. If yours won't, pick GitHub instead: tap Start over.",
                "If the helper later says your website won't let it reach Google, your host blocks outside connections. Pick GitHub instead."], guide: "other_upload" },
      { title: "Your program's address",
        pic: { kind: "page", site: "this page", items: [{ type: "field", label: "Your program's address", value: "https://example.com/" }] },
        todo: "Paste the address where your file is now online.",
        body: function () { return '<p>Paste the full address of the uploaded file. Open it in a new tab first to make sure it shows the program.</p>' +
          '<input class="dd-input" id="dd-wiz-addr" placeholder="https://your-site.com/' + esc(fileName()) + '" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(hostState()) + '">'; },
        mount: function (c) { var i = c.el.querySelector("#dd-wiz-addr"); if (!dd.env.isPhone && !i.value) i.focus(); },
        check: function (c) {
          var url = setup.cleanAddress(c.el.querySelector("#dd-wiz-addr").value);
          if (!url) { c.status("warn", "Paste the address first.", "It starts with https://"); return false; }
          if (!/^https:/.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) { c.status("warn", "That address starts with http://, not https://.", "Phones and the helper need https://. Most hosts can switch it on for free."); return false; }
          if (url.split("#")[0] === location.href.split("#")[0]) { c.status("warn", "That's the address of this page.", "Paste the address where you uploaded the file."); return false; }
          hostState(url); return true;
        },
        guide: "other_address" }
    ].concat(finishScreens("other"))
  };

  setup.wizards.host_tiiny = {
    title: "Put it on your phone · tiiny.host", parent: "host",
    onDone: function () { dd.ui.toast("Use your new address from now on. Bookmark it!", 4500); },
    screens: [
      { title: "Open tiiny.host and sign up",
        pic: function () { return { kind: "page", site: "tiiny.host", items: [{ type: "popup", label: "Start your free trial", value: "Start free trial", btn: L("host_skip_trial", "Skip") }] }; },
        todo: function () { return "Sign up. If a free trial pops up, tap <b>" + esc(L("host_skip_trial", "Skip")) + "</b>."; },
        body: function () { return (hostChoice() ? '<p>Your phone can\'t open a file that lives on this computer. So first we put the program online, at its own web address, using a free service called <b>tiiny.host</b>.</p>' + facts + publicNote : "") +
          '<p>Tap the button. tiiny.host opens in a new tab. Sign up for free, with your email or your Google account.</p>' +
          '<p>If tiiny.host offers a free trial, tap <b>' + esc(L("host_skip_trial", "Skip")) + '</b>. You don\'t need it.</p>' +
          '<p><b>You can ignore</b> anything about upgrading, custom domains, analytics or teams.</p>' + phoneWarn(); },
        action: { label: "Open tiiny.host", run: function (c) { c.open(link("host_open", "https://tiiny.host/")); } },
        stuck: ["Already have a tiiny.host account? Just log in.", "If a big \"Start free trial\" button appears, look below it for Skip. The trial turns into a paid plan, so skip it."], guide: "host_open" },
      { title: "Upload this program",
        pic: function () { return { kind: "page", site: "tiiny.host", items: [{ type: "file", value: fileName() }], btn: L("host_upload", "Upload file") }; },
        todo: function () { return "Tap <b>" + esc(L("host_upload", "Upload file")) + "</b> and pick this program's file."; },
        body: function () { return '<p>On tiiny.host, tap <b>' + esc(L("host_upload", "Upload file")) + '</b> and choose this file:</p>' +
          '<p class="dd-filename">' + esc(fileName()) + '</p>' +
          '<p class="dd-note">It\'s wherever you saved it from Etsy, often the Downloads folder.</p>' +
          '<p><b>You can ignore</b> options for passwords, domains or names. The address tiiny.host picks is fine.</p>'; },
        stuck: ["Can't find the file? On Windows, open File Explorer and look in Downloads. On a Mac, open Finder and look in Downloads.",
                "If tiiny.host says you've used your free project, the free plan holds one program at a time. Contact DigiDoughnut and we'll help."], guide: "host_upload" },
      { title: "Copy your new address",
        pic: { kind: "page", site: "tiiny.host", items: [{ type: "code", value: "something-12.tiiny.site", btn: "Copy" }] },
        todo: "Copy your new address from tiiny.host and paste it below.",
        body: function () { return '<p>When the upload finishes, tiiny.host shows your program\'s new address. It ends in <b>.tiiny.site</b>. Copy it, then paste it here.</p>' +
          '<input class="dd-input" id="dd-wiz-addr" placeholder="e.g. something-12.tiiny.site" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(hostState()) + '">'; },
        mount: function (c) { var i = c.el.querySelector("#dd-wiz-addr"); if (!dd.env.isPhone && !i.value) i.focus(); },
        check: function (c) {
          var url = setup.cleanAddress(c.el.querySelector("#dd-wiz-addr").value);
          if (!url) { c.status("warn", "Paste your new address first.", "It looks something like something-12.tiiny.site."); return false; }
          if (url.split("#")[0] === location.href.split("#")[0]) { c.status("warn", "That's the address of this page.", "Paste the new address that tiiny.host gave you."); return false; }
          hostState(url); return true;
        },
        stuck: ["On tiiny.host, the address is shown as a link. Copy it, or click the link and copy the address from the top of your browser.", "It's also listed under Live Projects when you log in to tiiny.host."], guide: "host_address" }
    ].concat(finishScreens("tiiny"))
  };

  /* ---------- "Sync my devices" (Phase 5) ----------
     Checked against Oran's screenshots, 2026-10-07 (project "etsy", Spark plan): left menu
     "Project shortcuts" > Authentication (Get started the first time) > Sign-in method >
     Native providers > Anonymous > Enable > Save; "Databases & Storage" > Realtime Database
     (under NoSQL) > Create Database > location > Start in locked mode > Enable; Rules tab >
     Publish; Settings > General > Your apps > </> > App nickname > Register app > Add Firebase
     SDK (copy icon bottom right of the big box) > Continue to console. NOT yet seen: the
     create-project screens. Labels go through L() so the noticeboard can correct them.
     Order matters: the database is made BEFORE the web app is registered, so the setup code
     Firebase shows includes the database's address (dd.sync also guesses it if it's missing). */
  function syncLink() { return link("sync_console", "https://console.firebase.google.com/"); }
  setup.wizards.sync = {
    title: "Sync my devices",
    onDone: function () { dd.ui.toast("Live sync is on. Now send it to your phone.", 4500); },
    screens: [
      { title: "Your own free database",
        pic: { kind: "hero", icons: ["💻", "🔄", "📱"], caption: "A change on one shows on the other" },
        todo: "Read this, then tap Next.",
        body: function () { return '<p>Live sync keeps your computer and phone synced: add something on one, and it appears on the other a moment later.</p>' +
          '<p><b>It also backs up your ' + esc(program.dataLabel || "numbers") + ' to the cloud.</b> If you clear your browser or lose a device, open the program again, reconnect, and it all comes back.</p>' +
          '<p>It uses a free Google <b>Firebase</b> database that belongs to you, in your own Google account. DigiDoughnut never sees it.</p>' +
          '<ul class="dd-facts"><li>✓ Free (Firebase\'s Spark plan). No credit card.</li><li>✓ About 10 minutes, once. Every DigiDoughnut program on this address shares it.</li><li>✓ Easiest on a computer.</li></ul>' +
          (dd.env.isFile ? '<p class="dd-status show warn">Put the program online first (setup step 3, Where it lives), then do this from its web address.</p>' : ""); } },
      { title: "Make a Firebase project",
        pic: function () { return { kind: "page", site: "console.firebase.google.com", items: [{ type: "field", label: "Project name", value: "My DigiDoughnut" }], btn: L("fb_continue", "Continue") }; },
        todo: function () { return "Open Firebase, make a new project, and follow it to the end."; },
        body: function () { return '<p>Tap the button. Firebase opens in a new tab. Sign in with your Google account, then make a new project.</p>' +
          '<ul><li>Name it anything, like <i>My DigiDoughnut</i>.</li><li>If it offers <b>Gemini</b> or <b>Google Analytics</b>, you can switch them off. You don\'t need them.</li>' +
          '<li>Tap <b>' + esc(L("fb_continue", "Continue")) + '</b> until your project opens. It says <b>Spark plan</b> next to its name: that\'s the free one.</li></ul>' +
          '<p><b>You can ignore</b> the "Next steps with Gemini" cards on the project\'s page, and anything about upgrading.</p>'; },
        action: { label: "Open Firebase", run: function (c) { c.open(syncLink()); } },
        stuck: ["Already have a Firebase project? You can use it: open it and tap Next.", "Don't see the menu on the left? Make the window wider, or tap ☰ at the top left."], guide: "sync_project" },
      { title: "Let the program sign in",
        pic: function () { return { kind: "page", site: "Authentication · " + L("fb_signin_method", "Sign-in method"), items: [{ type: "toggle", label: L("fb_anonymous", "Anonymous") + " · " + L("fb_enable", "Enable") }], btn: L("fb_save", "Save") }; },
        todo: function () { return "Switch on <b>" + esc(L("fb_anonymous", "Anonymous")) + "</b> and tap <b>" + esc(L("fb_save", "Save")) + "</b>."; },
        body: function () { return '<ol><li>On the left, under <b>Project shortcuts</b>, click <b>' + esc(L("fb_auth", "Authentication")) + '</b>. The first time, tap <b>' + esc(L("fb_get_started", "Get started")) + '</b>.</li>' +
          '<li>Open the <b>' + esc(L("fb_signin_method", "Sign-in method")) + '</b> tab.</li>' +
          '<li>Under <b>Native providers</b>, click <b>' + esc(L("fb_anonymous", "Anonymous")) + '</b>.</li>' +
          '<li>Switch on <b>' + esc(L("fb_enable", "Enable")) + '</b> and tap <b>' + esc(L("fb_save", "Save")) + '</b>. It then shows <b>Enabled</b>.</li></ol>' +
          '<p>Leave <b>Enable Auto clean-up</b> unticked.</p>' +
          '<p><b>You can ignore</b> the box about Firebase Dynamic Links, the yellow "Sign in with Google is recommended" bar (this program doesn\'t use passwords), and SMS Multi-factor / Upgrade to enable.</p>' +
          '<p class="dd-note">This lets your own programs sign in to your database without a password. Nobody gets an account.</p>'; },
        stuck: ["Save is grey? Switch on Enable first.", "Already shows Anonymous: Enabled? Then this step is done: tap Next."], guide: "sync_auth" },
      { title: "Make the database",
        pic: function () { return { kind: "page", site: L("fb_rtdb", "Realtime Database"), items: [{ type: "select", label: "Location", value: "United States" }, { type: "check", label: L("fb_locked", "Start in locked mode") }], btn: L("fb_enable_db", "Enable") }; },
        todo: function () { return "Create a <b>" + esc(L("fb_rtdb", "Realtime Database")) + "</b>: United States, locked mode."; },
        body: function () { return '<ol><li>On the left, open <b>' + esc(L("fb_db_menu", "Databases & Storage")) + '</b> and click <b>' + esc(L("fb_rtdb", "Realtime Database")) + '</b> (under NoSQL). <i>Not Firestore</i>: that\'s a different database.</li>' +
          '<li>Tap <b>' + esc(L("fb_create_db", "Create Database")) + '</b>.</li>' +
          '<li>Location: <b>United States</b> if you\'re in Canada or the US. In the UK or Europe, <b>Belgium (europe-west1)</b>.</li>' +
          '<li>Choose <b>' + esc(L("fb_locked", "Start in locked mode")) + '</b>, then tap <b>' + esc(L("fb_enable_db", "Enable")) + '</b>.</li></ol>' +
          '<p><b>You can ignore</b> Ask Gemini. If a banner says <i>Configure App Check</i>, close it with ✕ and <b>don\'t</b> turn App Check on: it would block the program.</p>'; },
        stuck: ["Picked Firestore by mistake? That's fine, just leave it. Open Realtime Database and create that one too.", "Already made it? Its page shows an address ending in firebaseio.com. Tap Next."], guide: "sync_db" },
      { title: "Paste the rules",
        pic: function () { return { kind: "page", site: L("fb_rtdb", "Realtime Database") + " · " + L("fb_rules", "Rules"), items: [{ type: "lines" }], btn: L("fb_publish", "Publish") }; },
        todo: function () { return "On the <b>" + esc(L("fb_rules", "Rules")) + "</b> tab, replace everything with these rules and tap <b>" + esc(L("fb_publish", "Publish")) + "</b>."; },
        body: function () { return '<p>On the database\'s page, open the <b>' + esc(L("fb_rules", "Rules")) + '</b> tab (next to Data). Click inside the box, select everything (Ctrl+A, or Cmd+A on a Mac), delete it, and paste these instead:</p>' +
          '<pre class="dd-rules" id="dd-rules"></pre><div class="dd-btnrow"><button class="dd-btn small ghost" data-copyrules>Copy the rules</button></div>' +
          '<p>Then tap <b>' + esc(L("fb_publish", "Publish")) + '</b>.</p>' +
          '<p class="dd-note">The rules let only signed-in copies of your programs read and write, each at its own secret address, and nothing else.</p>'; },
        mount: function (c) {
          var pre = c.el.querySelector("#dd-rules"); pre.textContent = dd.sync.rules;
          c.el.querySelector("[data-copyrules]").addEventListener("click", function (e) {
            var b = e.target;
            (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(dd.sync.rules) : Promise.reject()).then(function () { b.textContent = "Copied ✓"; },
              function () { var r = document.createRange(); r.selectNodeContents(pre); var s = getSelection(); s.removeAllRanges(); s.addRange(r); try { document.execCommand("copy"); b.textContent = "Copied ✓"; } catch (x) {} });
          });
        },
        stuck: ["Publish greyed out? Click inside the box and type a space, then delete it.", "Rules playground is for testing: you can ignore it."], guide: "sync_rules" },
      { title: "Copy your setup code",
        pic: function () { return { kind: "page", site: "Add Firebase to your web app", items: [{ type: "field", label: L("fb_nickname", "App nickname"), value: "My programs" }, { type: "code", value: "const firebaseConfig = {", btn: "📋" }], btn: L("fb_register", "Register app") }; },
        todo: function () { return "Register a web app, then copy the box with <b>firebaseConfig</b> in it."; },
        body: function () { return '<ol><li>On the left, click <b>' + esc(L("fb_settings", "Settings")) + '</b>, then <b>' + esc(L("fb_general", "General")) + '</b>.</li>' +
          '<li>Scroll to <b>' + esc(L("fb_your_apps", "Your apps")) + '</b> and click the web button <b>&lt;/&gt;</b>.</li>' +
          '<li>Type an <b>' + esc(L("fb_nickname", "App nickname")) + '</b>, like <i>My programs</i>. Leave <b>Firebase Hosting</b> unticked. Tap <b>' + esc(L("fb_register", "Register app")) + '</b>.</li>' +
          '<li>Under <b>' + esc(L("fb_add_sdk", "Add Firebase SDK")) + '</b>, click the copy icon at the <b>bottom right of the big box</b> (the one with <i>firebaseConfig</i> in it).</li>' +
          '<li>Tap <b>' + esc(L("fb_continue_console", "Continue to console")) + '</b>.</li></ol>' +
          '<p><b>You can ignore</b> the small <i>npm install firebase</i> box, "Use a &lt;script&gt; tag", and the "register a web app with an AI coding agent" box.</p>' +
          '<p class="dd-note">Already registered an app? Your setup code is on the same Settings page, under Your apps, then SDK setup and configuration.</p>'; },
        stuck: ["Copy the whole big box. Extra bits don't matter: the program picks out what it needs.", "The setup code isn't a password: it only says where your database is."], guide: "sync_config" },
      { title: "Paste it here",
        pic: { kind: "page", site: "this page", items: [{ type: "field", label: "Firebase setup code", value: "const firebaseConfig = {" }], btn: "Connect" },
        todo: "Paste the setup code in the box below, then tap Connect.",
        body: '<p>Paste the setup code, then tap <b>Connect</b>. We\'ll sign in to your database and check it works.</p>' +
              '<textarea class="dd-input" id="dd-wiz-fb" rows="5" placeholder="const firebaseConfig = { … }" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>',
        action: { label: "Connect", run: function (c) { connectSync(c); } },
        next: false,
        stuck: ["It says sign-in isn't switched on? Go back to the Authentication step.", "It says the database said no? Go back to the rules step and tap Publish."], guide: "sync_paste" },
      { title: "Live sync is on!",
        pic: { kind: "done" },
        body: function () { return '<p>This device is connected to your database. Now bring your phone in: tap <b>Send to my phone</b> and scan the square. The phone joins straight away and stays synced.</p>' +
          '<p class="dd-note">The chip at the top of the page shows "Synced" while everything is up to date.</p>'; },
        action: { label: "📲 Send to my phone", run: function (c) { c.next(); if (dd.pair && !dd.env.isPhone) setTimeout(dd.pair.open, 250); } },
        nextLabel: "Done" }
    ]
  };
  function connectSync(c) {
    var input = c.el.querySelector("#dd-wiz-fb"), btn = c.el.querySelector("[data-action]");
    if (btn.disabled) return;
    if (!input.value.trim()) { c.status("warn", "Paste your setup code in the box first."); input.focus(); return; }
    btn.disabled = true; btn.textContent = "Connecting…";
    c.status("info", "Signing in to your database. This can take up to 20 seconds.");
    dd.sync.connect(input.value).then(function (r) {
      btn.disabled = false; btn.textContent = "Connect";
      if (r.ok) { c.status("ok", "Connected!"); setTimeout(function () { if (document.body.contains(c.el)) c.next(); }, 600); }
      else c.status("err", r.title, r.help);
    });
  }


  /* ---------- bookmark name + Home Screen ----------
     Phones: a page added to the Home Screen opens like an app, and iPhones keep its saved
     numbers. Safari (and Chrome on iPhone, which uses Safari's engine) can clear a website's
     saved data when it hasn't been opened for about a week, unless it's on the Home Screen. */
  setup.bookmarkName = function () { return (program ? program.name : "My program") + " · DigiDoughnut"; };
  setup.homeScreenSteps = function () {
    if (dd.env.isIOS) return ["Tap the <b>Share</b> button (a square with an arrow pointing up). In Safari it's at the bottom of the screen; in Chrome it's at the top, next to the address.",
                              "Scroll down and tap <b>" + esc(L("home_ios_add", "Add to Home Screen")) + "</b>.",
                              "Keep the name <b>" + esc(program ? program.name : "") + "</b>, then tap <b>" + esc(L("home_ios_confirm", "Add")) + "</b>."];
    return ["Tap the browser menu (the three dots <b>⋮</b>, top right).",
            "Tap <b>" + esc(L("home_android_add", "Add to Home screen")) + "</b> (some phones say <b>Install app</b>).",
            "Keep the name <b>" + esc(program ? program.name : "") + "</b>, then tap <b>" + esc(L("home_android_confirm", "Add")) + "</b>."];
  };
  setup.showHomeScreen = function (arrived) {
    // Shown right after a QR scan: say what arrived here, instead of a toast on top of the sheet.
    var old = document.querySelector(".dd-toast"); if (old) old.remove();
    var got = arrived && arrived.got && arrived.got.length ? '<p class="dd-status show ok">✓ Your ' + esc(arrived.got.join(" and ")) + ' came across from your computer.</p>' : "";
    var sh = dd.ui.sheet(got + '<h2>Add it to your Home Screen</h2>' +
      '<p>Then it opens like an app, and your phone keeps your numbers safe.</p>' +
      '<ol class="dd-home-steps">' + setup.homeScreenSteps().map(function (t) { return "<li>" + t + "</li>"; }).join("") + '</ol>' +
      (dd.env.isIOS ? '<p class="dd-note">Why it matters: an iPhone can clear a website\'s saved data if you don\'t open it for about a week. Programs on the Home Screen are kept.</p>' : "") +
      '<p class="dd-note">From now on, open it from the Home Screen icon.</p>' +
      '<div class="dd-btnrow"><button class="dd-btn" data-close>Got it</button></div>');
    sh.querySelector("[data-close]").addEventListener("click", dd.ui.closeSheet);
    var s = state(); s.homeShown = Date.now(); saveState(s);
  };
  function needsHomeScreen() { return dd.env.isPhone && dd.env.isHosted && !dd.env.isStandalone; }

  /* ---------- start ---------- */
  setup.start = function (p) {
    program = p;
    setup.paint();
    dd.on("ai:changed", setup.paint);
    dd.on("sync:changed", setup.paint);
    dd.on("pair:received", function (ev) {
      setup.paint();
      // Just arrived on the phone by QR: the best moment to add it to the Home Screen.
      if (needsHomeScreen()) setTimeout(function () { setup.showHomeScreen(ev); }, 600);
    });
  };

  if (dd.menu) dd.menu.add({ id: "setup", icon: "🧰", label: "Setup & connections", order: 10,
    show: function () { var p = dd.getProgram && dd.getProgram(); return !!(p && p.setup !== false); },
    note: function () { var n = setup.doneCount(), t = visibleSteps().length; return n === t ? "All set up" : n + " of " + t + " steps done"; },
    run: function () { setup.openSheet(); } });

  if (dd.diag) dd.diag.addSection("Setup", function () {
    if (!program) return ["-"];
    var st = state();
    return [setup.steps.map(function (s) { return s.title + ": " + (s.done() ? "done" : "not yet"); }).join(" · "),
            "Wizards in progress: " + (Object.keys(st.wizards).map(function (k) { return k + " at screen " + (st.wizards[k].at + 1); }).join(", ") || "none")];
  });
})();
