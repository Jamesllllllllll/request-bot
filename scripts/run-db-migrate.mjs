import { spawn } from "node:child_process";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const wranglerEntry = resolve(
  process.cwd(),
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js"
);
const child = spawn(
  process.execPath,
  [wranglerEntry, "d1", "migrations", "apply", "request_bot", ...args],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  }
);

// biome-ignore lint/complexity/useRegexLiterals: the constructor avoids the control-character lint on the ANSI pattern.
const ansiPattern = new RegExp(String.raw`\u001B\[[0-9;?]*[ -/]*[@-~]`, "g");
const migrationNames = [];
const reportedStatuses = new Map();
let stdoutBuffer = "";
let stderrBuffer = "";
let appliedCount = 0;
let totalMigrations = 0;
let printedSummary = false;

function stripAnsi(value) {
  return value.replace(ansiPattern, "");
}

function printLine(line) {
  process.stdout.write(`${line}\n`);
}

function maybePrintSummary() {
  if (printedSummary || totalMigrations < 1) {
    return;
  }

  printedSummary = true;
  printLine(`Applying ${totalMigrations} local migrations...`);
}

function handleStdoutLine(rawLine) {
  const line = stripAnsi(rawLine).trimEnd();
  const trimmed = line.trim();

  if (!trimmed) {
    return;
  }

  if (trimmed.includes("No migrations to apply")) {
    printLine("No migrations to apply.");
    return;
  }

  const aboutToApplyMatch = trimmed.match(/About to apply (\d+) migration/);
  if (aboutToApplyMatch) {
    totalMigrations = Number(aboutToApplyMatch[1]);
    maybePrintSummary();
    return;
  }

  const listMatch = trimmed.match(/^│\s+([0-9]{4}_[^│]+?\.sql)\s+│$/u);
  if (listMatch) {
    const name = listMatch[1];
    if (name && !migrationNames.includes(name)) {
      migrationNames.push(name);
      totalMigrations = Math.max(totalMigrations, migrationNames.length);
    }
    return;
  }

  const statusMatch = trimmed.match(
    /^│\s+([0-9]{4}_[^│]+?\.sql)\s+│\s+(.+?)\s+│$/u
  );
  if (statusMatch) {
    const [, name, status] = statusMatch;
    const normalizedStatus = status.trim();
    const previousStatus = reportedStatuses.get(name);

    if (normalizedStatus === "✅" && previousStatus !== "✅") {
      reportedStatuses.set(name, "✅");
      appliedCount += 1;
      maybePrintSummary();
      const index =
        migrationNames.indexOf(name) >= 0
          ? migrationNames.indexOf(name) + 1
          : appliedCount;
      const total = totalMigrations || migrationNames.length || index;
      printLine(`[${index}/${total}] ${name}`);
      return;
    }

    if (normalizedStatus === "❌" && previousStatus !== "❌") {
      reportedStatuses.set(name, "❌");
      maybePrintSummary();
      const index =
        migrationNames.indexOf(name) >= 0
          ? migrationNames.indexOf(name) + 1
          : appliedCount + 1;
      const total = totalMigrations || migrationNames.length || index;
      printLine(`[${index}/${total}] ${name} failed`);
      return;
    }

    return;
  }

  if (
    trimmed.startsWith("Migration ") ||
    trimmed.startsWith("bad port") ||
    trimmed.startsWith("Logs were written to ")
  ) {
    printLine(trimmed);
    return;
  }

  if (trimmed.includes("database is locked")) {
    printLine(trimmed);
    printLine(
      "Local D1 database is locked. Stop any stale local request-bot dev/worker process and rerun the command."
    );
    return;
  }

  printLine(trimmed);
}

function flushBuffer(buffer, handler) {
  const normalized = buffer.replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const remainder = lines.pop() ?? "";

  for (const line of lines) {
    handler(line);
  }

  return remainder;
}

child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString();
  stdoutBuffer = flushBuffer(stdoutBuffer, handleStdoutLine);
});

child.stderr.on("data", (chunk) => {
  stderrBuffer += chunk.toString();
  stderrBuffer = flushBuffer(stderrBuffer, handleStdoutLine);
});

child.on("close", (code) => {
  if (stdoutBuffer) {
    handleStdoutLine(stdoutBuffer);
  }
  if (stderrBuffer) {
    handleStdoutLine(stderrBuffer);
  }

  process.exit(code ?? 1);
});
