(function () {
  var form = document.querySelector(".signup-wizard");
  if (!form) return;
  form.noValidate = true;

  var stepEls = form.querySelectorAll("[data-wizard-step]");
  var indicators = form.querySelectorAll("[data-wizard-indicator]");
  var initial = parseInt(form.getAttribute("data-initial-step") || "1", 10) || 1;
  var step = initial >= 2 ? 2 : 1;

  function setStep(n) {
    step = n;
    stepEls.forEach(function (el) {
      var s = parseInt(el.getAttribute("data-wizard-step") || "1", 10);
      var on = s === step;
      el.hidden = !on;
      el.setAttribute("aria-hidden", on ? "false" : "true");
    });
    indicators.forEach(function (el) {
      var s = parseInt(el.getAttribute("data-wizard-indicator") || "1", 10);
      el.classList.toggle("signup-wizard-ind__item--active", s === step);
    });
  }

  var step1Wrap = form.querySelector('[data-wizard-step="1"]');
  var step2Wrap = form.querySelector('[data-wizard-step="2"]');
  /** Step panels are `<div>`s; only `fieldset` / inputs implement constraint validation. */
  var step1Fieldset = step1Wrap && step1Wrap.querySelector("fieldset");

  function validateStep1Panel() {
    if (step1Fieldset && typeof step1Fieldset.checkValidity === "function") {
      return step1Fieldset.checkValidity();
    }
    if (!step1Wrap) return true;
    var inputs = step1Wrap.querySelectorAll("input, select, textarea");
    for (var i = 0; i < inputs.length; i++) {
      if (!inputs[i].checkValidity()) {
        inputs[i].reportValidity();
        return false;
      }
    }
    return true;
  }

  function reportStep1Panel() {
    if (step1Fieldset && typeof step1Fieldset.reportValidity === "function") {
      step1Fieldset.reportValidity();
      return;
    }
    if (!step1Wrap) return;
    var inputs = step1Wrap.querySelectorAll("input, select, textarea");
    for (var j = 0; j < inputs.length; j++) {
      if (!inputs[j].checkValidity()) {
        inputs[j].reportValidity();
        return;
      }
    }
  }

  var nextBtn = form.querySelector("[data-wizard-next]");
  if (nextBtn) {
    nextBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (!validateStep1Panel()) {
        reportStep1Panel();
        return;
      }
      setStep(2);
      var first = step2Wrap && step2Wrap.querySelector("input, select, textarea");
      if (first && typeof first.focus === "function") first.focus();
    });
  }

  function validateStep2() {
    if (!step2Wrap) return true;
    var site = step2Wrap.querySelector('[name="atlassianSite"]');
    var token = step2Wrap.querySelector('[name="atlassianApiToken"]');
    var board = step2Wrap.querySelector('[name="jiraBoardId"]');
    if (site && !site.value.trim()) {
      site.setCustomValidity("Enter your Jira Cloud site URL.");
      site.reportValidity();
      site.setCustomValidity("");
      return false;
    }
    if (token && token.value.trim().length < 20) {
      token.setCustomValidity("API token looks too short.");
      token.reportValidity();
      token.setCustomValidity("");
      return false;
    }
    var bn = board ? Number(board.value) : NaN;
    if (!board || !Number.isFinite(bn) || bn < 1 || !Number.isInteger(bn)) {
      if (board) {
        board.setCustomValidity("Enter a positive board number from your board URL.");
        board.reportValidity();
        board.setCustomValidity("");
      }
      return false;
    }
    return true;
  }

  var backBtn = form.querySelector("[data-wizard-back]");
  if (backBtn) {
    backBtn.addEventListener("click", function (e) {
      e.preventDefault();
      setStep(1);
    });
  }

  form.addEventListener("submit", function (e) {
    if (step !== 2) {
      e.preventDefault();
      if (!validateStep1Panel()) {
        reportStep1Panel();
        return;
      }
      setStep(2);
      return;
    }
    if (!validateStep2()) {
      e.preventDefault();
    }
  });

  setStep(step);
})();
