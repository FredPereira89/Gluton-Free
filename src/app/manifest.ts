import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Gluton-Free",
    short_name: "Gluton-Free",
    description: "Restaurant Verdicts based on what diners write.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FBFBF8",
    theme_color: "#FBFBF8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
