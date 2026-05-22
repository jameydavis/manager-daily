(function () {
  const COLOR_SCHEME_KEY = "dailyDashboardColorScheme";
  const SPRINT_KEY = "dailyDashboardSprintShading";
  /** When `'0'`, desk buddy is hidden. Default / missing = visible. */
  const DESK_PET_KEY = "dailyDashboardDeskPetEnabled";
  /**
   * When `'1'`, completed tasks render after open tasks (localStorage + cookie mirror for SSR).
   */
  const TASKS_COMPLETED_BOTTOM_KEY = "dailyDashboardTasksCompletedBottom";

  function readColorScheme() {
    try {
      return localStorage.getItem(COLOR_SCHEME_KEY) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  }

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

  function readTasksCompletedBottom() {
    try {
      return localStorage.getItem(TASKS_COMPLETED_BOTTOM_KEY) === "1";
    } catch {
      return false;
    }
  }

  function writeColorScheme(scheme) {
    try {
      localStorage.setItem(COLOR_SCHEME_KEY, scheme === "light" ? "light" : "dark");
    } catch {
      /* ignore */
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

  function writeTasksCompletedBottom(on) {
    try {
      localStorage.setItem(TASKS_COMPLETED_BOTTOM_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function mirrorTasksCompletedBottomCookie(on) {
    try {
      var maxAge = 60 * 60 * 24 * 400;
      if (on) {
        document.cookie =
          TASKS_COMPLETED_BOTTOM_KEY + "=1; path=/; max-age=" + maxAge + "; SameSite=Lax";
      } else {
        document.cookie = TASKS_COMPLETED_BOTTOM_KEY + "=; path=/; max-age=0; SameSite=Lax";
      }
    } catch {
      /* ignore */
    }
  }

  function applyColorScheme(scheme) {
    if (scheme === "light") {
      document.documentElement.dataset.theme = "light";
    } else {
      delete document.documentElement.dataset.theme;
    }
  }

  function applySprintShading(on) {
    document.documentElement.dataset.sprintShading = on ? "on" : "off";
  }

  function applyDeskPet(on) {
    document.documentElement.dataset.deskPet = on ? "on" : "off";
    if (typeof window.DailyDashboardToasts?.syncAnchorFromDeskPet === "function") {
      window.DailyDashboardToasts.syncAnchorFromDeskPet();
    }
  }

  function compareCanonicalLi(a, b) {
    var soA = parseInt(a.getAttribute("data-sort-order") || "0", 10);
    var soB = parseInt(b.getAttribute("data-sort-order") || "0", 10);
    if (soA !== soB) return soA - soB;
    var idA = parseInt(a.getAttribute("data-task-id") || "0", 10);
    var idB = parseInt(b.getAttribute("data-task-id") || "0", 10);
    return idA - idB;
  }

  function applyTasksListDomOrder() {
    var ul = document.querySelector("ul.tasks");
    if (!ul) return;
    var on = readTasksCompletedBottom();
    var taskLis = Array.from(ul.querySelectorAll(":scope > li.task"));
    var empty = ul.querySelector(":scope > li.empty");
    if (!taskLis.length) return;

    var sorted = taskLis.slice();
    if (on) {
      sorted.sort(function (a, b) {
        var dA = a.classList.contains("done") ? 1 : 0;
        var dB = b.classList.contains("done") ? 1 : 0;
        if (dA !== dB) return dA - dB;
        return compareCanonicalLi(a, b);
      });
    } else {
      sorted.sort(compareCanonicalLi);
    }

    var frag = document.createDocumentFragment();
    if (empty) frag.appendChild(empty);
    for (var i = 0; i < sorted.length; i++) frag.appendChild(sorted[i]);
    ul.appendChild(frag);
  }

  function syncTasksCompletedBottomFromStorage() {
    mirrorTasksCompletedBottomCookie(readTasksCompletedBottom());
    applyTasksListDomOrder();
  }

  function applyAllFromStorage() {
    applyColorScheme(readColorScheme());
    applySprintShading(readSprintShadingOn());
    applyDeskPet(readDeskPetOn());
    syncTasksCompletedBottomFromStorage();
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
    var openBtns = document.querySelectorAll(".js-user-settings-open");
    var closeBtn = document.getElementById("user-settings-close");
    var doneBtn = document.getElementById("user-settings-done");
    var schemeSelect = document.getElementById("user-settings-color-scheme");
    var sprintToggle = document.getElementById("user-settings-sprint-shading");
    var petToggle = document.getElementById("user-settings-desk-pet");
    var tasksCompletedToggle = document.getElementById("user-settings-tasks-completed-bottom");

    if (!dialog || !schemeSelect || !sprintToggle || !petToggle || !tasksCompletedToggle) {
      return;
    }

    function syncControlsFromStorage() {
      schemeSelect.value = readColorScheme();
      sprintToggle.checked = readSprintShadingOn();
      petToggle.checked = readDeskPetOn();
      tasksCompletedToggle.checked = readTasksCompletedBottom();
    }

    function openSettingsDialog(fromBtn) {
      var menu = fromBtn && fromBtn.closest(".header-user-menu");
      if (menu && menu.tagName === "DETAILS") {
        menu.open = false;
      }
      syncControlsFromStorage();
      dialog.showModal();
    }

    if (openBtns.length) {
      for (var i = 0; i < openBtns.length; i++) {
        openBtns[i].addEventListener("click", function () {
          openSettingsDialog(this);
        });
      }
    }

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

    schemeSelect.addEventListener("change", function () {
      var scheme = schemeSelect.value === "light" ? "light" : "dark";
      writeColorScheme(scheme);
      applyColorScheme(scheme);
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

    tasksCompletedToggle.addEventListener("change", function () {
      var on = tasksCompletedToggle.checked;
      writeTasksCompletedBottom(on);
      mirrorTasksCompletedBottomCookie(on);
      applyTasksListDomOrder();
    });

    window.addEventListener("storage", function (e) {
      if (e.key === COLOR_SCHEME_KEY) {
        var scheme = e.newValue === "light" ? "light" : "dark";
        schemeSelect.value = scheme;
        applyColorScheme(scheme);
      }
      if (e.key === SPRINT_KEY) {
        var shadingOn = e.newValue !== "0";
        sprintToggle.checked = shadingOn;
        applySprintShading(shadingOn);
      }
      if (e.key === DESK_PET_KEY) {
        var petOn = e.newValue !== "0";
        petToggle.checked = petOn;
        applyDeskPet(petOn);
      }
      if (e.key === TASKS_COMPLETED_BOTTOM_KEY) {
        var tOn = e.newValue === "1";
        tasksCompletedToggle.checked = tOn;
        mirrorTasksCompletedBottomCookie(tOn);
        applyTasksListDomOrder();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
