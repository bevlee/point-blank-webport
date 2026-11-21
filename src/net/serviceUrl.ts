/// <reference types="vite/client" />
// [RECRIADO] A hosted frontend and its /api, /tcp and /signal routes share an origin by default.
// Local Vite development keeps the separate backend port. Explicit VITE_* origins still take precedence.
export function backendOrigin(
  pageUrl = typeof location === "undefined" ? "http://127.0.0.1/" : location.href,
  development = import.meta.env?.DEV !== false,
): string {
  const page = new URL(pageUrl);
  if (development) page.port = "8090";
  return page.origin;
}
