import type { ProviderConfig } from "./types";

type Endpoint = Pick<ProviderConfig, "kind" | "baseUrl">;

/** Where a provider's requests (and its API key) go: kind + origin. An empty Anthropic address means api.anthropic.com. */
function endpointOf(p: Endpoint): string {
  const raw = p.baseUrl.trim() || (p.kind === "anthropic" ? "https://api.anthropic.com" : "");
  try {
    return `${p.kind} ${new URL(raw).origin}`;
  } catch {
    return `${p.kind} ${raw}`;
  }
}

/**
 * True when two provider configs send requests to the same place. A stored API key is only reused
 * for an edited provider whose endpoint didn't change, so a new address never receives the old key.
 */
export function sameProviderEndpoint(a: Endpoint, b: Endpoint): boolean {
  return endpointOf(a) === endpointOf(b);
}
