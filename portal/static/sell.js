(async function () {
  const { esc, money, api } = Ownly;
  const editId = Ownly.param("id");
  const state = await Ownly.nav("sell");

  if (!state.user) {
    document.getElementById("gate").hidden = false;
    document.getElementById("gate-signin").href = Ownly.signInLink();
    document.getElementById("gate-register").href = Ownly.signInLink() + "&mode=register";
    return;
  }

  const form = document.getElementById("sell-form");
  const el = name => form.elements[name];
  document.getElementById("sell-layout").hidden = false;

  const { areas, property_types, quality_names } = await api("/api/areas");
  const areaById = Object.fromEntries(areas.map(a => [a.id, a]));
  el("area").insertAdjacentHTML("beforeend",
    [...areas].sort((a, b) => a.name.localeCompare(b.name))
      .map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join(""));
  el("property_type").insertAdjacentHTML("beforeend",
    property_types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join(""));
  el("year_built").max = new Date().getFullYear() + 2;
  el("quality").insertAdjacentHTML("beforeend",
    quality_names.map((q, i) => `<option value="${i + 1}">${esc(q)}</option>`).join(""));

  if (editId) {
    let listing;
    try {
      ({ listing } = await api(`/api/listings/${encodeURIComponent(editId)}`));
    } catch (err) {
      form.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
      return;
    }
    if (!listing.is_owner) {
      form.innerHTML = `<p class="form-error">Only the seller can edit this listing.</p>`;
      return;
    }
    document.title = "Ownly · Edit listing";
    document.getElementById("sell-title").textContent = "Edit your listing";
    document.getElementById("sell-sub").textContent = listing.title;
    document.getElementById("submit").textContent = "Save changes";
    document.getElementById("cancel").href = `/home.html?id=${listing.id}`;
    for (const [k, v] of Object.entries(listing)) {
      const input = el(k);
      if (!input || !input.name) continue;
      if (input.type === "checkbox") input.checked = !!v;
      else input.value = v ?? "";
    }
  } else {
    // Prefill from the estimator ("List a home like this") and the account.
    const p = new URLSearchParams(location.search);
    if (areaById[p.get("area")]) el("area").value = p.get("area");
    if (property_types.includes(p.get("type"))) el("property_type").value = p.get("type");
    for (const [param, name] of [["sqft", "sqft"], ["year", "year_built"], ["beds", "bedrooms"],
                                 ["baths", "bathrooms"], ["garage", "garage"], ["quality", "quality"]]) {
      if (p.get(param) && Number.isFinite(+p.get(param))) el(name).value = p.get(param);
    }
    el("contact_name").value = state.user.name || "";
    el("contact_email").value = state.user.email;
  }

  // ---- live estimate ----
  const num = v => v === "" ? null : Number(v);
  let estimate = null, timer, seq = 0;

  function renderCompare() {
    const box = document.getElementById("est-compare");
    const hint = document.getElementById("price-hint");
    const price = +el("price").value;
    document.getElementById("use-estimate").hidden = !estimate;
    hint.innerHTML = estimate ? `Ownly estimate: <strong>${money(estimate.estimate)}</strong>${price ? " " + Ownly.estimateChip(price, estimate.estimate) : ""}` : "";
    box.innerHTML = estimate && price ? Ownly.estimateChip(price, estimate.estimate) : "";
  }

  function refreshEstimate() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const mine = ++seq;
      const show = (price, text) => {
        document.getElementById("est-price").textContent = price;
        document.getElementById("est-range").textContent = text;
      };
      if (!el("area").value || !el("property_type").value) {
        estimate = null;
        show("—", "Choose the neighbourhood and property type, then add the details.");
        return renderCompare();
      }
      try {
        const res = await api("/api/estimate", { method: "POST", body: {
          area: el("area").value, property_type: el("property_type").value,
          sqft: num(el("sqft").value), year_built: num(el("year_built").value),
          bedrooms: num(el("bedrooms").value), bathrooms: num(el("bathrooms").value),
          garage: num(el("garage").value), quality: num(el("quality").value),
        } });
        if (mine !== seq) return;
        estimate = res.estimate ? res : null;
        if (estimate) show(money(res.estimate), `Likely between ${money(res.estimate_low)} and ${money(res.estimate_high)}`);
        else show("—", res.estimate_note);
      } catch (err) {
        if (mine === seq) document.getElementById("est-range").textContent = err.message;
      }
      renderCompare();
    }, 200);
  }

  for (const name of ["area", "property_type", "sqft", "year_built", "bedrooms", "bathrooms", "garage", "quality"]) {
    el(name).addEventListener("input", refreshEstimate);
  }
  el("price").addEventListener("input", renderCompare);
  document.getElementById("use-estimate").onclick = () => {
    el("price").value = estimate.estimate;
    renderCompare();
  };
  refreshEstimate();

  // ---- submit ----
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const body = {
      title: el("title").value, property_type: el("property_type").value, area: el("area").value,
      address: el("address").value, price: num(el("price").value),
      sqft: num(el("sqft").value), year_built: num(el("year_built").value),
      bedrooms: num(el("bedrooms").value), bathrooms: num(el("bathrooms").value),
      garage: num(el("garage").value), quality: num(el("quality").value),
      description: el("description").value,
      contact_name: el("contact_name").value, contact_email: el("contact_email").value,
      contact_phone: el("contact_phone").value,
    };
    const btn = document.getElementById("submit");
    btn.disabled = true;
    try {
      const res = editId
        ? await api(`/api/listings/${encodeURIComponent(editId)}`, { method: "PUT", body })
        : await api("/api/listings", { method: "POST", body });
      location.href = `/home.html?id=${res.id}${editId ? "" : "&new=1"}`;
    } catch (err) {
      if (err.status === 401) { location.href = Ownly.signInLink(); return; }
      Ownly.showErrors(form, err);
      btn.disabled = false;
    }
  });
})();
