import { useCallback, useEffect, useState } from "react";
import { Route, Routes, useLocation, Navigate } from "react-router-dom";
import { api, clearSession, getToken, setToken } from "./api";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import CommandPalette from "./components/CommandPalette";
import { PaletteOpenContext } from "./components/paletteContext";
import Timeline from "./pages/Timeline";
import SuperAdminPage from "./pages/SuperAdminPage";
import ReposPage from "./pages/ReposPage";
import Browse from "./pages/Browse";
import SearchPage from "./pages/SearchPage";
import PostDetail from "./pages/PostDetail";
import HomePage from "./pages/HomePage";

type AuthMode = "loading" | "open" | "admin" | "login";

export default function App() {
  const [mode, setMode] = useState<AuthMode>("loading");
  const [passwordInput, setPasswordInput] = useState("");
  const [pwError, setPwError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("aax_sidebar") === "hidden"
  );
  const location = useLocation();

  // Close drawer on navigation
  useEffect(() => setSidebarOpen(false), [location.pathname]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((c) => {
      localStorage.setItem("aax_sidebar", c ? "visible" : "hidden");
      return !c;
    });
  }, []);

  // Detect server auth mode on boot
  useEffect(() => {
    api
      .get<{ required: boolean }>("/api/auth")
      .then(async (r) => {
        if (!r.required) {
          setMode("open");
          return;
        }
        try {
          const r = await api.post<{ ok: boolean; token?: string }>("/api/auth", { token: getToken() });
          if (r.token) setToken(r.token);
          setMode("admin");
        } catch {
          setMode("login");
        }
      })
      .catch(() => setMode("open"));
  }, []);

  // Global shortcuts: ⌘K palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submitLogin = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      setPwError("");
      try {
        const r = await api.post<{ ok: boolean; token?: string }>("/api/auth", {
          password: passwordInput,
        });
        if (r.token) setToken(r.token);
        setMode("admin");
        setPasswordInput("");
      } catch {
        setPwError("Wrong password");
      }
    },
    [passwordInput]
  );

  const logout = useCallback(() => {
    clearSession();
    window.location.reload();
  }, []);

  const isAdmin = mode === "open" || mode === "admin";
  const isHome = location.pathname === "/";

  if (mode === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-base">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
      </div>
    );
  }

  return (
    <PaletteOpenContext.Provider value={setPaletteOpen}>
      <div className="flex h-screen overflow-hidden bg-base">
        {/* Mobile drawer backdrop */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}
        {/* Landing page is full-bleed — no sidebar */}
        {!isHome && (
          <Sidebar open={sidebarOpen} collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} isAdmin={isAdmin} />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenuClick={() => setSidebarOpen(true)} isAdmin={isAdmin} />
          <main className="min-h-0 flex-1 overflow-y-auto bg-surface">
            <Routes>
              {/* Home */}
              <Route path="/" element={<HomePage isAdmin={isAdmin} />} />
              {/* Public */}
              <Route path="/timeline" element={<Timeline />} />
              <Route path="/browse" element={<Browse />} />
              <Route path="/repos" element={<ReposPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/post/:id" element={<PostDetail />} />
              {/* Admin */}
              <Route
                path="/superadmin"
                element={
                  <RequireAdmin mode={mode} pwInput={passwordInput} setPwInput={setPasswordInput} pwError={pwError} onLogin={submitLogin} onLogout={logout}>
                    <SuperAdminPage />
                  </RequireAdmin>
                }
              />
              {/* Legacy routes → Super Admin */}
              <Route path="/requests" element={<Navigate to="/superadmin?tab=requests" replace />} />
              <Route path="/add" element={<Navigate to="/superadmin?tab=add" replace />} />
              <Route path="/settings" element={<Navigate to="/superadmin?tab=settings" replace />} />            </Routes>
          </main>
        </div>
        {isAdmin && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />}
      </div>
    </PaletteOpenContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Gate for admin pages — shows a login card until unlocked
// ---------------------------------------------------------------------------

function RequireAdmin({
  mode,
  pwInput,
  setPwInput,
  pwError,
  onLogin,
  onLogout,
  children,
}: {
  mode: AuthMode;
  pwInput: string;
  setPwInput: (v: string) => void;
  pwError: string;
  onLogin: (e?: React.FormEvent) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  if (mode === "open" || mode === "admin") return <>{children}</>;

  return (
    <div className="mx-auto flex max-w-[420px] flex-col items-center px-4 py-16">
      <form onSubmit={onLogin} className="w-full rounded-xl border border-line bg-base p-6">
        <div className="mb-1 text-lg font-semibold">Admin access</div>
        <p className="mb-5 text-[13px] leading-relaxed text-dim">
          This section is protected. Enter the admin password to manage the archive.
        </p>
        <input
          type="password"
          autoFocus
          value={pwInput}
          onChange={(e) => setPwInput(e.target.value)}
          placeholder="Admin password"
          className="mb-3 h-10 w-full rounded-lg border border-line bg-elevated px-3 text-sm outline-none focus:border-accent"
        />
        {pwError && <p className="mb-2 text-[13px] text-danger">{pwError}</p>}
        <button type="submit" className="h-10 w-full rounded-lg bg-accent text-sm font-medium text-white hover:bg-accent-hi">
          Unlock
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 w-full text-center text-[12px] text-faint hover:text-dim"
        >
          Sign out of this device
        </button>
      </form>
    </div>
  );
}
