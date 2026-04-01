import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const resourcesRoot = path.resolve("src/lib/i18n/resources");
const baseLocale = "en";

async function collectJsonFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectJsonFiles(absolutePath, relativePath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeValueType(value) {
  if (Array.isArray(value)) {
    return "array";
  }

  return value === null ? "null" : typeof value;
}

function compareTranslationTrees(input) {
  const {
    baseValue,
    targetValue,
    locale,
    namespacePath,
    failures,
  } = input;

  if (isPlainObject(baseValue)) {
    if (!isPlainObject(targetValue)) {
      failures.push(
        `[${locale}] ${namespacePath || "<root>"} should be an object, got ${describeValueType(targetValue)}`
      );
      return;
    }

    const baseKeys = Object.keys(baseValue).sort();
    const targetKeys = new Set(Object.keys(targetValue));

    for (const key of baseKeys) {
      const childPath = namespacePath ? `${namespacePath}.${key}` : key;
      if (!(key in targetValue)) {
        failures.push(`[${locale}] Missing key: ${childPath}`);
        continue;
      }

      compareTranslationTrees({
        baseValue: baseValue[key],
        targetValue: targetValue[key],
        locale,
        namespacePath: childPath,
        failures,
      });

      targetKeys.delete(key);
    }

    for (const extraKey of [...targetKeys].sort()) {
      const childPath = namespacePath ? `${namespacePath}.${extraKey}` : extraKey;
      failures.push(`[${locale}] Extra key: ${childPath}`);
    }

    return;
  }

  if (Array.isArray(baseValue)) {
    if (!Array.isArray(targetValue)) {
      failures.push(
        `[${locale}] ${namespacePath || "<root>"} should be an array, got ${describeValueType(targetValue)}`
      );
    }
    return;
  }

  const baseType = describeValueType(baseValue);
  const targetType = describeValueType(targetValue);

  if (baseType !== targetType) {
    failures.push(
      `[${locale}] ${namespacePath || "<root>"} should be ${baseType}, got ${targetType}`
    );
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const localeEntries = await readdir(resourcesRoot, { withFileTypes: true });
  const localeDirectories = localeEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const baseDirectory = path.join(resourcesRoot, baseLocale);

  if (!localeDirectories.includes(baseLocale)) {
    throw new Error(`Base locale directory "${baseLocale}" was not found.`);
  }

  const baseFiles = await collectJsonFiles(baseDirectory);
  const failures = [];

  for (const locale of localeDirectories) {
    if (locale === baseLocale) {
      continue;
    }

    const localeDirectory = path.join(resourcesRoot, locale);
    const localeFiles = await collectJsonFiles(localeDirectory);
    const localeFileSet = new Set(localeFiles);

    for (const baseFile of baseFiles) {
      if (!localeFileSet.has(baseFile)) {
        failures.push(`[${locale}] Missing file: ${baseFile}`);
        continue;
      }

      const [baseJson, localeJson] = await Promise.all([
        readJson(path.join(baseDirectory, baseFile)),
        readJson(path.join(localeDirectory, baseFile)),
      ]);

      compareTranslationTrees({
        baseValue: baseJson,
        targetValue: localeJson,
        locale,
        namespacePath: path.basename(baseFile, ".json"),
        failures,
      });

      localeFileSet.delete(baseFile);
    }

    for (const extraFile of [...localeFileSet].sort()) {
      failures.push(`[${locale}] Extra file: ${extraFile}`);
    }
  }

  if (failures.length > 0) {
    console.error("i18n coverage check failed:\n");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `i18n coverage check passed for ${localeDirectories.length} locales across ${baseFiles.length} namespace files.`
  );
}

await main();
