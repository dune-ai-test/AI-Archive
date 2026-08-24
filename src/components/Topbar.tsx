import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Plus, Menu, Sun, Moon, Sparkles, Inbox } from "lucide-react";
import { PaletteOpenContext } from "./paletteContext";
import { useContext } from "react";
import { getTheme, setTheme, type Theme } from "../theme";

export default function Topbar({
  onMenuClick,
  isAdmin = true,
}: {
  onMenuClick: () => void;
  isAdmin?: boolean;
}) {
  const setPaletteOpen = useContext(PaletteOpenContext);
  const navigate = useNavigate();
  const [theme, setThemeState] = useState<Theme>(getTheme);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur md:px-6">
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="rounded-lg p-2 text-dim transition-colors hover:bg-elevated hover:text-ink md:hidden"
      >
        <Menu size={18} />
      </button>

      {/* Right-aligned cluster */}
      <div className="ml-auto flex items-center gap-2">
        {/* Search — pushed to the right side */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="hidden h-10 w-full max-w-[380px] items-center gap-2.5 rounded-xl border border-line bg-elevated px-3.5 text-left text-sm text-faint transition-colors hover:border-line-strong sm:flex"
        >
          <Search size={15} />
          <span className="flex-1 truncate">Search posts, companies, models…</span>
          <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px]">⌘K</kbd>
        </button>

        <button
          aria-label="Search"
          onClick={() => setPaletteOpen(true)}
          className="rounded-lg p-2 text-dim transition-colors hover:bg-elevated hover:text-ink sm:hidden"
        >
          <Search size={17} />
        </button>

        {isAdmin && (
          <>
            <Link
              to="/superadmin?tab=requests"
              aria-label="Requests queue"
              title="Requests queue"
              className="rounded-lg p-2 text-dim transition-colors hover:bg-elevated hover:text-ink"
            >
              <Inbox size={17} />
            </Link>
            <Link
              to="/superadmin?tab=add"
              className="flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hi"
            >
              <Sparkles size={15} />
              <span className="hidden sm:block">Add Post</span>
              <span className="sm:hidden">Add</span>
            </Link>
          </>
        )}

        <button
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={theme === "dark" ? "Light theme" : "Dark theme"}
          className="rounded-lg p-2 text-dim transition-colors hover:bg-elevated hover:text-ink"
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </header>
  );
}
