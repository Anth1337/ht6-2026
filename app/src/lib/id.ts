import { randomUUID } from "node:crypto";

/** Prefixed ids like `usr_1a2b3c4d5e6f` for debuggability. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
