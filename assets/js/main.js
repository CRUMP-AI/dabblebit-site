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

  /* ---- Launch signup (FormSubmit AJAX) ----
     NOTE: the address owner must click FormSubmit's one-time activation
     email before submissions are delivered. First submit triggers it. */
  var form = document.getElementById("notify-form");
  if (form) {
    var email = document.getElementById("notify-email");
    var status = document.getElementById("notify-status");
    var submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var value = (email.value || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        status.textContent = "Hmm, that email doesn't look quite right — try again?";
        status.className = "form-status err";
        email.focus();
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "Joining…";
      status.textContent = "";
      status.className = "form-status";

      fetch("https://formsubmit.co/ajax/gregory.d.crump@gmail.com", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          email: value,
          _subject: "Dabblebit launch signup",
          _template: "table"
        })
      })
        .then(function (res) { return res.json(); })
        .then(function () {
          status.textContent = "You're in! We'll email you the moment Dabblebit hatches.";
          status.className = "form-status ok";
          form.reset();
          submitBtn.disabled = false;
          submitBtn.textContent = "Notify me";
        })
        .catch(function () {
          status.textContent = "Something splashed — please try again in a moment.";
          status.className = "form-status err";
          submitBtn.disabled = false;
          submitBtn.textContent = "Notify me";
        });
    });
  }

  /* ---- Footer year ---- */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
