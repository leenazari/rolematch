import "server-only";
import { createHash } from "node:crypto";
export function validReportAccess(id: unknown, token: unknown): boolean {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) &&
    typeof token === "string" && /^[0-9a-f]{64}$/i.test(token);
}
export function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
