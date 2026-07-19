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

export default function LedgerPage() {
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

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Ledger</h1>
        {balanced ? (
          <Badge className="bg-green-600 text-white hover:bg-green-600">
            BOOKS BALANCED ✓
          </Badge>
        ) : (
          <Badge variant="destructive">BOOKS UNBALANCED ✗</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account balances</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(bals).length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">
                    Balance (debit − credit)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(bals).map(([account, bal]) => (
                  <TableRow key={account}>
                    <TableCell className="font-mono text-sm">{account}</TableCell>
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
          <CardTitle>Transactions ({txns.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {txns.length === 0 && (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          )}
          {txns.map((t) => (
            <div key={t.id} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2 text-sm">
                <Badge variant="outline">{t.kind}</Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  {t.id}
                  {t.split_id ? ` · ${t.split_id}` : ""}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(t.created_at).toLocaleString()}
                </span>
              </div>
              <Table>
                <TableBody>
                  {(byTxn.get(t.id) ?? []).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="w-20 text-xs uppercase text-muted-foreground">
                        {e.direction}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {e.account}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt(e.amount_cents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
