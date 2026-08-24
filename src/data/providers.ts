export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  suggestedModel: string;
  local?: boolean;
}

export const PROVIDERS: ProviderPreset[] = [
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", suggestedModel: "gpt-4o-mini" },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", suggestedModel: "openai/gpt-4o-mini" },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", suggestedModel: "llama-3.3-70b-versatile" },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", suggestedModel: "deepseek-chat" },
  { id: "mistral", name: "Mistral", baseUrl: "https://api.mistral.ai/v1", suggestedModel: "mistral-small-latest" },
  { id: "together", name: "Together", baseUrl: "https://api.together.xyz/v1", suggestedModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  { id: "xai", name: "xAI Grok", baseUrl: "https://api.x.ai/v1", suggestedModel: "grok-3-mini" },
  { id: "kilo", name: "Kilo", baseUrl: "https://api.kilo.ai/api/gateway", suggestedModel: "stealth/ox-alpha" },
  { id: "ollama", name: "Ollama", baseUrl: "http://localhost:11434/v1", suggestedModel: "llama3.1", local: true },
  { id: "lmstudio", name: "LM Studio", baseUrl: "http://localhost:1234/v1", suggestedModel: "", local: true },
];

export function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}
