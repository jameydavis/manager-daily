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
  const timeRow = document.getElementById("jira-issue-modal-time-row");
  const timeEl = document.getElementById("jira-issue-modal-time");
  const assigneeRow = document.getElementById("jira-issue-modal-assignee-row");
  const assigneeEl = document.getElementById("jira-issue-modal-assignee");
  const reporterRow = document.getElementById("jira-issue-modal-reporter-row");
  const reporterEl = document.getElementById("jira-issue-modal-reporter");
  const estimateEl = document.getElementById("jira-issue-modal-estimate");
  const descriptionEl = document.getElementById("jira-issue-modal-description");

  if (
    !dialog ||
    !closeBtn ||
    !keyEl ||
    !typeEl ||
    !titleLink ||
    !statusEl ||
    !timeRow ||
    !timeEl ||
    !assigneeRow ||
    !assigneeEl ||
    !reporterRow ||
    !reporterEl ||
    !estimateEl ||
    !descriptionEl
  ) {
    return;
  }

  let detailsRequest = 0;

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

  /** @param {string} key */
  async function loadIssueDetails(key) {
    const requestId = ++detailsRequest;
    setReporterDisplay("…");
    setEstimateDisplay("…");
    descriptionEl.textContent = "Loading description…";
    descriptionEl.classList.add("jira-issue-description--loading");

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
        descriptionEl.textContent = msg;
        descriptionEl.classList.remove("jira-issue-description--loading");
        descriptionEl.classList.add("jira-issue-description--error");
        return;
      }

      setReporterDisplay(typeof data.reporter === "string" ? data.reporter : "—");
      setEstimateDisplay(typeof data.originalEstimate === "string" ? data.originalEstimate : "—");

      const text = typeof data.description === "string" ? data.description.trim() : "";
      descriptionEl.textContent = text || "No description.";
      descriptionEl.classList.remove("jira-issue-description--loading", "jira-issue-description--error");
    } catch {
      if (requestId !== detailsRequest) return;
      setReporterDisplay("—");
      setEstimateDisplay("—");
      descriptionEl.textContent = "Could not load issue details.";
      descriptionEl.classList.remove("jira-issue-description--loading");
      descriptionEl.classList.add("jira-issue-description--error");
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
    if (time && time !== "—") {
      timeEl.textContent = time;
      timeRow.hidden = false;
    } else {
      timeEl.textContent = "";
      timeRow.hidden = true;
    }

    const assignee = typeof issue.assignee === "string" ? issue.assignee.trim() : "";
    if (assignee) {
      assigneeEl.textContent = assignee;
      assigneeRow.hidden = false;
    } else {
      assigneeEl.textContent = "";
      assigneeRow.hidden = true;
    }

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
