import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export default function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <Icon size={32} className="mb-4 text-faint" strokeWidth={1.5} />
      <div className="mb-1 text-[15px] font-medium">{title}</div>
      <p className="max-w-sm text-[13px] leading-relaxed text-dim">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
