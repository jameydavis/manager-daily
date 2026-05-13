(function () {
  const SPRINT_KEY = "managerDailySprintShading";
  /** When `'0'`, desk buddy is hidden. Default / missing = visible. */
  const DESK_PET_KEY = "managerDailyDeskPetEnabled";

  function readSprintShadingOn() {
    try {
      return localStorage.getItem(SPRINT_KEY) !== "0";
    } catch {
      return true;
    }
  }

  function readDeskPetOn() {
    try {
      return localStorage.getItem(DESK_PET_KEY) !== "0";
    } catch {
      return true;
    }
  }

  function writeSprintShading(on) {
    try {
      localStorage.setItem(SPRINT_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function writeDeskPetOn(on) {
    try {
      localStorage.setItem(DESK_PET_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function applySprintShading(on) {
    document.documentElement.dataset.sprintShading = on ? "on" : "off";
  }

  function applyDeskPet(on) {
    document.documentElement.dataset.deskPet = on ? "on" : "off";
    if (typeof window.ManagerDailyToasts?.syncAnchorFromDeskPet === "function") {
      window.ManagerDailyToasts.syncAnchorFromDeskPet();
    }
  }

  function applyAllFromStorage() {
    applySprintShading(readSprintShadingOn());
    applyDeskPet(readDeskPetOn());
  }

  /** Run immediately so deferred scripts (toasts, desk-pet) see correct prefs. */
  try {
    applyAllFromStorage();
  } catch {
    /* ignore */
  }

  function init() {
    applyAllFromStorage();

    var dialog = document.getElementById("user-settings");
    var openBtn = document.getElementById("user-settings-open");
    var closeBtn = document.getElementById("user-settings-close");
    var doneBtn = document.getElementById("user-settings-done");
    var sprintToggle = document.getElementById("user-settings-sprint-shading");
    var petToggle = document.getElementById("user-settings-desk-pet");

    if (!dialog || !openBtn || !sprintToggle || !petToggle) {
      return;
    }

    function syncTogglesFromStorage() {
      sprintToggle.checked = readSprintShadingOn();
      petToggle.checked = readDeskPetOn();
    }

    openBtn.addEventListener("click", function () {
      syncTogglesFromStorage();
      dialog.showModal();
    });

    closeBtn.addEventListener("click", function () {
      dialog.close();
    });

    doneBtn.addEventListener("click", function () {
      dialog.close();
    });

    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) {
        dialog.close();
      }
    });

    sprintToggle.addEventListener("change", function () {
      var on = sprintToggle.checked;
      writeSprintShading(on);
      applySprintShading(on);
    });

    petToggle.addEventListener("change", function () {
      var on = petToggle.checked;
      writeDeskPetOn(on);
      applyDeskPet(on);
    });

    window.addEventListener("storage", function (e) {
      if (e.key === SPRINT_KEY) {
        var on = e.newValue !== "0";
        sprintToggle.checked = on;
        applySprintShading(on);
      }
      if (e.key === DESK_PET_KEY) {
        var petOn = e.newValue !== "0";
        petToggle.checked = petOn;
        applyDeskPet(petOn);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
