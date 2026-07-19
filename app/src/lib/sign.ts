import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA256 over sorted `key=value` pairs joined with `&` (§7.3).
 * The merchant signs the handoff URL; SunPay signs the settlement callback.
 */
export function signParams(
  params: Record<string, string | number>,
  secret = process.env.SDK_SHARED_SECRET!
): string {
  const canonical = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

export function verifyParams(
  params: Record<string, string | number>,
  sig: string,
  secret = process.env.SDK_SHARED_SECRET!
): boolean {
  const expected = signParams(params, secret);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig ?? "", "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
