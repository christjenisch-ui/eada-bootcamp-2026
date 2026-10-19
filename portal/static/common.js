// Shared by every Ownly page: API calls, formatting, the top navigation and listing cards.
const Ownly = (() => {
  const esc = s => String(s ?? "").replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = v => "$" + Math.round(v).toLocaleString("en-US");
  const param = name => new URLSearchParams(location.search).get(name);
  const here = () => location.pathname + location.search + location.hash;

  async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const err = new Error(data.error || `Something went wrong (${res.status}).`);
      err.status = res.status;
      err.fields = data.fields || {};
      throw err;
    }
    return data;
  }

  let mePromise = null;
  const me = (refresh = false) => {
    if (!mePromise || refresh) mePromise = api("/api/me").catch(() => ({ user: null, unread: 0 }));
    return mePromise;
  };

  const LOGO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5.5v-5.5h-5V21H4a1 1 0 0 1-1-1z" fill="currentColor"/></svg>`;
  const LINKS = [["index", "/", "Estimate"], ["homes", "/homes.html", "Browse homes"], ["sell", "/sell.html", "Sell"]];

  async function nav(active, { refresh = false } = {}) {
    const el = document.getElementById("topnav");
    el.className = "topnav";
    const draw = state => {
      const user = state && state.user;
      const right = !state ? "" : user
        ? `<a href="/account.html#inbox" class="${active === "inbox" ? "is-active" : ""}">Inbox${state.unread ? `<span class="count" aria-label="${state.unread} unread">${state.unread}</span>` : ""}</a>
           <a href="/account.html" class="wide-only ${active === "account" ? "is-active" : ""}">My listings</a>
           <button type="button" class="nav-signout wide-only" id="nav-signout">Sign out</button>`
        : location.pathname === "/signin.html" ? ""
        : `<a class="btn btn-nav" href="/signin.html?next=${encodeURIComponent(here())}">Sign in</a>`;
      el.innerHTML = `<div class="wrap topnav-inner">
        <a class="brand" href="/"><span class="brand-mark">${LOGO}</span>Ownly</a>
        <div class="navlinks">${LINKS.map(([key, href, label]) =>
          `<a href="${href}" class="${key === active ? "is-active" : ""}">${label}</a>`).join("")}</div>
        <div class="nav-right">${right}</div></div>`;
      const out = document.getElementById("nav-signout");
      if (out) out.onclick = signOut;
    };
    draw(null);
    const state = await me(refresh);
    draw(state);
    return state;
  }

  async function signOut() {
    await api("/api/logout", { method: "POST", body: {} }).catch(() => {});
    location.href = "/";
  }

  // Price vs. Ownly estimate, as a small labelled chip (never colour alone).
  function estimateChip(price, estimate) {
    if (!estimate) return `<span class="chip chip-neutral">No Ownly estimate</span>`;
    const diff = (price - estimate) / estimate * 100;
    if (Math.abs(diff) < 5) return `<span class="chip chip-neutral">≈ Ownly estimate</span>`;
    return diff < 0
      ? `<span class="chip chip-good">↓ ${Math.round(-diff)}% below estimate</span>`
      : `<span class="chip chip-neutral">↑ ${Math.round(diff)}% above estimate</span>`;
  }

  const HOUSE_ART = `<svg viewBox="0 0 64 48" aria-hidden="true"><path d="M10 24 32 7l22 17v19a2 2 0 0 1-2 2H39V32H25v13H12a2 2 0 0 1-2-2z" fill="currentColor" opacity=".9"/><rect x="40" y="10" width="6" height="10" rx="1" fill="currentColor" opacity=".6"/></svg>`;

  function photo(listing, big = false) {
    return `<div class="photo photo-${esc(listing.property_type).toLowerCase()}${big ? " photo-big" : ""}">
      ${HOUSE_ART}<span class="photo-type">${esc(listing.property_type)}</span></div>`;
  }

  function facts(l) {
    return [`${l.bedrooms} bed`, `${l.bathrooms} bath`, `${l.sqft.toLocaleString("en-US")} sq ft`,
            `built ${l.year_built}`].join(" · ");
  }

  function listingCard(l) {
    return `<a class="listing-card card" href="/home.html?id=${l.id}" data-id="${l.id}">
      ${photo(l)}
      <div class="listing-body">
        <div class="listing-price">${money(l.price)}</div>
        ${estimateChip(l.price, l.estimate)}
        <div class="listing-title">${esc(l.title)}</div>
        <div class="listing-meta">${esc(l.address)} · ${esc(l.area_name)}</div>
        <div class="listing-facts">${facts(l)}</div>
      </div></a>`;
  }

  function timeAgo(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  // Show API field errors next to the matching inputs in a form.
  function showErrors(form, err) {
    form.querySelectorAll(".field-error").forEach(p => { p.textContent = ""; });
    form.querySelectorAll("[aria-invalid]").forEach(i => i.removeAttribute("aria-invalid"));
    const banner = form.querySelector(".form-error");
    if (banner) { banner.textContent = err ? err.message : ""; banner.hidden = !err; }
    if (!err) return;
    let first = null;
    for (const [name, msg] of Object.entries(err.fields || {})) {
      const input = form.elements[name];
      const slot = form.querySelector(`[data-error-for="${name}"]`);
      if (slot) slot.textContent = msg;
      if (input && input.setAttribute) { input.setAttribute("aria-invalid", "true"); first = first || input; }
    }
    (first || banner)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const signInLink = () => `/signin.html?next=${encodeURIComponent(here())}`;

  return { esc, money, param, api, me, nav, estimateChip, photo, facts, listingCard, timeAgo, showErrors, signInLink };
})();
