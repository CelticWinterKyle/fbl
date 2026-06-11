// Sitemap for the public, indexable surface. Authed app pages are
// deliberately excluded (they 404/redirect for crawlers anyway).

import type { MetadataRoute } from "next";

const BASE = "https://leagueblitz.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/demo`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/draft`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/draft/snake-strategy`, lastModified: now, changeFrequency: "yearly", priority: 0.8 },
    { url: `${BASE}/draft/auction-guide`, lastModified: now, changeFrequency: "yearly", priority: 0.8 },
    { url: `${BASE}/draft/cheat-sheet`, lastModified: now, changeFrequency: "yearly", priority: 0.8 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/support`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
