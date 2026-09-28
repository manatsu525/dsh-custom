/**
 * Host half: authenticated POST /api/vps.deleteSession
 *
 * Hard-deletes ONE conversation (session) without touching the shared workspace
 * cwd (e.g. /home/share). Official dsh only archives; this fills the gap.
 */
import { createHash } from "node:crypto";
import { readdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";

export const name = "vps-delete-session";
export const inject = ["connection", "workspaceRegistry", "sessionPersistence"];

/** Absolute registration path (connection.fetch auth wraps it). */
export const DELETE_SESSION_PATH = "/api/vps.deleteSession";

/** session-<uuid> only — rejects path traversal / odd ids. */
const SESSION_ID_RE =
  /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {string} sessionId
 * @returns {boolean}
 */
export function isSafeSessionId(sessionId) {
  return typeof sessionId === "string" && SESSION_ID_RE.test(sessionId);
}

/**
 * Ensure `candidate` resolves inside `root` (both absolute).
 * @param {string} root
 * @param {string} candidate
 * @returns {boolean}
 */
function isPathInside(root, candidate) {
  const r = resolve(root);
  const c = resolve(candidate);
  return c === r || c.startsWith(r.endsWith(sep) ? r : r + sep);
}

/**
 * Resolve sessions root from jsonl backend, else $DSH_HOME/sessions.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @returns {string}
 */
function sessionsRootOf(ctx) {
  const persistence = ctx.sessionPersistence;
  if (persistence && typeof persistence.root === "string" && persistence.root) {
    return resolve(persistence.root);
  }
  return resolve(dshHomePath("sessions"));
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} sessionId
 * @returns {Promise<string | undefined>}
 */
async function resolveSessionCwd(ctx, sessionId) {
  try {
    const snap = await ctx.sessionPersistence.stat(sessionId);
    if (snap?.header?.cwd && typeof snap.header.cwd === "string") {
      return snap.header.cwd;
    }
  } catch {
    /* fall through to scan */
  }
  const live = ctx.get("sessions")?.get?.(sessionId);
  if (live?.header?.cwd && typeof live.header.cwd === "string") {
    return live.header.cwd;
  }
  return undefined;
}

/**
 * projectKey clone of dsh-session-persistence-jsonl (lossy human-navigable key).
 * @param {string} cwd
 * @returns {string}
 */
function projectKey(cwd) {
  if (cwd.length === 0) throw new Error("cannot encode an empty project path");
  let readable = "";
  let separatorRun = false;
  for (let i = 0; i < cwd.length; i++) {
    const code = cwd.charCodeAt(i);
    const ch = String.fromCharCode(code);
    if (ch === "/" || ch === "\\" || ch === ":") {
      if (!separatorRun) readable += "-";
      separatorRun = true;
    } else if (ch !== "~" && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch;
      separatorRun = false;
    } else {
      readable += "~" + code.toString(16).toUpperCase().padStart(4, "0");
      separatorRun = false;
    }
  }
  return `--${(readable.replace(/^-+/, "") || "root").slice(0, 251)}--`;
}

/**
 * Locate the on-disk session-<uuid> directory under sessions root.
 * Never returns a workspace cwd (e.g. /home/share).
 * @param {string} sessionsRoot
 * @param {string} sessionId
 * @param {string | undefined} cwd
 * @returns {Promise<string | undefined>}
 */
async function findSessionDirectory(sessionsRoot, sessionId, cwd) {
  const candidates = [];
  if (cwd !== undefined) {
    candidates.push(join(sessionsRoot, projectKey(cwd), sessionId));
    candidates.push(join(sessionsRoot, "_no-cwd", sessionId));
  }
  try {
    const projects = await readdir(sessionsRoot, { withFileTypes: true });
    for (const entry of projects) {
      if (!entry.isDirectory()) continue;
      candidates.push(join(sessionsRoot, entry.name, sessionId));
    }
  } catch {
    /* sessions root may be missing */
  }

  const seen = new Set();
  for (const dir of candidates) {
    const abs = resolve(dir);
    if (seen.has(abs)) continue;
    seen.add(abs);
    if (!isPathInside(sessionsRoot, abs)) continue;
    // Must be .../<project>/session-<uuid>, not the sessions root itself
    if (dirname(abs) === resolve(sessionsRoot)) continue;
    try {
      if ((await stat(abs)).isDirectory()) return abs;
    } catch {
      /* missing */
    }
  }
  return undefined;
}

/**
 * @param {string} path
 * @returns {Promise<boolean>} true when removed (or already gone)
 */
async function rmTree(path) {
  try {
    await rm(path, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return true;
    }
    throw error;
  }
}

/**
 * Best-effort: remove empty parent project key dir after last session.
 * @param {string} sessionDir
 * @param {string} sessionsRoot
 */
async function maybeRemoveEmptyProjectDir(sessionDir, sessionsRoot) {
  const parent = dirname(sessionDir);
  if (!isPathInside(sessionsRoot, parent) || resolve(parent) === resolve(sessionsRoot)) return;
  try {
    const left = await readdir(parent);
    if (left.length === 0) await rm(parent, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {string} sessionId
 * @returns {Promise<{ deleted: string[], notes: string[] }>}
 */
async function hardDeleteSession(ctx, sessionId) {
  const deleted = [];
  const notes = [];
  const sessionsRoot = sessionsRootOf(ctx);

  // 1) Stop running work (turn / jobs / subagents / schedules)
  try {
    await ctx.parallel("workspace/session-stop", { sessionId });
  } catch (error) {
    const failures = error instanceof AggregateError ? error.errors : [error];
    for (const failure of failures) {
      ctx.logger.warn(
        `vps-delete-session: stopping session '${sessionId}' failed: ${String(failure)}`,
      );
    }
    notes.push("stop-activity-partial");
  }

  // 2) Registry: unpin / unarchive / detach from every workspace account
  const registry = ctx.workspaceRegistry;
  try {
    await registry.unpinSession(sessionId);
  } catch (error) {
    ctx.logger.warn(`vps-delete-session: unpin '${sessionId}': ${String(error)}`);
  }
  try {
    await registry.unarchiveSession(sessionId);
  } catch (error) {
    ctx.logger.warn(`vps-delete-session: unarchive '${sessionId}': ${String(error)}`);
  }
  try {
    for (const workspace of registry.list()) {
      try {
        await workspace.detachSession(sessionId);
      } catch (error) {
        ctx.logger.warn(
          `vps-delete-session: detach '${sessionId}' from '${workspace.path}': ${String(error)}`,
        );
      }
    }
  } catch (error) {
    ctx.logger.warn(`vps-delete-session: list workspaces failed: ${String(error)}`);
  }

  // 3) Session log directory under DSH_HOME/sessions/<projectKey>/session-<uuid>
  const cwd = await resolveSessionCwd(ctx, sessionId);
  const sessionDir = await findSessionDirectory(sessionsRoot, sessionId, cwd);
  if (sessionDir !== undefined) {
    // Safety: refuse anything that looks like a shared workspace root
    const forbiddenRoots = ["/home/share", "/home", "/"];
    for (const bad of forbiddenRoots) {
      if (resolve(sessionDir) === resolve(bad)) {
        throw new Error(`refusing to delete protected path: ${sessionDir}`);
      }
    }
    await rmTree(sessionDir);
    deleted.push(sessionDir);
    await maybeRemoveEmptyProjectDir(sessionDir, sessionsRoot);
  } else {
    notes.push("session-dir-missing");
  }

  // 4) Projection cache: storages/session_projcache/sessions/<id>.json
  const projcache = resolve(
    dshHomePath("storages", "session_projcache", "sessions", `${sessionId}.json`),
  );
  try {
    await rm(projcache, { force: true });
    deleted.push(projcache);
  } catch (error) {
    ctx.logger.warn(`vps-delete-session: projcache '${sessionId}': ${String(error)}`);
  }

  // 5) Spill scratch under spillStore.root/session-<hash12> when identifiable
  const spill = ctx.get("spillStore");
  if (spill && typeof spill.root === "string" && spill.root) {
    const hash = createHash("sha256").update(sessionId).digest("hex").slice(0, 12);
    const spillDir = resolve(spill.root, `session-${hash}`);
    if (isPathInside(spill.root, spillDir) && resolve(spillDir) !== resolve(spill.root)) {
      try {
        if ((await stat(spillDir)).isDirectory()) {
          await rmTree(spillDir);
          deleted.push(spillDir);
        }
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
          ctx.logger.warn(`vps-delete-session: spill '${sessionId}': ${String(error)}`);
        }
      }
    }
  }

  // 6) Notify clients so the sidebar drops the row (live dispose emits this too)
  try {
    ctx.emit("api-session/removed", sessionId);
  } catch (error) {
    ctx.logger.warn(`vps-delete-session: emit removed '${sessionId}': ${String(error)}`);
  }

  notes.push("workspace-cwd-preserved");
  return { deleted, notes };
}

/**
 * @param {Request} request
 * @returns {Promise<{ sessionId?: string }>}
 */
async function readJsonBody(request) {
  const text = await request.text();
  if (!text || !text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return { __invalidJson: true };
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: DELETE_SESSION_PATH,
        methods: ["POST"],
        requestBody: "buffered",
        fetch: async (request) => {
          if (request.method !== "POST") {
            return new Response("method not allowed", {
              status: 405,
              headers: { allow: "POST", "content-type": "text/plain; charset=utf-8" },
            });
          }
          const body = await readJsonBody(request);
          if (body.__invalidJson) {
            return Response.json({ ok: false, error: "invalid-json" }, { status: 400 });
          }
          const sessionId = body.sessionId;
          if (!isSafeSessionId(sessionId)) {
            return Response.json(
              { ok: false, error: "invalid-session-id" },
              { status: 400 },
            );
          }
          try {
            const result = await hardDeleteSession(ctx, sessionId);
            return Response.json({
              ok: true,
              sessionId,
              deleted: result.deleted,
              notes: result.notes,
              // Explicit safety statement for clients / confirm UI parity
              preserved: {
                sharedWorkspaceCwd: true,
                message:
                  "Did not delete workspace folders such as /home/share; only session-scoped artifacts under DSH_HOME were removed.",
              },
            });
          } catch (error) {
            ctx.logger.error(`vps-delete-session: delete failed: ${String(error)}`);
            return Response.json(
              {
                ok: false,
                error: "delete-failed",
                message: error instanceof Error ? error.message : String(error),
              },
              { status: 500 },
            );
          }
        },
      }),
    "vps-delete-session: /api/vps.deleteSession",
  );
}
