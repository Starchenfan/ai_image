/** Mask an API key for safe display. Real keys never reach the client. */
export function maskKey(k: string): string {
  if (k.length <= 6) return "••••";
  return `${k.slice(0, 3)}-••••••••••••${k.slice(-4)}`;
}
