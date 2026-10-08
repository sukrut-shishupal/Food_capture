(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const n0 = (v) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) && n > 0 ? n : 0; };
  const r = (v) => Math.round(v);
  const r1 = (v) => Math.round(v * 10) / 10;
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const keyToDate = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = keyToDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
  const smooth = () => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
  const normName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const LB = 2.20462;

  const MEAL_TYPES = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snack", "Snack"]];
  const typeLabel = (t) => (MEAL_TYPES.find((x) => x[0] === t) || MEAL_TYPES[3])[1];
  function autoType(date = new Date()) {
    const h = date.getHours() + date.getMinutes() / 60;
    if (h >= 4 && h < 11) return "breakfast";
    if (h >= 11 && h < 15.5) return "lunch";
    if (h >= 17.5 && h < 22.5) return "dinner";
    return "snack";
  }

  const DEFAULT_SETTINGS = { proteinGoal: 130, kcalGoal: 2200, waterGoal: 8, glassMl: 250, unit: "kg" };
  const DEFAULT_REMINDERS = [
    { id: "r-breakfast", time: "08:30", label: "Protein with breakfast", kind: "protein", smart: true, on: false },
    { id: "r-lunch", time: "13:00", label: "Lunch protein check", kind: "protein", smart: true, on: false },
    { id: "r-snack", time: "16:30", label: "Protein snack", kind: "protein", smart: true, on: false },
    { id: "r-evening", time: "20:30", label: "Evening protein check", kind: "protein", smart: true, on: false },
    { id: "r-water-am", time: "11:00", label: "Drink some water", kind: "water", smart: true, on: false },
    { id: "r-water-pm", time: "15:00", label: "Drink some water", kind: "water", smart: true, on: false },
  ];

  const state = {
    settings: { ...DEFAULT_SETTINGS },
    today: dayKey(),
    view: dayKey(),
    day: { date: dayKey(), meals: [], water: 0 },
    favs: [],
    weights: [],
    reminders: [],
    aiStatus: "CHECKING",
    draft: null,
    range: 7,
    tab: "today",
  };

  // ---------- storage ----------
  function lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch {
      pruneThumbs(14);
      try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { toast("Phone storage for the log is full. Delete some old meals or back up and restore."); return false; }
    }
  }
  function dayKeys() {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("ml.day.")) out.push(k.slice(7)); } } catch { /* ignore */ }
    return out.sort();
  }
  function getDay(k) {
    const d = lsGet("ml.day." + k);
    return { date: k, meals: d && Array.isArray(d.meals) ? d.meals : [], water: d ? n0(d.water) : 0, goal: d && d.goal ? n0(d.goal) : 0 };
  }
  function saveDay() {
    const d = state.day;
    lsSet("ml.day." + d.date, { date: d.date, meals: d.meals, water: d.water, goal: state.settings.proteinGoal });
    if (d.date === state.today) syncSummary();
  }
  function pruneThumbs(olderThanDays) {
    const cut = addDays(dayKey(), -olderThanDays);
    dayKeys().filter((k) => k < cut).forEach((k) => {
      const d = lsGet("ml.day." + k);
      if (!d || !Array.isArray(d.meals) || !d.meals.some((m) => m.thumb)) return;
      d.meals.forEach((m) => { delete m.thumb; });
      try { localStorage.setItem("ml.day." + k, JSON.stringify(d)); } catch { /* ignore */ }
    });
  }
  function loadSettings() {
    const s = lsGet("ml.settings") || {};
    const st = { ...DEFAULT_SETTINGS };
    if (n0(s.proteinGoal) >= 10 && n0(s.proteinGoal) <= 500) st.proteinGoal = r(n0(s.proteinGoal));
    if (n0(s.kcalGoal) >= 500 && n0(s.kcalGoal) <= 8000) st.kcalGoal = r(n0(s.kcalGoal));
    if (n0(s.waterGoal) >= 1 && n0(s.waterGoal) <= 30) st.waterGoal = r(n0(s.waterGoal));
    if (n0(s.glassMl) >= 50 && n0(s.glassMl) <= 1000) st.glassMl = r(n0(s.glassMl));
    if (s.unit === "lb" || s.unit === "kg") st.unit = s.unit;
    state.settings = st;
  }
  function loadAll() {
    loadSettings();
    state.favs = Array.isArray(lsGet("ml.favs")) ? lsGet("ml.favs") : [];
    state.weights = Array.isArray(lsGet("ml.weights")) ? lsGet("ml.weights") : [];
    const rem = lsGet("ml.reminders");
    state.reminders = Array.isArray(rem) ? rem : DEFAULT_REMINDERS.map((x) => ({ ...x }));
    state.day = getDay(state.view);
  }

  // ---------- bridges to the Android app ----------
  function makeBridge(obj, cbName) {
    const pending = new Map();
    let seq = 0;
    window[cbName] = (id, msg) => {
      const p = pending.get(id);
      if (!p) return;
      if (msg && msg.event) { if (p.onEvent) p.onEvent(msg); return; }
      pending.delete(id);
      if (msg && msg.error) p.reject({ code: msg.error, message: msg.message || "" });
      else p.resolve(msg || {});
    };
    return (method, args, { onEvent, signal } = {}) => {
      if (!obj) return Promise.reject({ code: "no_bridge" });
      const id = cbName + (++seq);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, onEvent });
        if (signal) {
          if (signal.aborted) { pending.delete(id); reject({ code: "cancelled" }); return; }
          signal.addEventListener("abort", () => { try { obj.cancel(id); } catch { /* ignore */ } }, { once: true });
        }
        try { obj[method](id, ...args); }
        catch (e) { pending.delete(id); reject({ code: "error", message: String(e) }); }
      });
    };
  }
  const nanoCall = makeBridge(window.MealLensAI, "__nano");
  const Nano = {
    present: !!window.MealLensAI,
    status: () => nanoCall("status", []).then((x) => x.status),
    download: (onEvent) => nanoCall("download", [], { onEvent }).then((x) => x.status),
    generate: (img, prompt, signal) => nanoCall("generate", [img || "", prompt], { signal }).then((x) => String(x.text || "")),
  };
  const appObj = window.MealLensApp;
  const appCall = makeBridge(appObj, "__app");
  const App = {
    present: !!appObj,
    sync(json) { try { appObj && appObj.syncSummary(json); } catch { /* ignore */ } },
    setReminders(json) { try { appObj && appObj.setReminders(json); } catch { /* ignore */ } },
    status() { try { return appObj ? JSON.parse(appObj.notificationStatus()) : null; } catch { return null; } },
    requestNotifications() { try { appObj && appObj.requestNotifications(); } catch { /* ignore */ } },
    openNotificationSettings() { try { appObj && appObj.openNotificationSettings(); } catch { /* ignore */ } },
    openExact() { try { appObj && appObj.openExactAlarmSettings(); } catch { /* ignore */ } },
    test() { try { appObj && appObj.testNotification(); } catch { /* ignore */ } },
    scan: () => appCall("scanBarcode", []),
    lookup: (code) => appCall("lookupBarcode", [code]),
    share: (name, mime, text) => appCall("shareFile", [name, mime, text]),
  };
  window.__appEvent = (ev) => {
    if (!ev) return;
    if (ev.type === "permissions") renderNotifStatus(ev.status);
    if (ev.type === "resume") {
      checkDay();
      renderNotifStatus();
      if (state.aiStatus !== "AVAILABLE" && !downloading) refreshAI();
    }
  };

  function syncSummary() {
    const d = state.view === state.today ? state.day : getDay(state.today);
    const t = sumMeals(d.meals);
    App.sync(JSON.stringify({
      date: state.today, protein: r1(t.protein), kcal: r(t.kcal), goal: state.settings.proteinGoal,
      water: d.water, waterGoal: state.settings.waterGoal,
    }));
  }

  // ---------- toast with undo ----------
  let toastTimer, undoFn = null;
  function toast(msg, undo) {
    $("#toastText").textContent = msg;
    undoFn = undo || null;
    $("#toastUndo").hidden = !undo;
    $("#toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $("#toast").hidden = true; undoFn = null; }, undo ? 5000 : 2600);
  }
  $("#toastUndo").addEventListener("click", () => {
    const f = undoFn; undoFn = null; $("#toast").hidden = true;
    if (f) f();
  });

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
  function dayMet(k) {
    const d = k === state.view ? state.day : getDay(k);
    if (!d.meals.length) return false;
    return sumMeals(d.meals).protein >= (d.goal || state.settings.proteinGoal);
  }
  function streaks() {
    let current = 0;
    let k = state.today;
    if (!dayMet(k)) k = addDays(k, -1);
    while (dayMet(k)) { current++; k = addDays(k, -1); }
    let best = 0, run = 0, prev = null;
    const keys = new Set(dayKeys()); keys.add(state.today);
    [...keys].sort().forEach((key) => {
      if (dayMet(key)) { run = prev && addDays(prev, 1) === key ? run + 1 : 1; prev = key; best = Math.max(best, run); }
      else { run = 0; prev = null; }
    });
    return { current, best: Math.max(best, current) };
  }

  // ---------- select options ----------
  function fillTypeSelect(sel) { sel.textContent = ""; MEAL_TYPES.forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; sel.append(o); }); }
  ["#manType", "#revType", "#emType", "#bcType"].forEach((s) => fillTypeSelect($(s)));
  function mealType(m) { return m.type || (m.t ? autoType(new Date(m.t)) : "snack"); }
  function defaultType() { return state.view === state.today ? autoType() : "snack"; }

  // ---------- tabs ----------
  function showTab(t) {
    state.tab = t;
    $("#tabToday").hidden = t !== "today";
    $("#tabTrends").hidden = t !== "trends";
    $("#tabSettings").hidden = t !== "settings";
    $("#navToday").setAttribute("aria-selected", String(t === "today"));
    $("#navTrends").setAttribute("aria-selected", String(t === "trends"));
    $("#navSettings").setAttribute("aria-selected", String(t === "settings"));
    if (t === "trends") renderTrends();
    if (t === "settings") renderSettings();
    window.scrollTo({ top: 0 });
  }
  $("#navToday").addEventListener("click", () => showTab("today"));
  $("#navTrends").addEventListener("click", () => showTab("trends"));
  $("#navSettings").addEventListener("click", () => showTab("settings"));

  // ---------- sheets ----------
  let openSheet = null;
  function sheetOpen(id) {
    if (openSheet) sheetClose();
    openSheet = $(id);
    openSheet.hidden = false;
    $("#scrim").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function sheetClose() {
    if (!openSheet) return;
    openSheet.hidden = true;
    openSheet = null;
    $("#scrim").hidden = true;
    document.body.style.overflow = "";
  }
  $("#scrim").addEventListener("click", sheetClose);
  $$("[data-close]").forEach((b) => b.addEventListener("click", sheetClose));
  window.__back = () => {
    if (openSheet) { sheetClose(); return true; }
    if (state.tab !== "today") { showTab("today"); return true; }
    if (state.view !== state.today) { setView(state.today); return true; }
    return false;
  };

  // ---------- day navigation ----------
  function setView(k) {
    state.view = k > state.today ? state.today : k;
    state.day = getDay(state.view);
    resetReview(true);
    renderToday();
  }
  $("#dayPrev").addEventListener("click", () => setView(addDays(state.view, -1)));
  $("#dayNext").addEventListener("click", () => setView(addDays(state.view, 1)));
  function checkDay() {
    const k = dayKey();
    if (k === state.today) return;
    const wasToday = state.view === state.today;
    state.today = k;
    if (wasToday) setView(k); else renderToday();
    syncSummary();
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkDay(); });
  setInterval(checkDay, 60000);

  // ---------- render: today ----------
  function renderToday() {
    const isToday = state.view === state.today;
    const d = keyToDate(state.view);
    const yest = addDays(state.today, -1) === state.view;
    $("#dayTitle").textContent = isToday ? "Today" : yest ? "Yesterday" : d.toLocaleDateString([], { weekday: "long" });
    $("#daySub").textContent = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    $("#dayNext").disabled = isToday;
    $("#pastNote").hidden = isToday;

    const t = sumMeals(state.day.meals);
    const pg = isToday ? state.settings.proteinGoal : (state.day.goal || state.settings.proteinGoal);
    const kg = state.settings.kcalGoal;
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
    $("#mCount").textContent = state.day.meals.length;

    renderWater();
    renderMeals();
    renderQuick();
    const s = streaks();
    $("#streakText").textContent = s.current ? `${s.current}-day streak` : "Start a streak";
  }

  function renderWater() {
    const w = state.day.water, g = state.settings.waterGoal;
    $("#wNow").textContent = w;
    $("#wGoal").textContent = g;
    $("#wMl").textContent = w * state.settings.glassMl;
    const box = $("#glasses"); box.textContent = "";
    for (let i = 0; i < Math.max(g, w); i++) { const el = document.createElement("i"); if (i < w) el.className = "full"; box.append(el); }
    $("#wMinus").disabled = w <= 0;
  }
  $("#wPlus").addEventListener("click", () => { state.day.water = Math.min(40, state.day.water + 1); saveDay(); renderWater(); });
  $("#wMinus").addEventListener("click", () => { state.day.water = Math.max(0, state.day.water - 1); saveDay(); renderWater(); });

  function renderMeals() {
    const box = $("#mealGroups");
    box.textContent = "";
    const meals = state.day.meals;
    $("#emptyMeals").hidden = meals.length > 0;
    MEAL_TYPES.forEach(([type, label]) => {
      const list = meals.filter((m) => mealType(m) === type).sort((a, b) => (a.t || 0) - (b.t || 0));
      if (!list.length) return;
      const t = sumMeals(list);
      const g = document.createElement("div"); g.className = "group";
      const head = document.createElement("div"); head.className = "group-head";
      const h = document.createElement("h3"); h.textContent = label;
      const sub = document.createElement("span"); sub.textContent = `${r(t.protein)} g protein · ${r(t.kcal)} kcal`;
      head.append(h, sub);
      const ul = document.createElement("ul"); ul.className = "meal-list";
      list.forEach((m) => {
        const li = document.createElement("li"); li.className = "meal"; li.tabIndex = 0; li.setAttribute("role", "button");
        li.setAttribute("aria-label", `Edit ${m.name || "meal"}`);
        let thumb;
        if (typeof m.thumb === "string" && m.thumb.startsWith("data:image/")) { thumb = document.createElement("img"); thumb.src = m.thumb; thumb.alt = ""; }
        else { thumb = document.createElement("div"); thumb.textContent = (m.name || "?").trim().charAt(0).toUpperCase() || "?"; }
        thumb.className = "thumb";
        const info = document.createElement("div"); info.className = "meal-info";
        const nm = document.createElement("div"); nm.className = "meal-name"; nm.textContent = m.name || "Meal";
        const meta = document.createElement("div"); meta.className = "meal-meta";
        const time = m.t ? new Date(m.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
        meta.textContent = `${r(n0(m.protein))} g protein · ${r(n0(m.kcal))} kcal${time ? " · " + time : ""}`;
        info.append(nm, meta);
        const go = document.createElement("span"); go.className = "go"; go.textContent = "›"; go.setAttribute("aria-hidden", "true");
        li.append(thumb, info, go);
        const open = () => openMealEditor(m.id);
        li.addEventListener("click", open);
        li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
        ul.append(li);
      });
      g.append(head, ul);
      box.append(g);
    });
  }

  // ---------- adding meals ----------
  function stampFor(view) {
    if (view === state.today) return Date.now();
    const d = keyToDate(view); const now = new Date();
    d.setHours(now.getHours(), now.getMinutes(), 0, 0);
    return d.getTime();
  }
  function addMeal(m, { fav = false, quiet = false } = {}) {
    const meal = { id: uid(), t: stampFor(state.view), type: m.type || defaultType(), ...m };
    meal.id = uid();
    state.day.meals = [...state.day.meals, meal];
    saveDay();
    if (fav) saveFav(meal);
    renderToday();
    if (!quiet) {
      const view = state.view;
      toast(`Added ${meal.name || "meal"} · ${r(n0(meal.protein))} g`, () => {
        if (state.view !== view) return;
        state.day.meals = state.day.meals.filter((x) => x.id !== meal.id);
        saveDay(); renderToday();
      });
    }
    return meal;
  }
  function mealCopy(src) {
    const { name, protein, kcal, carbs, fat, items, source, thumb, barcode } = src;
    return { name, protein: n0(protein), kcal: n0(kcal), carbs: n0(carbs), fat: n0(fat), items: items || undefined, source: source || "again", thumb: thumb || undefined, barcode: barcode || undefined };
  }

  // ---------- favorites and "log again" ----------
  function favKey(m) { return normName(m.name) + "|" + r(n0(m.protein)); }
  function isFav(m) { const k = favKey(m); return state.favs.some((f) => favKey(f) === k); }
  function saveFav(m) {
    if (isFav(m)) return;
    const f = mealCopy(m);
    delete f.thumb;
    f.id = uid();
    state.favs = [f, ...state.favs].slice(0, 40);
    lsSet("ml.favs", state.favs);
  }
  function removeFav(m) {
    const k = favKey(m);
    state.favs = state.favs.filter((f) => favKey(f) !== k);
    lsSet("ml.favs", state.favs);
  }
  function frequentMeals() {
    const counts = new Map();
    for (let i = 0; i < 21; i++) {
      const k = addDays(state.today, -i);
      const d = k === state.view ? state.day : getDay(k);
      d.meals.forEach((m) => {
        const key = favKey(m);
        const c = counts.get(key) || { n: 0, m };
        c.n++; if ((m.t || 0) > (c.m.t || 0)) c.m = m;
        counts.set(key, c);
      });
    }
    return [...counts.values()].sort((a, b) => b.n - a.n || (b.m.t || 0) - (a.m.t || 0)).map((c) => c.m);
  }
  function renderQuick() {
    const box = $("#quickChips"); box.textContent = "";
    const favKeys = new Set(state.favs.map(favKey));
    const list = [...state.favs.map((f) => ({ m: f, fav: true })), ...frequentMeals().filter((m) => !favKeys.has(favKey(m))).map((m) => ({ m, fav: false }))].slice(0, 12);
    $("#quick").hidden = list.length === 0;
    list.forEach(({ m, fav }) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "chip-btn" + (fav ? " fav" : "");
      const nm = document.createElement("span"); nm.textContent = (m.name || "Meal").slice(0, 28);
      const p = document.createElement("b"); p.textContent = `${r(n0(m.protein))} g`;
      b.append(nm, p);
      b.setAttribute("aria-label", `Log ${m.name} again, ${r(n0(m.protein))} grams protein`);
      b.addEventListener("click", () => addMeal({ ...mealCopy(m), type: defaultType() }));
      box.append(b);
    });
  }

  // ---------- manual entry ----------
  $("#manType").value = autoType();
  $("#manual").addEventListener("toggle", () => { if ($("#manual").open) $("#manType").value = defaultType(); });
  $("#manualForm").addEventListener("submit", (e) => {
    e.preventDefault();
    addMeal({
      name: $("#manName").value.trim() || "Meal",
      protein: r1(n0($("#manP").value)), kcal: r(n0($("#manK").value)),
      carbs: r1(n0($("#manC").value)), fat: r1(n0($("#manF").value)),
      type: $("#manType").value, source: "manual",
    }, { fav: $("#manFav").checked });
    $("#manualForm").reset();
    $("#manual").open = false;
  });

  // ---------- meal editor ----------
  let editId = null, delArmed = false;
  function openMealEditor(id) {
    const m = state.day.meals.find((x) => x.id === id); if (!m) return;
    editId = id; delArmed = false;
    $("#emDel").textContent = "Delete";
    $("#emName").value = m.name || "";
    $("#emP").value = r1(n0(m.protein)); $("#emK").value = r(n0(m.kcal));
    $("#emC").value = r1(n0(m.carbs)); $("#emF").value = r1(n0(m.fat));
    $("#emType").value = mealType(m);
    $("#emFav").checked = isFav(m);
    sheetOpen("#mealSheet");
  }
  $("#emScale").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-k]"); if (!b) return;
    const k = Number(b.dataset.k);
    [["#emP", r1], ["#emK", r], ["#emC", r1], ["#emF", r1]].forEach(([s, f]) => { $(s).value = f(n0($(s).value) * k); });
  });
  $("#emSave").addEventListener("click", () => {
    const m = state.day.meals.find((x) => x.id === editId); if (!m) { sheetClose(); return; }
    const wasFav = isFav(m);
    if (wasFav) removeFav(m);
    const oldP = n0(m.protein);
    m.name = $("#emName").value.trim() || m.name || "Meal";
    m.protein = r1(n0($("#emP").value)); m.kcal = r(n0($("#emK").value));
    m.carbs = r1(n0($("#emC").value)); m.fat = r1(n0($("#emF").value));
    m.type = $("#emType").value;
    if (Array.isArray(m.items) && oldP > 0 && m.protein !== oldP) delete m.items; // item breakdown no longer matches
    if ($("#emFav").checked) saveFav(m);
    state.day.meals = [...state.day.meals];
    saveDay(); renderToday(); sheetClose();
    toast("Meal updated");
  });
  $("#emCopy").addEventListener("click", () => {
    const m = state.day.meals.find((x) => x.id === editId); if (!m) return;
    sheetClose();
    if (state.view !== state.today) setView(state.today);
    addMeal({ ...mealCopy(m), type: autoType() });
  });
  $("#emDel").addEventListener("click", () => {
    if (!delArmed) { delArmed = true; $("#emDel").textContent = "Tap again to delete"; return; }
    const m = state.day.meals.find((x) => x.id === editId);
    state.day.meals = state.day.meals.filter((x) => x.id !== editId);
    saveDay(); renderToday(); sheetClose();
    if (m) toast("Meal deleted", () => { state.day.meals = [...state.day.meals, m]; saveDay(); renderToday(); });
  });

  // ---------- goal button and calculator ----------
  $("#goalBtn").addEventListener("click", () => openCalc(true));
  $("#calcOpen").addEventListener("click", () => openCalc(false));
  function latestWeightKg() { const w = [...state.weights].sort((a, b) => (a.date < b.date ? 1 : -1))[0]; return w ? w.kg : 0; }
  function openCalc(fromToday) {
    $("#calcUnit").textContent = state.settings.unit;
    const kg = latestWeightKg();
    $("#calcW").value = kg ? r1(state.settings.unit === "lb" ? kg * LB : kg) : "";
    $("#goalDirect").value = state.settings.proteinGoal;
    calcRender();
    sheetOpen("#calcSheet");
    if (fromToday) setTimeout(() => { $("#goalDirect").focus(); $("#goalDirect").select(); }, 250);
  }
  function setProteinGoal(v) {
    state.settings.proteinGoal = Math.min(500, Math.max(10, r(v)));
    lsSet("ml.settings", state.settings);
    if (state.view === state.today) saveDay(); else syncSummary();
    renderToday(); renderSettings(); sheetClose();
    toast(`Protein goal set to ${state.settings.proteinGoal} g`);
  }
  $("#goalDirectSave").addEventListener("click", () => {
    const v = n0($("#goalDirect").value);
    if (v < 10 || v > 500) { toast("Protein goal must be between 10 and 500 g."); return; }
    setProteinGoal(v);
  });
  $("#goalDirect").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#goalDirectSave").click(); });
  function calcValue() {
    const w = n0($("#calcW").value); if (!w) return 0;
    const kg = state.settings.unit === "lb" ? w / LB : w;
    const per = Number((document.querySelector('input[name="calcGoal"]:checked') || {}).value || 1.6);
    return Math.round((kg * per) / 5) * 5;
  }
  function calcRender() { const v = calcValue(); $("#calcOut").textContent = v ? `${v} g` : "Enter your weight"; $("#calcUse").disabled = !v; }
  $("#calcW").addEventListener("input", calcRender);
  $("#calcGoals").addEventListener("change", calcRender);
  $("#calcUse").addEventListener("click", () => {
    const v = calcValue(); if (!v) return;
    const w = n0($("#calcW").value);
    if (w) logWeight(state.settings.unit === "lb" ? w / LB : w, true);
    setProteinGoal(v);
  });

  // ---------- trends ----------
  $("#rng7").addEventListener("click", () => { state.range = 7; renderTrends(); });
  $("#rng30").addEventListener("click", () => { state.range = 30; renderTrends(); });
  function renderTrends() {
    $("#rng7").setAttribute("aria-pressed", String(state.range === 7));
    $("#rng30").setAttribute("aria-pressed", String(state.range === 30));
    const N = state.range;
    const days = [];
    for (let i = N - 1; i >= 0; i--) {
      const k = addDays(state.today, -i);
      const d = k === state.view ? state.day : getDay(k);
      const t = sumMeals(d.meals);
      days.push({ k, v: t.protein, logged: d.meals.length > 0, met: d.meals.length > 0 && t.protein >= (d.goal || state.settings.proteinGoal) });
    }
    drawBars($("#trendChart"), days, state.settings.proteinGoal);
    const logged = days.filter((d) => d.logged);
    $("#tAvg").textContent = logged.length ? `${r(logged.reduce((a, d) => a + d.v, 0) / logged.length)} g` : "–";
    $("#tHit").textContent = `${days.filter((d) => d.met).length}/${N}`;
    const s = streaks();
    $("#tStreak").textContent = s.current;
    $("#tBest").textContent = s.best;
    renderTopFoods();
    renderWeight();
  }
  function drawBars(el, days, goal) {
    const W = 340, H = 170, top = 22, bottom = 22, side = 4;
    const maxV = Math.max(goal * 1.15, ...days.map((d) => d.v), 1);
    const plotH = H - top - bottom;
    const y = (v) => top + plotH - (v / maxV) * plotH;
    const slot = (W - side * 2) / days.length, bw = Math.max(3, slot * 0.6);
    const showVals = days.length <= 10;
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
    s += `<line class="w-base" x1="${side}" x2="${W - side}" y1="${y(0)}" y2="${y(0)}"/>`;
    days.forEach((d, i) => {
      const x = side + slot * i + (slot - bw) / 2;
      if (d.v > 0) {
        s += `<rect class="w-bar${d.k === state.today ? " today" : ""}" data-k="${d.k}" x="${x.toFixed(1)}" y="${y(d.v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(0) - y(d.v)).toFixed(1)}" rx="2" style="cursor:pointer"/>`;
        if (showVals) s += `<text class="w-val" x="${(x + bw / 2).toFixed(1)}" y="${(y(d.v) - 5).toFixed(1)}" text-anchor="middle">${r(d.v)}</text>`;
      }
      // Hit area so empty days can be opened too.
      s += `<rect data-k="${d.k}" x="${(side + slot * i).toFixed(1)}" y="${top}" width="${slot.toFixed(1)}" height="${plotH}" fill="transparent" style="cursor:pointer"/>`;
      const every = days.length <= 10 ? 1 : 5;
      if (i % every === 0 || i === days.length - 1) {
        const dt = keyToDate(d.k);
        const lab = d.k === state.today ? "Today" : days.length <= 10 ? dt.toLocaleDateString([], { weekday: "narrow" }) : `${dt.getMonth() + 1}/${dt.getDate()}`;
        s += `<text class="w-lab" x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${lab}</text>`;
      }
    });
    s += `<line class="w-goal" x1="${side}" x2="${W - side}" y1="${y(goal).toFixed(1)}" y2="${y(goal).toFixed(1)}"/>`;
    s += `<text class="w-lab" x="${W - side}" y="${(y(goal) - 5).toFixed(1)}" text-anchor="end">goal ${goal} g</text>`;
    s += `</svg>`;
    el.innerHTML = s;
  }
  $("#trendChart").addEventListener("click", (e) => {
    const t = e.target.closest("[data-k]"); if (!t) return;
    setView(t.getAttribute("data-k")); showTab("today");
  });
  function renderTopFoods() {
    const map = new Map();
    for (let i = 0; i < 30; i++) {
      const k = addDays(state.today, -i);
      const d = k === state.view ? state.day : getDay(k);
      d.meals.forEach((m) => {
        const key = normName(m.name); if (!key) return;
        const c = map.get(key) || { name: m.name, n: 0, p: 0, kc: 0 };
        c.n++; c.p += n0(m.protein); c.kc += n0(m.kcal);
        map.set(key, c);
      });
    }
    const list = [...map.values()].sort((a, b) => b.n - a.n || b.p - a.p).slice(0, 6);
    const ul = $("#topFoods"); ul.textContent = "";
    $("#topEmpty").hidden = list.length > 0;
    list.forEach((c) => {
      const li = document.createElement("li");
      const nm = document.createElement("div"); nm.className = "nm"; nm.textContent = c.name;
      const val = document.createElement("div"); val.className = "val"; val.textContent = `${r(c.p / c.n)} g`;
      const meta = document.createElement("div"); meta.className = "meta";
      const dens = c.kc > 0 ? ` · ${r1((c.p / c.kc) * 100)} g protein per 100 kcal` : "";
      meta.textContent = `Logged ${c.n}× in 30 days${dens}`;
      const per = document.createElement("div"); per.className = "meta"; per.style.textAlign = "right"; per.textContent = "per serving";
      li.append(nm, val, meta, per);
      ul.append(li);
    });
  }

  // ---------- weight ----------
  function fmtW(kg) { return state.settings.unit === "lb" ? `${r1(kg * LB)} lb` : `${r1(kg)} kg`; }
  function logWeight(kg, quiet) {
    if (!(kg >= 20 && kg <= 400)) { toast("Enter a weight between 20 and 400 kg (44–880 lb)."); return; }
    const date = state.today;
    state.weights = [...state.weights.filter((w) => w.date !== date), { date, kg: r1(kg) }].sort((a, b) => (a.date < b.date ? -1 : 1));
    lsSet("ml.weights", state.weights);
    if (!quiet) toast(`Weight logged: ${fmtW(kg)}`);
  }
  $("#weightForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = n0($("#wtIn").value);
    logWeight(state.settings.unit === "lb" ? v / LB : v);
    $("#wtIn").value = "";
    renderWeight();
  });
  function renderWeight() {
    $("#wtUnit").textContent = state.settings.unit;
    const ws = [...state.weights].sort((a, b) => (a.date < b.date ? -1 : 1));
    const el = $("#weightChart"), ul = $("#weightList");
    ul.textContent = "";
    if (!ws.length) { el.innerHTML = ""; $("#wtSummary").textContent = "Log your weight now and then to see the trend and to calculate your protein goal."; return; }
    const last = ws[ws.length - 1];
    const cutoff = addDays(state.today, -30);
    const base = ws.filter((w) => w.date <= cutoff).pop() || ws[0];
    const diff = last.kg - base.kg;
    const unitDiff = state.settings.unit === "lb" ? diff * LB : diff;
    $("#wtSummary").textContent = ws.length > 1
      ? `Latest ${fmtW(last.kg)}. ${unitDiff === 0 ? "No change" : (unitDiff > 0 ? "Up " : "Down ") + Math.abs(r1(unitDiff)) + " " + state.settings.unit} since ${keyToDate(base.date).toLocaleDateString([], { month: "short", day: "numeric" })}.`
      : `Latest ${fmtW(last.kg)}. Log again on another day to see a trend.`;
    const pts = ws.slice(-60);
    if (pts.length > 1) {
      const W = 340, H = 140, pad = 26;
      const vals = pts.map((p) => (state.settings.unit === "lb" ? p.kg * LB : p.kg));
      let lo = Math.min(...vals), hi = Math.max(...vals);
      if (hi - lo < 2) { lo -= 1; hi += 1; }
      const t0 = keyToDate(pts[0].date).getTime(), t1 = keyToDate(pts[pts.length - 1].date).getTime() || t0 + 1;
      const x = (k) => pad + ((keyToDate(k).getTime() - t0) / Math.max(1, t1 - t0)) * (W - pad * 2);
      const y = (v) => 14 + (1 - (v - lo) / (hi - lo)) * (H - 36);
      const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(vals[i]).toFixed(1)}`).join(" ");
      let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
      s += `<text class="w-lab" x="2" y="${y(hi) + 4}">${r1(hi)}</text><text class="w-lab" x="2" y="${y(lo) + 4}">${r1(lo)}</text>`;
      s += `<path class="w-line" d="${d}"/>`;
      pts.forEach((p, i) => { s += `<circle class="w-dot${i === pts.length - 1 ? " last" : ""}" cx="${x(p.date).toFixed(1)}" cy="${y(vals[i]).toFixed(1)}" r="${i === pts.length - 1 ? 4 : 2.5}"/>`; });
      const f = (k) => { const dt = keyToDate(k); return `${dt.getMonth() + 1}/${dt.getDate()}`; };
      s += `<text class="w-lab" x="${pad}" y="${H - 4}">${f(pts[0].date)}</text><text class="w-lab" x="${W - pad}" y="${H - 4}" text-anchor="end">${f(last.date)}</text>`;
      s += `</svg>`;
      el.innerHTML = s;
    } else el.innerHTML = "";
    ws.slice(-5).reverse().forEach((w) => {
      const li = document.createElement("li");
      const nm = document.createElement("div"); nm.className = "nm"; nm.textContent = keyToDate(w.date).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
      const val = document.createElement("div"); val.className = "val"; val.textContent = fmtW(w.kg);
      const rm = document.createElement("button"); rm.type = "button"; rm.className = "rmx"; rm.textContent = "Remove";
      rm.addEventListener("click", () => { state.weights = state.weights.filter((x) => x.date !== w.date); lsSet("ml.weights", state.weights); renderWeight(); });
      li.append(nm, val, rm);
      ul.append(li);
    });
  }

  // ---------- settings: goals ----------
  function renderSettings() {
    const s = state.settings;
    $("#goalP").value = s.proteinGoal; $("#goalK").value = s.kcalGoal;
    $("#goalW").value = s.waterGoal; $("#glassMl").value = s.glassMl; $("#unitSel").value = s.unit;
    renderNotifStatus();
    renderReminders();
    renderFavs();
    renderAI();
  }
  $("#goalsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const p = n0($("#goalP").value), k = n0($("#goalK").value), w = n0($("#goalW").value), ml = n0($("#glassMl").value);
    if (p < 10 || p > 500) { toast("Protein goal must be between 10 and 500 g."); return; }
    if (k < 500 || k > 8000) { toast("Calorie goal must be between 500 and 8000 kcal."); return; }
    if (w < 1 || w > 30) { toast("Water goal must be between 1 and 30 glasses."); return; }
    if (ml < 50 || ml > 1000) { toast("Glass size must be between 50 and 1000 ml."); return; }
    state.settings = { proteinGoal: r(p), kcalGoal: r(k), waterGoal: r(w), glassMl: r(ml), unit: $("#unitSel").value === "lb" ? "lb" : "kg" };
    lsSet("ml.settings", state.settings);
    if (state.view === state.today) saveDay(); else syncSummary();
    renderToday();
    toast("Goals saved");
  });

  // ---------- settings: reminders ----------
  function renderNotifStatus(st) {
    const box = $("#notifStatus"); box.textContent = "";
    const s = st || App.status();
    if (!s) {
      const p = document.createElement("p"); p.className = "small"; p.textContent = "Reminders work in the Meal Lens Android app.";
      box.append(p); $("#notifBtns").hidden = true; $("#testNotif").hidden = true; return;
    }
    const a = document.createElement("span"); a.className = s.notifications ? "ok" : "bad";
    a.textContent = s.notifications ? "Notifications are allowed." : "Notifications are off, so reminders can't appear.";
    const b = document.createElement("span"); b.className = s.exact ? "ok" : "small";
    b.textContent = s.exact ? "Reminders arrive on time." : "Reminders may arrive a few minutes late. Turn on exact timing to fix that.";
    box.append(a, b);
    $("#notifBtns").hidden = s.notifications && s.exact;
    $("#allowNotif").hidden = s.notifications;
    $("#exactBtn").hidden = s.exact;
    $("#testNotif").hidden = false;
  }
  let askedNotif = false;
  $("#allowNotif").addEventListener("click", () => {
    if (askedNotif) App.openNotificationSettings(); else App.requestNotifications();
    askedNotif = true;
    $("#allowNotif").textContent = "Open notification settings";
  });
  $("#exactBtn").addEventListener("click", () => App.openExact());
  $("#testNotif").addEventListener("click", () => {
    const s = App.status();
    if (s && !s.notifications) { toast("Allow notifications first."); return; }
    App.test(); toast("Test notification sent");
  });
  function saveReminders() {
    lsSet("ml.reminders", state.reminders);
    App.setReminders(JSON.stringify(state.reminders));
  }
  function renderReminders() {
    const box = $("#remList"); box.textContent = "";
    state.reminders.sort((a, b) => (a.time < b.time ? -1 : 1));
    state.reminders.forEach((rm) => {
      const row = document.createElement("div"); row.className = "rem";
      const time = document.createElement("input"); time.type = "time"; time.value = rm.time; time.id = "rt-" + rm.id; time.setAttribute("aria-label", "Reminder time");
      const label = document.createElement("input"); label.type = "text"; label.value = rm.label; label.id = "rl-" + rm.id; label.setAttribute("aria-label", "Reminder text"); label.maxLength = 60;
      const sw = document.createElement("label"); sw.className = "switch";
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!rm.on; cb.id = "ro-" + rm.id; cb.setAttribute("aria-label", `Turn on ${rm.label} at ${rm.time}`);
      sw.append(cb, document.createElement("span"));
      const opts = document.createElement("div"); opts.className = "opts";
      const kind = document.createElement("select"); kind.id = "rk-" + rm.id; kind.setAttribute("aria-label", "Reminder type");
      [["protein", "Protein"], ["water", "Water"]].forEach(([v, l]) => { const o = document.createElement("option"); o.value = v; o.textContent = l; kind.append(o); });
      kind.value = rm.kind;
      const smartL = document.createElement("label"); const smart = document.createElement("input"); smart.type = "checkbox"; smart.checked = rm.smart !== false; smart.id = "rs-" + rm.id;
      smartL.append(smart, document.createTextNode("Only if behind"));
      const del = document.createElement("button"); del.type = "button"; del.className = "rmx"; del.textContent = "Delete";
      opts.append(kind, smartL, del);
      row.append(time, label, sw, opts);
      box.append(row);

      time.addEventListener("change", () => { if (time.value) { rm.time = time.value; saveReminders(); } });
      label.addEventListener("change", () => { rm.label = label.value.trim() || (rm.kind === "water" ? "Drink some water" : "Protein check"); saveReminders(); });
      kind.addEventListener("change", () => { rm.kind = kind.value; saveReminders(); });
      smart.addEventListener("change", () => { rm.smart = smart.checked; saveReminders(); });
      cb.addEventListener("change", () => {
        rm.on = cb.checked; saveReminders();
        const s = App.status();
        if (rm.on && s && !s.notifications && !askedNotif) { App.requestNotifications(); askedNotif = true; $("#allowNotif").textContent = "Open notification settings"; }
        if (rm.on) toast(`Reminder on at ${fmtTime(rm.time)}`);
      });
      del.addEventListener("click", () => {
        const copy = { ...rm };
        state.reminders = state.reminders.filter((x) => x.id !== rm.id); saveReminders(); renderReminders();
        toast("Reminder deleted", () => { state.reminders.push(copy); saveReminders(); renderReminders(); });
      });
    });
  }
  function fmtTime(hm) { const [h, m] = hm.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
  $("#addRem").addEventListener("click", () => {
    const now = new Date(); now.setHours(now.getHours() + 1, 0, 0, 0);
    const rm = { id: "r-" + uid().slice(0, 8), time: `${String(now.getHours()).padStart(2, "0")}:00`, label: "Protein check", kind: "protein", smart: true, on: true };
    state.reminders.push(rm); saveReminders(); renderReminders();
    const s = App.status();
    if (s && !s.notifications && !askedNotif) { App.requestNotifications(); askedNotif = true; }
    const el = document.getElementById("rt-" + rm.id); if (el) el.focus();
  });

  // ---------- settings: favorites ----------
  function renderFavs() {
    const ul = $("#favList"); ul.textContent = "";
    $("#favEmpty").hidden = state.favs.length > 0;
    state.favs.forEach((f) => {
      const li = document.createElement("li");
      const nm = document.createElement("div"); nm.className = "nm"; nm.textContent = f.name;
      const val = document.createElement("div"); val.className = "val"; val.textContent = `${r(n0(f.protein))} g`;
      const meta = document.createElement("div"); meta.className = "meta"; meta.textContent = `${r(n0(f.kcal))} kcal`;
      const rm = document.createElement("button"); rm.type = "button"; rm.className = "rmx"; rm.textContent = "Remove";
      rm.addEventListener("click", () => { removeFav(f); renderFavs(); renderQuick(); });
      li.append(nm, val, meta, rm);
      ul.append(li);
    });
  }

  // ---------- backup ----------
  function csvCell(v) { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
  $("#exportCsv").addEventListener("click", async () => {
    const rows = [["date", "time", "meal", "name", "protein_g", "kcal", "carbs_g", "fat_g", "source", "water_glasses"]];
    dayKeys().forEach((k) => {
      const d = getDay(k);
      d.meals.forEach((m, i) => rows.push([k, m.t ? new Date(m.t).toTimeString().slice(0, 5) : "", typeLabel(mealType(m)), m.name, r1(n0(m.protein)), r(n0(m.kcal)), r1(n0(m.carbs)), r1(n0(m.fat)), m.source || "", i === 0 ? d.water : ""]));
      if (!d.meals.length && d.water) rows.push([k, "", "", "", "", "", "", "", "", d.water]);
    });
    await shareText(`meal-lens-${state.today}.csv`, "text/csv", rows.map((x) => x.map(csvCell).join(",")).join("\n"));
  });
  $("#backupBtn").addEventListener("click", async () => {
    const days = {};
    dayKeys().forEach((k) => { days[k] = lsGet("ml.day." + k); });
    const data = { app: "meal-lens", version: 3, exported: new Date().toISOString(), settings: state.settings, favs: state.favs, weights: state.weights, reminders: state.reminders, days };
    await shareText(`meal-lens-backup-${state.today}.json`, "application/json", JSON.stringify(data));
  });
  async function shareText(name, mime, text) {
    if (!App.present) { toast("Sharing works in the Meal Lens Android app."); return; }
    try { await App.share(name, mime, text); }
    catch { toast("Couldn't open the share sheet. Try again."); }
  }
  let pendingRestore = null;
  $("#restoreIn").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const data = JSON.parse(String(rd.result));
        if (!data || data.app !== "meal-lens" || typeof data.days !== "object") throw new Error("not ours");
        pendingRestore = data;
        const n = Object.keys(data.days).length;
        const when = data.exported ? new Date(data.exported).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "an unknown date";
        $("#restoreMsg").textContent = `Backup from ${when} with ${n} logged day${n === 1 ? "" : "s"}. Restoring replaces everything currently in the app.`;
        $("#restoreConfirm").hidden = false;
      } catch {
        pendingRestore = null;
        $("#restoreMsg").textContent = "That file isn't a Meal Lens backup. Pick the .json file made with “Back up everything”.";
        $("#restoreConfirm").hidden = true;
      }
    };
    rd.onerror = () => { $("#restoreMsg").textContent = "Couldn't read that file. Try again."; };
    rd.readAsText(f);
  });
  $("#restoreConfirm").addEventListener("click", () => {
    const data = pendingRestore; if (!data) return;
    try {
      dayKeys().forEach((k) => localStorage.removeItem("ml.day." + k));
      Object.entries(data.days).forEach(([k, d]) => { if (/^\d{4}-\d{2}-\d{2}$/.test(k) && d) localStorage.setItem("ml.day." + k, JSON.stringify(d)); });
      if (data.settings) localStorage.setItem("ml.settings", JSON.stringify(data.settings));
      localStorage.setItem("ml.favs", JSON.stringify(Array.isArray(data.favs) ? data.favs : []));
      localStorage.setItem("ml.weights", JSON.stringify(Array.isArray(data.weights) ? data.weights : []));
      if (Array.isArray(data.reminders)) localStorage.setItem("ml.reminders", JSON.stringify(data.reminders));
    } catch { toast("Restore failed: phone storage is full."); return; }
    pendingRestore = null;
    $("#restoreConfirm").hidden = true;
    $("#restoreMsg").textContent = "Backup restored.";
    state.view = state.today;
    loadAll();
    saveReminders();
    syncSummary();
    renderToday(); renderSettings();
    toast("Backup restored");
  });

  // ---------- barcode ----------
  let bcProduct = null;
  $("#scanBtn").addEventListener("click", async () => {
    let code;
    try { code = (await App.scan()).code; }
    catch (e) {
      if (e.code !== "cancelled") toast("The scanner couldn't start. Make sure Google Play services is up to date.");
      return;
    }
    if (!code) return;
    openBarcode(code);
  });
  async function openBarcode(code) {
    bcProduct = null;
    $("#bcHead").textContent = "Barcode " + code;
    $("#bcStatus").textContent = "Looking up the product…";
    $("#bcFound").hidden = true; $("#bcManual").hidden = true;
    $("#bcType").value = defaultType(); $("#bcFav").checked = false;
    sheetOpen("#bcSheet");
    let product = lsGet("ml.bc." + code);
    if (!product) {
      try {
        const res = await App.lookup(code);
        const j = JSON.parse(res.json || "{}");
        if (j && j.status === 1 && j.product) product = parseOff(j.product);
      } catch (e) {
        $("#bcStatus").textContent = "Couldn't reach Open Food Facts. Check your connection, or enter the numbers from the label.";
        $("#bcManual").hidden = false; $("#bcManual").dataset.code = code;
        return;
      }
      if (product) lsSet("ml.bc." + code, product);
    }
    if (!product) {
      $("#bcStatus").textContent = "This product isn't in Open Food Facts yet. Enter the numbers from the label instead.";
      $("#bcManual").hidden = false; $("#bcManual").dataset.code = code;
      return;
    }
    bcProduct = { ...product, code };
    $("#bcHead").textContent = product.name;
    $("#bcStatus").textContent = "";
    $("#bcBrand").textContent = [product.brand, product.quantity].filter(Boolean).join(" · ");
    const tb = $("#bcTable"); tb.textContent = "";
    [["Protein", `${r1(product.p)} g`], ["Calories", `${r(product.kcal)} kcal`], ["Carbohydrate", `${r1(product.c)} g`], ["Fat", `${r1(product.f)} g`]].forEach(([a, b]) => {
      const tr = document.createElement("tr"); const t1 = document.createElement("td"); t1.textContent = a; const t2 = document.createElement("td"); t2.textContent = b; tr.append(t1, t2); tb.append(tr);
    });
    const q = $("#bcQuick"); q.textContent = "";
    const opts = [];
    if (product.serving > 0) opts.push([`1 serving (${r(product.serving)} g)`, product.serving], [`2 servings`, product.serving * 2]);
    opts.push(["100 g", 100]);
    opts.forEach(([l, g]) => { const b = document.createElement("button"); b.type = "button"; b.textContent = l; b.addEventListener("click", () => { $("#bcAmt").value = r(g); bcCalc(); }); q.append(b); });
    $("#bcAmt").value = r(product.serving > 0 ? product.serving : 100);
    bcCalc();
    $("#bcFound").hidden = false;
  }
  function parseOff(p) {
    const nu = p.nutriments || {};
    const num = (k) => { const v = Number(nu[k]); return Number.isFinite(v) && v >= 0 ? v : 0; };
    const kcal = num("energy-kcal_100g") || num("energy_100g") / 4.184;
    const out = {
      name: String(p.product_name || "").trim() || "Packaged food",
      brand: String(p.brands || "").split(",")[0].trim(),
      quantity: String(p.quantity || "").trim(),
      p: num("proteins_100g"), c: num("carbohydrates_100g"), f: num("fat_100g"), kcal,
      serving: Number(p.serving_quantity) > 0 ? Number(p.serving_quantity) : 0,
    };
    if (!out.p && !out.kcal && !out.c && !out.f) return null;
    return out;
  }
  function bcTotals() {
    const g = n0($("#bcAmt").value), k = g / 100, p = bcProduct;
    return { g, protein: r1(p.p * k), kcal: r(p.kcal * k), carbs: r1(p.c * k), fat: r1(p.f * k) };
  }
  function bcCalc() {
    if (!bcProduct) return;
    const t = bcTotals();
    $("#bcOut").textContent = `${r(t.protein)} g`;
    $("#bcOutSub").textContent = `protein · ${t.kcal} kcal · ${t.carbs} g carbs · ${t.fat} g fat`;
    $("#bcAdd").disabled = !t.g;
  }
  $("#bcAmt").addEventListener("input", bcCalc);
  $("#bcAdd").addEventListener("click", () => {
    if (!bcProduct) return;
    const t = bcTotals(); if (!t.g) return;
    const name = `${bcProduct.name}${bcProduct.brand ? " (" + bcProduct.brand + ")" : ""}, ${r(t.g)} g`;
    addMeal({ name, protein: t.protein, kcal: t.kcal, carbs: t.carbs, fat: t.fat, type: $("#bcType").value, source: "barcode", barcode: bcProduct.code }, { fav: $("#bcFav").checked });
    sheetClose();
  });
  $("#bcManual").addEventListener("click", () => {
    sheetClose();
    $("#manual").open = true;
    $("#manName").value = "";
    $("#manName").placeholder = "Product name (barcode " + ($("#bcManual").dataset.code || "") + ")";
    $("#manual").scrollIntoView({ behavior: smooth(), block: "start" });
    setTimeout(() => $("#manName").focus(), 300);
  });

  // ---------- on-device model ----------
  const AI_COPY = {
    CHECKING: ["Checking…", "Looking for Gemini Nano on this phone."],
    AVAILABLE: ["Ready", "Gemini Nano is on this phone. Photos are analyzed offline, with no per-photo cost."],
    DOWNLOADABLE: ["Model not downloaded yet", "This phone supports Gemini Nano. Download it once (Wi-Fi recommended) and Meal Lens can read your photos offline."],
    DOWNLOADING: ["Downloading the model…", "Your phone is fetching Gemini Nano. Keep the app open on Wi-Fi; this can take a few minutes."],
    UNAVAILABLE: ["Not available on this phone right now", "Gemini Nano isn't ready yet. Install the latest system update and update Google Play services and AICore from the Play Store, restart, then tap Check again. You can still scan barcodes or enter numbers yourself."],
    NO_BRIDGE: ["Not available here", "On-device AI works only inside the Meal Lens Android app. You can still enter numbers yourself."],
  };
  let downloading = false;
  function renderAI() {
    const st = state.aiStatus;
    const [title, detail] = AI_COPY[st] || AI_COPY.UNAVAILABLE;
    $("#aiState").textContent = title;
    $("#aiDetail").textContent = detail;
    const ready = st === "AVAILABLE";
    $("#setup").hidden = ready || st === "CHECKING";
    $("#setupText").textContent = detail;
    $("#setupGo").hidden = !(st === "DOWNLOADABLE" || st === "DOWNLOADING" || st === "UNAVAILABLE");
    $("#setupGo").textContent = st === "UNAVAILABLE" ? "Check again" : st === "DOWNLOADING" ? "Show download progress" : "Download the model";
    $("#setupGo").disabled = downloading;
    $("#camBtn").hidden = !ready; $("#libBtn").hidden = !ready;
    $("#typeIt").hidden = !ready;
    $("#scanBtn").hidden = !App.present;
    const capGrid = document.querySelector(".cap-actions");
    const visible = [ready, ready, App.present].filter(Boolean).length;
    capGrid.hidden = visible === 0;
    capGrid.classList.toggle("three", visible === 3);
    capGrid.style.gridTemplateColumns = visible === 1 ? "1fr" : "";
    const note = $("#aiNote");
    note.hidden = ready || st === "CHECKING";
    note.textContent = ready ? "" : "Photo estimates turn on once the on-device model is ready. Until then, scan a barcode or enter the numbers yourself.";
  }
  async function refreshAI() {
    if (!Nano.present) { state.aiStatus = "NO_BRIDGE"; renderAI(); return; }
    try { state.aiStatus = await Nano.status(); } catch { state.aiStatus = "UNAVAILABLE"; }
    renderAI();
    if (state.aiStatus === "DOWNLOADING" && !downloading) startDownload();
  }
  async function startDownload() {
    if (downloading) return;
    downloading = true; renderAI();
    $("#dlBarWrap").hidden = false; $("#dlText").textContent = "Starting download…";
    try {
      state.aiStatus = await Nano.download((ev) => {
        if (ev.event === "progress") {
          const mb = (Number(ev.bytes) || 0) / 1e6;
          $("#dlText").textContent = `${mb.toFixed(0)} MB downloaded`;
          $("#dlBar").style.width = Math.min(95, 10 + mb / 30) + "%";
        }
      });
      $("#dlText").textContent = state.aiStatus === "AVAILABLE" ? "Download complete." : "";
      if (state.aiStatus === "AVAILABLE") toast("On-device AI is ready");
    } catch {
      $("#dlText").textContent = "The download stopped. Check your connection and try again.";
      try { state.aiStatus = await Nano.status(); } catch { state.aiStatus = "UNAVAILABLE"; }
    } finally {
      downloading = false; $("#dlBarWrap").hidden = true; renderAI();
    }
  }
  $("#setupGo").addEventListener("click", () => { if (state.aiStatus === "UNAVAILABLE") refreshAI(); else startDownload(); });
  $("#aiRecheck").addEventListener("click", refreshAI);

  function parseJSON(text) {
    try { return JSON.parse(text); } catch { /* continue */ }
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) { try { return JSON.parse(fence[1]); } catch { /* continue */ } }
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    if (a !== -1 && b > a) {
      const chunk = text.slice(a, b + 1);
      try { return JSON.parse(chunk); } catch { /* continue */ }
      try { return JSON.parse(chunk.replace(/,\s*([}\]])/g, "$1")); } catch { /* continue */ }
    }
    throw { code: "invalid_json" };
  }
  function errorText(e) {
    const code = e && e.code;
    const msg = String((e && e.message) || "");
    if (code === "no_bridge") return AI_COPY.NO_BRIDGE[1];
    if (code === "invalid_json") return "The model's answer couldn't be read. Tap Re-estimate, or add a short description first.";
    if (code === "empty") return "No foods were recognized. Add a short description below and tap Re-estimate.";
    if (/quota|battery/i.test(msg)) return "Android limits how often apps can use the on-device model. Wait a minute and tap Re-estimate.";
    if (/background/i.test(msg)) return "The model only runs while Meal Lens is open on screen. Tap Re-estimate.";
    if (/busy/i.test(msg)) return "The on-device model is busy. Tap Re-estimate in a moment.";
    if (/not (available|downloaded)|unavailable/i.test(msg)) return "The on-device model isn't ready. Check On-device AI in Settings.";
    return "The on-device model couldn't finish" + (msg ? ` (${msg.slice(0, 120)})` : "") + ". Tap Re-estimate to try again.";
  }
  function buildPrompt(notes, hasImage) {
    return [
      hasImage ? "This photo shows a meal." : "Here is a description of a meal.",
      notes ? `Notes from the person eating it (use these quantities if given): ${notes.slice(0, 800)}` : "",
      "List each separate food or drink. For each, give a short common name (for example: white rice, grilled chicken breast, dal, roti, mixed salad), the portion in everyday terms, its weight in grams, and your estimate of protein, calories, carbs and fat for that portion.",
      "Reply with JSON only, no other text, in this format:",
      '{"meal_name":"Chicken and rice","items":[{"name":"grilled chicken breast","portion":"1 piece","grams":150,"protein_g":46,"calories":248,"carbs_g":0,"fat_g":5}]}',
      "Numbers must be plain numbers. If there is no food, return an empty items list.",
    ].filter(Boolean).join("\n");
  }
  function withTable(it) {
    const hit = it.grams > 0 && window.NUTRITION ? window.NUTRITION.lookup(it.name) : null;
    if (!hit) return { ...it, src: "est" };
    const k = it.grams / 100;
    return { ...it, protein: hit.p * k, kcal: hit.kcal * k, carbs: hit.c * k, fat: hit.f * k, src: "table" };
  }

  // ---------- photo analysis flow ----------
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
    } else clearInterval(timer);
  }
  function showErr(msg) { const e = $("#err"); e.textContent = msg; e.hidden = !msg; }

  async function analyze() {
    if (!lastInput) return;
    if (state.aiStatus !== "AVAILABLE") { showErr("Photo estimates turn on once the on-device model is ready. See On-device AI in Settings."); return; }
    const notes = $("#notes").value.trim();
    const text = lastInput.text ? [lastInput.text, notes].filter(Boolean).join("\n") : notes;
    showErr("");
    if (ctl) ctl.abort();
    ctl = new AbortController();
    const myCtl = ctl;
    setBusy(true, lastInput.imageB64 ? "Reading your plate…" : "Working out the numbers…");
    try {
      const raw = await Nano.generate(lastInput.imageB64, buildPrompt(text, !!lastInput.imageB64), myCtl.signal);
      if (myCtl !== ctl) return;
      if (!raw.trim()) throw { code: "empty" };
      const res = parseJSON(raw);
      const items = Array.isArray(res && res.items) ? res.items : [];
      state.draft = {
        name: String((res && res.meal_name) || "").slice(0, 80) || (items[0] && String(items[0].name)) || "Meal",
        thumb: lastInput.thumb || null,
        source: lastInput.imageB64 ? "photo" : "text",
        items: items.slice(0, 20).map((it) => ({
          name: String((it && it.name) || "Food").slice(0, 80),
          portion: String((it && it.portion) || "").slice(0, 60),
          grams: n0(it && it.grams), protein: n0(it && it.protein_g), kcal: n0(it && it.calories),
          carbs: n0(it && it.carbs_g), fat: n0(it && it.fat_g), scale: 1,
        })).map(withTable),
      };
      renderDraft();
      if (!state.draft.items.length) showErr("No food was recognized. Try another photo, or add a description below and tap Re-estimate.");
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
    const ul = $("#items"); ul.textContent = "";
    d.items.forEach((it, i) => {
      const li = document.createElement("li"); li.className = "item";
      const main = document.createElement("div"); main.className = "item-main";
      const nm = document.createElement("span"); nm.className = "item-name"; nm.textContent = it.name;
      const por = document.createElement("span"); por.className = "item-portion";
      const g = it.grams ? `${r(it.grams * it.scale)} g` : "";
      por.textContent = [it.portion + (it.scale !== 1 ? ` × ${it.scale}` : ""), g].filter(Boolean).join(" · ");
      const src = document.createElement("span"); src.className = "src" + (it.src === "est" ? " est" : "");
      src.textContent = it.src === "table" ? "Nutrition table" : "AI estimate";
      main.append(nm, por, src);
      const nums = document.createElement("div"); nums.className = "item-nums";
      const pb = document.createElement("b"); pb.textContent = `${r(it.protein * it.scale)} g protein`;
      const kc = document.createElement("span"); kc.textContent = `${r(it.kcal * it.scale)} kcal`;
      nums.append(pb, kc);
      const row = document.createElement("div"); row.className = "item-ctl";
      const mk = (txt, act, cls, label) => { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = txt; b.dataset.act = act; b.dataset.i = i; b.setAttribute("aria-label", label); return b; };
      const sc = document.createElement("span"); sc.className = "scale"; sc.textContent = `×${it.scale}`;
      row.append(mk("−", "dec", "step", `Smaller portion of ${it.name}`), sc, mk("+", "inc", "step", `Bigger portion of ${it.name}`), mk("Remove", "rm", "rm", `Remove ${it.name}`));
      li.append(main, nums, row);
      ul.append(li);
    });
    const t = draftTotals(d);
    $("#tKcal").textContent = r(t.kcal);
    $("#tPro").textContent = `${r(t.protein)} g`;
    $("#tCarb").textContent = `${r(t.carbs)} g`;
    $("#tFat").textContent = `${r(t.fat)} g`;
    const nEst = d.items.filter((it) => it.src === "est").length;
    $("#conf").textContent = "Weights are the model's estimate from the photo. Adjust portions with − and + if they look off." +
      (nEst ? ` ${nEst === d.items.length ? "All items use" : nEst + " of " + d.items.length + (nEst === 1 ? " items uses" : " items use")} the model's own nutrition estimate.` : "");
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
    const k = Math.min(1, 1024 / Math.max(w, h));
    const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const imageB64 = c.toDataURL("image/jpeg", 0.88).split(",")[1];
    const t = document.createElement("canvas"); const S = 120; t.width = S; t.height = S;
    const side = Math.min(w, h);
    t.getContext("2d").drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, S, S);
    return { imageB64, thumb: t.toDataURL("image/jpeg", 0.6), preview: url };
  }
  let previewURL = null;
  function openReview(withPhoto) {
    resetReview(false);
    $("#review").hidden = false;
    $("#shot").hidden = !withPhoto;
    $("#notes").value = "";
    $("#revType").value = defaultType();
    $("#revFav").checked = false;
  }
  async function onPhoto(file) {
    if (!file) return;
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null;
    openReview(true);
    setBusy(true, "Preparing photo…");
    let p;
    try { p = await prepImage(file); }
    catch {
      setBusy(false); $("#shot").hidden = true; lastInput = null;
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
    openReview(false);
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
      name: ($("#mealName").value.trim() || d.name || "Meal").slice(0, 80),
      protein: r1(t.protein), kcal: r(t.kcal), carbs: r1(t.carbs), fat: r1(t.fat),
      items: d.items.map((it) => ({ name: it.name, portion: it.portion, scale: it.scale, grams: r(it.grams * it.scale), protein: r1(it.protein * it.scale), kcal: r(it.kcal * it.scale), src: it.src })),
      thumb: d.thumb, source: d.source, type: $("#revType").value,
    }, { fav: $("#revFav").checked });
    $("#descText").value = "";
    $("#typeIt").open = false;
    resetReview(true);
    $("#mealsHead").scrollIntoView({ block: "start", behavior: smooth() });
  });

  // ---------- boot ----------
  loadAll();
  pruneThumbs(45);
  if (!lsGet("ml.reminders")) lsSet("ml.reminders", state.reminders);
  App.setReminders(JSON.stringify(state.reminders));
  renderAI();
  renderToday();
  syncSummary();
  refreshAI();
})();
