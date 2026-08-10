import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const smokeScript = fileURLToPath(new URL("./stdio-smoke.mjs", import.meta.url));

async function expectCorruption(t, outputBeforeInitialize, outputAfterDescribe, expectedPattern) {
  const temporary = await mkdtemp(path.join(tmpdir(), "graph2agent-stdio-corruption-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const fakeServer = path.join(temporary, "fake-server.cjs");
  await writeFile(fakeServer, `
    "use strict";
    const readline = require("node:readline");
    const lines = readline.createInterface({ input: process.stdin });
    lines.on("line", (line) => {
      const message = JSON.parse(line);
      if (message.method === "initialize") {
        process.stdout.write(${JSON.stringify(outputBeforeInitialize)});
        process.stdout.write(JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "fake", version: "test-version" } }
        }) + "\\n");
      } else if (message.method === "tools/list") {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "describe_mermaid" }] } }) + "\\n");
      } else if (message.method === "tools/call") {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: "A points to B" }] } }) + "\\n");
        process.stdout.write(${JSON.stringify(outputAfterDescribe)});
      }
    });
  `);

  await assert.rejects(
    execFileAsync(process.execPath, [smokeScript, process.execPath, fakeServer], {
      env: { ...process.env, GRAPH2AGENT_EXPECT_SERVER_VERSION: "test-version" },
      timeout: 5_000,
    }),
    (error) => {
      assert.match(error.stderr, expectedPattern);
      return true;
    },
  );
}

test("stdio smoke rejects non-JSON protocol output", async (t) => {
  await expectCorruption(t, "THIS CORRUPTS MCP STDOUT\n", "", /non-JSON data corrupted MCP stdout/);
});

test("stdio smoke rejects valid JSON that is not a JSON-RPC envelope", async (t) => {
  await expectCorruption(t, '"VALID JSON LOG ON MCP STDOUT"\n', "", /non-JSON-RPC data corrupted MCP stdout/);
});

test("stdio smoke rejects blank protocol lines", async (t) => {
  await expectCorruption(t, "\n", "", /blank line corrupted MCP stdout/);
});

test("stdio smoke rejects corruption after the final valid response", async (t) => {
  await expectCorruption(t, "", '"TRAILING JSON LOG"\n', /non-JSON-RPC data corrupted MCP stdout/);
});
