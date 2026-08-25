const state = {
  pin: sessionStorage.getItem("nwgb-pin") || "",
  me: null,
  ticket: null,
  leads: [],
  saved: [],
  used: [],
};

const $ = (id) => document.getElementById(id);

function headers() {
  const h = { "Content-Type": "application/json" };
  if (state.pin) h["x-desk-pin"] = state.pin;
  return h;
}

async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  if (res.status === 401) {
    $("lock").classList.remove("hidden");
    throw new Error("pin");
  }
  if (!res.ok) throw new Error(`request failed ${res.status}`);
  if ((res.headers.get("content-type") || "").includes("json")) return res.json();
  return res.text();
}

function showPanel(name) {
  for (const id of ["desk", "saved", "used"]) {
    $(`panel-${id}`).classList.toggle("hidden", id !== name);
  }
  if (name === "saved") loadSaved();
  if (name === "used") loadUsed();
}

function fillMe(me) {
  state.me = me;
  $("greeting").textContent = `${me.ownerName}'s private desk`;
  $("country").value = me.settings.country || "GB";
  $("nation").value = me.settings.nation || "England";
  $("town").value = me.settings.town || "";
  $("area").value = me.settings.area || "";
  $("towns").innerHTML = me.towns.map((t) => `<option value="${t.town}"></option>`).join("");
  $("metro").innerHTML = me.metros.map((name) => `<option>${name}</option>`).join("");
  if (me.settings.metro) $("metro").value = me.settings.metro;
  $("ticket-remain").textContent = `${me.remaining} left in this filter`;
  toggleCountry();
  if (me.pinRequired && !state.pin) $("lock").classList.remove("hidden");
}

function toggleCountry() {
  const us = $("country").value === "US";
  $("nation-wrap").classList.toggle("hidden", us);
  $("town-wrap").classList.toggle("hidden", us);
  $("area-wrap").classList.toggle("hidden", us);
  $("metro-wrap").classList.toggle("hidden", !us);
}

function filters() {
  return {
    country: $("country").value,
    nation: $("nation").value,
    town: $("town").value.trim(),
    area: $("area").value.trim(),
    metro: $("metro").value,
  };
}

function query(obj) {
  return new URLSearchParams(obj).toString();
}

function setTicket(ticket) {
  state.ticket = ticket;
  if (ticket?.exhausted) {
    $("ticket-code").textContent = "DONE";
    $("ticket-place").textContent = ticket.message || "Filter exhausted";
    $("ticket-remain").textContent = "0 left in this filter";
    return;
  }
  if (!ticket?.code) return;
  $("ticket-code").textContent = ticket.code;
  $("ticket-place").textContent = [ticket.town, ticket.region, ticket.nation].filter(Boolean).join(" · ");
  $("ticket-remain").textContent = `${ticket.remaining} left in this filter`;
  $("hunt-postcode").value = ticket.code;
}

async function giveNext() {
  $("give").disabled = true;
  try {
    const ticket = await api(`/api/postcodes/next?${query(filters())}`);
    setTicket(ticket);
    await refreshRemaining();
  } finally {
    $("give").disabled = false;
  }
}

async function refreshRemaining() {
  const data = await api(`/api/postcodes/remaining?${query(filters())}`);
  if (!state.ticket) $("ticket-remain").textContent = `${data.remaining} left in this filter`;
}

function modes() {
  return [...document.querySelectorAll("input[name=mode]:checked")].map((el) => el.value);
}

