/* ===== PROGRAM-SPECIFIC: AI Test (internal, never sold) =====
   The Phase 2 gate page. Connect a real Google code, then check: one real tool call,
   several tool calls in one reply, a chat that remembers, and the friendly messages for
   "out of free share", "took too long" and "no internet". */
const DD_PROGRAM = {
  id: "aitest",
  name: "AI Test",
  tagline: "Checks the AI connection",
  version: "0.2.0",
  schemaVersion: 1,
  accent: "#7c3aed",
  showExampleNotice: false,

  emptyData() { return { items: [] }; },
  exampleData() { return { items: [] }; },
  validateData(d) { return !!d && Array.isArray(d.items); },
  migrate(d) { return d; },

  mount(ctx) {
    const $ = ctx.ui.$, ui = ctx.ui;
    let history = [];

    const paintConn = () => {
      const c = dd.ai.connection();
      $("tConn").textContent = c ? `Connected to ${c.label} (code ${c.hint})` : "Not connected";
      $("tConn").className = "t-pill " + (c ? "on" : "off");
      $("tForget").style.display = c ? "" : "none";
    };
    paintConn();
    dd.on("ai:changed", paintConn);

    // Busy state: "Still working…" after 10 seconds, with a Stop button the whole time.
    let slowTimer = null;
    const busy = (on, statusId) => {
      document.querySelectorAll(".t-run").forEach((b) => (b.disabled = on));
      $("tStop").style.display = on ? "" : "none";
      clearTimeout(slowTimer);
      if (on) {
        ui.status(statusId, "info", "Working on it…");
        slowTimer = setTimeout(() => ui.status(statusId, "info", "Still working…", "Tap Stop if you'd rather not wait."), 10000);
      }
    };
    const showResult = (statusId, res, okTitle) => {
      busy(false);
      if (res.ok) ui.status(statusId, "ok", okTitle(res));
      else if (res.stopped) ui.status(statusId, "warn", "Stopped. Nothing else will happen.");
      else ui.status(statusId, "err", res.title, res.help);
    };
    $("tStop").addEventListener("click", () => dd.ai.stop());
    $("tPhone").addEventListener("click", () => dd.pair.open());

    // 1. Connect
    $("tConnect").addEventListener("click", async () => {
      busy(true, "tConnStatus");
      const res = await dd.ai.connect($("tCode").value);
      showResult("tConnStatus", res, (r) => `Connected to ${r.label}. The test tool call worked.`);
      if (res.ok) $("tCode").value = "";
    });
    $("tGetCode").addEventListener("click", () => window.open(dd.ai.getCodeLink("google"), "_blank", "noopener"));
    $("tForget").addEventListener("click", async () => {
      if (await ui.confirm("Forget your code?", "This program will stop using it. You can paste it again any time.", "Forget it", "Keep it")) {
        dd.ai.forget(); ui.toast("Code forgotten.");
      }
    });

    // Speed check: what is slow, if anything?
    $("tSpeed").addEventListener("click", async () => {
      if (!dd.ai.hasCode()) { $("tSpeedOut").textContent = "Connect your code first."; return; }
      document.querySelectorAll(".t-run").forEach((b) => (b.disabled = true));
      $("tStop").style.display = "";
      $("tSpeedOut").textContent = "Checking… (this can take a while if something is slow)";
      const show = (rows) => { $("tSpeedOut").textContent = rows.map((r) => `${r.step}: ${r.secs} s · ${r.outcome}`).join("\n"); };
      show(await dd.ai.speedCheck(30000, show));
      document.querySelectorAll(".t-run").forEach((b) => (b.disabled = false));
      $("tStop").style.display = "none";
    });

    // 2. Tools: several calls in ONE reply must all run.
    const addTool = { name: "add_item", description: "Add one item to the test list.",
      params: { text: { type: "string", description: "The item, a few words" } },
      run: (args) => { ctx.update((d) => { d.items.push({ id: ui.uid("t"), text: String(args.text || "item").slice(0, 60) }); }); return { ok: true, message: "Added " + args.text }; } };
    $("tTools").addEventListener("click", async () => {
      ctx.update((d) => { d.items = []; });
      busy(true, "tToolStatus");
      const res = await dd.ai.chat({ system: "You manage a list. Always use add_item, once per item.",
        history: [{ role: "user", text: "Add these three items to my list: apples, bread, milk." }], tools: [addTool] });
      const n = dd.getData().items.length;   // ctx.data is the data at mount; the first change makes a new object
      showResult("tToolStatus", res, () => n === 3 ? "Pass: all 3 items were added." : `Only ${n} of 3 items were added.`);
      if (res.ok && n !== 3) ui.status("tToolStatus", "warn", `Only ${n} of 3 items were added.`, "Run it again. If it keeps happening, send the support details.");
    });

    // 3. Chat that remembers (real turns, not one text blob).
    const say = (who, text) => { const d = document.createElement("div"); d.className = "t-msg " + who; d.textContent = text; $("tMsgs").appendChild(d); $("tMsgs").scrollTop = 1e9; };
    const send = async () => {
      const text = $("tChatIn").value.trim(); if (!text) return;
      $("tChatIn").value = ""; say("me", text);
      busy(true, "tChatStatus");
      const res = await dd.ai.chat({ system: "You are a friendly helper. Short answers, plain words.",
        history: history.concat({ role: "user", text }), tools: [addTool] });
      busy(false); ui.clearStatus("tChatStatus");
      if (res.ok) { history = res.history.slice(-40); say("bot", res.text || "Done."); }
      else if (res.stopped) say("bot", "Okay, I stopped.");
      else say("bot", res.title + " " + res.help);
    };
    $("tSend").addEventListener("click", send);
    $("tChatIn").addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    $("tClearChat").addEventListener("click", () => { history = []; $("tMsgs").innerHTML = ""; });

    // 4. Problem drills: the next request pretends to fail, so we can see the friendly message.
    document.querySelectorAll("[data-drill]").forEach((b) => b.addEventListener("click", async () => {
      dd.ai.drill = b.dataset.drill;
      const keep = Object.assign({}, dd.ai.limits);
      if (b.dataset.drill === "timeout") Object.assign(dd.ai.limits, { perModel: 2000, request: 3000, turn: 8000 });   // don't make Oran wait
      busy(true, "tDrillStatus");
      const res = await dd.ai.chat({ history: [{ role: "user", text: "Say hello." }] });
      dd.ai.drill = null; Object.assign(dd.ai.limits, keep);
      showResult("tDrillStatus", res, () => "That worked normally (the drill didn't trigger).");
    }));
  },

  render(ctx) {
    const list = ctx.ui.$("tItems");
    list.textContent = ctx.data.items.length ? ctx.data.items.map((i) => "• " + i.text).join("   ") : "(empty)";
  },

  summarizeForAI() { return ""; },
  helper: false,   // this page has its own test chat
  tools: [], knowledge: "", suggestions: []
};
