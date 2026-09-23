# Source access matrix for Lisbon (ticket #2)

Research date: 2026-09-23. All terms, pricing and API status were read from live primary sources on that date; URLs are inline. Glossary terms (Restaurant, Source, Review, Verdict, Aspect, Format, Access tag, Evidence) follow `CONTEXT.md`.

Hard constraint applied throughout: **no reviewer is ever identified** (no names, avatars, profile URLs or reviewer IDs, not even hashed). Where a Source's terms *require* showing the reviewer, that alone disqualifies public display.

Access tags used:
- **public-OK**: a Verdict and its Evidence derived from this Source may be shown to other people.
- **personal-only**: may be read, analysed and turned into a Verdict for the owner's private use only.
- **unusable**: no compliant path at all, or the Source doesn't exist for Lisbon.

> Not legal advice. This is a reading of contracts and statutes by a non-lawyer, meant to steer product decisions. Before anything is made public, get a real lawyer to check the PT/EU copyright points in section 4.

---

## 1. TL;DR

- **No UGC review API is usable for this product.** Google, Tripadvisor, Yelp, Foursquare, TheFork and OpenTable all forbid at least one of these: storing Reviews, deriving a new rating or aggregate from them, AI/ML processing, or showing them anonymised. Several forbid all four. Google's EEA terms, which apply to a Portugal-based developer, also don't list review aggregation among the permitted uses of the Places API.
- **Nothing is fully public-OK.** Across every Source, only three things can safely be shown publicly: (a) facts such as "Michelin 1 star 2026" or "Repsol 2 Sóis", with a link back; (b) our own Verdict wording plus a link; (c) at most short quotations under the PT quotation right, and even that right expects the author's name "whenever possible", which clashes with our anonymity rule for bylined critics.
- **The realistic MVP is personal-only.** Editorial Sources (Michelin, Guia Repsol, Time Out Lisboa, Observador, NiT, Público Fugas, Expresso BCBM) give the best Lisbon signal per Restaurant. The only way to get UGC volume is for the owner to capture Google Maps Reviews manually while browsing normally, stripping all reviewer fields at capture.
- **Recommended Sources** (section 3): Michelin Guide Portugal and Guia Repsol (distinctions), Time Out Lisboa, Observador/NiT/Fugas, Expresso Boa Cama Boa Mesa, and owner-captured Google Maps Reviews. All are personal-only except the distinction facts.

---

## 2. Matrix

Columns: **Access** = how we would get the data. **Reviews/Restaurant** = cap, full text or snippet, rating, date, language, credibility fields. **Caching / redisplay / attribution / derived analysis** = ToS limits. **Personal vs commercial** = how the terms differ by use. **Cost & rate** = cost at personal scale (a few hundred Restaurants, fewer than 10k calls a month). **Lisbon coverage**. **Tag**.

### 2.1 UGC platforms and APIs

