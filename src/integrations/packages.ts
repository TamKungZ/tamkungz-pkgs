/**
 * Serves and publishes the `packages/` folder next to the generated pages.
 *
 *  - dev:   static middleware, so package files can be downloaded from `astro dev`
 *  - build: copies `packages/` into the output folder (dist/) after the pages are written.
 *           Generated index pages are never overwritten.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AstroIntegration } from "astro";

const MIME: Record<string, string> = {
  ".html": "text/html", ".xml": "application/xml", ".json": "application/json",
  ".txt": "text/plain", ".key": "text/plain", ".asc": "text/plain", ".pub": "text/plain",
};

export default function packages(folder = "packages"): AstroIntegration {
  const root = path.resolve(process.cwd(), process.env.PACKAGES_DIR ?? folder);

  return {
    name: "tamkungz-packages",
    hooks: {
      "astro:server:setup": ({ server }) => {
        server.middlewares.use((req, res, next) => {
          const pathname = decodeURIComponent((req.url ?? "/").split("?")[0]);
          const file = path.normalize(path.join(root, pathname));
          const inside = file === root || file.startsWith(root + path.sep);

          if (inside && fs.existsSync(file) && fs.statSync(file).isFile()) {
            res.setHeader("Content-Type", MIME[path.extname(file)] ?? "application/octet-stream");
            fs.createReadStream(file).pipe(res);
            return;
          }
          next();
        });
      },

      "astro:build:done": ({ dir, logger }) => {
        if (!fs.existsSync(root)) return;
        const out = fileURLToPath(dir);
        fs.cpSync(root, out, { recursive: true, force: false, errorOnExist: false });
        logger.info(`copied ${folder}/ -> ${path.relative(process.cwd(), out)}/`);
      },
    },
  };
}
