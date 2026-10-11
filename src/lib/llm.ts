import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { Agent } from "undici";
import { z } from "zod";
import { getRoute, getAISettings } from "./settings";
import type { ModelTask, ProviderConfig } from "./types";

/**
 * One small provider layer for every model call in the app.
 *
 *  - ollama     → native /api/chat (structured outputs via `format`, images, think:false)
 *  - openai     → any OpenAI-compatible server: LM Studio, llama.cpp, vLLM, LocalAI, OpenRouter, OpenAI…
 *  - anthropic  → official SDK
 *
 * Callers pick a *task* (interviewer, writer, critic…) and the user's routing table in
 * Settings decides which provider/model serves it.
 */

export type ChatImage = { data: string; mime: string };
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string; images?: ChatImage[] };

export type ChatOptions = {
  task: ModelTask;
  messages: ChatMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

function resolve(task: ModelTask) {
  const r = getRoute(task);
  if (!r) {
    throw new LLMError(
      `No model is configured for the "${task}" task.`,
      "Open Settings → Models and pick a provider and model for this task.",
    );
  }
  return r;
}

const trimSlash = (u: string) => u.replace(/\/+$/, "");

/**
 * Local models on CPU can take minutes before the first byte (model load + prompt processing).
 * Node's fetch gives up after 300 s without headers, so model calls use a dispatcher without
 * header/body timeouts; callers bound the wait with their own AbortSignal instead.
 */
const patient = new Agent({ headersTimeout: 0, bodyTimeout: 0, keepAliveTimeout: 30_000 });
function modelFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, dispatcher: patient } as RequestInit);
}

/** Strip reasoning blocks some local models emit inline. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "").trim();
}

async function httpError(res: Response, provider: ProviderConfig): Promise<LLMError> {
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* ignore */
  }
  const short = body.slice(0, 400);
  if (res.status === 400 && /exceed_context_size|exceeds the available context size/i.test(body)) {
    return new LLMError("The prompt is longer than this model's context window.", "Raise the context window in Settings → Models (8K or more), or use a model with a longer context.");
  }
  if (res.status === 404 && provider.kind === "ollama" && /model/i.test(body)) {
    return new LLMError(`Ollama doesn't have that model yet. ${short}`, "Run `ollama pull <model>` or choose another model in Settings.");
  }
  if (res.status === 401 || res.status === 403) {
    return new LLMError(`${provider.label} rejected the API key (${res.status}).`, "Check the API key in Settings → Models.");
  }
  return new LLMError(`${provider.label} returned ${res.status}: ${short}`);
}

/** The answer hit the output limit: the text stops mid-way, so it must never be saved as complete. */
function truncatedError(): LLMError {
  return new LLMError("The model ran out of room before finishing its answer.", "Try again, or pick another model for this task in Settings → Models.");
}

function networkError(err: unknown, provider: ProviderConfig): LLMError {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof Error && err.name === "AbortError") return new LLMError("Request cancelled.");
  return new LLMError(
    `Couldn't reach ${provider.label} at ${provider.baseUrl} (${msg}).`,
    provider.kind === "ollama" ? "Is Ollama running? Start it with `ollama serve`." : "Check the base URL in Settings → Models.",
  );
}

/* ------------------------------------------------------------------ */
/* Ollama                                                              */
/* ------------------------------------------------------------------ */

function ollamaMessages(opts: ChatOptions) {
  const msgs: { role: string; content: string; images?: string[] }[] = [];
  if (opts.system) msgs.push({ role: "system", content: opts.system });
  for (const m of opts.messages) {
    msgs.push({ role: m.role, content: m.content, ...(m.images?.length ? { images: m.images.map((i) => i.data) } : {}) });
  }
  return msgs;
}

/**
 * Vendor-recommended sampling per model family (Qwen and Gemma publish these).
 * presence_penalty stays 0 for structured output so JSON keys can repeat.
 */
export function familySampling(model: string, task: ModelTask, structured: boolean): Record<string, number> {
  const m = model.toLowerCase();
  if (/^(qwen3|qwen2\.5|qwen)/.test(m)) {
    const presence = structured ? 0 : task === "interviewer" ? 1.0 : task === "writer" ? 0.5 : 0;
    return { top_p: task === "writer" ? 0.9 : 0.8, top_k: 20, ...(task === "writer" ? { min_p: 0.05 } : {}), presence_penalty: presence };
  }
  if (/^(gemma|muse)/.test(m)) return { top_p: 0.95, top_k: 64 };
  return {};
}

