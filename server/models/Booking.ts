import { randomBytes } from 'node:crypto';
import mongoose, { Document, Schema } from 'mongoose';

export interface IBooking extends Document {
  event_id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  status: 'confirmed' | 'pending' | 'cancelled' | 'refunded';
  total_price: number;
  checked_in: boolean;
  checked_in_at: Date | null;
  /** Admin userId that performed the check-in. */
  checked_in_by: string | null;
  booking_note: string | null;
  /** Unguessable 128-bit ticket token (base64url). TODO(client): encode this, not the booking id, in the QR. */
  ticket_token: string;
  created_at: Date;
  updated_at: Date;
}

const BookingSchema = new Schema<IBooking>(
  {
    event_id: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['confirmed', 'pending', 'cancelled', 'refunded'],
      default: 'confirmed',
    },
    total_price: { type: Number, required: true },
    checked_in: { type: Boolean, default: false },
    checked_in_at: { type: Date, default: null },
    checked_in_by: { type: String, default: null },
    booking_note: { type: String, default: null },
    ticket_token: { type: String, default: () => randomBytes(16).toString('base64url') },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

BookingSchema.index({ user_id: 1, created_at: -1 });
BookingSchema.index({ event_id: 1, status: 1, created_at: -1 });
BookingSchema.index({ status: 1, created_at: -1 });
BookingSchema.index({ checked_in: 1 });
// Unique + sparse so existing bookings without a token are unaffected.
BookingSchema.index({ ticket_token: 1 }, { unique: true, sparse: true });
BookingSchema.index({ created_at: -1 });

export default (mongoose.models.Booking as mongoose.Model<IBooking>) || mongoose.model<IBooking>("Booking", BookingSchema);
