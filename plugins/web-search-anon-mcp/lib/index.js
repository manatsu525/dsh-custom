import { randomUUID } from "node:crypto";
import z from "@deepseek-ai/schemastery";
import { WebError } from "@deepseek-ai/dsh-web";
import { mcpToolsCall, BROWSER_UA } from "./mcp-client.js";

/** Cordis plugin name used by loader diagnostics. */
export const name = "web-search-anon-mcp";
/** The web seam this provider registers into. */
export const inject = ["web"];

/** Stable id this provider registers under. */
export const ANON_MCP_PROVIDER_ID = "anon-mcp";

/** Settings namespace for Plugins → Web search card. */
export const SETTINGS_NAMESPACE = "web-search-anon-mcp";
export const WEB_SEARCH_ANON_MCP_SETTINGS_NAMESPACE = SETTINGS_NAMESPACE;

const ENDPOINTS = /** @type {const} */ (["parallel", "keenable", "youcom"]);

export const Config = z.object({
  endpoint: z
    .union([z.const("parallel"), z.const("keenable"), z.const("youcom")])
    .default("parallel")
    .volatile(),
});

const MCP_URLS = {
  parallel: "https://search.parallel.ai/mcp",
  keenable: "https://api.keenable.ai/mcp",
  youcom: "https://api.you.com/mcp?profile=free",
};

/** Process-stable session_id for Parallel Search MCP. */
const PARALLEL_SESSION_ID = randomUUID();

/**
 * Derive 1–3 short keyword query variants from a free-form objective.
 * @param {string} query
 * @returns {string[]}
 */
export function deriveSearchQueries(query) {
  const q = (query ?? "").trim().replace(/\s+/g, " ");
  if (!q) return ["web search"];
  const variants = [q];
  // Drop very common filler words for a tighter keyword variant
  const keywords = q
    .replace(/[?!.,;:]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^(the|a|an|of|for|to|in|on|and|or|is|are|what|how|why|with)$/i.test(w));
  if (keywords.length >= 2) {
    const tight = keywords.slice(0, 8).join(" ");
    if (tight.toLowerCase() !== q.toLowerCase()) variants.push(tight);
  }
  // Short title-ish variant (first ~6 tokens)
  const short = q.split(/\s+/).slice(0, 6).join(" ");
  if (short.length > 0 && !variants.some((v) => v.toLowerCase() === short.toLowerCase())) {
    variants.push(short);
  }
  return variants.slice(0, 3);
}

function isAbortError(error) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function throwIfAborted(signal) {
  if (signal?.aborted === true) {
    throw new WebError("anon-mcp search aborted", "WEB_ABORTED", { cause: signal.reason });
  }
}

function providerError(message, cause) {
  return new WebError(message, "WEB_PROVIDER_ERROR", cause === undefined ? undefined : { cause });
}

/**
 * @param {unknown} payload
 * @returns {{ sources: Array<{url:string,title?:string,snippet?:string}>, content?: string }}
 */
export function mapParallelPayload(payload) {
  const sources = [];
  const seen = new Set();
  const push = (url, title, snippet) => {
    if (typeof url !== "string" || !url || seen.has(url)) return;
    seen.add(url);
    const s = { url };
    if (typeof title === "string" && title) s.title = title;
    if (typeof snippet === "string" && snippet) s.snippet = snippet;
    sources.push(s);
  };

  const root = payload && typeof payload === "object" ? payload : {};
  const results = Array.isArray(root.results)
    ? root.results
    : Array.isArray(root.web)
      ? root.web
      : [];

  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const url = item.url || item.link;
    const title = item.title || item.name;
    let snippet;
    if (typeof item.snippet === "string") snippet = item.snippet;
    else if (typeof item.excerpts === "string") snippet = item.excerpts;
    else if (Array.isArray(item.excerpts)) snippet = item.excerpts.filter((x) => typeof x === "string").join(" … ");
    else if (typeof item.description === "string") snippet = item.description;
    push(url, title, snippet);
  }

  // Sometimes Parallel nests under output / data
  if (sources.length === 0 && root.data && typeof root.data === "object") {
    return mapParallelPayload(root.data);
  }

  const content =
    typeof root.answer === "string"
      ? root.answer
      : typeof root.content === "string"
        ? root.content
        : typeof root.text === "string"
          ? root.text
          : undefined;

  return { sources, ...(content ? { content } : {}) };
}

