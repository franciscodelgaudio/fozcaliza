import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Os dados vêm de arquivos versionados no repositório: só mudam com um novo
  // deploy, que já descarta o cache. Por isso o perfil padrão do "use cache" é longo.
  cacheLife: {
    default: { stale: 60 * 5, revalidate: 60 * 60 * 24 * 30, expire: 60 * 60 * 24 * 365 },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
