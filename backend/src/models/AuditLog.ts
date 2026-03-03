import mongoose, { Schema } from 'mongoose';

export type AuditAction = 'create' | 'update' | 'delete';
export type AuditEntity = 'Inventory' | 'Service';

export type AuditLogDoc = {
  userId: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  oldData?: unknown;
  newData?: unknown;
  timestamp: Date;
};

const AuditLogSchema = new Schema<AuditLogDoc>(
  {
    userId: { type: String, required: true, index: true },
    action: { type: String, required: true, enum: ['create', 'update', 'delete'], index: true },
    entity: { type: String, required: true, enum: ['Inventory', 'Service'], index: true },
    entityId: { type: String, required: true, index: true },
    oldData: { type: Schema.Types.Mixed },
    newData: { type: Schema.Types.Mixed },
    timestamp: { type: Date, required: true, default: () => new Date(), index: true },
  },
  { collection: 'audit_logs' }
);

export const AuditLog = mongoose.models.AuditLog || mongoose.model<AuditLogDoc>('AuditLog', AuditLogSchema);
