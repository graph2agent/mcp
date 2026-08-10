#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const [command, ...commandArguments] = process.argv.slice(2);
if (!command) throw new Error("usage: stdio-smoke.mjs COMMAND [ARG ...]");

const child = spawn(command, commandArguments, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
let stderr = "";
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => { stderr += chunk; });

const pending = new Map();
const lines = createInterface({ input: child.stdout });
lines.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.id !== undefined && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function request(id, method, params) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timed out waiting for ${method}; stderr: ${stderr}`));
    }, 10_000);
    pending.set(id, (message) => {
      clearTimeout(timeout);
      resolve(message);
    });
    send({ jsonrpc: "2.0", id, method, params });
  });
}

try {
  const initialized = await request(1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "graph2agent-npm-smoke", version: "1.0.0" },
  });
  if (initialized.error || !initialized.result?.serverInfo) throw new Error(`initialize failed: ${JSON.stringify(initialized)}`);
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
  process.stdout.write("npm MCP stdio smoke: ok\n");
} finally {
  if (!child.killed) child.kill("SIGTERM");
}
