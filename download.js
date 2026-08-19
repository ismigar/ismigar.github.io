(() => {
  // Static fallbacks if GitHub API rate-limits (HTTP 403) or network fails
  const FALLBACK_ASSETS = {
    "mac-arm": "https://github.com/ismigar/Gnosi/releases/download/v1.0.3/Gnosi-1.0.3-arm64.dmg",
    "mac-intel": "https://github.com/ismigar/Gnosi/releases/download/v1.0.3/Gnosi-1.0.3-x64.dmg",
    windows: "https://github.com/ismigar/Gnosi/releases/download/v1.0.3/Gnosi-1.0.3-Setup.exe",
    linux: "https://github.com/ismigar/Gnosi/releases/download/v1.0.3/Gnosi-1.0.3-x86_64.AppImage",
  };

  const assetPatterns = {
    "mac-arm": /arm64\.dmg$/i,
    "mac-intel": /(?:x64|x86_64)\.dmg$/i,
    windows: /(?:setup|installer).*\.exe$/i,
    linux: /\.AppImage$/i,
  };

  const locale = document.documentElement.lang || "en";
  const translations = {
    en: {
      started: "✓ Download started!",
      downloading: "Starting download…",
      loading: "Finding installer…",
      ready: (version) => `Latest release: ${version}`,
      fallback: "Installer lookup failed.",
      download: "Download installer",
      detectedTag: "✓ Detected for your system",
      showAll: "Looking for another operating system? ↓",
      hideAll: "Hide other operating systems ↑",
    },
    ca: {
      started: "✓ Descàrrega iniciada!",
      downloading: "Iniciant la descàrrega…",
      loading: "Cercant l'instal·lador…",
      ready: (version) => `Darrera versió: ${version}`,
      fallback: "No s’han pogut localitzar els instal·ladors.",
      download: "Descarrega l'instal·lador",
      detectedTag: "✓ Detectat per al teu sistema",
      showAll: "Busques un altre sistema operatiu? ↓",
      hideAll: "Amaga els altres sistemes operatius ↑",
    },
    es: {
      started: "✓ ¡Descarga iniciada!",
      downloading: "Iniciando la descarga…",
      ready: (version) => `Última versión: ${version}`,
      fallback: "No se han podido localizar los instaladores.",
      download: "Descargar instalador",
      detectedTag: "✓ Detectado para tu sistema",
      showAll: "¿Buscas otro sistema operativo? ↓",
      hideAll: "Ocultar otros sistemas operativos ↑",
    },
  };
  const copy = translations[locale] || translations.en;

  const detectPlatform = () => {
    const ua = navigator.userAgent.toLowerCase();
    const platform = `${navigator.userAgentData?.platform || navigator.platform || ""}`.toLowerCase();
    const arch = `${navigator.userAgentData?.architecture || ""}`.toLowerCase();

    if (platform.includes("win") || ua.includes("windows")) return "windows";
    if (platform.includes("linux") || ua.includes("linux")) return "linux";
    if (platform.includes("mac") || ua.includes("macintosh")) {
      if (arch.includes("arm") || arch.includes("aarch64")) return "mac-arm";
      try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (gl) {
          const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
          if (debugInfo) {
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase();
            if (renderer.includes("apple") || renderer.includes("m1") || renderer.includes("m2") || renderer.includes("m3") || renderer.includes("m4")) {
              return "mac-arm";
            }
          }
        }
      } catch (e) {}
      return "mac-arm";
    }
    return "";
  };

  const detectedPlatform = detectPlatform();

  const triggerDirectDownload = (url) => {
    try {
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = url;
      document.body.appendChild(iframe);
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch (e) {}
      }, 60000);
    } catch (e) {
      window.location.href = url;
    }
  };

  // If user lands directly on /download/ page, redirect back to homepage & auto-trigger download
  if (window.location.pathname.includes("/download/")) {
    const isCa = window.location.pathname.includes(".ca.");
    const isEs = window.location.pathname.includes(".es.");
    const targetHome = isCa ? "../index.ca.html?download=1" : isEs ? "../index.es.html?download=1" : "../index.html?download=1";
    window.location.replace(targetHome);
    return;
  }

  // Fetch release assets from GitHub with quick timeout
  const releasePromise = Promise.race([
    fetch("https://api.github.com/repos/ismigar/Gnosi/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
    }).then((res) => (res.ok ? res.json() : null)),
    new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
  ]).catch(() => null);

  const getAssetUrlForPlatform = (release, plat) => {
    const targetPlat = plat || detectedPlatform || "mac-arm";
    const minVersion = "v1.0.6";
    if (release && release.tag_name && release.tag_name >= minVersion && release.assets) {
      const pattern = assetPatterns[targetPlat];
      const asset = release.assets.find((candidate) => pattern?.test(candidate.name));
      if (asset) return asset.browser_download_url;
    }
    return FALLBACK_ASSETS[targetPlat] || FALLBACK_ASSETS["mac-arm"];
  };

  // Override href on landing page download buttons so native link navigation NEVER occurs
  const overrideButtons = () => {
    document.querySelectorAll('[data-download-kind="desktop"], a[href*="download/"]').forEach((btn) => {
      btn.setAttribute("data-fallback-href", btn.getAttribute("href") || "");
      btn.setAttribute("href", "javascript:void(0);");
    });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", overrideButtons);
  } else {
    overrideButtons();
  }

  // Auto-download trigger if redirected via ?download=1
  if (window.location.search.includes("download=1")) {
    releasePromise.then((release) => {
      const url = getAssetUrlForPlatform(release, detectedPlatform);
      triggerDirectDownload(url);
    });
  }

  // GLOBAL CAPTURE-PHASE EVENT DELEGATION: Intercept ANY download button click on the landing page
  document.addEventListener(
    "click",
    (evt) => {
      const btn = evt.target.closest('[data-download-kind="desktop"], [data-fallback-href*="download"]');
      if (!btn) return;
      if (evt.ctrlKey || evt.metaKey || evt.shiftKey || evt.button !== 0) return;

      evt.preventDefault();
      evt.stopPropagation();

      const originalText = btn.textContent;
      btn.textContent = copy.downloading;

      releasePromise.then((release) => {
        const url = getAssetUrlForPlatform(release, detectedPlatform);
        triggerDirectDownload(url);
        btn.textContent = copy.started;
        setTimeout(() => {
          btn.textContent = originalText;
        }, 4000);
      });
    },
    true
  );
})();
