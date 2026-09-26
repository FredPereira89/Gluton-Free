import type { PushKind } from "@/lib/push-send";

export type FakePushSend = { kind: PushKind; restaurantId: number; questionId?: number };

export const fakePushSends: FakePushSend[] = [];

export async function fakeSendPush(kind: PushKind, restaurantId: number, questionId?: number): Promise<void> {
  fakePushSends.push({ kind, restaurantId, questionId });
}
