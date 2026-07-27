(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;

  const stored = (() => {
    try {
      return localStorage.getItem("embaid-theme");
    } catch {
      return null;
    }
  })();
  root.dataset.theme = stored || "dark";
  const themeToggle = document.querySelector("[data-theme-toggle]");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try {
        localStorage.setItem("embaid-theme", next);
      } catch {
        void 0;
      }
    });
  }

  const params = new URLSearchParams(window.location.search);
  const dashboardUrl = (params.get("dashboard") || "http://localhost:3000").replace(/\/$/, "");
  document.querySelectorAll("[data-login], [data-signup]").forEach((a) => {
    a.href = `${dashboardUrl}/login`;
  });

  const toggle = document.querySelector("[data-nav-toggle]");
  const mobile = document.querySelector("[data-nav-mobile]");
  if (toggle && mobile) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "關閉選單" : "開啟選單");
      mobile.setAttribute("data-open", String(open));
    };
    toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
    mobile.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
  }

  const revealables = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealables.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );
    revealables.forEach((el) => io.observe(el));
  }

  const runCounters = (rootEl) => {
    rootEl.querySelectorAll("[data-count]").forEach((el) => {
      const target = Number(el.getAttribute("data-count"));
      const prefix = el.getAttribute("data-prefix") ?? "";
      const suffix = el.getAttribute("data-suffix") ?? "";
      if (reduceMotion) {
        el.innerHTML = prefix + target + suffix;
        return;
      }
      const duration = 1400;
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        el.innerHTML = prefix + Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };
  const metrics = document.querySelector("[data-metrics]");
  if (metrics) {
    if (reduceMotion || !("IntersectionObserver" in window)) {
      runCounters(metrics);
    } else {
      const mo = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            runCounters(metrics);
            obs.disconnect();
          });
        },
        { threshold: 0.4 },
      );
      mo.observe(metrics);
    }
  }

  const tabRoot = document.querySelector("[data-tabs]");
  if (tabRoot) {
    const buttons = tabRoot.querySelectorAll("[data-tab]");
    const panels = tabRoot.querySelectorAll("[data-panel]");
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-tab");
        buttons.forEach((b) => b.setAttribute("aria-selected", String(b === button)));
        panels.forEach((p) => {
          p.hidden = p.getAttribute("data-panel") !== key;
        });
      });
    });
  }

  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = document.getElementById(button.getAttribute("data-copy"));
      if (!target) return;
      try {
        await navigator.clipboard.writeText(target.textContent.trim());
        const original = button.textContent;
        button.textContent = "已複製";
        button.setAttribute("data-copied", "true");
        setTimeout(() => {
          button.textContent = original;
          button.removeAttribute("data-copied");
        }, 1600);
      } catch {
        button.textContent = "複製失敗";
        setTimeout(() => (button.textContent = "複製"), 1600);
      }
    });
  });
})();
