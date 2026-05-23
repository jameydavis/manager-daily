/**
 * Jira issue detail modal — opens from `.jira-issue-trigger` rows on the dashboard.
 */
(function () {
  const dialog = document.getElementById("jira-issue-modal");
  const closeBtn = document.getElementById("jira-issue-modal-close");
  const keyEl = document.getElementById("jira-issue-modal-key");
  const typeEl = document.getElementById("jira-issue-modal-type");
  const titleLink = document.getElementById("jira-issue-modal-title-link");
  const statusEl = document.getElementById("jira-issue-modal-status");
  const timeEl = document.getElementById("jira-issue-modal-time");
  const assigneeRow = document.getElementById("jira-issue-modal-assignee-row");
  const assigneeEl = document.getElementById("jira-issue-modal-assignee");
  const reporterRow = document.getElementById("jira-issue-modal-reporter-row");
  const reporterEl = document.getElementById("jira-issue-modal-reporter");
  const estimateEl = document.getElementById("jira-issue-modal-estimate");
  const sprintWidgetEl = document.getElementById("jira-issue-modal-sprint-widget");
  const subtaskWidgetEl = document.getElementById("jira-issue-modal-subtask-widget");
  const stalenessWidgetEl = document.getElementById("jira-issue-modal-staleness-widget");
  const descriptionEl = document.getElementById("jira-issue-modal-description");
  const sprintContextEl = document.getElementById("dashboard-sprint-context");

  if (
    !dialog ||
    !closeBtn ||
    !keyEl ||
    !typeEl ||
    !titleLink ||
    !statusEl ||
    !timeEl ||
    !assigneeRow ||
    !assigneeEl ||
    !reporterRow ||
    !reporterEl ||
    !estimateEl ||
    !sprintWidgetEl ||
    !subtaskWidgetEl ||
    !stalenessWidgetEl ||
    !descriptionEl
  ) {
    return;
  }

  let detailsRequest = 0;

  /** @type {{ name: string; start: string; end: string; daysLeft: number; totalDays: number | null; progressPct: number | null } | null} */
  let sprintContext = null;
  if (sprintContextEl && sprintContextEl.textContent) {
    try {
      sprintContext = JSON.parse(sprintContextEl.textContent);
    } catch {
      sprintContext = null;
    }
  }

  /** @param {string} raw */
  function parseIssuePayload(raw) {
    if (!raw) return null;
    try {
      const data = JSON.parse(decodeURIComponent(raw));
      if (!data || typeof data.key !== "string" || typeof data.summary !== "string") return null;
      return data;
    } catch {
      return null;
    }
  }

  /** @param {string} text */
  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * @param {number} pct
   * @param {string} value
   * @param {string} label
   * @param {string} [caption]
   * @param {"accent" | "done" | "danger"} [tone]
   */
  function ringWidget(pct, value, label, caption, tone = "accent") {
    const p = Math.min(100, Math.max(0, Math.round(pct)));
    return `
      <div class="jira-ring">
        <div class="jira-ring-chart jira-ring-chart--${tone}" style="--ring-pct: ${p}" aria-hidden="true"></div>
        <div class="jira-ring-center">
          <span class="jira-ring-value">${escapeHtml(value)}</span>
          <span class="jira-ring-label">${escapeHtml(label)}</span>
        </div>
      </div>
      ${caption ? `<p class="jira-widget-caption">${escapeHtml(caption)}</p>` : ""}
    `;
  }

  /** @param {number} pct */
  function progressBar(pct, label) {
    const p = Math.min(100, Math.max(0, Math.round(pct)));
    return `
      <div class="jira-progress">
        <div class="jira-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" aria-label="${escapeHtml(label)}">
          <div class="jira-progress-fill" style="width: ${p}%"></div>
        </div>
        <span class="jira-progress-label">${escapeHtml(label)}</span>
      </div>
    `;
  }

  function renderSprintWidget() {
    if (!sprintContext || !sprintContext.start || !sprintContext.end) {
      sprintWidgetEl.innerHTML = '<p class="jira-widget-empty">No active sprint configured.</p>';
      return;
    }

    const daysLeft = typeof sprintContext.daysLeft === "number" ? sprintContext.daysLeft : 0;
    const totalDays = typeof sprintContext.totalDays === "number" ? sprintContext.totalDays : null;
    const progressPct =
      typeof sprintContext.progressPct === "number" ? sprintContext.progressPct : 0;
    const remainingPct =
      totalDays && totalDays > 0 ? Math.round((daysLeft / totalDays) * 100) : 0;
    const daysLabel = daysLeft === 1 ? "weekday left" : "weekdays left";
    const name = typeof sprintContext.name === "string" ? sprintContext.name : "Current sprint";
    const timelineLabel =
      totalDays != null
        ? `${progressPct}% through sprint · ${totalDays} weekdays total`
        : `${progressPct}% through sprint`;

    sprintWidgetEl.innerHTML = `
      ${ringWidget(remainingPct, String(daysLeft), daysLabel, name, daysLeft <= 2 ? "danger" : "accent")}
      ${progressBar(progressPct, timelineLabel)}
    `;
  }

  /** @param {number} days */
  function formatDaysAgo(days) {
    if (days === 0) return "Today";
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  }

  /** @param {number} days */
  function stalenessTone(days) {
    if (days <= 2) return "fresh";
    if (days <= 7) return "normal";
    if (days <= 14) return "stale";
    return "old";
  }

  /**
   * @param {{ daysSinceCreated?: number; daysSinceUpdated?: number; daysSinceStatusChange?: number } | null | undefined} staleness
   * @param {"loading" | "error" | "ready"} [mode]
   */
  function renderStalenessWidget(staleness, mode = "ready") {
    if (mode === "loading") {
      stalenessWidgetEl.innerHTML = '<p class="jira-widget-empty">Loading age…</p>';
      return;
    }
    if (mode === "error" || !staleness) {
      stalenessWidgetEl.innerHTML = '<p class="jira-widget-empty">Age unavailable.</p>';
      return;
    }

    const rows = [
      { label: "Created", days: staleness.daysSinceCreated },
      { label: "Updated", days: staleness.daysSinceUpdated },
      { label: "Status", days: staleness.daysSinceStatusChange },
    ];

    stalenessWidgetEl.innerHTML = `
      <div class="jira-staleness" aria-label="Issue age">
        ${rows
          .map((row) => {
            const days = typeof row.days === "number" ? row.days : 0;
            const tone = stalenessTone(days);
            return `
              <div class="jira-staleness-row jira-staleness-row--${tone}">
                <span class="jira-staleness-label">${escapeHtml(row.label)}</span>
                <span class="jira-staleness-value">${escapeHtml(formatDaysAgo(days))}</span>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  /**
   * @param {{ total?: number; done?: number } | null | undefined} progress
   * @param {"loading" | "error" | "ready"} [mode]
   */
  function renderSubtaskWidget(progress, mode = "ready") {
    if (mode === "loading") {
      subtaskWidgetEl.innerHTML = '<p class="jira-widget-empty">Loading subtasks…</p>';
      return;
    }
    if (mode === "error" || !progress) {
      subtaskWidgetEl.innerHTML = '<p class="jira-widget-empty">Subtask progress unavailable.</p>';
      return;
    }

    const total = typeof progress.total === "number" ? progress.total : 0;
    const done = typeof progress.done === "number" ? progress.done : 0;
    if (total <= 0) {
      subtaskWidgetEl.innerHTML = '<p class="jira-widget-empty">No subtasks on this issue.</p>';
      return;
    }

    const open = Math.max(0, total - done);
    const pct = Math.round((done / total) * 100);
    const tone = pct >= 100 ? "done" : pct <= 25 ? "danger" : "accent";
    const ringLabel = total === 1 ? "subtask done" : "subtasks done";
    const barLabel =
      open === 0 ? `${pct}% complete · all done` : `${pct}% complete · ${open} open`;

    subtaskWidgetEl.innerHTML = `
      ${ringWidget(pct, `${done}/${total}`, ringLabel, undefined, tone)}
      ${progressBar(pct, barLabel)}
    `;
  }

  /** @param {string | null | undefined} text */
  function setReporterDisplay(text) {
    const t = typeof text === "string" ? text.trim() : "";
    if (!t || t === "—") {
      reporterEl.textContent = "";
      reporterRow.hidden = true;
      return;
    }
    reporterEl.textContent = t;
    reporterRow.hidden = false;
  }

  /** @param {string | null | undefined} text */
  function setEstimateDisplay(text) {
    const t = typeof text === "string" ? text.trim() : "";
    if (t === "…") {
      estimateEl.textContent = "…";
      estimateEl.hidden = false;
      return;
    }
    if (!t || t === "—") {
      estimateEl.textContent = "";
      estimateEl.hidden = true;
      return;
    }
    estimateEl.textContent = t;
    estimateEl.hidden = false;
  }

  /** @param {string | null | undefined} text */
  function setTimeLoggedDisplay(text) {
    const t = typeof text === "string" ? text.trim() : "";
    timeEl.textContent = t && t !== "—" ? t : "—";
  }

  /**
   * @param {Array<{ heading?: string | null; body?: string }> | null | undefined} sections
   * @param {string} fallbackText
   * @param {"plain" | "loading" | "error"} mode
   */
  function renderDescriptionDisplay(sections, fallbackText, mode = "plain") {
    descriptionEl.classList.remove(
      "jira-issue-description--structured",
      "jira-issue-description--loading",
      "jira-issue-description--error"
    );

    if (mode === "loading") {
      descriptionEl.textContent = "Loading description…";
      descriptionEl.classList.add("jira-issue-description--loading");
      return;
    }
    if (mode === "error") {
      descriptionEl.textContent = fallbackText || "Could not load issue details.";
      descriptionEl.classList.add("jira-issue-description--error");
      return;
    }

    const list = Array.isArray(sections) ? sections : [];
    const hasSubheads = list.some((s) => typeof s.heading === "string" && s.heading.trim());

    if (!hasSubheads) {
      const text =
        (list.length === 1 && typeof list[0]?.body === "string" ? list[0].body.trim() : "") ||
        (typeof fallbackText === "string" ? fallbackText.trim() : "");
      descriptionEl.textContent = text || "No description.";
      return;
    }

    descriptionEl.classList.add("jira-issue-description--structured");
    descriptionEl.innerHTML = list
      .map((section) => {
        const heading = typeof section.heading === "string" ? section.heading.trim() : "";
        const body = typeof section.body === "string" ? section.body.trim() : "";
        if (!heading) {
          if (!body) return "";
          return `<div class="jira-issue-description-section jira-issue-description-section--plain"><div class="jira-issue-description-body">${escapeHtml(body)}</div></div>`;
        }
        return `
          <section class="jira-issue-description-section">
            <h4 class="jira-issue-description-subhead">${escapeHtml(heading)}</h4>
            <div class="jira-issue-description-body">${body ? escapeHtml(body) : '<span class="jira-issue-description-empty">—</span>'}</div>
          </section>
        `;
      })
      .filter(Boolean)
      .join("");
  }

  /** @param {string} key */
  async function loadIssueDetails(key) {
    const requestId = ++detailsRequest;
    setReporterDisplay("…");
    setEstimateDisplay("…");
    setTimeLoggedDisplay("…");
    renderSubtaskWidget(null, "loading");
    renderStalenessWidget(null, "loading");
    renderDescriptionDisplay(null, "", "loading");

    try {
      const res = await fetch(`/api/jira/issues/${encodeURIComponent(key)}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (requestId !== detailsRequest) return;

      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : "Could not load issue details.";
        setReporterDisplay("—");
        setEstimateDisplay("—");
        setTimeLoggedDisplay("—");
        renderSubtaskWidget(null, "error");
        renderStalenessWidget(null, "error");
        renderDescriptionDisplay(null, msg, "error");
        return;
      }

      const estimateLabel =
        typeof data.originalEstimate === "string" ? data.originalEstimate : "—";
      const timeLoggedLabel = typeof data.timeLogged === "string" ? data.timeLogged : "—";

      setReporterDisplay(typeof data.reporter === "string" ? data.reporter : "—");
      setEstimateDisplay(estimateLabel);
      setTimeLoggedDisplay(timeLoggedLabel);
      renderSubtaskWidget(
        data.subtaskProgress && typeof data.subtaskProgress === "object" ? data.subtaskProgress : null,
        "ready"
      );
      renderStalenessWidget(
        data.staleness && typeof data.staleness === "object" ? data.staleness : null,
        "ready"
      );

      const text = typeof data.description === "string" ? data.description.trim() : "";
      const sections = Array.isArray(data.descriptionSections) ? data.descriptionSections : null;
      renderDescriptionDisplay(sections, text, "plain");
    } catch {
      if (requestId !== detailsRequest) return;
      setReporterDisplay("—");
      setEstimateDisplay("—");
      setTimeLoggedDisplay("—");
      renderSubtaskWidget(null, "error");
      renderStalenessWidget(null, "error");
      renderDescriptionDisplay(null, "Could not load issue details.", "error");
    }
  }

  /** @param {ReturnType<typeof parseIssuePayload>} issue */
  function openModal(issue) {
    if (!issue) return;

    keyEl.textContent = issue.key;
    typeEl.textContent = issue.issueType || "Issue";
    titleLink.textContent = issue.summary;
    titleLink.href = issue.browseUrl || "#";
    statusEl.textContent = issue.status || "—";

    const time = typeof issue.timeLogged === "string" ? issue.timeLogged.trim() : "";
    setTimeLoggedDisplay(time || "—");

    const assignee = typeof issue.assignee === "string" ? issue.assignee.trim() : "";
    if (assignee) {
      assigneeEl.textContent = assignee;
      assigneeRow.hidden = false;
    } else {
      assigneeEl.textContent = "";
      assigneeRow.hidden = true;
    }

    renderSprintWidget();
    renderSubtaskWidget(null, "loading");
    renderStalenessWidget(null, "loading");
    renderDescriptionDisplay(null, "", "loading");

    descriptionEl.classList.remove("jira-issue-description--error");
    setReporterDisplay("…");
    setEstimateDisplay("…");
    void loadIssueDetails(issue.key);

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    }
  }

  function closeModal() {
    detailsRequest += 1;
    if (dialog.open) dialog.close();
  }

  /** @param {Element | null} el */
  function triggerFrom(el) {
    if (!el) return null;
    const hit = el.closest(".jira-issue-trigger");
    if (!hit || hit.closest(".jira-add")) return null;
    return hit;
  }

  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".jira-add") || target.closest(".jira-issue-close")) return;
    if (target.closest("#jira-issue-modal-title-link")) return;
    const hit = triggerFrom(target);
    if (!hit) return;
    e.preventDefault();
    const issue = parseIssuePayload(hit.getAttribute("data-jira-issue"));
    openModal(issue);
  });

  document.addEventListener("keydown", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const hit = triggerFrom(target);
    if (!hit) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const issue = parseIssuePayload(hit.getAttribute("data-jira-issue"));
      openModal(issue);
    }
  });

  closeBtn.addEventListener("click", closeModal);

  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) closeModal();
  });

  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeModal();
  });
})();
