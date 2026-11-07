import mongoose, { Document, Schema } from 'mongoose';

/** Per-event ticket layout, set by an admin. Values are optional: missing means "use the default". */
export interface ITicketSettings {
  issuer: string | null;
  show_holder: boolean;
  show_student_id: boolean;
  show_course: boolean;
  student_id_label: string;
  course_label: string;
  note: string | null;
}

export interface IEvent extends Document {
  title: string;
  description: string;
  date: Date;
  location: string;
  price: number;
  category: string;
  image_url: string | null;
  is_free: boolean;
  is_published: boolean;
  /** Shows in the "Featured events" grid on the home page. */
  is_featured: boolean;
  /** Shows as one of the two spotlight cards over the hero image. */
  is_spotlight: boolean;
  created_by: string;
  max_seats_per_user: number;
  is_bookings_open: boolean;
  max_tickets_per_event: number | null;
  banned_users: string[];
  /** What the printed ticket shows. Older events have none; readers fall back to defaults. */
  ticket_settings?: ITicketSettings;
  created_at: Date;
  updated_at: Date;
}

const EventSchema = new Schema<IEvent>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    date: { type: Date, required: true },
    location: { type: String, required: true },
    price: { type: Number, required: true, default: 0 },
    category: { type: String, required: true },
    image_url: { type: String, default: null },
    is_free: { type: Boolean, default: false },
    is_published: { type: Boolean, default: false },
    is_featured: { type: Boolean, default: false },
    is_spotlight: { type: Boolean, default: false },
    created_by: { type: String, required: true },
    max_seats_per_user: { type: Number, default: 10 },
    is_bookings_open: { type: Boolean, default: true },
    max_tickets_per_event: { type: Number, default: null },
    banned_users: { type: [String], default: [] },
    ticket_settings: {
      type: new Schema(
        {
          issuer: { type: String, default: null },
          show_holder: { type: Boolean, default: true },
          show_student_id: { type: Boolean, default: true },
          show_course: { type: Boolean, default: true },
          student_id_label: { type: String, default: 'Student ID' },
          course_label: { type: String, default: 'Course' },
          note: { type: String, default: null },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

EventSchema.index({ is_published: 1, date: 1 });
EventSchema.index({ category: 1 });
EventSchema.index({ is_featured: 1, is_published: 1, date: 1 });
EventSchema.index({ is_spotlight: 1, is_published: 1, date: 1 });

export default (mongoose.models.Event as mongoose.Model<IEvent>) || mongoose.model<IEvent>("Event", EventSchema);