/**
 * Keenable: structured results OR Title/URL/Snippets text blocks.
 * @param {unknown} payload
 */
export function mapKeenablePayload(payload) {
  const sources = [];
  const seen = new Set();
  const push = (url, title, snippet) => {
    if (typeof url !== "string" || !url || seen.has(url)) return;
    seen.add(url);
    const s = { url };
    if (typeof title === "string" && title) s.title = title;
    if (typeof snippet === "string" && snippet) s.snippet = snippet;
    sources.push(s);
  };

  if (payload && typeof payload === "object" && !("text" in payload && Object.keys(payload).length === 1)) {
    const root = payload;
    const lists = [root.results, root.pages, root.items, root.data].filter(Array.isArray);
    for (const list of lists) {
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const url = item.url || item.link || item.href;
        const title = item.title || item.name;
        const snippet =
          (typeof item.snippet === "string" && item.snippet) ||
          (typeof item.snippets === "string" && item.snippets) ||
          (Array.isArray(item.snippets) && item.snippets.join(" … ")) ||
          (typeof item.description === "string" && item.description) ||
          (typeof item.content === "string" && item.content) ||
          undefined;
        push(url, title, snippet);
      }
    }
    if (sources.length > 0) {
      const content = typeof root.answer === "string" ? root.answer : undefined;
      return { sources, ...(content ? { content } : {}) };
    }
  }

  const text =
    typeof payload === "string"
      ? payload
      : payload && typeof payload === "object" && typeof payload.text === "string"
        ? payload.text
        : "";

  if (text) {
    // Split on blank lines / numbered blocks: Title: ... URL: ... Snippets: ...
    const blocks = text.split(/\n(?=(?:Title|URL|Link)\s*:)/i);
    let pending = { title: undefined, url: undefined, snippet: undefined };
    const flush = () => {
      if (pending.url) push(pending.url, pending.title, pending.snippet);
      pending = { title: undefined, url: undefined, snippet: undefined };
    };
    for (const block of text.split(/\n+/)) {
      const titleM = block.match(/^\s*Title\s*:\s*(.+)\s*$/i);
      const urlM = block.match(/^\s*(?:URL|Link)\s*:\s*(\S+)\s*$/i);
      const snipM = block.match(/^\s*Snippets?\s*:\s*(.+)\s*$/i);
      if (titleM) {
        if (pending.url) flush();
        pending.title = titleM[1].trim();
      } else if (urlM) {
        if (pending.url) flush();
        pending.url = urlM[1].trim();
      } else if (snipM) {
        pending.snippet = snipM[1].trim();
      }
    }
    flush();
    // Fallback: bare URLs
    if (sources.length === 0) {
      for (const m of text.matchAll(/https?:\/\/[^\s)\]>'"]+/g)) push(m[0]);
    }
  }

  return { sources };
}

/**
 * You.com: JSON with results.web[].url/title/description
 * @param {unknown} payload
 */
export function mapYoucomPayload(payload) {
  const sources = [];
  const seen = new Set();
  const push = (url, title, snippet) => {
    if (typeof url !== "string" || !url || seen.has(url)) return;
    seen.add(url);
    const s = { url };
    if (typeof title === "string" && title) s.title = title;
    if (typeof snippet === "string" && snippet) s.snippet = snippet;
    sources.push(s);
  };

  const root = payload && typeof payload === "object" ? payload : {};
  const web =
    (root.results && typeof root.results === "object" && Array.isArray(root.results.web) && root.results.web) ||
    (Array.isArray(root.web) && root.web) ||
    (Array.isArray(root.results) && root.results) ||
    [];

  for (const item of web) {
    if (!item || typeof item !== "object") continue;
    push(
      item.url || item.link,
      item.title || item.name,
      item.description || item.snippet || item.summary,
    );
  }

  if (sources.length === 0 && typeof root.text === "string") {
    return mapKeenablePayload(root); // reuse text URL scraper
  }

  const content = typeof root.answer === "string" ? root.answer : undefined;
  return { sources, ...(content ? { content } : {}) };
}