| Source | Access | Reviews / Restaurant | Caching / redisplay / attribution / derived analysis | Personal vs commercial | Cost & rate | Lisbon coverage | Access tag |
|---|---|---|---|---|---|---|---|
| **Google Places API (New)** | REST `places.get` with the `reviews` field mask | Max **5**, "sorted by relevance"; full text plus `originalText`, rating 1-5, `publishTime`, `relativePublishTimeDescription`, language code. Each Review includes `authorAttribution` (name, URI, photo) [1] | **Caching:** GMP ToS 3.2.3(a) bans pre-fetching, caching, indexing or storing Content; only `place_id` may be stored indefinitely (Service Specific Terms §14) [2][3]. **Redisplay:** allowed only inside the app, next to a Google Map or with Google attribution [4]. **Attribution:** policy *requires* showing the review author's name and photo and linking the profile [4], which breaks our constraint. **Derived analysis:** 3.2.3(b) bans "creating content based on Google Maps Content"; 3.2.3(e) bans building a listings service [2]. In the EEA, the Places API is licensed only for the listed "Permitted Uses", and review aggregation is not one of them [5][6][7] | The same terms apply to personal and commercial use. There is no personal tier | Reviews need the **Place Details Enterprise + Atmosphere** SKU: 1,000 free calls/month, then about $25 per 1,000 [8]. Cheap, but cost is irrelevant given the ToS | Excellent: the densest UGC for Lisbon | **unusable** (no storage, no derivation, identity must be shown, EEA use restrictions) |
| **Google Maps, consumer web/app, owner reading by hand** | The owner reads Reviews in Maps and pastes or annotates them into the app (no automated fetch) | Whatever the owner reads. Can sort by newest, see Local Guide badges, filter by keyword | The end-user terms ban copying "unless you are otherwise permitted to do so by ... applicable intellectual property law", as well as bulk feeds and building a listings database [9]. PT law allows private copying for personal use (CDADC 75(2)(a)) [13]. The owner must strip reviewer fields at capture | Private, non-commercial use only. Publishing is not possible | Free. Throughput is limited by manual effort | Excellent | **personal-only** (the owner carries the risk; strip identity at capture) |
| **Tripadvisor Content API** | Legacy Content API **sunset 2026-08-31**; replaced by the **Terra** platform [10] | Terra `location/{id}/reviews`: up to **5** Reviews, full text, rating, date, language, trip type. The response includes `user.username` and avatar [11] | **Caching:** only the Location ID may be cached [12]. **Master Terms (2026-06-16)** [14]: 3.1.2 bans AI/ML use; 3.4.2(f) bans aggregating Content "into a new rating system"; 3.4.4 bans derivative works; 3.4.5 bans displaying it beside other UGC; attribution with the Tripadvisor logo is mandatory. The consumer ToS bans copying and scraping [15] | Terra is a commercial licence. There is no personal carve-out | 1,000 entities free for life, then about $0.015-$0.009 per entity [16]; 10 QPS, 10k/day [17] | Very good | **unusable** (bans new ratings and AI, and bans mixing with other Sources) |
| **Yelp Places API (Fusion)** | REST `/v3/businesses/{id}/reviews` | **3** (Starter) to **7** (Enhanced/Premium) excerpts of about **160 characters**, rating, time. Includes the user's name and image [18] | API Terms [19]: caching capped at **24h**; no commercial use without a plan; must display Yelp branding and a link; **§9.4 bans GenAI/LLM use** of API content | The free trial is for evaluation only | Paid plans from about **$229 to $643/month** [20]. Over budget | Weak in Lisbon | **unusable** (cost, 160-character snippets, GenAI ban) |
| **Foursquare Places API** | REST; "Tips" are FSQ's Reviews | Tips are **Premium** fields; short text, date, agree counts [21] | Pay-as-you-go plans **may not cache** [22]; the API licence bans derivative works and competing databases [23] | Commercial licence | Premium Tips cost about **$18.75 CPM** with no free tier [21] | Thin and stale for Lisbon Tips | **unusable** for Reviews. Note: **FSQ OS Places** open data is a good source for the Restaurant registry and IDs, not Reviews |
| **TheFork (TripAdvisor group)** | Partners API (booking and display only); consumer site | On site: many Reviews per Restaurant with rating sub-scores (food, service, ambience) and date. That is Aspect-shaped, useful data | The Partners API licence covers availability and booking display only, not Reviews for analysis [24]. The consumer ToU bans extraction "by robot ... **or manual process for any purpose**" [25]. robots.txt disallows the reviews pages [26] | The consumer ToU bans even manual extraction | The Partners API needs a partner contract | Very good (dominant booking platform in Lisbon) | **unusable** (even manual copying is barred by contract) |
| **OpenTable** | Partner-gated APIs only, with a formal agreement [27][28] | Not available via API. The site shows the reviewer's name and photo publicly (ToU §17) [29] | ToU §13: personal use only; bans any "robot, spider, scraper, generative AI ... **or other automatic or manual device, process, or means** to access, copy"; no derivative products [29] | Partner programme only | N/A | About **30** Restaurants in Portugal [30] | **unusable** |
| **Zomato** | None | None | None | None | None | Exited international markets in 2021; **PT subsidiary liquidated in 2023** [31] | **unusable** (defunct) |
| **Reddit (r/lisbon, r/portugal, r/PortugalExpats)** | Data API (OAuth). Access must be requested and approved [32][33] | Free-form threads ("best bacalhau?"). No structured rating. Dates and scores are present | Data API Terms (2026-07-20) [32]: User Content may not be modified except for formatting; no ML training; deleted content and author info must be removed (48h recommended); commercial use needs a separate agreement. The Responsible Builder Policy applies | Free non-commercial tier at **100 QPM** [33]. Commercial needs a contract | Free (non-commercial) | Good for "local vs tourist-trap" signal on well-known places | **personal-only** (after API approval; drop usernames at ingest; honour deletions) |

