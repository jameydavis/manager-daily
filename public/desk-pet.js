/**
 * Desk pet — time-based hunger, alerts, expiry + revive. Extend via window.DeskPet.
 */
(function () {
  const STORAGE_KEY = "managerDailyDeskPet";
  /** Fullness drops by 10 every wall-clock 5 minutes (proportional between ticks). */
  const MS_DECAY_INTERVAL = 5 * 60 * 1000;
  const FULLNESS_LOST_PER_INTERVAL = 10;
  const TICK_MS = 60 * 1000;

  /** @type {{ fullness: number; lastFullnessAt: string; tickleCount: number; feedCount: number; expired: boolean; alertedCute: boolean; alertedUrgent: boolean }} */
  let state = {
    fullness: 72,
    lastFullnessAt: new Date().toISOString(),
    tickleCount: 0,
    feedCount: 0,
    expired: false,
    alertedCute: false,
    alertedUrgent: false,
  };

  const root = document.getElementById("desk-pet");
  const alivePanel = document.getElementById("desk-pet-alive");
  const revivePanel = document.getElementById("desk-pet-revive-panel");
  const creature = document.getElementById("desk-pet-creature");
  const statusEl = document.getElementById("desk-pet-status");
  const meterFill = document.getElementById("desk-pet-meter-fill");
  const btnFeed = document.getElementById("desk-pet-feed");
  const btnTickle = document.getElementById("desk-pet-tickle");
  const btnRevive = document.getElementById("desk-pet-revive");
  const fxLayer = document.getElementById("desk-pet-fx");
  const aliveExpand = document.getElementById("desk-pet-alive-expand");
  const aliveCompact = document.getElementById("desk-pet-alive-compact");
  const aliveCompactPct = document.getElementById("desk-pet-alive-compact-pct");
  const reviveExpand = document.getElementById("desk-pet-revive-expand");
  const reviveCompact = document.getElementById("desk-pet-revive-compact");
  const reviveCompactBtn = document.getElementById("desk-pet-revive-compact-btn");
  const reviveCompactPct = document.getElementById("desk-pet-revive-compact-pct");

  if (
    !root ||
    !alivePanel ||
    !revivePanel ||
    !creature ||
    !statusEl ||
    !meterFill ||
    !btnFeed ||
    !btnTickle ||
    !btnRevive ||
    !aliveExpand ||
    !aliveCompact ||
    !aliveCompactPct ||
    !reviveExpand ||
    !reviveCompact ||
    !reviveCompactBtn ||
    !reviveCompactPct
  ) {
    return;
  }

  const UI_COLLAPSED_KEY = "managerDailyDeskPetUiCollapsed";
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(UI_COLLAPSED_KEY) === "1";
  } catch {
    collapsed = false;
  }

  const collapseToggles = root.querySelectorAll(".desk-pet-collapse-toggle");

  const TICKLE_SPECS = [
    { spec: "desk-pet-creature--giggle", ms: 950 },
    { spec: "desk-pet-creature--tickle-twist", ms: 1000 },
    { spec: "desk-pet-creature--tickle-boing", ms: 920 },
  ];
  const TICKLE_SPEC_CLASSES = TICKLE_SPECS.map((s) => s.spec);

  const IDLE_ANIM_SPECS = [
    { cls: "desk-pet-creature--idle-rock", ms: 2200 },
    { cls: "desk-pet-creature--idle-bounce", ms: 1850 },
    { cls: "desk-pet-creature--idle-sway", ms: 2100 },
    { cls: "desk-pet-creature--idle-jelly", ms: 1950 },
    { cls: "desk-pet-creature--idle-nod", ms: 1650 },
  ];
  const IDLE_ANIM_CLASSES = IDLE_ANIM_SPECS.map((s) => s.spec);

  let tickleAnimTimer = 0;
  let idleSchedulerTimer = 0;
  let idleAnimEndTimer = 0;
  const baseTitle = document.title;
  let statusOverride = null;
  let statusTimer = 0;
  let panelAlertTimer = 0;
  let titleFlashTimer = 0;
  let titleFlashState = false;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.fullness === "number") state.fullness = clamp(parsed.fullness, 0, 100);
      if (typeof parsed.tickleCount === "number") state.tickleCount = Math.max(0, parsed.tickleCount);
      if (typeof parsed.feedCount === "number") state.feedCount = Math.max(0, parsed.feedCount);
      const at =
        (typeof parsed.lastFullnessAt === "string" && parsed.lastFullnessAt) ||
        (typeof parsed.lastVisit === "string" && parsed.lastVisit) ||
        null;
      if (at) state.lastFullnessAt = at;
      if (typeof parsed.expired === "boolean") state.expired = parsed.expired;
      if (typeof parsed.alertedCute === "boolean") state.alertedCute = parsed.alertedCute;
      if (typeof parsed.alertedUrgent === "boolean") state.alertedUrgent = parsed.alertedUrgent;
      if (state.expired) state.fullness = 0;
      if (state.fullness <= 0) {
        state.fullness = 0;
        state.expired = true;
      }
    } catch {
      /* ignore */
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  function resetAlertFlagsIfRecovered() {
    if (state.fullness > 10) state.alertedCute = false;
    if (state.fullness > 5) state.alertedUrgent = false;
  }

  function clearPanelAlertClasses() {
    alivePanel.classList.remove("desk-pet-panel--alert-cute", "desk-pet-panel--alert-urgent");
  }

  function showPanelAlert(kind, ms) {
    clearPanelAlertClasses();
    if (panelAlertTimer) window.clearTimeout(panelAlertTimer);
    alivePanel.classList.add(kind === "urgent" ? "desk-pet-panel--alert-urgent" : "desk-pet-panel--alert-cute");
    panelAlertTimer = window.setTimeout(() => {
      clearPanelAlertClasses();
      panelAlertTimer = 0;
    }, ms);
  }

  function stopTitleFlash() {
    if (titleFlashTimer) window.clearInterval(titleFlashTimer);
    titleFlashTimer = 0;
    document.title = baseTitle;
    titleFlashState = false;
  }

  function startTitleFlash(urgent) {
    stopTitleFlash();
    const a = urgent ? "Desk buddy needs food!" : "Desk buddy";
    const b = baseTitle;
    titleFlashTimer = window.setInterval(() => {
      titleFlashState = !titleFlashState;
      document.title = titleFlashState ? a : b;
    }, urgent ? 900 : 1400);
    window.setTimeout(stopTitleFlash, urgent ? 14000 : 10000);
  }

  function tryNotify(title, body) {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      new Notification(title, { body });
    } catch {
      /* ignore */
    }
  }

  function fireCuteHungerAlert() {
    if (state.alertedCute) return;
    state.alertedCute = true;
    setStatus("Psst… my tummy's making tiny rumbles. A snack soon?", 6500);
    showPanelAlert("cute", 5200);
    tryNotify("Desk buddy", "Getting a bit peckish—maybe a snack when you can?");
    save();
    window.dispatchEvent(new CustomEvent("deskPet:hungerCute", { detail: { ...state } }));
  }

  function fireUrgentHungerAlert() {
    if (state.alertedUrgent) return;
    state.alertedUrgent = true;
    setStatus("I'm really hungry now… please feed me soon!", 8000);
    showPanelAlert("urgent", 7500);
    startTitleFlash(true);
    tryNotify("Desk buddy needs you!", "They're running on empty—feed them before it's too late.");
    save();
    window.dispatchEvent(new CustomEvent("deskPet:hungerUrgent", { detail: { ...state } }));
  }

  function maybeHungerAlertsAfterDecay(prev, next) {
    if (state.expired) return;
    resetAlertFlagsIfRecovered();
    if (next <= 10 && prev > 10) fireCuteHungerAlert();
    if (next <= 5 && prev > 5) fireUrgentHungerAlert();
  }

  function maybeSteadyStateAlertsOnLoad() {
    if (state.expired) return;
    resetAlertFlagsIfRecovered();
    if (state.fullness <= 10 && !state.alertedCute) fireCuteHungerAlert();
    if (state.fullness <= 5 && !state.alertedUrgent) fireUrgentHungerAlert();
  }

  function applyTimeDecay() {
    if (state.expired) return;
    const t = Date.parse(state.lastFullnessAt);
    const now = Date.now();
    if (Number.isNaN(t)) {
      state.lastFullnessAt = new Date(now).toISOString();
      return;
    }
    const intervals = (now - t) / MS_DECAY_INTERVAL;
    if (intervals <= 0) return;

    const prev = state.fullness;
    const rawNext = state.fullness - intervals * FULLNESS_LOST_PER_INTERVAL;
    const next = rawNext <= 0 ? 0 : clamp(Math.floor(rawNext), 0, 100);
    state.fullness = next;
    state.lastFullnessAt = new Date(now).toISOString();

    if (next <= 0) {
      state.fullness = 0;
      state.expired = true;
      state.alertedCute = false;
      state.alertedUrgent = false;
      stopTitleFlash();
      save();
      window.dispatchEvent(new CustomEvent("deskPet:expired", { detail: { ...state } }));
      return;
    }

    maybeHungerAlertsAfterDecay(prev, next);
    save();
  }

  function setStatus(text, ms) {
    if (statusTimer) window.clearTimeout(statusTimer);
    statusOverride = text;
    statusEl.textContent = text;
    if (ms > 0) {
      statusTimer = window.setTimeout(() => {
        statusOverride = null;
        statusTimer = 0;
        render();
      }, ms);
    }
  }

  function defaultMoodLine() {
    const f = state.fullness;
    if (f < 15) return "Very hungry…";
    if (f < 35) return "Could use a meal.";
    if (f < 55) return "Doing okay.";
    if (f < 85) return "Content.";
    if (f < 100) return "Happy and full!";
    return "Can't eat another bite!";
  }

  function saveUiCollapsed() {
    try {
      localStorage.setItem(UI_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function applyPanelLayout() {
    root.classList.toggle("desk-pet--compact", collapsed);
    collapseToggles.forEach((btn) => {
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      btn.setAttribute("aria-label", collapsed ? "Expand desk buddy panel" : "Shrink to slim bar");
      btn.textContent = collapsed ? "\u25B4" : "\u25BE";
    });

    if (collapsed) {
      cancelIdleScheduler();
    }

    if (state.expired) {
      aliveExpand.hidden = true;
      aliveCompact.hidden = true;
      reviveExpand.hidden = collapsed;
      reviveCompact.hidden = !collapsed;
      reviveCompactPct.textContent = `${Math.round(clamp(state.fullness, 0, 100))}%`;
    } else {
      reviveExpand.hidden = true;
      reviveCompact.hidden = true;
      aliveExpand.hidden = collapsed;
      aliveCompact.hidden = !collapsed;
      aliveCompactPct.textContent = `${Math.round(state.fullness)}%`;
    }
  }

  function renderVisibility() {
    const dead = state.expired;
    if (dead) {
      clearPanelAlertClasses();
      stopTitleFlash();
      cancelIdleScheduler();
    }
    alivePanel.hidden = dead;
    revivePanel.hidden = !dead;
    alivePanel.setAttribute("aria-hidden", dead ? "true" : "false");
    revivePanel.setAttribute("aria-hidden", !dead ? "true" : "false");
    root.classList.toggle("desk-pet--expired", dead);
  }

  function render() {
    renderVisibility();
    if (!state.expired) {
      state.fullness = clamp(state.fullness, 0, 100);
      meterFill.style.width = `${state.fullness}%`;
      const m = alivePanel.querySelector(".desk-pet-meter");
      if (m) m.setAttribute("aria-valuenow", String(Math.round(state.fullness)));

      creature.classList.toggle("desk-pet-creature--hungry", state.fullness < 30);
      creature.classList.toggle("desk-pet-creature--happy", state.fullness >= 75 && state.fullness < 100);
      creature.classList.toggle("desk-pet-creature--full", state.fullness >= 100);

      if (!statusOverride) statusEl.textContent = defaultMoodLine();
    }
    applyPanelLayout();
  }

  function clearIdleAnimations() {
    IDLE_ANIM_CLASSES.forEach((c) => creature.classList.remove(c));
    if (idleAnimEndTimer) {
      window.clearTimeout(idleAnimEndTimer);
      idleAnimEndTimer = 0;
    }
  }

  function cancelIdleScheduler() {
    if (idleSchedulerTimer) {
      window.clearTimeout(idleSchedulerTimer);
      idleSchedulerTimer = 0;
    }
    clearIdleAnimations();
  }

  function isCreatureBusy() {
    return (
      creature.classList.contains("desk-pet-creature--munch") ||
      creature.classList.contains("desk-pet-creature--refuse-feed") ||
      creature.classList.contains("desk-pet-creature--tickle") ||
      TICKLE_SPEC_CLASSES.some((c) => creature.classList.contains(c))
    );
  }

  function scheduleIdleAnim() {
    if (collapsed || state.expired) return;
    if (idleSchedulerTimer) window.clearTimeout(idleSchedulerTimer);
    const gapMs = 8500 + Math.random() * 3200;
    idleSchedulerTimer = window.setTimeout(() => {
      idleSchedulerTimer = 0;
      if (state.expired || collapsed) return;
      if (document.visibilityState === "hidden") {
        idleSchedulerTimer = window.setTimeout(() => {
          idleSchedulerTimer = 0;
          scheduleIdleAnim();
        }, 2000);
        return;
      }
      if (isCreatureBusy() || IDLE_ANIM_CLASSES.some((c) => creature.classList.contains(c))) {
        idleSchedulerTimer = window.setTimeout(() => {
          idleSchedulerTimer = 0;
          scheduleIdleAnim();
        }, 900);
        return;
      }
      const spec = IDLE_ANIM_SPECS[Math.floor(Math.random() * IDLE_ANIM_SPECS.length)];
      creature.classList.add(spec.cls);
      idleAnimEndTimer = window.setTimeout(() => {
        creature.classList.remove(spec.cls);
        idleAnimEndTimer = 0;
      }, spec.ms);
      scheduleIdleAnim();
    }, gapMs);
  }

  function anim(className, ms) {
    clearIdleAnimations();
    creature.classList.add(className);
    window.setTimeout(() => creature.classList.remove(className), ms);
  }

  function clearTickleAnimation() {
    creature.classList.remove("desk-pet-creature--tickle", ...TICKLE_SPEC_CLASSES);
  }

  function runTickleAnimation() {
    clearIdleAnimations();
    if (tickleAnimTimer) {
      window.clearTimeout(tickleAnimTimer);
      tickleAnimTimer = 0;
      clearTickleAnimation();
    }
    const choice = TICKLE_SPECS[Math.floor(Math.random() * TICKLE_SPECS.length)];
    creature.classList.add("desk-pet-creature--tickle", choice.spec);
    tickleAnimTimer = window.setTimeout(() => {
      creature.classList.remove("desk-pet-creature--tickle", choice.spec);
      tickleAnimTimer = 0;
    }, choice.ms);
  }

  function spawnFeedHearts() {
    if (!fxLayer) return;
    const count = 6;
    for (let i = 0; i < count; i++) {
      const el = document.createElement("span");
      el.className = "desk-pet-heart";
      el.setAttribute("aria-hidden", "true");
      el.textContent = "\u2665";
      const driftPx = Math.round((Math.random() - 0.5) * 40);
      const delay = `${i * 0.05 + Math.random() * 0.07}s`;
      const scale = 0.72 + Math.random() * 0.48;
      el.style.setProperty("--heart-drift", `${driftPx}px`);
      el.style.setProperty("--heart-delay", delay);
      el.style.setProperty("--heart-scale", String(scale));
      if (Math.random() > 0.5) {
        el.style.filter = "hue-rotate(-22deg) saturate(1.25)";
      }
      el.addEventListener(
        "animationend",
        () => {
          el.remove();
        },
        { once: true }
      );
      fxLayer.appendChild(el);
      window.setTimeout(() => {
        if (el.isConnected) el.remove();
      }, 1800);
    }
  }

  function touchFullnessClock() {
    state.lastFullnessAt = new Date().toISOString();
  }

  function feed() {
    applyTimeDecay();
    if (state.expired) return;

    if (state.fullness >= 100) {
      anim("desk-pet-creature--refuse-feed", 1150);
      setStatus("No more—I'm stuffed!", 2400);
      window.dispatchEvent(new CustomEvent("deskPet:feedRefused", { detail: { ...state } }));
      return;
    }

    state.fullness = clamp(Math.floor(state.fullness + 22), 0, 100);
    state.feedCount += 1;
    touchFullnessClock();
    resetAlertFlagsIfRecovered();
    save();
    anim("desk-pet-creature--munch", 1100);
    spawnFeedHearts();
    setStatus("Yum!", 1800);
    render();
    window.dispatchEvent(new CustomEvent("deskPet:feed", { detail: { ...state } }));
  }

  function tickle() {
    applyTimeDecay();
    if (state.expired) return;

    state.tickleCount += 1;
    save();
    runTickleAnimation();
    const lines = ["Hee hee!", "Eeehee—that tickles!", "Nooo… okay, one more tickle!"];
    setStatus(lines[Math.floor(Math.random() * lines.length)], 2000);
    render();
    window.dispatchEvent(new CustomEvent("deskPet:tickle", { detail: { ...state } }));
  }

  function revive() {
    state.expired = false;
    state.fullness = 20;
    state.alertedCute = false;
    state.alertedUrgent = false;
    touchFullnessClock();
    stopTitleFlash();
    clearPanelAlertClasses();
    save();
    renderVisibility();
    render();
    setStatus("Yawn… hello again! Thanks for waking me.", 4500);
    window.dispatchEvent(new CustomEvent("deskPet:revived", { detail: { ...state } }));
    scheduleIdleAnim();
  }

  function tick() {
    applyTimeDecay();
    save();
    renderVisibility();
    render();
  }

  btnFeed.addEventListener("click", feed);
  btnTickle.addEventListener("click", tickle);
  btnRevive.addEventListener("click", revive);
  reviveCompactBtn.addEventListener("click", revive);
  collapseToggles.forEach((btn) => {
    btn.addEventListener("click", () => {
      collapsed = !collapsed;
      saveUiCollapsed();
      applyPanelLayout();
      if (!collapsed && !state.expired) {
        cancelIdleScheduler();
        scheduleIdleAnim();
      }
    });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick();
  });

  load();
  applyTimeDecay();
  resetAlertFlagsIfRecovered();
  save();
  maybeSteadyStateAlertsOnLoad();

  renderVisibility();
  render();
  cancelIdleScheduler();
  if (!state.expired && !collapsed) scheduleIdleAnim();
  window.setInterval(tick, TICK_MS);

  window.DeskPet = {
    getState: () => ({ ...state }),
    feed,
    tickle,
    revive,
    tick,
    /** @param {(s: typeof state) => void} fn */
    subscribe(fn) {
      const wrap = () => fn({ ...state });
      window.addEventListener("deskPet:feed", wrap);
      window.addEventListener("deskPet:feedRefused", wrap);
      window.addEventListener("deskPet:tickle", wrap);
      window.addEventListener("deskPet:hungerCute", wrap);
      window.addEventListener("deskPet:hungerUrgent", wrap);
      window.addEventListener("deskPet:expired", wrap);
      window.addEventListener("deskPet:revived", wrap);
      return () => {
        window.removeEventListener("deskPet:feed", wrap);
        window.removeEventListener("deskPet:feedRefused", wrap);
        window.removeEventListener("deskPet:tickle", wrap);
        window.removeEventListener("deskPet:hungerCute", wrap);
        window.removeEventListener("deskPet:hungerUrgent", wrap);
        window.removeEventListener("deskPet:expired", wrap);
        window.removeEventListener("deskPet:revived", wrap);
      };
    },
  };
})();
