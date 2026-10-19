// Wires the lessons to the data: tables, charts, quiz, navigation.
(function () {
  const { columns, rows } = window.HOUSING;
  const { col, mean, std, quantile, fmt } = window.EDA;

  const LABELS = {
    CRIM: "Crime rate per capita",
    ZN: "Land zoned for large lots (%)",
    INDUS: "Non-retail business acres (%)",
    CHAS: "Borders Charles River (1/0)",
    NOX: "Nitric oxide concentration",
    RM: "Avg. rooms per dwelling",
    AGE: "Built before 1940 (%)",
    DIS: "Distance to job centres",
    RAD: "Highway access index",
    TAX: "Property tax rate",
    PTRATIO: "Pupil–teacher ratio",
    B: "Derived from % Black residents",
    LSTAT: "Lower-status population (%)",
    MEDV: "Median home value ($1000s)",
  };
  const SHORT = { ...LABELS, B: "Racial composition (B)", ZN: "Large-lot zoning %", INDUS: "Industrial land %", AGE: "Old homes %", LSTAT: "Lower-status pop. %", CHAS: "On Charles River" };

  // ---------- Lesson 2: first look ----------
  const head = document.getElementById("head-table");
  if (head) {
    head.innerHTML =
      "<thead><tr><th class='num'>#</th>" + columns.map((c) => `<th class="num">${c}</th>`).join("") + "</tr></thead><tbody>" +
      rows.slice(0, 5).map((r, i) => `<tr><td class="num">${i}</td>` + r.map((v) => `<td class="num">${v}</td>`).join("") + "</tr>").join("") +
      "</tbody>";
  }
  const dict = document.getElementById("dict-table");
  if (dict) {
    const kind = (c) => {
      const u = new Set(col(c)).size;
      if (u === 2) return "Binary (0/1)";
      if (c === "RAD") return "Ordinal index";
      return "Continuous";
    };
    dict.innerHTML =
      "<thead><tr><th>Column</th><th>Meaning</th><th>Type</th><th class='num'>Unique values</th></tr></thead><tbody>" +
      columns.map((c) => `<tr><td><code>${c}</code></td><td>${LABELS[c]}</td><td>${kind(c)}</td><td class="num">${new Set(col(c)).size}</td></tr>`).join("") +
      "</tbody>";
  }

  // ---------- Lesson 3: describe() ----------
  const desc = document.getElementById("describe-table");
  if (desc) {
    desc.innerHTML =
      "<thead><tr><th></th><th class='num'>mean</th><th class='num'>std</th><th class='num'>min</th><th class='num'>25%</th><th class='num'>50%</th><th class='num'>75%</th><th class='num'>max</th></tr></thead><tbody>" +
      columns.map((c) => {
        const x = col(c);
        const cells = [mean(x), std(x), Math.min(...x), quantile(x, 0.25), quantile(x, 0.5), quantile(x, 0.75), Math.max(...x)];
        const flag = (i) => (c === "CRIM" && i === 6) || (c === "ZN" && i === 4) ? " flag" : "";
        return `<tr><td><code>${c}</code></td>` + cells.map((v, i) => `<td class="num${flag(i)}">${fmt(v)}</td>`).join("") + "</tr>";
      }).join("") + "</tbody>";
  }
  const missing = document.getElementById("missing-count");
  if (missing) missing.textContent = rows.flat().filter((v) => v == null || Number.isNaN(v)).length;
  const dupes = document.getElementById("dupe-count");
  if (dupes) dupes.textContent = rows.length - new Set(rows.map((r) => r.join("|"))).size;
  const capped = document.getElementById("capped-count");
  if (capped) capped.textContent = col("MEDV").filter((v) => v === 50).length;

  // ---------- Lesson 4: distributions ----------
  const medv = col("MEDV");
  const histFig = document.getElementById("fig-hist");
  const HIST_OPTS = {
    MEDV: { binWidth: 2.5, xLabel: "Median home value ($1000s)", unit: "k", highlight: (b) => b.x0 >= 50 },
    CRIM: { binWidth: 2.5, xLabel: "Crime rate per capita" },
    RM: { binWidth: 0.25, xLabel: "Average rooms per dwelling" },
    LSTAT: { binWidth: 1.5, xLabel: "Lower-status population (%)" },
  };
  const HIST_NOTES = {
    MEDV: "Roughly bell-shaped with a right tail, plus a suspicious spike at exactly 50 (in red) — those values were capped when the data was collected.",
    CRIM: "Extremely right-skewed: most towns are near 0, a handful are far out. The mean (3.61) is 14× the median (0.26). Consider a log transform before modelling.",
    RM: "Close to a normal (bell) distribution centred around 6 rooms. Mean ≈ median, so it's nearly symmetric.",
    LSTAT: "Moderately right-skewed. Most neighbourhoods are 5–20% lower-status, with a tail up to 38%.",
  };
  function drawHist(name) {
    const x = col(name);
    Charts.histogram(histFig, { values: x, ...HIST_OPTS[name] });
    histFig.querySelector(".figure-title").textContent = `Distribution of ${name}`;
    histFig.querySelector(".figure-sub").textContent = `${LABELS[name]} · mean ${fmt(mean(x))} · median ${fmt(quantile(x, 0.5))}`;
    document.getElementById("hist-note").textContent = HIST_NOTES[name];
    histFig.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", b.dataset.col === name));
  }
  if (histFig) {
    histFig.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => drawHist(b.dataset.col)));
    drawHist("MEDV");
  }

  const boxFig = document.getElementById("fig-box");
  if (boxFig) {
    const s = Charts.boxplot(boxFig, { values: medv, xLabel: "Median home value ($1000s)", unit: "k" });
    document.getElementById("box-q1").textContent = fmt(s.q1);
    document.getElementById("box-q3").textContent = fmt(s.q3);
    document.getElementById("box-iqr").textContent = fmt(s.iqr);
    document.getElementById("box-lo").textContent = fmt(s.lo);
    document.getElementById("box-hi").textContent = fmt(s.hi);
    document.getElementById("box-n").textContent = s.outliers.length;
  }

  // ---------- Lesson 5: relationships ----------
  const scFig = document.getElementById("fig-scatter");
  function drawScatter(name) {
    const r = Charts.scatter(scFig, { x: col(name), y: medv, xLabel: LABELS[name], yLabel: "MEDV ($1000s)", xName: name, capY: 50 });
    scFig.querySelector(".figure-title").textContent = `${name} vs. MEDV`;
    scFig.querySelector(".figure-sub").textContent = `Pearson r = ${r.r.toFixed(2)} · dashed line = linear trend · red = capped at $50k`;
    scFig.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", b.dataset.col === name));
  }
  if (scFig) {
    scFig.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => drawScatter(b.dataset.col)));
    drawScatter("RM");
  }
  const corrFig = document.getElementById("fig-corr");
  if (corrFig) Charts.corrBars(corrFig, { target: "MEDV", labels: SHORT });

  const chas = col("CHAS");
  const riverYes = medv.filter((_, i) => chas[i] === 1), riverNo = medv.filter((_, i) => chas[i] === 0);
  const setText = (id, v) => { const n = document.getElementById(id); if (n) n.textContent = v; };
  setText("river-yes", "$" + fmt(mean(riverYes), 1) + "k");
  setText("river-no", "$" + fmt(mean(riverNo), 1) + "k");
  setText("river-n", riverYes.length);
  setText("radtax", window.EDA.corr(col("RAD"), col("TAX")).toFixed(2));

  // ---------- quiz ----------
  let score = 0, answered = 0;
  const quizzes = document.querySelectorAll(".quiz");
  const scoreEl = document.getElementById("quiz-score");
  quizzes.forEach((qz) => {
    qz.querySelectorAll(".opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ok = btn.hasAttribute("data-correct");
        btn.classList.add(ok ? "right" : "wrong");
        qz.querySelector("[data-correct]").classList.add("right");
        qz.querySelectorAll(".opt").forEach((b) => (b.disabled = true));
        qz.querySelector(".why").classList.add("show");
        answered++; if (ok) score++;
        if (scoreEl) scoreEl.textContent = `${score} / ${answered} correct` + (answered === quizzes.length ? (score === quizzes.length ? " — perfect!" : " — review the lessons above and try again by reloading.") : "");
      });
    });
  });

  // ---------- checklist (remembered per browser) ----------
  document.querySelectorAll(".checklist input").forEach((cb, i) => {
    const key = "eda-check-" + i;
    try { cb.checked = localStorage.getItem(key) === "1"; } catch (e) {}
    cb.addEventListener("change", () => { try { localStorage.setItem(key, cb.checked ? "1" : "0"); } catch (e) {} });
  });

  // ---------- nav highlight + progress ----------
  const links = [...document.querySelectorAll(".toc a")];
  const sections = links.map((a) => document.querySelector(a.getAttribute("href")));
  const bar = document.querySelector(".progress > div");
  const label = document.querySelector(".progress-label");
  const seen = new Set();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const i = sections.indexOf(e.target);
      links.forEach((a, j) => a.classList.toggle("active", j === i));
      seen.add(i);
      if (bar) bar.style.width = (seen.size / sections.length) * 100 + "%";
      if (label) label.textContent = `${seen.size} of ${sections.length} lessons visited`;
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  sections.forEach((s) => s && io.observe(s));

  // ---------- theme toggle ----------
  const tbtn = document.querySelector(".theme-btn");
  if (tbtn) {
    const root = document.documentElement;
    const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const sync = () => (tbtn.textContent = isDark() ? "☀ Light mode" : "☾ Dark mode");
    tbtn.addEventListener("click", () => { root.dataset.theme = isDark() ? "light" : "dark"; sync(); });
    sync();
  }
})();
