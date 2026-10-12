/**
 * GitHub source URL for each package ID shown in the installer lists.
 * Keys are case-insensitive package IDs (e.g. `tarminal`, `tamkungz.imagemerge`).
 * Add or update an entry here when a package uses a different source repository.
 */
export const APP_SOURCES: Readonly<Record<string, string>> = {
  glosslate: "https://github.com/TamKungZ/Glosslate",
  livedesk: "https://github.com/TamKungZ/livedesk-live-wallpaper-for-gnome",
  "tar-install": "https://github.com/TamKungZ/tarminal-tar-install",
  tarminal: "https://github.com/TamKungZ/tarminal-tar-install",
  "tamkungz.imagemerge": "https://github.com/TamKungZ/ImageMergePy",
};
