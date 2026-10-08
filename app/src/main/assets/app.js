(() => {
  const $ = (s) => document.querySelector(s);
  const n0 = (v) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) && n > 0 ? n : 0; };
  const r = (v) => Math.round(v);
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const keyToDate = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const smooth = () => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

  const MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5"];
  const state = {
    settings: { proteinGoal: 130, kcalGoal: 2200 },
    ai: { apiKey: "", model: MODELS[0] },
    meals: [],
    history: {},
    today: dayKey(),
    draft: null,
  };

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ---------- storage (on this phone) ----------
  function lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch {
      // Storage full: drop thumbnails from days older than two weeks, then retry once.
      pruneThumbs(14);
      try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { toast("Phone storage for the log is full. Remove some old meals."); return false; }
    }
  }
  function pruneThumbs(olderThanDays) {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - olderThanDays);
    const cut = dayKey(cutoff);
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith("ml.day.") || k.slice(7) >= cut) continue;
        const d = lsGet(k);
        if (!d || !Array.isArray(d.meals) || !d.meals.some((m) => m.thumb)) continue;
        d.meals.forEach((m) => { delete m.thumb; });
        localStorage.setItem(k, JSON.stringify(d));
      }
    } catch { /* ignore */ }
  }

  function loadAll() {
    const st = lsGet("ml.settings"); if (st) applySettings(st);
    const ai = lsGet("ml.ai");
    if (ai) {
      state.ai.apiKey = typeof ai.apiKey === "string" ? ai.apiKey : "";
      state.ai.model = MODELS.includes(ai.model) ? ai.model : MODELS[0];
    }
    const d = lsGet("ml.day." + state.today);
    state.meals = d && Array.isArray(d.meals) ? d.meals : [];
    const hist = {};
    for (let i = 1; i <= 6; i++) {
      const dd = new Date(); dd.setDate(dd.getDate() - i);
      const k = dayKey(dd);
      const day = lsGet("ml.day." + k);
      if (day) hist[k] = sumMeals(day.meals || []).protein;
    }
    state.history = hist;
  }
  const saveDay = () => lsSet("ml.day." + state.today, { date: state.today, meals: state.meals });
  const saveSettings = () => lsSet("ml.settings", state.settings);
  const saveAI = () => lsSet("ml.ai", state.ai);

  function applySettings(d) {
    const p = n0(d && d.proteinGoal), k = n0(d && d.kcalGoal);
    if (p >= 10 && p <= 500) state.settings.proteinGoal = r(p);
    if (k >= 500 && k <= 8000) state.settings.kcalGoal = r(k);
  }

  // ---------- math ----------
  function sumMeals(meals) {
    return meals.reduce((a, m) => ({
      protein: a.protein + n0(m.protein), kcal: a.kcal + n0(m.kcal), carbs: a.carbs + n0(m.carbs), fat: a.fat + n0(m.fat),
    }), { protein: 0, kcal: 0, carbs: 0, fat: 0 });
  }
  function draftTotals(d) {
    return d.items.reduce((a, it) => ({
      protein: a.protein + it.protein * it.scale, kcal: a.kcal + it.kcal * it.scale,
      carbs: a.carbs + it.carbs * it.scale, fat: a.fat + it.fat * it.scale,
    }), { protein: 0, kcal: 0, carbs: 0, fat: 0 });
  }

  // ---------- render: today ----------
  function renderToday() {
    const t = sumMeals(state.meals);
    const pg = state.settings.proteinGoal, kg = state.settings.kcalGoal;
    $("#pNow").textContent = r(t.protein);
    $("#pGoal").textContent = pg;
    const pct = Math.min(100, (t.protein / pg) * 100);
    $("#pBar").style.width = pct + "%";
    $("#pBarWrap").setAttribute("aria-valuenow", String(r(pct)));
    const left = $("#pLeft");
    if (t.protein >= pg) {
      const over = r(t.protein - pg);
      left.textContent = over > 0 ? `Goal reached, ${over} g over` : "Goal reached";
      left.classList.add("done");
    } else {
      left.textContent = `${r(pg - t.protein)} g to go`;
      left.classList.remove("done");
    }
    $("#kNow").textContent = r(t.kcal);
    $("#kGoal").textContent = kg;
    $("#kBar").style.width = Math.min(100, (t.kcal / kg) * 100) + "%";
    $("#cNow").textContent = r(t.carbs);
    $("#fNow").textContent = r(t.fat);
    $("#mCount").textContent = state.meals.length;
    $("#todayLabel").textContent = keyToDate(state.today).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }

  // ---------- render: meals ----------
  let pendingRemove = null;
  function renderMeals() {
    const list = $("#mealList");
    list.textContent = "";
    const meals = [...state.meals].sort((a, b) => (b.t || 0) - (a.t || 0));
    $("#emptyMeals").hidden = meals.length > 0;
    meals.forEach((m) => {
      const li = document.createElement("li");
      li.className = "meal";
      let thumb;
      if (typeof m.thumb === "string" && m.thumb.startsWith("data:image/")) {
        thumb = document.createElement("img"); thumb.src = m.thumb; thumb.alt = "";
      } else {
        thumb = document.createElement("div");
        thumb.textContent = (m.name || "?").trim().charAt(0).toUpperCase() || "?";
      }
      thumb.className = "thumb";
      const info = document.createElement("div"); info.className = "meal-info";
      const nm = document.createElement("div"); nm.className = "meal-name"; nm.textContent = m.name || "Meal";
      const meta = document.createElement("div"); meta.className = "meal-meta";
      const time = m.t ? new Date(m.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
      meta.textContent = `${r(n0(m.protein))} g protein · ${r(n0(m.kcal))} kcal${time ? " · " + time : ""}`;
      info.append(nm, meta);
      const rm = document.createElement("button");
      rm.type = "button"; rm.className = "rm" + (pendingRemove === m.id ? " confirm" : "");
      rm.textContent = pendingRemove === m.id ? "Tap to remove" : "Remove";
      rm.setAttribute("aria-label", pendingRemove === m.id ? `Confirm removing ${m.name || "meal"}` : `Remove ${m.name || "meal"}`);
      rm.addEventListener("click", () => {
        if (pendingRemove === m.id) {
          state.meals = state.meals.filter((x) => x.id !== m.id);
          pendingRemove = null;
          saveDay();
          renderLog();
          toast("Meal removed");
        } else {
          pendingRemove = m.id;
          renderMeals();
          setTimeout(() => { if (pendingRemove === m.id) { pendingRemove = null; renderMeals(); } }, 4000);
        }
      });
      li.append(thumb, info, rm);
      list.append(li);
    });
  }

  // ---------- render: week chart ----------
  function renderWeek() {
    const W = 320, H = 150, top = 24, bottom = 22, side = 6;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = keyToDate(state.today); d.setDate(d.getDate() - i);
      const k = dayKey(d);
      const v = i === 0 ? sumMeals(state.meals).protein : (state.history[k] || 0);
      days.push({ v, label: d.toLocaleDateString([], { weekday: "narrow" }), today: i === 0 });
    }
    const goal = state.settings.proteinGoal;
    const maxV = Math.max(goal * 1.15, ...days.map((d) => d.v), 1);
    const plotH = H - top - bottom;
    const y = (v) => top + plotH - (v / maxV) * plotH;
    const slot = (W - side * 2) / 7, bw = slot * 0.56;
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    s += `<line class="w-base" x1="${side}" x2="${W - side}" y1="${y(0)}" y2="${y(0)}"/>`;
    days.forEach((d, i) => {
      const x = side + slot * i + (slot - bw) / 2;
      const h = Math.max(0, y(0) - y(d.v));
      if (d.v > 0) {
        s += `<rect class="w-bar${d.today ? " today" : ""}" x="${x.toFixed(1)}" y="${y(d.v).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3"/>`;
        s += `<text class="w-val" x="${(x + bw / 2).toFixed(1)}" y="${(y(d.v) - 5).toFixed(1)}" text-anchor="middle">${r(d.v)}</text>`;
      }
      s += `<text class="w-lab" x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${d.today ? "Today" : d.label}</text>`;
    });
    s += `<line class="w-goal" x1="${side}" x2="${W - side}" y1="${y(goal).toFixed(1)}" y2="${y(goal).toFixed(1)}"/>`;
    s += `<text class="w-lab" x="${W - side}" y="${(y(goal) - 5).toFixed(1)}" text-anchor="end">goal ${goal} g</text>`;
    s += `</svg>`;
    $("#week").innerHTML = s;
  }

  function renderSetup() { $("#setup").hidden = !!state.ai.apiKey; }
  function renderLog() { renderToday(); renderMeals(); renderWeek(); }

  // ---------- goals form ----------
  $("#goalsToggle").addEventListener("click", () => {
    const f = $("#goalsForm"); const open = f.hidden;
    f.hidden = !open;
    $("#goalsToggle").setAttribute("aria-expanded", String(open));
    $("#goalsToggle").textContent = open ? "Close goals" : "Edit goals";
    if (open) { $("#goalP").value = state.settings.proteinGoal; $("#goalK").value = state.settings.kcalGoal; }
  });
  $("#goalsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = n0($("#goalP").value), k = n0($("#goalK").value);
    if (p < 10 || p > 500) { toast("Protein goal must be between 10 and 500 g."); return; }
    if (k < 500 || k > 8000) { toast("Calorie goal must be between 500 and 8000 kcal."); return; }
    state.settings = { proteinGoal: r(p), kcalGoal: r(k) };
    saveSettings();
    renderToday(); renderWeek();
    $("#goalsForm").hidden = true;
    $("#goalsToggle").textContent = "Edit goals";
    $("#goalsToggle").setAttribute("aria-expanded", "false");
    toast("Goals saved");
  });

  // ---------- manual entry ----------
  $("#manualForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#manName").value.trim() || "Meal";
    const p = n0($("#manP").value), k = n0($("#manK").value);
    addMeal({ id: uid(), t: Date.now(), name, protein: +p.toFixed(1), kcal: r(k), carbs: 0, fat: 0, source: "manual" });
    $("#manualForm").reset();
    $("#manual").open = false;
  });

  function addMeal(m) {
    state.meals = [...state.meals, m];
    saveDay();
    renderLog();
    toast(`Added: ${r(n0(m.protein))} g protein`);
  }

  // ---------- settings ----------
  function goToSettings() {
    $("#apiKey").value = state.ai.apiKey;
    $("#model").value = state.ai.model;
    $("#settings").scrollIntoView({ behavior: smooth(), block: "start" });
    setTimeout(() => $("#apiKey").focus(), 350);
  }
  $("#openSettings").addEventListener("click", goToSettings);
  $("#setupGo").addEventListener("click", goToSettings);
  $("#toggleKey").addEventListener("click", () => {
    const k = $("#apiKey"); const show = k.type === "password";
    k.type = show ? "text" : "password";
    $("#toggleKey").textContent = show ? "Hide" : "Show";
    $("#toggleKey").setAttribute("aria-label", show ? "Hide key" : "Show key");
  });
  function keyStatus(text, ok) { const el = $("#keyStatus"); el.textContent = text; el.className = ok === undefined ? "small" : ok ? "ok" : "bad"; }
  $("#saveKey").addEventListener("click", () => {
    const key = $("#apiKey").value.trim();
    if (key && !key.startsWith("sk-")) { keyStatus("That doesn't look like an Anthropic key. Keys start with sk-ant-.", false); return; }
    state.ai.apiKey = key;
    state.ai.model = MODELS.includes($("#model").value) ? $("#model").value : MODELS[0];
    saveAI();
    renderSetup();
    keyStatus(key ? "Saved. You're ready to snap a meal." : "Saved without a key. Photo estimates are off until you add one.", !!key);
  });
  $("#testKey").addEventListener("click", async () => {
    const key = $("#apiKey").value.trim();
    if (!key) { keyStatus("Paste your key first.", false); return; }
    const btn = $("#testKey"); btn.disabled = true; keyStatus("Checking…");
    try {
      await callClaude({ key, model: $("#model").value, prompt: 'Reply with only this JSON: {"ok":true}', maxTokens: 20 });
      keyStatus("Key works. Tap Save to keep it.", true);
    } catch (e) {
      keyStatus(errorText(e), false);
    } finally { btn.disabled = false; }
  });
  $("#clearKey").addEventListener("click", () => {
    state.ai.apiKey = ""; saveAI(); $("#apiKey").value = ""; renderSetup();
    keyStatus("Key removed from this phone.");
  });

  // ---------- Claude API ----------
  async function callClaude({ key, model, prompt, imageB64, signal, maxTokens = 2000 }) {
    const content = [];
    if (imageB64) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageB64 } });
    content.push({ type: "text", text: prompt });
    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content }] }),
      });
    } catch (e) {
      if (e && e.name === "AbortError") throw { code: "cancelled" };
      throw { code: "network" };
    }
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok) {
      const msg = (body && body.error && body.error.message) || "";
      if (res.status === 401) throw { code: "bad_key" };
      if (res.status === 403) throw { code: "forbidden", msg };
      if (res.status === 429) throw { code: "rate_limited" };
      if (res.status === 400 && /credit|billing|balance/i.test(msg)) throw { code: "no_credit" };
      if (res.status === 404 || /model/i.test(msg) && res.status === 400) throw { code: "bad_model" };
      if (res.status === 413) throw { code: "too_big" };
      if (res.status >= 500) throw { code: "overloaded" };
      throw { code: "api", msg };
    }
    const text = ((body && body.content) || []).filter((b) => b && b.type === "text").map((b) => b.text).join("\n").trim();
    if (!text) throw { code: "empty" };
    return parseJSON(text);
  }
  function parseJSON(text) {
    try { return JSON.parse(text); } catch { /* continue */ }
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) { try { return JSON.parse(fence[1]); } catch { /* continue */ } }
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    if (a !== -1 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch { /* continue */ } }
    throw { code: "invalid_json" };
  }
  function errorText(e) {
    const code = e && e.code;
    switch (code) {
      case "no_key": return "Add your Anthropic API key in Settings first.";
      case "bad_key": return "Anthropic rejected the API key. Check it in Settings.";
      case "forbidden": return "This API key isn't allowed to do that. Check its permissions at console.anthropic.com.";
      case "no_credit": return "Your Anthropic account is out of credit. Add credit at console.anthropic.com, then try again.";
      case "rate_limited": return "Too many requests right now. Wait a minute and tap Re-estimate.";
      case "bad_model": return "That model isn't available on your key. Pick the other model in Settings.";
      case "too_big": return "That photo is too large. Try another photo.";
      case "overloaded": return "Claude is busy right now. Tap Re-estimate in a moment.";
      case "network": return "No connection. Check your internet and tap Re-estimate.";
      case "invalid_json": return "The estimate came back garbled. Tap Re-estimate to try again.";
      case "empty": return "No estimate came back. Add a short description and tap Re-estimate.";
      case "api": return "Claude couldn't process that request" + (e.msg ? `: ${String(e.msg).slice(0, 140)}` : ".");
      default: return "Something went wrong. Tap Re-estimate to try again.";
    }
  }

  function buildPrompt(notes, hasImage) {
    const ctx = hasImage
      ? "The attached image is a photo of a meal someone is about to eat."
      : "Someone describes a meal they are about to eat (no photo).";
    return [
      "You estimate nutrition for meals.",
      ctx,
      notes ? `Their own notes about the meal (trust these quantities over what you see): """${notes.slice(0, 1500)}"""` : "They gave no extra notes.",
      "Identify each distinct food or drink, estimate the portion (household measure and grams), and estimate protein, calories, carbohydrate and fat for that portion using standard nutrition reference values (USDA-style). Include visible oils, sauces, dressings and sides. If something is ambiguous, pick the most likely common version and keep going.",
      "Reply with only JSON in exactly this shape:",
      '{"meal_name":"2-5 word name","items":[{"name":"grilled chicken breast","portion":"1 piece (~150 g)","grams":150,"protein_g":46,"calories":248,"carbs_g":0,"fat_g":5.4}],"confidence":"low|medium|high","note":"one short sentence naming the biggest uncertainty"}',
      "Use plain numbers (no units) for grams, protein_g, calories, carbs_g and fat_g. If there is no food at all, return an empty items array and say so in note.",
    ].join("\n\n");
  }

  // ---------- analysis flow ----------
  let ctl = null, timer = null, lastInput = null;

  function setBusy(on, text) {
    $("#status").hidden = !on;
    $("#reEst").disabled = on;
    $("#addLog").disabled = on || !(state.draft && state.draft.items.length);
    if (on) {
      $("#statusText").textContent = text;
      const t0 = Date.now();
      $("#statusTime").textContent = "0 s";
      clearInterval(timer);
      timer = setInterval(() => { $("#statusTime").textContent = `${Math.floor((Date.now() - t0) / 1000)} s`; }, 1000);
    } else {
      clearInterval(timer);
    }
  }
  function showErr(msg) { const e = $("#err"); e.textContent = msg; e.hidden = !msg; }

  async function analyze() {
    if (!lastInput) return;
    if (!state.ai.apiKey) {
      showErr(errorText({ code: "no_key" }));
      renderSetup();
      return;
    }
    const notes = $("#notes").value.trim();
    const text = lastInput.text ? [lastInput.text, notes].filter(Boolean).join("\n") : notes;
    showErr("");
    if (ctl) ctl.abort();
    ctl = new AbortController();
    const myCtl = ctl;
    setBusy(true, lastInput.imageB64 ? "Reading your plate…" : "Working out the numbers…");
    try {
      const res = await callClaude({
        key: state.ai.apiKey, model: state.ai.model, signal: myCtl.signal,
        prompt: buildPrompt(text, !!lastInput.imageB64), imageB64: lastInput.imageB64,
      });
      if (myCtl !== ctl) return;
      const items = Array.isArray(res && res.items) ? res.items : [];
      const draft = {
        name: String((res && res.meal_name) || "").slice(0, 80) || (items[0] && String(items[0].name)) || "Meal",
        confidence: ["low", "medium", "high"].includes(res && res.confidence) ? res.confidence : "medium",
        note: String((res && res.note) || "").slice(0, 240),
        thumb: lastInput.thumb || null,
        source: lastInput.imageB64 ? "photo" : "text",
        items: items.slice(0, 20).map((it) => ({
          name: String((it && it.name) || "Food").slice(0, 80),
          portion: String((it && it.portion) || "").slice(0, 60),
          grams: n0(it && it.grams),
          protein: n0(it && it.protein_g),
          kcal: n0(it && it.calories),
          carbs: n0(it && it.carbs_g),
          fat: n0(it && it.fat_g),
          scale: 1,
        })),
      };
      state.draft = draft;
      renderDraft();
      if (!draft.items.length) showErr(draft.note || "No food found. Try another photo, or add a description below and tap Re-estimate.");
    } catch (e) {
      if (myCtl !== ctl) return;
      if (e && e.code === "cancelled") showErr(state.draft ? "" : "Stopped. Tap Re-estimate when you're ready.");
      else showErr(errorText(e));
    } finally {
      if (myCtl === ctl) { setBusy(false); ctl = null; }
    }
  }

  function renderDraft() {
    const d = state.draft;
    const has = !!(d && d.items.length);
    $("#facts").hidden = !has;
    $("#addLog").disabled = !has || !!ctl;
    if (!has) return;
    $("#mealName").value = d.name;
    const ul = $("#items");
    ul.textContent = "";
    d.items.forEach((it, i) => {
      const li = document.createElement("li"); li.className = "item";
      const main = document.createElement("div"); main.className = "item-main";
      const nm = document.createElement("span"); nm.className = "item-name"; nm.textContent = it.name;
      const por = document.createElement("span"); por.className = "item-portion";
      const g = it.grams ? `${r(it.grams * it.scale)} g` : "";
      por.textContent = [it.portion + (it.scale !== 1 ? ` × ${it.scale}` : ""), g].filter(Boolean).join(" · ");
      main.append(nm, por);
      const nums = document.createElement("div"); nums.className = "item-nums";
      const pb = document.createElement("b"); pb.textContent = `${r(it.protein * it.scale)} g protein`;
      const kc = document.createElement("span"); kc.textContent = `${r(it.kcal * it.scale)} kcal`;
      nums.append(pb, kc);
      const row = document.createElement("div"); row.className = "item-ctl";
      const mk = (txt, act, cls, label) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = txt; b.dataset.act = act; b.dataset.i = i; b.setAttribute("aria-label", label); return b; };
      const sc = document.createElement("span"); sc.className = "scale"; sc.textContent = `×${it.scale}`;
      row.append(
        mk("−", "dec", "step", `Smaller portion of ${it.name}`), sc,
        mk("+", "inc", "step", `Bigger portion of ${it.name}`),
        mk("Remove", "rm", "rm", `Remove ${it.name}`),
      );
      li.append(main, nums, row);
      ul.append(li);
    });
    const t = draftTotals(d);
    $("#tKcal").textContent = r(t.kcal);
    $("#tPro").textContent = `${r(t.protein)} g`;
    $("#tCarb").textContent = `${r(t.carbs)} g`;
    $("#tFat").textContent = `${r(t.fat)} g`;
    const conf = $("#conf"); conf.textContent = "";
    const chip = document.createElement("span"); chip.className = "chip " + d.confidence; chip.textContent = `${d.confidence} confidence`;
    conf.append(chip, document.createTextNode(d.note || ""));
  }

  $("#items").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]"); if (!b || !state.draft) return;
    const i = Number(b.dataset.i); const it = state.draft.items[i]; if (!it) return;
    if (b.dataset.act === "inc") it.scale = Math.min(4, +(it.scale + 0.25).toFixed(2));
    if (b.dataset.act === "dec") it.scale = Math.max(0.25, +(it.scale - 0.25).toFixed(2));
    if (b.dataset.act === "rm") state.draft.items.splice(i, 1);
    renderDraft();
    if (!state.draft.items.length) showErr("All items removed. Discard, or tap Re-estimate.");
  });
  $("#mealName").addEventListener("input", (e) => { if (state.draft) state.draft.name = e.target.value; });

  // ---------- image prep ----------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
      img.src = url;
    });
  }
  async function prepImage(file) {
    const { img, url } = await loadImage(file);
    const w = img.naturalWidth, h = img.naturalHeight;
    const k = Math.min(1, 1568 / Math.max(w, h));
    const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const imageB64 = c.toDataURL("image/jpeg", 0.85).split(",")[1];
    const t = document.createElement("canvas"); const S = 120; t.width = S; t.height = S;
    const side = Math.min(w, h);
    t.getContext("2d").drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, S, S);
    const thumb = t.toDataURL("image/jpeg", 0.6);
    return { imageB64, thumb, preview: url };
  }

  let previewURL = null;
  async function onPhoto(file) {
    if (!file) return;
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null;
    resetReview(false);
    $("#review").hidden = false;
    $("#shot").hidden = false;
    $("#notes").value = "";
    setBusy(true, "Preparing photo…");
    let p;
    try { p = await prepImage(file); }
    catch {
      setBusy(false);
      $("#shot").hidden = true;
      lastInput = null;
      showErr("That photo couldn't be opened. Try another photo, or describe the meal instead.");
      return;
    }
    previewURL = p.preview;
    $("#shotImg").src = p.preview;
    lastInput = { imageB64: p.imageB64, thumb: p.thumb, text: "" };
    $("#review").scrollIntoView({ behavior: smooth(), block: "start" });
    analyze();
  }
  ["#camInput", "#libInput"].forEach((sel) => {
    $(sel).addEventListener("change", (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; onPhoto(f); });
  });

  $("#descGo").addEventListener("click", () => {
    const text = $("#descText").value.trim();
    if (!text) { toast("Describe what you ate first."); return; }
    resetReview(false);
    $("#review").hidden = false;
    $("#shot").hidden = true;
    $("#notes").value = "";
    lastInput = { imageB64: null, thumb: null, text };
    $("#review").scrollIntoView({ behavior: smooth(), block: "start" });
    analyze();
  });

  $("#reEst").addEventListener("click", () => analyze());
  $("#stopBtn").addEventListener("click", () => { if (ctl) ctl.abort(); });

  function resetReview(hide = true) {
    if (ctl) { ctl.abort(); ctl = null; }
    setBusy(false);
    state.draft = null;
    showErr("");
    $("#facts").hidden = true;
    $("#addLog").disabled = true;
    if (hide) {
      $("#review").hidden = true;
      lastInput = null;
      if (previewURL) { URL.revokeObjectURL(previewURL); previewURL = null; }
      $("#shotImg").removeAttribute("src");
    }
  }
  $("#discard").addEventListener("click", () => { resetReview(true); $("#capture").scrollIntoView({ block: "start" }); });

  $("#addLog").addEventListener("click", () => {
    const d = state.draft; if (!d || !d.items.length) return;
    const t = draftTotals(d);
    addMeal({
      id: uid(), t: Date.now(),
      name: ($("#mealName").value.trim() || d.name || "Meal").slice(0, 80),
      protein: +t.protein.toFixed(1), kcal: r(t.kcal), carbs: +t.carbs.toFixed(1), fat: +t.fat.toFixed(1),
      items: d.items.map((it) => ({ name: it.name, portion: it.portion, scale: it.scale, grams: r(it.grams * it.scale), protein: +(it.protein * it.scale).toFixed(1), kcal: r(it.kcal * it.scale) })),
      thumb: d.thumb, source: d.source, confidence: d.confidence,
    });
    $("#descText").value = "";
    $("#typeIt").open = false;
    resetReview(true);
    $("#mealsHead").scrollIntoView({ block: "start", behavior: smooth() });
  });

  // ---------- day rollover ----------
  function checkDay() {
    const k = dayKey();
    if (k !== state.today) { state.today = k; loadAll(); renderLog(); }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkDay(); });
  setInterval(checkDay, 60000);

  // ---------- boot ----------
  loadAll();
  pruneThumbs(45);
  $("#apiKey").value = state.ai.apiKey;
  $("#model").value = state.ai.model;
  renderSetup();
  renderLog();
})();
