// Neighbourhood of a Restaurant, for the directory filter. The `area` column is almost empty (4 of
// the 341 baseline Restaurants), so the neighbourhood is derived: the stored area when set, else
// the neighbourhood the address names between commas, else the nearest neighbourhood centre to the
// Restaurant's coordinates. Centres are approximate (a reader's neighbourhood, not a parish
// boundary), so a point further than MAX_KM from every centre falls back to NEIGHBOURHOOD_FALLBACK.
export const NEIGHBOURHOOD_FALLBACK = "Elsewhere in Lisbon";
const MAX_KM = 2.5;

const CENTRES: { name: string; lat: number; lng: number }[] = [
  { name: "Baixa", lat: 38.711, lng: -9.137 },
  { name: "Alfama", lat: 38.713, lng: -9.129 },
  { name: "Mouraria", lat: 38.716, lng: -9.1345 },
  { name: "Graça", lat: 38.7195, lng: -9.127 },
  { name: "Chiado", lat: 38.7105, lng: -9.1425 },
  { name: "Bairro Alto", lat: 38.7135, lng: -9.1445 },
  { name: "Príncipe Real", lat: 38.7165, lng: -9.1495 },
  { name: "Cais do Sodré", lat: 38.706, lng: -9.1445 },
  { name: "Santos & Madragoa", lat: 38.707, lng: -9.1555 },
  { name: "Estrela & Lapa", lat: 38.7125, lng: -9.16 },
  { name: "Campo de Ourique", lat: 38.7165, lng: -9.1665 },
  { name: "Campolide", lat: 38.7285, lng: -9.161 },
  { name: "Alcântara", lat: 38.704, lng: -9.179 },
  { name: "Ajuda", lat: 38.707, lng: -9.199 },
  { name: "Belém", lat: 38.6975, lng: -9.206 },
  { name: "Avenida da Liberdade", lat: 38.726, lng: -9.149 },
  { name: "Anjos & Intendente", lat: 38.724, lng: -9.135 },
  { name: "Arroios", lat: 38.7345, lng: -9.134 },
  { name: "Saldanha & Avenidas Novas", lat: 38.7335, lng: -9.146 },
  { name: "Penha de França", lat: 38.7285, lng: -9.125 },
  { name: "Areeiro", lat: 38.742, lng: -9.133 },
  { name: "Alvalade", lat: 38.751, lng: -9.144 },
  { name: "Campo Grande", lat: 38.76, lng: -9.155 },
  { name: "Lumiar", lat: 38.773, lng: -9.156 },
  { name: "Benfica", lat: 38.748, lng: -9.201 },
  { name: "Beato & Marvila", lat: 38.7275, lng: -9.1045 },
  { name: "Olivais", lat: 38.765, lng: -9.115 },
  { name: "Parque das Nações", lat: 38.769, lng: -9.093 },
];

const plain = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
// Only names a reader would recognise as a neighbourhood when they sit alone between commas.
const NAMED_IN_ADDRESS = new Map([
  ...CENTRES.map(({ name }) => [plain(name), name] as const),
  ["santos", "Santos & Madragoa"], ["madragoa", "Santos & Madragoa"], ["estrela", "Estrela & Lapa"], ["lapa", "Estrela & Lapa"],
  ["anjos", "Anjos & Intendente"], ["intendente", "Anjos & Intendente"], ["beato", "Beato & Marvila"], ["marvila", "Beato & Marvila"],
  ["saldanha", "Saldanha & Avenidas Novas"], ["avenidas novas", "Saldanha & Avenidas Novas"],
]);

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * 111.2;
  const dLng = (lng2 - lng1) * 111.2 * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
}

export function neighbourhoodOf(restaurant: { area: string | null; address: string | null; lat: number | null; lng: number | null }): string {
  if (restaurant.area?.trim()) return restaurant.area.trim();
  for (const segment of restaurant.address?.split(",") ?? []) {
    const named = NAMED_IN_ADDRESS.get(plain(segment));
    if (named) return named;
  }
  if (restaurant.lat === null || restaurant.lng === null) return NEIGHBOURHOOD_FALLBACK;
  let best: { name: string; km: number } | null = null;
  for (const centre of CENTRES) {
    const km = distanceKm(restaurant.lat, restaurant.lng, centre.lat, centre.lng);
    if (!best || km < best.km) best = { name: centre.name, km };
  }
  return best && best.km <= MAX_KM ? best.name : NEIGHBOURHOOD_FALLBACK;
}
