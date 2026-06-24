export interface FailureCard {
  id: string;
  title: string;
  one_line: string;
  scenario: string;
  tags: string[];
  tech_domains: string[];
  severity: string;
  happened_at: string;
  context: string;
  what_happened: string;
  root_cause: string;
  impact: string;
  warning_signals: string[];
  checklist: string[];
  resolution: string;
  anonymized: boolean;
  owner_team: string;
  source_type: string;
}

export interface SearchHit {
  card: FailureCard;
  score: number;
}

export interface MatchedFailure {
  id: string;
  title: string;
  similarity: number;
  why_relevant: string;
}

export interface RiskAlert {
  risk: string;
  from_card: string;
  from_title: string;
  severity: string;
}

export interface SystemicPattern {
  id: string;
  name: string;
  principle: string;
  systemic_risk: string;
  count: number;
  domains: string[];
  matched_card_ids: string[];
}

export interface RiskReport {
  requirement: string;
  normalized: Record<string, unknown>;
  matched_failures: MatchedFailure[];
  risk_alerts: RiskAlert[];
  pre_launch_checklist: string[];
  questions_to_think: string[];
  systemic_patterns: SystemicPattern[];
  llm_used: boolean;
}

export interface GraphNode {
  id: string;
  title: string;
  one_line: string;
  scenario: string;
  severity: string;
  tags: string[];
  tech_domains: string[];
  cluster: string;
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  shared: string[];
}

export interface FailurePattern {
  id: string;
  name: string;
  principle: string;
  systemic_risk: string;
  member_ids: string[];
  domains: string[];
  scenarios: string[];
  count: number;
  severity_max: string;
  llm_used: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  patterns: FailurePattern[];
  llm_used: boolean;
}

export interface CuratorMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CuratorChatResponse {
  answer: string;
  cited_card_ids: string[];
  tool_trace: string[];
  llm_used: boolean;
}

export interface Stats {
  total: number;
  by_scenario: Record<string, number>;
  by_severity: Record<string, number>;
  top_tags: [string, number][];
}

export interface Health {
  status: string;
  llm_enabled: boolean;
  embed_enabled: boolean;
  chat_model: string;
  embed_model: string;
}

const BASE = "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => req<Health>("/health"),
  listCards: () => req<FailureCard[]>("/cards"),
  getCard: (id: string) => req<FailureCard>(`/cards/${id}`),
  stats: () => req<Stats>("/cards/stats"),
  search: (query: string, top_k = 8) =>
    req<SearchHit[]>("/search", {
      method: "POST",
      body: JSON.stringify({ query, top_k }),
    }),
  riskCheck: (requirement: string, context = "", top_k = 5) =>
    req<RiskReport>("/risk-check", {
      method: "POST",
      body: JSON.stringify({ requirement, context, top_k }),
    }),
  ingestDraft: (raw_text: string, source_type = "pasted-text") =>
    req<FailureCard>("/cards/ingest", {
      method: "POST",
      body: JSON.stringify({ raw_text, source_type }),
    }),
  createCard: (card: FailureCard) =>
    req<FailureCard>("/cards", {
      method: "POST",
      body: JSON.stringify(card),
    }),
  graph: (llm = true) => req<GraphData>(`/graph?llm=${llm ? 1 : 0}`),
  curatorChat: (messages: CuratorMessage[]) =>
    req<CuratorChatResponse>("/curator/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    }),
};

export interface SSEHandlers {
  onStatus?: (text: string) => void;
  onToken?: (text: string) => void;
  onMatched?: (data: {
    matched_failures: MatchedFailure[];
    systemic_patterns: SystemicPattern[];
  }) => void;
  onDone?: (data: unknown) => void;
  onError?: (err: string) => void;
}

/**
 * POST to an SSE endpoint and dispatch parsed `event:`/`data:` frames to the
 * provided handlers as they arrive. Uses the native fetch stream reader, so no
 * extra dependency is required.
 */
export async function streamSSE(
  path: string,
  body: unknown,
  handlers: SSEHandlers,
): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (event: string, data: any) => {
    switch (event) {
      case "status":
        handlers.onStatus?.(String(data?.text ?? ""));
        break;
      case "token":
        handlers.onToken?.(String(data?.text ?? ""));
        break;
      case "matched":
        handlers.onMatched?.(data);
        break;
      case "done":
        handlers.onDone?.(data);
        break;
      case "error":
        handlers.onError?.(String(data?.text ?? data ?? "unknown error"));
        break;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      let event = "message";
      let dataStr = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
      }
      if (!dataStr) continue;
      try {
        dispatch(event, JSON.parse(dataStr));
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}

export const CLUSTER_COLORS = [
  "#d8613f",
  "#3f86c4",
  "#cf5d7a",
  "#4fa564",
  "#8b6fd0",
  "#cf9a3f",
  "#3fa8a0",
  "#c95fa8",
];

export function clusterColor(cluster: string): string {
  const idx = parseInt(cluster.replace(/[^0-9]/g, ""), 10);
  if (Number.isNaN(idx)) return CLUSTER_COLORS[0];
  return CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
}

export const SEVERITY_COLORS: Record<string, string> = {
  P0: "bg-red-500/15 text-red-700 border-red-500/30",
  P1: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  P2: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  P3: "bg-sky-500/15 text-sky-700 border-sky-500/30",
};

export function severityClass(sev: string): string {
  return SEVERITY_COLORS[sev] || "bg-ink-700 text-gray-300 border-ink-600";
}
