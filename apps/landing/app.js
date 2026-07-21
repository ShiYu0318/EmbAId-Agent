(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const nav = document.querySelector("[data-nav]");
  const onScroll = () => {
    if (nav) nav.setAttribute("data-scrolled", String(window.scrollY > 8));
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const toggle = document.querySelector("[data-nav-toggle]");
  const mobile = document.querySelector("[data-nav-mobile]");
  if (toggle && mobile) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "關閉選單" : "開啟選單");
      mobile.setAttribute("data-open", String(open));
    };
    toggle.addEventListener("click", () => {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    mobile.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setOpen(false));
    });
  }

  const revealables = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealables.forEach((el) => el.classList.add("in-view"));
  } else {
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in-view");
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    revealables.forEach((el) => io.observe(el));
  }

  const runCounters = (root) => {
    root.querySelectorAll("[data-count]").forEach((el) => {
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

  const body = document.querySelector("[data-chat-body]");
  if (body) startChatMock(body, reduceMotion);

  function startChatMock(container, reduced) {
    const script = [
      { role: "user", text: "退款政策是什麼?可以退多久?" },
      {
        role: "bot",
        text: "依 <strong>服務條款</strong>,商品到貨 <strong>14 天內</strong>可申請全額退款,退款會在核准後 3 至 5 個工作天退回原付款方式。",
        cite: "服務條款 · 第 4 節",
      },
    ];

    const render = () => {
      container.innerHTML = "";
      const user = document.createElement("div");
      user.className = "mm mm--user";
      user.textContent = script[0].text;
      container.appendChild(user);

      const bot = document.createElement("div");
      bot.className = "mm mm--bot";
      bot.style.animationDelay = "0.5s";
      container.appendChild(bot);

      if (reduced) {
        bot.innerHTML = script[1].text + citeMarkup(script[1].cite);
        return;
      }

      const typing = document.createElement("div");
      typing.className = "typing";
      typing.innerHTML = "<span></span><span></span><span></span>";
      bot.appendChild(typing);

      window.setTimeout(() => streamInto(bot, script[1].text, script[1].cite), 1500);
    };

    const citeMarkup = (cite) =>
      `<div class="mm__cite">來源 · <b>${cite}</b></div>`;

    const streamInto = (bot, html, cite) => {
      bot.classList.add("caret");
      bot.innerHTML = "";
      const tokens = tokenize(html);
      let i = 0;
      const step = () => {
        if (i >= tokens.length) {
          bot.classList.remove("caret");
          const cel = document.createElement("div");
          cel.className = "mm__cite";
          cel.innerHTML = `來源 · <b>${cite}</b>`;
          bot.appendChild(cel);
          window.setTimeout(render, 4200);
          return;
        }
        bot.innerHTML = tokens.slice(0, i + 1).join("");
        i += 1;
        window.setTimeout(step, 45);
      };
      step();
    };

    const tokenize = (html) => {
      const parts = [];
      const regex = /(<\/?strong>)|(\s+)|([^\s<]+)/g;
      let match;
      while ((match = regex.exec(html)) !== null) parts.push(match[0]);
      return parts;
    };

    render();
  }
})();
