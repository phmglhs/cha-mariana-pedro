(function (global) {
  const STORAGE_KEY = "cha-mp-mock-store";
  const config = () => global.SITE_CONFIG || {};

  function scriptUrl() {
    return String(config().appsScriptUrl || "").trim();
  }

  function isMock() {
    return !scriptUrl();
  }

  function redactGift(gift) {
    if (!gift || typeof gift !== "object") return gift;
    const copy = { ...gift };
    delete copy.purchasedBy;
    return copy;
  }

  function redactEvent(data) {
    if (!data || typeof data !== "object") return data;
    if (!Array.isArray(data.gifts)) return data;
    return { ...data, gifts: data.gifts.map(redactGift) };
  }

  function loadMockStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || { rsvps: [], purchases: {} };
    } catch {
      return { rsvps: [], purchases: {} };
    }
  }

  function saveMockStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function cloneEvent() {
    const base = JSON.parse(JSON.stringify(global.MOCK_EVENT));
    const store = loadMockStore();
    base.gifts = base.gifts.map((gift) => {
      const purchase = store.purchases[gift.id];
      if (!purchase) return { ...gift, purchased: false, purchasedAt: null, purchaseMethod: null };
      return { ...gift, purchased: true, purchasedAt: purchase.at, purchaseMethod: purchase.method };
    });
    return base;
  }

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = "chaJsonp_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("A planilha demorou para responder."));
      }, 15000);
      function cleanup() {
        clearTimeout(timer);
        delete global[cb];
        script.remove();
      }
      global[cb] = (data) => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error("Não foi possível ler a planilha.")); };
      script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + encodeURIComponent(cb);
      document.head.appendChild(script);
    });
  }

  async function getEvent() {
    if (isMock()) return cloneEvent();
    const url = scriptUrl();
    try {
      const res = await fetch(url, { method: "GET", credentials: "omit" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return redactEvent(data);
    } catch (err) {
      const data = await jsonp(url);
      if (data && data.error) throw new Error(data.error);
      return redactEvent(data);
    }
  }

  async function post(payload) {
    if (isMock()) throw new Error("Modo de prévia.");
    const res = await fetch(scriptUrl(), {
      method: "POST",
      redirect: "follow",
      credentials: "omit",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data && data.gift) data.gift = redactGift(data.gift);
    if (data.error && !data.gift) {
      const error = new Error(data.error);
      error.data = data;
      throw error;
    }
    if (data.error && data.gift) {
      const error = new Error(data.error);
      error.status = 409;
      error.data = data;
      throw error;
    }
    return data;
  }

  async function submitRsvp(payload) {
    if (isMock()) {
      if (!payload.name || !payload.name.trim()) throw new Error("Informe o seu nome.");
      if (!Number(payload.guests) || Number(payload.guests) < 1) throw new Error("Informe o número de pessoas (pelo menos 1).");
      const store = loadMockStore();
      const guests = Math.min(Math.round(Number(payload.guests)), 20);
      store.rsvps.push({ ...payload, guests, createdAt: new Date().toISOString() });
      saveMockStore(store);
      return { ok: true, rsvp: { name: payload.name.trim(), attending: Boolean(payload.attending), guests } };
    }
    return post({ action: "rsvp", ...payload });
  }

  async function claimGift(id, payload) {
    if (isMock()) {
      const name = String(payload.name || "").trim();
      if (!name) throw new Error("Informe o seu nome para confirmar.");
      const store = loadMockStore();
      if (store.purchases[id]) {
        const event = cloneEvent();
        const error = new Error("Este presente já foi escolhido por outra pessoa.");
        error.status = 409;
        error.data = { gift: event.gifts.find((g) => g.id === id) };
        throw error;
      }
      store.purchases[id] = {
        name,
        message: String(payload.message || "").trim(),
        method: payload.method === "store" ? "store" : "pix",
        at: new Date().toISOString()
      };
      saveMockStore(store);
      return { ok: true, gift: cloneEvent().gifts.find((g) => g.id === id) };
    }
    const data = await post({
      action: "comprar",
      id,
      name: payload.name,
      method: payload.method,
      message: payload.message || ""
    });
    if (data && data.gift) data.gift = redactGift(data.gift);
    return data;
  }

  global.SiteAPI = { getEvent, submitRsvp, claimGift, isMock };
})(window);
