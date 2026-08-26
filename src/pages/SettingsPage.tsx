import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Download, Eye, EyeOff, Loader2, LogIn, LogOut, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { api, clearSession, getPassword, getToken } from "../api";
import { PROVIDERS, normalizeUrl } from "../data/providers";
import Modal from "../components/Modal";
import type { ConnectionDTO, TestResult } from "../../shared/types";

export default function SettingsPage() {
  const navigate = useNavigate();
  const [connections, setConnections] = useState<ConnectionDTO[]>([]);
  const [stats, setStats] = useState<{ posts: number } | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);

  // editor state
  const [editingId, setEditingId] = useState<number | null | "new">(null);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [showKey, setShowKey] = useState(false);

  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [loggingOutOthers, setLoggingOutOthers] = useState(false);

  const loadConnections = () =>
    api
      .get<ConnectionDTO[]>("/api/connections")
      .then(setConnections)
      .catch((e) => setError(e.message));

  useEffect(() => {
    loadConnections();
    api
      .get<{ items: unknown[]; total: number }>("/api/posts?limit=1")
      .then((r) => setStats({ posts: r.total }))
      .catch(() => {});
    api
      .get<{ required: boolean }>("/api/auth")
      .then((r) => setPasswordRequired(r.required))
      .catch(() => {});
  }, []);

  const openNewEditor = (url = "", suggestedModel = "") => {
    setEditingId("new");
    setName("");
    setBaseUrl(url);
    setApiKey("");
    setModel(suggestedModel);
    setShowKey(false);
    setTestResult(null);
    setError("");
  };

  const openEditEditor = (conn: ConnectionDTO) => {
    setEditingId(conn.id);
    setName(conn.name);
    setBaseUrl(conn.base_url);
    setApiKey("");
    setModel(conn.model);
    setShowKey(false);
    setTestResult(null);
    setError("");
  };

  const closeEditor = () => {
    setEditingId(null);
    setTestResult(null);
    setError("");
  };

  const applyProvider = (url: string, suggestedModel: string) => {
    if (!editingId) openNewEditor(url, suggestedModel);
    else {
      setBaseUrl(url);
      if (!model.trim() && suggestedModel) setModel(suggestedModel);
    }
  };

  const save = async () => {
    setError("");
    if (!baseUrl.trim() || !model.trim()) {
      setError("Base URL and Model are required.");
      return;
    }
    setBusy(true);
    try {
      if (editingId === "new") {
        const r = await api.post<{ connections: ConnectionDTO[] }>("/api/connections", {
          name: name.trim() || undefined,
          base_url: baseUrl,
          api_key: apiKey.trim() || undefined,
          model,
        });
        setConnections(r.connections);
      } else if (typeof editingId === "number") {
        const r = await api.patch<{ connections: ConnectionDTO[] }>(`/api/connections/${editingId}`, {
          name: name.trim(),
          base_url: baseUrl,
          model,
          ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
        });
        setConnections(r.connections);
      }
      closeEditor();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const activate = async (id: number) => {
    try {
      const r = await api.post<{ connections: ConnectionDTO[] }>(`/api/connections/${id}/activate`);
      setConnections(r.connections);
      invalidateExports();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (id: number) => {
    try {
      const r = await api.del<{ connections: ConnectionDTO[] }>(`/api/connections/${id}`);
      setConnections(r.connections);
      setConfirmDeleteId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const body =
        typeof editingId === "number"
          ? { connection_id: editingId, base_url: baseUrl, model, api_key: apiKey || undefined }
          : editingId === "new"
            ? { base_url: baseUrl, model, api_key: apiKey || "" }
            : {};
      const r = await api.post<TestResult>("/api/settings/test", body);
      setTestResult(r);
    } catch (e) {
      setTestResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  // Which preset row should light up
  const savedUrlNorm = useMemo(
    () => normalizeUrl(connections.find((c) => c.is_active)?.base_url ?? ""),
    [connections]
  );
  const currentUrlNorm = normalizeUrl(baseUrl);
  const customExtra = useMemo(() => {
    const known = new Set(PROVIDERS.map((p) => normalizeUrl(p.baseUrl)));
    const entries: { name: string; baseUrl: string; saved: boolean }[] = [];
    for (const c of connections) {
      const u = normalizeUrl(c.base_url);
      if (u && !known.has(u)) entries.push({ name: c.name, baseUrl: c.base_url, saved: true });
    }
    if (
      currentUrlNorm &&
      !known.has(currentUrlNorm) &&
      !entries.some((e) => normalizeUrl(e.baseUrl) === currentUrlNorm)
    ) {
      entries.push({ name: "Custom", baseUrl, saved: false });
    }
    return entries;
  }, [connections, currentUrlNorm, baseUrl]);

  const exportUrl = `/api/settings/export${getPassword() ? `?password=${encodeURIComponent(getPassword())}` : ""}`;

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportNote(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload || !Array.isArray(payload.posts)) throw new Error("Not a valid archive export file");
      const r = await api.post<{ imported: number; skipped: number }>("/api/settings/import", payload);
      setImportNote({ ok: true, text: `Imported ${r.imported} posts${r.skipped ? ` · ${r.skipped} duplicates skipped` : ""}.` });
      api
        .get<{ items: unknown[]; total: number }>("/api/posts?limit=1")
        .then((s) => setStats({ posts: s.total }))
        .catch(() => {});
    } catch (err) {
      setImportNote({ ok: false, text: err instanceof Error ? err.message : "Import failed" });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const logoutAllOthers = async () => {
    setLoggingOutOthers(true);
    try {
      const r = await api.post<{ revoked: number }>("/api/admin/sessions/logout-all");
      setImportNote({ ok: true, text: `Signed out ${r.revoked} other device${r.revoked === 1 ? "" : "s"}.` });
    } catch (err) {
      setImportNote({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setLoggingOutOthers(false);
    }
  };

  return (
    <div className="mx-auto max-w-[680px] px-4 py-8 md:px-6">
      <h1 className="mb-6 text-xl font-semibold">Settings</h1>

      {/* ------------------------- AI Connections ------------------------- */}
      <section className="mb-5 rounded-xl border border-line bg-base p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">AI Connections</h2>
          {!editingId && (
            <button
              onClick={() => openNewEditor()}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hi"
            >
              <Plus size={14} /> Add connection
            </button>
          )}
        </div>

        {/* Saved connections */}
        {connections.length > 0 && !editingId && (
          <ul className="mb-4 space-y-1.5">
            {connections.map((c) => (
              <li
                key={c.id}
                className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 ${
                  c.is_active ? "border-accent/40 bg-accent-subtle" : "border-line bg-elevated"
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    c.is_active && testResult?.ok ? "bg-ok" : c.is_active ? "bg-warn" : "bg-line-strong"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13px] font-medium ${c.is_active ? "text-accent-hi" : "text-ink"}`}>
                    {c.name}
                    {!c.key_set && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-faint">no key</span>
                    )}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-faint">
                    {c.base_url} · {c.model}
                  </span>
                </span>

                {c.is_active ? (
                  <span className="shrink-0 rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-medium text-ok">Active</span>
                ) : (
                  <button
                    onClick={() => activate(c.id)}
                    className="shrink-0 rounded-md border border-line px-2 py-1 text-[12px] text-dim hover:border-line-strong hover:text-ink"
                  >
                    Use
                  </button>
                )}
                <button
                  onClick={() => openEditEditor(c)}
                  aria-label={`Edit ${c.name}`}
                  className="shrink-0 rounded-md p-1.5 text-faint hover:bg-elevated hover:text-ink"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => setConfirmDeleteId(c.id)}
                  aria-label={`Delete ${c.name}`}
                  className="shrink-0 rounded-md p-1.5 text-faint hover:bg-elevated hover:text-danger"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{error}</p>}

        {/* Editor */}
        {editingId !== null && (
          <div className="fade-up rounded-lg border border-line bg-elevated p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[13px] font-semibold">
                {editingId === "new" ? "New connection" : `Edit connection`}
              </span>
              <button onClick={closeEditor} aria-label="Close editor" className="rounded p-1 text-faint hover:text-ink">
                <X size={14} />
              </button>
            </div>

            {/* Provider presets */}
            <div className="mb-4">
              <span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-faint">Providers</span>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {PROVIDERS.map((p) => {
                  const isCurrent = currentUrlNorm === normalizeUrl(p.baseUrl);
                  return (
                    <button
                      key={p.id}
                      onClick={() => applyProvider(p.baseUrl, p.suggestedModel)}
                      title={`${p.baseUrl}\nSuggested model: ${p.suggestedModel || "any"}`}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                        isCurrent ? "border-accent/50 bg-accent-subtle" : "border-line bg-elevated hover:border-line-strong"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13px] font-medium ${isCurrent ? "text-accent-hi" : "text-ink"}`}>
                          {p.name}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-faint">{p.baseUrl}</span>
                      </span>
                      {p.local && (
                        <span className="shrink-0 rounded border border-line px-1 py-0.5 text-[10px] text-faint">local</span>
                      )}
                    </button>
                  );
                })}
                {customExtra.map((e) => (
                  <button
                    key={`custom-${normalizeUrl(e.baseUrl)}-${e.saved}`}
                    onClick={() => applyProvider(e.baseUrl, "")}
                    title={e.baseUrl}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                      currentUrlNorm === normalizeUrl(e.baseUrl)
                        ? "border-accent/50 bg-accent-subtle"
                        : "border-line bg-elevated hover:border-line-strong"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{e.name}</span>
                      <span className="block truncate font-mono text-[11px] text-faint">{e.baseUrl}</span>
                    </span>
                    {!e.saved && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-faint">unsaved</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <label className="mb-3 block">
              <span className="mb-1 block text-[13px] font-medium text-dim">Name (optional)</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My OpenAI account"
                className="h-10 w-full rounded-lg border border-line bg-elevated px-3 text-sm outline-none placeholder:text-faint focus:border-accent"
              />
            </label>

            <label className="mb-3 block">
              <span className="mb-1 block text-[13px] font-medium text-dim">Base URL</span>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="h-10 w-full rounded-lg border border-line bg-elevated px-3 font-mono text-[13px] outline-none placeholder:text-faint focus:border-accent"
              />
            </label>

            <label className="mb-3 block">
              <span className="mb-1 block text-[13px] font-medium text-dim">API Key</span>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    typeof editingId === "number"
                      ? connections.find((c) => c.id === editingId)?.key_set
                        ? "••••••••••••  (saved)"
                        : "sk-…"
                      : "sk-…"
                  }
                  className="h-10 w-full rounded-lg border border-line bg-elevated pl-3 pr-10 font-mono text-[13px] outline-none placeholder:text-faint focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  aria-label={showKey ? "Hide key" : "Show key"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-faint hover:text-dim"
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>

            <label className="mb-4 block">
              <span className="mb-1 block text-[13px] font-medium text-dim">Model</span>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o-mini"
                className="h-10 w-full rounded-lg border border-line bg-elevated px-3 font-mono text-[13px] outline-none placeholder:text-faint focus:border-accent"
              />
            </label>

            {testResult && (
              <div
                className={`mb-4 rounded-lg px-4 py-3 text-[13px] ${
                  testResult.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"
                }`}
              >
                {testResult.ok ? (
                  <span className="flex items-center gap-2">
                    <Check size={14} strokeWidth={3} /> Connected — {testResult.model} responded in {testResult.latency_ms}ms
                  </span>
                ) : (
                  <span>{testResult.error ?? "Connection failed."}</span>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={test}
                disabled={testing}
                className="flex h-9 items-center gap-2 rounded-lg border border-line bg-elevated px-4 text-sm text-dim hover:border-line-strong hover:text-ink disabled:opacity-50"
              >
                {testing && <Loader2 size={14} className="animate-spin" />}
                Test connection
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hi disabled:opacity-50"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                Save connection
              </button>
              <button
                onClick={closeEditor}
                className="ml-auto h-9 rounded-lg px-3 text-sm text-faint hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {connections.length === 0 && editingId === null && (
          <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-dim">
            No connections yet. Click <span className="font-medium text-ink">Add connection</span> to configure your first AI endpoint.
          </p>
        )}

        <p className="mt-3 text-[12px] leading-relaxed text-faint">
          The active connection powers all post analysis. Switch anytime — keys are stored server-side and never returned to the browser.
        </p>
      </section>

      {/* ------------------------------ Data ------------------------------ */}
      <section className="rounded-xl border border-line bg-base p-5">
        <h2 className="mb-1 text-[15px] font-semibold">Data</h2>
        <p className="mb-4 text-[13px] text-dim">{stats ? `${stats.posts} posts in your archive.` : "Loading…"}</p>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={exportUrl}
            download
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-elevated px-4 text-sm text-dim hover:border-line-strong hover:text-ink"
          >
            <Download size={14} /> Export JSON
          </a>

          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line bg-elevated px-4 text-sm text-dim hover:border-line-strong hover:text-ink">
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Import JSON
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              disabled={importing}
              onChange={handleImport}
            />
          </label>
        </div>

        {importNote && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 text-[13px] ${
              importNote.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"
            }`}
          >
            {importNote.text}
          </div>
        )}

        {passwordRequired && (
          <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4">
            <button
              onClick={logoutAllOthers}
              disabled={loggingOutOthers}
              className="flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-elevated px-4 text-sm text-warn transition-colors hover:border-warn/40 disabled:opacity-50"
            >
              {loggingOutOthers ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
              Log out all other devices
            </button>
            <button
              onClick={() => {
                clearSession();
                navigate("/");
                window.location.reload();
              }}
              className="flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-elevated px-4 text-sm text-danger transition-colors hover:border-danger/40"
            >
              <LogOut size={14} /> Sign out of admin
            </button>
          </div>
        )}
      </section>

      <Modal
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        title="Delete this connection?"
      >
        <p className="mb-5 text-[13px] leading-relaxed text-dim">
          Posts already archived stay untouched. You can re-add the endpoint later.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setConfirmDeleteId(null)}
            className="h-9 rounded-lg border border-line px-4 text-sm text-dim hover:border-line-strong hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={() => confirmDeleteId !== null && remove(confirmDeleteId)}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-danger px-4 text-sm font-medium text-black hover:brightness-110"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}

function invalidateExports() {
  /* placeholder hook — analysis config change could trigger UI refresh elsewhere */
}
