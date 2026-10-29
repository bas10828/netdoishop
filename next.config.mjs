/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // next/image is not used anywhere; disable the /_next/image optimizer so its
  // endpoint (source of several RCE/DoS advisories) is not exposed at all.
  images: { unoptimized: true },
  // Prerendering ~900 /product pages spawns one worker per CPU, each with its
  // own Prisma pool; that exhausts Postgres max_connections ("too many
  // clients already"). Cap the build workers to keep total connections sane.
  experimental: { cpus: 2 },
  // output:"standalone" scans public/ once at boot, so files written into
  // public/uploads/sales/* after boot 404 until the container restarts.
  // Route these through a dynamic handler that reads from disk per-request
  // instead — keeps existing DB-stored "/uploads/sales/..." URLs working
  // with no data migration.
  async rewrites() {
    return [
      { source: "/uploads/sales/:path*", destination: "/api/uploads/sales/:path*" },
    ];
  },
};

export default nextConfig;
