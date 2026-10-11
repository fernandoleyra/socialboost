/**
 * Provider layer edge cases against fetch stubs: answers cut at the output limit, mid-stream errors,
 * OpenAI reasoning-model parameters, context overflow and Claude parameters. Throwaway SQLite for settings.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-llm-"));
process.env.SOCIALBOOST_DATA_DIR = dir;

let llm: typeof import("./llm");
let settings: typeof import("./settings");

type Sent = { url: string; body: Record<string, unknown> };
let sent: Sent[] = [];

function stub(answer: (req: Sent) => Response | Promise<Response>) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = { url: String(input instanceof Request ? input.url : input), body: JSON.parse(String(init?.body ?? "{}")) };
    sent.push(req);
    return answer(req);
  });
}

function route(kind: "ollama" | "openai" | "anthropic", model: string) {
  const s = settings.getAISettings();
  const provider = { id: kind, kind, label: kind, baseUrl: kind === "ollama" ? "http://ollama.test" : kind === "openai" ? "http://openai.test/v1" : "", apiKey: kind === "ollama" ? "" : "key" };
  const r = { providerId: kind, model, temperature: 0.7 };
  settings.saveAISettings({ ...s, providers: [provider], routes: { ...s.routes, writer: r, extractor: r } });
}

const ndjson = (chunks: Record<string, unknown>[]) => new Response(chunks.map((c) => JSON.stringify(c)).join("\n") + "\n", { headers: { "content-type": "application/x-ndjson" } });
const sse = (events: unknown[]) => new Response(events.map((e) => `data: ${typeof e === "string" ? e : JSON.stringify(e)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
const ask = { task: "writer" as const, messages: [{ role: "user" as const, content: "Write the post." }], maxTokens: 1600 };

beforeAll(async () => {
  llm = await import("./llm");
  settings = await import("./settings");
});

afterEach(() => {
  vi.unstubAllGlobals();
  sent = [];
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("Ollama", () => {
  it("refuses a post cut off at the output limit instead of returning half of it", async () => {
    route("ollama", "qwen3.5:4b");
    stub(() => ndjson([{ message: { content: "At 7:40 the client" } }, { message: { content: "" }, done: true, done_reason: "length" }]));
    await expect(llm.chat(ask)).rejects.toThrow(/ran out of room/);
    const pieces: string[] = [];
    await expect(
      (async () => {
        for await (const p of llm.chatStream(ask)) pieces.push(p);
      })(),
    ).rejects.toThrow(/ran out of room/);
    // Overflowing num_ctx must fail visibly, not silently drop the notes turn.
    expect(sent[0].body.truncate).toBe(false);
  });

  it("still accepts complete JSON that ran into the limit on trailing whitespace", async () => {
    route("ollama", "qwen3.5:4b");
    stub(() => ndjson([{ message: { content: '{"ok":true}\n\n\n' } }, { done: true, done_reason: "length" }]));
    expect(await llm.chatJson(z.object({ ok: z.boolean() }), { ...ask, task: "extractor" })).toEqual({ ok: true });
    expect(sent[0].body.truncate).toBeUndefined();
  });

  it("explains a prompt that doesn't fit the context window", async () => {
    route("ollama", "qwen3.5:4b");
    stub(() => new Response(JSON.stringify({ error: "request (5040 tokens) exceeds the available context size (4096 tokens), try increasing it" }), { status: 400 }));
    await expect(llm.chat(ask)).rejects.toMatchObject({ message: expect.stringMatching(/context window/), hint: expect.stringMatching(/Settings → Models/) });
  });
});

describe("OpenAI-compatible", () => {
  it("switches to max_completion_tokens and drops temperature when a reasoning model asks for it", async () => {
    route("openai", "gpt-5-mini");
    stub(({ body }) => {
      if ("max_tokens" in body) return Response.json({ error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead." } }, { status: 400 });
      if ("temperature" in body) return Response.json({ error: { message: "Unsupported value: 'temperature' does not support 0.7 with this model. Only the default (1) value is supported." } }, { status: 400 });
      return sse([{ choices: [{ delta: { content: "Done." }, finish_reason: "stop" }] }, "[DONE]"]);
    });
    expect(await llm.chat(ask)).toBe("Done.");
    expect(sent.at(-1)!.body).toMatchObject({ max_completion_tokens: 1600 });
    // Remembered for the next call.
    sent = [];
    await llm.chat(ask);
    expect(sent).toHaveLength(1);
  });

  it("surfaces mid-stream errors and length cut-offs instead of a quiet partial answer", async () => {
    route("openai", "local-model");
    stub(() => sse([{ choices: [{ delta: { content: "At 7:40" } }] }, { error: { message: "Upstream provider timed out" }, choices: [{ delta: {}, finish_reason: "error" }] }]));
    await expect(llm.chat(ask)).rejects.toThrow(/Upstream provider timed out/);
    stub(() => sse([{ choices: [{ delta: { content: "At 7:40" } }] }, { choices: [{ delta: {}, finish_reason: "length" }] }, "[DONE]"]));
    await expect(llm.chat(ask)).rejects.toThrow(/ran out of room/);
  });
});

describe("Anthropic", () => {
  const message = (text: string, stop_reason: string) =>
    Response.json({ id: "msg_1", type: "message", role: "assistant", model: "m", content: [{ type: "text", text }], stop_reason, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });

  it("gives thinking Claude 5 models room beyond small local-model budgets and reports a cut-off", async () => {
    route("anthropic", "claude-haiku-5-5");
    stub(() => message('{"ok":', "max_tokens"));
    await expect(llm.chatJson(z.object({ ok: z.boolean() }), { ...ask, task: "extractor", maxTokens: 300 })).rejects.toThrow(/ran out of room/);
    expect(sent[0].body.max_tokens).toBe(16000);
    expect(sent[0].body.temperature).toBeUndefined();
  });

  it("sends no temperature to Opus 4.8, which rejects sampling parameters", async () => {
    route("anthropic", "claude-opus-4-8");
    stub(() => message('{"ok":true}', "end_turn"));
    expect(await llm.chatJson(z.object({ ok: z.boolean() }), { ...ask, task: "extractor", temperature: 0.2, maxTokens: 900 })).toEqual({ ok: true });
    expect(sent[0].body).toMatchObject({ max_tokens: 900, output_config: { effort: "low" } });
    expect(sent[0].body.temperature).toBeUndefined();
  });

  it("stops when the caller cancels", async () => {
    route("anthropic", "claude-opus-4-8");
    stub(() => message('{"ok":true}', "end_turn"));
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(llm.chatJson(z.object({ ok: z.boolean() }), { ...ask, task: "extractor", signal: ctrl.signal })).rejects.toThrow(/cancelled/);
  });
});
