// The Invitee's view of a Restaurant bundle (ADR 0008, amended): the Owner's report, unchanged, minus
// the Owner's operations (Owner questions, the active job, unavailable-Source notices). The strict
// Invitee schema fails closed: any field added to the Owner bundle later is rejected until it is
// projected on purpose.
import { inviteeBundleSchema, type InviteeBundle, type RestaurantBundle } from "./api-contract";

export function projectInviteeBundle(bundle: RestaurantBundle): InviteeBundle {
  const { activeJob: _activeJob, ownerQuestions: _ownerQuestions, unavailableSources: _unavailable, ...report } = bundle;
  return inviteeBundleSchema.parse(report);
}
