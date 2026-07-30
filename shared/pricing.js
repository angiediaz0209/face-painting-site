// Deterministic pricing for Sky. All quote math happens here, in code, so the
// AI never adds up a total itself and can't get it wrong. chat.js exposes this
// as the `calculate_quote` tool.

// Towns that count as Marin County (free travel). Lowercase, no punctuation.
const MARIN_CITIES = [
  "san rafael", "novato", "mill valley", "larkspur", "corte madera", "tiburon",
  "sausalito", "san anselmo", "fairfax", "ross", "belvedere", "kentfield",
  "greenbrae", "nicasio", "lagunitas", "woodacre", "forest knolls",
  "san geronimo", "bolinas", "stinson beach", "point reyes station",
  "point reyes", "inverness", "olema", "marin city", "strawberry", "tam valley",
  "marinwood", "lucas valley", "tomales", "dillon beach", "marshall",
  "san quentin", "bel marin keys", "black point", "marin county", "marin",
];

const TRAVEL_FEE = {
  Marin: 0,
  "San Francisco": 35,
  "Santa Rosa": 35,
};

function normalize(s) {
  return (s || "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
}

// Maps a free-text city to a service area, or null if out of area. Exported
// so the same-day timing check (api/_lib/book.js) can classify locations the
// exact same way Sky's quoting already does, instead of a second town list
// drifting out of sync with this one.
export function resolveArea(cityRaw) {
  const c = normalize(cityRaw);
  if (!c) return null;
  if (c.includes("santa rosa")) return "Santa Rosa";
  if (c.includes("san francisco") || c === "sf" || c.includes("san fran")) {
    return "San Francisco";
  }
  for (const town of MARIN_CITIES) {
    if (c.includes(town)) return "Marin";
  }
  return null;
}

/**
 * Computes the exact quote for a booking.
 * @param {object} input
 * @param {string} input.city - event city
 * @param {number} input.hours - total painting hours (1 = $150, 2 = $300, each hour beyond 2 = +$100)
 * @param {boolean} [input.secondArtist] - include a second artist (+$200)
 * Returns { inServiceArea:false } when the city is out of area, otherwise the
 * full breakdown with a grand total.
 */
export function computeQuote({ city, hours, secondArtist } = {}) {
  const area = resolveArea(city);
  if (!area) {
    return { inServiceArea: false, city: city || "" };
  }

  const h = Number(hours);
  let hoursPrice;
  if (!h || h < 1) hoursPrice = 300; // default to the two hour package
  else if (h === 1) hoursPrice = 150;
  else hoursPrice = 300 + (h - 2) * 100;

  const travelFee = TRAVEL_FEE[area];
  const secondArtistFee = secondArtist ? 200 : 0;
  const total = hoursPrice + travelFee + secondArtistFee;

  return {
    inServiceArea: true,
    area,
    hours: !h || h < 1 ? 2 : h,
    hoursPrice,
    secondArtistFee,
    travelFee,
    total,
  };
}
