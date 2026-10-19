(async function () {
  const { api } = Ownly;
  // Only follow same-site paths after signing in (never "//other.site" or full URLs).
  const raw = Ownly.param("next") || "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/";

  const state = await Ownly.nav("");
  if (state.user) {
    location.replace(next);
    return;
  }

  const forms = { signin: document.getElementById("signin-form"), register: document.getElementById("register-form") };
  const tabs = document.querySelectorAll("[data-mode]");
  function setMode(mode) {
    tabs.forEach(b => b.setAttribute("aria-selected", String(b.dataset.mode === mode)));
    forms.signin.hidden = mode !== "signin";
    forms.register.hidden = mode !== "register";
    forms[mode].elements.email.focus();
  }
  tabs.forEach(b => { b.onclick = () => setMode(b.dataset.mode); });
  setMode(Ownly.param("mode") === "register" ? "register" : "signin");

  function handle(form, path, fields) {
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      Ownly.showErrors(form, null);
      try {
        await api(path, { method: "POST", body: Object.fromEntries(fields.map(f => [f, form.elements[f].value])) });
        location.replace(next);
      } catch (err) {
        Ownly.showErrors(form, err);
        btn.disabled = false;
      }
    });
  }
  handle(forms.signin, "/api/login", ["email", "password"]);
  handle(forms.register, "/api/register", ["name", "email", "password"]);
})();
