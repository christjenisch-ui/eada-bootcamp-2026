// Small, dependency-free SVG charts for the EDA course.
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const { columns, rows } = window.HOUSING;

  // ---------- stats helpers ----------
  const col = (name) => rows.map((r) => r[columns.indexOf(name)]);
  const mean = (x) => x.reduce((a, b) => a + b, 0) / x.length;
  const std = (x) => { const m = mean(x); return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / (x.length - 1)); };
  const quantile = (x, p) => {
    const s = [...x].sort((a, b) => a - b), k = (s.length - 1) * p, f = Math.floor(k);
    return s[f] + (s[Math.min(f + 1, s.length - 1)] - s[f]) * (k - f);
  };
  const corr = (a, b) => {
    const ma = mean(a), mb = mean(b);
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return num / Math.sqrt(da * db);
  };
  const fmt = (v, d = 2) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(d));
  window.EDA = { col, mean, std, quantile, corr, fmt };

  // ---------- svg + tooltip helpers ----------
  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function text(parent, x, y, str, cls, anchor = "middle") {
    const t = el("text", { x, y, class: cls, "text-anchor": anchor }, parent);
    t.textContent = str;
    return t;
  }
  function tooltip(fig) {
    let tip = fig.querySelector(".tooltip");
    if (!tip) { tip = document.createElement("div"); tip.className = "tooltip"; fig.appendChild(tip); }
    return {
      show(evt, html) {
        tip.innerHTML = html;
        const r = fig.getBoundingClientRect();
        let x = evt.clientX - r.left + 12, y = evt.clientY - r.top - 36;
        tip.classList.add("show");
        if (x + tip.offsetWidth > r.width - 8) x = evt.clientX - r.left - tip.offsetWidth - 12;
        tip.style.left = x + "px"; tip.style.top = Math.max(4, y) + "px";
      },
      hide() { tip.classList.remove("show"); },
    };
  }
  const niceTicks = (min, max, n = 5) => {
    const step0 = (max - min) / n, mag = 10 ** Math.floor(Math.log10(step0));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  };
  function frame(svg, W, H, m, xs, ys, xTicks, yTicks, xLabel, yLabel) {
    yTicks.forEach((t) => {
      el("line", { x1: m.l, x2: W - m.r, y1: ys(t), y2: ys(t), class: "gridline" }, svg);
      text(svg, m.l - 8, ys(t) + 4, t, "tick", "end");
    });
    el("line", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: "baseline" }, svg);
    xTicks.forEach((t) => text(svg, xs(t), H - m.b + 16, t, "tick"));
    if (xLabel) text(svg, (m.l + W - m.r) / 2, H - 4, xLabel, "axis-label");
    if (yLabel) { const t = text(svg, 0, 0, yLabel, "axis-label"); t.setAttribute("transform", `translate(12 ${(m.t + H - m.b) / 2}) rotate(-90)`); }
  }

  // ---------- histogram ----------
  function histogram(fig, { values, binWidth, xLabel, unit = "", highlight }) {
    const svg = fig.querySelector("svg"); svg.innerHTML = "";
    const W = 760, H = 300, m = { t: 12, r: 12, b: 40, l: 48 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const min = Math.floor(Math.min(...values) / binWidth) * binWidth;
    const max = Math.ceil((Math.max(...values) + 1e-9) / binWidth) * binWidth;
    const nb = Math.round((max - min) / binWidth);
    const bins = Array.from({ length: nb }, (_, i) => ({ x0: min + i * binWidth, x1: min + (i + 1) * binWidth, n: 0 }));
    values.forEach((v) => bins[Math.min(nb - 1, Math.floor((v - min) / binWidth))].n++);
    const yMax = Math.max(...bins.map((b) => b.n));
    const xs = (v) => m.l + ((v - min) / (max - min)) * (W - m.l - m.r);
    const ys = (v) => H - m.b - (v / yMax) * (H - m.t - m.b);
    frame(svg, W, H, m, xs, ys, niceTicks(min, max, 8), niceTicks(0, yMax, 4), xLabel, "Count");
    const tip = tooltip(fig);
    bins.forEach((b) => {
      const x = xs(b.x0) + 1, w = Math.max(1, xs(b.x1) - xs(b.x0) - 2), y = ys(b.n), h = H - m.b - y;
      const r = Math.min(4, w / 2, h);
      const path = h > 0
        ? `M${x},${H - m.b} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${H - m.b} Z`
        : "";
      const bar = el("path", { d: path, class: "bar" + (highlight && highlight(b) ? " hl" : "") }, svg);
      const hit = el("rect", { x: xs(b.x0), y: m.t, width: xs(b.x1) - xs(b.x0), height: H - m.t - m.b, class: "hit" }, svg);
      hit.addEventListener("mousemove", (e) => { bar.classList.add("hover"); tip.show(e, `<b>${b.x0}–${b.x1}${unit}</b><br>${b.n} homes (${((b.n / values.length) * 100).toFixed(1)}%)`); });
      hit.addEventListener("mouseleave", () => { bar.classList.remove("hover"); tip.hide(); });
    });
    return { bins, xs, ys, svg, W, H, m };
  }

  // ---------- box plot (horizontal) ----------
  function boxplot(fig, { values, xLabel, unit = "" }) {
    const svg = fig.querySelector("svg"); svg.innerHTML = "";
    const W = 760, H = 150, m = { t: 16, r: 12, b: 40, l: 48 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const q1 = quantile(values, 0.25), q2 = quantile(values, 0.5), q3 = quantile(values, 0.75), iqr = q3 - q1;
    const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
    const inside = values.filter((v) => v >= lo && v <= hi);
    const wLo = Math.min(...inside), wHi = Math.max(...inside);
    const min = 0, max = Math.ceil(Math.max(...values) / 10) * 10;
    const xs = (v) => m.l + ((v - min) / (max - min)) * (W - m.l - m.r);
    niceTicks(min, max, 8).forEach((t) => {
      el("line", { x1: xs(t), x2: xs(t), y1: m.t, y2: H - m.b, class: "gridline" }, svg);
      text(svg, xs(t), H - m.b + 16, t, "tick");
    });
    text(svg, (m.l + W - m.r) / 2, H - 4, xLabel, "axis-label");
    const cy = (m.t + H - m.b) / 2, bh = 40;
    el("line", { x1: xs(wLo), x2: xs(q1), y1: cy, y2: cy, class: "whisker" }, svg);
    el("line", { x1: xs(q3), x2: xs(wHi), y1: cy, y2: cy, class: "whisker" }, svg);
    [wLo, wHi].forEach((v) => el("line", { x1: xs(v), x2: xs(v), y1: cy - 10, y2: cy + 10, class: "whisker" }, svg));
    el("rect", { x: xs(q1), y: cy - bh / 2, width: xs(q3) - xs(q1), height: bh, rx: 4, class: "box" }, svg);
    el("line", { x1: xs(q2), x2: xs(q2), y1: cy - bh / 2, y2: cy + bh / 2, class: "median" }, svg);
    const tip = tooltip(fig);
    const outliers = values.filter((v) => v < lo || v > hi);
    outliers.forEach((v, i) => {
      const c = el("circle", { cx: xs(v), cy: cy + ((i % 5) - 2) * 4, r: 4, class: "outlier" }, svg);
      c.addEventListener("mousemove", (e) => tip.show(e, `Outlier: ${v}${unit}`));
      c.addEventListener("mouseleave", tip.hide);
    });
    const hit = el("rect", { x: xs(q1), y: cy - bh / 2, width: xs(q3) - xs(q1), height: bh, class: "hit" }, svg);
    hit.addEventListener("mousemove", (e) => tip.show(e, `Q1 ${fmt(q1)} · median ${fmt(q2)} · Q3 ${fmt(q3)}<br>IQR = ${fmt(iqr)}`));
    hit.addEventListener("mouseleave", tip.hide);
    return { q1, q2, q3, iqr, lo, hi, outliers };
  }

  // ---------- scatter ----------
  function scatter(fig, { x, y, xLabel, yLabel, xName, capY }) {
    const svg = fig.querySelector("svg"); svg.innerHTML = "";
    const W = 760, H = 360, m = { t: 12, r: 12, b: 40, l: 48 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const xMin = Math.floor(Math.min(...x)), xMax = Math.ceil(Math.max(...x));
    const xs = (v) => m.l + ((v - xMin) / (xMax - xMin)) * (W - m.l - m.r);
    const ys = (v) => H - m.b - (v / 55) * (H - m.t - m.b);
    frame(svg, W, H, m, xs, ys, niceTicks(xMin, xMax, 8), [0, 10, 20, 30, 40, 50], xLabel, yLabel);
    // least-squares line
    const mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0;
    x.forEach((v, i) => { sxy += (v - mx) * (y[i] - my); sxx += (v - mx) ** 2; });
    const b = sxy / sxx, a = my - b * mx;
    const tip = tooltip(fig);
    x.forEach((v, i) => {
      const c = el("circle", { cx: xs(v), cy: ys(y[i]), r: 4, class: "dot" + (capY && y[i] >= capY ? " capped" : "") }, svg);
      c.addEventListener("mousemove", (e) => tip.show(e, `${xName}: ${v}<br>MEDV: $${y[i]}k${capY && y[i] >= capY ? "<br><i>capped value</i>" : ""}`));
      c.addEventListener("mouseleave", tip.hide);
    });
    // keep the trend line inside the 0–55 y-range by trimming its ends
    const xAt = (yv) => (yv - a) / b;
    const ends = [xMin, xMax].map((xv) => {
      const yv = a + b * xv;
      if (yv < 0) return xAt(0);
      if (yv > 55) return xAt(55);
      return xv;
    });
    el("line", { x1: xs(ends[0]), y1: ys(a + b * ends[0]), x2: xs(ends[1]), y2: ys(a + b * ends[1]), class: "trend" }, svg);
    return { r: corr(x, y), slope: b };
  }

  // ---------- correlation bars (diverging) ----------
  function corrBars(fig, { target, labels }) {
    const svg = fig.querySelector("svg"); svg.innerHTML = "";
    const y = col(target);
    const data = columns.filter((c) => c !== target).map((c) => ({ c, r: corr(col(c), y) })).sort((p, q) => q.r - p.r);
    const rowH = 26, W = 760, m = { t: 8, r: 56, b: 32, l: 180 }, H = m.t + m.b + data.length * rowH;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const xs = (v) => m.l + ((v + 1) / 2) * (W - m.l - m.r);
    [-1, -0.5, 0, 0.5, 1].forEach((t) => {
      el("line", { x1: xs(t), x2: xs(t), y1: m.t, y2: H - m.b, class: t === 0 ? "baseline" : "gridline" }, svg);
      text(svg, xs(t), H - m.b + 16, t, "tick");
    });
    const tip = tooltip(fig);
    data.forEach((d, i) => {
      const yy = m.t + i * rowH + 4, h = rowH - 8;
      const x0 = xs(Math.min(0, d.r)), w = Math.abs(xs(d.r) - xs(0));
      el("rect", { x: x0, y: yy, width: w, height: h, rx: 4, class: "bar " + (d.r >= 0 ? "pos" : "neg") }, svg);
      text(svg, m.l - 10, yy + h / 2 + 4, `${d.c} · ${labels[d.c]}`, "annot", "end");
      text(svg, d.r >= 0 ? xs(d.r) + 8 : xs(d.r) - 8, yy + h / 2 + 4, d.r.toFixed(2), "tick", d.r >= 0 ? "start" : "end");
      const hit = el("rect", { x: m.l, y: m.t + i * rowH, width: W - m.l - m.r, height: rowH, class: "hit" }, svg);
      hit.addEventListener("mousemove", (e) => tip.show(e, `<b>${d.c}</b> vs ${target}: r = ${d.r.toFixed(3)}`));
      hit.addEventListener("mouseleave", tip.hide);
    });
    return data;
  }

  window.Charts = { histogram, boxplot, scatter, corrBars, el, text };
})();
