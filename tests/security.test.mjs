import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { hashPassword, verifyPassword } from "../lib/passwords.ts";
import { readJsonBody, requireSameOrigin, throttleAuthentication } from "../lib/request-security.ts";
const database = new DatabaseSync(":memory:");
for (const file of readdirSync(new URL("../drizzle/", import.meta.url)).filter(file => file.endsWith(".sql")).sort()) database.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
const query = sql => ({ bind: (...values) => ({ first: async () => database.prepare(sql).get(...values) ?? null, all: async () => ({ results: database.prepare(sql).all(...values) }), run: async () => ({ meta: { changes: Number(database.prepare(sql).run(...values).changes) } }) }) });
globalThis.__clinicSecurityEnvironment = { DB: { prepare: query, batch: async statements => Promise.all(statements.map(statement => statement.run())) } };
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "cloudflare:workers") return { url: "clinic-test:env", shortCircuit: true };
    try { return next(specifier, context); } catch (error) { if (specifier.startsWith(".") && error.code === "ERR_MODULE_NOT_FOUND") return next(`${specifier}.ts`, context); throw error; }
  },
  load(url, context, next) { return url === "clinic-test:env" ? { format: "module", source: "export const env = globalThis.__clinicSecurityEnvironment;", shortCircuit: true } : next(url, context); },
});
const { GET, POST } = await import("../app/api/clinic/route.ts");
const request = (action, body = {}, cookie = "") => new Request("https://clinic.example/api/clinic", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ action, ...body }) });
test("new password hashes have independent salts and reject wrong passwords", async () => {
  const password = randomBytes(18).toString("base64url"), a = await hashPassword(password), b = await hashPassword(password);
  assert.notEqual(a, b); assert.match(a, /^\$2[aby]\$12\$/);
  assert.equal((await verifyPassword("person@example.com", password, a)).valid, true);
  assert.equal((await verifyPassword("person@example.com", `${password}x`, a)).valid, false);
});
test("legacy accounts migrate on login and HTTPS sessions use secure cookies", async () => {
  const email = "legacy@example.com", password = randomBytes(18).toString("base64url");
  const legacy = createHash("sha256").update(`nfc-v1:${email}:${password}`).digest("hex");
  database.prepare("INSERT INTO users(id,email,password_hash,name,role,active,created_at) VALUES(?,?,?,?,?,1,?)").run("legacy", email, legacy, "Legacy", "patient", new Date().toISOString());
  const response = await POST(request("login", { email, password })); assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /HttpOnly; SameSite=Strict;.*Secure/);
  assert.match(database.prepare("SELECT password_hash FROM users WHERE id='legacy'").get().password_hash, /^\$2[aby]\$12\$/);
});
test("deactivating a doctor revokes an already active session", async () => {
  for (const [id, role] of [["admin", "admin"], ["doctor", "doctor"]]) {
    database.prepare("INSERT INTO users(id,email,password_hash,name,role,active,created_at) VALUES(?,?,?,?,?,1,?)").run(id, `${id}@example.com`, "unused", id, role, new Date().toISOString());
    database.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").run(createHash("sha256").update(id).digest("hex"), id, new Date(Date.now() + 3600000).toISOString(), new Date().toISOString());
  }
  assert.equal((await POST(request("deactivate_doctor", { doctorId: "doctor" }, "clinic_session=admin"))).status, 200);
  const denied = await GET(new Request("https://clinic.example/api/clinic?action=appointments", { headers: { cookie: "clinic_session=doctor" } }));
  assert.equal(denied.status, 401); assert.equal(database.prepare("SELECT COUNT(*) AS total FROM sessions WHERE user_id='doctor'").get().total, 0);
});
test("cross-site, oversized and non-JSON requests are rejected", async () => {
  assert.throws(() => requireSameOrigin(new Request("https://clinic.example/api/clinic", { headers: { origin: "https://attacker.example" } })), { status: 403 });
  await assert.rejects(() => readJsonBody(new Request("https://clinic.example", { method: "POST", body: "{}" })), { status: 415 });
  await assert.rejects(() => readJsonBody(new Request("https://clinic.example", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "x".repeat(65536) }) })), { status: 413 });
});
test("repeated authentication attempts are throttled", () => {
  const r = request("login"); for (let i = 0; i < 5; i++) throttleAuthentication(r, "login", "limited@example.com");
  assert.throws(() => throttleAuthentication(r, "login", "limited@example.com"), { status: 429 });
});
