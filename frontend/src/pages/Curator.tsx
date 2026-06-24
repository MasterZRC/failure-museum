import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, CuratorChatResponse, CuratorMessage, FailureCard, streamSSE } from "../api";
import { Markdown } from "../components/Markdown";
import { StreamProgress } from "../components/StreamProgress";

interface Turn {
  role: "user" | "assistant";
  content: string;
  cited?: string[];
  trace?: string[];
  llm_used?: boolean;
  streaming?: boolean;
  progress?: string[];
  active?: string;
}

const SUGGESTIONS = [
  "我们在支付上反复踩过哪些坑？",
  "做激励 / 拉新活动，上线前最该防什么？",
  "组织里最严重的系统性失败模式是什么？",
  "推荐 / 增长策略最容易忽略的长期风险？",
];

export default function Curator() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .listCards()
      .then((cards: FailureCard[]) => {
        const map: Record<string, string> = {};
        cards.forEach((c) => (map[c.id] = c.title));
        setTitles(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  // Patch the last (assistant) turn in place as stream events arrive.
  function patchLast(patch: Partial<Turn>) {
    setTurns((prev) => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      const i = copy.length - 1;
      copy[i] = { ...copy[i], ...patch };
      return copy;
    });
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const history: CuratorMessage[] = turns.map((t) => ({
      role: t.role,
      content: t.content,
    }));
    const next = [...history, { role: "user" as const, content: q }];
    setTurns((prev) => [
      ...prev,
      { role: "user", content: q },
      {
        role: "assistant",
        content: "",
        streaming: true,
        progress: [],
        active: "馆长正在思考…",
      },
    ]);
    setInput("");
    setLoading(true);
    try {
      await streamSSE(
        "/curator/chat/stream",
        { messages: next },
        {
          onStatus: (txt) =>
            setTurns((prev) => {
              if (prev.length === 0) return prev;
              const copy = [...prev];
              const i = copy.length - 1;
              const t = copy[i];
              const prevActive = t.active;
              const progress =
                prevActive && prevActive !== txt
                  ? [...(t.progress ?? []), prevActive]
                  : t.progress ?? [];
              copy[i] = { ...t, progress, active: txt };
              return copy;
            }),
          onToken: (txt) =>
            setTurns((prev) => {
              if (prev.length === 0) return prev;
              const copy = [...prev];
              const i = copy.length - 1;
              copy[i] = {
                ...copy[i],
                content: copy[i].content + txt,
                active: undefined,
              };
              return copy;
            }),
          onDone: (data) => {
            const res = data as CuratorChatResponse;
            patchLast({
              content: res.answer || "",
              cited: res.cited_card_ids,
              trace: res.tool_trace,
              llm_used: res.llm_used,
              streaming: false,
              progress: [],
              active: undefined,
            });
          },
          onError: (e) =>
            patchLast({
              content: `馆长暂时无法回应：${e}`,
              streaming: false,
              active: undefined,
              progress: [],
            }),
        },
      );
    } catch (err) {
      patchLast({
        content: `馆长暂时无法回应：${String(err)}`,
        streaming: false,
        active: undefined,
        progress: [],
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <section>
        <h1 className="font-serif text-2xl text-gray-100">问馆长</h1>
        <p className="mt-2 text-gray-400 max-w-2xl">
          馆长会
          <span className="text-brass-400">翻阅馆藏失败卡与失败模式</span>
          后回答你的问题，并标注每个结论的来源。问问历史上我们踩过哪些坑。
        </p>
      </section>

      <div
        ref={scrollRef}
        className="rounded-2xl border border-ink-700 bg-ink-900/40 p-5 h-[460px] overflow-auto card-shadow"
      >
        {turns.length === 0 && !loading ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4">
            <span className="text-4xl">🗿</span>
            <p className="text-gray-500 max-w-md">
              我是失败博物馆的馆长。这里收藏着团队踩过的坑 ——
              问我，让历史失败为你的下一个决定提个醒。
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-xl">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-ink-700 text-gray-400 hover:text-brass-300 hover:border-brass-600/50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {turns.map((t, i) => (
              <div
                key={i}
                className={t.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    t.role === "user"
                      ? "bg-brass-500/15 border border-brass-600/40 text-gray-100"
                      : "bg-ink-800/70 border border-ink-700 text-gray-200"
                  }`}
                >
                  {t.role === "assistant" &&
                    !t.streaming &&
                    t.trace &&
                    t.trace.length > 0 && (
                      <div className="mb-2 text-[11px] text-gray-500">
                        馆长翻阅了：{t.trace.join("；")}
                      </div>
                    )}
                  {t.role === "assistant" &&
                    t.streaming &&
                    ((t.progress && t.progress.length > 0) || t.active) && (
                      <div className={t.content ? "mb-2" : ""}>
                        <StreamProgress steps={t.progress} active={t.active} />
                      </div>
                    )}
                  {t.role === "assistant" ? (
                    t.content ? (
                      <Markdown>{t.content}</Markdown>
                    ) : null
                  ) : (
                    <div className="whitespace-pre-wrap leading-relaxed text-[15px]">
                      {t.content}
                    </div>
                  )}
                  {t.role === "assistant" && t.cited && t.cited.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-ink-700/70">
                      <div className="text-[11px] text-gray-500 mb-1.5">来源失败卡</div>
                      <div className="flex flex-wrap gap-1.5">
                        {t.cited.map((id) => (
                          <Link
                            key={id}
                            to={`/card/${id}`}
                            className="text-xs px-2.5 py-1 rounded-full bg-ink-700/70 border border-ink-600 text-gray-300 hover:text-brass-300 hover:border-brass-600/50"
                          >
                            {titles[id] || id}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {t.role === "assistant" && t.llm_used === false && (
                    <div className="mt-2 text-[11px] text-amber-600">
                      降级模式（未配置 AI Key）：以下为基于检索的馆藏摘要
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="问馆长：我们以前在……上踩过什么坑？"
          className="flex-1 rounded-lg bg-ink-800 border border-ink-700 px-4 py-2.5 text-gray-100 placeholder:text-gray-600 focus:border-brass-600 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-6 rounded-lg bg-brass-500 text-ink-950 font-medium hover:bg-brass-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          发送
        </button>
      </form>
    </div>
  );
}
