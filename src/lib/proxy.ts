import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

let installed = false;

/**
 * Route Node's global fetch through a proxy when HTTP_PROXY / HTTPS_PROXY
 * (and NO_PROXY) are set — mirroring curl-style behavior.
 *
 * Node's built-in fetch (undici) does NOT honor these env vars by default,
 * so without this a relay that is only reachable through a local proxy
 * (e.g. Clash/V2Ray on 127.0.0.1:7890) times out on a direct connect.
 *
 * EnvHttpProxyAgent is a no-op fallback to a direct connection when no
 * proxy env is set, so the existing direct-connect path is unchanged.
 *
 * 生成的图片托管在阿里云 OSS（*.aliyuncs.com），与 API 中转站不同源；
 * 中继代理（如 7890）通常不可达 OSS，把 OSS host 逐出 NO_PROXY 让图片
 * 下载走直连，避免 fetch 因代理不可用而失败。
 */
/**
 * 直连 hosts —— 必须走直连、不经代理的域名。
 *
 * 为什么硬编码：NO_PROXY 环境变量在 Next.js 进程里不可靠——实测
 * .env.local 写了 NO_PROXY=...,tokenrhythm.studio,...，但进程实际读到的
 * NO_PROXY 只有 127.0.0.1,localhost,::1（系统默认值），导致 tokenrhythm.studio
 * 被代理到未运行的 127.0.0.1:7890，fetch 直接 ECONNREFUSED。
 * 因此在这里显式追加，不依赖环境变量。
 */
const DIRECT_HOSTS = [
  "localhost",
  "127.0.0.1",
  "::1",
  // AI 中转站 —— 必须直连，代理通常不可达
  "tokenrhythm.studio",
  "api.stepfun.com",
  "stepfun.com",
  "token.sensenova.cn",
  "sensenova.cn",
  "api.aixoras.com",
  "aixoras.com",
  // OSS 图片托管 —— 与 API 中转站不同源，中继代理不可达
  "tokenrhythm-prod-backup-oss.oss-cn-beijing.aliyuncs.com",
];

export function installProxyDispatcher(): void {
  if (installed) return;
  installed = true;

  const existingNoProxy = process.env.no_proxy ?? process.env.NO_PROXY ?? "";
  const merged = Array.from(new Set([
    ...existingNoProxy.split(/[,\s]/).filter(Boolean),
    ...DIRECT_HOSTS,
  ])).join(",");
  process.env.no_proxy = merged;
  process.env.NO_PROXY = merged;

  setGlobalDispatcher(new EnvHttpProxyAgent());
}
