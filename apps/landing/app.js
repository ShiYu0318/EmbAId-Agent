(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const root = document.documentElement;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- language: translate the static page before anything reads its text ----------
  const I18N = window.EMBAID_I18N ?? {
    lang: "zh-TW",
    other: "en",
    t: (zh) => zh,
    apply: () => {},
    translate: () => {},
    setLang: () => {},
    onChange: () => {},
  };
  const T = I18N.t;
  const isEN = () => I18N.lang === "en";
  // Split headlines are rebuilt from their Chinese source on every switch.
  const splitSources = new Map([...document.querySelectorAll("[data-split]")].map((el) => [el, el.innerHTML]));
  I18N.apply();
  const langButtons = [...document.querySelectorAll("[data-lang-toggle]")];
  const labelLangButtons = () =>
    langButtons.forEach((button) => {
      button.textContent = I18N.other === "en" ? "EN" : "中文";
      button.setAttribute("aria-label", T("切換為英文", "Switch to Traditional Chinese"));
      button.setAttribute("lang", I18N.other);
    });
  labelLangButtons();
  langButtons.forEach((button) => button.addEventListener("click", () => I18N.setLang(I18N.other)));
  I18N.onChange(labelLangButtons);

  // ---------- theme ----------
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
    themeToggle.addEventListener("click", (event) => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      const apply = () => {
        root.dataset.theme = next;
        try {
          localStorage.setItem("embaid-theme", next);
        } catch {
          void 0;
        }
      };
      if (!document.startViewTransition || reduceMotion) {
        apply();
        return;
      }
      const x = event.clientX || window.innerWidth - 40;
      const y = event.clientY || 32;
      const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      document.startViewTransition(apply).ready.then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 520, easing: "cubic-bezier(0.23, 1, 0.32, 1)", pseudoElement: "::view-transition-new(root)" },
        );
      });
    });
  }

  // ---------- login links ----------
  const params = new URLSearchParams(window.location.search);
  // Production builds may set data-dashboard on <html>; an empty value means no hosted
  // dashboard exists, so sign-up points at the self-hosting guide and sign-in is hidden.
  const configured = root.dataset.dashboard;
  const dashboardUrl = (params.get("dashboard") || configured || "http://localhost:3000").replace(/\/$/, "");
  if (configured === "" && !params.get("dashboard")) {
    document.querySelectorAll("[data-login]").forEach((a) => (a.hidden = true));
    document.querySelectorAll("[data-signup]").forEach((a) => {
      a.href = "https://github.com/ShiYu0318/EmbAId-Chat#getting-started";
      a.target = "_blank";
      a.rel = "noopener";
    });
  } else {
    const link = () => {
      document.querySelectorAll("[data-login]").forEach((a) => (a.href = `${dashboardUrl}/login?lang=${I18N.lang}`));
      document.querySelectorAll("[data-signup]").forEach((a) => (a.href = `${dashboardUrl}/login?mode=signup&lang=${I18N.lang}`));
    };
    link();
    I18N.onChange(link);
  }

  // ---------- damped wheel scrolling ----------
  // Wheel deltas move a target, the page eases toward it each frame.
  // Touch, keyboard, scrollbar and anchor scrolling stay native and resync the target.
  if (!reduceMotion) {
    const LERP = 0.1; // fraction of the remaining distance covered per 60fps frame
    let target = window.scrollY;
    let current = window.scrollY;
    let lastSet = current;
    let frame = 0;
    let lastTime = 0;

    const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;

    const canScrollInside = (event) => {
      // The widget's shadow root is closed, so its scrollers are invisible from here.
      if (event.target instanceof Element && event.target.closest("[data-embaid-widget]")) return true;
      for (const node of event.composedPath()) {
        if (node === document.body || node === document.documentElement) break;
        if (!(node instanceof Element)) continue;
        const { overflowY } = getComputedStyle(node);
        if (overflowY !== "auto" && overflowY !== "scroll") continue;
        if (node.scrollHeight <= node.clientHeight) continue;
        if (event.deltaY < 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1) {
          return true;
        }
      }
      return false;
    };

    const step = (now) => {
      const dt = lastTime ? Math.min(now - lastTime, 64) : 16.67;
      lastTime = now;
      current += (target - current) * (1 - Math.pow(1 - LERP, dt / 16.67));
      if (Math.abs(target - current) < 0.5) current = target;
      lastSet = current;
      window.scrollTo({ top: current, behavior: "instant" });
      if (current === target) {
        frame = 0;
        lastTime = 0;
        return;
      }
      frame = requestAnimationFrame(step);
    };

    window.addEventListener(
      "wheel",
      (event) => {
        if (event.ctrlKey || event.deltaY === 0 || canScrollInside(event)) return;
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
        if (!frame) target = current = window.scrollY;
        target = Math.max(0, Math.min(maxScroll(), target + event.deltaY * unit));
        if (!frame) frame = requestAnimationFrame(step);
      },
      { passive: false },
    );

    window.addEventListener(
      "scroll",
      () => {
        if (frame && Math.abs(window.scrollY - lastSet) <= 2) return;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        lastTime = 0;
        target = current = lastSet = window.scrollY;
      },
      { passive: true },
    );
  }

  // ---------- nav: scrolled / hide-on-scroll / progress ----------
  const nav = document.querySelector("[data-nav]");
  const bar = document.querySelector("[data-progress]");
  let ticking = false;
  const onScroll = () => {
    const y = window.scrollY;
    nav?.toggleAttribute("data-scrolled", y > 24);
    if (bar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    }
    ticking = false;
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(onScroll);
      }
    },
    { passive: true },
  );
  onScroll();

  const toggle = document.querySelector("[data-nav-toggle]");
  const mobile = document.querySelector("[data-nav-mobile]");
  if (toggle && mobile) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? T("關閉選單", "Close menu") : T("開啟選單", "Open menu"));
      mobile.setAttribute("data-open", String(open));
      if (open) nav?.setAttribute("data-scrolled", "");
    };
    toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
    mobile.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
  }

  // ---------- gliding pills (nav hover, segmented controls, tabs) ----------
  const placePill = (pill, el, show = true) => {
    if (!pill || !el) return;
    pill.style.width = `${el.offsetWidth}px`;
    pill.style.transform = `translateX(${el.offsetLeft}px)`;
    pill.style.opacity = show ? "1" : "0";
  };

  const glide = document.querySelector("[data-glide]");
  if (glide) {
    const pill = glide.querySelector("[data-glide-pill]");
    const links = [...glide.querySelectorAll("a")];
    let current = null;
    const rest = () => (current ? placePill(pill, current) : (pill.style.opacity = "0"));
    links.forEach((a) => a.addEventListener("pointerenter", () => placePill(pill, a)));
    glide.addEventListener("pointerleave", rest);
    const sections = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const link = links.find((a) => a.getAttribute("href") === `#${entry.target.id}`);
          links.forEach((a) => a.removeAttribute("aria-current"));
          if (link) link.setAttribute("aria-current", "true");
          current = link || null;
          if (!glide.matches(":hover")) rest();
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((s) => spy.observe(s));
  }

  const segmented = (rootEl, buttonSel, pillSel, onSelect) => {
    if (!rootEl) return null;
    const buttons = [...rootEl.querySelectorAll(buttonSel)];
    const pill = rootEl.querySelector(pillSel);
    const select = (button, fromUser) => {
      buttons.forEach((b) => b.setAttribute("aria-selected", String(b === button)));
      placePill(pill, button);
      onSelect?.(button, fromUser);
    };
    buttons.forEach((b) => b.addEventListener("click", () => select(b, true)));
    const sync = () => placePill(pill, buttons.find((b) => b.getAttribute("aria-selected") === "true") || buttons[0]);
    new ResizeObserver(sync).observe(rootEl);
    document.fonts?.ready.then(sync);
    sync();
    return { select, buttons };
  };

  // ---------- split text ----------
  const splitText = (el) => {
    if (reduceMotion) return;
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          // Latin words are wrapped whole so a line never breaks inside one.
          for (const part of child.textContent.split(/(\s+)/)) {
            if (part === "") continue;
            if (part.trim() === "") {
              frag.append(part);
              continue;
            }
            const word = /^[\x21-\x7e\u2019]+$/.test(part) ? document.createElement("span") : null;
            if (word) word.className = "word";
            for (const ch of part) {
              const span = document.createElement("span");
              span.className = "char";
              span.style.setProperty("--i", String(i++));
              span.textContent = ch;
              (word ?? frag).append(span);
            }
            if (word) frag.append(word);
          }
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== "BR") {
          walk(child);
        }
      });
    };
    // line breaks are <br>s, so join the lines with a space or a screen reader runs them together
    const label = [...el.childNodes].map((n) => (n.nodeName === "BR" ? " " : n.textContent)).join("");
    el.setAttribute("aria-label", label.replace(/\s+/g, " ").trim());
    walk(el);
    el.querySelectorAll(".char").forEach((c) => c.setAttribute("aria-hidden", "true"));
    // the page-wide translator leaves split headlines alone; they are rebuilt below
    el.setAttribute("data-i18n-skip", "");
  };
  splitSources.forEach((_, el) => splitText(el));
  I18N.onChange(() => {
    splitSources.forEach((html, el) => {
      el.removeAttribute("data-i18n-skip");
      el.removeAttribute("aria-label");
      el.innerHTML = html;
      I18N.translate(el);
      splitText(el);
    });
  });

  // ---------- reveal ----------
  document.querySelectorAll(".chunks").forEach((grid) => {
    [...grid.children].forEach((c, i) => c.style.setProperty("--i", String(i)));
  });
  // Scroll-in choreography: each block picks a direction, siblings stagger in turn.
  const mark = (el, kind, i = 0) => {
    el.classList.add("reveal");
    el.dataset.reveal = kind;
    el.style.setProperty("--rd", `${Math.min(i, 8) * 70}ms`);
  };
  document.querySelectorAll(".sec-head").forEach((head) => {
    head.classList.remove("reveal");
    [...head.children].forEach((child, i) => mark(child, "up", i));
  });
  document.querySelectorAll(".bento > .card, .modes > .card").forEach((el, i) => mark(el, "scale", i % 3));
  document.querySelectorAll(".timeline .tl").forEach((el, i) => mark(el, i % 2 ? "right" : "left"));
  document.querySelectorAll(".road__list li, .faq__item, .flist li").forEach((el) => {
    const i = [...el.parentElement.children].indexOf(el);
    mark(el, el.matches(".road__list li") ? "left" : "up", i);
  });
  document.querySelectorAll(".story__step").forEach((el) => mark(el, "up"));
  document.querySelectorAll(".think__stage, .road__visual, .cta__inner, .tabs").forEach((el) => mark(el, "scale"));
  document.querySelectorAll(".intro__copy > *").forEach((el, i) => {
    if (!el.matches("[data-split]")) mark(el, "up", i);
  });

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
      // Fire once the block is actually on screen, so phones see the motion too.
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    revealables.forEach((el) => io.observe(el));
  }

  // Split headlines play their character cascade once they are well into view.
  const splits = document.querySelectorAll("[data-split]");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    splits.forEach((el) => el.classList.add("in"));
  } else {
    const so = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          obs.unobserve(entry.target);
        });
      },
      { threshold: 0.5 },
    );
    splits.forEach((el) => so.observe(el));
  }

  // ---------- story: pinned scroll scenes ----------
  const story = document.querySelector("[data-story]");
  if (story) {
    const steps = [...story.querySelectorAll("[data-step]")];
    const scenes = [...story.querySelectorAll("[data-scene]")];
    const label = story.querySelector("[data-story-label]");
    const names = () =>
      isEN()
        ? ["ingest", "chunk → embed", "hybrid search → rerank", "grounded answer"]
        : ["ingest：匯入來源", "chunk → embed：切塊與嵌入", "hybrid search → rerank", "grounded answer：回答與改善"];
    let current = 0;
    const activate = (i) => {
      current = i;
      steps.forEach((s, k) => s.toggleAttribute("data-active", k === i));
      scenes.forEach((s, k) => s.toggleAttribute("data-active", k === i));
      if (label) label.textContent = names()[i];
    };
    activate(0);

    // On narrow screens a sticky panel would sit on top of the text, so each step
    // gets its own copy of the matching scene instead.
    const panel = story.querySelector(".story__panel");
    const narrow = window.matchMedia("(max-width: 1024px)");
    const inline = () => {
      story.querySelectorAll(".story__inline").forEach((el) => el.remove());
      if (!narrow.matches || !panel) return;
      steps.forEach((step, i) => {
        const copy = document.createElement("div");
        copy.className = "panel story__panel story__inline";
        copy.setAttribute("aria-hidden", "true");
        const bar = panel.querySelector(".panel__bar").cloneNode(true);
        bar.querySelector("[data-story-label]")?.replaceChildren(names()[i]);
        bar.querySelector("[data-story-label]")?.removeAttribute("data-story-label");
        const scene = scenes[i].cloneNode(true);
        scene.setAttribute("data-active", "");
        copy.append(bar, scene);
        step.append(copy);
      });
    };
    inline();
    narrow.addEventListener("change", inline);
    I18N.onChange(() => {
      activate(current);
      inline();
    });
    const so = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) activate(Number(entry.target.getAttribute("data-step")));
        });
      },
      { rootMargin: "-48% 0px -48% 0px" },
    );
    steps.forEach((s) => so.observe(s));
  }

  // ---------- spotlight cards ----------
  if (finePointer) {
    document.querySelectorAll("[data-spotlight] .card").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    });
  }

  // ---------- deploy timeline: scroll-linked line ----------
  const timeline = document.querySelector("[data-timeline]");
  if (timeline) {
    const draw = timeline.querySelector("[data-timeline-draw]");
    const items = [...timeline.querySelectorAll(".tl")];
    let queued = false;
    const update = () => {
      queued = false;
      const r = timeline.getBoundingClientRect();
      const anchor = window.innerHeight * 0.6;
      const p = Math.min(1, Math.max(0, (anchor - r.top) / r.height));
      draw.style.transform = `scaleY(${p})`;
      items.forEach((item) => {
        const ir = item.getBoundingClientRect();
        item.toggleAttribute("data-on", ir.top + 30 < anchor);
      });
    };
    window.addEventListener(
      "scroll",
      () => {
        if (!queued) {
          queued = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true },
    );
    update();
  }

  // ---------- code tabs ----------
  const tabRoot = document.querySelector("[data-tabs]");
  if (tabRoot) {
    const panels = tabRoot.querySelectorAll("[data-panel]");
    segmented(tabRoot.querySelector(".tabs__head"), "[data-tab]", ".tabs__pill", (button) => {
      const key = button.getAttribute("data-tab");
      panels.forEach((p) => (p.hidden = p.getAttribute("data-panel") !== key));
    });
  }

  // ---------- copy ----------
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = document.getElementById(button.getAttribute("data-copy"));
      if (!target) return;
      const isIcon = !button.textContent.trim();
      const original = button.textContent;
      try {
        await navigator.clipboard.writeText(target.textContent.trim());
        if (!isIcon) button.textContent = T("已複製", "Copied");
        button.setAttribute("data-copied", "true");
      } catch {
        if (!isIcon) button.textContent = T("複製失敗", "Copy failed");
      }
      setTimeout(() => {
        if (!isIcon) button.textContent = original;
        button.removeAttribute("data-copied");
      }, 1600);
    });
  });

  // ---------- ambient loops: run only while a section is on screen ----------
  const liveTargets = document.querySelectorAll("main section, .marquee");
  const packets = document.querySelector("[data-packets]");
  if (packets && reduceMotion) packets.querySelectorAll(".pkt").forEach((p) => p.remove());
  if ("IntersectionObserver" in window) {
    const lo = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.toggleAttribute("data-live", entry.isIntersecting);
          if (packets && entry.target.contains(packets) && !reduceMotion) {
            entry.isIntersecting ? packets.unpauseAnimations?.() : packets.pauseAnimations?.();
          }
        });
      },
      { rootMargin: "10% 0px" },
    );
    liveTargets.forEach((el) => lo.observe(el));
  } else {
    liveTargets.forEach((el) => el.setAttribute("data-live", ""));
  }
  const isLive = (el) => Boolean(el?.closest("section")?.hasAttribute("data-live"));

  if (!reduceMotion) {
    // knowledge-gap counters: a new visitor asks the same thing again
    const ticks = [...document.querySelectorAll("[data-tick]")];
    setInterval(() => {
      if (!ticks.length || !isLive(ticks[0])) return;
      const el = ticks[Math.floor(Math.random() * ticks.length)];
      const n = Number(el.textContent.replace(/\D/g, "")) + 1;
      el.textContent = `×${n}`;
      el.classList.remove("pop");
      void el.offsetWidth;
      el.classList.add("pop");
    }, 2200);

    // persona: cycle through tones and accent colors
    const personaRoot = document.querySelector("[data-persona-root]");
    if (personaRoot) {
      const swatches = [...personaRoot.querySelectorAll(".sw")];
      const text = personaRoot.querySelector("[data-persona]");
      const tones = () =>
        isEN()
        ? ["“Friendly, concise, in Traditional Chinese”", "“Precise, with clause numbers”", "“Relaxed, like chatting with a friend”", "“Formal and complete, for public services”"]
        : ["「親切、簡潔，使用繁體中文」", "「專業精準，附上條款編號」", "「輕鬆一點，像朋友聊天」", "「正式完整，適合公部門」"];
      let k = 0;
      swatches[0]?.classList.add("is-on");
      I18N.onChange(() => (text.textContent = tones()[k % tones().length]));
      setInterval(() => {
        if (!isLive(personaRoot)) return;
        k = (k + 1) % swatches.length;
        swatches.forEach((s, i) => s.classList.toggle("is-on", i === k));
        text.classList.add("is-swap");
        setTimeout(() => {
          text.textContent = tones()[k % tones().length];
          text.classList.remove("is-swap");
        }, 220);
      }, 2800);
    }
  }

  // ---------- thinking demo: the real widget, inline, playing a script ----------
  const think = document.querySelector("[data-think]");
  if (think) {
    const SCENARIOS_ZH = {
      answer: [
        { user: "退貨要幾天內申請？可以退回信用卡嗎？" },
        {
          think: [
            { label: "理解並改寫問題", note: "Query Rewriting →「退貨申請期限、退款方式」", ms: 700 },
            { label: "混合檢索 Hybrid Search", note: "Dense + BM25，{n} 段候選", count: 24, ms: 900 },
            { label: "Cross-encoder 重排序", note: "保留 4 段，最高相關 0.94", ms: 800 },
            { label: "檢查來源時效", note: "1 段舊版政策已降權", ms: 700 },
            { label: "依據證據生成回答", ms: 500 },
          ],
        },
        {
          answer: [
            ["收到商品後 "],
            ["21 天內", true],
            ["都可以申請退貨，商品需保持完整包裝。退款會原路退回：信用卡付款約 "],
            ["7–14 個工作天", true],
            ["入帳。"],
          ],
          cites: ["退換貨政策 §4", "付款與退款 FAQ"],
          conf: 0.94,
        },
      ],
      clarify: [
        { user: "我可以申請延長保固嗎？" },
        {
          think: [
            { label: "理解問題", note: "延長保固、申請資格", ms: 650 },
            { label: "搜尋知識庫", note: "{n} 段候選", count: 18, ms: 850 },
            { label: "比對適用條件", note: "一般會員與企業客戶規定不同", ms: 900, warn: true },
          ],
        },
        {
          answer: [["可以，不過規定會依身分不同。請問你是哪一種？"]],
          quick: ["一般會員", "企業客戶"],
          pick: 0,
        },
        { user: "一般會員" },
        {
          think: [
            { label: "聚焦一般會員條款", note: "保固政策 §2.1", ms: 800 },
            { label: "組織回答", ms: 450 },
          ],
        },
        {
          answer: [
            ["一般會員可在購買後 "],
            ["30 天內", true],
            ["加購一年延長保固，到會員中心的「我的訂單」就能申請。"],
          ],
          cites: ["保固政策 §2.1"],
          conf: 0.88,
        },
      ],
      abstain: [
        { user: "你們明年會在高雄開門市嗎？" },
        {
          think: [
            { label: "理解問題", note: "門市展店計畫、高雄", ms: 650 },
            { label: "搜尋知識庫", note: "{n} 段候選", count: 9, ms: 850 },
            { label: "評估證據", note: "最高相關 0.31，低於門檻 0.55", ms: 900, warn: true },
          ],
        },
        {
          answer: [["我在目前的資料裡找不到明年展店計畫的資訊，所以不想用猜的回答你。需要的話，我可以幫你轉給專人確認。"]],
          flag: "已記錄為知識缺口，管理員可以補上答案",
          conf: 0.31,
          low: true,
        },
      ],
    };

    const SCENARIOS_EN = {
      answer: [
        { user: "How long do I have to return an item? Can the refund go back to my card?" },
        {
          think: [
            { label: "Understand and rewrite", note: "Query rewriting → “return deadline, refund method”", ms: 700 },
            { label: "Hybrid search", note: "Dense + BM25, {n} candidates", count: 24, ms: 900 },
            { label: "Cross-encoder rerank", note: "Kept 4, top relevance 0.94", ms: 800 },
            { label: "Check source freshness", note: "1 passage from an old policy down-weighted", ms: 700 },
            { label: "Answer from the evidence", ms: 500 },
          ],
        },
        {
          answer: [
            ["You can request a return within "],
            ["21 days", true],
            [" of delivery, as long as the packaging is intact. Refunds go back the way you paid: card payments arrive in about "],
            ["7–14 business days", true],
            ["."],
          ],
          cites: ["Returns policy §4", "Payments & refunds FAQ"],
          conf: 0.94,
        },
      ],
      clarify: [
        { user: "Can I get an extended warranty?" },
        {
          think: [
            { label: "Understand the question", note: "extended warranty, eligibility", ms: 650 },
            { label: "Search the knowledge base", note: "{n} candidates", count: 18, ms: 850 },
            { label: "Compare who it applies to", note: "Members and business customers have different rules", ms: 900, warn: true },
          ],
        },
        {
          answer: [["Yes, but the rules depend on who you are. Which one applies to you?"]],
          quick: ["Member", "Business customer"],
          pick: 0,
        },
        { user: "Member" },
        {
          think: [
            { label: "Focus on the member terms", note: "Warranty policy §2.1", ms: 800 },
            { label: "Write the answer", ms: 450 },
          ],
        },
        {
          answer: [
            ["Members can add a one-year extended warranty within "],
            ["30 days", true],
            [" of purchase. Request it under “My orders” in your member centre."],
          ],
          cites: ["Warranty policy §2.1"],
          conf: 0.88,
        },
      ],
      abstain: [
        { user: "Are you opening a store in Kaohsiung next year?" },
        {
          think: [
            { label: "Understand the question", note: "store openings, Kaohsiung", ms: 650 },
            { label: "Search the knowledge base", note: "{n} candidates", count: 9, ms: 850 },
            { label: "Weigh the evidence", note: "Top relevance 0.31, below the 0.55 threshold", ms: 900, warn: true },
          ],
        },
        {
          answer: [["I can't find anything about next year's store openings in the material I have, so I'd rather not guess. If you like, I can pass this to someone who can confirm."]],
          flag: "Logged as a knowledge gap so an admin can add the answer",
          conf: 0.31,
          low: true,
        },
      ],
    };
    const scenarios = () => (isEN() ? SCENARIOS_EN : SCENARIOS_ZH);

    // boot.js loads widget.js, which exposes the widget class as window.EmbAIdWidget.
    const widgetClass = () =>
      new Promise((resolve) => {
        const check = () => (window.EmbAIdWidget?.ChatWidget ? resolve(window.EmbAIdWidget.ChatWidget) : setTimeout(check, 60));
        check();
      });
    const demoConfig = () => ({
      primaryColor: "#0033ff",
      botName: "EmbAId Agent",
      greeting: T("嗨，有什麼可以幫你的嗎？", "Hi, how can I help?"),
      starterQuestions: [],
      theme: root.dataset.theme === "light" ? "light" : "dark",
      locale: isEN() ? "en" : "zh-TW",
    });

    // Replies for the scenario being played, in order. The widget asks; the script answers
    // through the same stream events the API sends.
    let replies = [];
    const transport = async (_message, _id, h) => {
      const reply = replies.shift();
      if (!reply) {
        h.onDone?.({ answered: true, confidence: null, flagged: false });
        return;
      }
      const [thought, answer] = reply;
      h.onConversation?.("demo", "");
      for (const step of thought.think) {
        const note = step.note ? step.note.replace("{n}", String(step.count ?? "")) : "";
        // only a refusal counts as "not enough evidence"; a follow-up question is not one
        h.onStatus?.("demo", { label: step.label, note, warn: Boolean(step.warn && answer.low) });
        if (!reduceMotion) await sleep(step.ms);
      }
      h.onToken?.(answer.answer.map(([segment, bold]) => (bold ? `**${segment}**` : segment)).join(""));
      if (answer.cites) {
        h.onCitations?.(answer.cites.map((title) => ({ chunkId: "", documentId: "", title, url: null, snippet: "" })));
      }
      if (answer.quick) h.onQuickReplies?.(answer.quick);
      h.onDone?.({ answered: !answer.low, confidence: answer.conf ?? null, flagged: Boolean(answer.flag) });
    };

    const widgetReady = widgetClass().then(async (ChatWidget) => {
      const widget = new ChatWidget({
        apiKey: "",
        projectId: "demo",
        apiUrl: "",
        mode: "inline",
        fetchConfig: false,
        persist: false,
        transport,
        config: demoConfig(),
      });
      await widget.mount(think);
      return widget;
    });

    let run = 0;
    let auto = true;
    let visible = false;
    let waiters = [];
    const order = ["answer", "clarify", "abstain"];
    const cancelled = (id) => id !== run;
    const wait = async (id, ms) => {
      await sleep(ms);
      if (cancelled(id)) throw new Error("cancel");
    };
    const whenVisible = () => (visible ? Promise.resolve() : new Promise((r) => waiters.push(r)));

    const play = async (name, id) => {
      const widget = await widgetReady;
      if (cancelled(id)) return;
      widget.update(demoConfig()); // fresh conversation, current theme and language
      const steps = scenarios()[name];
      const asks = [];
      replies = [];
      steps.forEach((step, i) => {
        if (step.user) asks.push(step.user);
        else if (step.think) replies.push([step, steps[i + 1]]);
      });
      for (let i = 0; i < asks.length; i++) {
        // the first question is typed; a later one is the visitor tapping a follow-up choice
        await wait(id, i === 0 ? 500 : 1400);
        await widget.ask(asks[i], { typed: i === 0 });
        while (widget.isBusy) await wait(id, 120);
      }
    };

    let tabs;
    let playing = "answer";
    const start = async (name) => {
      playing = name;
      const id = ++run;
      try {
        await whenVisible();
        if (cancelled(id)) return;
        await play(name, id);
        if (!auto) return;
        await wait(id, 5200);
        await whenVisible();
        if (cancelled(id)) return;
        const next = order[(order.indexOf(name) + 1) % order.length];
        tabs.select(tabs.buttons.find((b) => b.dataset.scenario === next), false);
      } catch {
        void 0;
      }
    };

    tabs = segmented(document.querySelector("[data-think-tabs]"), "[data-scenario]", ".seg__pill", (button, fromUser) => {
      if (fromUser) auto = true;
      start(button.dataset.scenario);
    });

    new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) {
          waiters.forEach((r) => r());
          waiters = [];
        }
      },
      { threshold: 0.35 },
    ).observe(think);

    start("answer");
    // a language or theme switch replays the current scenario in the new look
    I18N.onChange(() => start(playing));
    new MutationObserver(() => start(playing)).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  }
})();
