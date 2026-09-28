import assert from "node:assert/strict";
import { isSafeSessionId } from "../lib/index.js";

assert.equal(isSafeSessionId("session-87b2a7a9-b2f3-494a-ad32-47ea0d1fc3eb"), true);
assert.equal(isSafeSessionId("session-87B2A7A9-B2F3-494A-AD32-47EA0D1FC3EB"), true);
assert.equal(isSafeSessionId("../etc/passwd"), false);
assert.equal(isSafeSessionId("session-../../../home/share"), false);
assert.equal(isSafeSessionId("session-not-a-uuid"), false);
assert.equal(isSafeSessionId(""), false);
assert.equal(isSafeSessionId(null), false);
console.log("smoke-id: ok");
