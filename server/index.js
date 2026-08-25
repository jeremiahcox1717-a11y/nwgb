import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 3000);

const app = express();
app.disable("x-powered-by");
app.use("/server", express.static(path.join(ROOT, "server"), { extensions: ["js"] }));
app.use("/data", express.static(path.join(ROOT, "data")));
app.use(express.static(path.join(ROOT, "public")));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/server") || req.path.startsWith("/data")) {
    return next();
  }
  res.sendFile(path.join(ROOT, "public", "index.html"));
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("NWGB desk is running.");
  console.log(`Open this in your browser:  http://localhost:${PORT}`);
  console.log("Leave this window open while you use it.");
  console.log("");
});

export { app, server };
