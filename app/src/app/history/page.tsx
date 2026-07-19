import { db } from "@/lib/db";
import { balances, isBalanced } from "@/lib/ledger";
import { fmt } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

interface TxnRow {
  id: string;
  split_id: string | null;
  kind: string;
  created_at: number;
}
interface EntryRow {
  id: string;
  txn_id: string;
  account: string;
  direction: "debit" | "credit";
  amount_cents: number;
}

// Plain-English labels for the double-entry internals. Display-only — the
// stored kind/account strings are load-bearing for the balance math.
const KIND_LABELS: Record<string, string> = {
  member_charge: "Card charged",
  float_advance: "SunPay covered it",
  merchant_settlement: "Merchant paid",
  repayment: "Repayment",
};

export default function HistoryPage() {
  const txns = db
    .prepare("SELECT * FROM ledger_txns ORDER BY created_at DESC, id")
    .all() as TxnRow[];
  const entries = db
    .prepare("SELECT * FROM ledger_entries")
    .all() as EntryRow[];
  const byTxn = new Map<string, EntryRow[]>();
  for (const e of entries) {
    if (!byTxn.has(e.txn_id)) byTxn.set(e.txn_id, []);
    byTxn.get(e.txn_id)!.push(e);
  }
  const bals = balances();
  const balanced = isBalanced();

  // Resolve the ids embedded in account keys / splits to human names.
  const userNames = new Map<string, string>();
  for (const u of db
    .prepare("SELECT id, name, email FROM users")
    .all() as { id: string; name: string | null; email: string }[]) {
    userNames.set(u.id, u.name ?? u.email);
  }
  const merchantNames = new Map<string, string>();
  for (const s of db
    .prepare("SELECT id, merchant_name FROM splits")
    .all() as { id: string; merchant_name: string }[]) {
    merchantNames.set(s.id, s.merchant_name);
  }

  function accountLabel(account: string): string {
    const [prefix, ref] = account.split(":");
    const who = ref ? userNames.get(ref) ?? ref : "";
    switch (prefix) {
      case "cash":
        return "SunPay cash";
      case "float_payable":
        return "SunPay float (outstanding)";
      case "member_funds_held":
        return `Held for ${who}`;
      case "member_receivable":
        return `${who} owes SunPay`;
      case "merchant_payable":
        return `Owed to ${merchantNames.get(ref) ?? ref}`;
      default:
        return account;
    }
  }
  const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">History</h1>
        {balanced ? (
          <Badge className="bg-green-600 text-white hover:bg-green-600">
            Everything adds up ✓
          </Badge>
        ) : (
          <Badge variant="destructive">Doesn&rsquo;t add up ✗</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Balances</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(bals).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(bals).map(([account, bal]) => (
                  <TableRow key={account}>
                    <TableCell className="text-sm">
                      {accountLabel(account)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmt(bal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity ({txns.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {txns.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          )}
          {txns.map((t) => {
            const merchant = t.split_id ? merchantNames.get(t.split_id) : null;
            return (
              <div key={t.id} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center gap-2 text-sm">
                  <Badge variant="outline">{kindLabel(t.kind)}</Badge>
                  {merchant && (
                    <span className="text-xs text-muted-foreground">
                      {merchant}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleString()}
                  </span>
                </div>
                <Table>
                  <TableBody>
                    {(byTxn.get(t.id) ?? []).map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="w-12 text-xs uppercase text-muted-foreground">
                          {e.direction === "debit" ? "In" : "Out"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {accountLabel(e.account)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(e.amount_cents)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </main>
  );
}
