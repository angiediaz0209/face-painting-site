// Google Places autocomplete for the event address, no map.
//
// Uses the current Places API (PlaceAutocompleteElement) through
// @vis.gl/react-google-maps. Everything here is inert unless
// VITE_GOOGLE_MAPS_BROWSER_KEY is set, so the site keeps working with the plain
// text box when the key is missing (local dev, or if the key is ever revoked).
//
// Results are biased to the service area so "Boyd Park" suggests the one in
// San Rafael, not Ohio, and restricted to the US.
import { useEffect, useRef } from 'react';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';

const KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY || '';

export const hasPlaces = Boolean(KEY);

// Roughly Santa Rosa down to the south end of San Francisco.
const SERVICE_AREA = { north: 38.6, south: 37.6, east: -122.0, west: -123.1 };

/** Loads the Maps SDK once. Renders children untouched when there's no key. */
export function PlacesProvider({ children }) {
  if (!hasPlaces) return children;
  return (
    <APIProvider apiKey={KEY} libraries={['places']}>
      {children}
    </APIProvider>
  );
}

/**
 * The search box. Calls onSelect({ address, name, lat, lng }) when the client
 * picks a suggestion. `address` is Google's formatted address; `name` is the
 * venue name when the pick is a place rather than a street address.
 */
export function AddressAutocomplete({ onSelect, className = '' }) {
  const places = useMapsLibrary('places');
  const hostRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!places || !hostRef.current) return undefined;
    const el = new places.PlaceAutocompleteElement({
      includedRegionCodes: ['us'],
      locationBias: SERVICE_AREA,
    });
    el.style.width = '100%';
    const handler = async (e) => {
      try {
        const place = e.placePrediction.toPlace();
        await place.fetchFields({ fields: ['formattedAddress', 'displayName', 'location'] });
        onSelectRef.current?.({
          address: place.formattedAddress || '',
          name: place.displayName || '',
          lat: place.location?.lat(),
          lng: place.location?.lng(),
        });
      } catch (err) {
        console.warn('Place lookup failed', err);
      }
    };
    el.addEventListener('gmp-select', handler);
    hostRef.current.appendChild(el);
    return () => {
      el.removeEventListener('gmp-select', handler);
      el.remove();
    };
  }, [places]);

  return <div ref={hostRef} className={className} />;
}

/** "Boyd Park, 1125 B St, San Rafael, CA" — venue name first when it adds something. */
export function labelFor({ address, name }) {
  if (!name || !address) return address || name || '';
  return address.toLowerCase().startsWith(name.toLowerCase()) ? address : `${name}, ${address}`;
}
