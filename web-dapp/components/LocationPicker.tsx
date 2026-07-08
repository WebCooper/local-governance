"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Navigation, Search, X, Loader2 } from "lucide-react";

export interface PickedLocation {
  lat: number;
  lng: number;
  address: string;
}

interface Props {
  value: PickedLocation | null;
  onChange: (loc: PickedLocation | null) => void;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    return data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

async function searchAddress(query: string): Promise<{ lat: number; lng: number; address: string }[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`,
    { headers: { "Accept-Language": "en" } }
  );
  const data = await res.json();
  return data.map((r: any) => ({
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    address: r.display_name,
  }));
}

export default function LocationPicker({ value, onChange }: Props) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const mapRef         = useRef<any>(null);
  const markerRef      = useRef<any>(null);
  const leafletRef     = useRef<any>(null);
  // Synchronous guard — set BEFORE the async import so Strict Mode's
  // second mount sees it immediately and bails out.
  const initStarted    = useRef(false);

  const [geoLoading,    setGeoLoading]    = useState(false);
  const [geoError,      setGeoError]      = useState<string | null>(null);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState<{ lat: number; lng: number; address: string }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults,   setShowResults]   = useState(false);

  const placeMarker = useCallback(async (lat: number, lng: number, existingAddress?: string) => {
    const L   = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    const address = existingAddress ?? await reverseGeocode(lat, lng);

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:28px;height:28px;background:#2563eb;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
      });
      markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
      markerRef.current.on("dragend", async () => {
        const pos  = markerRef.current.getLatLng();
        const addr = await reverseGeocode(pos.lat, pos.lng);
        onChange({ lat: pos.lat, lng: pos.lng, address: addr });
      });
    }

    map.setView([lat, lng], 15, { animate: true });
    onChange({ lat, lng, address });
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    // Synchronous guard — prevents the second Strict Mode invocation from
    // starting a second import() call before the first one has resolved.
    if (initStarted.current) return;
    initStarted.current = true;

    import("leaflet").then((L) => {
      // By the time the import resolves the component may have unmounted
      // (Strict Mode cleanup) — bail out if so.
      if (!containerRef.current) return;

      // Also bail if somehow a map instance was already attached
      if (mapRef.current) return;

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        center:      [7.8731, 80.7718],
        zoom:        7,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      map.on("click", async (e: any) => {
        await placeMarker(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;

      if (value) {
        placeMarker(value.lat, value.lng, value.address);
      }
    });

    return () => {
      // Reset the sync guard so a true remount (e.g. route change) can init again
      initStarted.current = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current  = null;
        markerRef.current = null;
        leafletRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAutoDetect = () => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await placeMarker(pos.coords.latitude, pos.coords.longitude);
        setGeoLoading(false);
      },
      () => {
        setGeoError("Location access denied. Please allow location or select manually.");
        setGeoLoading(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setShowResults(false);
    const results = await searchAddress(searchQuery);
    setSearchResults(results);
    setShowResults(true);
    setSearchLoading(false);
  };

  const selectResult = async (r: { lat: number; lng: number; address: string }) => {
    await placeMarker(r.lat, r.lng, r.address);
    setShowResults(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const clearLocation = () => {
    if (markerRef.current && mapRef.current) {
      mapRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Leaflet CSS */}
      <style>{`@import url('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');`}</style>

      {/* Search bar */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search address or place..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-900 text-slate-200 placeholder:text-slate-500 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={searchLoading}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </button>
        </div>

        {showResults && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-[1000] mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
            {searchResults.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectResult(r)}
                className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 border-b border-slate-100 last:border-0 transition-colors flex items-start gap-2"
              >
                <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <span className="line-clamp-2">{r.address}</span>
              </button>
            ))}
          </div>
        )}
        {showResults && searchResults.length === 0 && (
          <div className="absolute top-full left-0 right-0 z-[1000] mt-1 bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm text-slate-400">
            No results found.
          </div>
        )}
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleAutoDetect}
          disabled={geoLoading}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-semibold transition-colors"
        >
          {geoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
          {geoLoading ? "Detecting…" : "Auto-detect"}
        </button>

        {value && (
          <button
            type="button"
            onClick={clearLocation}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-medium transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}

        <p className="text-xs text-slate-400 ml-auto">
          Or <span className="text-blue-500 font-medium">click the map</span> to pin
        </p>
      </div>

      {geoError && (
        <p className="text-xs text-red-500 flex items-center gap-1.5">
          <X className="h-3.5 w-3.5" /> {geoError}
        </p>
      )}

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-slate-200" style={{ height: "320px" }}>
        <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      </div>

      {/* Selected location */}
      {value && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-xl">
          <MapPin className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-blue-700 mb-0.5">Selected Location</p>
            <p className="text-xs text-blue-600 leading-relaxed line-clamp-2">{value.address}</p>
            <p className="text-[10px] text-blue-400 mt-0.5 font-mono">
              {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
