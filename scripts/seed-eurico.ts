// Adds O Velho Eurico by hand: Sources, the Restaurant, its two Listings, its Distinction and
// critic pieces. Idempotent. Run: npx tsx --env-file=.env.local scripts/seed-eurico.ts
import { closeDb, db } from "../src/lib/db";

const TRIPADVISOR_PATH = "Restaurant_Review-g189158-d2317379-Reviews-O_Velho_Eurico-Lisbon_Lisbon_District_Central_Portugal.html";
const GOOGLE_PLACE_ID = "ChIJNSbwEng0GQ0RJZqJC6w1hYU";

async function main() {
  const sql = db();
  await sql`
    insert into source ${sql([
      { code: "google", name: "Google", kind: "crowd", access: "personal_only" },
      { code: "tripadvisor", name: "Tripadvisor", kind: "crowd", access: "personal_only" },
      { code: "guia_repsol", name: "Guia Repsol", kind: "editorial", access: "public_ok" },
    ])}
    on conflict (code) do nothing`;

  const [restaurant] = await sql`
    insert into restaurant (slug, name, city, area, address, lat, lng, format, format_provenance, price_tier, price_provenance)
    values ('o-velho-eurico', 'O Velho Eurico', 'Lisboa', 'Alfama', 'Largo de São Cristóvão 3, 1100-179 Lisboa',
            38.7127355, -9.1353776, 'tasca', 'owner', '€', 'owner')
    on conflict (slug) do update set name = excluded.name
    returning id`;
  const id = Number(restaurant!.id);

  await sql`
    insert into listing ${sql([
      {
        restaurant_id: id,
        source_code: "google",
        place_ref: GOOGLE_PLACE_ID,
        url: `https://www.google.com/maps/place/?q=place_id:${GOOGLE_PLACE_ID}`,
        match_provenance: "pasted",
      },
      {
        restaurant_id: id,
        source_code: "tripadvisor",
        place_ref: TRIPADVISOR_PATH,
        url: `https://www.tripadvisor.com/${TRIPADVISOR_PATH}`,
        match_provenance: "pasted",
      },
    ])}
    on conflict (restaurant_id, source_code) do nothing`;

  const [hasDistinction] = await sql`select 1 from distinction where restaurant_id = ${id}`;
  if (!hasDistinction) {
    await sql`
      insert into distinction (restaurant_id, guide, level, edition_year, url)
      values (${id}, 'Guia Repsol', 'Recomendado', 2026, 'https://www.guiarepsol.com/pt/fichas/restaurante/o-velho-eurico-pt405413/')`;
  }

  // Links only: publication, title, URL. Critic text is never fetched or stored.
  const pieces = [
    {
      publication: "Time Out Lisboa",
      title: "O Velho Eurico",
      url: "https://www.timeout.pt/lisboa/pt/restaurantes/o-velho-eurico",
      published_on: null,
      language: "pt",
    },
    {
      publication: "Time Out Lisboa",
      title: "O Velho Eurico voltou e \"caminha para melhor\". As mesas já não chegam para a procura",
      url: "https://www.timeout.pt/lisboa/pt/noticias/o-velho-eurico-esta-como-novo-mas-conseguir-mesa-continua-muito-dificil-052325",
      published_on: "2025-05-23",
      language: "pt",
    },
    {
      publication: "Observador",
      title: "Um balcão, paredes limpas e travessas de inox: o Velho Eurico é agora um sonho de tasca, apenas mais polido",
      url: "https://observador.pt/especiais/um-balcao-paredes-limpas-e-travessas-de-inox-o-velho-eurico-e-agora-um-sonho-de-tasca-apenas-mais-polido/",
      published_on: null,
      language: "pt",
    },
  ];
  for (const p of pieces) {
    const [exists] = await sql`select 1 from critic_piece where restaurant_id = ${id} and url = ${p.url}`;
    if (!exists) await sql`insert into critic_piece ${sql({ restaurant_id: id, ...p })}`;
  }

  const listings = await sql`select id, source_code, fetch_status from listing where restaurant_id = ${id} order by id`;
  console.log(`restaurant ${id}; listings:`, listings.map((l) => `${l.source_code}#${l.id} ${l.fetch_status}`).join(", "));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
