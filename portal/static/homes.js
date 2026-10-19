(async function () {
  const { esc, money, api } = Ownly;
  Ownly.nav("homes");
  const form = document.getElementById("filters");
  const grid = document.getElementById("grid");

  const { areas, property_types } = await api("/api/areas");
  form.elements.area.insertAdjacentHTML("beforeend",
    areas.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join(""));
  form.elements.type.insertAdjacentHTML("beforeend",
    property_types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join(""));

  // Filters live in the URL so a filtered view can be bookmarked or shared.
  const params = new URLSearchParams(location.search);
  for (const el of form.elements) if (params.has(el.name)) el.value = params.get(el.name);

  const map = L.map("browse-map", { scrollWheelZoom: false }).setView([42.03, -93.64], 12);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors", maxZoom: 18,
  }).addTo(map);
  map.on("focus", () => map.scrollWheelZoom.enable());
  map.on("blur", () => map.scrollWheelZoom.disable());
  const layer = L.layerGroup().addTo(map);
  let markers = {};

  function highlight(id, on) {
    const mk = markers[id];
    if (mk) mk.setStyle(on ? { radius: 11, color: "#f59e0b", weight: 3 } : { radius: 8, color: "#ffffff", weight: 2 });
    if (mk && on) mk.bringToFront();
    grid.querySelector(`[data-id="${id}"]`)?.classList.toggle("is-hover", on);
  }

  async function load() {
    const q = new URLSearchParams();
    for (const el of form.elements) if (el.name && el.value) q.set(el.name, el.value);
    if (q.get("sort") === "newest") q.delete("sort");
    history.replaceState(null, "", q.toString() ? `?${q}` : location.pathname);
    grid.style.opacity = .5;
    const { listings } = await api(`/api/listings?${q}`);
    grid.style.opacity = "";

    document.getElementById("result-count").textContent =
      listings.length ? `${listings.length} home${listings.length > 1 ? "s" : ""} for sale` : "";
    grid.innerHTML = listings.length ? listings.map(Ownly.listingCard).join("") : `
      <div class="card empty-state" style="grid-column:1/-1">
        <h2>No homes match these filters</h2>
        <p>Try a different neighbourhood or price, or be the first to list a home here.</p>
        <a class="btn" href="/sell.html${form.elements.area.value ? `?area=${encodeURIComponent(form.elements.area.value)}` : ""}">List a home</a>
      </div>`;

    layer.clearLayers();
    markers = {};
    for (const l of listings) {
      const mk = L.circleMarker([l.lat, l.lon], {
        radius: 8, color: "#ffffff", weight: 2, fillColor: "#1f5fbf", fillOpacity: 1,
      }).addTo(layer);
      mk.bindTooltip(`<div class="town-tip"><strong>${money(l.price)}</strong>${esc(l.title)}</div>`,
        { direction: "top", offset: [0, -6] });
      mk.on("click", () => { location.href = `/home.html?id=${l.id}`; });
      mk.on("mouseover", () => highlight(l.id, true));
      mk.on("mouseout", () => highlight(l.id, false));
      markers[l.id] = mk;
    }
    if (listings.length) map.fitBounds(L.latLngBounds(listings.map(l => [l.lat, l.lon])).pad(0.3), { maxZoom: 14 });
  }

  grid.addEventListener("mouseover", e => {
    const card = e.target.closest(".listing-card");
    if (card) highlight(+card.dataset.id, true);
  });
  grid.addEventListener("mouseout", e => {
    const card = e.target.closest(".listing-card");
    if (card && !card.contains(e.relatedTarget)) highlight(+card.dataset.id, false);
  });
  form.addEventListener("change", load);
  form.addEventListener("submit", e => e.preventDefault());
  load();
})();
