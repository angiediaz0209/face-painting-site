// The pricing math itself lives in shared/pricing.js, outside both api/ and
// src/, because the browser imports it too — the booking form runs the exact
// same function the server does so the two can never quote different numbers.
//
// It can't live under api/ for that: vite.config.js proxies every /api request
// to the API dev server, so the browser would get a 404 instead of the module.
//
// This file stays as a re-export so server-side imports of ./_lib/pricing.js
// (api/chat.js, api/booking.js) keep working unchanged.
export * from "../../shared/pricing.js";