async function ollamaChat(
  provider: ProviderConfig,
  model: string,
  opts: ChatOptions,
  extra: { stream: boolean; format?: unknown; numCtx: number; temperature?: number },
): Promise<Response> {
  const body: Record<string, unknown> = {
    model,
    messages: ollamaMessages(opts),
    stream: extra.stream,
    think: false,
    keep_alive: "15m",
    // Ollama silently drops the oldest messages when a prompt overflows num_ctx: for the writer that is
    // the notes turn, the only facts it may use. Fail visibly instead.
    ...(opts.task === "writer" || opts.task === "critic" ? { truncate: false } : {}),
    options: {
      num_ctx: extra.numCtx,
      ...familySampling(model, opts.task, Boolean(extra.format)),
      ...(extra.temperature !== undefined ? { temperature: extra.temperature } : {}),
      ...(opts.maxTokens ? { num_predict: opts.maxTokens } : {}),
    },
    ...(extra.format ? { format: extra.format } : {}),
  };
  const send = (b: Record<string, unknown>) =>
    modelFetch(`${trimSlash(provider.baseUrl)}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(b),
      signal: opts.signal,
    });
  let res: Response;
  try {
    res = await send(body);
    if (res.status === 400) {
      // Older models reject the `think` flag; retry without it.
      const text = await res.clone().text();
      if (/think/i.test(text)) {
        delete body.think;
        res = await send(body);
      }
    }
  } catch (err) {
    throw networkError(err, provider);
  }
  if (!res.ok) throw await httpError(res, provider);
  return res;
}

async function* readNdjson(res: Response): AsyncGenerator<Record<string, unknown>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line);
    }
  }
  if (buf.trim()) yield JSON.parse(buf.trim());
}

async function* readSse(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
}

/**
 * Concatenate a streamed Ollama /api/chat response (used so long calls never wait silently).
 * `prose`: a reply cut at num_predict is an error. Structured calls leave that to the JSON parser,
 * since grammar-constrained output can hit the limit on trailing whitespace after complete JSON.
 */
async function collectOllama(res: Response, prose: boolean): Promise<string> {
  let out = "";
  for await (const chunk of readNdjson(res)) {
    if (chunk.error) throw new LLMError(String(chunk.error));
    out += (chunk.message as { content?: string } | undefined)?.content ?? "";
    if (prose && chunk.done_reason === "length") throw truncatedError();
  }
  return out;
}

type OpenAIChunk = { error?: unknown; choices?: { finish_reason?: string | null; delta?: { content?: string }; message?: { content?: string } }[] };

/** Failures and cut-offs reported inside an OpenAI-compatible response (OpenRouter sends mid-stream errors this way). */
function checkOpenAIChunk(json: OpenAIChunk, prose: boolean) {
  if (json.error) {
    const e = json.error as { message?: unknown };
    throw new LLMError(`The model stopped with an error: ${String(typeof e === "object" && e && e.message ? e.message : json.error)}`);
  }
  const reason = json.choices?.[0]?.finish_reason;
  if (reason === "error") throw new LLMError("The model stopped with an error.");
  if (prose && reason === "length") throw truncatedError();
}

/** Parsed `data:` events of an OpenAI-compatible stream; keep-alive and partial lines are skipped. */
async function* readOpenAIChunks(res: Response, prose: boolean): AsyncGenerator<OpenAIChunk> {
  for await (const data of readSse(res)) {
    if (data === "[DONE]") break;
    let json: OpenAIChunk;
    try {
      json = JSON.parse(data);
    } catch {
      continue;
    }
    checkOpenAIChunk(json, prose);
    yield json;
  }
}

/** Concatenate a streamed OpenAI-compatible response. Falls back to a plain JSON body. */
async function collectOpenAI(res: Response, prose: boolean): Promise<string> {
  if (!(res.headers.get("content-type") ?? "").includes("event-stream")) {
    const json = (await res.json()) as OpenAIChunk;
    checkOpenAIChunk(json, prose);
    return json.choices?.[0]?.message?.content ?? "";
  }
  let out = "";
  for await (const json of readOpenAIChunks(res, prose)) out += json.choices?.[0]?.delta?.content ?? "";
  return out;
}

/* ------------------------------------------------------------------ */
/* OpenAI-compatible                                                   */
/* ------------------------------------------------------------------ */

function openaiMessages(opts: ChatOptions) {
  const msgs: unknown[] = [];
  if (opts.system) msgs.push({ role: "system", content: opts.system });
  for (const m of opts.messages) {
    if (m.images?.length) {
      msgs.push({
        role: m.role,
        content: [
          { type: "text", text: m.content },
          ...m.images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.data}` } })),
        ],
      });
    } else {
      msgs.push({ role: m.role, content: m.content });
    }
  }
  return msgs;
}

