/* ============================================================================
   SOTTO — landing page interactions & motion
   Degrades gracefully: if Lenis/GSAP fail to load, everything still works.
   Honors prefers-reduced-motion throughout.
   ========================================================================== */
(function () {
  "use strict";

  var html = document.documentElement;
  html.classList.add("js");

  /* --------------------------------------------- TOKEN forwarding to the demo */
  // The Sotto backend gates /api/* with a per-run token carried in the URL
  // (?token=…). Propagate it from the landing URL (or localStorage) onto every
  // "Launch Demo" link so the working demo can reach the live ledger.
  (function forwardToken() {
    var token = null;
    try {
      token = new URLSearchParams(location.search).get("token");
      if (token) localStorage.setItem("sotto-token", token);
      else token = localStorage.getItem("sotto-token");
    } catch (e) {}
    if (!token) return;
    Array.prototype.slice.call(document.querySelectorAll('a[href]')).forEach(function (a) {
      var href = a.getAttribute("href");
      if (href && /(^|\/)demo\.html(\?|#|$)/.test(href)) {
        try {
          var u = new URL(href, location.href);
          u.searchParams.set("token", token);
          a.setAttribute("href", u.pathname + u.search + u.hash);
        } catch (e) {}
      }
    });
  })();

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasGSAP = typeof window.gsap !== "undefined";
  var hasST = hasGSAP && typeof window.ScrollTrigger !== "undefined";
  var hasLenis = typeof window.Lenis !== "undefined";
  var storyAPI = null; // assigned by the horizontal-story module below

  /* ---------------------------------------------------------------- THEME */
  (function theme() {
    var btn = document.querySelector(".theme-toggle");
    if (!btn) return;
    var stored = null;
    try { stored = localStorage.getItem("sotto-theme"); } catch (e) {}
    if (stored === "light" || stored === "dark") setTheme(stored);

    function setTheme(t) {
      html.setAttribute("data-theme", t);
      var light = t === "light";
      btn.setAttribute("aria-pressed", String(light));
      btn.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", light ? "#f4f6f8" : "#0a0c0f");
      try { localStorage.setItem("sotto-theme", t); } catch (e) {}
    }
    btn.addEventListener("click", function () {
      setTheme(html.getAttribute("data-theme") === "light" ? "dark" : "light");
    });
  })();

  /* ------------------------------------------------- HEADER scrolled state */
  var header = document.querySelector(".site-header");
  function onScrollHeader() {
    if (header) header.classList.toggle("scrolled", window.scrollY > 24);
  }
  onScrollHeader();
  window.addEventListener("scroll", onScrollHeader, { passive: true });

  /* ----------------------------------------------- VIEW-AS interaction (d) */
  (function viewAs() {
    var app = document.querySelector(".proof-app");
    if (!app) return;
    var tabs = Array.prototype.slice.call(app.querySelectorAll(".vtab"));
    var views = Array.prototype.slice.call(app.querySelectorAll(".pview"));

    function show(name) {
      app.setAttribute("data-view", name);
      tabs.forEach(function (t) {
        t.setAttribute("aria-selected", String(t.dataset.vw === name));
      });
      views.forEach(function (v) {
        var match = v.dataset.pv === name;
        v.hidden = !match;
      });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { show(t.dataset.vw); });
      // keyboard: arrow navigation across the tablist
      t.addEventListener("keydown", function (e) {
        var dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        var next = tabs[(i + dir + tabs.length) % tabs.length];
        next.focus();
        show(next.dataset.vw);
      });
    });
  })();

  /* ------------------------------------------------ COUNT-UP numbers (mono) */
  function formatNum(el, value) {
    var fmt = el.dataset.format;
    var prefix = el.dataset.prefix || "";
    var out;
    if (fmt === "usd") {
      out = prefix + Math.round(value).toLocaleString("en-US");
    } else {
      out = prefix + Math.round(value).toLocaleString("en-US");
    }
    el.textContent = out;
  }
  function countUp(el) {
    if (el.dataset.done) return;
    el.dataset.done = "1";
    var target = parseFloat(el.dataset.count);
    if (isNaN(target)) return;
    if (reduceMotion) { formatNum(el, target); return; }
    var dur = 1200, start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      formatNum(el, target * eased);
      if (p < 1) requestAnimationFrame(step);
      else formatNum(el, target);
    }
    requestAnimationFrame(step);
  }

  /* ------------------------------------- REVEALS + count triggers (IO base) */
  var io = ("IntersectionObserver" in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      en.target.classList.add("in-view");
      en.target.querySelectorAll && en.target.querySelectorAll(".num[data-count]").forEach(countUp);
      if (en.target.classList.contains("num")) countUp(en.target);
      io.unobserve(en.target);
    });
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.15 }) : null;

  if (io) {
    document.querySelectorAll(".reveal-up").forEach(function (el) { io.observe(el); });
    document.querySelectorAll(".num[data-count]").forEach(function (el) { io.observe(el); });
  } else {
    // no IO: just show everything
    document.querySelectorAll(".reveal-up").forEach(function (el) { el.classList.add("in-view"); });
    document.querySelectorAll(".num[data-count]").forEach(countUp);
  }

  /* --------------------------------------------- HERO kinetic type reveal */
  (function heroType() {
    var lines = document.querySelectorAll(".hero-heading .line-in");
    var redact = document.querySelector(".redact-word[data-redact]");
    if (reduceMotion) {
      if (redact) redact.classList.add("revealed");
      return;
    }
    if (hasGSAP && lines.length) {
      // .from() animates FROM the hidden state and auto-clears to the natural
      // visible resting state on completion — so even if the tween is
      // interrupted, the headline ends up visible (never stuck off-screen).
      window.gsap.from(lines, {
        yPercent: 110, duration: 1.05, ease: "power4.out", stagger: 0.1, delay: 0.15
      });
      // Belt-and-braces: guarantee a visible resting state regardless of the
      // ticker actually advancing (mirrors the setTimeout-driven redact below).
      setTimeout(function () { window.gsap.set(lines, { clearProps: "transform" }); }, 1600);
    }
    // reveal the redacted word a beat after the lines settle
    setTimeout(function () { if (redact) redact.classList.add("revealed"); }, hasGSAP ? 1300 : 400);
  })();

  /* ----------------------------------------------- SMOOTH SCROLL (Lenis) */
  var lenis = null;
  if (hasLenis && !reduceMotion) {
    lenis = new window.Lenis({ duration: 1.1, smoothWheel: true, lerp: 0.1 });
    if (hasST) {
      // Drive Lenis from a SINGLE clock (the GSAP ticker). Adding a second
      // requestAnimationFrame loop here would advance Lenis twice per frame
      // and produce visible scroll stutter.
      lenis.on("scroll", window.ScrollTrigger.update);
      window.gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      window.gsap.ticker.lagSmoothing(0);
    } else {
      var raf = function (t) { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }

  /* anchor / CTA smooth scrolling that respects Lenis */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href");
      if (id === "#" || id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      // Links that point into the horizontal story scroll the track, not the page.
      if (storyAPI && target.closest && target.closest(".story-track")) {
        storyAPI.toPanel(target);
        history.replaceState(null, "", id);
        return;
      }
      if (lenis) lenis.scrollTo(target, { offset: -70, duration: 1.2 });
      else target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", id);
    });
  });

  /* ------------------------------------------- HERO envelope parallax */
  (function envelopes() {
    if (reduceMotion) return;
    var visual = document.querySelector(".hero-visual");
    if (!visual) return;
    var items = Array.prototype.slice.call(visual.querySelectorAll("[data-parallax]"));
    var tx = 0, ty = 0, cx = 0, cy = 0, heroVisible = true;

    // Stop all transform writes once the hero scrolls away — saves a per-frame layout.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { heroVisible = e[0].isIntersecting; })
        .observe(document.querySelector(".hero"));
    }

    window.addEventListener("pointermove", function (e) {
      if (!heroVisible) return;
      var nx = (e.clientX / window.innerWidth - 0.5);
      var ny = (e.clientY / window.innerHeight - 0.5);
      tx = nx; ty = ny;
    }, { passive: true });

    function loop() {
      requestAnimationFrame(loop);
      if (!heroVisible) return;
      var ncx = cx + (tx - cx) * 0.06;
      var ncy = cy + (ty - cy) * 0.06;
      // skip the write entirely once it has settled (idle hero = no work)
      if (Math.abs(ncx - cx) < 0.0002 && Math.abs(ncy - cy) < 0.0002) { cx = ncx; cy = ncy; return; }
      cx = ncx; cy = ncy;
      items.forEach(function (el) {
        var f = parseFloat(el.dataset.parallax) || 0;
        el.style.transform = "translate3d(" + (cx * f * 240).toFixed(2) + "px," + (cy * f * 240).toFixed(2) + "px,0)";
      });
    }
    loop();

    // subtle scroll-driven separation of the two envelopes
    if (hasST) {
      window.gsap.to(".env-a", { yPercent: -14, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
      window.gsap.to(".env-b", { yPercent: 16, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
    }
  })();

  /* ------------------------------------------- SETTLEMENT DvP (pinned) (e) */
  (function settlement() {
    var dvp = document.querySelector(".dvp");
    var asset = document.querySelector(".dvp-asset");
    var cash = document.querySelector(".dvp-cash");
    var statusEl = document.querySelector(".dvp [data-status]");
    var failBtn = document.querySelector("[data-replay-fail]");
    if (!dvp || !asset || !cash) return;

    function setStatus(txt) { if (statusEl) statusEl.textContent = txt; }

    // ----- Success path, scrubbed by scroll (when GSAP+ScrollTrigger present)
    if (hasST && !reduceMotion) {
      // distance the two legs travel toward each other & past (the "cross")
      var cross = function () { return Math.min(dvp.offsetWidth * 0.34, 280); };

      var tl = window.gsap.timeline({
        scrollTrigger: {
          trigger: ".settlement",
          start: "top top",
          end: "+=140%",
          scrub: 0.6,
          pin: ".settle-pin",
          pinSpacing: true,
          onUpdate: function (self) {
            if (self.progress > 0.96) { dvp.classList.add("is-settled"); setStatus("SETTLED ✓"); }
            else { dvp.classList.remove("is-settled"); setStatus(self.progress > 0.08 ? "CROSSING…" : "READY"); }
          }
        }
      });
      tl.to(asset, { x: function () { return cross(); }, ease: "power2.inOut" }, 0)
        .to(cash, { x: function () { return -cross(); }, ease: "power2.inOut" }, 0)
        .to(asset, { x: 0, ease: "power2.inOut" }, 0.55)
        .to(cash, { x: 0, ease: "power2.inOut" }, 0.55);
    } else {
      // reduced motion / no GSAP: present the settled outcome statically
      dvp.classList.add("is-settled");
      setStatus("SETTLED ✓");
    }

    // ----- Failure replay: roll back, nothing moves
    if (failBtn) {
      failBtn.addEventListener("click", function () {
        if (reduceMotion || !hasGSAP) {
          dvp.classList.remove("is-settled");
          dvp.classList.add("is-failed");
          setStatus("ROLLED BACK · NOTHING MOVED");
          window.setTimeout(function () { dvp.classList.remove("is-failed"); dvp.classList.add("is-settled"); setStatus("SETTLED ✓"); }, 2200);
          return;
        }
        failBtn.disabled = true;
        dvp.classList.remove("is-settled");
        dvp.classList.add("is-failed");
        setStatus("LEG B FAILS…");
        var d = Math.min(dvp.offsetWidth * 0.22, 170);
        var t = window.gsap.timeline({
          onComplete: function () {
            failBtn.disabled = false;
            dvp.classList.remove("is-failed");
            dvp.classList.add("is-settled");
            setStatus("SETTLED ✓");
          }
        });
        // both legs start to move, then snap back together (atomic rollback)
        t.to(asset, { x: d, duration: 0.5, ease: "power2.out" }, 0)
         .to(cash, { x: -d, duration: 0.5, ease: "power2.out" }, 0)
         .call(function () { setStatus("ROLLED BACK · NOTHING MOVED"); }, null, 0.55)
         .to([asset, cash], { x: 0, duration: 0.45, ease: "back.in(2)" }, 0.6)
         .to(dvp, { x: -4, duration: 0.05, yoyo: true, repeat: 5, ease: "none" }, 0.6) // shake
         .set(dvp, { x: 0 })
         .to({}, { duration: 1.1 }); // hold the "nothing moved" message
      });
    }
  })();

  /* ---------------------------------- THE ARGUMENT: horizontal scroll (b–f) */
  (function story() {
    var section = document.querySelector(".story");
    var track = document.querySelector(".story-track");
    var viewport = document.querySelector(".story-viewport");
    var bar = document.querySelector(".story-progress-bar");
    if (!section || !track) return;

    function maxX() { return Math.max(0, track.scrollWidth - document.documentElement.clientWidth); }
    function setBar(p) { if (bar) bar.style.transform = "scaleX(" + (0.2 + p * 0.8) + ")"; }

    // Desktop with motion: pin & translate the track ONLY when it overflows.
    // If all panels already fit (wide screens), pinning would have zero scroll
    // distance and leave the section half-centered — so we center it statically.
    var canPin = hasST && !reduceMotion && window.matchMedia("(min-width: 760px)").matches;
    var overflows = maxX() > 4;

    if (canPin && overflows) {
      section.classList.add("is-pinned");
      var tween = window.gsap.to(track, {
        x: function () { return -maxX(); },
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: function () { return "+=" + maxX(); },
          pin: true, scrub: 0.6, anticipatePin: 1, invalidateOnRefresh: true,
          onUpdate: function (self) { setBar(self.progress); }
        }
      });
      var st = tween.scrollTrigger;
      storyAPI = { toPanel: function (panel) {
        var mx = maxX();
        var p = mx > 0 ? panel.offsetLeft / mx : 0;
        var y = st.start + p * (st.end - st.start);
        if (lenis) lenis.scrollTo(y, { duration: 1.2 });
        else window.scrollTo({ top: y, behavior: "smooth" });
      }};
      // If a resize makes the panels fit, swap to the centered layout.
      window.addEventListener("resize", function () {
        if (maxX() <= 4 && section.classList.contains("is-pinned")) location.reload();
      }, { passive: true });
    } else if (canPin) {
      // Panels fit: no horizontal scroll — center them on screen, full progress.
      section.classList.add("is-flat");
      setBar(1);
      storyAPI = { toPanel: function () { section.scrollIntoView({ behavior: "smooth", block: "center" }); } };
    } else {
      // Fallback (mobile / reduced-motion / no GSAP): native horizontal scroll.
      storyAPI = { toPanel: function (panel) {
        if (viewport) viewport.scrollTo({ left: Math.max(0, panel.offsetLeft - 20), behavior: reduceMotion ? "auto" : "smooth" });
        section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }};
      if (viewport) {
        viewport.addEventListener("scroll", function () {
          var mx = viewport.scrollWidth - viewport.clientWidth;
          setBar(mx > 0 ? viewport.scrollLeft / mx : 0);
        }, { passive: true });
      }
    }
  })();

  /* ------------------------------------- refresh ScrollTrigger after fonts */
  if (hasST && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { window.ScrollTrigger.refresh(); });
  }
})();
