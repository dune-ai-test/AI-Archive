import { useSearchParams } from "react-router-dom";
import { Inbox, Plus, Settings } from "lucide-react";
import RequestsPage from "./RequestsPage";
import AddPost from "./AddPost";
import SettingsPage from "./SettingsPage";

type Tab = "requests" | "add" | "settings";

const TABS: { id: Tab; label: string; icon: typeof Inbox }[] = [
  { id: "requests", label: "Requests", icon: Inbox },
  { id: "add", label: "Add Post", icon: Plus },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function SuperAdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab");
  const tab: Tab = raw === "add" || raw === "settings" ? raw : "requests";

  const setTab = (id: Tab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="min-h-full">
      {/* Tab bar */}
      <div className="sticky top-0 z-10 border-b border-line bg-surface/80 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">
            Super Admin <span className="ml-1 align-middle text-[12px] font-normal text-faint">manage everything from here</span>
          </h1>
          <div className="flex items-center gap-0.5 rounded-[9px] bg-elevated p-[3px]">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 rounded-[7px] px-3.5 py-1.5 text-[13px] font-medium transition-all ${
                  tab === id ? "bg-base text-ink shadow-sm" : "text-dim hover:text-ink"
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="fade-up">
        {tab === "requests" && <RequestsPage />}
        {tab === "add" && <AddPost />}
        {tab === "settings" && <SettingsPage />}
      </div>
    </div>
  );
}
