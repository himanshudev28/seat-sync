import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  email: string;
  password: string;
  first_name: string | null;
  last_name: string | null;
  is_admin: boolean;
  avatar_url: string | null;
  student_id: string | null;
  phone_number: string | null;
  course: string | null;
  last_login: Date | null;
  total_logins: number;
  google_id: string | null;      // set for Google OAuth users
  auth_provider: 'local' | 'google'; // which auth method was used
  token_version: number;         // bump to revoke all issued sessions
  email_verified: boolean;       // false for local registration until verified
  created_at: Date;
  updated_at: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: false, select: false },  // optional for OAuth users
    first_name: { type: String, default: null },
    last_name: { type: String, default: null },
    is_admin: { type: Boolean, default: false },
    avatar_url: { type: String, default: null },
    student_id: { type: String, default: null },
    phone_number: { type: String, default: null },
    course: { type: String, default: null },
    last_login: { type: Date, default: null },
    total_logins: { type: Number, default: 0 },
    google_id: { type: String, default: null, sparse: true },
    auth_provider: { type: String, enum: ['local', 'google'], default: 'local' },
    token_version: { type: Number, default: 0 },
    email_verified: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

UserSchema.index({ is_admin: 1 });
UserSchema.index({ created_at: -1 });

UserSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
});

UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

export default (mongoose.models.User as mongoose.Model<IUser>) || mongoose.model<IUser>("User", UserSchema);
