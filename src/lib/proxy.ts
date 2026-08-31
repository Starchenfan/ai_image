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
export function installProxyDispatcher(): void {
  if (installed) return;
  installed = true;

  const existingNoProxy = process.env.no_proxy ?? process.env.NO_PROXY ?? "";
  const ossHost = "tokenrhythm-prod-backup-oss.oss-cn-beijing.aliyuncs.com";
  const extra = existingNoProxy ? `,${ossHost}` : ossHost;
  process.env.no_proxy = existingNoProxy + extra;
  process.env.NO_PROXY = process.env.no_proxy;

  setGlobalDispatcher(new EnvHttpProxyAgent());
}
