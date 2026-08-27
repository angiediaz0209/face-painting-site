// Google Analytics 4 — visits plus the booking funnel.
//
// Loads only when VITE_GA_MEASUREMENT_ID is set (Vercel env var, or .env.local
// for dev), so local dev and preview builds don't pollute the real numbers.
// Everything is fire-and-forget: analytics must never break the site.
//
// Funnel events (all sent from the browser):
//   chat_started        first message sent to Sky
//   quote_shown         Sky presented a price card   (city, hours, second_artist, value)
//   details_form_shown  Sky asked for contact details
//   booking_submitted   details form posted OK       (city, hours, value)
// In GA4, mark quote_shown and booking_submitted as key events (Admin → Events)
// to see conversion rates on the Reports → Engagement → Conversions page.

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

export function initAnalytics() {
  if (!GA_ID || typeof window === 'undefined' || window.gtag) return;
  try {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { anonymize_ip: true });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    document.head.appendChild(script);
  } catch {
    // Ad blockers and privacy browsers can throw here; that's fine.
  }
}

/** Record a custom event. Safe to call even when analytics is off. */
export function track(name, params = {}) {
  try {
    if (typeof window !== 'undefined' && window.gtag) window.gtag('event', name, params);
  } catch {
    // never let analytics surface as an error
  }
}
