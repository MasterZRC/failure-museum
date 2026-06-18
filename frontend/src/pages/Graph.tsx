import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ForceGraph2D from "react-force-graph-2d";
import { api, clusterColor, FailurePattern, GraphData, GraphNode } from "../api";
import { Spinner } from "../components/Spinner";

type Pt = { x: number; y: number };
type FGNode = GraphNode & Partial<Pt>;

function nodeRadius(n: GraphNode): number {
  const sev = n.severity === "P0" ? 3 : n.severity === "P1" ? 2 : 0;
  return 5 + Math.min(n.degree, 4) + sev;
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function convexHull(pts: Pt[]): Pt[] {
  if (pts.length <= 2) return pts.slice();
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0)
      lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0)
      upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export default function Graph() {
  const navigate = useNavigate();
  const fgRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const didFit = useRef(false);
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCluster, setActiveCluster] = useState<string | null>(null);
  const [hoverCluster, setHoverCluster] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [dims, setDims] = useState({ w: 800, h: 580 });

  useEffect(() => {
    api
      .graph()
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [loading]);

  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] };
    return {
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.edges.map((e) => ({ ...e })),
    };
  }, [data]);

  // tuned forces so clusters separate cleanly instead of forming a hairball
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !data) return;
    didFit.current = false;
    const charge = fg.d3Force("charge");
    if (charge) charge.strength(-240).distanceMax(420);
    const link = fg.d3Force("link");
    if (link) link.distance((l: any) => 36 + (1 - (l.weight || 0)) * 80).strength(0.45);
    fg.d3ReheatSimulation?.();
  }, [data]);

  const patterns = useMemo(
    () => (data ? [...data.patterns].sort((a, b) => b.count - a.count) : []),
    [data]
  );

  const memberIds = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    patterns.forEach((p) => (map[p.id] = new Set(p.member_ids)));
    return map;
  }, [patterns]);

  const adjacency = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    data?.edges.forEach((e) => {
      (m[e.source] ||= new Set()).add(e.target);
      (m[e.target] ||= new Set()).add(e.source);
    });
    return m;
  }, [data]);

  const focusedCluster = activeCluster ?? hoverCluster;

  function nodeActive(n: GraphNode): boolean {
    if (hoverNode) return n.id === hoverNode || !!adjacency[hoverNode]?.has(n.id);
    if (focusedCluster) return n.cluster === focusedCluster;
    return true;
  }

  function smoothFit(padding = 70, filter?: (n: FGNode) => boolean) {
    const fg = fgRef.current;
    if (!fg) return;
    requestAnimationFrame(() => fg.zoomToFit(700, padding, filter || (() => true)));
  }

  function focusCluster(p: FailurePattern) {
    const next = activeCluster === p.id ? null : p.id;
    setActiveCluster(next);
    setSelectedNode(null);
    if (next) {
      const ids = memberIds[p.id];
      smoothFit(90, (n) => ids.has(n.id));
    } else {
      smoothFit(70);
    }
  }

  function clearFocus() {
    setActiveCluster(null);
    setSelectedNode(null);
    smoothFit(70);
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-serif text-2xl text-gray-100">失败基因图谱</h1>
        <p className="mt-2 text-gray-400 max-w-3xl">
          每个节点是一次失败，连线代表它们在
          <span className="text-brass-400">机制根因</span>
          上彼此相似。系统据此聚类出
          <span className="text-brass-400">「失败模式」</span>
          —— 当同一种坑反复出现、横跨多个业务域，它就是组织级的系统性风险。
        </p>
      </section>

      {loading ? (
        <Spinner label="正在绘制失败基因图谱…" />
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-700 text-sm">
          加载失败：{error}
        </div>
      ) : !data || data.nodes.length === 0 ? (
        <p className="text-gray-500">馆藏为空，先去「录入失败」添加一些失败卡。</p>
      ) : (
        <div className="grid lg:grid-cols-[1fr_340px] gap-5">
          {/* graph canvas */}
          <div
            ref={wrapRef}
            className="relative h-[580px] rounded-2xl border border-ink-700 bg-ink-900/40 overflow-hidden card-shadow"
            style={{ cursor: hoverNode ? "pointer" : "grab" }}
          >
            <ForceGraph2D
              ref={fgRef}
              graphData={graphData}
              width={dims.w}
              height={dims.h}
              backgroundColor="rgba(0,0,0,0)"
              nodeId="id"
              cooldownTicks={140}
              d3AlphaDecay={0.035}
              d3VelocityDecay={0.32}
              warmupTicks={20}
              onEngineStop={() => {
                if (!didFit.current) {
                  didFit.current = true;
                  fgRef.current?.zoomToFit(600, 70);
                }
              }}
              onBackgroundClick={clearFocus}
              onRenderFramePre={(ctx: any, globalScale: number) => {
                // translucent convex hulls behind each cluster
                const groups: Record<string, Pt[]> = {};
                (graphData.nodes as FGNode[]).forEach((n) => {
                  if (n.x == null || n.y == null) return;
                  (groups[n.cluster] ||= []).push({ x: n.x, y: n.y });
                });
                Object.entries(groups).forEach(([cid, pts]) => {
                  const dim = focusedCluster != null && cid !== focusedCluster;
                  const color = clusterColor(cid);
                  const hull = convexHull(pts);
                  ctx.save();
                  ctx.beginPath();
                  if (hull.length === 1) {
                    ctx.arc(hull[0].x, hull[0].y, 2, 0, 2 * Math.PI);
                  } else {
                    ctx.moveTo(hull[0].x, hull[0].y);
                    for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
                    ctx.closePath();
                  }
                  ctx.lineJoin = "round";
                  ctx.lineCap = "round";
                  ctx.lineWidth = 40 / globalScale;
                  ctx.strokeStyle = hexToRgba(color, dim ? 0.04 : 0.13);
                  ctx.stroke();
                  ctx.fillStyle = hexToRgba(color, dim ? 0.03 : 0.1);
                  ctx.fill();
                  ctx.restore();
                });
              }}
              linkColor={(l: any) => {
                const s = typeof l.source === "object" ? l.source : null;
                const t = typeof l.target === "object" ? l.target : null;
                if (!s || !t) return "rgba(120,110,95,0.18)";
                if (hoverNode) {
                  const on = s.id === hoverNode || t.id === hoverNode;
                  return on ? "rgba(207,90,55,0.55)" : "rgba(120,110,95,0.06)";
                }
                if (focusedCluster) {
                  const on = s.cluster === focusedCluster && t.cluster === focusedCluster;
                  return on ? "rgba(207,90,55,0.4)" : "rgba(120,110,95,0.06)";
                }
                return "rgba(120,110,95,0.2)";
              }}
              linkWidth={(l: any) => {
                const s = typeof l.source === "object" ? l.source : null;
                const on =
                  hoverNode && s && (s.id === hoverNode || l.target?.id === hoverNode);
                return (on ? 1.5 : 0.6) + (l.weight || 0) * 1.6;
              }}
              onNodeHover={(n: any) => setHoverNode(n ? n.id : null)}
              onNodeClick={(n: any) => {
                setSelectedNode(n as GraphNode);
                setActiveCluster(n.cluster);
                const ids = memberIds[n.cluster];
                if (ids) smoothFit(90, (x) => ids.has(x.id));
              }}
              nodeLabel={(n: any) =>
                `<div style="max-width:220px;font-size:12px;line-height:1.4;color:#2a241e"><b>${n.title}</b><br/><span style="color:#6f665a">${n.one_line || ""}</span></div>`
              }
              nodePointerAreaPaint={(node: any, color: string, ctx: any) => {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(node.x, node.y, nodeRadius(node) + 3, 0, 2 * Math.PI);
                ctx.fill();
              }}
              nodeCanvasObject={(node: any, ctx: any, globalScale: number) => {
                const r = nodeRadius(node);
                const active = nodeActive(node);
                const color = clusterColor(node.cluster);
                const isHover = hoverNode === node.id;
                const isSel = selectedNode?.id === node.id;

                ctx.globalAlpha = active ? 1 : 0.12;
                if (isHover || isSel) {
                  ctx.shadowColor = color;
                  ctx.shadowBlur = 16;
                }
                ctx.beginPath();
                ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.shadowBlur = 0;
                if (isHover || isSel) {
                  ctx.lineWidth = 2.5 / globalScale;
                  ctx.strokeStyle = "#2a241e";
                  ctx.stroke();
                }

                const showLabel =
                  active &&
                  (isHover || isSel || focusedCluster != null || node.degree >= 4 || globalScale > 1.3);
                if (showLabel) {
                  const raw = node.title as string;
                  const label = raw.length > 13 ? raw.slice(0, 13) + "…" : raw;
                  const fs = Math.max(11 / globalScale, 2.6);
                  ctx.font = `${fs}px "Noto Sans SC", sans-serif`;
                  const tw = ctx.measureText(label).width;
                  const pad = 3 / globalScale;
                  const y = node.y + r + 2 / globalScale;
                  ctx.fillStyle = "rgba(255,255,255,0.85)";
                  ctx.fillRect(node.x - tw / 2 - pad, y, tw + pad * 2, fs + pad * 2);
                  ctx.fillStyle = "rgba(42,36,30,0.96)";
                  ctx.textAlign = "center";
                  ctx.textBaseline = "top";
                  ctx.fillText(label, node.x, y + pad);
                }
                ctx.globalAlpha = 1;
              }}
            />

            <div className="absolute top-3 left-3 text-[11px] text-gray-500 bg-ink-950/60 rounded-lg px-2.5 py-1.5 backdrop-blur pointer-events-none">
              {data.nodes.length} 个失败 · {data.edges.length} 条关联 ·{" "}
              {patterns.length} 类失败模式
              {!data.llm_used && <span className="text-amber-600"> · 降级命名</span>}
            </div>
            <div className="absolute bottom-3 left-3 text-[11px] text-gray-600 bg-ink-950/50 rounded-lg px-2.5 py-1 backdrop-blur pointer-events-none">
              悬停查看 · 点击节点看失败卡 · 点击空白处复位
            </div>
            {(activeCluster || selectedNode) && (
              <button
                onClick={clearFocus}
                className="absolute top-3 right-3 text-xs px-2.5 py-1 rounded-lg border border-ink-600 bg-ink-950/60 text-gray-300 hover:text-brass-300 backdrop-blur transition-colors"
              >
                复位视图
              </button>
            )}
          </div>

          {/* side panel */}
          <div className="space-y-4">
            {selectedNode ? (
              <div className="rounded-xl border border-ink-700 bg-ink-800/60 p-4 animate-[fadeIn_.2s_ease]">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: clusterColor(selectedNode.cluster) }}
                  />
                  <span className="text-brass-400/90">
                    {selectedNode.scenario || "未分类"}
                  </span>
                  {selectedNode.severity && (
                    <span className="text-gray-500">{selectedNode.severity}</span>
                  )}
                </div>
                <h3 className="mt-2 font-serif text-gray-100 leading-snug">
                  {selectedNode.title}
                </h3>
                <p className="mt-1.5 text-sm text-gray-400">{selectedNode.one_line}</p>
                <button
                  onClick={() => navigate(`/card/${selectedNode.id}`)}
                  className="mt-3 text-sm text-brass-400 hover:text-brass-300"
                >
                  查看完整失败卡 →
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-ink-700 bg-ink-800/40 p-4 text-sm text-gray-500">
                悬停右侧失败模式可在图中高亮该簇，点击可聚焦放大；点击节点查看失败卡。
              </div>
            )}

            <div>
              <h2 className="text-sm uppercase tracking-wider text-brass-400/80 mb-2">
                组织级系统性风险
              </h2>
              <div className="space-y-2.5 max-h-[480px] overflow-auto pr-1">
                {patterns.map((p) => {
                  const active = activeCluster === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => focusCluster(p)}
                      onMouseEnter={() => setHoverCluster(p.id)}
                      onMouseLeave={() => setHoverCluster(null)}
                      className={`w-full text-left rounded-xl border p-3.5 transition-all duration-150 ${
                        active
                          ? "border-brass-600/60 bg-brass-500/10 ring-1 ring-brass-600/30"
                          : "border-ink-700 bg-ink-800/50 hover:border-brass-600/40 hover:bg-ink-800"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ background: clusterColor(p.id) }}
                        />
                        <span className="font-medium text-gray-100">{p.name}</span>
                        <span className="ml-auto text-xs text-gray-500 shrink-0">
                          出现 {p.count} 次
                        </span>
                      </div>
                      {p.principle && (
                        <p className="mt-1.5 text-sm text-brass-300/90">{p.principle}</p>
                      )}
                      {p.systemic_risk && (
                        <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                          {p.systemic_risk}
                        </p>
                      )}
                      {p.domains.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {p.domains.slice(0, 5).map((d) => (
                            <span
                              key={d}
                              className="text-[11px] px-1.5 py-0.5 rounded bg-ink-700/70 text-gray-400"
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
