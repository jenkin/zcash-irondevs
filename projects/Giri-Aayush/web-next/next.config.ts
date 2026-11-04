import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // static export so the judge can serve the built site as plain files
  output: "export",
  basePath: "/zcash-irondevs",
  assetPrefix: "/zcash-irondevs/",
  images: { unoptimized: true },
  // the D3 simulation owns the DOM; StrictMode's double-invoke would spawn two sims
  reactStrictMode: false,
  // graph.json + avatars are read from /public at runtime
};

export default nextConfig;
