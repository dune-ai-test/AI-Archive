export type EntityTypeName =
  | "company"
  | "model"
  | "person"
  | "technology"
  | "product";

export const ENTITY_TYPES: EntityTypeName[] = [
  "company",
  "model",
  "person",
  "technology",
  "product",
];

export type PostStatus = "pending" | "analyzed" | "failed";
export type PostReview = "review" | "accepted" | "rejected";
export type PostSource = "x" | "github" | "web" | "manual";

export interface RepoMeta {
  full_name: string;
  stars: number;
  language: string | null;
  topics: string[];
  pushed_at: string | null;
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  count?: number;
}

export interface Entity {
  id: number;
  type: EntityTypeName;
  name: string;
  slug: string;
  count?: number;
}

export interface PostTags {
  categories: Category[];
  entities: Entity[];
}

export interface PostListItem extends PostTags {
  id: number;
  raw_text: string;
  title: string | null;
  summary: string | null;
  author_handle: string | null;
  author_name: string | null;
  post_url: string | null;
  posted_at: string | null;
  status: PostStatus;
  review: PostReview;
  source?: PostSource | string;
  error: string | null;
  created_at: string;
}

export interface PostDetail extends PostListItem {
  analysis_json: string | null;
}

export interface TaxonomyResponse {
  categories: Category[];
  entities: Entity[];
}

export interface ConnectionDTO {
  id: number;
  name: string;
  base_url: string;
  model: string;
  is_active: boolean;
  key_set: boolean;
}

export interface SettingsPublic {
  ai_base_url: string;
  ai_model: string;
  ai_api_key_set: boolean;
}

export interface TestResult {
  ok: boolean;
  latency_ms?: number;
  model?: string;
  error?: string;
}

export interface NewPostInput {
  raw_text: string;
  author_handle?: string;
  author_name?: string;
  post_url?: string;
  posted_at?: string;
}

export interface ExportPayload {
  exported_at: string;
  posts: (PostDetail & { tags: PostTags })[];
}
