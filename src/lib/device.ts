/** Capture lightweight device metadata for activity logs (client-side). */
export function getDeviceInfo(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  const ua = navigator.userAgent ?? "";
  return `${ua.slice(0, 180)} | ${navigator.platform ?? ""} | ${navigator.language ?? ""}`.trim();
}
