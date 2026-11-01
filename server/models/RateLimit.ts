import mongoose, { Schema } from 'mongoose';

export interface IRateLimit {
  _id: string; // e.g. 'login:ip:1.2.3.4' or 'lockout:<sha256(email)>'
  count: number;
  resetAt: Date;
  lockedUntil?: Date;
}

// TTL index removes expired docs. In production autoIndex is OFF: the index is created once at deploy:
//   db.ratelimits.createIndex({resetAt: 1}, {expireAfterSeconds: 0})
const RateLimitSchema = new Schema<IRateLimit>(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    resetAt: { type: Date, required: true },
    lockedUntil: { type: Date },
  },
  { collection: 'ratelimits', autoIndex: process.env.NODE_ENV !== 'production', versionKey: false, timestamps: false }
);
RateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

export default (mongoose.models.RateLimit as mongoose.Model<IRateLimit>) ||
  mongoose.model<IRateLimit>('RateLimit', RateLimitSchema);
