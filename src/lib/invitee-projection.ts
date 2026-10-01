// The Invitee's view of a Restaurant bundle (ADR 0008): the Owner's bundle with every Owner-only
// piece removed and Review text kept only where the Source is recorded as public-OK. Fails closed:
// a Source the bundle does not list counts as personal-only, and the strict Invitee schema rejects any
// field added to the Owner bundle later until it is projected on purpose.
import { inviteeBundleSchema, type InviteeBundle, type RestaurantBundle } from "./api-contract";

export function projectInviteeBundle(bundle: RestaurantBundle): InviteeBundle {
  const accessByCode = new Map(bundle.sources.map((source) => [source.code, source.access]));
  const publicOk = (code: string) => accessByCode.get(code) === "public_ok";
  const { sources, activeJob: _activeJob, ownerQuestions: _ownerQuestions, unavailableSources: _unavailable, restaurant, verdict, ...rest } = bundle;
  const { formatProvenance: _proposed, ...inviteeRestaurant } = restaurant;
  return inviteeBundleSchema.parse({
    ...rest,
    restaurant: inviteeRestaurant,
    verdict: verdict && {
      ...verdict,
      blocks: {
        rollup: {
          ...verdict.blocks.rollup,
          redFlags: verdict.blocks.rollup.redFlags.map((flag) => ({
            ...flag,
            incidents: flag.incidents?.map(({ evidence, ...incident }) => (publicOk(incident.source) ? { ...incident, evidence } : incident)),
          })),
        },
        quotes: verdict.blocks.quotes.filter((quote) => publicOk(quote.source)).map((quote) => ({ ...quote, access: "public_ok" as const })),
      },
    },
    sourceNames: Object.fromEntries(sources.map((source) => [source.code, source.name])),
  });
}
