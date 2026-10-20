import type { APIRoute } from "astro";
import { LEGAL_PAGES } from "../config/legal";
import { BUILT_DATE } from "../lib/build-info";
import { canonicalUrl, pathTextOf, sitemapPriority, sitemapSortKey } from "../lib/listing";
import { listDirectories } from "../lib/tree";

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

export const GET: APIRoute = () => {
  const pages = [...listDirectories(), ...LEGAL_PAGES.map((p) => [p.slug])];

  pages.sort((a, b) => {
    const ka = sitemapSortKey(a);
    const kb = sitemapSortKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || (ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0);
  });

  const urls = pages.map(
    (segments) => `  <url>
    <loc>${escapeXml(canonicalUrl(pathTextOf(segments)))}</loc>
    <lastmod>${BUILT_DATE}</lastmod>
    <priority>${sitemapPriority(segments).toFixed(2)}</priority>
  </url>`,
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
