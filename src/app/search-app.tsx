"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CATEGORIES } from "@/lib/categories";
import { toCsv, type PlaceHit } from "@/lib/places";

type CategoryOption = { id: string; label: string };

type SearchResponse = {
  locationLabel?: string;
  category?: string;
  scanned?: number;
  leads?: PlaceHit[];
  error?: string;
};

const DEFAULT_CATEGORIES: CategoryOption[] = [
  { id: "quick", label: "All kinds (quick scan)" },
  ...CATEGORIES.map((item) => ({ id: item.id, label: item.label })),
];

export function SearchApp() {
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("quick");
  const [treatSocialAsNoWebsite, setTreatSocialAsNoWebsite] = useState(true);
  const [categories, setCategories] = useState<CategoryOption[]>(DEFAULT_CATEGORIES);
  const [leads, setLeads] = useState<PlaceHit[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [locationLabel, setLocationLabel] = useState("");
  const [scanned, setScanned] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [mapsKeySet, setMapsKeySet] = useState(true);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    void Promise.all([
      fetch("/api/status").then((res) => res.json()),
      fetch("/api/categories").then((res) => res.json()),
    ]).then(([statusBody, categoryBody]) => {
      setMapsKeySet(Boolean(statusBody.mapsKeySet));
      if (Array.isArray(categoryBody.categories)) {
        setCategories(categoryBody.categories);
      }
    });
  }, []);

  const sortedLeads = useMemo(() => {
    return [...leads].sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
  }, [leads]);

  async function runSearch(categoryIds: string[], event?: FormEvent) {
    event?.preventDefault();
    const query = location.trim();
    if (query.length < 2) {
      setError("Enter a city or a postal code.");
      return;
    }

    setBusy(true);
    setError("");
    setStatus("");
    setLeads([]);
    setSeen(new Set());
    setScanned(0);
    setLocationLabel("");

    const nextSeen = new Set<string>();
    const nextLeads: PlaceHit[] = [];
    let nextScanned = 0;
    let resolvedLabel = "";

    try {
      for (let index = 0; index < categoryIds.length; index += 1) {
        const current = categoryIds[index];
        const label =
          categories.find((item) => item.id === current)?.label || current;
        setProgress(
          `Searching ${label} (${index + 1} of ${categoryIds.length})…`,
        );

        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: query,
            category: current,
            treatSocialAsNoWebsite,
          }),
        });
        const data = (await response.json()) as SearchResponse;
        if (!response.ok) {
          throw new Error(data.error || "Search failed.");
        }

        resolvedLabel = data.locationLabel || resolvedLabel;
        nextScanned += data.scanned ?? 0;
        for (const lead of data.leads ?? []) {
          if (nextSeen.has(lead.id)) continue;
          nextSeen.add(lead.id);
          nextLeads.push(lead);
        }

        setLocationLabel(resolvedLabel);
        setScanned(nextScanned);
        setSeen(new Set(nextSeen));
        setLeads([...nextLeads]);
      }

      setStatus(
        nextLeads.length
          ? `Found ${nextLeads.length} Google listing${nextLeads.length === 1 ? "" : "s"} without a real website.`
          : "Google returned listings, but none were missing a website in this pass.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  function downloadCsv() {
    const blob = new Blob([toCsv(sortedLeads)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nwgb-${(locationLabel || location || "leads").replace(/\W+/g, "-").toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  async function copyPhone(phone: string) {
    if (!phone) return;
    await navigator.clipboard.writeText(phone);
  }

  const sweepIds = CATEGORIES.map((item) => item.id);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="mark">
            NW<span>GB</span>
          </div>
          <div className="whisper">Private · not indexed · password only</div>
        </div>
        <button className="ghost" type="button" onClick={() => void logout()}>
          Lock
        </button>
      </header>

      <section className="hero">
        <h1>Google businesses with no website.</h1>
        <p>
          Type a city or a postal code. This pulls Google Business listings in
          that area and keeps the ones that have not published a website.
        </p>
      </section>

      <form className="panel" onSubmit={(event) => void runSearch([category], event)}>
        <div className="grid">
          <div>
            <label htmlFor="location">City or postal code</label>
            <input
              id="location"
              type="text"
              placeholder="Austin TX, M5V 2T6, or 90210"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="category">Trade / category</label>
            <select
              id="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="checks">
          <input
            type="checkbox"
            checked={treatSocialAsNoWebsite}
            onChange={(event) => setTreatSocialAsNoWebsite(event.target.checked)}
          />
          Count Facebook / Instagram / Yelp-only pages as no website
        </label>

        {!mapsKeySet ? (
          <div className="banner">
            Add GOOGLE_MAPS_API_KEY with Places API (New) and Geocoding API
            enabled. Until then, searches cannot run.
          </div>
        ) : null}

        {error ? <div className="banner">{error}</div> : null}
        {progress ? <p className="whisper" style={{ marginTop: 14 }}>{progress}</p> : null}

        <div className="actions">
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Searching…" : "Search this"}
          </button>
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() => void runSearch(["quick"])}
          >
            Quick city scan
          </button>
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() => void runSearch(sweepIds)}
          >
            Sweep common trades
          </button>
          <button
            className="secondary"
            type="button"
            disabled={sortedLeads.length === 0}
            onClick={downloadCsv}
          >
            Download CSV
          </button>
        </div>
      </form>

      <div className="stats">
        <span>
          Area <strong>{locationLabel || "—"}</strong>
        </span>
        <span>
          Listings checked <strong>{scanned}</strong>
        </span>
        <span>
          No website <strong>{seen.size}</strong>
        </span>
      </div>
      {status ? <p className="whisper">{status}</p> : null}

      <section className="list" style={{ marginTop: 18 }}>
        {sortedLeads.length === 0 && !busy ? (
          <div className="empty">
            Nothing here yet. Search a city like “Chicago” or a postal code like
            “M5V 2T6”. Google will not return every business that exists, so a
            category sweep finds more than a single quick scan.
          </div>
        ) : null}

        {sortedLeads.map((lead) => (
          <article key={lead.id} className="card">
            <div>
              <h2>{lead.name}</h2>
              <div className="meta">
                {lead.address || "No address on the listing"}
                <br />
                {lead.phone || "No phone on the listing"}
                {lead.rating != null
                  ? ` · ${lead.rating.toFixed(1)} (${lead.reviewCount ?? 0} reviews)`
                  : ""}
                {lead.primaryType ? ` · ${lead.primaryType}` : ""}
              </div>
              <span className={lead.websiteKind === "social" ? "tag social" : "tag"}>
                {lead.websiteKind === "social" ? "Social only" : "No website"}
              </span>
            </div>
            <div className="side">
              {lead.phone ? (
                <button type="button" onClick={() => void copyPhone(lead.phone)}>
                  Copy phone
                </button>
              ) : null}
              {lead.mapsUrl ? (
                <a href={lead.mapsUrl} target="_blank" rel="noreferrer">
                  Google listing
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
