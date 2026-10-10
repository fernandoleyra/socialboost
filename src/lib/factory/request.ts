import "server-only";
import type { z } from "zod";
import { HttpError } from "@/lib/http";

/** Parse a JSON request body with a zod schema. Malformed JSON is a 400, not a 500. */
export async function readBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const raw = await req.text();
  let json: unknown = {};
  if (raw.trim()) {
    try {
      json = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "The request body isn't valid JSON.");
    }
  }
  return schema.parse(json);
}
