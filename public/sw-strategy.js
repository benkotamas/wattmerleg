(function exposeServiceWorkerStrategy(scope) {
  const CACHE_NAME = "wattmerleg-v2";
  const INSTALL_ASSETS = ["/manifest.webmanifest", "/icon.svg"];
  const PUBLIC_ASSETS = new Set(INSTALL_ASSETS);

  function cacheableStaticRequest(request, origin) {
    if (request.method !== "GET" || request.cache === "no-store") return false;
    const url = new URL(request.url, origin);
    if (url.origin !== origin || url.pathname.startsWith("/api/")) return false;
    return PUBLIC_ASSETS.has(url.pathname) || url.pathname.startsWith("/_next/static/");
  }

  function obsoleteWattmerlegCaches(keys) {
    return keys.filter((key) => key.startsWith("wattmerleg-") && key !== CACHE_NAME);
  }

  scope.WattmerlegSwStrategy = { CACHE_NAME, INSTALL_ASSETS, cacheableStaticRequest, obsoleteWattmerlegCaches };
})(typeof self === "undefined" ? globalThis : self);
