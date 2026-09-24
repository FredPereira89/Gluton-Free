# Gluton-Free

Gluton-Free aggregates restaurant reviews from many sources and distils them into a single qualitative Verdict per Restaurant, backed by Evidence, because star ratings alone are too compressed to tell restaurants apart.

## Language

**Restaurant**:
A single physical dining venue, identified independently of any one Source's Listing of it. A food-hall stall is a Restaurant; a bar without a kitchen-led offer and a delivery-only kitchen are not.
_Avoid_: Place, venue, listing

**Source**:
A platform or publication that carries reviews of Restaurants (e.g. Google, TheFork, Tripadvisor, a critic's column). Every Source is either a Crowd Source or an Editorial Source.
_Avoid_: Provider, platform, site

**Crowd Source**:
A Source where many ordinary diners publish Reviews (e.g. Google, Tripadvisor, TheFork). Only Crowd Source Reviews determine a Verdict's Tier.
_Avoid_: User-generated source, review site

**Editorial Source**:
A Source written by critics, publications or guides (e.g. Michelin, Guia Repsol, Time Out Lisboa, Expresso). It contributes Distinctions and critic pieces to Evidence, never to the Tier.
_Avoid_: Critic source, press, expert source

**Distinction**:
A guide's award or listing for a Restaurant (e.g. a Michelin star, Bib Gourmand or Selected listing; a Guia Repsol Sol, Solete or plain listing), held as a fact with a link, not as a Review.
_Avoid_: Award, badge, accolade

**Listing**:
One Restaurant's page on one Source. A Restaurant has at most one Listing per Source; matching Listings across Sources is how Gluton-Free knows they are the same Restaurant.
_Avoid_: Place, profile, entry

**Review**:
One reviewer's account of a Restaurant as published on one Source, with its rating (if any), date, and text.
_Avoid_: Rating, comment, post

**Review window**:
The Reviews from each Source that count toward a Restaurant's Verdict: its most recent text Reviews, capped in number and age, together with every star rating from the same period. Every Restaurant, Peer or not, is judged on the same kind of window; older Reviews are kept but do not count.
_Avoid_: History, sample, depth

**Verdict**:
The single qualitative judgement Gluton-Free issues for a Restaurant, expressed as a Tier with a confidence and a short explanation. Verdicts are universal (the same for every user) and relative: a Restaurant is judged against others of its own kind, not against all Restaurants.
_Avoid_: Score, rating, grade

**Tier**:
One of the five Verdict levels, lowest to highest: Avoid, OK, Good, Must Go, Life Changing.
_Avoid_: Badge level, grade, stars

**Not enough evidence**:
The state of a Restaurant whose Reviews are too few, too thin on food, or too old to support any Tier; shown in place of a Verdict, never as one.
_Avoid_: Unrated, pending, N/A

**Peer group**:
The set of Restaurants a Restaurant is ranked against: its Format in its city, or, when the Format has too few Peers, its Format family, or else the whole city. The level used can differ per input and is always named in the explanation.
_Avoid_: Cohort, comparison set, benchmark

**Peer**:
A Restaurant in the same Peer group that has enough evidence for a Verdict of its own. A Restaurant's Tier is decided by where it stands among its Peers.
_Avoid_: Competitor, comparable, neighbour

**Peer snapshot**:
The dated, frozen record of every Peer group's standings that Verdicts are judged against. A new one is taken monthly (and after the Lisbon baseline); when it is, every Verdict is re-judged against it. A Restaurant looked up in between joins its Peers only at the next Peer snapshot.
_Avoid_: Baseline, benchmark, calibration

**Confidence**:
How likely a Verdict's Tier is to hold if the Restaurant were judged on a different sample of its Reviews: Low, Medium or High.
_Avoid_: Certainty, accuracy, reliability score

**Provisional**:
Said of a Verdict issued before its Peers have been gathered, judged against default cut-offs instead of Peers. A provisional Verdict always has Low Confidence.
_Avoid_: Draft, preliminary, beta

**Red flag**:
A verified, first-hand report in a Review of a health problem (food poisoning, poor hygiene, other safety) or a money problem (a scam, overcharging, an unordered couvert charged). Red flags that are recurring and recent force Avoid.
_Avoid_: Warning, issue, complaint

**Aspect**:
A dimension of the dining experience that Reviews are analysed along: food, service, ambience, value, wait time, consistency. For some Formats an Aspect is informative-only: shown in Evidence but never counted toward the Tier (e.g. ambience at a tasca).
_Avoid_: Category, dimension, attribute

**Format**:
The kind of dining a Restaurant offers (e.g. tasca, marisqueira, fine dining): its service model and occasion, not its cuisine, drawn from a small fixed list. Every Restaurant has exactly one Format. A Restaurant's peers for its Verdict are the other Restaurants of the same Format in the same city (for Lisbon, the municipality).
_Avoid_: Category, type, cuisine, segment

**Format family**:
A group of related Formats (Traditional Portuguese, Casual, Fine dining, Quick & café). A Format with too few peers borrows its Format family's peers.
_Avoid_: Category, group, parent Format

**Price tier**:
How expensive a Restaurant is, from € to €€€€. Shown with the Verdict; never splits peers.
_Avoid_: Price level, price range, budget

**Access tag**:
The label on every Source saying how its Reviews may be used: public-OK (usable if Gluton-Free goes public) or personal-only.
_Avoid_: License, permission

**Theme**:
A recurring point Reviews make about one Aspect, positive or negative, drawn from a fixed list (e.g. generous portions, an unordered couvert charged). Evidence shows each Theme with the share of Reviews that raise it.
_Avoid_: Topic, tag, keyword

**Evidence**:
The material shown alongside a Verdict to justify it: themes, representative quotes, the breakdown by Source, and any Distinctions and critic pieces.
_Avoid_: Proof, details, breakdown
