/**
 * Minimal Streamable HTTP MCP client (JSON-RPC over POST).
 * No heavy deps — uses global fetch. Honors AbortSignal.
 */

export const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const MCP_PROTOCOL_VERSION = "2025-06-18";

/**
 * @param {string} text
 * @param {string|number} [expectId]
 */
export function parseMcpBody(text, expectId) {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;

  // Plain JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return expectId === undefined
          ? parsed.find((e) => e && typeof e === "object" && "result" in e) ?? parsed[0]
          : parsed.find((e) => e && e.id === expectId) ?? parsed[0];
      }
      return parsed;
    } catch {
      /* fall through to SSE */
    }
  }

  // SSE: event: message / data: ...
  let last = null;
  for (const block of trimmed.split(/\n\n+/)) {
    const dataLines = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) continue;
    const payload = dataLines.join("\n");
    try {
      const obj = JSON.parse(payload);
      if (expectId !== undefined && obj && obj.id !== expectId && obj.id != null) continue;
      last = obj;
      if (obj && (obj.result !== undefined || obj.error !== undefined)) {
        if (expectId === undefined || obj.id === expectId) return obj;
      }
    } catch {
      /* ignore partial SSE frames */
    }
  }
  return last;
}

/**
 * Extract text / structured content from a tools/call result envelope.
 * @param {unknown} envelope
 */
export function extractToolPayload(envelope) {
  if (!envelope || typeof envelope !== "object") {
    throw new Error("MCP tools/call returned an empty envelope");
  }
  if (envelope.error) {
    const msg =
      typeof envelope.error.message === "string"
        ? envelope.error.message
        : JSON.stringify(envelope.error);
    throw new Error(`MCP tools/call error: ${msg}`);
  }
  const result = envelope.result;
  if (!result || typeof result !== "object") {
    throw new Error("MCP tools/call missing result");
  }
  if (result.isError === true) {
    const errText = collectTextContent(result.content);
    throw new Error(errText || "MCP tool reported isError");
  }
  // Prefer structuredContent when present
  if (result.structuredContent != null) return result.structuredContent;
  const texts = collectTextParts(result.content);
  if (texts.length === 0) return result;
  // Try parse first JSON-looking text block
  for (const t of texts) {
    const s = t.trim();
    if (s.startsWith("{") || s.startsWith("[")) {
      try {
        return JSON.parse(s);
      } catch {
        /* keep looking */
      }
    }
  }
  return { text: texts.join("\n\n") };
}

function collectTextParts(content) {
  if (!Array.isArray(content)) return [];
  const out = [];
  for (const part of content) {
    if (part && part.type === "text" && typeof part.text === "string") out.push(part.text);
  }
  return out;
}

function collectTextContent(content) {
  return collectTextParts(content).join("\n").trim();
}

/**
 * One-shot MCP session: initialize → notifications/initialized → tools/call.
 *
 * @param {object} opts
 * @param {string} opts.url
 * @param {string} opts.toolName
 * @param {Record<string, unknown>} opts.args
 * @param {AbortSignal} [opts.signal]
 * @param {Record<string, string>} [opts.extraHeaders]
 * @param {string} [opts.clientName]
 */
export async function mcpToolsCall({
  url,
  toolName,
  args,
  signal,
  extraHeaders = {},
  clientName = "dsh-web-search-anon-mcp",
}) {
  let rpcId = 0;
  const nextId = () => ++rpcId;

  /** @type {string|undefined} */
  let sessionId;
  /** @type {string} */
  let protocolVersion = MCP_PROTOCOL_VERSION;

  const post = async (body, { notification = false } = {}) => {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "User-Agent": BROWSER_UA,
      "MCP-Protocol-Version": protocolVersion,
      ...extraHeaders,
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "follow",
      ...(signal ? { signal } : {}),
    });

    const sid = res.headers.get("mcp-session-id") || res.headers.get("Mcp-Session-Id");
    if (sid) sessionId = sid;

    const text = await res.text();
    if (notification) {
      if (!res.ok && res.status !== 202 && res.status !== 204) {
        throw new Error(`MCP notification failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
      }
      return { ok: res.ok || res.status === 202 || res.status === 204, status: res.status, text };
    }
    if (!res.ok) {
      throw new Error(`MCP HTTP ${res.status}: ${text.slice(0, 400)}`);
    }
    return { ok: true, status: res.status, text, id: body.id };
  };

  // 1) initialize
  const initId = nextId();
  const initRes = await post({
    jsonrpc: "2.0",
    id: initId,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: clientName, version: "0.1.0" },
    },
  });
  const initEnv = parseMcpBody(initRes.text, initId);
  if (initEnv?.error) {
    throw new Error(`MCP initialize error: ${JSON.stringify(initEnv.error)}`);
  }
  const negotiated = initEnv?.result?.protocolVersion;
  if (typeof negotiated === "string" && negotiated.length > 0) protocolVersion = negotiated;

  // 2) notifications/initialized
  await post({ jsonrpc: "2.0", method: "notifications/initialized" }, { notification: true });

  // 3) tools/call
  const callId = nextId();
  const callRes = await post({
    jsonrpc: "2.0",
    id: callId,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  });
  const callEnv = parseMcpBody(callRes.text, callId);
  return extractToolPayload(callEnv);
}

/**
 * Optional tools/list helper (You.com tool name confirmation).
 */
export async function mcpToolsList(url, signal, extraHeaders = {}) {
  let sessionId;
  let protocolVersion = MCP_PROTOCOL_VERSION;
  let rpcId = 0;

  const post = async (body, notification = false) => {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "User-Agent": BROWSER_UA,
      "MCP-Protocol-Version": protocolVersion,
      ...extraHeaders,
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    const sid = res.headers.get("mcp-session-id") || res.headers.get("Mcp-Session-Id");
    if (sid) sessionId = sid;
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  };

  const initId = ++rpcId;
  const initRes = await post({
    jsonrpc: "2.0",
    id: initId,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "dsh-anon-mcp-list", version: "0.1.0" },
    },
  });
  if (!initRes.ok) throw new Error(`tools/list init HTTP ${initRes.status}`);
  const initEnv = parseMcpBody(initRes.text, initId);
  const negotiated = initEnv?.result?.protocolVersion;
  if (typeof negotiated === "string") protocolVersion = negotiated;
  await post({ jsonrpc: "2.0", method: "notifications/initialized" }, true);

  const listId = ++rpcId;
  const listRes = await post({
    jsonrpc: "2.0",
    id: listId,
    method: "tools/list",
    params: {},
  });
  if (!listRes.ok) throw new Error(`tools/list HTTP ${listRes.status}: ${listRes.text.slice(0, 200)}`);
  const env = parseMcpBody(listRes.text, listId);
  return env?.result?.tools ?? [];
}
