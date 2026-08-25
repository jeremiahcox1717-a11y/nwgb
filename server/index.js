import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { getStore, updateStore } from "./store.js";
import {
  nextPostcode,
  undoLastGiven,
  restoreGiven,
  remainingCount,
  markGiven,
  placeCatalog,
  citiesFor,
} from "./postcodes.js";
import { huntSse, runHunt } from "./hunt.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();
const PORT = Number(process.env.PORT || 3000);
const PIN = String(process.env.APP_PIN || "").trim();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  if (!PIN) return next();
  if (req.path === "/api/unlock" || req.path === "/api/health") return next();
  if (req.path.startsWith("/api/")) {
    if (req.get("x-desk-pin") === PIN || req.query.pin === PIN) return next();
    return res.status(401).json({ error: "pin" });
  }
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/me", (_req, res) => {
  const store = getStore();
  res.json({
    ownerName: store.ownerName || process.env.OWNER_NAME || "Jordan",
    pinRequired: Boolean(PIN),
    hasGoogleKey: Boolean(process.env.GOOGLE_PLACES_API_KEY),
    settings: store.settings,
    givenCount: store.given.length,
    leadCount: store.leads.length,
    remaining: remainingCount(store.settings),
    ...placeCatalog(),
  });
});

app.get("/api/places/cities", (req, res) => {
  res.json({
    cities: citiesFor({
      continent: req.query.continent || "",
      language: req.query.language || "",
      country: req.query.country || "",
    }),
  });
});

app.post("/api/unlock", (req, res) => {
  if (!PIN) return res.json({ ok: true });
  if (String(req.body?.pin || "") === PIN) return res.json({ ok: true });
  return res.status(401).json({ ok: false });
});

app.post("/api/settings", (req, res) => {
  const store = updateStore((current) => {
    if (req.body?.ownerName) current.ownerName = String(req.body.ownerName).slice(0, 40);
    current.settings = { ...current.settings, ...(req.body?.settings || {}) };
    return current;
  });
  res.json({ settings: store.settings, ownerName: store.ownerName });
});

app.get("/api/postcodes/next", (req, res) => {
  const store = getStore();
  const filters = {
    continent: req.query.continent || store.settings.continent || "",
    language: req.query.language || store.settings.language || "",
    country: req.query.country || store.settings.country || "",
    city: req.query.city || store.settings.city || "",
  };
  updateStore((current) => {
    current.settings = { ...current.settings, ...filters };
    return current;
  });
  const ticket = nextPostcode(filters);
  res.json(ticket);
});

app.get("/api/postcodes/remaining", (req, res) => {
  const store = getStore();
  const filters = {
    continent: req.query.continent || store.settings.continent || "",
    language: req.query.language || store.settings.language || "",
    country: req.query.country || store.settings.country || "",
    city: req.query.city || store.settings.city || "",
  };
  res.json({ remaining: remainingCount(filters) });
});

app.get("/api/postcodes/used", (_req, res) => {
  res.json({ given: getStore().given });
});

app.post("/api/postcodes/undo", (_req, res) => {
  res.json({ removed: undoLastGiven() });
});

app.post("/api/postcodes/restore", (req, res) => {
  res.json({ restored: restoreGiven(req.body?.compact || req.body?.code) });
});

app.post("/api/postcodes/mark", (req, res) => {
  res.json({ marked: markGiven(req.body?.code, req.body || {}) });
});

app.get("/api/hunt/stream", (req, res) => huntSse(req, res));

app.post("/api/hunt", async (req, res) => {
  try {
    const result = await runHunt({
      postcode: req.body?.postcode,
      modes: req.body?.modes,
      niche: req.body?.niche,
      radius: req.body?.radius,
      onEvent: () => {},
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/leads", (_req, res) => {
  res.json({ leads: getStore().leads });
});

app.post("/api/leads", (req, res) => {
  const incoming = Array.isArray(req.body?.leads) ? req.body.leads : [req.body];
  const store = updateStore((current) => {
    for (const lead of incoming) {
      if (!lead?.name) continue;
      const id = lead.id || `saved-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const exists = current.leads.find((row) => row.id === id || (row.name === lead.name && row.postcode === lead.postcode));
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
  res.json({ leads: store.leads });
});

app.patch("/api/leads/:id", (req, res) => {
  const store = updateStore((current) => {
    const lead = current.leads.find((row) => row.id === req.params.id);
    if (lead) Object.assign(lead, req.body || {});
    return current;
  });
  res.json({ leads: store.leads });
});

app.delete("/api/leads/:id", (req, res) => {
  const store = updateStore((current) => {
    current.leads = current.leads.filter((row) => row.id !== req.params.id);
    return current;
  });
  res.json({ leads: store.leads });
});

app.get("/api/leads.csv", (_req, res) => {
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
    lines.push(
      cols
        .map((col) => `"${String(lead[col] ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=nwgb-leads.csv");
  res.send(lines.join("\n"));
});

app.use(express.static(path.join(ROOT, "public")));

app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(ROOT, "public", "index.html"));
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`NWGB desk on http://localhost:${PORT}`);
});

export { app, server };
