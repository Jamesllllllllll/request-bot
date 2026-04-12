import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const sourceDir = path.join(repoRoot, "dist", "twitch-extension", "panel");
const outputDir = path.join(repoRoot, "output", "twitch-extension");

if (!existsSync(sourceDir)) {
  console.error(
    "Panel build output was not found. Run npm run build:extension:panel first."
  );
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

const outputFilename = `request-bot-panel-${formatTimestamp(new Date())}.zip`;
const outputPath = path.join(outputDir, outputFilename);

const pythonCandidate = getPythonCandidate();

if (pythonCandidate) {
  const result = spawnSync(
    pythonCandidate.command,
    [
      ...pythonCandidate.args,
      "-c",
      [
        "import os, sys, zipfile",
        "source = os.path.abspath(sys.argv[1])",
        "target = os.path.abspath(sys.argv[2])",
        'with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:',
        "    for root, dirs, files in os.walk(source):",
        "        dirs.sort()",
        "        files.sort()",
        "        for name in files:",
        "            absolute_path = os.path.join(root, name)",
        "            relative_path = os.path.relpath(absolute_path, source)",
        "            archive.write(absolute_path, relative_path)",
      ].join("\n"),
      sourceDir,
      outputPath,
    ],
    { stdio: "inherit" }
  );

  if (result.status === 0) {
    console.log(`Created ${path.relative(repoRoot, outputPath)}`);
    process.exit(0);
  }
}

if (process.platform === "win32") {
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      [
        "$ErrorActionPreference = 'Stop'",
        `$source = ${toPowerShellString(sourceDir)}`,
        `$target = ${toPowerShellString(outputPath)}`,
        "Compress-Archive -Path (Join-Path $source '*') -DestinationPath $target -Force",
      ].join("; "),
    ],
    { stdio: "inherit" }
  );

  if (result.status === 0) {
    console.log(`Created ${path.relative(repoRoot, outputPath)}`);
    process.exit(0);
  }
}

const zipResult = spawnSync("zip", ["-r", outputPath, "."], {
  cwd: sourceDir,
  stdio: "inherit",
});

if (zipResult.status === 0) {
  console.log(`Created ${path.relative(repoRoot, outputPath)}`);
  process.exit(0);
}

console.error(
  "Failed to create the Twitch panel zip. Install Python or zip, or run on Windows with PowerShell available."
);
process.exit(1);

function formatTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function getPythonCandidate() {
  const candidates = [
    { command: "python3", args: [] },
    { command: "python", args: [] },
    { command: "py", args: ["-3"] },
  ];

  for (const candidate of candidates) {
    const result = spawnSync(
      candidate.command,
      [...candidate.args, "--version"],
      { stdio: "ignore" }
    );

    if (result.status === 0) {
      return candidate;
    }
  }

  return null;
}

function toPowerShellString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
