/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
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
