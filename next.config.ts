import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Prisma client and engine out of the bundler so the Postgres query
  // engine is loaded from node_modules at runtime on the Node.js server.
  serverExternalPackages: ["@prisma/client", "prisma"],
  experimental: {
    serverActions: {
      // Patch CRM-INT1. Comprobantes y documentos se suben por Server Action y
      // `src/server/storage/shared.ts` admite hasta 5 MiB (`MAX_UPLOAD_BYTES`),
      // pero Next corta el cuerpo de una Server Action en 1 MB por omisión: una
      // foto de comprobante hecha con un teléfono fallaba antes de llegar a la
      // validación. 6 MB = el límite de almacenamiento más el margen del
      // multipart. Si se cambia uno, se cambia el otro.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
