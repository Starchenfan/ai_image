/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
