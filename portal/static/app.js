(async function () {
  Ownly.nav("index");
  const { esc, money } = Ownly;
  const site = await fetch("/api/meta").then(r => r.json());
  const $ = id => document.getElementById(id);

  // ---- data ----
  const NB = Object.fromEntries(site.neighborhoods.map(n => [n.code, n]));
  const col = Object.fromEntries(site.sale_columns.map((c, i) => [c, i]));
  const sales = site.sales.map(s => ({
    order: s[col.order], nb: s[col.neighborhood], type: s[col.type] ? "townhouse" : "house",
    area: s[col.area], year: s[col.year], quality: s[col.quality], bedrooms: s[col.bedrooms],
    bathrooms: s[col.bathrooms], garage: s[col.garage], lot: s[col.lot], price: s[col.price],
    yr: s[col.yr_sold], mo: s[col.mo_sold], today: s[col.today],
  }));
  const saleByOrder = Object.fromEntries(sales.map(s => [s.order, s]));
  const salesByNb = {};
  for (const s of sales) (salesByNb[s.nb] = salesByNb[s.nb] || []).push(s);

  const Q = site.quality;
  const QUALITY_DESC = [
    "Minimal finishes; likely needs updating.",
    "Simple, functional finishes.",
    "Typical finishes for Ames.",
    "Quality materials and recent updates.",
    "Luxury finishes and materials throughout.",
  ];
  const LIM = site.limits;
  const SQM = 10.7639;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const M = site.model;

  const state = {
    nb: null, sale: null, unit: "sqft", last: null, sort: { key: "sold", dir: -1 }, showAll: false,
    form: { type: "house", area: 1500, year: 1970, quality: 3, bedrooms: 3, bathrooms: 2, garage: 2 },
  };

  // ---- formatting ----
  const compact = v => {
    const a = Math.abs(v);
    return a >= 1e6 ? "$" + (a / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : "$" + Math.round(a / 1000) + "k";
  };
  const signed = d => {
    const v = Math.round(d / 1000) * 1000;
    return v === 0 ? "≈ $0" : (v > 0 ? "+" : "−") + compact(v);
  };
  const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
  const areaText = sqft => state.unit === "sqm"
    ? `${Math.round(sqft / SQM).toLocaleString("en-US")} m²` : `${Math.round(sqft).toLocaleString("en-US")} sq ft`;
  const soldText = s => `${MONTHS[s.mo - 1]} ${s.yr}`;
  const qualityLevel = score => Q.scores.reduce((best, sc, i) =>
    Math.abs(sc - score) < Math.abs(Q.scores[best] - score) ? i : best, 0) + 1;
  const qualityText = score => `${Q.names[qualityLevel(score) - 1]} (${score}/10)`;
  const median = arr => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const share = (arr, fn) => arr.length ? arr.filter(fn).length / arr.length * 100 : 0;

  // ---- neighbourhood statistics ----
  const stats = {};
  for (const n of site.neighborhoods) {
    const ss = salesByNb[n.code] || [];
    stats[n.code] = {
      typical: n.typical, count: ss.length, sold: median(ss.map(s => s.price)),
      ppsf: median(ss.map(s => s.today / s.area)), area: median(ss.map(s => s.area)),
      year: median(ss.map(s => s.year)), quality: median(ss.map(s => s.quality)),
      bedrooms: median(ss.map(s => s.bedrooms)), garage2: share(ss, s => s.garage >= 2),
      townhouse: share(ss, s => s.type === "townhouse"), lot: median(ss.map(s => s.lot)),
    };
  }
  const pctAmong = (key, v) => Math.round(
    site.neighborhoods.filter(n => stats[n.code][key] < v).length / site.neighborhoods.length * 100);

  // ---- hero ----
  $("hero-stats").innerHTML = [
    [sales.length.toLocaleString("en-US"), "home sales"],
    [site.neighborhoods.length, "neighbourhoods"],
    ["×" + M.factor.toFixed(2), `price growth ${M.reference_period.slice(0, 4)}–${M.target_period.slice(0, 4)}`],
    [Math.round(M.validation.within_20) + "%", "of test estimates within 20%"],
  ].map(([v, l]) => `<div class="hero-stat"><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`).join("");

  // ---- map ----
  const mix = (a, b, t) => {
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
  };
  const typicals = site.neighborhoods.map(n => n.typical);
  const lo = Math.min(...typicals), hi = Math.max(...typicals);
  // The map tiles are always light, so the map uses the light sequential ramp in both themes.
  const colorFor = v => mix("#86b6ef", "#0d366b", Math.min(1, Math.max(0, (v - lo) / (hi - lo))));
  const HIGHLIGHT = "#f59e0b";
  $("legend-lo").textContent = compact(lo);
  $("legend-hi").textContent = compact(hi);

  const map = L.map("map", { scrollWheelZoom: false }).setView([42.03, -93.64], 12);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors", maxZoom: 18,
  }).addTo(map);
  map.on("focus", () => map.scrollWheelZoom.enable());
  map.on("blur", () => map.scrollWheelZoom.disable());
  const markers = {};
  for (const n of site.neighborhoods) {
    const mk = L.circleMarker([n.lat, n.lon], {
      radius: 6 + Math.sqrt(n.count) * 0.9, color: "#ffffff", weight: 1.5,
      fillColor: colorFor(n.typical), fillOpacity: .9,
    }).addTo(map);
    mk.baseRadius = mk.options.radius;
    mk.bindTooltip(`<div class="town-tip"><strong>${esc(n.name)}</strong>Typical home: ${money(n.typical)}<br>${n.count} sales in the data</div>`,
      { direction: "top", offset: [0, -6] });
    mk.on("click", () => selectNb(n.code));
    markers[n.code] = mk;
  }
  map.fitBounds(L.latLngBounds(site.neighborhoods.map(n => [n.lat, n.lon])).pad(0.08));

  $("nb-select").innerHTML = site.neighborhoods
    .map(n => `<option value="${esc(n.code)}">${esc(n.name)}</option>`).join("");
  $("nb-select").addEventListener("change", e => selectNb(e.target.value, { fly: true }));

  function selectNb(code, { fly = false, silent = false } = {}) {
    if (state.nb) {
      const prev = markers[state.nb];
      prev.setStyle({ color: "#ffffff", weight: 1.5, radius: prev.baseRadius, fillOpacity: .9 });
    }
    state.nb = code;
    state.showAll = false;
    if (!silent) state.sale = null;
    markers[code].setStyle({ color: HIGHLIGHT, weight: 4, radius: markers[code].baseRadius + 3, fillOpacity: 1 }).bringToFront();
    if (fly) map.flyTo([NB[code].lat, NB[code].lon], Math.max(map.getZoom(), 13), { duration: .6 });
    $("nb-select").value = code;
    renderArea();
    if (!silent) render();
  }

  function loadSale(order, { scroll = false } = {}) {
    const s = saleByOrder[order];
    selectNb(s.nb, { fly: state.nb !== s.nb, silent: true });
    state.sale = order;
    state.form = {
      type: s.type, area: clamp(s.area, LIM.area), year: clamp(s.year, LIM.year),
      quality: qualityLevel(s.quality), bedrooms: clamp(s.bedrooms, LIM.bedrooms),
      bathrooms: clamp(s.bathrooms, LIM.bathrooms), garage: clamp(s.garage, LIM.garage),
    };
    renderTable();
    render();
    if (scroll) $("estimate").scrollIntoView({ behavior: "smooth" });
  }

  $("record-clear").onclick = () => { state.sale = null; renderTable(); render(); };

  // ---- inputs ----
  const toUnit = sqft => state.unit === "sqm" ? Math.round(sqft / SQM) : Math.round(sqft);
  const fromUnit = v => state.unit === "sqm" ? Math.round(v * SQM) : Math.round(v);

  function setupAreaInputs() {
    const [a, b] = LIM.area;
    for (const el of [$("area-range"), $("area-input")]) {
      el.min = toUnit(a);
      el.max = toUnit(b);
      el.step = state.unit === "sqm" ? 1 : 10;
    }
  }
  const touched = () => { state.sale = null; };

  $("type-seg").addEventListener("click", e => {
    const b = e.target.closest("[data-type]");
    if (b) { state.form.type = b.dataset.type; touched(); render(); }
  });
  $("unit-seg").addEventListener("click", e => {
    const b = e.target.closest("[data-unit]");
    if (b) { state.unit = b.dataset.unit; setupAreaInputs(); render(); renderArea(); }
  });
  $("area-range").addEventListener("input", e => { state.form.area = clamp(fromUnit(+e.target.value), LIM.area); touched(); render(); });
  $("area-input").addEventListener("change", e => {
    const v = +e.target.value;
    if (Number.isFinite(v) && v > 0) state.form.area = clamp(fromUnit(v), LIM.area);
    touched(); render();
  });
  $("year-range").addEventListener("input", e => { state.form.year = +e.target.value; touched(); render(); });
  $("year-input").addEventListener("change", e => {
    const v = Math.round(+e.target.value);
    if (Number.isFinite(v) && v > 0) state.form.year = clamp(v, LIM.year);
    touched(); render();
  });
  document.querySelectorAll(".stepper[data-key]").forEach(st => st.addEventListener("click", e => {
    const b = e.target.closest("[data-step]");
    if (!b) return;
    const key = st.dataset.key;
    state.form[key] = clamp(state.form[key] + +b.dataset.step, LIM[key]);
    touched(); render();
  }));
  $("quality-pills").addEventListener("click", e => {
    const b = e.target.closest("[data-q]");
    if (b) { state.form.quality = +b.dataset.q; touched(); render(); }
  });

  function render() {
    const f = state.form;
    document.querySelectorAll("#type-seg [data-type]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.type === f.type)));
    document.querySelectorAll("#unit-seg [data-unit]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.unit === state.unit)));
    $("area-range").value = toUnit(f.area);
    $("area-input").value = toUnit(f.area);
    $("year-range").value = f.year;
    $("year-input").value = f.year;
    document.querySelectorAll(".stepper[data-key]").forEach(st => {
      const key = st.dataset.key, [lo, hi] = LIM[key];
      st.querySelector("output").textContent = f[key];
      st.querySelector('[data-step="-1"]').disabled = f[key] <= lo;
      st.querySelector('[data-step="1"]').disabled = f[key] >= hi;
    });
    $("quality-pills").innerHTML = Q.names.map((name, i) =>
      `<button type="button" class="pill ${i + 1 === f.quality ? "is-active" : ""}" data-q="${i + 1}" aria-pressed="${i + 1 === f.quality}">${esc(name)}</button>`).join("");
    $("quality-desc").textContent = `${QUALITY_DESC[f.quality - 1]} (${Q.scores[f.quality - 1]}/10 on the Ames scale)`;

    const s = state.sale != null && saleByOrder[state.sale];
    $("record-chip").hidden = !s;
    if (s) $("record-chip-text").textContent = `Starting from a ${s.type} sold in ${soldText(s)} (sale #${s.order})`;
    if (state.nb) predict();
  }

  let seq = 0, timer;
  function predict() {
    clearTimeout(timer);
    document.body.classList.add("is-loading");
    timer = setTimeout(async () => {
      const mine = ++seq;
      const form = { ...state.form, neighborhood: state.nb };
      let res;
      try {
        res = await Ownly.api("/api/predict", { method: "POST", body: form });
      } catch (err) {
        res = { error: err.message };
      }
      if (mine !== seq) return;
      document.body.classList.remove("is-loading");
      if (res.error) {
        $("result-price").textContent = "—";
        $("result-range").textContent = res.error;
        return;
      }
      state.last = res;
      showResult(res);
      renderFactors(res);
      renderSimilar();
      drawScatter();
    }, 120);
  }

  const scaleMax = median(sales.map(s => s.today)) * 2.5;
  function showResult(res) {
    const n = NB[state.nb], f = state.form;
    $("result-place").textContent = `Estimated value today · ${n.name}`;
    $("result-price").textContent = money(res.estimate);
    $("result-range").textContent = `Likely between ${money(res.estimate_low)} and ${money(res.estimate_high)}`;
    const pct = v => Math.min(100, Math.max(0, v / scaleMax * 100));
    $("compare").hidden = false;
    $("compare-fill").style.width = pct(res.estimate) + "%";
    $("compare-mark").style.left = pct(n.typical) + "%";
    const diff = (res.estimate - n.typical) / n.typical * 100;
    $("compare-text").textContent = Math.abs(diff) < 3
      ? `About the same as a typical home in ${n.name} (line marker).`
      : `${Math.abs(diff).toFixed(0)}% ${diff > 0 ? "above" : "below"} a typical home in ${n.name} (line marker).`;
    $("result-foot").textContent =
      `At the ${M.reference_period} market this home would have been about ${money(Math.round(res.reference / 1000) * 1000)}. ` +
      `Ames prices are up ×${M.factor.toFixed(2)} since then (FHFA index, ${M.target_period}).`;

    const sell = new URLSearchParams({
      area: state.nb, type: f.type === "house" ? "House" : "Townhouse", sqft: f.area, year: f.year,
      beds: f.bedrooms, baths: f.bathrooms, garage: f.garage, quality: f.quality,
    });
    $("list-cta").href = `/sell.html?${sell}`;
    $("browse-cta").href = `/homes.html?${new URLSearchParams({ area: state.nb })}`;
  }

  // ---- why this price ----
  function barRows(rows, { diverging }) {
    const maxAbs = Math.max(...rows.map(r => Math.abs(r.value)), 1e-9);
    return rows.map(r => {
      const w = Math.abs(r.value) / maxAbs * (diverging ? 50 : 100);
      const cls = diverging ? (r.value >= 0 ? "up" : "down") : "single";
      const pos = diverging && r.value < 0 ? `left:${50 - w}%;` : "";
      return `<div class="bar-row" title="${esc(r.label)}: ${esc(r.text)}">
        <span class="bar-label">${esc(r.label)}</span>
        <span class="bar-track${diverging ? " diverging" : ""}"><span class="bar ${cls}" style="${pos}width:${w}%"></span></span>
        <span class="bar-value">${esc(r.text)}</span></div>`;
    }).join("");
  }

  function renderFactors(res) {
    const n = NB[state.nb];
    $("why-sub").textContent =
      `A typical Ames home would be about ${money(Math.round(res.typical / 1000) * 1000)} today. ` +
      `This ${state.form.type} in ${n.name} comes out at ${money(res.estimate)}. Here's what makes the difference.`;
    const rows = [...res.factors].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
      .map(f => ({ label: f.name, value: f.effect, text: signed(f.effect) }));
    $("factor-chart").innerHTML = barRows(rows, { diverging: true });
  }

  // ---- similar sales ----
  const sd = key => {
    const v = sales.map(s => s[key]), m = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1;
  };
  const SIM = { area: sd("area"), year: sd("year"), quality: sd("quality"), bedrooms: sd("bedrooms"), bathrooms: sd("bathrooms"), garage: sd("garage") };

  function renderSimilar() {
    const f = { ...state.form, quality: Q.scores[state.form.quality - 1] };
    const dist = s => Object.entries(SIM).reduce((d, [k, sdv]) => d + ((s[k] - f[k]) / sdv) ** 2, 0)
      + (s.type === f.type ? 0 : 4) + (s.nb === state.nb ? 0 : 1.5);
    const near = sales.map(s => [dist(s), s]).sort((a, b) => a[0] - b[0]).slice(0, 6).map(x => x[1]);
    $("similar").innerHTML = near.map(s => `<li>
      <div><div class="sim-name">${esc(NB[s.nb].name)}</div>
        <div class="sim-meta">${s.type === "house" ? "House" : "Townhouse"} · ${areaText(s.area)} · built ${s.year} · ${Q.names[qualityLevel(s.quality) - 1]}<br>Sold ${soldText(s)} for ${money(s.price)}</div></div>
      <div class="sim-value">${money(s.today)}<div class="sim-meta">today</div></div>
      <button type="button" class="btn-small" data-use="${s.order}">Use</button></li>`).join("");
  }

  document.addEventListener("click", e => {
    const use = e.target.closest("[data-use]");
    if (use) loadSale(+use.dataset.use, { scroll: true });
  });

  // ---- neighbourhood profile ----
  const pctTrack = p => `<div class="pct-track"><span class="pct-mark" style="left:${p}%"></span></div>
    <div class="pct-text">Higher than ${p}% of neighbourhoods</div>`;

  function renderArea() {
    const n = NB[state.nb], st = stats[state.nb];
    $("profile-name").textContent = n.name;
    $("records-name").textContent = n.name;
    $("profile-sub").textContent =
      `Based on the ${st.count} homes sold in ${n.name} between 2006 and 2010, compared with Ames's other neighbourhoods.`;
    const perUnit = state.unit === "sqm" ? st.ppsf * SQM : st.ppsf;
    const tiles = [
      { headline: true, title: "Typical home value today", value: money(st.typical), key: "typical",
        unit: `Median of ${st.count} sales, brought to today's market. They sold for a median ${money(st.sold)} at the time.` },
      { title: "Price per " + (state.unit === "sqm" ? "m²" : "sq ft"), value: money(perUnit), key: "ppsf", unit: "Today's value divided by living area" },
      { title: "Living area", value: areaText(st.area), key: "area", unit: "Median above-ground living area" },
      { title: "Year built", value: Math.round(st.year), key: "year", unit: "Median year the homes were built" },
      { title: "Quality", value: Q.names[qualityLevel(st.quality) - 1], key: "quality", unit: `Median overall quality ${st.quality}/10` },
      { title: "Bedrooms", value: st.bedrooms, key: "bedrooms", unit: "Median bedrooms above ground" },
      { title: "Two-car garage", value: Math.round(st.garage2) + "%", key: "garage2", unit: "Share of homes with 2+ garage spaces" },
      { title: "Townhouses", value: Math.round(st.townhouse) + "%", key: "townhouse", unit: "Share of sales that were townhouses" },
      { title: "Lot size", value: areaText(st.lot), key: "lot", unit: "Median lot area" },
      { title: "Sales in the data", value: st.count, key: "count", unit: "Homes sold 2006–2010" },
    ];
    $("profile-tiles").innerHTML = tiles.map(t => `<div class="card tile${t.headline ? " headline" : ""}">
      <div class="tile-title">${esc(t.title)}</div>
      <div class="tile-value">${esc(t.value)}</div>
      <div class="tile-unit">${esc(t.unit)}</div>
      ${pctTrack(pctAmong(t.key, st[t.key]))}</div>`).join("");
    renderTable();
    drawScatter();
  }

  // ---- sales table ----
  const COLUMNS = [
    { key: "sold", label: "Sold", get: s => s.yr * 12 + s.mo, show: soldText },
    { key: "price", label: "Sold for", get: s => s.price, show: s => money(s.price) },
    { key: "today", label: "Value today", sub: "est.", get: s => s.today, show: s => money(s.today) },
    { key: "area", label: "Living area", get: s => s.area, show: s => areaText(s.area) },
    { key: "year", label: "Built", get: s => s.year, show: s => s.year },
    { key: "quality", label: "Quality", get: s => s.quality, show: s => qualityText(s.quality) },
    { key: "bedrooms", label: "Beds", get: s => s.bedrooms, show: s => s.bedrooms },
    { key: "bathrooms", label: "Full baths", get: s => s.bathrooms, show: s => s.bathrooms },
    { key: "garage", label: "Garage", get: s => s.garage, show: s => s.garage },
    { key: "type", label: "Type", get: s => s.type === "house" ? 0 : 1, show: s => s.type === "house" ? "House" : "Townhouse" },
  ];
  const PAGE = 25;

  function renderTable() {
    const { key, dir } = state.sort;
    const c = COLUMNS.find(x => x.key === key);
    const all = [...(salesByNb[state.nb] || [])].sort((a, b) => (c.get(a) - c.get(b)) * dir);
    const rows = state.showAll ? all : all.slice(0, PAGE);
    const table = $("records-table");
    table.tHead.innerHTML = "<tr>" + COLUMNS.map(x => {
      const sort = x.key === key ? ` aria-sort="${dir > 0 ? "ascending" : "descending"}"` : "";
      return `<th data-key="${x.key}"${sort}>${esc(x.label)}${x.sub ? `<span class="th-sub">${esc(x.sub)}</span>` : ""}</th>`;
    }).join("") + "<th></th></tr>";
    table.tBodies[0].innerHTML = rows.map(s =>
      `<tr class="${s.order === state.sale ? "is-selected" : ""}">` + COLUMNS.map(x => `<td>${esc(x.show(s))}</td>`).join("") +
      `<td><button type="button" class="btn-small" data-use="${s.order}">Use</button></td></tr>`).join("");
    $("table-foot").innerHTML = all.length > PAGE
      ? `<span class="muted">Showing ${rows.length} of ${all.length} sales</span>
         <button type="button" class="link" id="toggle-all">${state.showAll ? "Show fewer" : `Show all ${all.length}`}</button>` : "";
    const t = $("toggle-all");
    if (t) t.onclick = () => { state.showAll = !state.showAll; renderTable(); };
  }
  $("records-table").tHead.addEventListener("click", e => {
    const th = e.target.closest("th[data-key]");
    if (!th) return;
    const k = th.dataset.key;
    state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : -1 };
    renderTable();
  });

  // ---- charts (SVG) ----
  const SVGNS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs, style) => {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (style) Object.assign(el.style, style);
    return el;
  };
  const svgText = (attrs, text) => { const el = svgEl("text", attrs); el.textContent = text; return el; };
  const tip = $("tooltip");
  const showTip = (e, html) => {
    tip.innerHTML = html;
    tip.hidden = false;
    tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + "px";
    tip.style.top = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8) + "px";
  };

  // scatter: living area vs value today
  $("sales-count").textContent = sales.length.toLocaleString("en-US");
  const X_MAX = Math.ceil(Math.max(...sales.map(s => s.area)) / 1000) * 1000;
  const Y_MAX = Math.ceil(Math.max(...sales.map(s => s.today)) / 250000) * 250000;

  function drawScatter() {
    const box = $("scatter");
    if (!state.nb || !box.clientWidth) return;
    const W = box.clientWidth, H = box.clientHeight, Mg = { l: 64, r: 16, t: 12, b: 48 };
    const x = v => Mg.l + v / X_MAX * (W - Mg.l - Mg.r);
    const y = v => H - Mg.b - v / Y_MAX * (H - Mg.t - Mg.b);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Scatter plot of living area against value today for all sales" });
    for (let v = 0; v <= Y_MAX; v += Y_MAX > 1e6 ? 500000 : 250000) {
      svg.append(svgEl("line", { x1: Mg.l, x2: W - Mg.r, y1: y(v), y2: y(v), class: "gridline" }));
      svg.append(svgText({ x: Mg.l - 10, y: y(v) + 4, "text-anchor": "end", class: "axis-text" }, v ? compact(v) : "$0"));
    }
    const xStep = state.unit === "sqm" ? 100 * SQM : 1000;
    for (let v = 0; v <= X_MAX + 1; v += xStep) {
      svg.append(svgText({ x: x(v), y: H - Mg.b + 20, "text-anchor": "middle", class: "axis-text" },
        Math.round(state.unit === "sqm" ? v / SQM : v).toLocaleString("en-US")));
    }
    svg.append(svgText({ x: Mg.l + (W - Mg.l - Mg.r) / 2, y: H - 6, "text-anchor": "middle", class: "axis-title" },
      `Living area (${state.unit === "sqm" ? "m²" : "sq ft"})`));
    svg.append(svgText({ x: -(Mg.t + (H - Mg.t - Mg.b) / 2), y: 14, transform: "rotate(-90)", "text-anchor": "middle", class: "axis-title" },
      "Value today (est.)"));

    const pts = [];
    for (const s of sales) {
      if (s.nb === state.nb) continue;
      const cx = x(s.area), cy = y(s.today);
      svg.append(svgEl("circle", { cx, cy, r: 3 }, { fill: "var(--context)" }));
      pts.push({ cx, cy, s });
    }
    for (const s of salesByNb[state.nb] || []) {
      const cx = x(s.area), cy = y(s.today), sel = s.order === state.sale;
      svg.append(svgEl("circle", { cx, cy, r: sel ? 7 : 4.5 },
        { fill: "var(--series-1)", stroke: sel ? HIGHLIGHT : "var(--surface)", strokeWidth: sel ? 3 : 1.5 }));
      pts.push({ cx, cy, s });
    }
    if (state.last) {
      const cx = x(state.form.area), cy = y(Math.min(Y_MAX, state.last.estimate)), r = 9;
      svg.append(svgEl("path", { d: `M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z` },
        { fill: "var(--series-2)", stroke: "var(--surface)", strokeWidth: 2 }));
      pts.push({ cx, cy, estimate: true });
    }
    const hover = svgEl("circle", { r: 10, fill: "none" }, { stroke: "var(--text)", strokeWidth: 1.5, display: "none" });
    svg.append(hover);
    box.replaceChildren(svg);

    const nearest = e => {
      const rect = svg.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
      let best = null, bd = 20 * 20;
      for (const p of pts) {
        const d = (p.cx - px) ** 2 + (p.cy - py) ** 2;
        if (d < bd || (p.estimate && d <= bd)) { bd = d; best = p; }
      }
      return best;
    };
    svg.addEventListener("pointermove", e => {
      const p = nearest(e);
      if (!p) { tip.hidden = true; hover.style.display = "none"; svg.style.cursor = ""; return; }
      hover.setAttribute("cx", p.cx);
      hover.setAttribute("cy", p.cy);
      hover.style.display = "";
      svg.style.cursor = p.estimate ? "" : "pointer";
      showTip(e, p.estimate
        ? `<strong>${money(state.last.estimate)}</strong><span>Your estimate · ${areaText(state.form.area)}</span>`
        : `<strong>${money(p.s.today)}</strong><span>${esc(NB[p.s.nb].name)} · ${areaText(p.s.area)} · sold ${soldText(p.s)} for ${money(p.s.price)}</span>`);
    });
    svg.addEventListener("pointerleave", () => { tip.hidden = true; hover.style.display = "none"; });
    svg.addEventListener("click", e => {
      const p = nearest(e);
      if (p && !p.estimate) loadSale(p.s.order);
    });
    $("scatter-legend").innerHTML =
      `<span><i style="background:var(--context)"></i>Other neighbourhoods</span>` +
      `<span><i style="background:var(--series-1)"></i>${esc(NB[state.nb].name)}</span>` +
      `<span><i style="background:var(--series-2);border-radius:2px;transform:rotate(45deg)"></i>Your estimate</span>`;
  }
  new ResizeObserver(() => drawScatter()).observe($("scatter"));

  // house-price index line chart
  function drawHpi() {
    const box = $("hpi-chart");
    if (!box.clientWidth) return;
    const data = site.hpi, W = box.clientWidth, H = box.clientHeight, Mg = { l: 44, r: 20, t: 28, b: 36 };
    const yMax = Math.ceil(Math.max(...data.map(d => d[1])) / 50) * 50;
    const x = i => Mg.l + i / (data.length - 1) * (W - Mg.l - Mg.r);
    const y = v => H - Mg.b - v / yMax * (H - Mg.t - Mg.b);
    const idx = p => data.findIndex(d => d[0] === p);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Line chart of the Ames house-price index since 1986" });
    const [b0, b1] = [idx("2006Q1"), idx("2010Q4")];
    svg.append(svgEl("rect", { x: x(b0), y: Mg.t, width: x(b1) - x(b0), height: H - Mg.t - Mg.b }, { fill: "var(--accent-soft)" }));
    svg.append(svgText({ x: (x(b0) + x(b1)) / 2, y: Mg.t - 8, "text-anchor": "middle", class: "axis-text" }, "Sales in the data"));
    for (let v = 0; v <= yMax; v += 100) {
      svg.append(svgEl("line", { x1: Mg.l, x2: W - Mg.r, y1: y(v), y2: y(v), class: "gridline" }));
      svg.append(svgText({ x: Mg.l - 8, y: y(v) + 4, "text-anchor": "end", class: "axis-text" }, v));
    }
    data.forEach((d, i) => {
      if (d[0].endsWith("Q1") && +d[0].slice(0, 4) % 10 === 0) {
        svg.append(svgText({ x: x(i), y: H - Mg.b + 20, "text-anchor": "middle", class: "axis-text" }, d[0].slice(0, 4)));
      }
    });
    svg.append(svgEl("path", { d: data.map((d, i) => `${i ? "L" : "M"}${x(i)} ${y(d[1])}`).join(""), fill: "none" },
      { stroke: "var(--series-1)", strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" }));
    for (const [p, label, anchor] of [[M.reference_period, "2010 reference", "middle"], [M.target_period, "Today", "end"]]) {
      const i = idx(p);
      svg.append(svgEl("circle", { cx: x(i), cy: y(data[i][1]), r: 5 }, { fill: "var(--series-1)", stroke: "var(--surface)", strokeWidth: 2 }));
      svg.append(svgText({ x: x(i), y: y(data[i][1]) - 12, "text-anchor": anchor, class: "axis-title" },
        `${label}: ${data[i][1].toFixed(0)}`));
    }
    const today = data[data.length - 1][1];
    const cross = svgEl("line", { y1: Mg.t, y2: H - Mg.b }, { stroke: "var(--muted)", strokeWidth: 1, display: "none" });
    const dot = svgEl("circle", { r: 5 }, { fill: "var(--series-1)", stroke: "var(--surface)", strokeWidth: 2, display: "none" });
    svg.append(cross, dot);
    svg.addEventListener("pointermove", e => {
      const rect = svg.getBoundingClientRect();
      const i = Math.round(Math.min(1, Math.max(0, (e.clientX - rect.left - Mg.l) / (W - Mg.l - Mg.r))) * (data.length - 1));
      cross.setAttribute("x1", x(i));
      cross.setAttribute("x2", x(i));
      cross.style.display = "";
      dot.setAttribute("cx", x(i));
      dot.setAttribute("cy", y(data[i][1]));
      dot.style.display = "";
      showTip(e, `<strong>${data[i][1].toFixed(1)}</strong><span>${data[i][0]} · prices ×${(today / data[i][1]).toFixed(2)} since then</span>`);
    });
    svg.addEventListener("pointerleave", () => { tip.hidden = true; cross.style.display = "none"; dot.style.display = "none"; });
    box.replaceChildren(svg);
  }
  new ResizeObserver(() => drawHpi()).observe($("hpi-chart"));

  // ---- about the model ----
  $("leaderboard").innerHTML =
    `<thead><tr><th>Model</th><th>Explains</th><th>Typical error</th><th>Within 20%</th></tr></thead><tbody>` +
    site.leaderboard.map((r, i) => `<tr${i === 0 ? ' class="is-selected"' : ""}>
      <td>${esc(r.model)}${i === 0 ? '<span class="badge">used here</span>' : ""}</td>
      <td>${Math.max(0, r.r2 * 100).toFixed(0)}%</td>
      <td>${money(Math.round(r.mae / 100) * 100)}</td>
      <td>${r.within_20.toFixed(0)}%</td></tr>`).join("") + "</tbody>";
  const v = M.validation;
  $("about-model").textContent =
    `Ownly uses a ${M.name.toLowerCase()} model. Checked on ${v.n} homes sold in 2010, the eight-question version used on this page ` +
    `was within 20% of the actual price for ${v.within_20.toFixed(0)}% of homes, with a median error of ${v.median_ape.toFixed(1)}%. ` +
    `The "likely between" range is ± its average error (${v.mape.toFixed(0)}%).`;
  $("about-today").textContent =
    `Prices are brought to today's market with the FHFA house-price index for Ames: the model predicts a price at the ` +
    `${M.reference_period} market, then multiplies it by ${M.factor.toFixed(3)} (the index in ${M.target_period} divided by ${M.reference_period}). ` +
    `Every home is assumed to follow the city-wide trend, and there is no measured accuracy for today's prices.`;
  $("hpi-sub").textContent = `${M.index_title}. Hover to read any quarter.`;

  // ---- start: from the URL (e.g. a listing's "Open in estimator") or North Ames ----
  const p = new URLSearchParams(location.search);
  const num = (k, lim) => p.has(k) && Number.isFinite(+p.get(k)) ? clamp(Math.round(+p.get(k)), lim) : null;
  const f = state.form;
  if (["house", "townhouse"].includes((p.get("type") || "").toLowerCase())) f.type = p.get("type").toLowerCase();
  f.area = num("sqft", LIM.area) ?? f.area;
  f.year = num("year", LIM.year) ?? f.year;
  f.bedrooms = num("beds", LIM.bedrooms) ?? f.bedrooms;
  f.bathrooms = num("baths", LIM.bathrooms) ?? f.bathrooms;
  f.garage = num("garage", LIM.garage) ?? f.garage;
  f.quality = num("quality", LIM.quality) ?? f.quality;
  setupAreaInputs();
  selectNb(NB[p.get("area")] ? p.get("area") : "NAmes", { fly: !!NB[p.get("area")] });
})();
