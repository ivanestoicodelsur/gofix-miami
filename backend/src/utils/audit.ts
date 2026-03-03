import { AuditLog, type AuditAction, type AuditEntity } from '../models/AuditLog';

export async function logAudit(params: {
  userId: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  oldData?: unknown;
  newData?: unknown;
}) {
  try {
    await AuditLog.create({
      userId: params.userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      oldData: params.oldData,
      newData: params.newData,
      timestamp: new Date(),
    });
  } catch (err) {
    // do not fail the request if audit logging fails
    console.error('Audit log failed', err);
  }
}