/**
 * Keenable public REST fallback when MCP fails.
 * @param {string} query
 * @param {AbortSignal} [signal]
 */
async function keenableRestSearch(query, signal) {
  const res = await fetch("https://api.keenable.ai/v1/search/public", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": BROWSER_UA,
      "X-Keenable-Title": "dsh-official-vps",
    },
    body: JSON.stringify({ query, mode: "realtime" }),
    ...(signal ? { signal } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Keenable REST HTTP ${res.status}: ${text.slice(0, 300)}`);
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new Error(`Keenable REST returned non-JSON: ${text.slice(0, 200)}`);
  }
  return mapKeenablePayload(json);
}

var AnonMcpSearchProvider = class {
  resolveEndpoint;
  id = ANON_MCP_PROVIDER_ID;

  /**
   * @param {() => "parallel"|"keenable"|"youcom"} resolveEndpoint
   */
  constructor(resolveEndpoint) {
    this.resolveEndpoint = resolveEndpoint;
  }

  available() {
    const ep = this.resolveEndpoint();
    return ENDPOINTS.includes(ep);
  }

  /**
   * @param {{ query: string, maxResults?: number }} request
   * @param {AbortSignal} [signal]
   */
  async search(request, signal) {
    throwIfAborted(signal);
    const endpoint = this.resolveEndpoint();
    const query = (request.query ?? "").trim();
    if (!query) throw providerError("anon-mcp search requires a non-empty query");

    try {
      let mapped;
      if (endpoint === "parallel") {
        const payload = await mcpToolsCall({
          url: MCP_URLS.parallel,
          toolName: "web_search",
          args: {
            objective: query,
            search_queries: deriveSearchQueries(query),
            session_id: PARALLEL_SESSION_ID,
          },
          signal,
        });
        mapped = mapParallelPayload(payload);
      } else if (endpoint === "keenable") {
        try {
          const payload = await mcpToolsCall({
            url: MCP_URLS.keenable,
            toolName: "search_web_pages",
            args: { query, mode: "realtime" },
            signal,
            extraHeaders: { "X-Keenable-Title": "dsh-official-vps" },
          });
          mapped = mapKeenablePayload(payload);
        } catch (mcpErr) {
          if (signal?.aborted || isAbortError(mcpErr)) throw mcpErr;
          // REST fallback
          mapped = await keenableRestSearch(query, signal);
        }
      } else if (endpoint === "youcom") {
        const payload = await mcpToolsCall({
          url: MCP_URLS.youcom,
          toolName: "you-search",
          args: { query },
          signal,
        });
        mapped = mapYoucomPayload(payload);
      } else {
        throw providerError(`unknown anon-mcp endpoint "${endpoint}"`);
      }

      throwIfAborted(signal);
      return {
        sources: mapped.sources ?? [],
        truncated: false,
        ...(mapped.content ? { content: mapped.content } : {}),
      };
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) {
        throw new WebError("anon-mcp search aborted", "WEB_ABORTED", { cause: error });
      }
      if (error instanceof WebError) throw error;
      throw providerError(
        `anon-mcp (${endpoint}) search failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }
};

export { AnonMcpSearchProvider };

/**
 * @param {import("@deepseek-ai/cordis").Context} ctx
 * @param {*} config
 */
export function apply(ctx, config) {
  const resolveEndpoint = () => {
    const raw = typeof config.endpoint?.get === "function" ? config.endpoint.get() : config.endpoint;
    const ep = typeof raw === "string" && raw.length > 0 ? raw : "parallel";
    return ENDPOINTS.includes(ep) ? ep : "parallel";
  };

  ctx.web.registerSearchProvider(new AnonMcpSearchProvider(resolveEndpoint));
}
