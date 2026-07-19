import { NextRequest, NextResponse } from "next/server";
import { requireUserApi, sessionHasMfa } from "@/lib/auth";
import { db } from "@/lib/db";
import { executeSplit, type SplitRow } from "@/lib/engine";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUserApi();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const split = db.prepare("SELECT * FROM splits WHERE id = ?").get(id) as
    | SplitRow
    | undefined;
  if (!split) return NextResponse.json({ error: "not found" }, { status: 404 });

  // §7.4 — execute requires the organizer's session.
  const group = db
    .prepare("SELECT organizer_id FROM groups WHERE id = ?")
    .get(split.group_id) as { organizer_id: string };
  if (group.organizer_id !== user.id) {
    return NextResponse.json({ error: "organizer only" }, { status: 403 });
  }

  // §7.6 — step-up MFA above the threshold (AUTH0_SKIP_STEPUP escape hatch).
  const threshold = Number(process.env.STEP_UP_THRESHOLD_CENTS ?? 50000);
  const skipStepUp = process.env.AUTH0_SKIP_STEPUP === "true";
  if (split.total_cents > threshold && !skipStepUp && !(await sessionHasMfa())) {
    return NextResponse.json(
      { error: "mfa_required", detail: "step-up MFA required for this amount" },
      { status: 403 }
    );
  }

  const result = await executeSplit(id);
  return NextResponse.json(result);
}
