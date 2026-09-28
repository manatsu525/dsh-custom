#!/usr/bin/env node
/**
 * Smoke-test anon-mcp provider.search for parallel / keenable / youcom.
 * Usage: node scripts/smoke-search.mjs [query]
 */
import {
  AnonMcpSearchProvider,
  ANON_MCP_PROVIDER_ID,
} from "../lib/index.js";

const query = process.argv[2] || "DeepSeek Harness";
const endpoints = ["parallel", "keenable", "youcom"];
const only = process.env.SMOKE_ENDPOINT; // optional single endpoint

const list = only ? [only] : endpoints;
const results = [];

for (const endpoint of list) {
  const provider = new AnonMcpSearchProvider(() => endpoint);
  console.log(`\n=== ${endpoint} (id=${provider.id}) available=${provider.available()} ===`);
  const t0 = Date.now();
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 45000);
    const out = await provider.search({ query, maxResults: 5 }, ac.signal);
    clearTimeout(timer);
    const ms = Date.now() - t0;
    const n = out.sources?.length ?? 0;
    const sample = (out.sources ?? []).slice(0, 3).map((s) => ({
      url: s.url,
      title: s.title?.slice(0, 80),
      snippet: s.snippet?.slice(0, 100),
    }));
    console.log(`PASS ${endpoint}: ${n} sources in ${ms}ms`);
    console.log(JSON.stringify(sample, null, 2));
    results.push({ endpoint, ok: true, n, ms });
  } catch (err) {
    const ms = Date.now() - t0;
    console.log(`FAIL ${endpoint}: ${err?.message || err} (${ms}ms)`);
    results.push({ endpoint, ok: false, error: String(err?.message || err), ms });
  }
}

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify({ providerId: ANON_MCP_PROVIDER_ID, query, results }, null, 2));
const hard = results.filter((r) => r.endpoint === "parallel" || r.endpoint === "keenable");
process.exit(hard.every((r) => r.ok) ? 0 : 1);
