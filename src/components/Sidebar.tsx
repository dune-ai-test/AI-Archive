import { NavLink } from "react-router-dom";
import {
  House,
  History,
  LayoutGrid,
  Github,
  DatabaseZap,
  Shield,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

export default function Sidebar({
  open,
  collapsed = false,
  onToggleCollapse,
  isAdmin = true,
}: {
  open: boolean;
  collapsed?: boolean;
  onToggleCollapse: () => void;
  isAdmin?: boolean;
}) {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? "bg-elevated text-ink" : "text-dim hover:bg-elevated hover:text-ink"
    }`;

  // ---------------- Collapsed: icon rail on desktop, drawer on mobile ----------------
  if (collapsed) {
    const railClass = ({ isActive }: { isActive: boolean }) =>
      `mb-1 flex h-10 w-full items-center justify-center rounded-lg transition-colors ${
        isActive ? "bg-elevated text-ink" : "text-dim hover:bg-elevated hover:text-ink"
      }`;
    return (
      <>
        {/* Mobile keeps the full drawer */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-[240px] shrink-0 transform flex-col border-r border-line bg-base transition-transform duration-200 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarLinks isAdmin={isAdmin} />
        </aside>

        {/* Desktop icon rail */}
        <aside className="hidden w-[60px] shrink-0 flex-col border-r border-line bg-base md:flex">
          <NavLink to="/" title="Home" className={railClass}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
              <DatabaseZap size={17} />
            </span>
          </NavLink>
          <nav className="mt-3 px-2">
            <NavLink to="/timeline" title="Timeline" className={railClass}>
              <History size={17} />
            </NavLink>
            <NavLink to="/browse" title="Browse" className={railClass}>
              <LayoutGrid size={17} />
            </NavLink>
            <NavLink to="/repos" title="Repositories" className={railClass}>
              <Github size={17} />
            </NavLink>
            {isAdmin && (
              <>
                <div className="my-1 h-px bg-line" />
                <NavLink to="/superadmin" title="Super Admin" className={railClass}>
                  <Shield size={17} />
                </NavLink>
              </>
            )}
          </nav>
          <button
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="mx-2 mt-auto mb-4 flex h-9 w-[calc(100%-16px)] items-center justify-center rounded-lg text-dim transition-colors hover:bg-elevated hover:text-ink"
          >
            <PanelLeftOpen size={17} />
          </button>
        </aside>
      </>
    );
  }

  // ---------------- Expanded ----------------
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-[240px] shrink-0 transform flex-col border-r border-line bg-base transition-transform duration-200 md:static md:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
          <DatabaseZap size={17} />
        </span>
        <span className="truncate text-[15px] font-semibold tracking-tight">Archive AI-X</span>
      </div>

      <SidebarLinks isAdmin={isAdmin} />

      <div className="mt-auto px-3 pb-4">
        <button
          onClick={onToggleCollapse}
          title="Hide sidebar"
          className="hidden w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-faint transition-colors hover:bg-elevated hover:text-ink md:flex"
        >
          <PanelLeftClose size={16} />
          Hide sidebar
        </button>
      </div>
    </aside>
  );
}

function SidebarLinks({ isAdmin }: { isAdmin: boolean }) {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? "bg-elevated text-ink" : "text-dim hover:bg-elevated hover:text-ink"
    }`;

  return (
    <nav className="overflow-y-auto px-3">
      <NavLink to="/" end className={navClass}>
        <House size={16} className="shrink-0" /> Home
      </NavLink>
      <NavLink to="/timeline" className={navClass}>
        <History size={16} className="shrink-0" /> Timeline
      </NavLink>
      <NavLink to="/browse" className={navClass}>
        <LayoutGrid size={16} className="shrink-0" /> Browse
      </NavLink>
      <NavLink to="/repos" className={navClass}>
        <Github size={16} className="shrink-0" /> Repositories
      </NavLink>

      {isAdmin && (
        <>
          <div className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-faint">Manage</div>
          <NavLink to="/superadmin" className={navClass}>
            <Shield size={16} className="shrink-0" /> Super Admin
          </NavLink>
        </>
      )}
    </nav>
  );
}
