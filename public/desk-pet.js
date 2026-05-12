/**
 * Desk pet — time-based hunger, alerts, expiry + revive. Extend via window.DeskPet.
 */
(function () {
  const STORAGE_KEY = "managerDailyDeskPet";
  const MS_HOUR = 60 * 60 * 1000;
  const FULLNESS_LOST_PER_HOUR = 10;
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

  if (!root || !alivePanel || !revivePanel || !creature || !statusEl || !meterFill || !btnFeed || !btnTickle || !btnRevive) {
    return;
  }

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
    const hours = (now - t) / MS_HOUR;
    if (hours <= 0) return;

    const prev = state.fullness;
    const rawNext = state.fullness - hours * FULLNESS_LOST_PER_HOUR;
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

  function renderVisibility() {
    const dead = state.expired;
    if (dead) {
      clearPanelAlertClasses();
      stopTitleFlash();
    }
    alivePanel.hidden = dead;
    revivePanel.hidden = !dead;
    root.classList.toggle("desk-pet--expired", dead);
  }

  function render() {
    renderVisibility();
    if (state.expired) {
      return;
    }

    state.fullness = clamp(state.fullness, 0, 100);
    meterFill.style.width = `${state.fullness}%`;
    const m = alivePanel.querySelector(".desk-pet-meter");
    if (m) m.setAttribute("aria-valuenow", String(Math.round(state.fullness)));

    creature.classList.toggle("desk-pet-creature--hungry", state.fullness < 30);
    creature.classList.toggle("desk-pet-creature--happy", state.fullness >= 75 && state.fullness < 100);
    creature.classList.toggle("desk-pet-creature--full", state.fullness >= 100);

    if (!statusOverride) statusEl.textContent = defaultMoodLine();
  }

  function anim(className, ms) {
    creature.classList.add(className);
    window.setTimeout(() => creature.classList.remove(className), ms);
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
    setStatus("Yum!", 1800);
    render();
    window.dispatchEvent(new CustomEvent("deskPet:feed", { detail: { ...state } }));
  }

  function tickle() {
    applyTimeDecay();
    if (state.expired) return;

    state.tickleCount += 1;
    save();
    anim("desk-pet-creature--giggle", 950);
    setStatus("Hee hee!", 2000);
    render();
    window.dispatchEvent(new CustomEvent("deskPet:tickle", { detail: { ...state } }));
  }

  function revive() {
    state.expired = false;
    state.fullness = 50;
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
