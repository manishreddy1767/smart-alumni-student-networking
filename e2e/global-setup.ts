import fs from "node:fs/promises";
import { browserTestDatabase } from "../playwright.config";

export default async function globalSetup() {
  for (const suffix of ["", "-wal", "-shm"]) {
    await fs.rm(`${browserTestDatabase}${suffix}`, { force: true });
  }
}
