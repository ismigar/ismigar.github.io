(() => {
  const releaseStatus = document.querySelector("#release-status");
  const downloadLinks = [...document.querySelectorAll("[data-release-asset]")];
  if (!releaseStatus || !downloadLinks.length) return;

  const assetPatterns = {
    "mac-arm": /arm64\.dmg$/i,
    "mac-intel": /(?:x64|x86_64)\.dmg$/i,
    windows: /(?:setup|installer).*\.exe$/i,
    linux: /\.AppImage$/i,
  };

  const locale = document.documentElement.lang || "en";
  const translations = {
    en: {
      loading: "Finding the latest installers…",
      ready: (version) => `Latest release: ${version}`,
      fallback: "Installer lookup failed. The buttons open the latest GitHub release instead.",
      download: "Download",
      recommended: "Recommended",
    },
    ca: {
      loading: "Cercant els instal·ladors més recents…",
      ready: (version) => `Darrera versió: ${version}`,
      fallback: "No s’han pogut localitzar els instal·ladors. Els botons obren la darrera release de GitHub.",
      download: "Descarrega",
      recommended: "Recomanat",
    },
    es: {
      loading: "Buscando los instaladores más recientes…",
      ready: (version) => `Última versión: ${version}`,
      fallback: "No se han podido localizar los instaladores. Los botones abren la última release de GitHub.",
      download: "Descarga",
      recommended: "Recomendado",
    },
  };
  const copy = translations[locale] || translations.en;
  releaseStatus.textContent = copy.loading;

  const bytes = (value) => {
    const megabytes = value / 1024 / 1024;
    return `${megabytes.toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
  };

  const detectedPlatform = (() => {
    const platform = `${navigator.userAgentData?.platform || navigator.platform || ""} ${navigator.userAgent}`.toLowerCase();
    if (platform.includes("mac")) {
      if (platform.includes("arm") || platform.includes("aarch64")) return "mac-arm";
      return "";
    }
    if (platform.includes("win")) return "windows";
    if (platform.includes("linux")) return "linux";
    return "";
  })();

  if (detectedPlatform) {
    const recommended = document.querySelector(`[data-platform-card="${detectedPlatform}"]`);
    if (recommended) {
      recommended.classList.add("is-recommended");
      const tag = recommended.querySelector(".recommended-tag");
      if (tag) tag.textContent = copy.recommended;
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
      downloadLinks.forEach((link) => {
        const platform = link.dataset.releaseAsset;
        const pattern = assetPatterns[platform];
        const asset = (release.assets || []).find((candidate) => pattern?.test(candidate.name));
        if (!asset) return;
        link.href = asset.browser_download_url;
        link.textContent = `${copy.download} · ${bytes(asset.size)}`;
      });
      releaseStatus.textContent = copy.ready(release.tag_name || release.name || "latest");
    })
    .catch(() => {
      releaseStatus.textContent = copy.fallback;
    });
})();
