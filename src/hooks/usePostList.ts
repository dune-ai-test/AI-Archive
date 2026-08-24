import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { PostListItem } from "../../shared/types";

export interface ListParams {
  category?: string[];
  entity?: number[];
  type?: string[];
  status?: string;
  review?: "review" | "accepted" | "rejected" | "all";
  source?: string;
  sort?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export function buildQuery(p: ListParams): string {
  const sp = new URLSearchParams();
  if (p.category?.length) sp.set("category", p.category.join(","));
  if (p.entity?.length) sp.set("entity", p.entity.join(","));
  if (p.type?.length) sp.set("type", p.type.join(","));
  if (p.status) sp.set("status", p.status);
  if (p.review) sp.set("review", p.review);
  if (p.source) sp.set("source", p.source);
  if (p.sort) sp.set("sort", p.sort);
  sp.set("limit", String(p.limit ?? 50));
  sp.set("offset", String(p.offset ?? 0));
  return sp.toString();
}

export function usePostList(params: ListParams, refreshKey: number = 0) {
  const [items, setItems] = useState<PostListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const tickRef = useRef(0);

  const key = buildQuery(params);

  const load = useCallback(
    (append = false) => {
      setLoading(true);
      api
        .get<{ items: PostListItem[]; total: number }>(`/api/posts?${key}`)
        .then((r) => {
          setItems((prev) => (append ? [...prev, ...r.items] : r.items));
          setTotal(r.total);
          setError("");
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    },
    [key]
  );

  useEffect(() => {
    load(false);
  }, [load, refreshKey]);

  // Auto-refresh while pending posts exist (max 15 ticks)
  useEffect(() => {
    if (!items.some((i) => i.status === "pending")) return;
    if (tickRef.current >= 15) return;
    const t = setTimeout(() => {
      tickRef.current += 1;
      load(false);
    }, 4000);
    return () => clearTimeout(t);
  }, [items, load]);

  useEffect(() => {
    tickRef.current = 0;
  }, [key, refreshKey]);

  return { items, total, loading, error, reload: () => load(false), loadMore: () => load(true) };
}

export interface DayGroup {
  label: string;
  items: PostListItem[];
}

export function groupByDay(items: PostListItem[]): DayGroup[] {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const todayStr = fmt(today);
  const yestStr = fmt(yesterday);

  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;

  for (const p of items) {
    const iso = (p.posted_at ?? p.created_at ?? "").slice(0, 10);
    const label =
      iso === todayStr ? "Today" : iso === yestStr ? "Yesterday" : prettyDate(iso);
    if (!current || current.label !== label) {
      current = { label, items: [] };
      groups.push(current);
    }
    current.items.push(p);
  }
  return groups;
}

function prettyDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
