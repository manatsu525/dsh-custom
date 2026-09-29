import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "lib");
const a = readFileSync(join(dir, "client.part1.js.txt"), "utf8");
const b = readFileSync(join(dir, "client.part2.js.txt"), "utf8");
writeFileSync(join(dir, "client.js"), a + b);
console.log("[assemble-client] wrote lib/client.js", a.length + b.length, "bytes");
