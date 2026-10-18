/* Dabblebit site interactions — vanilla JS, no dependencies. */
(function () {
  "use strict";

  /* ---- Mobile nav toggle ---- */
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---- Reveal on scroll ---- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("visible"); });
  }

  /* ---- FAQ accordion ---- */
  document.querySelectorAll(".faq-item").forEach(function (item) {
    var btn = item.querySelector(".faq-q");
    var panel = item.querySelector(".faq-a");
    if (!btn || !panel) return;
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", function () {
      var isOpen = item.classList.contains("open");
      // Close siblings for a tidy accordion
      var list = item.closest(".faq-list");
      if (list) {
        list.querySelectorAll(".faq-item.open").forEach(function (other) {
          if (other !== item) {
            other.classList.remove("open");
            other.querySelector(".faq-a").style.maxHeight = null;
            other.querySelector(".faq-q").setAttribute("aria-expanded", "false");
          }
        });
      }
      if (isOpen) {
        item.classList.remove("open");
        panel.style.maxHeight = null;
        btn.setAttribute("aria-expanded", "false");
      } else {
        item.classList.add("open");
        panel.style.maxHeight = panel.scrollHeight + "px";
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  /* ---- Launch-capture result classification (pure; unit-tested) ----
     Success requires BOTH: HTTP transport OK and FormSubmit's documented
     success flag ({"success":"true"}). Anything else is a failure, and the
     visitor's typed email is preserved so they can retry. */
  function classifyNotifyResult(httpOk, data) {
    if (!httpOk) return "rejected";
    if (!data || typeof data !== "object" || Array.isArray(data)) return "malformed";
    var s = data.success;
    if (s === true || s === "true") return "ok";
    return "rejected";
  }

  function notifyCopy(kind) {
    switch (kind) {
      case "ok":
        return { text: "You're in! We'll email you the moment Dabblebit hatches.", cls: "form-status ok", keepInput: false };
      case "rejected":
        return { text: "Hmm, that didn't go through — your email is still here, please try again.", cls: "form-status err", keepInput: true };
      case "malformed":
        return { text: "We got an odd reply from the signup service — your email is still here, please try again in a moment.", cls: "form-status err", keepInput: true };
      case "timeout":
        return { text: "That took too long to confirm — your signup may or may not have gone through. Your email is still here; please try again, and keep an eye out for our launch email just in case.", cls: "form-status err", keepInput: true };
      default: /* "network" */
        return { text: "Something splashed — please check your connection and try again.", cls: "form-status err", keepInput: true };
    }
  }

  /* ---- Launch signup (FormSubmit AJAX) ----
     NOTE: the address owner must click FormSubmit's one-time activation
     email before submissions are delivered. First submit triggers it. */
  var notifyConfig = {
    timeoutMs: 15000,
    endpoint: "https://formsubmit.co/ajax/gregory.d.crump@gmail.com",
  };
  var form = document.getElementById("notify-form");
  if (form) {
    var email = document.getElementById("notify-email");
    var status = document.getElementById("notify-status");
    var submitBtn = form.querySelector('button[type="submit"]');
    var inFlight = false;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      /* Duplicate-submit guard: Enter in the field can re-fire submit
         while the button is disabled, so the flag is the real gate. */
      if (inFlight) return;
      var value = (email.value || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        status.textContent = "Hmm, that email doesn't look quite right — try again?";
        status.className = "form-status err";
        email.focus();
        return;
      }
      inFlight = true;
      /* Prevent mid-flight edits: a success clears the field, and clearing
         an address the visitor typed after submitting would lose it. */
      email.disabled = true;
      submitBtn.disabled = true;
      submitBtn.textContent = "Joining…";
      status.textContent = "";
      status.className = "form-status";

      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, notifyConfig.timeoutMs);

      function settle(kind) {
        clearTimeout(timer);
        inFlight = false;
        var c = notifyCopy(kind);
        status.textContent = c.text;
        status.className = c.cls;
        if (!c.keepInput) form.reset();
        email.disabled = false;
        submitBtn.disabled = false;
        submitBtn.textContent = "Notify me";
      }

      fetch(notifyConfig.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          email: value,
          _subject: "Dabblebit launch signup",
          _template: "table"
        }),
        signal: controller.signal,
      })
        .then(function (res) {
          var httpOk = !!(res && res.ok);
          return res.json().then(
            function (data) { return classifyNotifyResult(httpOk, data); },
            function () { return "malformed"; }
          );
        })
        .then(settle)
        .catch(function (err) {
          /* Timeout says nothing about whether the server received it. */
          settle(err && err.name === "AbortError" ? "timeout" : "network");
        });
    });
  }

  /* ---- Footer year ---- */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* node test hook — no-op in browsers (module is undefined there) */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      classifyNotifyResult: classifyNotifyResult,
      notifyCopy: notifyCopy,
      notifyConfig: notifyConfig,
    };
  }
})();
