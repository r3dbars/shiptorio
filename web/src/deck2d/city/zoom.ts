// The Zoom button's pure helpers, kept apart from the city's drawing code so main.ts and the engine can import them
// without pulling the city into the deck's startup bundle (scripts/bundle-budget.ts). The city itself loads lazily.
import { CITY_COPY, CITY_ISLANDS, type CityIsland, type CityView, type CityZoom } from "../contract";

/** The manual Zoom button's view.city: line = all dark, no plates; city = the end of beat 5 (all dark, COMING SOON plates on). */
export function manualCity(zoom: Exclude<CityZoom, "station">, label: string = CITY_COPY.repo): CityView {
  const per = <T,>(v: T) => Object.fromEntries(CITY_ISLANDS.map((i) => [i, v])) as Record<CityIsland, T>;
  return { zoom, lit: per(0), plates: per(zoom === "city"), focus: null, label };
}
/** station -> line -> city -> station. Without the pixel canvas (?px=0) there is no city, so it is just station <-> line. */
export const nextZoom = (z: CityZoom, hasCity = true): CityZoom => (z === "station" ? "line" : z === "line" && hasCity ? "city" : "station");
/** Zoom out at station and line, Zoom in once you are at the city (one press back to the station). */
export const zoomLabel = (z: CityZoom) => (z === "city" ? "Zoom in" : "Zoom out");
/** The line's label: owner/name from ?repo= when it is a real repo, else "your repo". */
export function cityLabel(search: string): string {
  const repo = new URLSearchParams(search).get("repo") ?? "";
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) && !repo.split("/").some((part) => part === "." || part === "..") ? repo : CITY_COPY.repo;
}
/** ?shot=city and ?shot=city-<island> previews: a manual city, framed on the island (a phone pans to it). */
export function parseCityShot(shot: string | null, label: string = CITY_COPY.repo): CityView | null {
  if (shot === "city") return manualCity("city", label);
  const island = /^city-(errors|traffic|inbox|customers|marketing)$/.exec(shot ?? "")?.[1] as CityIsland | undefined;
  return island ? { ...manualCity("city", label), focus: island } : null;
}
