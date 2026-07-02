"use client";

import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
});

interface Props {
  lat: number;
  lng: number;
  interactive?: boolean;
}

export default function MapPreview({
  lat,
  lng,
  interactive = false,
}: Props) {
  return (
    <LeafletMap
      lat={lat}
      lng={lng}
      interactive={interactive}
    />
  );
}