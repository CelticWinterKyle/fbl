import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/gameday", "/my-team", "/scores", "/rankings", "/feed", "/odds", "/connect", "/recap"],
    },
    sitemap: "https://leagueblitz.app/sitemap.xml",
  };
}
