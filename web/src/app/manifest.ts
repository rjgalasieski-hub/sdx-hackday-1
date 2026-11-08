import type { MetadataRoute } from "next";

// Makes "Add to Home Screen" open Wake full screen with the brand icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wake",
    short_name: "Wake",
    description: "Your AI wake-up coach. It gets you up, plans your day with you, and locks it to your calendar.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
