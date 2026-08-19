(() => {
  const releaseStatus = document.querySelector("#release-status");
  const downloadLinks = [...document.querySelectorAll("[data-release-asset]")];
  const grid = document.querySelector(".platform-grid");
  if (!releaseStatus || !downloadLinks.length || !grid) return;

  const assetPatterns = {
    "mac-arm": /arm64\.dmg$/i,
    "mac-intel": /(?:x64|x86_64)\.dmg$/i,
    windows: /(?:setup|installer).*\.exe$/i,
    linux: /\.AppImage$/i,
  };

  const locale = document.documentElement.lang || "en";
  const translations = {
    en: {
      loading: "Finding the installer for your system…",
      starting: "Starting download…",
      ready: (version) => `Latest release: ${version}`,
      fallback: "Installer lookup failed. The buttons open the latest GitHub release instead.",
      download: "Download installer",
      detectedTag: "✓ Detected for your system",
      showAll: "Looking for another operating system? ↓",
      hideAll: "Hide other operating systems ↑",
    },
    ca: {
      loading: "Cercant l'instal·lador per al teu sistema…",
      starting: "Iniciant la descàrrega…",
      ready: (version) => `Darrera versió: ${version}`,
      fallback: "No s’han pogut localitzar els instal·ladors. Els botons obren la darrera release de GitHub.",
      download: "Descarrega l'instal·lador",
      detectedTag: "✓ Detectat per al teu sistema",
      showAll: "Busques un altre sistema operatiu? ↓",
      hideAll: "Amaga els altres sistemes operatius ↑",
    },
    es: {
      loading: "Buscando el instalador para tu sistema…",
      starting: "Iniciando la descarga…",
      ready: (version) => `Última versión: ${version}`,
      fallback: "No se han podido localizar los instaladores. Los botones abren la última release de GitHub.",
      download: "Descargar instalador",
      detectedTag: "✓ Detectado para tu sistema",
      showAll: "¿Buscas otro sistema operativo? ↓",
      hideAll: "Ocultar otros sistemas operativos ↑",
    },
  };
  const copy = translations[locale] || translations.en;
  releaseStatus.textContent = copy.loading;

  const bytes = (value) => {
    const megabytes = value / 1024 / 1024;
    return `${megabytes.toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
  };

  const detectedPlatform = (() => {
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
  })();

  if (detectedPlatform) {
    const recommended = document.querySelector(`[data-platform-card="${detectedPlatform}"]`);
    if (recommended) {
      grid.classList.add("has-detected");
      recommended.classList.add("is-recommended", "is-detected-primary");
      const tag = recommended.querySelector(".recommended-tag");
      if (tag) tag.textContent = copy.detectedTag;

      const toggleWrapper = document.createElement("div");
      toggleWrapper.className = "toggle-platforms-wrapper";
      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "btn-toggle-platforms";
      toggleBtn.textContent = copy.showAll;

      let isExpanded = false;
      toggleBtn.addEventListener("click", () => {
        isExpanded = !isExpanded;
        grid.classList.toggle("is-expanded", isExpanded);
        toggleBtn.textContent = isExpanded ? copy.hideAll : copy.showAll;
      });

      toggleWrapper.appendChild(toggleBtn);
      grid.parentNode.insertBefore(toggleWrapper, grid.nextSibling);
    }
  }

  fetch("https://api.github.com/repos/ismigar/Gnosi/releases/latest", {
    headers: { Accept: "application/vnd.github+json" },
  })
    .then((response) => {
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
      return response.json();
    })
    .then((release) => {
      let autoDownloadUrl = null;
      downloadLinks.forEach((link) => {
        const platform = link.dataset.releaseAsset;
        const pattern = assetPatterns[platform];
        const asset = (release.assets || []).find((candidate) => pattern?.test(candidate.name));
        if (!asset) return;
        link.href = asset.browser_download_url;
        link.textContent = `${copy.download} · ${bytes(asset.size)}`;
        if (platform === detectedPlatform) {
          autoDownloadUrl = asset.browser_download_url;
        }
      });
      releaseStatus.textContent = copy.ready(release.tag_name || release.name || "latest");

      // Auto-trigger direct file download
      if (autoDownloadUrl) {
        releaseStatus.textContent = copy.starting;
        setTimeout(() => {
          window.location.href = autoDownloadUrl;
        }, 600);
      }
    })
    .catch(() => {
      releaseStatus.textContent = copy.fallback;
    });
})();
