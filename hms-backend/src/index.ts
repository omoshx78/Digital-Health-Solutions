import "dotenv/config";
import express from "express";
import "express-async-errors";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import patientRoutes from "./routes/patients.routes";
import encounterRoutes from "./routes/encounters.routes";
import queueRoutes from "./routes/queue.routes";
import inventoryRoutes from "./routes/inventory.routes";
import theatreRoutes from "./routes/theatre.routes";
import wardRoutes from "./routes/wards.routes";
import reportRoutes from "./routes/reports.routes";
import chargesRoutes from "./routes/charges.routes";
import publicRoutes from "./routes/public.routes";
import reseedOnceRoutes from "./routes/reseed-once.routes";

const app = express();

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim().replace(/\/+$/, ""))
  : "*";

console.log("CORS allowed origins:", corsOrigin);

const corsOptions: cors.CorsOptions = { origin: corsOrigin };

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // explicit preflight handling
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/patients", patientRoutes);
app.use("/encounters", encounterRoutes);
app.use("/queue", queueRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/theatre", theatreRoutes);
app.use("/wards", wardRoutes);
app.use("/reports", reportRoutes);
app.use("/charges", chargesRoutes);
app.use("/public", publicRoutes);
app.use("/reseed-once", reseedOnceRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);

  // Prisma "known request errors" carry a code we can translate into
  // something a staff member can actually act on, instead of a generic
  // 500 that leaves them stuck.
  if (err?.code === "P2002") {
    return res.status(409).json({ error: "This conflicts with an existing record (duplicate entry). Refresh and try again." });
  }
  if (err?.code === "P2025") {
    return res.status(404).json({ error: "The record being updated no longer exists — it may have been changed by someone else. Refresh and try again." });
  }
  if (err?.code === "P2003") {
    return res.status(400).json({ error: "This action refers to a record that no longer exists. Refresh and try again." });
  }

  res.status(500).json({ error: "Something went wrong on the server. If this keeps happening, check the server logs." });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`DHS API listening on port ${port}`));
