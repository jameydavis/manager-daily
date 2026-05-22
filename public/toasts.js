/**
 * Lightweight toast stack for app-wide notifications. Extend via window.DailyDashboardToasts.show().
 */
(function () {
  const DEFAULT_MS = 4500;

  /** Matches `user-settings.js` (`dailyDashboardDeskPetEnabled`); default visible when unset. */
  function isDeskPetVisible() {
    return document.documentElement.dataset.deskPet !== "off";
  }

  /** Move toasts away from the desk pet: pet bottom-left → stack bottom-right; any other corner → bottom-left. */
  function syncAnchorFromDeskPet() {
    const stack = document.getElementById("toast-stack");
    if (!stack) return;
    const pet = document.getElementById("desk-pet");
    const petHidden = document.documentElement.dataset.deskPet === "off";
    const anchorRight = Boolean(
      !petHidden && pet && pet.classList.contains("desk-pet--corner-bl"),
    );
    stack.classList.toggle("toast-stack--anchor-right", anchorRight);
  }

  function ensureStack() {
    let el = document.getElementById("toast-stack");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast-stack";
      el.className = "toast-stack";
      el.setAttribute("aria-label", "Notifications");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    syncAnchorFromDeskPet();
    return el;
  }

  /** @type {ReadonlySet<string>} */
  const VARIANT_CLASS = new Set([
    "info",
    "warning",
    "success",
    "pet",
    "task-created",
    "task-completed",
    "task-removed",
  ]);

  /**
   * @param {unknown} raw
   * @returns {"info" | "warning" | "success" | "pet" | "task-created" | "task-completed" | "task-removed"}
   */
  function normalizeVariant(raw) {
    const v = typeof raw === "string" ? raw.trim() : "";
    if (VARIANT_CLASS.has(v)) {
      return /** @type {"info" | "warning" | "success" | "pet" | "task-created" | "task-completed" | "task-removed"} */ (
        v
      );
    }
    return "info";
  }

  /**
   * @param {{ title?: string; message: string; variant?: string; durationMs?: number }} opts
   */
  function show(opts) {
    const message = typeof opts.message === "string" ? opts.message.trim() : "";
    if (!message) return;

    const title = typeof opts.title === "string" ? opts.title.trim() : "";
    const variant = normalizeVariant(opts.variant);
    const durationMs =
      typeof opts.durationMs === "number" && Number.isFinite(opts.durationMs) && opts.durationMs > 0
        ? Math.min(opts.durationMs, 60000)
        : DEFAULT_MS;

    const stack = ensureStack();
    const toast = document.createElement("div");
    toast.className = `toast toast--${variant}`;
    toast.setAttribute("role", "status");

    const inner = document.createElement("div");
    inner.className = "toast-inner";

    if (title) {
      const titleEl = document.createElement("div");
      titleEl.className = "toast-title";
      titleEl.textContent = title;
      inner.appendChild(titleEl);
    }

    const bodyEl = document.createElement("div");
    bodyEl.className = "toast-body";
    bodyEl.textContent = message;
    inner.appendChild(bodyEl);

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "toast-dismiss";
    dismiss.setAttribute("aria-label", "Dismiss");
    dismiss.textContent = "\u00D7";

    toast.appendChild(inner);
    toast.appendChild(dismiss);
    stack.appendChild(toast);

    let removed = false;
    let timer = 0;

    function remove() {
      if (removed || !toast.isConnected) return;
      removed = true;
      if (timer) window.clearTimeout(timer);
      toast.classList.add("toast--out");
      window.setTimeout(() => {
        if (toast.isConnected) toast.remove();
      }, 240);
    }

    dismiss.addEventListener("click", remove);
    timer = window.setTimeout(remove, durationMs);
  }

  window.DailyDashboardToasts = { show, syncAnchorFromDeskPet, isDeskPetVisible };

  (function consumeTaskRemovedFromUrl() {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("taskRemoved") !== "1") return;
      const rawTitle = u.searchParams.get("taskTitle");
      u.searchParams.delete("taskRemoved");
      u.searchParams.delete("taskTitle");
      const next = `${u.pathname}${u.search}${u.hash}`;
      window.history.replaceState({}, "", next);
      const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
      const message = title ? `Removed “${title}”.` : "Task removed.";
      show({ message, variant: "task-removed" });
    } catch {
      /* ignore */
    }
  })();
})();
