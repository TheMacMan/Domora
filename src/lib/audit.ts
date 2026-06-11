import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export async function writeAuditLog({
  userId,
  action,
  entity,
  entityId,
  before,
  after,
}: {
  userId: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}) {
  await db.insert(auditLog).values({
    id: createId(),
    userId,
    action,
    entity,
    entityId: entityId ?? null,
    before: before ? JSON.stringify(before) : null,
    after: after ? JSON.stringify(after) : null,
  });
}
