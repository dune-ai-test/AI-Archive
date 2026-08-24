import type { Category, Entity, EntityTypeName } from "../../shared/types";

export const ENTITY_TYPE_COLORS: Record<EntityTypeName, { dot: string; border: string; text: string }> = {
  company: { dot: "bg-et-company", border: "border-et-company/40", text: "text-et-company" },
  model: { dot: "bg-et-model", border: "border-et-model/40", text: "text-et-model" },
  person: { dot: "bg-et-person", border: "border-et-person/40", text: "text-et-person" },
  technology: { dot: "bg-et-tech", border: "border-et-tech/40", text: "text-et-tech" },
  product: { dot: "bg-et-product", border: "border-et-product/40", text: "text-et-product" },
};

export const ENTITY_TYPE_LABELS: Record<EntityTypeName, string> = {
  company: "Companies",
  model: "Models",
  person: "People",
  technology: "Technologies",
  product: "Products",
};

export function CategoryChip({
  category,
  onClick,
}: {
  category: Category;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-6 items-center gap-1 rounded-full bg-accent-subtle px-2.5 text-[12px] font-medium text-accent-hi ${
        onClick ? "cursor-pointer hover:brightness-125" : "cursor-default"
      }`}
    >
      <span>{category.emoji}</span>
      {category.name}
    </button>
  );
}

export function EntityChip({
  entity,
  onClick,
  onRemove,
}: {
  entity: Entity;
  onClick?: (e: React.MouseEvent) => void;
  onRemove?: () => void;
}) {
  const c = ENTITY_TYPE_COLORS[entity.type] ?? ENTITY_TYPE_COLORS.company;
  return (
    <span
      onClick={onClick as unknown as React.MouseEventHandler<HTMLSpanElement>}
      className={`inline-flex h-6 items-center gap-1.5 rounded-full border bg-elevated px-2.5 text-[12px] text-dim ${
        c.border
      } ${onClick ? "cursor-pointer hover:text-ink" : ""}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`} />
      {entity.name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${entity.name}`}
          className="ml-0.5 text-faint hover:text-danger"
        >
          ×
        </button>
      )}
    </span>
  );
}
