/* Gnosi landing analytics.
 * Replace the placeholder with the GA4 Measurement ID to enable collection.
 */
(function () {
  const measurementId = 'G-JJTYPXLG4S';

  if (measurementId === 'G-XXXXXXXXXX') {
    return;
  }

  window.dataLayer = window.dataLayer || [];
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
  document.head.appendChild(script);
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    anonymize_ip: true,
    allow_google_signals: false,
  });

  document.addEventListener('click', function (event) {
    const link = event.target.closest('a');
    if (!link || !link.href || !link.href.startsWith('http')) {
      return;
    }

    const url = new URL(link.href);
    const hostname = url.hostname;
    let eventName = 'outbound_click';
    if (link.dataset.downloadKind === 'desktop') {
      eventName = 'desktop_download_click';
    } else if (hostname === window.location.hostname && url.pathname.startsWith('/go/github-sponsors/')) {
      eventName = 'github_sponsor_click';
    } else if (hostname === window.location.hostname && url.pathname.startsWith('/go/kofi/')) {
      eventName = 'ko_fi_click';
    } else if (hostname === 'github.com' || hostname === 'www.github.com') {
      if (url.pathname === '/sponsors/ismigar') {
        eventName = 'github_sponsor_click';
      } else if (url.pathname.startsWith('/ismigar/Gnosi/releases')) {
        eventName = 'github_release_click';
      } else if (url.pathname === '/ismigar/Gnosi' || url.pathname.startsWith('/ismigar/Gnosi/')) {
        eventName = 'github_repo_click';
      } else {
        eventName = 'github_click';
      }
    } else if (hostname === 'ko-fi.com' && (url.pathname === '/ismigar' || url.pathname === '/ismaelgarciafernandez' || url.pathname === '/gnosi')) {
      eventName = 'ko_fi_click';
    } else if (hostname === 'ollama.com') {
      eventName = 'partner_click';
    } else if (url.pathname.includes('/download/') || /\.(zip|oxt|xml)$/i.test(url.pathname)) {
      eventName = 'download_click';
    }

    window.gtag('event', eventName, {
      link_url: link.href,
      link_text: link.textContent.trim().slice(0, 100),
      link_domain: hostname,
      download_kind: link.dataset.downloadKind || undefined,
      content_locale: link.dataset.locale || document.documentElement.lang || 'en',
    });
  });
})();
