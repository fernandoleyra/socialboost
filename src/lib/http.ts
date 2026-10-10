import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { LLMError } from "./llm";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
  }
}

export function fail(err: unknown) {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message, hint: err.hint }, { status: err.status });
  if (err instanceof LLMError) return NextResponse.json({ error: err.message, hint: err.hint }, { status: 502 });
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "Invalid input: " + err.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ") }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: err instanceof Error ? err.message : "Unexpected error" }, { status: 500 });
}

/** Wrap a route handler so thrown errors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      return fail(err);
    }
  };
}

/**
 * Stream plain text to the browser. If the generator throws mid-stream we append a
 * NUL-prefixed JSON trailer ({error, hint}) which the client helper `streamText` turns into an Error.
 * `onDone` receives the full text after a successful stream (persist there).
 */
export function streamText(gen: AsyncGenerator<string>, onDone?: (full: string) => void | Promise<void>) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        for await (const piece of gen) {
          full += piece;
          controller.enqueue(encoder.encode(piece));
        }
        await onDone?.(full);
      } catch (err) {
        const payload =
          err instanceof LLMError
            ? { error: err.message, hint: err.hint }
            : { error: err instanceof Error ? err.message : "Generation failed" };
        controller.enqueue(encoder.encode("\u0000" + JSON.stringify(payload)));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" },
  });
}
