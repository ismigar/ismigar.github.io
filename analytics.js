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
    if (hostname === 'github.com' || hostname === 'www.github.com') {
      eventName = 'github_click';
    } else if (hostname === 'ko-fi.com' || hostname === 'ollama.com') {
      eventName = 'partner_click';
    } else if (url.pathname.includes('/download/') || /\.(zip|oxt|xml)$/i.test(url.pathname)) {
      eventName = 'download_click';
    }

    window.gtag('event', eventName, {
      link_url: link.href,
      link_text: link.textContent.trim().slice(0, 100),
      link_domain: hostname,
    });
  });
})();
