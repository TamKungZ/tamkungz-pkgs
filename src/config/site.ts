/** Static identity + layout settings. No filesystem logic here. */

export const SITE = {
  name: "TamKungZ_ Packages",
  mavenName: "TamKungZ_ Stable Maven Repository",
  url: "https://packages.tamkungz.me",
  faviconSvg: "/favicon.svg",
  faviconIco: "/favicon.ico",
  themeColor: "#03983d",
  analytics: {
    src: "https://analytics.ahrefs.com/analytics.js",
    key: "vTi0PrM7Qf4AAjrUB/x8WA",
  },
} as const;

export const AUTHOR = {
  name: "TamKungZ_",
  twitterHandle: "TamKungZ_", // without "@"
  email: "dev@tamkungz.me",
  githubUrl: "https://github.com/TamKungZ",
} as const;

/**
 * Top-level folders of `packages/` that get listing pages (and appear on the home page).
 * The order here is also the sitemap order.
 *
 *   apt/              Debian/Ubuntu repository
 *   arch/<arch>/      Arch pacman repository
 *   maven/            Maven repository
 *   rpm/<basearch>/   RPM repository
 *   apk/<arch>/       Alpine APK repository
 *   xbps/<arch>/      Void XBPS repository
 *   winget/           winget manifests
 */
export const PROJECT_ROOTS = ["apt", "arch", "maven", "rpm", "apk", "xbps", "winget"] as const;

/** Names never shown in listings (hidden dotfiles are skipped separately, except .well-known). */
export const IGNORED_NAMES: ReadonlySet<string> = new Set([
  "index.html",
  "README.md",
  "robots.txt",
  "sitemap.xml",
  "node_modules",
]);

/** The only file types listed inside /maven. */
export const MAVEN_FILE_SUFFIXES: ReadonlySet<string> = new Set([
  ".jar",
  ".pom",
  ".module",
  ".xml",
  ".sha1",
  ".sha256",
  ".sha512",
  ".md5",
  ".asc",
]);
