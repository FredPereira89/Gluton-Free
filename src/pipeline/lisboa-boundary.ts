import boundary from "./lisboa-boundary.json";

// Official municipality outline from Câmara Municipal de Lisboa's Limite de Concelho Actual
// ArcGIS layer (WGS84): https://services.arcgis.com/1dSrzEWVQn5kHHyK/arcgis/rest/services/Limite_Cartografia/FeatureServer/1
type PolygonGeometry = { type: "Polygon"; coordinates: number[][][] };
type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: number[][][][] };
type BoundaryGeometry = PolygonGeometry | MultiPolygonGeometry;

export const LISBOA_MUNICIPALITY_GEOMETRY = (boundary.features[0] as { geometry: BoundaryGeometry }).geometry;

type Point = { lat: number; lng: number };
type Ring = number[][];

function pointOnSegment(point: Point, a: number[], b: number[]): boolean {
  const [ax, ay] = a;
  const [bx, by] = b;
  const x = point.lng;
  const y = point.lat;
  const cross = (x - ax!) * (by! - ay!) - (y - ay!) * (bx! - ax!);
  const tolerance = 1e-10 * Math.max(1, Math.abs(bx! - ax!), Math.abs(by! - ay!));
  return Math.abs(cross) <= tolerance
    && x >= Math.min(ax!, bx!) - tolerance && x <= Math.max(ax!, bx!) + tolerance
    && y >= Math.min(ay!, by!) - tolerance && y <= Math.max(ay!, by!) + tolerance;
}

function pointInRing(point: Point, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!;
    const b = ring[i]!;
    if (pointOnSegment(point, a, b)) return true;
    const crossesLatitude = (a[1]! > point.lat) !== (b[1]! > point.lat);
    if (crossesLatitude && point.lng < (b[0]! - a[0]!) * (point.lat - a[1]!) / (b[1]! - a[1]!) + a[0]!) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(point: Point, rings: Ring[]): boolean {
  if (!rings.length || !pointInRing(point, rings[0]!)) return false;
  return !rings.slice(1).some((hole) => pointInRing(point, hole));
}

/** Boundary points count as inside; holes in the official geometry remain outside. */
export function insideLisboaMunicipality(point: Point): boolean {
  const geometry = LISBOA_MUNICIPALITY_GEOMETRY;
  return geometry.type === "Polygon"
    ? pointInPolygon(point, geometry.coordinates)
    : geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
}
