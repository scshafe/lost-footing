import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, resolveRequest } from "../server/serve.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let server;
let base;

before(async () => {
  server = createServer(ROOT);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const get = (p, init) => fetch(`${base}${p}`, { redirect: "manual", ...init });

test("the health probe answers ok", async () => {
  const res = await get("/healthz");
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "ok\n");
});

test("the root sends players to the game", async () => {
  const res = await get("/");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/web/");
});

test("the client page and the modules it imports are served", async () => {
  const page = await get("/web/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /^text\/html/);
  assert.match(await page.text(), /<canvas id="game"/);
  const mod = await get("/src/index.js");
  assert.equal(mod.status, 200);
  assert.match(mod.headers.get("content-type"), /^text\/javascript/);
  assert.equal(mod.headers.get("x-content-type-options"), "nosniff");
});

test("nothing outside web/ and src/ is served", async () => {
  for (const p of ["/dev.toml", "/tests/helpers.js", "/server/serve.js", "/docs/brief.md",
    "/web/../dev.toml", "/web/%2e%2e/dev.toml", "/src/%2e%2e/.git/config", "/web/%00", "/src/", "/web/missing.js"]) {
    const res = await get(p);
    assert.equal(res.status, 404, p);
  }
});

test("only GET and HEAD are allowed", async () => {
  assert.equal((await get("/web/", { method: "POST" })).status, 405);
  const head = await get("/web/index.html", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("request paths resolve only inside the served directories", () => {
  assert.equal(resolveRequest(ROOT, "/web/main.js"), path.join(ROOT, "web", "main.js"));
  assert.equal(resolveRequest(ROOT, "/web/../../etc/passwd"), null);
  assert.equal(resolveRequest(ROOT, "/webx/main.js"), null);
  assert.equal(resolveRequest(ROOT, "/%E0%A4%A"), null);
});
