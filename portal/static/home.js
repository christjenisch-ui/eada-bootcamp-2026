(async function () {
  const { esc, money, api } = Ownly;
  const root = document.getElementById("detail");
  const id = Ownly.param("id");
  const state = await Ownly.nav("homes");

  let listing;
  try {
    ({ listing } = await api(`/api/listings/${encodeURIComponent(id)}`));
  } catch (err) {
    root.innerHTML = `<div class="card empty-state"><h2>Listing not found</h2>
      <p>${esc(err.message)}</p><a class="btn" href="/homes.html">Browse homes</a></div>`;
    return;
  }
  const l = listing;
  document.title = `Ownly · ${l.title}`;
  const sold = l.status === "sold";
  const diff = l.estimate ? (l.price - l.estimate) / l.estimate * 100 : 0;

  const facts = [
    ["Type", l.property_type], ["Bedrooms", l.bedrooms], ["Bathrooms", l.bathrooms],
    ["Living area", `${l.sqft.toLocaleString("en-US")} sq ft`], ["Year built", l.year_built],
    ["Garage", l.garage ? `${l.garage} space${l.garage > 1 ? "s" : ""}` : "None"], ["Quality", l.quality_name],
  ];
  const estimatorLink = "/?" + new URLSearchParams({
    area: l.area, type: l.property_type, sqft: l.sqft, year: l.year_built, beds: l.bedrooms,
    baths: Math.floor(l.bathrooms), garage: l.garage, quality: l.quality,
  });

  root.innerHTML = `
    <a class="back-link" href="/homes.html">← All homes</a>
    ${Ownly.param("new") ? `<p class="notice notice-good" style="margin:0 0 16px">Your listing is live. Buyers can now find it and contact you.</p>` : ""}
    <div class="detail-head">
      <div>
        <h1>${esc(l.title)}</h1>
        <div class="listing-meta">${esc(l.address)} · ${esc(l.area_name)}</div>
      </div>
      <div class="btn-row">${sold ? `<span class="chip chip-sold">Sold</span>` : ""}<span class="chip chip-accent">${esc(l.property_type)}</span></div>
    </div>
    <div class="detail-layout">
      <div class="detail-main">
        ${Ownly.photo(l, true)}
        <section class="card">
          <h2 class="card-title">The home</h2>
          <dl class="fact-grid" style="margin-top:14px">
            ${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}
          </dl>
          ${l.description ? `<p class="description">${esc(l.description)}</p>` : ""}
        </section>
        <section class="card">
          <h2 class="card-title">Location</h2>
          <p class="muted small-text">Shown near the centre of ${esc(l.area_name)}, Ames; the exact spot isn't pinned.</p>
          <div id="detail-map"></div>
          <p style="margin:14px 0 0"><a class="link" href="/?area=${encodeURIComponent(l.area)}#profile">See home sales and data for ${esc(l.area_name)} →</a></p>
        </section>
      </div>
      <aside class="detail-side">
        <section class="card">
          <div class="muted">Asking price</div>
          <div class="price-big">${money(l.price)}</div>
          ${l.estimate ? `<div class="estimate-box">
            <span class="muted">Ownly estimate</span>
            <strong>${money(l.estimate)}</strong>
            ${Ownly.estimateChip(l.price, l.estimate)}
            <p>Likely range ${money(l.estimate_low)} – ${money(l.estimate_high)}, from the Ames model using the neighbourhood,
              type, size, year built, rooms, garage and quality. ${Math.abs(diff) >= 5 ? `The asking price is ${Math.round(Math.abs(diff))}% ${diff > 0 ? "above" : "below"} it.` : ""}</p>
            <p><a class="link" href="${esc(estimatorLink)}">See why in the estimator →</a></p>
          </div>` : `<div class="estimate-box">
            <span class="muted">Ownly estimate</span>
            <strong>Not available</strong>
            <p>${esc(l.estimate_note || "")}</p>
          </div>`}
        </section>
        <section class="card" id="contact"></section>
      </aside>
    </div>`;

  const map = L.map("detail-map", { scrollWheelZoom: false }).setView([l.lat, l.lon], 13);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors", maxZoom: 18,
  }).addTo(map);
  L.circleMarker([l.lat, l.lon], { radius: 10, color: "#ffffff", weight: 2, fillColor: "#1f5fbf", fillOpacity: 1 }).addTo(map);

  renderContact();

  function renderContact() {
    const box = document.getElementById("contact");
    if (l.is_owner) {
      box.innerHTML = `
        <h2 class="card-title">This is your listing</h2>
        <p class="muted small-text">Messages from buyers arrive in your <a class="link" href="/account.html#inbox">inbox</a>.</p>
        <div class="btn-row">
          <a class="btn" href="/sell.html?id=${l.id}">Edit listing</a>
          <button type="button" class="btn btn-secondary" id="toggle-sold">${sold ? "Mark as for sale" : "Mark as sold"}</button>
          <button type="button" class="btn btn-danger" id="delete">Delete</button>
        </div>`;
      document.getElementById("toggle-sold").onclick = () =>
        api(`/api/listings/${l.id}`, { method: "PUT", body: { status: sold ? "active" : "sold" } })
          .then(() => location.reload(), err => alert(err.message));
      document.getElementById("delete").onclick = () => {
        if (!confirm("Delete this listing? Messages about it will be deleted too. This can't be undone.")) return;
        api(`/api/listings/${l.id}`, { method: "DELETE" })
          .then(() => { location.href = "/account.html"; }, err => alert(err.message));
      };
      return;
    }
    if (!state.user) {
      box.innerHTML = `
        <h2 class="card-title">Interested?</h2>
        <p class="muted small-text">Sign in or create a free account to see the seller's contact details and send them a message.</p>
        <a class="btn btn-block" href="${Ownly.signInLink()}">Sign in to contact the seller</a>`;
      return;
    }
    const contactRows = [
      ["Name", esc(l.contact_name)],
      ["Email", `<a href="mailto:${esc(l.contact_email)}">${esc(l.contact_email)}</a>`],
      l.contact_phone ? ["Phone", `<a href="tel:${esc(l.contact_phone)}">${esc(l.contact_phone)}</a>`] : null,
    ].filter(Boolean);
    box.innerHTML = `
      <h2 class="card-title">Contact the seller</h2>
      <ul class="contact-list">${contactRows.map(([k, v]) => `<li><span>${k}</span>${v}</li>`).join("")}</ul>
      ${sold ? `<p class="notice notice-info">This home has been sold.</p>` : `
      <form id="message-form" novalidate>
        <p class="form-error" hidden></p>
        <div class="form-field" style="margin-bottom:12px">
          <label for="message">Message</label>
          <textarea id="message" name="message" maxlength="2000" required>Hi ${esc(l.contact_name)}, I'm interested in ${esc(l.title)} at ${esc(l.address)}. Is it still available, and when could I view it?</textarea>
          <p class="field-error" data-error-for="message"></p>
        </div>
        <div class="form-field" style="margin-bottom:16px">
          <label for="phone">Your phone <span class="opt">(optional)</span></label>
          <input id="phone" name="phone" type="tel" maxlength="40" autocomplete="tel">
        </div>
        <button class="btn btn-block" type="submit">Send message</button>
        <p class="field-hint" style="margin-top:10px">The seller will see your name and email (${esc(state.user.email)}) so they can reply.</p>
      </form>`}`;
    const form = document.getElementById("message-form");
    if (!form) return;
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = form.querySelector("button");
      btn.disabled = true;
      try {
        await api(`/api/listings/${l.id}/messages`, {
          method: "POST", body: { message: form.elements.message.value, phone: form.elements.phone.value },
        });
        form.outerHTML = `<p class="notice notice-good">Message sent. ${esc(l.contact_name)} will get back to you at ${esc(state.user.email)}.</p>`;
      } catch (err) {
        Ownly.showErrors(form, err);
        btn.disabled = false;
      }
    });
  }
})();
