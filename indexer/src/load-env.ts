import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvironmentFile(fileName: ".env" | ".env.local") {
  const filePath = resolve(projectRoot, fileName);

  if (!existsSync(filePath)) {
    return;
  }

  const fileEnvironment = parseEnv(readFileSync(filePath, "utf8"));

  for (const [key, value] of Object.entries(fileEnvironment)) {
    const currentValue = process.env[key];

    if (currentValue === undefined || currentValue.trim() === "") {
      process.env[key] = value;
    }
  }
}

export function loadProjectEnvironment() {
  loadEnvironmentFile(".env.local");
  loadEnvironmentFile(".env");
}