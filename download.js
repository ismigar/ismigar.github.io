(() => {
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

  // Fetch release assets from GitHub
  const releasePromise = fetch("https://api.github.com/repos/ismigar/Gnosi/releases/latest", {
    headers: { Accept: "application/vnd.github+json" },
  })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);

  const getAssetUrlForPlatform = (release, plat) => {
    if (!release || !release.assets) return null;
    const pattern = assetPatterns[plat || detectedPlatform];
    const asset = release.assets.find((candidate) => pattern?.test(candidate.name));
    return asset ? asset.browser_download_url : null;
  };

  // Override href on landing page download buttons so native link navigation NEVER occurs
  if (!window.location.pathname.includes("/download/")) {
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
  }

  // GLOBAL CAPTURE-PHASE EVENT DELEGATION: Intercept ANY download button click on the landing page
  document.addEventListener(
    "click",
    (evt) => {
      const btn = evt.target.closest('[data-download-kind="desktop"], [data-fallback-href*="download"]');
      if (!btn) return;
      if (window.location.pathname.includes("/download/")) return;
      if (evt.ctrlKey || evt.metaKey || evt.shiftKey || evt.button !== 0) return;

      evt.preventDefault();
      evt.stopPropagation();

      const originalText = btn.textContent;
      btn.textContent = copy.downloading;

      releasePromise.then((release) => {
        const url = getAssetUrlForPlatform(release, detectedPlatform);
        if (url) {
          triggerDirectDownload(url);
          btn.textContent = copy.started;
          setTimeout(() => {
            btn.textContent = originalText;
          }, 4000);
        } else {
          const fallback = btn.getAttribute("data-fallback-href");
          if (fallback) window.location.href = fallback;
        }
      });
    },
    true
  );

  // STANDALONE DOWNLOAD PAGE LOGIC
  const releaseStatus = document.querySelector("#release-status");
  const downloadLinks = [...document.querySelectorAll("[data-release-asset]")];
  const grid = document.querySelector(".platform-grid");

  if (releaseStatus && downloadLinks.length && grid) {
    releaseStatus.textContent = copy.loading;

    const bytes = (value) => {
      const megabytes = value / 1024 / 1024;
      return `${megabytes.toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
    };

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

    releasePromise.then((release) => {
      if (!release) {
        releaseStatus.textContent = copy.fallback;
        return;
      }
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

      if (autoDownloadUrl) {
        releaseStatus.textContent = copy.downloading;
        setTimeout(() => triggerDirectDownload(autoDownloadUrl), 400);
      }
    });
  }
})();textContent = copy.fallback;
    });
})();
