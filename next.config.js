/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Defaults to .next. Override to run a second server (probe / prod smoke)
  // without clobbering the build output a running dev server is serving from.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  webpack: (config) => {
    // 允许 import .md 文件为字符串（用于 /api/polish 注入风格库）
    config.module.rules.push({
      test: /\.md$/,
      type: "asset/source",
    });
    return config;
  },
};
module.exports = nextConfig;
