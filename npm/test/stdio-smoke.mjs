#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const [command, ...commandArguments] = process.argv.slice(2);
if (!command) throw new Error("usage: stdio-smoke.mjs COMMAND [ARG ...]");
const expectedServerVersion = process.env.GRAPH2AGENT_EXPECT_SERVER_VERSION;
if (!expectedServerVersion) throw new Error("GRAPH2AGENT_EXPECT_SERVER_VERSION is required");

const child = spawn(command, commandArguments, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
let stderr = "";
let childClosed = false;
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => { stderr += chunk; });
const closed = new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code, signal) => {
    childClosed = true;
    resolve({ code, signal });
  });
});

const pending = new Map();
let protocolError;
function rejectProtocol(reason, line) {
  if (protocolError) return;
  protocolError = new Error(`${reason}: ${JSON.stringify(line)}`);
  for (const request of pending.values()) {
    clearTimeout(request.timeout);
    request.reject(protocolError);
  }
  pending.clear();
  child.kill("SIGTERM");
}

function isJSONRPCEnvelope(message) {
  if (message === null || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0") {
    return false;
  }
  if (typeof message.method === "string") {
    return !("result" in message) && !("error" in message);
  }
  if (!("id" in message)) return false;
  return ("result" in message) !== ("error" in message);
}

const lines = createInterface({ input: child.stdout });
lines.on("line", (line) => {
  if (!line.trim()) {
    rejectProtocol("blank line corrupted MCP stdout", line);
    return;
  }
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    rejectProtocol("non-JSON data corrupted MCP stdout", line);
    return;
  }
  if (!isJSONRPCEnvelope(message)) {
    rejectProtocol("non-JSON-RPC data corrupted MCP stdout", line);
    return;
  }
  if (message.id !== undefined && pending.has(message.id)) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(request.timeout);
    request.resolve(message);
  }
});

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function request(id, method, params) {
  return new Promise((resolve, reject) => {
    if (protocolError) {
      reject(protocolError);
      return;
    }
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timed out waiting for ${method}; stderr: ${stderr}`));
    }, 10_000);
    pending.set(id, { resolve, reject, timeout });
    send({ jsonrpc: "2.0", id, method, params });
  });
}

try {
  const initialized = await request(1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "graph2agent-npm-smoke", version: "1.0.0" },
  });
  if (initialized.error || initialized.result?.serverInfo?.version !== expectedServerVersion) {
    throw new Error(`initialize version mismatch: ${JSON.stringify(initialized)}`);
  }
  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });

  const tools = await request(2, "tools/list", {});
  if (tools.error || !tools.result?.tools?.some((tool) => tool.name === "describe_mermaid")) {
    throw new Error(`tools/list failed: ${JSON.stringify(tools)}`);
  }

  const described = await request(3, "tools/call", {
    name: "describe_mermaid",
    arguments: { mermaid: "flowchart LR\n  A --> B", profile: "standard" },
  });
  if (described.error || described.result?.isError || !described.result?.content?.[0]?.text?.includes("A")) {
    throw new Error(`describe_mermaid failed: ${JSON.stringify(described)}`);
  }

  child.stdin.end();
  let closeTimeout;
  let exit;
  try {
    exit = await Promise.race([
      closed,
      new Promise((_, reject) => {
        closeTimeout = setTimeout(() => reject(new Error(`MCP server did not exit after stdin closed; stderr: ${stderr}`)), 5_000);
      }),
    ]);
  } finally {
    clearTimeout(closeTimeout);
  }
  if (protocolError) throw protocolError;
  if (pending.size !== 0) throw new Error(`MCP server exited with pending responses; stderr: ${stderr}`);
  if (exit.code !== 0 || exit.signal !== null) {
    throw new Error(`MCP server exited with code ${exit.code} and signal ${exit.signal}; stderr: ${stderr}`);
  }
  process.stdout.write("npm MCP stdio smoke: ok\n");
} finally {
  if (!childClosed) child.kill("SIGTERM");
}
