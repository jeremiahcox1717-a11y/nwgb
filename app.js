import { pinMatches } from "./server/access.js";
import { initData } from "./server/data-files.js";
import { getStore, updateStore } from "./server/store.js";
import {
  nextPostcode,
  remainingCount,
  restoreGiven,
  ukTowns,
  undoLastGiven,
  usMetros,
} from "./server/postcodes.js";
import { runHunt } from "./server/hunt.js";

const state = {
  unlocked: false,
  me: null,
  ticket: null,
  leads: [],
};

const $ = (id) => document.getElementById(id);

function meFromStore() {
  const store = getStore();
  return {
    ownerName: store.ownerName || "Jordan",
    settings: store.settings,
    remaining: remainingCount(store.settings),
    towns: ukTowns().slice(0, 80),
    metros: usMetros().map((m) => m.name),
  };
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
  $("country").value = me.settings.country || "GB";
  $("nation").value = me.settings.nation || "England";
  $("town").value = me.settings.town || "";
  $("area").value = me.settings.area || "";
  $("towns").innerHTML = me.towns.map((t) => `<option value="${t.town}"></option>`).join("");
  $("metro").innerHTML = me.metros.map((name) => `<option>${name}</option>`).join("");
  if (me.settings.metro) $("metro").value = me.settings.metro;
  $("ticket-remain").textContent = `${me.remaining} left in this filter`;
  toggleCountry();
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

function persistFilters() {
  updateStore((current) => {
    current.settings = { ...current.settings, ...filters() };
    return current;
  });
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

function giveNext() {
  persistFilters();
  $("give").disabled = true;
  try {
    setTicket(nextPostcode(filters()));
    refreshRemaining();
  } finally {
    $("give").disabled = false;
  }
}

function refreshRemaining() {
  persistFilters();
  if (!state.ticket) $("ticket-remain").textContent = `${remainingCount(filters())} left in this filter`;
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
  el.querySelector("[data-status]")?.addEventListener("click", () => {
    updateStore((current) => {
      const row = current.leads.find((item) => item.id === lead.id);
      if (row) row.status = "contacted";
      return current;
    });
    loadSaved();
  });
  el.querySelector("[data-delete]")?.addEventListener("click", () => {
    updateStore((current) => {
      current.leads = current.leads.filter((row) => row.id !== lead.id);
      return current;
    });
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

async function startHunt(postcode) {
  if (!postcode) return;
  $("hunt-postcode").value = postcode;
  $("hunt-status").textContent = `Hunting ${postcode}…`;
  $("results").innerHTML = "";
  $("summary").classList.add("hidden");
  $("ig-links").classList.add("hidden");
  try {
    const data = await runHunt({
      postcode,
      modes: modes(),
      niche: $("niche").value,
      radius: 1600,
      onEvent: (event, payload) => {
        if (event === "status") $("hunt-status").textContent = payload.message;
        if (event === "instagramQuery") {
          $("ig-links").classList.remove("hidden");
          $("ig-links").innerHTML = `Instagram hunt: <a class="ghost" target="_blank" rel="noreferrer" href="${payload.googleUrl}">Google this query</a> <a class="ghost" target="_blank" rel="noreferrer" href="${payload.bingUrl}">Bing</a> — open a profile, if the bio has no website and no Fresha/Booksy/Treatwell, keep it.`;
        }
        if (event === "fail") $("hunt-status").textContent = payload.message;
      },
    });
    if (!data.ok) return;
    $("hunt-status").textContent = `Done. ${data.leads.length} leads around ${data.geo.display || postcode}.`;
    renderSummary(data.summary);
    renderResults(data.leads);
  } catch (err) {
    $("hunt-status").textContent = err.message || "Hunt failed.";
  }
}

function saveLeads(leads) {
  const incoming = Array.isArray(leads) ? leads : [leads];
  updateStore((current) => {
    for (const lead of incoming) {
      if (!lead?.name) continue;
      const id = lead.id || `saved-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const exists = current.leads.find(
        (row) => row.id === id || (row.name === lead.name && row.postcode === lead.postcode),
      );
      if (exists) continue;
      current.leads.unshift({
        ...lead,
        id,
        status: lead.status || "new",
        savedAt: new Date().toISOString(),
      });
    }
    return current;
  });
  $("hunt-status").textContent = `Saved ${incoming.length} lead${incoming.length === 1 ? "" : "s"}.`;
}

function loadSaved() {
  const leads = getStore().leads;
  const box = $("saved");
  box.innerHTML = "";
  if (!leads.length) {
    box.innerHTML = `<p class="hint">Nothing saved yet. Hunt, then keep the hot ones.</p>`;
    return;
  }
  leads.forEach((lead) => box.appendChild(card(lead, true)));
}

function loadUsed() {
  const given = getStore().given;
  const box = $("used");
  box.innerHTML = "";
  if (!given.length) {
    box.innerHTML = `<p class="hint">No codes given yet.</p>`;
    return;
  }
  given.forEach((row) => {
    const el = document.createElement("div");
    el.className = "used-row";
    el.innerHTML = `
      <strong>${escapeHtml(row.code)}</strong>
      <span>${escapeHtml([row.town, row.nation, row.givenAt?.slice(0, 10)].filter(Boolean).join(" · "))}</span>
      <button class="text">Restore</button>
    `;
    el.querySelector("button").addEventListener("click", () => {
      restoreGiven(row.compact);
      loadUsed();
      refreshRemaining();
    });
    box.appendChild(el);
  });
}

function downloadCsv() {
  const leads = getStore().leads;
  const cols = [
    "name",
    "score",
    "category",
    "address",
    "phone",
    "postcode",
    "google",
    "website",
    "instagram",
    "booking",
    "source",
    "status",
  ];
  const lines = [cols.join(",")];
  for (const lead of leads) {
    lines.push(cols.map((col) => `"${String(lead[col] ?? "").replace(/"/g, '""')}"`).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nwgb-leads.csv";
  a.click();
  URL.revokeObjectURL(url);
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
  if (code) startHunt(code);
});
$("undo").addEventListener("click", () => {
  const removed = undoLastGiven();
  $("ticket-code").textContent = removed?.code ? `undid ${removed.code}` : "—";
  state.ticket = null;
  refreshRemaining();
});
$("hunt-form").addEventListener("submit", (e) => {
  e.preventDefault();
  startHunt($("hunt-postcode").value.trim());
});
$("save-hot").addEventListener("click", () => {
  saveLeads(state.leads.filter((l) => l.score === "hot" || l.score === "warm"));
});
$("download-csv").addEventListener("click", downloadCsv);
$("lock-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pin = $("pin").value;
  if (await pinMatches(pin)) {
    sessionStorage.setItem("nwgb-pin", pin);
    $("lock").classList.add("hidden");
    $("lock-error").classList.add("hidden");
    await boot();
  } else {
    $("lock-error").classList.remove("hidden");
  }
});

async function boot() {
  if (location.protocol === "file:") {
    $("hunt-status").textContent =
      "This file is not the website. Use the GitHub Pages link or run npm start, then open http://localhost:3000.";
    return;
  }
  await initData();
  fillMe(meFromStore());
}

async function start() {
  const saved = sessionStorage.getItem("nwgb-pin") || "";
  if (saved && (await pinMatches(saved))) {
    $("lock").classList.add("hidden");
    await boot();
    return;
  }
  $("lock").classList.remove("hidden");
}

start();
