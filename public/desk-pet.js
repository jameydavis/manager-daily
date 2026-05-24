/**
 * Desk pet — time-based hunger, alerts, expiry + revive. Extend via window.DeskPet.
 */
import {
  getAppearanceRevisionFromPayload,
  parseUpdatedAtMs,
  planDeskPetSyncMerge,
} from "./client/deskPetSyncMerge.js";

(function () {
  const STORAGE_KEY = "dailyDashboardDeskPet";
  /** Last sync payload timestamp (ISO); used to merge with server when signed in. */
  const SYNC_META_KEY = "dailyDashboardDeskPetSyncMeta";
  /** When name/corner/palette were last saved locally (ISO). */
  const APPEARANCE_META_KEY = "dailyDashboardDeskPetAppearanceMeta";
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
  const playRope = document.getElementById("desk-pet-play-rope");
  const fxLayer = document.getElementById("desk-pet-fx");
  const aliveExpand = document.getElementById("desk-pet-alive-expand");
  const aliveCompact = document.getElementById("desk-pet-alive-compact");
  const aliveCompactPct = document.getElementById("desk-pet-alive-compact-pct");
  const reviveExpand = document.getElementById("desk-pet-revive-expand");
  const reviveCompact = document.getElementById("desk-pet-revive-compact");
  const reviveCompactBtn = document.getElementById("desk-pet-revive-compact-btn");
  const reviveCompactPct = document.getElementById("desk-pet-revive-compact-pct");

  function deskPetVisible() {
    if (typeof window.DailyDashboardToasts?.isDeskPetVisible === "function") {
      return window.DailyDashboardToasts.isDeskPetVisible();
    }
    return document.documentElement.dataset.deskPet !== "off";
  }

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
    !playRope ||
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

  const PET_NAME_KEY = "dailyDashboardDeskPetDisplayName";
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
    "Sal-n-Pepa",
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

  function writePetNameLocal(raw) {
    const t = typeof raw === "string" ? raw.trim().slice(0, MAX_PET_NAME_LEN) : "";
    try {
      if (!t) localStorage.removeItem(PET_NAME_KEY);
      else localStorage.setItem(PET_NAME_KEY, t);
    } catch {
      /* ignore */
    }
  }

  function saveStoredPetName(raw) {
    writePetNameLocal(raw);
    writeAppearanceRevision(new Date().toISOString());
    scheduleSyncPush();
  }

  function getPetDisplayName() {
    return loadStoredPetName() || DEFAULT_PET_NAME;
  }

  function applyPetLabelsWithName(rawName) {
    const name = (typeof rawName === "string" && rawName.trim()) || DEFAULT_PET_NAME;
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

  function applyPetLabels() {
    applyPetLabelsWithName(loadStoredPetName());
  }

  const UI_COLLAPSED_KEY = "dailyDashboardDeskPetUiCollapsed";
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(UI_COLLAPSED_KEY) === "1";
  } catch {
    collapsed = false;
  }

  const collapseToggles = root.querySelectorAll(".desk-pet-collapse-toggle");

  const CORNER_KEY = "dailyDashboardDeskPetCorner";
  const CORNER_IDS = /** @type {const} */ (["br", "bl", "tr", "tl"]);

  const PALETTE_KEY = "dailyDashboardDeskPetPalette";
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
  const settingsSaveBtn = document.getElementById("desk-pet-settings-save");
  const cornerSelect = document.getElementById("desk-pet-corner");
  const paletteSelect = document.getElementById("desk-pet-palette");
  const nameInput = document.getElementById("desk-pet-name");
  const nameHintEl = document.getElementById("desk-pet-name-hint");
  const nameRandomBtn = document.getElementById("desk-pet-name-random");

  let settingsEditing = false;
  /** @type {{ name: string; corner: (typeof CORNER_IDS)[number]; palette: (typeof PALETTE_IDS)[number] }} */
  let settingsDraft = { name: "", corner: "br", palette: "lavender" };

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
    if (typeof window.DailyDashboardToasts?.syncAnchorFromDeskPet === "function") {
      window.DailyDashboardToasts.syncAnchorFromDeskPet();
    }
  }

  /** @param {(typeof CORNER_IDS)[number]} corner */
  function writeCornerLocal(corner) {
    try {
      localStorage.setItem(CORNER_KEY, corner);
    } catch {
      /* ignore */
    }
  }

  function saveCornerPref(corner) {
    writeCornerLocal(corner);
    writeAppearanceRevision(new Date().toISOString());
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
  function writePaletteLocal(palette) {
    try {
      localStorage.setItem(PALETTE_KEY, palette);
    } catch {
      /* ignore */
    }
  }

  function savePalettePref(palette) {
    writePaletteLocal(palette);
    writeAppearanceRevision(new Date().toISOString());
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

  /** @returns {{ name: string; corner: (typeof CORNER_IDS)[number]; palette: (typeof PALETTE_IDS)[number] }} */
  function readSavedAppearanceSettings() {
    return {
      name: loadStoredPetName(),
      corner: loadCornerPref(),
      palette: loadPalettePref(),
    };
  }

  /** @param {{ name: string; corner: (typeof CORNER_IDS)[number]; palette: (typeof PALETTE_IDS)[number] }} appearance */
  function applyAppearancePreview(appearance) {
    applyCornerPref(appearance.corner);
    applyPalettePref(appearance.palette);
    applyPetLabelsWithName(appearance.name);
  }

  /** @param {{ name: string; corner: (typeof CORNER_IDS)[number]; palette: (typeof PALETTE_IDS)[number] }} appearance */
  function applyAppearanceToUi(appearance) {
    applyCornerPref(appearance.corner);
    applyPalettePref(appearance.palette);
    applyPetLabelsWithName(appearance.name);
    if (cornerSelect) cornerSelect.value = appearance.corner;
    if (paletteSelect) paletteSelect.value = appearance.palette;
    if (nameInput) nameInput.value = appearance.name;
  }

  /** @param {{ name: string; corner: (typeof CORNER_IDS)[number]; palette: (typeof PALETTE_IDS)[number] }} appearance */
  function persistAppearanceSettings(appearance) {
    const name = typeof appearance.name === "string" ? appearance.name.trim().slice(0, MAX_PET_NAME_LEN) : "";
    writePetNameLocal(name);
    writeCornerLocal(appearance.corner);
    writePaletteLocal(appearance.palette);
    writeAppearanceRevision(new Date().toISOString());
    applyAppearanceToUi({ ...appearance, name });
    scheduleSyncPush();
  }

  function revertAppearanceToSaved() {
    const saved = readSavedAppearanceSettings();
    applyAppearancePreview(saved);
    if (cornerSelect) cornerSelect.value = saved.corner;
    if (paletteSelect) paletteSelect.value = saved.palette;
    if (nameInput) nameInput.value = saved.name;
    updateNameFieldFeedback();
  }

  function updateSettingsDraftFromForm() {
    if (nameInput) settingsDraft.name = nameInput.value;
    if (cornerSelect) {
      const v = cornerSelect.value;
      if (v === "br" || v === "bl" || v === "tr" || v === "tl") settingsDraft.corner = v;
    }
    if (paletteSelect) {
      const v = paletteSelect.value;
      if (/** @type {readonly string[]} */ (PALETTE_IDS).includes(v)) {
        settingsDraft.palette = /** @type {(typeof PALETTE_IDS)[number]} */ (v);
      }
    }
  }

  if (settingsDialog && settingsOpenBtn && cornerSelect && typeof settingsDialog.showModal === "function") {
    settingsOpenBtn.addEventListener("click", () => {
      settingsDraft = readSavedAppearanceSettings();
      if (nameInput) nameInput.value = settingsDraft.name;
      cornerSelect.value = settingsDraft.corner;
      if (paletteSelect) paletteSelect.value = settingsDraft.palette;
      updateNameFieldFeedback();
      settingsEditing = true;
      settingsDialog.showModal();
    });
    settingsCloseBtn?.addEventListener("click", () => {
      settingsEditing = false;
      revertAppearanceToSaved();
      if (settingsDialog.open) settingsDialog.close();
    });
    settingsSaveBtn?.addEventListener("click", async () => {
      if (nameInput && nameInput.value.length > MAX_PET_NAME_LEN) {
        nameInput.value = nameInput.value.slice(0, MAX_PET_NAME_LEN);
      }
      updateSettingsDraftFromForm();
      settingsEditing = false;
      persistAppearanceSettings(settingsDraft);
      await flushAppearanceSettingsToServer();
      if (settingsDialog.open) settingsDialog.close();
    });
    settingsDialog.addEventListener("click", (e) => {
      if (e.target !== settingsDialog) return;
      settingsEditing = false;
      revertAppearanceToSaved();
      settingsDialog.close();
    });
    cornerSelect.addEventListener("change", () => {
      const v = cornerSelect.value;
      if (v !== "br" && v !== "bl" && v !== "tr" && v !== "tl") return;
      if (settingsEditing) {
        settingsDraft.corner = v;
        applyCornerPref(v);
        return;
      }
      applyCornerPref(v);
      saveCornerPref(v);
    });
    nameInput?.addEventListener("input", () => {
      if (settingsEditing) {
        settingsDraft.name = nameInput.value;
        if (nameInput.value.length <= MAX_PET_NAME_LEN) {
          applyPetLabelsWithName(nameInput.value);
        }
      }
      updateNameFieldFeedback();
    });
    nameRandomBtn?.addEventListener("click", () => {
      if (!nameInput) return;
      const pick = CUTE_PET_NAMES[Math.floor(Math.random() * CUTE_PET_NAMES.length)];
      nameInput.value = pick;
      settingsDraft.name = pick;
      applyPetLabelsWithName(pick);
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
    const palette = /** @type {(typeof PALETTE_IDS)[number]} */ (v);
    if (settingsEditing) {
      settingsDraft.palette = palette;
      applyPalettePref(palette);
      return;
    }
    applyPalettePref(palette);
    savePalettePref(palette);
  });

  applyPetLabels();

  const TICKLE_SPECS = [
    { spec: "desk-pet-creature--giggle", ms: 950 },
    { spec: "desk-pet-creature--tickle-twist", ms: 1000 },
    { spec: "desk-pet-creature--tickle-boing", ms: 920 },
  ];
  const TICKLE_SPEC_CLASSES = TICKLE_SPECS.map((s) => s.spec);

  const PLAY_SPECS = [
    {
      spec: "desk-pet-creature--ball-play",
      ms: PLAY_SESSION_MS,
      usesBall: true,
      lines: ["Ball! Get it!", "Chase the shiny!", "Wheee—ball time!"],
    },
    {
      spec: "desk-pet-creature--play-dance",
      ms: 5800,
      lines: ["Groove mode!", "Shimmy shimmy!", "Dance party!"],
    },
    {
      spec: "desk-pet-creature--play-rope",
      ms: 6200,
      usesRope: true,
      lines: ["Skip-hop!", "One-two—skip!", "Rope rhythm!"],
    },
    {
      spec: "desk-pet-creature--play-hop",
      ms: 5400,
      lines: ["Boing boing!", "Hop-hop-hop!", "Bouncy buddy!"],
    },
  ];
  const PLAY_SPEC_CLASSES = PLAY_SPECS.map((s) => s.spec);

  const IDLE_ANIM_SPECS = [
    { cls: "desk-pet-creature--idle-rock", ms: 2200 },
    { cls: "desk-pet-creature--idle-bounce", ms: 1850 },
    { cls: "desk-pet-creature--idle-sway", ms: 2100 },
    { cls: "desk-pet-creature--idle-jelly", ms: 1950 },
    { cls: "desk-pet-creature--idle-nod", ms: 1650 },
  ];
  const IDLE_ANIM_CLASSES = IDLE_ANIM_SPECS.map((s) => s.cls);

  const FEED_FOOD_ITEMS = ["🍎", "🍪", "🥕", "🍇", "🧀", "🍞", "🥐", "🍓", "🥨", "🍌", "🫐", "🥯"];
  const FEED_FOOD_FLIGHT_MS = 720;
  /** Contentment gained when a task is removed (see `deskPetRemove` redirect param). */
  const TASK_REMOVE_CONTENTMENT_BUMP = 1;
  /** Contentment per task carried over (see `deskPetCarryOver` redirect param). */
  const CARRY_OVER_CONTENTMENT_PER_TASK = 1;

  let tickleAnimTimer = 0;
  let playActive = false;
  let feedingActive = false;
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

  function readAppearanceRevision() {
    try {
      const raw = localStorage.getItem(APPEARANCE_META_KEY);
      if (!raw) return "";
      const parsed = JSON.parse(raw);
      return typeof parsed.updatedAt === "string" ? parsed.updatedAt : "";
    } catch {
      return "";
    }
  }

  function writeAppearanceRevision(updatedAt) {
    if (!updatedAt) return;
    try {
      localStorage.setItem(APPEARANCE_META_KEY, JSON.stringify({ updatedAt }));
    } catch {
      /* ignore */
    }
  }

  function ensureAppearanceRevisionSeeded() {
    if (readAppearanceRevision()) return;
    const hasCustomAppearance =
      !!loadStoredPetName() ||
      loadCornerPref() !== "br" ||
      loadPalettePref() !== "lavender";
    if (hasCustomAppearance) {
      writeAppearanceRevision(new Date().toISOString());
    }
  }

  function buildSyncPayload() {
    ensureAppearanceRevisionSeeded();
    const updatedAt = new Date().toISOString();
    writeSyncMetaUpdatedAt(updatedAt);
    const appearanceUpdatedAt = readAppearanceRevision();
    /** @type {Record<string, unknown>} */
    const payload = {
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
    if (appearanceUpdatedAt) {
      payload.appearanceUpdatedAt = appearanceUpdatedAt;
    }
    return payload;
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

  /** @param {ReturnType<typeof buildSyncPayload>} payload */
  function applyAppearanceFromSync(payload) {
    const remoteName =
      typeof payload.displayName === "string"
        ? payload.displayName.trim().slice(0, MAX_PET_NAME_LEN)
        : "";
    const localName = loadStoredPetName();
    const name = remoteName || localName;
    const corner =
      payload.corner === "br" || payload.corner === "bl" || payload.corner === "tr" || payload.corner === "tl"
        ? payload.corner
        : loadCornerPref();
    const palette =
      payload.palette && PALETTE_IDS.includes(payload.palette) ? payload.palette : loadPalettePref();
    writePetNameLocal(name);
    writeCornerLocal(corner);
    writePaletteLocal(palette);
    const appearanceRev = getAppearanceRevisionFromPayload(payload);
    if (appearanceRev) writeAppearanceRevision(appearanceRev);
    applyAppearanceToUi({ name, corner, palette });
  }

  /** @param {ReturnType<typeof buildSyncPayload>} payload */
  function applyGameSyncPayload(payload) {
    if (!payload || payload.v !== 1 || !payload.game) return;
    applyGameFromSync(payload.game);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
    if (typeof payload.uiCollapsed === "boolean") {
      collapsed = payload.uiCollapsed;
      try {
        localStorage.setItem(UI_COLLAPSED_KEY, collapsed ? "1" : "0");
      } catch {
        /* ignore */
      }
      applyPanelLayout();
    }
    if (typeof payload.updatedAt === "string" && payload.updatedAt) {
      writeSyncMetaUpdatedAt(payload.updatedAt);
    }
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

  async function flushAppearanceSettingsToServer() {
    if (syncPushTimer) {
      window.clearTimeout(syncPushTimer);
      syncPushTimer = 0;
    }
    await pushSyncToServer();
  }

  async function mergeDeskPetFromServer() {
    if (!deskPetSyncEnabled()) return;
    try {
      const res = await fetch(DESK_PET_API, { credentials: "same-origin" });
      if (!res.ok) return;
      const data = await res.json();
      const remote = data && data.state;
      const localAt = readSyncMetaUpdatedAt();
      const localAppearanceAt = readAppearanceRevision();
      if (!remote) {
        scheduleSyncPush();
        return;
      }
      const remoteAt = typeof remote.updatedAt === "string" ? remote.updatedAt : "";
      const remoteAppearanceAt = getAppearanceRevisionFromPayload(remote);
      const mergePlan = planDeskPetSyncMerge({
        localUpdatedAt: localAt,
        remoteUpdatedAt: remoteAt,
        localAppearanceUpdatedAt: localAppearanceAt,
        remoteAppearanceUpdatedAt: remoteAppearanceAt,
      });

      applyingRemoteSync = true;
      if (mergePlan.applyRemoteGame) {
        applyGameSyncPayload(remote);
      }
      if (mergePlan.applyRemoteAppearance) {
        applyAppearanceFromSync(remote);
      } else if (mergePlan.shouldPushLocal && localAppearanceAt) {
        applyAppearanceToUi(readSavedAppearanceSettings());
      }
      applyingRemoteSync = false;

      if (mergePlan.shouldPushLocal) scheduleSyncPush();
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

  /** Play or feed session in progress — block other main interactions. */
  function isSessionBusy() {
    return playActive || feedingActive;
  }

  function isCreatureBusy() {
    return (
      isSessionBusy() ||
      PLAY_SPEC_CLASSES.some((c) => creature.classList.contains(c)) ||
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

  /** @returns {{ x: number; y: number }} */
  function getMouthPointInStage() {
    const mouth = creature.querySelector(".desk-pet-mouth");
    const target = mouth || creature.querySelector(".desk-pet-face") || creature;
    const stageRect = stageEl.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - stageRect.left,
      y: r.top + r.height / 2 - stageRect.top,
    };
  }

  /** @param {number} width @param {number} height @returns {{ x: number; y: number }} */
  function randomFoodSpawnPoint(width, height) {
    const pad = 6;
    const spots = [
      { x: pad, y: height * 0.72 },
      { x: width - pad, y: height * 0.68 },
      { x: width * 0.18, y: height - pad },
      { x: width * 0.82, y: height - pad },
      { x: width * 0.12, y: height * 0.38 },
      { x: width * 0.88, y: height * 0.42 },
    ];
    return spots[Math.floor(Math.random() * spots.length)];
  }

  /**
   * Random snack flies into the mouth, then `onArrived` runs (meter bump + hearts).
   * @param {() => void} onArrived
   */
  function playFeedFoodFlight(onArrived) {
    if (!stageEl) {
      onArrived();
      return;
    }
    const stageRect = stageEl.getBoundingClientRect();
    if (stageRect.width < 8 || stageRect.height < 8) {
      onArrived();
      return;
    }

    const start = randomFoodSpawnPoint(stageRect.width, stageRect.height);
    const mouth = getMouthPointInStage();
    const food = document.createElement("span");
    food.className = "desk-pet-food";
    food.setAttribute("aria-hidden", "true");
    food.textContent = FEED_FOOD_ITEMS[Math.floor(Math.random() * FEED_FOOD_ITEMS.length)];
    food.style.left = `${start.x}px`;
    food.style.top = `${start.y}px`;
    food.style.setProperty("--food-dx", `${mouth.x - start.x}px`);
    food.style.setProperty("--food-dy", `${mouth.y - start.y}px`);
    food.style.setProperty("--food-spin-start", `${-14 - Math.random() * 22}deg`);
    food.style.setProperty("--food-spin-end", `${4 + Math.random() * 16}deg`);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      food.remove();
      onArrived();
    };

    food.addEventListener("animationend", finish, { once: true });
    stageEl.appendChild(food);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => food.classList.add("desk-pet-food--fly"));
    });
    window.setTimeout(finish, FEED_FOOD_FLIGHT_MS + 80);
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

  /** @returns {boolean} */
  function takeDeskPetRemoveFromUrl() {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("deskPetRemove") !== "1") return false;
      u.searchParams.delete("deskPetRemove");
      const next = `${u.pathname}${u.search}${u.hash}`;
      window.history.replaceState({}, "", next);
      return true;
    } catch {
      return false;
    }
  }

  /** @returns {number} */
  function takeDeskPetCarryOverFromUrl() {
    try {
      const u = new URL(window.location.href);
      const raw = u.searchParams.get("deskPetCarryOver");
      if (raw === null || raw === "") return 0;
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 1) return 0;
      const count = Math.min(50, n);
      u.searchParams.delete("deskPetCarryOver");
      const next = `${u.pathname}${u.search}${u.hash}`;
      window.history.replaceState({}, "", next);
      return count;
    } catch {
      return 0;
    }
  }

  /** @param {number} delta */
  function applyContentmentBump(delta) {
    if (state.expired || delta <= 0) return;
    state.fullness = clamp(state.fullness + delta, 0, 100);
    touchFullnessClock();
    resetAlertFlagsIfRecovered();
    if (state.fullness > 10) dismissDecayPanelAnimations();
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

  /**
   * @param {{ source?: string; fullnessAfter: number; delta: number }} ctx
   */
  function finishFeedCelebration(ctx) {
    const { source, fullnessAfter, delta } = ctx;
    state.fullness = fullnessAfter;
    state.feedCount += 1;
    touchFullnessClock();
    resetAlertFlagsIfRecovered();
    save();
    if (state.fullness > 10) dismissDecayPanelAnimations();
    anim("desk-pet-creature--munch", 1100);
    render();
    setStatus("Yum!", 1800);
    spawnFeedHearts();
    window.dispatchEvent(
      new CustomEvent("deskPet:feed", {
        detail: source ? { ...state, source } : { ...state },
      })
    );

    if (
      deskPetVisible() &&
      typeof window.DailyDashboardToasts !== "undefined" &&
      typeof window.DailyDashboardToasts.show === "function"
    ) {
      const petName = getPetDisplayName();
      if (fullnessAfter >= 100) {
        if (source === "manual" || source === "taskCreated" || source === "taskCompleted") {
          window.DailyDashboardToasts.show({
            message: `${petName} is full, great job!`,
            variant: "pet",
          });
        }
      } else if (source === "manual" && delta > 0) {
        window.DailyDashboardToasts.show({
          message: `You fed ${petName}. Contentment went up by ${delta}%.`,
          variant: "pet",
        });
      }
    }

    window.setTimeout(() => {
      feedingActive = false;
      if (!playActive) setInteractionLocked(false);
    }, 1150);
  }

  /** @param {{ source?: string }} [opts] Use `source: "manual"` for the Feed button; `taskCreated` / `taskCompleted` for gamified feeds. */
  function feed(opts) {
    opts = opts || {};
    const source = typeof opts.source === "string" ? opts.source : undefined;
    if (isSessionBusy()) return;
    applyTimeDecay();
    if (state.expired) return;

    if (state.fullness >= 100) {
      anim("desk-pet-creature--refuse-feed", 1150);
      setStatus("No more—I'm stuffed!", 2400);
      window.dispatchEvent(new CustomEvent("deskPet:feedRefused", { detail: { ...state } }));
      if (
        deskPetVisible() &&
        typeof window.DailyDashboardToasts !== "undefined" &&
        typeof window.DailyDashboardToasts.show === "function"
      ) {
        window.DailyDashboardToasts.show({
          message: `${getPetDisplayName()} is full, great job!`,
          variant: "pet",
        });
      }
      return;
    }

    const fullnessBefore = state.fullness;
    const fullnessAfter = clamp(Math.floor(fullnessBefore + 22), 0, 100);
    const delta = fullnessAfter - fullnessBefore;
    const ctx = { source, fullnessAfter, delta };

    feedingActive = true;
    setInteractionLocked(true);
    cancelIdleScheduler();
    clearTickleAnimation();
    playFeedFoodFlight(() => finishFeedCelebration(ctx));
  }

  function tickle() {
    if (isSessionBusy()) return;
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

  function clearPlayAnimation() {
    playBall.classList.remove("desk-pet-play-ball--animate");
    playRope.classList.remove("desk-pet-play-rope--animate");
    stageEl.classList.remove("desk-pet-stage--play-rope");
    creature.classList.remove("desk-pet-creature--play", ...PLAY_SPEC_CLASSES);
  }

  function endPlay() {
    if (playEndTimer) {
      window.clearTimeout(playEndTimer);
      playEndTimer = 0;
    }
    playActive = false;
    clearPlayAnimation();
    setInteractionLocked(false);
    applyExertionDrop(EXERTION_DROP_PER_TICKLE);
    if (!state.expired) {
      setStatus("Fun! …Need a tiny rest now.", 3500);
      scheduleIdleAnim();
    }
    window.dispatchEvent(new CustomEvent("deskPet:play", { detail: { ...state } }));
  }

  function play() {
    if (isSessionBusy() || state.expired) return;
    applyTimeDecay();
    if (state.expired) return;

    const choice = PLAY_SPECS[Math.floor(Math.random() * PLAY_SPECS.length)];

    playActive = true;
    setInteractionLocked(true);
    clearIdleAnimations();
    clearTickleAnimation();
    clearPlayAnimation();
    void playBall.offsetWidth;
    void playRope.offsetWidth;
    void creature.offsetWidth;

    creature.classList.add("desk-pet-creature--play", choice.spec);
    if (choice.usesBall) {
      playBall.classList.add("desk-pet-play-ball--animate");
    }
    if (choice.usesRope) {
      stageEl.classList.add("desk-pet-stage--play-rope");
      playRope.classList.add("desk-pet-play-rope--animate");
    }

    const line = choice.lines[Math.floor(Math.random() * choice.lines.length)];
    setStatus(line, Math.min(choice.ms - 500, 2800));
    playEndTimer = window.setTimeout(endPlay, choice.ms);
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
    if (isSessionBusy() || state.expired) return;
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
    ensureAppearanceRevisionSeeded();
    await mergeDeskPetFromServer();
    const taskRemovedBump = takeDeskPetRemoveFromUrl();
    const carryOverCount = takeDeskPetCarryOverFromUrl();
    if (taskRemovedBump) {
      applyContentmentBump(TASK_REMOVE_CONTENTMENT_BUMP);
      window.dispatchEvent(new CustomEvent("deskPet:taskRemoved", { detail: { ...state } }));
    } else if (carryOverCount > 0) {
      applyContentmentBump(carryOverCount * CARRY_OVER_CONTENTMENT_PER_TASK);
      window.dispatchEvent(
        new CustomEvent("deskPet:carryOver", { detail: { ...state, count: carryOverCount } })
      );
    } else {
      applyTimeDecay();
    }
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
        u.searchParams.delete("taskTitle");
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
        const show = window.DailyDashboardToasts?.show;
        if (typeof show !== "function") {
          then();
          return;
        }
        const rawCompletedTitle = u.searchParams.get("taskTitle");
        const completedTitle =
          typeof rawCompletedTitle === "string" ? rawCompletedTitle.trim() : "";
        stripGamifyFromUrl();
        if (createN > 0) {
          show({
            message: deskPetVisible()
              ? `You created a task. ${name} is happy!`
              : "Task created.",
            variant: "task-created",
          });
        }
        if (completeN > 0) {
          const delayMs = createN > 0 ? 520 : 0;
          window.setTimeout(() => {
            let message;
            if (completedTitle) {
              message = deskPetVisible()
                ? `Completed “${completedTitle}”. ${name} loves it!`
                : `Completed “${completedTitle}”.`;
            } else {
              message = deskPetVisible()
                ? `You completed a task. ${name} loves it!`
                : "Task completed.";
            }
            show({
              message,
              variant: "task-completed",
            });
          }, delayMs);
        }
        then();
      }

      let attempts = 0;
      const maxAttempts = 60;
      function tryConsume() {
        if (typeof window.DailyDashboardToasts?.show === "function") {
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
