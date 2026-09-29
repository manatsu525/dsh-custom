import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "lib");
const b64 = readFileSync(join(dir, "client.js.gz.b64"), "utf8").trim();
const js = gunzipSync(Buffer.from(b64, "base64")).toString("utf8");
writeFileSync(join(dir, "client.js"), js);
console.log("[assemble-client] wrote lib/client.js", js.length, "bytes from gzip+b64");