function card(lead, saved) {
  const el = document.createElement("article");
  el.className = "card";
  const why =
    lead.source === "instagram"
      ? "Instagram shop"
      : lead.google === "none"
        ? "No Google profile"
        : lead.google === "blank"
          ? "On Google, no website"
          : "No website";
  el.innerHTML = `
    <header>
      <div>
        <h3>${escapeHtml(lead.name)}</h3>
        <p class="facts">
          <span>${escapeHtml(lead.category || "")}</span>
          <span>${escapeHtml(why)}</span>
          <span>${escapeHtml(lead.postcode || "")}</span>
        </p>
      </div>
      <span class="badge ${lead.score}">${lead.score}</span>
    </header>
    <p class="facts">${escapeHtml(lead.address || lead.snippet || "")}</p>
    <p class="facts">
      ${lead.phone ? `<span>${escapeHtml(lead.phone)}</span>` : ""}
      ${lead.instagram ? `<span>@${escapeHtml((lead.instagram.split("/").pop() || "").replace(/^@/, ""))}</span>` : ""}
      ${lead.website ? `<span>site: ${escapeHtml(lead.website)}</span>` : "<span>no website</span>"}
      ${lead.booking ? `<span>booking: ${escapeHtml(lead.booking)}</span>` : ""}
    </p>
    <div class="links">
      ${lead.mapsSearch ? `<a class="ghost" target="_blank" rel="noreferrer" href="${lead.mapsSearch}">Maps</a>` : ""}
      ${lead.googleSearch ? `<a class="ghost" target="_blank" rel="noreferrer" href="${lead.googleSearch}">Google</a>` : ""}
      ${lead.instagramSearch ? `<a class="ghost" target="_blank" rel="noreferrer" href="${lead.instagramSearch}">Instagram</a>` : ""}
      ${lead.osmUrl ? `<a class="ghost" target="_blank" rel="noreferrer" href="${lead.osmUrl}">OSM</a>` : ""}
      ${saved ? `<button data-status="contacted">Contacted</button><button data-delete="1">Drop</button>` : `<button data-save="1">Save lead</button>`}
    </div>
  `;
  el.querySelector("[data-save]")?.addEventListener("click", () => saveLeads([lead]));
  el.querySelector("[data-status]")?.addEventListener("click", async () => {
    await api(`/api/leads/${encodeURIComponent(lead.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "contacted" }),
    });
    loadSaved();
  });
  el.querySelector("[data-delete]")?.addEventListener("click", async () => {
    await api(`/api/leads/${encodeURIComponent(lead.id)}`, { method: "DELETE" });
    loadSaved();
  });
  return el;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderResults(leads) {
  state.leads = leads;
  const box = $("results");
  box.innerHTML = "";
  if (!leads.length) {
    box.innerHTML = `<p class="hint">Nothing matched. Try a denser postcode or loosen the filters.</p>`;
    $("result-actions").hidden = true;
    return;
  }
  leads.forEach((lead) => box.appendChild(card(lead, false)));
  $("result-actions").hidden = false;
}

function renderSummary(summary) {
  $("summary").classList.remove("hidden");
  $("summary").innerHTML = `
    <span>${summary.hot} hot</span>
    <span>${summary.warm} warm</span>
    <span>${summary.watch} watch</span>
  `;
}

function runHunt(postcode) {
  if (!postcode) return;
  $("hunt-postcode").value = postcode;
  $("hunt-status").textContent = `Hunting ${postcode}…`;
  $("results").innerHTML = "";
  $("summary").classList.add("hidden");
  $("ig-links").classList.add("hidden");
  const params = query({
    postcode,
    modes: modes().join(","),
    niche: $("niche").value,
    radius: "1600",
    ...(state.pin ? { pin: state.pin } : {}),
  });
  const es = new EventSource(`/api/hunt/stream?${params}`);
  let finished = false;
  es.addEventListener("instagramQuery", (e) => {
    const data = JSON.parse(e.data);
    $("ig-links").classList.remove("hidden");
    $("ig-links").innerHTML = `Instagram hunt: <a class="ghost" target="_blank" rel="noreferrer" href="${data.googleUrl}">Google this query</a> <a class="ghost" target="_blank" rel="noreferrer" href="${data.bingUrl}">Bing</a> — open a profile, if the bio has no website and no Fresha/Booksy/Treatwell, keep it.`;
  });
  es.addEventListener("fail", (e) => {
    finished = true;
    $("hunt-status").textContent = JSON.parse(e.data).message;
    es.close();
  });
  es.addEventListener("done", (e) => {
    finished = true;
    const data = JSON.parse(e.data);
    $("hunt-status").textContent = `Done. ${data.leads.length} leads around ${data.geo.display || postcode}.`;
    renderSummary(data.summary);
    renderResults(data.leads);
    es.close();
  });
  es.onerror = () => {
    if (finished) return;
    $("hunt-status").textContent = "Hunt stream dropped.";
    es.close();
  };
}

async function saveLeads(leads) {
  await api("/api/leads", { method: "POST", body: JSON.stringify({ leads }) });
  $("hunt-status").textContent = `Saved ${leads.length} lead${leads.length === 1 ? "" : "s"}.`;
}

async function loadSaved() {
  const data = await api("/api/leads");
  state.saved = data.leads;
  const box = $("saved");
  box.innerHTML = "";
  if (!data.leads.length) {
    box.innerHTML = `<p class="hint">Nothing saved yet. Hunt, then keep the hot ones.</p>`;
    return;
  }
  data.leads.forEach((lead) => box.appendChild(card(lead, true)));
}

async function loadUsed() {
  const data = await api("/api/postcodes/used");
  const box = $("used");
  box.innerHTML = "";
  if (!data.given.length) {
    box.innerHTML = `<p class="hint">No codes given yet.</p>`;
    return;
  }
  data.given.forEach((row) => {
    const el = document.createElement("div");
    el.className = "used-row";
    el.innerHTML = `
      <strong>${escapeHtml(row.code)}</strong>
      <span>${escapeHtml([row.town, row.nation, row.givenAt?.slice(0, 10)].filter(Boolean).join(" · "))}</span>
      <button class="text">Restore</button>
    `;
    el.querySelector("button").addEventListener("click", async () => {
      await api("/api/postcodes/restore", {
        method: "POST",
        body: JSON.stringify({ compact: row.compact }),
      });
      loadUsed();
      refreshRemaining();
    });
    box.appendChild(el);
  });
}

document.querySelectorAll("nav [data-panel]").forEach((btn) => {
  btn.addEventListener("click", () => showPanel(btn.dataset.panel));
});

$("country").addEventListener("change", () => {
  toggleCountry();
  refreshRemaining();
});
["nation", "town", "area", "metro"].forEach((id) => {
  $(id).addEventListener("change", refreshRemaining);
});

$("give").addEventListener("click", giveNext);
$("hunt-ticket").addEventListener("click", () => {
  const code = state.ticket?.code || $("hunt-postcode").value;
  if (code) runHunt(code);
});
$("undo").addEventListener("click", async () => {
  const data = await api("/api/postcodes/undo", { method: "POST" });
  $("ticket-code").textContent = data.removed?.code ? `undid ${data.removed.code}` : "—";
  state.ticket = null;
  refreshRemaining();
});
$("hunt-form").addEventListener("submit", (e) => {
  e.preventDefault();
  runHunt($("hunt-postcode").value.trim());
});
$("save-hot").addEventListener("click", () => {
  saveLeads(state.leads.filter((l) => l.score === "hot" || l.score === "warm"));
});
$("lock-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  state.pin = $("pin").value;
  try {
    await api("/api/unlock", { method: "POST", body: JSON.stringify({ pin: state.pin }) });
    sessionStorage.setItem("nwgb-pin", state.pin);
    $("lock").classList.add("hidden");
    boot();
  } catch {
    $("lock-error").classList.remove("hidden");
  }
});

async function boot() {
  try {
    const me = await api("/api/me");
    fillMe(me);
  } catch (err) {
    if (err.message !== "pin") $("hunt-status").textContent = err.message;
  }
}

boot();
