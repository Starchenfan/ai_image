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
 */
export function installProxyDispatcher(): void {
  if (installed) return;
  installed = true;
  setGlobalDispatcher(new EnvHttpProxyAgent());
}
