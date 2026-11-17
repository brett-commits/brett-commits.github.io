/* ================================================================
   TREAT TEAM OWNED LEAD CAPTURE (schomefinders.com)
   Shared submit handler for every owned capture form on the site.
   Built Nov 17, 2026. STAGED ONLY, not live.

   Submission route (no Zapier anywhere in the chain):
   each form posts JSON to a Netlify Function
   (treat-capture-relay.netlify.app), and the function calls
   Follow Up Boss POST /v1/events server-side with the API key
   held in a Netlify env var. The docs say /v1/events is the
   ONLY correct way to send leads from a custom website: events
   of type Registration and Seller Inquiry trigger Lead Flow
   routing, round-robin assignment, action plans, and agent
   notification. People created through /v1/people get none of
   that, so assignment happens inside Follow Up Boss, not here
   and not in a Zap.

   The endpoint below is the ONLY place the function URL lives.
   Never put a Follow Up Boss API key in this file or in any page
   that includes it. The key lives only in the Netlify env var
   FUB_API_KEY.

   Behavior: on submit the form posts to the function, then the
   page reveals its step 2 panel (a RealScout widget inserted
   from a <template> on the page, or a plain success panel where
   the page already shows the widget). If the function call
   fails, step 2 still appears; the visitor is never trapped by
   our plumbing. If the endpoint is still the placeholder, the
   submission goes nowhere and a console warning says so, but
   step 2 still appears, so the staged pages can be clicked
   through end to end.

   Honeypot: this script adds a hidden "website" field to every
   form. Humans never see or fill it; bots usually do, and the
   function silently drops those submissions.

   Cross-page continuity: after any capture form submits in this
   browser tab, sessionStorage records it. A capture block marked
   data-on-captured="skip" (the home value page and the seller
   guide, same seller intent) then skips straight to its step 2
   widget on load instead of asking for the same details twice.
   ================================================================ */
var TREAT_CAPTURE_ENDPOINT = "https://treat-capture-relay.netlify.app/.netlify/functions/capture";

(function () {
  var CONSENT_TEXT = "By checking this box and submitting, I agree The TREAT Team, brokered by SCSOLD, LLC, may contact me by call, text, and email at the number and address I provided about my home and my plans. Message frequency varies. Message and data rates may apply. Reply STOP to end texts. Consent is not a condition of any purchase or of working with The TREAT Team.";
  var CAPTURED_KEY = "treat_capture_done";

  function isCaptured() {
    try { return window.sessionStorage.getItem(CAPTURED_KEY) === "1"; }
    catch (err) { return false; }
  }

  function markCaptured() {
    try { window.sessionStorage.setItem(CAPTURED_KEY, "1"); }
    catch (err) { /* private mode: continuity is a nicety, not a requirement */ }
  }

  function revealStep2(block) {
    var form = block.querySelector(".hv-form");
    var step2 = block.querySelector(".hv-step2");
    var slot = block.querySelector(".hv-widget-slot");
    if (!step2) return;
    if (form) form.style.display = "none";
    if (slot && !slot.hasChildNodes()) {
      var t = document.getElementById("hv-widget-template");
      if (t) slot.appendChild(t.content.cloneNode(true));
    }
    step2.hidden = false;
    if (step2.scrollIntoView) step2.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  document.querySelectorAll(".hv-capture").forEach(function (block) {
    var form = block.querySelector(".hv-form");
    var step2 = block.querySelector(".hv-step2");
    if (!form || !step2) return;

    var intentSelect = form.querySelector("select[name='intent']");
    var tagsInput = form.querySelector("input[name='tags']");
    var areaSelect = form.querySelector("select[name='area']");
    var areaLink = block.querySelector(".hv-area-link");

    /* Honeypot: a field humans never see. Bots fill it; the
       function silently drops any submission where it is set. */
    if (!form.querySelector("input[name='website']")) {
      var honey = document.createElement("input");
      honey.type = "text";
      honey.name = "website";
      honey.tabIndex = -1;
      honey.autocomplete = "off";
      honey.setAttribute("aria-hidden", "true");
      honey.style.cssText = "position:absolute;left:-9999px;top:auto;width:1px;height:1px;opacity:0;";
      form.appendChild(honey);
    }

    /* Homepage areas form: tags follow the intent the visitor picks. */
    function syncTags() {
      if (!intentSelect || !tagsInput) return;
      var base = tagsInput.getAttribute("data-tags-base") || tagsInput.value;
      tagsInput.setAttribute("data-tags-base", base);
      tagsInput.value = (intentSelect.value === "Selling" ? "Seller," : "Buyer,") + base;
    }
    if (intentSelect) {
      intentSelect.addEventListener("change", syncTags);
      syncTags();
    }

    /* Skip straight to step 2 when this visitor already gave details
       in this tab and this block is the same intent (seller pages). */
    if (block.getAttribute("data-on-captured") === "skip" && isCaptured()) {
      revealStep2(block);
      return;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }

      var submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.disabled = true;

      syncTags();
      var payload = {};
      new FormData(form).forEach(function (value, key) { payload[key] = value; });
      payload.consent_text = CONSENT_TEXT;
      payload.submitted_at = new Date().toISOString();

      /* Homepage areas form: point the step 2 area link at the area
         the visitor picked, so the next click lands on their search. */
      if (areaSelect && areaLink) {
        var area = areaSelect.options[areaSelect.selectedIndex];
        if (area && area.value) {
          areaLink.href = area.value;
          areaLink.textContent = "Search homes in " + area.text + " \u2192";
          areaLink.style.display = "";
        } else {
          areaLink.style.display = "none";
        }
      }

      var done = function () {
        markCaptured();
        if (window.fbq) { try { fbq("track", "Lead"); } catch (err) {} }
        revealStep2(block);
      };

      if (TREAT_CAPTURE_ENDPOINT.indexOf("http") === 0) {
        fetch(TREAT_CAPTURE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then(done)
          .catch(done); /* never trap the visitor: show step 2 even if the relay fails */
      } else {
        if (window.console) console.warn("STAGED BUILD: TREAT_CAPTURE_ENDPOINT is still a placeholder, so this submission was not sent anywhere.");
        done();
      }
    });
  });
})();
