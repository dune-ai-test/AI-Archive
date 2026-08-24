import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Check, Code2, Github, Link2, Loader2, Sparkles, Type } from "lucide-react";
import { api } from "../api";
import { invalidateTaxonomy } from "../components/CommandPalette";

type DetectedType = "manual" | "link" | "embed" | "github";

function detectType(value: string): DetectedType {
  const v = value.trim();
  if (!v) return "manual";
  if (/twitter-tweet|<blockquote/i.test(v)) return "embed";
  if (/https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i.test(v)) return "github";
  if (/https?:\/\/(?:(?:www|mobile)\.)?(?:twitter|x)\.com\/[A-Za-z0-9_]{1,20}\/status(?:es)?\/\d+/i.test(v)) return "link";
  return "manual";
}

const TYPE_META: Record<DetectedType, { label: string; icon: typeof Type }> = {
  manual: { label: "Manual text", icon: Type },
  link: { label: "X post link", icon: Link2 },
  embed: { label: "Embed code", icon: Code2 },
  github: { label: "GitHub repo", icon: Github },
};

export default function AddPost() {
  const navigate = useNavigate();
  const [rawText, setRawText] = useState("");
  const [showOptional, setShowOptional] = useState(false);
  const [authorHandle, setAuthorHandle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [postedAt, setPostedAt] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Auto-fetch preview for links / embeds
  const [resolving, setResolving] = useState(false);
  const [resolvedNote, setResolvedNote] = useState("");
  const lastResolvedRef = useRef("");

  const [aiConfigured, setAiConfigured] = useState(true);

  useEffect(() => {
    api
      .get<{ ai_base_url: string; ai_model: string }>("/api/settings")
      .then((s) => setAiConfigured(Boolean(s.ai_base_url && s.ai_model)))
      .catch(() => {});
  }, []);

  const detected = useMemo(() => detectType(rawText), [rawText]);
  const DetIcon = TYPE_META[detected].icon;

  // Auto-fetch when content is a link or embed code
  useEffect(() => {
    const val = rawText.trim();
    if (!val || val.length > 100_000) return;
    const type = detectType(val);
    if (type === "manual") return;
    if (type === "link") {
      const mostlyLink = val.replace(/https?:\/\/\S+/g, "").replace(/\s/g, "").length < 30;
      if (!mostlyLink) return;
    }
    if (lastResolvedRef.current === val) return;

    const t = setTimeout(async () => {
      setResolving(true);
      setResolvedNote("");
      try {
        const r = await api.post<{
          resolved: boolean;
          raw_text: string;
          author_handle?: string | null;
          author_name?: string | null;
          post_url?: string | null;
          posted_at?: string | null;
        }>("/api/posts/resolve", { input: val });
        if (r.resolved) {
          lastResolvedRef.current = r.raw_text.trim();
          setRawText(r.raw_text);
          if (r.author_handle) setAuthorHandle(r.author_handle.startsWith("@") ? r.author_handle : `@${r.author_handle}`);
          if (r.author_name && !authorName) setAuthorName(r.author_name);
          if (r.post_url) setPostUrl(r.post_url);
          if (r.posted_at) setPostedAt(r.posted_at.slice(0, 10));
          setShowOptional(true);
          setResolvedNote("✓ Loaded from X — everything below is editable.");
        }
      } catch {
        /* server resolves again on submit anyway */
      } finally {
        setResolving(false);
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawText]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (rawText.trim().length < 10 || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post("/api/posts", {
        raw_text: rawText,
        author_handle: authorHandle || undefined,
        author_name: authorName || undefined,
        post_url: postUrl || undefined,
        posted_at: postedAt || undefined,
      });
      invalidateTaxonomy();
      navigate("/requests");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 md:px-6">
      <h1 className="text-xl font-semibold">Add a post</h1>
      <p className="mb-5 mt-1 text-[13px] text-dim">
        Paste post text, an X link or embed code — the type is detected automatically. Analyzed posts land in Requests.
      </p>

      {error && <p className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-[13px] text-danger">{error}</p>}

      <form onSubmit={submit}>
        <textarea
          autoFocus
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
          placeholder={"Paste post text here…\nOr drop an x.com link / embed code"}
          className="min-h-[200px] w-full resize-y rounded-xl border border-line bg-elevated p-4 text-sm leading-relaxed outline-none placeholder:text-faint focus:border-accent"
        />

        {/* Detection + status row */}
        <div className="mb-4 mt-2 flex items-center justify-between text-[12px]">
          <div className="flex items-center gap-1.5">
            {resolving ? (
              <>
                <Loader2 size={12} className="animate-spin text-accent-hi" />
                <span className="text-accent-hi">Fetching from X…</span>
              </>
            ) : resolvedNote ? (
              <span className="flex items-center gap-1 text-ok">
                <Check size={12} strokeWidth={3} /> Loaded from X
              </span>
            ) : rawText.trim() ? (
              <>
                <DetIcon size={12} className="text-dim" />
                <span className="text-dim">{TYPE_META[detected].label}</span>
              </>
            ) : null}
          </div>
          <span className="font-mono text-[11px] text-faint">{rawText.length} characters</span>
        </div>

        <button
          type="button"
          onClick={() => setShowOptional((s) => !s)}
          className="mb-3 flex items-center gap-1.5 text-[13px] text-dim hover:text-ink"
        >
          Optional details
        </button>

        {showOptional && (
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Author handle" value={authorHandle} onChange={setAuthorHandle} placeholder="@sama" />
            <Field label="Display name" value={authorName} onChange={setAuthorName} placeholder="Sam Altman" />
            <Field label="Post URL" value={postUrl} onChange={setPostUrl} placeholder="https://x.com/…" />
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-dim">Posted date</span>
              <input
                type="date"
                value={postedAt}
                onChange={(e) => setPostedAt(e.target.value)}
                className="h-10 w-full rounded-lg border border-line bg-elevated px-3 text-sm outline-none focus:border-accent"
              />
            </label>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <kbd className="hidden rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-faint sm:block">⌘↵</kbd>
          <button
            type="submit"
            disabled={rawText.trim().length < 10 || submitting}
            className="flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hi disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            Analyze
          </button>
        </div>

        <p className="mt-4 flex items-start gap-1.5 text-[12px] leading-relaxed text-faint">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          New posts land in Requests and appear on the Timeline only after you accept them.
        </p>
      </form>

      {!aiConfigured && (
        <Link to="/superadmin?tab=settings" className="mt-2 flex items-center gap-1.5 text-[13px] text-warn hover:underline">
          <AlertTriangle size={13} /> AI is not configured — go to Settings
        </Link>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-dim">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-line bg-elevated px-3 text-sm outline-none placeholder:text-faint focus:border-accent"
      />
    </label>
  );
}
