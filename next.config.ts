import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Prisma client and engine out of the bundler so the Postgres query
  // engine is loaded from node_modules at runtime on the Node.js server.
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
