import type { PostStatus } from "../../shared/types";

export function StatusBadge({ status }: { status: PostStatus }) {
  if (status === "analyzed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-medium text-ok">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M20 6L9 17l-5-5" />
        </svg>
        Done
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">
        <span className="h-1.5 w-1.5 rounded-full bg-danger" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-warn/10 px-2 py-0.5 text-[11px] font-medium text-warn">
      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-warn" />
      Pending
    </span>
  );
}
