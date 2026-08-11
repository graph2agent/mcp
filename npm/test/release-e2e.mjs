#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";

const [serverBinary, cliBinary] = process.argv.slice(2);
const expectedServerVersion = process.env.GRAPH2AGENT_EXPECT_SERVER_VERSION;
const expectedCoreVersion = process.env.GRAPH2AGENT_EXPECT_CORE_VERSION ?? expectedServerVersion;
if (!serverBinary || !cliBinary || !expectedServerVersion || !expectedCoreVersion) {
  throw new Error("usage: GRAPH2AGENT_EXPECT_SERVER_VERSION=X.Y.Z [GRAPH2AGENT_EXPECT_CORE_VERSION=X.Y.Z] release-e2e.mjs SERVER CLI");
}

const diagrams = new Map([
  ["flowchart", "flowchart TD\n  Request[Request] --> Auth{Authorized?}\n  Auth -->|yes| API[API]\n  Auth -->|no| Reject[Reject]\n"],
  ["sequence", "sequenceDiagram\n  participant Client\n  participant API\n  Client->>API: Request\n  API-->>Client: Response\n"],
  ["class", "classDiagram\n  class User {\n    +String name\n  }\n  User --> Account : owns\n"],
  ["state", "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running: start\n  Running --> [*]: stop\n"],
  ["er", "erDiagram\n  USER ||--o{ ACCOUNT : owns\n  USER {\n    string name\n  }\n"],
]);

function runCLI(arguments_, input) {
  const result = spawnSync(cliBinary, arguments_, { input, encoding: "utf8" });
  assert.equal(result.status, 0, `${arguments_.join(" ")} failed: ${result.stderr}`);
  assert.equal(result.stderr, "");
  return result.stdout;
}

const server = spawn(serverBinary, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
let stderr = "";
server.stderr.setEncoding("utf8");
server.stderr.on("data", (chunk) => { stderr += chunk; });
const pending = new Map();
createInterface({ input: server.stdout }).on("line", (line) => {
  const response = JSON.parse(line);
  const waiter = pending.get(response.id);
  if (!waiter) return;
  pending.delete(response.id);
  clearTimeout(waiter.timeout);
  waiter.resolve(response);
});

function send(message) {
  server.stdin.write(`${JSON.stringify(message)}\n`);
}

function request(id, method, params) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`timed out waiting for ${method}; stderr: ${stderr}`)),
      10_000,
    );
    pending.set(id, { resolve, timeout });
    send({ jsonrpc: "2.0", id, method, params });
  });
}

try {
  const initialized = await request(1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "graph2agent-release-e2e", version: "1.0.0" },
  });
  assert.equal(initialized.result?.serverInfo?.version, expectedServerVersion);
  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });

  const tools = await request(2, "tools/list", {});
  assert.deepEqual(tools.result?.tools?.map(({ name }) => name), ["describe_mermaid"]);

  let id = 3;
  for (const [kind, mermaid] of diagrams) {
    const response = await request(id, "tools/call", {
      name: "describe_mermaid",
      arguments: { mermaid, profile: "standard" },
    });
    id += 1;
    assert.notEqual(response.result?.isError, true);
    const structured = response.result?.structuredContent;
    assert.equal(structured.diagram_kind, kind);
    assert.equal(structured.graph2agent_version, expectedCoreVersion);
    assert.equal(structured.compatibility_profile, "core-contract-v2");
    assert.equal(structured.ir_schema_version, "1.0");
    assert.deepEqual(structured.diagnostics, []);
    assert.equal(response.result.content[0].text, structured.text);
    assert.equal(runCLI(["describe", "--profile", "standard", "-"], mermaid), structured.text);
    const validation = runCLI(["validate", "-"], mermaid);
    assert.match(validation, new RegExp(`source_sha256=${structured.source_sha256}`));
    assert.match(validation, new RegExp(`semantic_sha256=${structured.semantic_sha256}`));
  }

  const mermaid = diagrams.get("flowchart");
  const first = await request(id, "tools/call", {
    name: "describe_mermaid",
    arguments: { mermaid, profile: "standard" },
  });
  id += 1;
  const second = await request(id, "tools/call", {
    name: "describe_mermaid",
    arguments: { mermaid, profile: "standard" },
  });
  id += 1;
  assert.deepEqual(first.result, second.result);

  const invalid = await request(id, "tools/call", {
    name: "describe_mermaid",
    arguments: { mermaid: "flowchart LR\n  Broken -->", profile: "standard" },
  });
  assert.equal(invalid.result?.isError, true);
  assert.match(invalid.result?.content?.[0]?.text ?? "", /invalid_edge_target/);

  server.stdin.end();
  const exit = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`server did not exit; stderr: ${stderr}`)), 5_000);
    server.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
  assert.deepEqual(exit, { code: 0, signal: null });
  assert.equal(stderr, "");
  process.stdout.write("release CLI/MCP parity: ok (flowchart, sequence, class, state, er)\n");
} finally {
  if (!server.killed) server.kill("SIGTERM");
}
