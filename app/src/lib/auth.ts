import { redirect } from "next/navigation";
import { auth0 } from "./auth0";
import { db } from "./db";
import { newId } from "./id";

export interface UserRow {
  id: string;
  auth0_id: string;
  email: string;
  name: string | null;
  stripe_customer_id: string | null;
  payment_method_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  default_plan: "charge_now" | "plan_30";
  created_at: number;
}

/**
 * Resolve the Auth0 session to a users row, creating/linking on first login.
 * Seeded rows with placeholder auth0_ids are adopted by matching email.
 */
export async function currentUser(): Promise<UserRow | null> {
  const session = await auth0.getSession();
  if (!session) return null;
  const sub = session.user.sub;
  const email = session.user.email ?? null;
  const name = session.user.name ?? null;

  const bySub = db.prepare("SELECT * FROM users WHERE auth0_id = ?");
  let row = bySub.get(sub) as UserRow | undefined;
  if (!row && email) {
    const seeded = db
      .prepare(
        "SELECT * FROM users WHERE email = ? AND auth0_id LIKE 'REPLACE_ME%'"
      )
      .get(email) as UserRow | undefined;
    if (seeded) {
      db.prepare("UPDATE users SET auth0_id = ? WHERE id = ?").run(sub, seeded.id);
      row = bySub.get(sub) as UserRow;
    }
  }
  if (!row) {
    const id = newId("usr");
    db.prepare(
      `INSERT INTO users (id, auth0_id, email, name, default_plan, created_at)
       VALUES (?, ?, ?, ?, 'charge_now', ?)`
    ).run(id, sub, email ?? `${sub}@unknown`, name, Date.now());
    row = bySub.get(sub) as UserRow;
  }
  return row!;
}

/** For pages: redirect to login when signed out. */
export async function requireUserPage(): Promise<UserRow> {
  const user = await currentUser();
  if (!user) redirect("/auth/login");
  return user;
}

/** For API routes: null → caller returns 401. */
export async function requireUserApi(): Promise<UserRow | null> {
  return currentUser();
}

/**
 * §7.6 — server-side step-up check: the session's `amr` claim must include
 * "mfa". Checked on execute when the total exceeds STEP_UP_THRESHOLD_CENTS,
 * bypassed by AUTH0_SKIP_STEPUP=true.
 */
export async function sessionHasMfa(): Promise<boolean> {
  const session = await auth0.getSession();
  if (!session) return false;
  const userAmr = (session.user as { amr?: string[] }).amr;
  if (Array.isArray(userAmr) && userAmr.includes("mfa")) return true;
  const idToken = (session as unknown as { tokenSet?: { idToken?: string } })
    .tokenSet?.idToken;
  if (idToken) {
    try {
      const payload = JSON.parse(
        Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")
      ) as { amr?: string[] };
      if (Array.isArray(payload.amr) && payload.amr.includes("mfa")) return true;
    } catch {
      /* unparseable token → no MFA */
    }
  }
  return false;
}

/** True when the user is a member (accepted or invited) of the group. */
export function isMember(groupId: string, userId: string): boolean {
  return !!db
    .prepare("SELECT 1 FROM memberships WHERE group_id = ? AND user_id = ?")
    .get(groupId, userId);
}