### 2.2 Guides and critics (editorial)

| Source | Access | Reviews / Restaurant | Caching / redisplay / attribution / derived analysis | Personal vs commercial | Cost & rate | Lisbon coverage | Access tag |
|---|---|---|---|---|---|---|---|
| **Michelin Guide Portugal** | Website only; no public API. AWS WAF bot challenge in place | **1** editorial Review ("inspectors' point of view"), a distinction (Stars, Bib Gourmand, Selected, Green Star), price band, cuisine. No individual byline, so the critic question doesn't arise | ToU [34]: §4 bans any "robot, spider, other automatic device **or manual process** to monitor or copy"; §7 allows **one personal, non-commercial copy** only; §8 allows linking to the home page only, with no framing | Personal copy only | Free (reading) | Excellent for the top end (2026 Portugal selection, many Lisbon Restaurants) | **personal-only** for text. **Distinction as a fact plus a link: public-OK-ish** (facts aren't copyrightable; low risk for small counts, but the EU sui generis database right applies to substantial extraction) |
| **Guia Repsol Portugal** *(missed Source)* | Website only; returns 403 to bots | 1 short editorial note; **Sóis** (1-3) and **Solete** distinctions. 2026 (2nd edition, 13 Apr 2026): **298** Restaurants, **102** with Sóis; **285 Soletes, 69 in Lisbon** [35][36] | ToS not retrievable (403). Assume the Spanish-group norm: personal use only, no reproduction. **Needs verification** | Personal | Free | Very good, and strong in the mid-range where Michelin is thin (Soletes = casual favourites) | **personal-only** for text. **Distinction as fact plus link: public-OK-ish** (same database caveat) |
| **Time Out Lisboa** (timeout.pt/lisboa) | Website; news sitemap at `/lisboa/pt/news_sitemap.xml`; no RSS feed [37] | Critic Review with 1-5 stars, date, byline; plus many "best of" lists. PT and EN | Terms (April 2019) [38]: 3.2.9 bans commercial use; 11.3 bans copying "exceto com o único propósito de visualizar". robots.txt has **no** AI-bot reservation [37] | Personal viewing only | Free | **Excellent**: the widest editorial coverage of Lisbon, across all price bands | **personal-only** |
| **Expresso — Boa Cama Boa Mesa** | Website behind a paywall (403 to bots) | Critic Reviews and guide scores; date; byline | ToS (2026-03-24) [39]: §1.4.2 says BCBM requires a **paid subscription**; §10.4 says content is "apenas a uso pessoal, não comercial"; §10.7 bans reproduction. robots.txt **blocks AI bots** (a TDM reservation) [40] | Personal, with subscription | Subscription (about EUR 5-10/month; check the current price before buying) | Very good (annual guide; strong on Lisbon) | **personal-only** (subscription required) |
| **Observador** (Lifestyle/food) | Website; RSS at `observador.pt/feed/` | Critic articles, dated, bylined. Some are Premium | ToS [41]: only the private use permitted by law. robots.txt **blocks AI bots** [42] | Personal | Free (some pieces are Premium) | Good | **personal-only** |
| **NiT** (New in Town) | Website; RSS at `nit.pt/feed` | Many short pieces and lists; new openings; dated, bylined | T&C [43]: "Apenas é permitido o uso dos conteúdos do site para fins pessoais"; no incorporation into other works. No AI-bot block | Personal | Free | **Very good** for new openings in Lisbon | **personal-only** |
| **Público — Fugas** | Website; RSS via `feeds.feedburner.com/PublicoRSS` | Critic Reviews (e.g. restaurant column), dated, bylined | robots.txt **blocks AI bots** [44]; standard all-rights-reserved terms | Personal | Free (some paywall) | Good | **personal-only** |
| **Evasões (JN)** | Redirects to jn.pt/evasoes; returns 403 to bots | Guide-style Reviews | Not verified (403) | Personal assumed | Free | Moderate (Porto-leaning) | **personal-only** (unverified; low priority) |

