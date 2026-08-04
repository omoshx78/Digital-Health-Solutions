import { Router } from "express";
import { execSync } from "child_process";

const router = Router();

// TEMPORARY — remove this file (and its two lines in index.ts) once
// pricing is confirmed populated. Guarded by JWT_SECRET so it can't be
// hit by anyone who doesn't already have admin-level access to your env vars.
router.get("/", (req, res) => {
  if (req.query.key !== process.env.JWT_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const output = execSync("npm run seed", { cwd: process.cwd(), stdio: "pipe" }).toString();
    res.type("text/plain").send(output || "(no output, but command succeeded)");
  } catch (err: any) {
    const stdout = err.stdout ? err.stdout.toString() : "";
    const stderr = err.stderr ? err.stderr.toString() : "";
    res.status(500).type("text/plain").send(
      `--- STDOUT ---\n${stdout}\n\n--- STDERR ---\n${stderr}\n\n--- MESSAGE ---\n${err.message}`
    );
  }
});

export default router;