/**
 * What each OpenAI-compatible model turned out to reject. Reasoning models (OpenAI's gpt-5 family and
 * o-series) refuse `max_tokens` ("use max_completion_tokens") and any non-default temperature.
 */
const openaiQuirks = new Map<string, { completionTokens: boolean; noTemperature: boolean }>();

async function openaiChat(
  provider: ProviderConfig,
  model: string,
  opts: ChatOptions,
  extra: { stream: boolean; jsonSchema?: Record<string, unknown>; temperature?: number },
): Promise<Response> {
  const quirkKey = `${provider.baseUrl}|${model}`;
  const quirks = { completionTokens: false, noTemperature: false, ...openaiQuirks.get(quirkKey) };
  const base = (): Record<string, unknown> => ({
    model,
    messages: openaiMessages(opts),
    stream: extra.stream,
    ...(extra.temperature !== undefined && !quirks.noTemperature ? { temperature: extra.temperature } : {}),
    ...(opts.maxTokens ? (quirks.completionTokens ? { max_completion_tokens: opts.maxTokens } : { max_tokens: opts.maxTokens }) : {}),
  });
  const formats: (Record<string, unknown> | null)[] = extra.jsonSchema
    ? [{ type: "json_schema", json_schema: { name: "output", schema: extra.jsonSchema, strict: false } }, { type: "json_object" }, null]
    : [null];
  let last: Response | null = null;
  for (let i = 0; i < formats.length; ) {
    try {
      last = await modelFetch(`${trimSlash(provider.baseUrl)}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
        },
        body: JSON.stringify({ ...base(), ...(formats[i] ? { response_format: formats[i] } : {}) }),
        signal: opts.signal,
      });
    } catch (err) {
      throw networkError(err, provider);
    }
    if (last.ok || (last.status !== 400 && last.status !== 422)) break;
    // A parameter this model doesn't take: retry the same attempt without it, and remember.
    const text = await last.clone().text().catch(() => "");
    if (opts.maxTokens && !quirks.completionTokens && /max_completion_tokens/.test(text)) quirks.completionTokens = true;
    else if (extra.temperature !== undefined && !quirks.noTemperature && /temperature/i.test(text) && /unsupported|not supported|only the default/i.test(text)) quirks.noTemperature = true;
    // Some servers reject response_format; fall through to the next, more permissive attempt.
    else {
      i++;
      continue;
    }
    openaiQuirks.set(quirkKey, { ...quirks });
  }
  if (!last!.ok) throw await httpError(last!, provider);
  return last!;
}

/* ------------------------------------------------------------------ */
/* Anthropic                                                           */
/* ------------------------------------------------------------------ */

function anthropicClient(provider: ProviderConfig) {
  const isDefault = !provider.baseUrl || /api\.anthropic\.com/.test(provider.baseUrl);
  return new Anthropic({ apiKey: provider.apiKey || undefined, ...(isDefault ? {} : { baseURL: trimSlash(provider.baseUrl) }) });
}

/** Claude 5 models think by default (Opus 5.5 always), and max_tokens covers thinking plus the answer. */
const isClaude5 = (model: string) => /^claude-(fable|opus|sonnet|haiku|mythos)-5/.test(model);
/** Models that take `effort` and reject sampling params (temperature/top_p/top_k): Claude 5 and Opus 4.7/4.8. */
const noSampling = (model: string) => /^claude-(?:(?:fable|opus|sonnet|haiku|mythos)-5|opus-4-[78])/.test(model);
/**
 * Callers size max_tokens for local models with thinking off. A model that thinks first needs room
 * for that too, so their budget becomes a floor; length stays controlled by the prompt.
 */
const anthropicMaxTokens = (model: string, requested: number | undefined, fallback: number) => (isClaude5(model) ? Math.max(requested ?? 0, fallback) : (requested ?? fallback));
/** Models that accept the server-side refusal fallback ("default" routing). */
const supportsFallbacks = (model: string) => /^claude-(fable-5-1|opus-5-5|opus-5$|sonnet-5-5)/.test(model);

function anthropicParams(provider: ProviderConfig, model: string, opts: ChatOptions, jsonSchema?: Record<string, unknown>) {
  const messages: Anthropic.Beta.BetaMessageParam[] = opts.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.images?.length
        ? [
            ...m.images.map((i) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: i.mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: i.data },
            })),
            { type: "text" as const, text: m.content || "(image)" },
          ]
        : m.content,
    }));
  const systemParts = [opts.system, ...opts.messages.filter((m) => m.role === "system").map((m) => m.content)].filter(Boolean);
  const effort: "medium" | "low" = opts.task === "writer" ? "medium" : "low";
  const isDefaultHost = !provider.baseUrl || /api\.anthropic\.com/.test(provider.baseUrl);
  const fallback = isDefaultHost && supportsFallbacks(model);
  return {
    model,
    max_tokens: anthropicMaxTokens(model, opts.maxTokens, 16000),
    ...(systemParts.length ? { system: systemParts.join("\n\n") } : {}),
    messages,
    ...(noSampling(model)
      ? { output_config: { effort, ...(jsonSchema ? { format: { type: "json_schema" as const, schema: jsonSchema } } : {}) } }
      : {
          ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
          ...(jsonSchema ? { output_config: { format: { type: "json_schema" as const, schema: jsonSchema } } } : {}),
        }),
    ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
}

function anthropicError(err: unknown): LLMError {
  if (err instanceof Anthropic.APIUserAbortError) return new LLMError("Request cancelled.");
  if (err instanceof Anthropic.AuthenticationError) return new LLMError("Anthropic rejected the API key.", "Check the key in Settings → Models.");
  if (err instanceof Anthropic.RateLimitError) return new LLMError("Anthropic rate limit hit — try again in a moment.");
  if (err instanceof Anthropic.BadRequestError) return new LLMError(`Anthropic rejected the request: ${err.message}`);
  if (err instanceof Anthropic.APIConnectionError) return new LLMError("Couldn't reach the Anthropic API.", "Check your network connection.");
  if (err instanceof Anthropic.APIError) return new LLMError(`Anthropic API error ${err.status}: ${err.message}`);
  return new LLMError(err instanceof Error ? err.message : String(err));
}

function checkAnthropicStop(reason: string | null | undefined) {
  if (reason === "refusal") throw new LLMError("The model declined this request.");
  if (reason === "max_tokens" || reason === "model_context_window_exceeded") throw truncatedError();
}

/** Anthropic structured outputs accept a JSON-Schema subset: drop numeric/length bounds, close objects. */
function sanitizeForAnthropic(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeForAnthropic);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "minItems", "maxItems", "$schema", "default"].includes(k)) continue;
    out[k] = sanitizeForAnthropic(v);
  }
  if (out.type === "object") {
    out.additionalProperties = false;
    if (out.properties && !out.required) out.required = Object.keys(out.properties as object);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Stream plain text tokens from the model routed to `opts.task`. */
export async function* chatStream(opts: ChatOptions): AsyncGenerator<string> {
  const { route, provider, numCtx } = resolve(opts.task);
  const temperature = opts.temperature ?? route.temperature;

  if (provider.kind === "ollama") {
    const res = await ollamaChat(provider, route.model, opts, { stream: true, numCtx, temperature });
    let inThink = false;
    for await (const chunk of readNdjson(res)) {
      if (chunk.error) throw new LLMError(String(chunk.error));
      if (chunk.done_reason === "length") throw truncatedError();
      const msg = chunk.message as { content?: string } | undefined;
      let piece = msg?.content ?? "";
      // Hide inline <think> sections from models that ignore think:false.
      if (piece.includes("<think>")) inThink = true;
      if (inThink) {
        if (piece.includes("</think>")) {
          piece = piece.split("</think>").pop() ?? "";
          inThink = false;
        } else continue;
      }
      if (piece) yield piece;
    }
    return;
  }

  if (provider.kind === "openai") {
    const res = await openaiChat(provider, route.model, opts, { stream: true, temperature });
    if (!(res.headers.get("content-type") ?? "").includes("event-stream")) {
      const text = await collectOpenAI(res, true);
      if (text) yield text;
      return;
    }
    for await (const json of readOpenAIChunks(res, true)) {
      const piece = json.choices?.[0]?.delta?.content;
      if (piece) yield piece;
    }
    return;
  }

  // anthropic
  const client = anthropicClient(provider);
  try {
    const stream = client.beta.messages.stream(
      { ...anthropicParams(provider, route.model, { ...opts, temperature }), max_tokens: anthropicMaxTokens(route.model, opts.maxTokens, 32000) },
      { signal: opts.signal },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
    }
    checkAnthropicStop((await stream.finalMessage()).stop_reason);
  } catch (err) {
    if (err instanceof LLMError) throw err;
    throw anthropicError(err);
  }
}

/** Complete a chat and return the full text. */
export async function chat(opts: ChatOptions): Promise<string> {
  const { route, provider, numCtx } = resolve(opts.task);
  const temperature = opts.temperature ?? route.temperature;
  if (provider.kind === "ollama") {
    const res = await ollamaChat(provider, route.model, opts, { stream: true, numCtx, temperature });
    return stripThinking(await collectOllama(res, true));
  }
  if (provider.kind === "openai") {
    const res = await openaiChat(provider, route.model, opts, { stream: true, temperature });
    return stripThinking(await collectOpenAI(res, true));
  }
  let out = "";
  for await (const piece of chatStream(opts)) out += piece;
  return out.trim();
}

/** Pull the first JSON object/array out of a model response. */
export function extractJson(text: string): unknown {
  const cleaned = stripThinking(text).replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through */
  }
  const start = cleaned.search(/[[{]/);
  if (start < 0) throw new LLMError("Model did not return JSON.");
  const open = cleaned[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new LLMError("Model returned incomplete JSON.");
}

/**
 * Ask for structured output validated by a zod schema. Uses the provider's native
 * structured-output support where available, then validates; retries once with the
 * validation error fed back to the model.
 */
export async function chatJson<T>(schema: z.ZodType<T>, opts: ChatOptions): Promise<T> {
  const { route, provider, numCtx } = resolve(opts.task);
  const temperature = opts.temperature ?? route.temperature ?? 0.2;
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  const instruction = `\n\nRespond ONLY with a JSON value matching this JSON Schema (no prose, no markdown fences):\n${JSON.stringify(jsonSchema)}`;
  let messages = [...opts.messages];
  messages[messages.length - 1] = { ...messages[messages.length - 1], content: messages[messages.length - 1].content + instruction };

  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const o = { ...opts, messages };
    let raw: string;
    if (provider.kind === "ollama") {
      const res = await ollamaChat(provider, route.model, o, { stream: true, format: jsonSchema, numCtx, temperature });
      raw = await collectOllama(res, false);
    } else if (provider.kind === "openai") {
      const res = await openaiChat(provider, route.model, o, { stream: true, jsonSchema, temperature });
      raw = await collectOpenAI(res, false);
    } else {
      const client = anthropicClient(provider);
      try {
        const params = anthropicParams(provider, route.model, { ...o, temperature }, sanitizeForAnthropic(jsonSchema) as Record<string, unknown>);
        const msg = await client.beta.messages.create({ ...params, stream: false }, { signal: opts.signal });
        checkAnthropicStop(msg.stop_reason);
        raw = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      } catch (err) {
        if (err instanceof LLMError) throw err;
        throw anthropicError(err);
      }
    }
    try {
      const parsed = schema.safeParse(extractJson(raw));
      if (parsed.success) return parsed.data;
      lastErr = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    messages = [
      ...messages,
      // An empty assistant turn is rejected by some APIs (Anthropic), and there's nothing to correct in it.
      ...(raw.trim() ? [{ role: "assistant" as const, content: raw.slice(0, 4000) }] : []),
      { role: "user", content: `That JSON was invalid (${lastErr}). Reply again with ONLY corrected JSON matching the schema.` },
    ];
  }
  throw new LLMError(`The model couldn't produce valid structured output: ${lastErr}`, "Try a larger model for this task in Settings → Models.");
}

/**
 * Asymmetric retrieval prefixes. Each embedding family was trained with its own
 * query/document markers; using them noticeably improves search quality.
 */
export function embeddingPrefix(model: string, kind: "query" | "document"): string {
  const m = model.toLowerCase();
  if (m.startsWith("embeddinggemma")) return kind === "query" ? "task: search result | query: " : "title: none | text: ";
  if (m.startsWith("nomic-embed")) return kind === "query" ? "search_query: " : "search_document: ";
  if (m.startsWith("qwen3-embedding")) return kind === "query" ? "Instruct: Given a search query, retrieve relevant personal stories and posts\nQuery: " : "";
  if (m.startsWith("mxbai-embed")) return kind === "query" ? "Represent this sentence for searching relevant passages: " : "";
  return "";
}

/**
 * Embed texts with the embedding route. `kind: "query"` for search queries, `"document"`
 * (default) for stored items. Returns null when no embedding model is configured/available
 * or it doesn't answer within `timeoutMs`.
 */
export async function embed(texts: string[], opts: { kind?: "query" | "document"; timeoutMs?: number } = {}): Promise<number[][] | null> {
  const r = getRoute("embedding");
  if (texts.length === 0) return [];
  if (!r) return null;
  const { route, provider } = r;
  const prefix = embeddingPrefix(route.model, opts.kind ?? "document");
  const input = prefix ? texts.map((t) => prefix + t) : texts;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 60000);
  try {
    if (provider.kind === "ollama") {
      const res = await modelFetch(`${trimSlash(provider.baseUrl)}/api/embed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: route.model, input, keep_alive: "15m" }),
        signal,
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { embeddings?: number[][] };
      return json.embeddings ?? null;
    }
    if (provider.kind === "openai") {
      const res = await modelFetch(`${trimSlash(provider.baseUrl)}/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}) },
        body: JSON.stringify({ model: route.model, input }),
        signal,
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { data?: { embedding: number[] }[] };
      return json.data?.map((d) => d.embedding) ?? null;
    }
  } catch {
    return null;
  }
  return null; // Anthropic has no embeddings endpoint.
}

