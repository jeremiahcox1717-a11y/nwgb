const state = {
  pin: sessionStorage.getItem("nwgb-pin") || "",
  me: null,
  ticket: null,
  leads: [],
  saved: [],
  used: [],
  countryOptions: [],
  cityOptions: [],
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
  document.querySelectorAll("nav [data-panel]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.panel === name);
  });
  if (name === "saved") loadSaved();
  if (name === "used") loadUsed();
}

function fillMe(me) {
  state.me = me;
  $("greeting").textContent = `${me.ownerName}'s private desk`;
  fillContinents();
  restoreCascade(me.settings || {});
  if (me.pinRequired && !state.pin) $("lock").classList.remove("hidden");
}

function places() {
  return state.me?.places || [];
}

function unique(values) {
  return [...new Set(values)];
}

function fillSelect(id, items, placeholder, current) {
  const el = $(id);
  const options = items.map((item) => {
    if (typeof item === "string") return { value: item, label: item };
    return { value: item.code, label: item.name };
  });
  el.innerHTML = `<option value="">${placeholder}</option>${options
    .map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
    .join("")}`;
  el.disabled = items.length === 0;
  if (current && options.some((item) => item.value === current)) el.value = current;
}

function fillContinents() {
  const names = state.me?.continents?.length
    ? state.me.continents
    : unique(places().map((row) => row.continent));
  fillSelect("continent", names, "Pick continent", $("continent").value);
}

function languagesFor(continent) {
  return unique(places().filter((row) => row.continent === continent).map((row) => row.language));
}

function countriesFor(continent, language) {
  const seen = new Set();
  return places()
    .filter((row) => row.continent === continent && row.language === language)
    .filter((row) => {
      if (seen.has(row.countryCode)) return false;
      seen.add(row.countryCode);
      return true;
    })
    .map((row) => ({ name: row.country, code: row.countryCode }));
}

function continentNames() {
  if (state.me?.continents?.length) return state.me.continents;
  return unique(places().map((row) => row.continent));
}

function setCountries(countries, current) {
  state.countryOptions = countries || [];
  if ($("country-search")) {
    $("country-search").value = "";
    $("country-search").disabled = state.countryOptions.length === 0;
  }
  renderCountries(current || "");
}

function renderCountries(current) {
  const selected = current || $("country")?.value || "";
  const needle = ($("country-search")?.value || "").trim().toLowerCase();
  let matches = needle
    ? state.countryOptions.filter(
        (row) => row.name.toLowerCase().includes(needle) || row.code.toLowerCase().includes(needle),
      )
    : state.countryOptions.slice();
  if (selected && !matches.some((row) => row.code === selected)) {
    const kept = state.countryOptions.find((row) => row.code === selected);
    if (kept) matches = [kept, ...matches];
  }
  fillSelect(
    "country",
    matches,
    matches.length ? "Pick country" : needle ? "No countries match" : "Pick country",
    selected,
  );
  if ($("country")) $("country").disabled = state.countryOptions.length === 0;
}

function setCities(cities, current) {
  state.cityOptions = cities || [];
  if ($("city-search")) {
    $("city-search").value = "";
    $("city-search").disabled = state.cityOptions.length === 0;
  }
  renderCities(current || "");
}

function renderCities(current) {
  const selected = current || $("city")?.value || "";
  const needle = ($("city-search")?.value || "").trim().toLowerCase();
  let matches = needle
    ? state.cityOptions.filter((name) => name.toLowerCase().includes(needle))
    : state.cityOptions.slice();
  if (selected && state.cityOptions.includes(selected) && !matches.includes(selected)) {
    matches = [selected, ...matches];
  }
  fillSelect("city", matches, matches.length ? "Pick city" : needle ? "No cities match" : "Pick city", selected);
  if ($("city")) $("city").disabled = state.cityOptions.length === 0;
}

async function restoreCascade(settings) {
  const continent = settings.continent || "";
  const language = settings.language || "";
  const country = settings.country || "";
  const city = settings.city || settings.town || settings.metro || "";
  fillSelect("continent", continentNames(), "Pick continent", continent);
  fillSelect("language", continent ? languagesFor(continent) : [], "Pick language", language);
  setCountries(continent && language ? countriesFor(continent, language) : [], country);
  if (country) {
    const data = await api(`/api/places/cities?${query({ continent, language, country })}`);
    setCities(data.cities || [], city);
  } else {
    setCities([], "");
  }
  syncGiveButton();
  await refreshRemaining();
}

