/**
 * Desk pet — time-based hunger, alerts, expiry + revive. Extend via window.DeskPet.
 */
(function () {
  const STORAGE_KEY = "managerDailyDeskPet";
  /** Last sync payload timestamp (ISO); used to merge with server when signed in. */
  const SYNC_META_KEY = "managerDailyDeskPetSyncMeta";
  const DESK_PET_API = "/api/desk-pet";
  /** Fullness drops by 10 every wall-clock 5 minutes (proportional between ticks). */
  const MS_DECAY_INTERVAL = 5 * 60 * 1000;
  const FULLNESS_LOST_PER_INTERVAL = 10;
  const TICK_MS = 60 * 1000;
  /** Notional baseline fullness drop per tickle before the 3× tuning (historically ~implicit bump via decay only). */
  const EXERTION_BASE_PER_TICKLE = 2;
  const TICKLE_EXERTION_MULTIPLIER = 3;
  const EXERTION_DROP_PER_TICKLE = EXERTION_BASE_PER_TICKLE * TICKLE_EXERTION_MULTIPLIER;
  /** One play session tires the pet the same total amount as one tickle (after multiplier). */
  const PLAY_SESSION_MS = 6000;

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
  const btnPlay = document.getElementById("desk-pet-play");
  const stageEl = document.getElementById("desk-pet-stage");
  const playBall = document.getElementById("desk-pet-play-ball");
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
    !btnPlay ||
    !stageEl ||
    !playBall ||
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

  const PET_NAME_KEY = "managerDailyDeskPetDisplayName";
  const DEFAULT_PET_NAME = "Desk buddy";
  const MAX_PET_NAME_LEN = 12;

  /** Short cute names (≤12 chars) for Randomize — no network. */
  const CUTE_PET_NAMES = [
    "Pebbles",
    "Mochi",
    "Biscuit",
    "Noodle",
    "Sprout",
    "Jellybean",
    "Pip",
    "Tofu",
    "Muffin",
    "Waffles",
    "Pudding",
    "Snickers",
    "Hazel",
    "Mimi",
    "Bubbles",
    "Twinkle",
    "Clover",
    "Luna",
    "Sunny",
    "Ziggy",
    "Fizz",
    "Puff",
    "Nibbles",
    "Gizmo",
    "Tinker",
    "Olive",
    "Maple",
    "Honey",
    "Butter",
    "Pickle",
    "Beebo",
    "Coco",
    "Pixel",
    "Bean",
    "Chip",
    "Cinnamon",
    "Truffle",
    "Nori",
    "Miso",
    "Wonton",
    "Dumpling",
    "Peaches",
    "Apricot",
    "Cherry",
    "Sprocket",
    "Button",
    "Patches",
    "Mittens",
    "Sprinkles",
    "Tootsie",
    "Bonbon",
    "Marzipan",
    "Shortcake",
    "Bluebell",
    "Buttercup",
    "Dandelion",
    "Firefly",
    "Stardust",
    "Moonbeam",
    "Tumbleweed",
  ];

  function loadStoredPetName() {
    try {
      const raw = localStorage.getItem(PET_NAME_KEY);
      if (typeof raw !== "string") return "";
      return raw.trim().slice(0, MAX_PET_NAME_LEN);
    } catch {
      return "";
    }
  }

  function saveStoredPetName(raw) {
    const t = typeof raw === "string" ? raw.trim().slice(0, MAX_PET_NAME_LEN) : "";
    try {
      if (!t) localStorage.removeItem(PET_NAME_KEY);
      else localStorage.setItem(PET_NAME_KEY, t);
    } catch {
      /* ignore */
    }
    scheduleSyncPush();
  }

  function getPetDisplayName() {
    return loadStoredPetName() || DEFAULT_PET_NAME;
  }

  function applyPetLabels() {
    const name = getPetDisplayName();
    root.querySelectorAll(".desk-pet-title").forEach((el) => {
      el.textContent = name;
    });
    const meterEl = alivePanel.querySelector(".desk-pet-meter");
    if (meterEl) meterEl.setAttribute("aria-label", `How full ${name} is`);
    const gearBtn = document.getElementById("desk-pet-settings-open");
    if (gearBtn) gearBtn.setAttribute("aria-label", `${name} settings`);
    const settingsTitleEl = document.getElementById("desk-pet-settings-title");
    if (settingsTitleEl) settingsTitleEl.textContent = `${name} settings`;
    const reviveTitleEl = revivePanel.querySelector(".desk-pet-revive-title");
    if (reviveTitleEl) reviveTitleEl.textContent = `Your ${name} nodded off…`;
    const reviveHintEl = revivePanel.querySelector(".desk-pet-revive-hint");
    if (reviveHintEl) reviveHintEl.textContent = `${name} went too long without a meal. Wake them with a little care.`;
    root.setAttribute("aria-label", name);
    creature.setAttribute("aria-label", `Tickle ${name}`);
  }

  const UI_COLLAPSED_KEY = "managerDailyDeskPetUiCollapsed";
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(UI_COLLAPSED_KEY) === "1";
  } catch {
    collapsed = false;
  }

  const collapseToggles = root.querySelectorAll(".desk-pet-collapse-toggle");

  const CORNER_KEY = "managerDailyDeskPetCorner";
  const CORNER_IDS = /** @type {const} */ (["br", "bl", "tr", "tl"]);

  const PALETTE_KEY = "managerDailyDeskPetPalette";
  const PALETTE_IDS = /** @type {const} */ ([
    "lavender",
    "ocean",
    "meadow",
    "sunset",
    "berry",
    "honey",
    "arctic",
    "charcoal",
  ]);

  const settingsDialog = document.getElementById("desk-pet-settings");
  const settingsOpenBtn = document.getElementById("desk-pet-settings-open");
  const settingsCloseBtn = document.getElementById("desk-pet-settings-close");
  const settingsDoneBtn = document.getElementById("desk-pet-settings-done");
  const cornerSelect = document.getElementById("desk-pet-corner");
  const paletteSelect = document.getElementById("desk-pet-palette");
  const nameInput = document.getElementById("desk-pet-name");
  const nameHintEl = document.getElementById("desk-pet-name-hint");
  const nameRandomBtn = document.getElementById("desk-pet-name-random");

  function updateNameFieldFeedback() {
    if (!nameHintEl || !nameInput) return;
    const len = nameInput.value.length;
    const max = MAX_PET_NAME_LEN;
    if (len > max) {
      nameHintEl.textContent = `Name can be at most ${max} characters.`;
      nameHintEl.className = "desk-pet-settings-hint desk-pet-settings-hint--error";
      nameInput.classList.add("desk-pet-settings-input--invalid");
      return;
    }
    nameInput.classList.remove("desk-pet-settings-input--invalid");
    if (len === max) {
      nameHintEl.textContent = `Maximum length (${max} characters).`;
      nameHintEl.className = "desk-pet-settings-hint desk-pet-settings-hint--limit";
      return;
    }
    if (len > 0) {
      nameHintEl.textContent = `${len} / ${max} characters`;
      nameHintEl.className = "desk-pet-settings-hint";
      return;
    }
    nameHintEl.textContent = `Up to ${max} characters`;
    nameHintEl.className = "desk-pet-settings-hint";
  }

  /** @returns {(typeof CORNER_IDS)[number]} */
  function loadCornerPref() {
    try {
      const raw = localStorage.getItem(CORNER_KEY);
      if (raw === "br" || raw === "bl" || raw === "tr" || raw === "tl") return raw;
    } catch {
      /* ignore */
    }
    return "br";
  }

  /** @param {(typeof CORNER_IDS)[number]} corner */
  function applyCornerPref(corner) {
    for (const id of CORNER_IDS) {
      root.classList.remove(`desk-pet--corner-${id}`);
    }
    root.classList.add(`desk-pet--corner-${corner}`);
    if (typeof window.ManagerDailyToasts?.syncAnchorFromDeskPet === "function") {
      window.ManagerDailyToasts.syncAnchorFromDeskPet();
    }
  }

  /** @param {(typeof CORNER_IDS)[number]} corner */
  function saveCornerPref(corner) {
    try {
      localStorage.setItem(CORNER_KEY, corner);
    } catch {
      /* ignore */
    }
    scheduleSyncPush();
  }

  /** @returns {(typeof PALETTE_IDS)[number]} */
  function loadPalettePref() {
    try {
      const raw = localStorage.getItem(PALETTE_KEY);
      if (raw && /** @type {readonly string[]} */ (PALETTE_IDS).includes(raw)) {
        return /** @type {(typeof PALETTE_IDS)[number]} */ (raw);
      }
    } catch {
      /* ignore */
    }
    return "lavender";
  }

  /** @param {(typeof PALETTE_IDS)[number]} palette */
  function applyPalettePref(palette) {
    for (const id of PALETTE_IDS) {
      if (id === "lavender") continue;
      root.classList.remove(`desk-pet--palette-${id}`);
    }
    if (palette !== "lavender") {
      root.classList.add(`desk-pet--palette-${palette}`);
    }
  }

  /** @param {(typeof PALETTE_IDS)[number]} palette */
  function savePalettePref(palette) {
    try {
      localStorage.setItem(PALETTE_KEY, palette);
    } catch {
      /* ignore */
    }
    scheduleSyncPush();
  }

  applyCornerPref(loadCornerPref());
  applyPalettePref(loadPalettePref());
  if (cornerSelect) {
    cornerSelect.value = loadCornerPref();
  }
  if (paletteSelect) {
    paletteSelect.value = loadPalettePref();
  }

  if (settingsDialog && settingsOpenBtn && cornerSelect && typeof settingsDialog.showModal === "function") {
    settingsOpenBtn.addEventListener("click", () => {
      cornerSelect.value = loadCornerPref();
      if (paletteSelect) paletteSelect.value = loadPalettePref();
      if (nameInput) nameInput.value = loadStoredPetName();
      updateNameFieldFeedback();
      settingsDialog.showModal();
    });
    const closeSettings = () => {
      if (nameInput && nameInput.value.length > MAX_PET_NAME_LEN) {
        nameInput.value = nameInput.value.slice(0, MAX_PET_NAME_LEN);
        saveStoredPetName(nameInput.value);
        applyPetLabels();
        updateNameFieldFeedback();
      }
      if (settingsDialog.open) settingsDialog.close();
    };
    settingsCloseBtn?.addEventListener("click", closeSettings);
    settingsDoneBtn?.addEventListener("click", closeSettings);
    settingsDialog.addEventListener("click", (e) => {
      if (e.target === settingsDialog) closeSettings();
    });
    cornerSelect.addEventListener("change", () => {
      const v = cornerSelect.value;
      if (v !== "br" && v !== "bl" && v !== "tr" && v !== "tl") return;
      applyCornerPref(v);
      saveCornerPref(v);
    });
    nameInput?.addEventListener("input", () => {
      if (nameInput.value.length <= MAX_PET_NAME_LEN) {
        saveStoredPetName(nameInput.value);
        applyPetLabels();
      }
      updateNameFieldFeedback();
    });
    nameRandomBtn?.addEventListener("click", () => {
      if (!nameInput) return;
      const pick = CUTE_PET_NAMES[Math.floor(Math.random() * CUTE_PET_NAMES.length)];
      nameInput.value = pick;
      saveStoredPetName(pick);
      applyPetLabels();
      updateNameFieldFeedback();
      nameInput.focus();
    });
  } else if (cornerSelect) {
    cornerSelect.addEventListener("change", () => {
      const v = cornerSelect.value;
      if (v !== "br" && v !== "bl" && v !== "tr" && v !== "tl") return;
      applyCornerPref(v);
      saveCornerPref(v);
    });
  }
  paletteSelect?.addEventListener("change", () => {
    const v = paletteSelect.value;
    if (!/** @type {readonly string[]} */ (PALETTE_IDS).includes(v)) return;
    applyPalettePref(/** @type {(typeof PALETTE_IDS)[number]} */ (v));
    savePalettePref(/** @type {(typeof PALETTE_IDS)[number]} */ (v));
  });

  applyPetLabels();

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
  const IDLE_ANIM_CLASSES = IDLE_ANIM_SPECS.map((s) => s.cls);

  let tickleAnimTimer = 0;
  let playActive = false;
  let playEndTimer = 0;
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
    scheduleSyncPush();
  }

  function deskPetSyncEnabled() {
    return document.documentElement.dataset.deskPetSync === "on";
  }

  function readSyncMetaUpdatedAt() {
    try {
      const raw = localStorage.getItem(SYNC_META_KEY);
      if (!raw) return "";
      const parsed = JSON.parse(raw);
      return typeof parsed.updatedAt === "string" ? parsed.updatedAt : "";
    } catch {
      return "";
    }
  }

  function writeSyncMetaUpdatedAt(updatedAt) {
    try {
      localStorage.setItem(SYNC_META_KEY, JSON.stringify({ updatedAt }));
    } catch {
      /* ignore */
    }
  }

  function parseUpdatedAtMs(iso) {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : 0;
  }

  function buildSyncPayload() {
    const updatedAt = new Date().toISOString();
    writeSyncMetaUpdatedAt(updatedAt);
    return {
      v: 1,
      game: {
        fullness: state.fullness,
        lastFullnessAt: state.lastFullnessAt,
        tickleCount: state.tickleCount,
        feedCount: state.feedCount,
        expired: state.expired,
        alertedCute: state.alertedCute,
        alertedUrgent: state.alertedUrgent,
      },
      displayName: loadStoredPetName(),
      corner: loadCornerPref(),
      palette: loadPalettePref(),
      uiCollapsed: collapsed,
      updatedAt,
    };
  }

  function applyGameFromSync(game) {
    if (typeof game.fullness === "number") state.fullness = clamp(game.fullness, 0, 100);
    if (typeof game.tickleCount === "number") state.tickleCount = Math.max(0, game.tickleCount);
    if (typeof game.feedCount === "number") state.feedCount = Math.max(0, game.feedCount);
    if (typeof game.lastFullnessAt === "string" && game.lastFullnessAt) {
      state.lastFullnessAt = game.lastFullnessAt;
    }
    if (typeof game.expired === "boolean") state.expired = game.expired;
    if (typeof game.alertedCute === "boolean") state.alertedCute = game.alertedCute;
    if (typeof game.alertedUrgent === "boolean") state.alertedUrgent = game.alertedUrgent;
    if (state.expired) state.fullness = 0;
    if (state.fullness <= 0) {
      state.fullness = 0;
      state.expired = true;
    }
  }

  function applySyncPayload(payload) {
    if (!payload || payload.v !== 1 || !payload.game) return;
    applyGameFromSync(payload.game);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
    if (typeof payload.displayName === "string") saveStoredPetName(payload.displayName);
    if (payload.corner === "br" || payload.corner === "bl" || payload.corner === "tr" || payload.corner === "tl") {
      saveCornerPref(payload.corner);
      applyCornerPref(payload.corner);
      if (cornerSelect) cornerSelect.value = payload.corner;
    }
    if (payload.palette && PALETTE_IDS.includes(payload.palette)) {
      savePalettePref(payload.palette);
      applyPalettePref(payload.palette);
      if (paletteSelect) paletteSelect.value = payload.palette;
    }
    if (typeof payload.uiCollapsed === "boolean") {
      collapsed = payload.uiCollapsed;
      saveUiCollapsed();
      applyPanelLayout();
    }
    if (typeof payload.updatedAt === "string" && payload.updatedAt) {
      writeSyncMetaUpdatedAt(payload.updatedAt);
    }
    applyPetLabels();
  }

  let applyingRemoteSync = false;
  let syncPushTimer = 0;

  function scheduleSyncPush() {
    if (!deskPetSyncEnabled() || applyingRemoteSync) return;
    if (syncPushTimer) window.clearTimeout(syncPushTimer);
    syncPushTimer = window.setTimeout(() => {
      syncPushTimer = 0;
      pushSyncToServer();
    }, 600);
  }

  async function pushSyncToServer() {
    if (!deskPetSyncEnabled() || applyingRemoteSync) return;
    try {
      const payload = buildSyncPayload();
      await fetch(DESK_PET_API, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: payload }),
      });
    } catch {
      /* ignore */
    }
  }

  async function mergeDeskPetFromServer() {
    if (!deskPetSyncEnabled()) return;
    try {
      const res = await fetch(DESK_PET_API, { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      const remote = data && data.state;
      const localAt = readSyncMetaUpdatedAt();
      if (!remote) {
        scheduleSyncPush();
        return;
      }
      const remoteAt = typeof remote.updatedAt === "string" ? remote.updatedAt : "";
      if (parseUpdatedAtMs(remoteAt) > parseUpdatedAtMs(localAt)) {
        applyingRemoteSync = true;
        applySyncPayload(remote);
        applyingRemoteSync = false;
      } else if (parseUpdatedAtMs(localAt) > parseUpdatedAtMs(remoteAt)) {
        scheduleSyncPush();
      }
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

  /** Stop panel wobble / danger animations (e.g. after feeding above 10%). */
  function dismissDecayPanelAnimations() {
    if (panelAlertTimer) {
      window.clearTimeout(panelAlertTimer);
      panelAlertTimer = 0;
    }
    clearPanelAlertClasses();
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
    const petName = getPetDisplayName();
    const a = urgent ? `${petName} needs food!` : petName;
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
    tryNotify(getPetDisplayName(), "Getting a bit peckish—maybe a snack when you can?");
    save();
    window.dispatchEvent(new CustomEvent("deskPet:hungerCute", { detail: { ...state } }));
  }

  function fireUrgentHungerAlert() {
    if (state.alertedUrgent) return;
    state.alertedUrgent = true;
    setStatus("I'm really hungry now… please feed me soon!", 8000);
    showPanelAlert("urgent", 7500);
    startTitleFlash(true);
    const petName = getPetDisplayName();
    tryNotify(
      `${petName} needs you!`,
      `${petName} is running on empty—feed them before it's too late.`
    );
    save();
    window.dispatchEvent(new CustomEvent("deskPet:hungerUrgent", { detail: { ...state } }));
  }

  /**
   * On each fullness drop from time decay: wobble in 6–11%, danger shake in 1–5%.
   * (5% is danger; 6–11% is the softer band.)
   */
  function maybeDecayPanelRockOrDanger(prevFullness, nextFullness) {
    if (state.expired) return;
    if (nextFullness >= prevFullness) return;
    if (nextFullness <= 0) return;

    if (nextFullness <= 5) {
      showPanelAlert("urgent", 3400);
    } else if (nextFullness <= 11) {
      showPanelAlert("cute", 3000);
    }
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
    maybeDecayPanelRockOrDanger(prev, next);
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
    scheduleSyncPush();
  }

  function applyPanelLayout() {
    root.classList.toggle("desk-pet--compact", collapsed);
    const petName = getPetDisplayName();
    collapseToggles.forEach((btn) => {
      btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      btn.setAttribute(
        "aria-label",
        collapsed ? `Expand ${petName} panel` : `Shrink ${petName} to a slim bar`
      );
      btn.textContent = collapsed ? "\u25B4" : "\u25BE";
    });

    if (collapsed) {
      cancelIdleScheduler();
    }

    if (state.expired) {
      aliveExpand.hidden = true;
      aliveCompact.hidden = true;
      reviveExpand.hidden = collapsed;
      reviveCompact.hidden = false;
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
      playActive ||
      creature.classList.contains("desk-pet-creature--ball-play") ||
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

  /** Reduce fullness from exertion (tickle / play). Applies wall-clock decay first. */
  function applyExertionDrop(points) {
    applyTimeDecay();
    if (state.expired) return;
    const n = Math.max(0, Math.round(points));
    if (n <= 0) return;
    const prev = state.fullness;
    const next = clamp(prev - n, 0, 100);
    state.fullness = next;

    if (state.fullness <= 0) {
      state.fullness = 0;
      state.expired = true;
      state.alertedCute = false;
      state.alertedUrgent = false;
      stopTitleFlash();
      save();
      renderVisibility();
      render();
      window.dispatchEvent(new CustomEvent("deskPet:expired", { detail: { ...state } }));
      return;
    }

    maybeHungerAlertsAfterDecay(prev, state.fullness);
    maybeDecayPanelRockOrDanger(prev, state.fullness);
    save();
    render();
  }

  /** @param {{ source?: string }} [opts] Use `source: "manual"` for the Feed button; `taskCreated` / `taskCompleted` for gamified feeds. */
  function feed(opts) {
    opts = opts || {};
    const source = typeof opts.source === "string" ? opts.source : undefined;
    if (playActive) return;
    applyTimeDecay();
    if (state.expired) return;

    if (state.fullness >= 100) {
      anim("desk-pet-creature--refuse-feed", 1150);
      setStatus("No more—I'm stuffed!", 2400);
      window.dispatchEvent(new CustomEvent("deskPet:feedRefused", { detail: { ...state } }));
      if (typeof window.ManagerDailyToasts !== "undefined" && typeof window.ManagerDailyToasts.show === "function") {
        window.ManagerDailyToasts.show({
          message: `${getPetDisplayName()} is full, great job!`,
          variant: "pet",
        });
      }
      return;
    }

    const fullnessBefore = state.fullness;
    const fullnessAfter = clamp(Math.floor(fullnessBefore + 22), 0, 100);
    const delta = fullnessAfter - fullnessBefore;
    state.fullness = fullnessAfter;
    state.feedCount += 1;
    touchFullnessClock();
    resetAlertFlagsIfRecovered();
    save();
    if (state.fullness > 10) dismissDecayPanelAnimations();
    anim("desk-pet-creature--munch", 1100);
    spawnFeedHearts();
    setStatus("Yum!", 1800);
    render();
    window.dispatchEvent(
      new CustomEvent("deskPet:feed", {
        detail: source ? { ...state, source } : { ...state },
      })
    );

    if (
      typeof window.ManagerDailyToasts !== "undefined" &&
      typeof window.ManagerDailyToasts.show === "function"
    ) {
      const petName = getPetDisplayName();
      if (fullnessAfter >= 100) {
        if (source === "manual" || source === "taskCreated" || source === "taskCompleted") {
          window.ManagerDailyToasts.show({
            message: `${petName} is full, great job!`,
            variant: "pet",
          });
        }
      } else if (source === "manual" && delta > 0) {
        window.ManagerDailyToasts.show({
          message: `You fed ${petName}. Contentment went up by ${delta}%.`,
          variant: "pet",
        });
      }
    }
  }

  function tickle() {
    if (playActive) return;
    applyExertionDrop(EXERTION_DROP_PER_TICKLE);
    if (state.expired) return;

    state.tickleCount += 1;
    save();
    runTickleAnimation();
    const lines = ["Hee hee!", "Eeehee—that tickles!", "Nooo… okay, one more tickle!"];
    setStatus(lines[Math.floor(Math.random() * lines.length)], 2000);
    render();
    window.dispatchEvent(new CustomEvent("deskPet:tickle", { detail: { ...state } }));
  }

  function setInteractionLocked(locked) {
    btnPlay.disabled = locked;
    btnFeed.disabled = locked;
    creature.classList.toggle("desk-pet-creature--interaction-locked", locked);
    creature.tabIndex = locked ? -1 : 0;
    creature.setAttribute("aria-disabled", locked ? "true" : "false");
  }

  function endBallPlay() {
    if (playEndTimer) {
      window.clearTimeout(playEndTimer);
      playEndTimer = 0;
    }
    playActive = false;
    playBall.classList.remove("desk-pet-play-ball--animate");
    creature.classList.remove("desk-pet-creature--ball-play");
    setInteractionLocked(false);
    applyExertionDrop(EXERTION_DROP_PER_TICKLE);
    if (!state.expired) {
      setStatus("Fun! …Need a tiny rest now.", 3500);
      scheduleIdleAnim();
    }
    window.dispatchEvent(new CustomEvent("deskPet:play", { detail: { ...state } }));
  }

  function play() {
    if (playActive || state.expired) return;
    applyTimeDecay();
    if (state.expired) return;

    playActive = true;
    setInteractionLocked(true);
    clearIdleAnimations();
    clearTickleAnimation();
    playBall.classList.remove("desk-pet-play-ball--animate");
    creature.classList.remove("desk-pet-creature--ball-play");
    void playBall.offsetWidth;
    void creature.offsetWidth;
    creature.classList.add("desk-pet-creature--ball-play");
    playBall.classList.add("desk-pet-play-ball--animate");
    setStatus("Ball! Get it!", 2200);
    playEndTimer = window.setTimeout(endBallPlay, PLAY_SESSION_MS);
  }

  function revive() {
    state.expired = false;
    state.fullness = 20;
    state.alertedCute = false;
    state.alertedUrgent = false;
    touchFullnessClock();
    stopTitleFlash();
    dismissDecayPanelAnimations();
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

  btnFeed.addEventListener("click", () => feed({ source: "manual" }));
  btnPlay.addEventListener("click", play);
  creature.addEventListener("click", () => tickle());
  creature.addEventListener("keydown", (e) => {
    if (playActive || state.expired) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      tickle();
    }
  });
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

  async function bootDeskPet() {
    load();
    await mergeDeskPetFromServer();
    applyTimeDecay();
    resetAlertFlagsIfRecovered();
    save();
    maybeSteadyStateAlertsOnLoad();

    renderVisibility();
    render();
    cancelIdleScheduler();
    if (!state.expired && !collapsed) scheduleIdleAnim();
    window.setInterval(tick, TICK_MS);
  }

  bootDeskPet();

  window.DeskPet = {
    getState: () => ({ ...state }),
    getPetDisplayName,
    feed,
    tickle,
    play,
    revive,
    tick,
    /** @param {(s: typeof state) => void} fn */
    subscribe(fn) {
      const wrap = () => fn({ ...state });
      window.addEventListener("deskPet:feed", wrap);
      window.addEventListener("deskPet:feedRefused", wrap);
      window.addEventListener("deskPet:tickle", wrap);
      window.addEventListener("deskPet:play", wrap);
      window.addEventListener("deskPet:hungerCute", wrap);
      window.addEventListener("deskPet:hungerUrgent", wrap);
      window.addEventListener("deskPet:expired", wrap);
      window.addEventListener("deskPet:revived", wrap);
      return () => {
        window.removeEventListener("deskPet:feed", wrap);
        window.removeEventListener("deskPet:feedRefused", wrap);
        window.removeEventListener("deskPet:tickle", wrap);
        window.removeEventListener("deskPet:play", wrap);
        window.removeEventListener("deskPet:hungerCute", wrap);
        window.removeEventListener("deskPet:hungerUrgent", wrap);
        window.removeEventListener("deskPet:expired", wrap);
        window.removeEventListener("deskPet:revived", wrap);
      };
    },
  };

  (function consumeDeskPetGamifyFromUrl() {
    try {
      const u = new URL(window.location.href);
      const parseCount = (param) => {
        const raw = u.searchParams.get(param);
        if (raw === null || raw === "") return 0;
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n) || n < 1) return 0;
        return Math.min(50, n);
      };
      const createN = parseCount("deskPetCreate");
      const completeN = parseCount("deskPetComplete");
      if (createN === 0 && completeN === 0) return;

      function stripGamifyFromUrl() {
        u.searchParams.delete("deskPetCreate");
        u.searchParams.delete("deskPetComplete");
        const next = `${u.pathname}${u.search}${u.hash}`;
        window.history.replaceState({}, "", next);
      }

      /** @type {string[]} */
      const queue = [];
      for (let i = 0; i < createN; i++) queue.push("taskCreated");
      for (let i = 0; i < completeN; i++) queue.push("taskCompleted");

      let qi = 0;
      const gapMs = 400;
      function runFeedQueue() {
        function step() {
          if (qi >= queue.length) return;
          feed({ source: queue[qi] });
          qi += 1;
          if (qi < queue.length) window.setTimeout(step, gapMs);
        }
        window.setTimeout(step, 80);
      }

      function showGamifyToastsThenStrip(then) {
        const name = getPetDisplayName();
        const show = window.ManagerDailyToasts?.show;
        if (typeof show !== "function") {
          then();
          return;
        }
        stripGamifyFromUrl();
        if (createN > 0) {
          show({
            message: `You created a task. ${name} is happy!`,
            variant: "task-created",
          });
        }
        if (completeN > 0) {
          const delayMs = createN > 0 ? 520 : 0;
          window.setTimeout(() => {
            show({
              message: `You completed a task. ${name} loves it!`,
              variant: "task-completed",
            });
          }, delayMs);
        }
        then();
      }

      let attempts = 0;
      const maxAttempts = 60;
      function tryConsume() {
        if (typeof window.ManagerDailyToasts?.show === "function") {
          showGamifyToastsThenStrip(runFeedQueue);
          return;
        }
        attempts += 1;
        if (attempts >= maxAttempts) {
          stripGamifyFromUrl();
          runFeedQueue();
          return;
        }
        window.setTimeout(tryConsume, 16);
      }
      tryConsume();
    } catch {
      /* ignore */
    }
  })();
})();
