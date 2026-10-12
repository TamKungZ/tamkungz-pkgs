import { defineConfig } from "astro/config";
import packages from "./src/integrations/packages";
import { SITE } from "./src/config/site";

// Static site: `npm run build` writes everything GitHub Pages needs into ./dist
// (deployed by .github/workflows/deploy.yml - nothing generated is committed).
export default defineConfig({
  site: SITE.url,
  output: "static",
  outDir: "dist",
  trailingSlash: "always",
  build: {
    format: "directory",
    inlineStylesheets: "always",
  },
  integrations: [packages()],
  devToolbar: { enabled: false },
});
