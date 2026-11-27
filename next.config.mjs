/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: false,
  async headers() {
    return [{ source: "/api/:path*", headers: [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "X-Content-Type-Options", value: "nosniff" },
    ] }];
  },
};
export default nextConfig;
