(function () {
  const SPRINT_KEY = "managerDailySprintShading";
  /** When `'0'`, desk buddy is hidden. Default / missing = visible. */
  const DESK_PET_KEY = "managerDailyDeskPetEnabled";
  /**
   * When `'1'`, completed tasks render after open tasks (localStorage + cookie mirror for SSR).
   */
  const TASKS_COMPLETED_BOTTOM_KEY = "managerDailyTasksCompletedBottom";

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

  function applySprintShading(on) {
    document.documentElement.dataset.sprintShading = on ? "on" : "off";
  }

  function applyDeskPet(on) {
    document.documentElement.dataset.deskPet = on ? "on" : "off";
    if (typeof window.ManagerDailyToasts?.syncAnchorFromDeskPet === "function") {
      window.ManagerDailyToasts.syncAnchorFromDeskPet();
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
    var openBtn = document.getElementById("user-settings-open");
    var closeBtn = document.getElementById("user-settings-close");
    var doneBtn = document.getElementById("user-settings-done");
    var sprintToggle = document.getElementById("user-settings-sprint-shading");
    var petToggle = document.getElementById("user-settings-desk-pet");
    var tasksCompletedToggle = document.getElementById("user-settings-tasks-completed-bottom");

    if (!dialog || !openBtn || !sprintToggle || !petToggle || !tasksCompletedToggle) {
      return;
    }

    function syncTogglesFromStorage() {
      sprintToggle.checked = readSprintShadingOn();
      petToggle.checked = readDeskPetOn();
      tasksCompletedToggle.checked = readTasksCompletedBottom();
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

    tasksCompletedToggle.addEventListener("change", function () {
      var on = tasksCompletedToggle.checked;
      writeTasksCompletedBottom(on);
      mirrorTasksCompletedBottomCookie(on);
      applyTasksListDomOrder();
    });

    window.addEventListener("storage", function (e) {
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