### 2.3 Blogs and independent critics

| Source | Access | Reviews / Restaurant | Caching / redisplay / attribution / derived analysis | Personal vs commercial | Cost & rate | Lisbon coverage | Access tag |
|---|---|---|---|---|---|---|---|
| **Mesa Marcada** (Duarte Calvão / Miguel Pires) | Blog on SAPO | Long-form critic notes | robots.txt **disallows everything** [45] | Personal | Free | Good for fine dining and industry news | **personal-only** (manual reading only) |
| **Culinary Backstreets Lisbon** | Website; crawling allowed | Deep dives on tascas and neighbourhood places | All rights reserved; no AI-bot block | Personal | Free | Good for the authentic, cheap end | **personal-only**; public-OK only with written permission |
| **Portugal Confidential** | Website; RSS at `portugalconfidential.com/feed/` | Openings and "best of" lists | All rights reserved | Personal | Free | Good (upscale, new openings) | **personal-only**; public-OK with permission |
| **Eater (Lisbon maps)** | Website | Curated map entries | robots.txt **blocks AI bots** | Personal | Free | Occasional heatmaps | **personal-only** (low priority) |
| **Other blogs** (e.g. Lisbon Lux, Taste of Lisboa's blog, individual Instagram critics) | Varies | Varies | Default is all rights reserved | Personal | Free | Varies | **personal-only** by default; **public-OK only with the author's permission**. This is the one realistic path to genuinely public Evidence. Ask bloggers for a licence. |

### 2.4 Registry (not Reviews, but needed)

| Source | Use | Terms | Tag |
|---|---|---|---|
| **FSQ OS Places** (Foursquare open data) | Restaurant IDs, names, coordinates, categories | Apache-2.0 open data release | **public-OK** (registry only) |
| **OpenStreetMap** | Same; `amenity=restaurant` in Lisbon | ODbL (attribution plus share-alike on the database) | **public-OK** (registry only) |

---

## 3. Recommendation: the 3-5 most promising Sources

Ordered by signal per unit of effort, given the anonymity constraint and the EUR 25/month budget:

1. **Michelin Guide Portugal plus Guia Repsol Portugal** (distinctions). Showing the *distinction as a fact plus a link* is public-OK-ish. The inspector text is **personal-only**. There is no reviewer identity (the guides are institutional), and together they cover about 300 top and mid-range Lisbon Restaurants. Use them as a strong prior on the Verdict.
2. **Time Out Lisboa**: **personal-only**. The broadest Lisbon editorial coverage, with stars and dates, and no AI-bot reservation in robots.txt. The news sitemap is useful for discovering new Reviews.
3. **Observador, NiT and Público Fugas**: **personal-only**. RSS feeds for discovery; NiT is the best Source for new openings. Observador and Público reserve TDM in robots.txt, so read manually or through the owner's browser and don't crawl.
4. **Expresso Boa Cama Boa Mesa**: **personal-only**, requires a subscription. High-credibility critic scores. Fits the budget (about EUR 5-10/month; check the current price).
5. **Google Maps Reviews via owner-assisted manual capture**: **personal-only**, at the owner's risk. This is the only way to get UGC volume and recency for Lisbon. Strip name, avatar, profile URL and any ID at capture; keep text, rating, date and language only. Never automate it: no API use and no scraping.

Optional extras:
- **Reddit** (personal-only, after Data API approval; drop usernames).
- **Blogs**: ask for a licence, since this is the only path to public-OK Evidence text.
- **FSQ OS Places / OSM** for the Restaurant registry (public-OK).

**Implication for product scope (ticket #9 and others):** design the MVP as a **personal-only** tool. If a public mode is ever wanted, it can show only:
- our own Verdict and Aspect wording;
- distinction facts, with links;
- links out to each Source;
- quotations from blogs that granted a licence.

It must not include UGC text or critic text.

---

## 4. Cross-cutting legal notes (PT/EU)

- **Text and data mining (TDM).** DSM Directive 2019/790 Art. 4 allows TDM of lawfully accessible works *unless the rightholder has reserved it* in a machine-readable way; recital 18 says site ToS count as a reservation [46]. Portugal transposed this via **DL 47/2023** into CDADC art. 75.º n.º2 al. w) [47]. Art. 7(1) protects only Arts 3, 5 and 6 from contractual override, so **ToS bans on scraping or AI are binding** for Art. 4 TDM [46]. Explicit reservations exist at Expresso, Observador, Público and Eater (robots.txt AI-bot blocks), and at Michelin, TheFork, OpenTable and Tripadvisor (ToS). Commercial or public TDM on them is not covered.
- **Private copy.** CDADC 75(2)(a) covers reproduction for private use only [13]. This underpins every personal-only tag, *but* a contract (e.g. TheFork's "manual process" ban, Michelin §4, OpenTable §13) can still make even manual copying a breach of contract, if not of copyright.
- **Quotation right.** CDADC 75(2)(h) allows quotations for criticism or review. Art. 76(1)(a) requires "indicação, sempre que possível, do nome do autor e do editor, do título da obra"; art. 76(2) says quotations must be short and not confused with our own work [48]. **This clashes with the anonymity constraint for bylined critics.** Options:
  - quote only institutional Sources, i.e. the guides, which have no byline;
  - name the *publication* but not the person (arguably "sempre que possível" leaves room; this needs a legal view);
  - don't quote critics publicly at all.

  For UGC the constraint wins, and we simply don't quote publicly.
- **Database right.** The EU sui generis database right (Directive 96/9/EC) protects substantial extraction from guide databases. Showing distinctions for a few hundred Restaurants is a judgement call. Keep it to facts plus links, and never mirror a guide's full list.
- **GDPR.** Reviewer names and IDs are personal data. The anonymity constraint also removes most GDPR exposure. Review *text* can still contain personal data (e.g. "the waiter João"). Consider scrubbing named individuals in the analysis step.

---

## 5. Open items / verification gaps

- The Guia Repsol ToS could not be fetched (403). Verify manually before relying on it.
- Evasões was not verified (403).
- The Expresso subscription price was not confirmed from the live checkout.
- OpenTable's PT count (about 30) comes from the metro page and changes over time.
- Tripadvisor Terra: re-check the Master Terms if a public mode is ever planned. As of 2026-06-16, they rule out our use.

---

## References

1. Google Places API (New) — Place resource, `reviews` (max 5, "sorted by relevance") — https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places
2. Google Maps Platform Terms of Service §3.2.3 — https://cloud.google.com/maps-platform/terms
3. Google Maps Platform Service Specific Terms §14 (Places; `place_id` storable) — https://cloud.google.com/maps-platform/terms/maps-service-terms
4. Places API policies (attribution; author attribution required) — https://developers.google.com/maps/documentation/places/web-service/policies
5. Google Maps Platform EEA Terms — https://cloud.google.com/terms/maps-platform/eea
6. EEA Places API Permitted Uses — https://cloud.google.com/terms/maps-platform/eea-places-api-permitted-uses
7. Google Maps Platform EEA FAQ — https://developers.google.com/maps/comms/eea/faq
8. Google Maps Platform pricing (Place Details Enterprise + Atmosphere) — https://developers.google.com/maps/billing-and-pricing/pricing
9. Google Maps/Google Earth Additional Terms of Service (2026-01-27) — https://maps.google.com/help/terms_maps/
10. Tripadvisor Terra FAQ (Content API sunset 2026-08-31) — https://docs.terra.tripadvisor.com/docs/faq
11. Terra location reviews endpoint — https://docs.terra.tripadvisor.com/reference/locationreviewsget
12. Terra caching policy — https://docs.terra.tripadvisor.com/docs/caching-policy
13. CDADC art. 75 (utilizações livres) — https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=484&tabela=leis
14. Tripadvisor API Master Terms (2026-06-16) — https://docs.terra.tripadvisor.com/docs/api-master-terms
15. Tripadvisor Terms of Use — https://tripadvisor.mediaroom.com/us-terms-of-use
16. Terra usage-based pricing — https://docs.terra.tripadvisor.com/docs/usage-based-pricing
17. Terra rate limits — https://docs.terra.tripadvisor.com/docs/rate-limits
18. Yelp Fusion business reviews reference — https://docs.developer.yelp.com/reference/v3_business_reviews
19. Yelp API Terms of Use — https://terms.yelp.com/developers/api_terms/
20. Yelp Places API plans — https://business.yelp.com/data/products/places-api/
21. Foursquare pricing and upcoming changes (Premium fields) — https://foursquare.com/pricing/ ; https://docs.foursquare.com/developer/reference/upcoming-changes
22. Foursquare usage guidelines (caching) — https://docs.foursquare.com/fsq-developers-places/reference/usage-guidelines.md
23. Foursquare API License Agreement — https://foursquare.com/legal/terms/apilicenseagreement/
24. TheFork Partners API Licence — https://docs.thefork.io/pdf/LaFourchette-Partners-API-Licence-2.pdf
25. TheFork Terms of Use (03-2025) — https://c.tfstatic.com/tf-product/legal/terms_and_conditions/thefork.co.uk_03-2025
26. TheFork PT robots.txt — https://www.thefork.pt/robots.txt
27. OpenTable developer docs — https://docs.opentable.com/
28. OpenTable API partner terms — https://www.opentable.com/restaurant-solutions/api-partners/terms-and-conditions/
29. OpenTable Terms of Use §13, §17 — https://www.opentable.com/legal/terms-and-conditions
30. OpenTable Portugal metro — https://www.opentable.com/metro/portugal
31. Economic Times — Zomato begins liquidation of Portuguese subsidiary (2023) — https://economictimes.indiatimes.com/tech/startups/zomato-begins-liquidation-of-portuguese-subsidiary/articleshow/102080556.cms
32. Reddit Data API Terms (2026-07-20) — https://redditinc.com/policies/data-api-terms
33. Reddit Data API Wiki (access, 100 QPM) — https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki
34. Michelin Guide Terms of Use — https://guide.michelin.com/en/terms-of-use
35. Guia Repsol — Sóis 2026 list — https://www.guiarepsol.com/pt/gala-sois-guia-repsol-portugal-2026/lista-dos-novos-restaurantes-sois-guia-repsol-2026/
36. Guia Repsol — Soletes across Portugal — https://www.guiarepsol.com/pt/soletes/conheza-soletes-todo-pais/
37. Time Out PT robots.txt — https://www.timeout.pt/robots.txt ; news sitemap https://www.timeout.pt/lisboa/pt/news_sitemap.xml
38. Time Out Lisboa Termos e Condições — https://www.timeout.pt/lisboa/pt/termos-e-condicoes
39. Expresso Termos e Condições de Utilização (2026-03-24) — https://expresso.pt/institucional/2026-03-24-termos-e-condicoes-de-utilizacao-c0e263f4
40. Expresso robots.txt — https://expresso.pt/robots.txt
41. Observador Termos e Condições — https://observador.pt/termos-e-condicoes/
42. Observador robots.txt — https://observador.pt/robots.txt
43. NiT Termos e Condições — https://www.nit.pt/termos-e-condicoes
44. Público robots.txt — https://www.publico.pt/robots.txt
45. Mesa Marcada robots.txt — https://mesamarcada.blogs.sapo.pt/robots.txt
46. Directive (EU) 2019/790 (DSM), Art. 4, Art. 7, recital 18 — https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX%3A32019L0790
47. Decreto-Lei n.º 47/2023 — https://diariodarepublica.pt/dr/detalhe/decreto-lei/47-2023-214524782
48. CDADC art. 76 (requisitos das utilizações livres) — https://www.pgdlisboa.pt/leis/lei_busca_art_velho.php?artigonum=484A0076&n_versao=6&nid=484&so_miolo=
