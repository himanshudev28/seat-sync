import mongoose, { Document, Schema } from 'mongoose';

/** Allowed seat types. 'wheelchair' marks an accessible space (bookable like a standard seat). */
export const SEAT_TYPES = ['standard', 'vip', 'wheelchair', 'blocked'] as const;
export type SeatType = (typeof SEAT_TYPES)[number];

export interface ISeat extends Document {
  event_id: mongoose.Types.ObjectId;
  number: number;
  price: number;
  row: string;
  status: 'available' | 'reserved' | 'booked';
  seat_type: SeatType;
  label: string | null;
  heldBy: string | null;
  heldUntil: Date | null;
  /** When the current hold chain began; holds cannot be refreshed past heldSince + 15 min. */
  heldSince: Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const SeatSchema = new Schema<ISeat>(
  {
    event_id: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    number: { type: Number, required: true },
    price: { type: Number, required: true },
    row: { type: String, required: true },
    status: {
      type: String,
      enum: ['available', 'reserved', 'booked'],
      default: 'available',
    },
    seat_type: { type: String, enum: SEAT_TYPES, default: 'standard' },
    label: { type: String, default: null },
    heldBy: { type: String, default: null },
    heldUntil: { type: Date, default: null },
    heldSince: { type: Date, default: null },
    version: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

SeatSchema.index({ event_id: 1, status: 1 });
SeatSchema.index({ event_id: 1, row: 1, number: 1 }, { unique: true });
SeatSchema.index({ heldUntil: 1 }, { sparse: true });

export default (mongoose.models.Seat as mongoose.Model<ISeat>) || mongoose.model<ISeat>("Seat", SeatSchema);
