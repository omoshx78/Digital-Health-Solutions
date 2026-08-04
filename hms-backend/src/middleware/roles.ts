import { Response, NextFunction } from "express";
import { AuthedRequest } from "./auth";

/**
 * Restricts a route to specific roles. ADMIN always passes, since admins
 * need to be able to fix things across every department.
 *
 * Usage: router.post("/x", requireAuth, requireRole("DOCTOR"), handler)
 */
export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (req.user.role === "ADMIN" || roles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({
      error: `This action requires one of the following roles: ${roles.join(", ")}`,
    });
  };
}
