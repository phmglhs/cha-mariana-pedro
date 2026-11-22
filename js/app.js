(function () {
  const api = window.SiteAPI;
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  const state = {
    event: null,
    pendingGift: null,
    pendingMethod: "pix",
    lastPayload: "",
    lastGiftPayload: "",
    sortMode: "padrao",
    searchQuery: "",
    category: "todos",
  };

  const MAP_ADDRESS = "Rua Psi, 185 - Caiçara, Belo Horizonte - MG, 30775-460";
  const MAP_QUERY = encodeURIComponent(MAP_ADDRESS);
  const MAP_EMBED = "https://maps.google.com/maps?q=" + MAP_QUERY + "&z=17&hl=pt-BR&output=embed";
  const MAP_GOOGLE = "https://www.google.com/maps/search/?api=1&query=" + MAP_QUERY;
  const MAP_WAZE = "https://waze.com/ul?q=" + MAP_QUERY + "&navigate=yes";

  const SORT_KEY = "cha-mp-gift-sort";
  const SORT_MODES = ["padrao", "menor", "maior"];

  const giftGrid = document.getElementById("gift-grid");
  const toastEl = document.getElementById("toast");
  const pixModal = document.getElementById("modal-pix");
  const confirmModal = document.getElementById("modal-confirm");
  let toastTimer;

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2800);
  }

  function setText(selector, value, isHtml) {
    document.querySelectorAll(selector).forEach((el) => {
      if (isHtml) el.innerHTML = value;
      else el.textContent = value;
    });
  }

  function openModal(modal) {
    modal.hidden = false;
    const focusable = modal.querySelector("input, button");
    if (focusable) focusable.focus();
  }

  function closeModal(modal) {
    if (modal) modal.hidden = true;
    else {
      pixModal.hidden = true;
      confirmModal.hidden = true;
    }
  }

  function pixOptions(extra) {
    const pix = state.event?.pix || {};
    return {
      key: pix.key,
      name: pix.recipientName || state.event?.couple?.names,
      city: pix.city || state.event?.venue?.city,
      ...extra,
    };
  }

  async function renderQr(imgSelector, payload) {
    const url = await window.PixBR.toDataUrl(payload);
    document.querySelectorAll(imgSelector).forEach((img) => { img.src = url; });
  }

  async function refreshCashQr() {
    try {
      state.lastPayload = window.PixBR.buildPayload(pixOptions());
      await renderQr("[data-pix-qr]", state.lastPayload);
    } catch (err) {
      console.warn(err);
    }
  }

  function startCountdown(iso) {
    const root = document.getElementById("countdown");
    const target = new Date(iso).getTime();
    const daysEl = root.querySelector("[data-days]");
    const hoursEl = root.querySelector("[data-hours]");
    const minutesEl = root.querySelector("[data-minutes]");
    const secondsEl = root.querySelector("[data-seconds]");

    function tick() {
      const diff = target - Date.now();
      if (diff <= 0) {
        root.innerHTML = '<p class="hero-date">É hoje! A celebração começou.</p>';
        return;
      }
      const total = Math.floor(diff / 1000);
      daysEl.textContent = Math.floor(total / 86400);
      hoursEl.textContent = Math.floor((total % 86400) / 3600);
      minutesEl.textContent = Math.floor((total % 3600) / 60);
      secondsEl.textContent = total % 60;
    }
    tick();
    setInterval(tick, 1000);
  }

  function fillEvent(event) {
    const { couple, event: ev, venue, copy, pix } = event;
    document.title = `${ev.title} · ${couple.names}`;
    setText("[data-event-title]", ev.title);
    setText("[data-couple-names]", couple.names);
    setText("[data-hero-date]", `${ev.weekdayDisplay}, ${ev.dateDisplay} · ${ev.timeDisplay}`);
    setText("[data-hero-lead]", copy.heroSubtitle);
    setText("[data-date-full]", `${ev.weekdayDisplay}, ${ev.dateDisplay}`);
    setText("[data-time-full]", `Às ${ev.timeDisplay}`);
    setText("[data-venue-name]", `${venue.name} — Condomínio Exclusive Montreal`);
    setText("[data-venue-address]", `${venue.street} — ${venue.neighborhood}<br>${venue.city} — ${venue.state}, 30775-460`, true);
    setText("[data-hero-place]", `${venue.name} · Condomínio Exclusive Montreal · ${venue.street} · ${venue.neighborhood} · ${venue.city}`);
    setText("[data-pix-intro]", copy.pixIntro);
    setText("[data-pix-key], [data-modal-key]", pix.key);
    setText("[data-pix-notice], [data-modal-notice]", pix.isPlaceholder ? copy.pixPlaceholderNotice : "");

    document.querySelectorAll("[data-pix-badge]").forEach((el) => {
      el.hidden = !pix.isPlaceholder;
    });
    document.querySelectorAll("[data-maps-link]").forEach((a) => { a.href = MAP_GOOGLE; });
    document.querySelectorAll("[data-waze-link]").forEach((a) => { a.href = MAP_WAZE; });
    const iframe = document.getElementById("mapa");
    if (iframe) iframe.src = MAP_EMBED;

    const banner = document.getElementById("preview-banner");
    if (banner) banner.hidden = !api.isMock();

    event.gifts = (event.gifts || []).map((gift) => Object.assign({}, gift, {
      category: window.giftCategory ? window.giftCategory(gift) : (gift.category || ""),
    }));

    startCountdown(ev.datetimeISO);
    renderCategoryChips(event.gifts);
    renderGifts(event.gifts);
    refreshCashQr();
  }

  function readStoredSort() {
    try {
      const stored = localStorage.getItem(SORT_KEY);
      if (SORT_MODES.includes(stored)) return stored;
    } catch {}
    return "padrao";
  }

  function persistSort(mode) {
    try { localStorage.setItem(SORT_KEY, mode); } catch {}
  }

  function numericPrice(gift) {
    const raw = gift && gift.price;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    let normalized = trimmed.replace(/[^\d,.-]/g, "");
    if (!normalized) return null;
    if (normalized.includes(",") && normalized.includes(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else if (normalized.includes(",")) {
      normalized = normalized.replace(",", ".");
    }
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function matchingGifts(gifts) {
    let list = gifts || [];
    if (state.category && state.category !== "todos") {
      list = list.filter((gift) => gift.category === state.category);
    }
    const query = normalizeText(state.searchQuery);
    if (!query) return list;
    return list.filter((gift) => normalizeText(gift.name).includes(query));
  }

  function renderCategoryChips(gifts) {
    const root = document.getElementById("gift-categories");
    if (!root) return;
    const order = window.GIFT_CATEGORY_ORDER || [];
    const present = new Set((gifts || []).map((gift) => gift.category).filter(Boolean));
    const labels = ["Todos", ...order.filter((name) => present.has(name))];
    root.innerHTML = "";
    labels.forEach((label) => {
      const value = label === "Todos" ? "todos" : label;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gift-cat-chip";
      btn.dataset.category = value;
      btn.textContent = label;
      const active = state.category === value;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
      btn.addEventListener("click", () => applyCategory(value));
      root.appendChild(btn);
    });
  }

  function applyCategory(value) {
    state.category = value;
    document.querySelectorAll(".gift-cat-chip").forEach((btn) => {
      const active = btn.dataset.category === state.category;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
    if (state.event) renderGifts(state.event.gifts);
  }

  function hideGiftStatus() {
    const status = document.getElementById("gift-status");
    if (status) status.hidden = true;
  }

  function showGiftError(message) {
    const status = document.getElementById("gift-status");
    if (!status) return;
    status.hidden = false;
    status.classList.add("is-error");
    const text = status.querySelector(".gift-loading");
    if (text) text.textContent = message;
    const skeleton = status.querySelector(".gift-skeleton-grid");
    if (skeleton) skeleton.hidden = true;
    if (giftGrid) giftGrid.hidden = true;
    const emptyEl = document.getElementById("gift-empty");
    if (emptyEl) emptyEl.hidden = true;
  }

  function syncSearchClear() {
    const input = document.getElementById("gift-search");
    const clear = document.getElementById("gift-search-clear");
    if (!clear) return;
    clear.hidden = !normalizeText(input && input.value);
  }

  function applySearch(value) {
    state.searchQuery = value;
    syncSearchClear();
    if (state.event) renderGifts(state.event.gifts);
  }

  function sortedGifts(gifts, mode) {
    const list = gifts.map((gift, index) => ({ gift, index }));
    if (mode === "menor" || mode === "maior") {
      const dir = mode === "menor" ? 1 : -1;
      list.sort((a, b) => {
        const pa = numericPrice(a.gift);
        const pb = numericPrice(b.gift);
        if (pa == null && pb == null) return a.index - b.index;
        if (pa == null) return 1;
        if (pb == null) return -1;
        if (pa !== pb) return (pa - pb) * dir;
        return a.index - b.index;
      });
    }
    return list.map((item) => item.gift);
  }

  function syncSortButtons() {
    document.querySelectorAll(".gift-sort-btn").forEach((btn) => {
      const active = btn.dataset.sort === state.sortMode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", String(active));
    });
    const dot = document.querySelector(".gift-sort-dot");
    if (dot) dot.hidden = state.sortMode === "padrao";
    const toggle = document.querySelector(".gift-sort-toggle");
    if (toggle) toggle.classList.toggle("is-filtered", state.sortMode !== "padrao");
  }

  function isSortMenuOpen() {
    const menu = document.getElementById("gift-sort-menu");
    return !!(menu && !menu.hidden);
  }

  function closeSortMenu(opts) {
    const toggle = document.querySelector(".gift-sort-toggle");
    const menu = document.getElementById("gift-sort-menu");
    const filter = document.querySelector(".gift-sort-filter");
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    filter && filter.classList.remove("is-open");
    const section = document.querySelector(".section-gifts");
    if (section) section.classList.remove("has-sort-open");
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      if (opts && opts.focus) toggle.focus();
    }
  }

  function openSortMenu(opts) {
    const toggle = document.querySelector(".gift-sort-toggle");
    const menu = document.getElementById("gift-sort-menu");
    const filter = document.querySelector(".gift-sort-filter");
    if (!menu || !toggle) return;
    menu.hidden = false;
    filter && filter.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    const section = document.querySelector(".section-gifts");
    if (section) section.classList.add("has-sort-open");
    if (opts && opts.focusItem) {
      const active = menu.querySelector(".gift-sort-btn.is-active") || menu.querySelector(".gift-sort-btn");
      if (active) active.focus();
    }
  }

  function applySort(mode) {
    if (!SORT_MODES.includes(mode)) return;
    if (mode !== state.sortMode) {
      state.sortMode = mode;
      persistSort(mode);
      syncSortButtons();
      if (state.event) renderGifts(state.event.gifts);
    }
    closeSortMenu({ focus: true });
  }

  function renderGifts(gifts) {
    hideGiftStatus();
    giftGrid.innerHTML = "";
    const list = sortedGifts(matchingGifts(gifts), state.sortMode);
    const emptyEl = document.getElementById("gift-empty");
    if (emptyEl) emptyEl.hidden = list.length > 0;
    if (!list.length) {
      giftGrid.hidden = true;
      return;
    }
    giftGrid.hidden = false;
    list.forEach((gift) => {
      const card = document.createElement("article");
      card.className = "gift-card" + (gift.purchased ? " is-purchased" : "");
      card.dataset.id = gift.id;
      card.innerHTML = `
        <div class="gift-image-wrap">
          <img src="${gift.image}" alt="${gift.name}" />
          ${gift.purchased ? '<span class="ribbon">Já presenteado</span>' : ""}
        </div>
        <div class="gift-body">
          <h3>${gift.name}</h3>
          <p class="gift-desc">${gift.description || ""}</p>
          <p class="gift-price">${money.format(gift.price)}</p>
          ${gift.purchased ? `<p class="purchased-by">Presenteado por ${escapeHtml(gift.purchasedBy || "alguém especial")}</p>` : `
            <div class="gift-actions">
              <a class="btn btn-primary" data-action="store" href="${gift.storeUrl}" target="_blank" rel="noopener noreferrer"><span class="btn-label-full">Comprar na loja</span><span class="btn-label-short">Loja</span></a>
              <button class="btn btn-secondary" type="button" data-action="pix"><span class="btn-label-full">Presentear via Pix</span><span class="btn-label-short">Pix</span></button>
              <button class="gift-confirm-link" type="button" data-action="confirm"><span class="btn-label-full">Eu já escolhi esse</span><span class="btn-label-short">Já escolhi</span></button>
            </div>
          `}
        </div>
      `;
      if (!gift.purchased) {
        card.querySelector('[data-action="pix"]').addEventListener("click", () => openPixModal(gift));
        card.querySelector('[data-action="store"]').addEventListener("click", () => {
          state.pendingGift = gift;
          state.pendingMethod = "store";
        });
        card.querySelector('[data-action="confirm"]').addEventListener("click", () => openConfirmModal(gift, "store"));
      }
      giftGrid.appendChild(card);
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function openPixModal(gift) {
    state.pendingGift = gift;
    state.pendingMethod = "pix";
    pixModal.querySelector("#pix-modal-title").textContent = gift.name;
    pixModal.querySelector("[data-modal-price]").textContent = money.format(gift.price);
    try {
      state.lastGiftPayload = window.PixBR.buildPayload(pixOptions({
        amount: gift.price,
        description: gift.name,
        txid: gift.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***",
      }));
      await renderQr("[data-modal-qr]", state.lastGiftPayload);
    } catch (err) {
      console.warn(err);
    }
    openModal(pixModal);
  }

  function openConfirmModal(gift, method) {
    state.pendingGift = gift;
    state.pendingMethod = method || state.pendingMethod || "pix";
    confirmModal.querySelector("#confirm-modal-title").textContent = `Confirmar: ${gift.name}`;
    document.getElementById("confirm-error").hidden = true;
    confirmModal.querySelector("input[name=name]").value = "";
    closeModal(pixModal);
    openModal(confirmModal);
  }

  async function copyText(text, successMessage) {
    if (!text) return showToast("Nada para copiar ainda.");
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage);
    } catch {
      showToast("Não foi possível copiar. Selecione o texto manualmente.");
    }
  }

  document.querySelectorAll("[data-copy-address]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy-text") || "";
      const original = btn.textContent;
      await copyText(text, "Endereço copiado.");
      btn.textContent = "Copiado!";
      btn.classList.add("is-copied");
      window.setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove("is-copied");
      }, 2000);
    });
  });

  document.querySelectorAll("[data-copy-pix]").forEach((btn) => {
    btn.addEventListener("click", () => copyText(state.event?.pix?.key || "", "Chave Pix copiada."));
  });
  document.querySelectorAll("[data-copy-brcode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const payload = btn.closest("#modal-pix") ? state.lastGiftPayload : state.lastPayload;
      copyText(payload, "Código Pix copiado. Cole no app do banco.");
    });
  });
  document.querySelectorAll("[data-modal-copy]").forEach((btn) => {
    btn.addEventListener("click", () => copyText(state.event?.pix?.key || "", "Chave Pix copiada."));
  });
  document.querySelector("[data-modal-confirm]").addEventListener("click", () => {
    if (state.pendingGift) openConfirmModal(state.pendingGift, "pix");
  });
  document.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", () => closeModal());
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  document.getElementById("confirm-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("confirm-error");
    const name = new FormData(e.target).get("name").toString().trim();
    if (!state.pendingGift) return;
    try {
      const result = await api.claimGift(state.pendingGift.id, { name, method: state.pendingMethod });
      const gifts = state.event.gifts.map((g) => (g.id === result.gift.id ? result.gift : g));
      state.event.gifts = gifts;
      renderGifts(gifts);
      closeModal();
      showToast("Presente marcado como já presenteado. Obrigado!");
    } catch (err) {
      if (err.status === 409 && err.data?.gift) {
        const gifts = state.event.gifts.map((g) => (g.id === err.data.gift.id ? err.data.gift : g));
        state.event.gifts = gifts;
        renderGifts(gifts);
      }
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  document.getElementById("rsvp-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("rsvp-error");
    errorEl.hidden = true;
    const form = e.target;
    const name = form.name.value.trim();
    const attendingInput = form.querySelector('input[name="attending"]:checked');
    if (!name) {
      errorEl.textContent = "Por favor, digite o seu nome.";
      errorEl.hidden = false;
      form.name.focus();
      return;
    }
    if (!attendingInput) {
      errorEl.textContent = "Por favor, escolha se você poderá estar presente.";
      errorEl.hidden = false;
      const first = form.querySelector('input[name="attending"]');
      if (first) first.focus();
      return;
    }
    const payload = {
      name,
      guests: 1,
      attending: attendingInput.value === "true",
      message: form.message.value.trim(),
    };
    try {
      const result = await api.submitRsvp(payload);
      form.hidden = true;
      const success = document.getElementById("rsvp-success");
      const text = document.getElementById("rsvp-success-text");
      text.textContent = result.rsvp.attending
        ? `Obrigado, ${result.rsvp.name}! Registramos a sua presença.`
        : `Obrigado, ${result.rsvp.name}! Sentiremos sua falta, mas agradecemos por avisar.`;
      success.hidden = false;
      success.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    }
  });

  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  toggle.addEventListener("click", () => {
    const open = header.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
  });
  document.querySelectorAll(".site-nav a").forEach((a) => {
    a.addEventListener("click", () => {
      header.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });


  state.sortMode = readStoredSort();
  syncSortButtons();

  const sortToggle = document.querySelector(".gift-sort-toggle");
  const sortMenu = document.getElementById("gift-sort-menu");
  const sortFilter = document.querySelector(".gift-sort-filter");

  const searchInput = document.getElementById("gift-search");
  const searchClear = document.getElementById("gift-search-clear");
  if (searchInput) {
    searchInput.addEventListener("input", () => applySearch(searchInput.value));
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && searchInput.value) {
        event.preventDefault();
        searchInput.value = "";
        applySearch("");
      }
    });
  }
  if (searchClear && searchInput) {
    searchClear.addEventListener("click", () => {
      searchInput.value = "";
      applySearch("");
      searchInput.focus();
    });
  }
  syncSearchClear();

  if (sortToggle && sortMenu) {
    sortToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      if (isSortMenuOpen()) closeSortMenu();
      else openSortMenu({ focusItem: event.detail === 0 });
    });
    sortMenu.querySelectorAll(".gift-sort-btn").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        applySort(btn.dataset.sort);
      });
    });
    document.addEventListener("click", (event) => {
      if (!isSortMenuOpen()) return;
      if (sortFilter && !sortFilter.contains(event.target)) closeSortMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (!isSortMenuOpen()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeSortMenu({ focus: true });
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
        const items = [...sortMenu.querySelectorAll(".gift-sort-btn")];
        if (!items.length) return;
        event.preventDefault();
        const current = items.indexOf(document.activeElement);
        let next = 0;
        if (event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
        else if (event.key === "ArrowUp") next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
        else if (event.key === "End") next = items.length - 1;
        items[next].focus();
      }
    });
  }

  api.getEvent().then((event) => {
    state.event = event;
    fillEvent(event);
  }).catch(() => {
    showToast("Não foi possível carregar os dados do evento.");
    showGiftError("Não foi possível carregar a lista de presentes. Atualize a página e tente de novo.");
  });
})();
