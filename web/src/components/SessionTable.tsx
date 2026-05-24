import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useUsageStore } from "@/store/usage-store";
import { formatCost, formatNumber, cn } from "@/lib/utils";

type SortKey = "period" | "agent" | "totalTokens" | "totalCost" | "lastActivity";

export function SessionTable() {
  const sessions = useUsageStore((s) => s.snapshot?.session.records ?? []);
  const [q, setQ] = useState("");
  const [agent, setAgent] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("totalCost");
  const [desc, setDesc] = useState(true);

  const agents = useMemo(() => Array.from(new Set(sessions.map((s) => s.agent))).sort(), [sessions]);

  const rows = useMemo(() => {
    let r = sessions;
    if (agent) r = r.filter((s) => s.agent === agent);
    if (q.trim()) {
      const lq = q.toLowerCase();
      r = r.filter((s) => s.period.toLowerCase().includes(lq) || s.modelsUsed.some((m) => m.toLowerCase().includes(lq)));
    }
    const get = (x: typeof r[number]) => {
      if (sortKey === "lastActivity") return x.metadata?.lastActivity ?? "";
      const v = (x as any)[sortKey];
      return typeof v === "number" ? v : String(v ?? "");
    };
    return [...r].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (av < bv) return desc ? 1 : -1;
      if (av > bv) return desc ? -1 : 1;
      return 0;
    });
  }, [sessions, agent, q, sortKey, desc]);

  function header(label: string, key: SortKey) {
    return (
      <TH>
        <button
          className={cn("inline-flex items-center gap-1 hover:text-foreground", sortKey === key && "text-foreground")}
          onClick={() => { if (sortKey === key) setDesc(!desc); else { setSortKey(key); setDesc(true); } }}
        >
          {label}{sortKey === key && <span className="text-[10px]">{desc ? "▼" : "▲"}</span>}
        </button>
      </TH>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base text-foreground">Sessions</CardTitle>
        <div className="flex items-center gap-2">
          <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-44" />
          <select
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
          >
            <option value="">all agents</option>
            {agents.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <THead>
            <TR>
              {header("Session", "period")}
              {header("Agent", "agent")}
              {header("Tokens", "totalTokens")}
              {header("Cost", "totalCost")}
              {header("Last activity", "lastActivity")}
              <TH>Models</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((s) => (
              <TR key={`${s.agent}:${s.period}`}>
                <TD className="font-mono text-xs truncate max-w-[180px]" title={s.period}>{s.period}</TD>
                <TD>{s.agent}</TD>
                <TD className="font-mono tabular-nums">{formatNumber(s.totalTokens)}</TD>
                <TD className="font-mono tabular-nums">{formatCost(s.totalCost)}</TD>
                <TD className="text-xs text-muted-foreground">{s.metadata?.lastActivity ?? "—"}</TD>
                <TD className="text-xs text-muted-foreground truncate max-w-[200px]" title={s.modelsUsed.join(", ")}>{s.modelsUsed.join(", ")}</TD>
              </TR>
            ))}
            {rows.length === 0 && (
              <TR><TD colSpan={6} className="text-center text-sm text-muted-foreground">No sessions match</TD></TR>
            )}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
