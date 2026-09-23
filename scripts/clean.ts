import { rm } from "node:fs/promises";

import { DIST_DIRECTORY } from "./config.ts";

await rm(DIST_DIRECTORY, { recursive: true, force: true });
process.stdout.write("Removed generated dist/.\n");
