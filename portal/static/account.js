(async function () {
  const { esc, money, api } = Ownly;
  const tabFromHash = () => (["inbox", "sent"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "listings");
  const state = await Ownly.nav(tabFromHash() === "inbox" ? "inbox" : "account");
  if (!state.user) {
    location.replace(Ownly.signInLink());
    return;
  }
  document.getElementById("account-sub").textContent = `Signed in as ${state.user.email}`;
  document.getElementById("signout").onclick = async () => {
    await api("/api/logout", { method: "POST", body: {} }).catch(() => {});
    location.href = "/";
  };

  const [{ listings }, messages] = await Promise.all([api("/api/my/listings"), api("/api/my/messages")]);
  const unread = messages.received.filter(m => !m.read_at).length;

  const tabs = document.querySelectorAll("[data-tab]");
  tabs.forEach(b => {
    const n = { listings: listings.length, inbox: messages.received.length, sent: messages.sent.length }[b.dataset.tab];
    b.insertAdjacentHTML("beforeend", b.dataset.tab === "inbox" && unread
      ? `<span class="count">${unread}</span>` : ` <span class="muted">(${n})</span>`);
    b.onclick = () => { history.replaceState(null, "", b.dataset.tab === "listings" ? location.pathname : `#${b.dataset.tab}`); show(b.dataset.tab); };
  });

  let inboxSeen = false;
  async function show(tab) {
    tabs.forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    for (const name of ["listings", "inbox", "sent"]) document.getElementById(`tab-${name}`).hidden = name !== tab;
    if (tab === "inbox" && unread && !inboxSeen) {
      inboxSeen = true;
      await api("/api/my/messages/read", { method: "POST", body: {} });
      Ownly.nav("inbox", { refresh: true });
    }
  }

  // ---- my listings ----
  const empty = (title, text, action) => `<div class="card empty-state"><h2>${title}</h2><p>${text}</p>${action || ""}</div>`;
  document.getElementById("tab-listings").innerHTML = listings.length ? listings.map(l => `
    <div class="card row-card">
      ${Ownly.photo(l)}
      <div>
        <a class="row-title" href="/home.html?id=${l.id}">${esc(l.title)}</a>
        <div class="row-meta">
          <strong style="color:var(--text)">${money(l.price)}</strong>
          ${l.status === "sold" ? `<span class="chip chip-sold">Sold</span>` : `<span class="chip chip-accent">For sale</span>`}
          <span>${esc(l.address)} · ${esc(l.area_name)}</span>
        </div>
        <div class="row-meta">
          <span>${l.estimate ? `Ownly estimate ${money(l.estimate)}` : "No Ownly estimate"}</span>
          <span>${l.message_count} message${l.message_count === 1 ? "" : "s"}${l.unread_count ? ` (${l.unread_count} new)` : ""}</span>
          <span>Listed ${Ownly.timeAgo(l.created_at)}</span>
        </div>
      </div>
      <div class="btn-row">
        <a class="btn btn-secondary" href="/sell.html?id=${l.id}">Edit</a>
        <button type="button" class="btn btn-secondary" data-status="${l.id}" data-to="${l.status === "sold" ? "active" : "sold"}">${l.status === "sold" ? "Mark for sale" : "Mark sold"}</button>
        <button type="button" class="btn btn-danger" data-delete="${l.id}">Delete</button>
      </div>
    </div>`).join("")
    : empty("You haven't listed a home yet", "It takes about two minutes, and you'll see the Ownly estimate as you go.",
            `<a class="btn" href="/sell.html">List a home</a>`);

  document.getElementById("tab-listings").addEventListener("click", async e => {
    const status = e.target.closest("[data-status]");
    const del = e.target.closest("[data-delete]");
    try {
      if (status) {
        await api(`/api/listings/${status.dataset.status}`, { method: "PUT", body: { status: status.dataset.to } });
        location.reload();
      } else if (del && confirm("Delete this listing? Messages about it will be deleted too. This can't be undone.")) {
        await api(`/api/listings/${del.dataset.delete}`, { method: "DELETE" });
        location.reload();
      }
    } catch (err) {
      alert(err.message);
    }
  });

  // ---- inbox ----
  document.getElementById("tab-inbox").innerHTML = messages.received.length ? messages.received.map(m => {
    const name = m.sender_name || m.sender_email;
    const subject = encodeURIComponent(`Re: ${m.listing_title}`);
    return `<article class="card message-card${m.read_at ? "" : " is-unread"}">
      <div class="message-head">
        <a href="/home.html?id=${m.listing_id}">${esc(m.listing_title)}</a>
        <span class="muted">${Ownly.timeAgo(m.created_at)}${m.read_at ? "" : " · new"}</span>
      </div>
      <p class="message-body">${esc(m.body)}</p>
      <div class="message-from">From <strong>${esc(name)}</strong> · ${esc(m.sender_email)}${m.phone ? ` · ${esc(m.phone)}` : ""}</div>
      <div class="btn-row" style="margin-top:12px">
        <a class="btn btn-secondary" href="mailto:${esc(m.sender_email)}?subject=${subject}">Reply by email</a>
        ${m.phone ? `<a class="btn btn-secondary" href="tel:${esc(m.phone)}">Call</a>` : ""}
      </div>
    </article>`;
  }).join("") : empty("No messages yet", "When buyers contact you about your listings, their messages appear here.");

  // ---- sent ----
  document.getElementById("tab-sent").innerHTML = messages.sent.length ? messages.sent.map(m => `
    <article class="card message-card">
      <div class="message-head">
        <a href="/home.html?id=${m.listing_id}">${esc(m.listing_title)}</a>
        <span class="muted">${Ownly.timeAgo(m.created_at)}</span>
      </div>
      <p class="message-body">${esc(m.body)}</p>
      <div class="message-from">To ${esc(m.seller_name)}</div>
    </article>`).join("")
    : empty("You haven't contacted any sellers yet", "Find a home you like and send the seller a message.",
            `<a class="btn" href="/homes.html">Browse homes</a>`);

  show(tabFromHash());
  window.addEventListener("hashchange", () => show(tabFromHash()));
})();