export function cosine(a: number[], b: number[]): number {
  // Vectors from different models/dimensions are not comparable.
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = a.length;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/**
 * Speech-to-text for voice answers in interviews. Uses an OpenAI-compatible
 * /audio/transcriptions endpoint (speaches / faster-whisper-server / whisper.cpp / OpenAI).
 * The "stt" provider id maps to STT_BASE_URL when not defined in settings.
 */
export async function transcribe(file: Blob, filename: string): Promise<string> {
  const s = getAISettings();
  const route = s.routes.transcription;
  if (!route) throw new LLMError("No transcription model configured.", "Use your browser's dictation, or set up Whisper in Settings → Models.");
  const provider =
    s.providers.find((p) => p.id === route.providerId) ??
    (route.providerId === "stt" && process.env.STT_BASE_URL
      ? { id: "stt", kind: "openai" as const, label: "Whisper", baseUrl: process.env.STT_BASE_URL, apiKey: process.env.STT_API_KEY || "" }
      : null);
  if (!provider || provider.kind === "anthropic") throw new LLMError("Transcription needs an OpenAI-compatible Whisper server.");
  const form = new FormData();
  form.append("file", file, filename);
  form.append("model", route.model);
  let res: Response;
  try {
    res = await modelFetch(`${trimSlash(provider.baseUrl)}/audio/transcriptions`, {
      method: "POST",
      headers: provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {},
      body: form,
    });
  } catch (err) {
    throw networkError(err, provider);
  }
  if (!res.ok) throw await httpError(res, provider);
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

/** List the models a provider offers (for the Settings picker). */
export async function listModels(provider: ProviderConfig): Promise<string[]> {
  try {
    if (provider.kind === "ollama") {
      const res = await fetch(`${trimSlash(provider.baseUrl)}/api/tags`);
      if (!res.ok) throw await httpError(res, provider);
      const json = (await res.json()) as { models?: { name: string }[] };
      return (json.models ?? []).map((m) => m.name).sort();
    }
    if (provider.kind === "openai") {
      const res = await fetch(`${trimSlash(provider.baseUrl)}/models`, {
        headers: provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {},
      });
      if (!res.ok) throw await httpError(res, provider);
      const json = (await res.json()) as { data?: { id: string }[] };
      return (json.data ?? []).map((m) => m.id).sort();
    }
    const client = anthropicClient(provider);
    const ids: string[] = [];
    for await (const m of client.models.list()) ids.push(m.id);
    return ids;
  } catch (err) {
    if (err instanceof LLMError) throw err;
    if (provider.kind === "anthropic") throw anthropicError(err);
    throw networkError(err, provider);
  }
}