async function onCascadeChange(level) {
  const continent = $("continent").value;
  const language = level === "continent" ? "" : $("language").value;
  const country = level === "continent" || level === "language" ? "" : $("country").value;
  if (level === "continent") {
    fillSelect("language", languagesFor(continent), "Pick language", "");
    setCountries([], "");
    setCities([], "");
  } else if (level === "language") {
    setCountries(countriesFor(continent, language), "");
    setCities([], "");
  } else if (level === "country") {
    if (country) {
      const data = await api(`/api/places/cities?${query({ continent, language, country })}`);
      setCities(data.cities || [], "");
    } else {
      setCities([], "");
    }
  }
  state.ticket = null;
  $("ticket-code").textContent = "—";
  $("ticket-place").textContent = "Pick continent, language, country, then city.";
  syncGiveButton();
  await refreshRemaining();
}

function syncGiveButton() {
  $("give").disabled = !$("city").value;
}

function filters() {
  return {
    continent: $("continent").value,
    language: $("language").value,
    country: $("country").value,
    city: $("city").value,
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
  $("ticket-place").textContent = [ticket.town, ticket.nation].filter(Boolean).join(" · ");
  $("ticket-remain").textContent = `${ticket.remaining} left in this city`;
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
  if (!$("city").value) {
    $("ticket-remain").textContent = "Pick a city to see codes left";
    return;
  }
  const data = await api(`/api/postcodes/remaining?${query(filters())}`);
  if (!state.ticket) $("ticket-remain").textContent = `${data.remaining} left in this city`;
}

function modes() {
  return [...document.querySelectorAll("input[name=mode]:checked")].map((el) => el.value);
}

function telHref(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return `tel:+${digits.slice(2)}`;
  if (digits.startsWith("44")) return `tel:+${digits}`;
  if (digits.startsWith("1") && digits.length === 11) return `tel:+${digits}`;
  if (digits.startsWith("0")) return `tel:+44${digits.slice(1)}`;
  return `tel:${digits}`;
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
    ${
      lead.phone
        ? `<p class="phone-row">
            <a class="phone" href="${telHref(lead.phone)}">${escapeHtml(lead.phone)}</a>
            <button type="button" class="text" data-copy-phone="1">Copy</button>
          </p>`
        : ""
    }
    <p class="facts">
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
  el.querySelector("[data-copy-phone]")?.addEventListener("click", async (event) => {
    try {
      await navigator.clipboard.writeText(lead.phone);
      event.currentTarget.textContent = "Copied";
    } catch {
      event.currentTarget.textContent = lead.phone;
    }
  });
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

function renderInstagramHuntLinks(data) {
  const searches = Array.isArray(data.searches) && data.searches.length
    ? data.searches
    : data.googleUrl
      ? [{ label: "Instagram", googleUrl: data.googleUrl, bingUrl: data.bingUrl }]
      : [];
  if (!searches.length) return;
  const links = searches
    .map(
      (row) =>
        `<a class="ghost" target="_blank" rel="noreferrer" href="${escapeHtml(row.googleUrl)}">${escapeHtml(row.label)}</a>`,
    )
    .join(" ");
  $("ig-links").classList.remove("hidden");
  $("ig-links").innerHTML = `Instagram with no website: ${links} — open a profile. If the bio has no website and no Fresha/Booksy/Treatwell, keep it.`;
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
  es.addEventListener("status", (e) => {
    $("hunt-status").textContent = JSON.parse(e.data).message;
  });
  es.addEventListener("instagramQuery", (e) => {
    renderInstagramHuntLinks(JSON.parse(e.data));
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
      <span>${escapeHtml([row.town, row.nation || row.country, row.givenAt?.slice(0, 10)].filter(Boolean).join(" · "))}</span>
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

$("continent").addEventListener("change", () => onCascadeChange("continent"));
$("language").addEventListener("change", () => onCascadeChange("language"));
$("country").addEventListener("change", () => onCascadeChange("country"));
$("city").addEventListener("change", () => onCascadeChange("city"));
$("country-search").addEventListener("input", () => renderCountries());
$("city-search").addEventListener("input", () => renderCities());

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
