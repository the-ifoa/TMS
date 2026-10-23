const mongoose = require('mongoose');

const attendanceSheetSchema = new mongoose.Schema(
  {
    company:       { type: String, required: true },
    training_type: { type: String, default: null },
    start_date:    { type: String, required: true },   // YYYY-MM-DD
    end_date:      { type: String, default: null },    // YYYY-MM-DD
    // hours: hours attended, typed by staff (null = worked out from the days
    // present). remarks: free text shown on the attendance record.
    participants: [{ first_name: String, last_name: String, hours: { type: Number, default: null }, remarks: { type: String, default: '' } }],
    // Legacy register: indices of present participants per day. Still written
    // (P and L count as present) so older screens keep working.
    records: [{
      date:    { type: String },        // YYYY-MM-DD
      present: { type: [Number] },      // indices of present participants
    }],
    // Day-by-day status per participant (index-aligned with participants):
    // P present · A absent · L late arrival / early departure · E excused.
    // A missing code means P — everyone is present unless marked otherwise.
    statuses: [{
      _id: false,
      date:  { type: String },
      codes: { type: [String] },
    }],
    // Details for the printed Training Attendance Record that the system
    // doesn't hold itself; filled in by staff.
    details: {
      course_title:     { type: String, default: '' },
      client:           { type: String, default: '' },
      delivery_mode:    { type: String, default: '' },
      venue:            { type: String, default: '' },
      scheduled_hours:  { type: Number, default: null },
      min_attendance:   { type: Number, default: 80 },
      instructor_name:  { type: String, default: '' },
      instructor_title: { type: String, default: '' },
      // Uploaded signature (PNG/JPEG data URL). Blank = use the instructor's
      // built-in signature, if any.
      instructor_signature: { type: String, default: '' },
      certified_on:     { type: String, default: '' },  // YYYY-MM-DD
      tagline:          { type: String, default: '' },
      form_ref:         { type: String, default: '' },
    },
    submitted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Airline', default: null },
    // true when the airline asked for this sheet by ticking "Track Attendance"
    // on an enrollment (the admin then fills it in).
    requested_by_airline: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => { ret.id = ret._id; delete ret.__v; return ret; },
    },
  }
);

module.exports = mongoose.model('AttendanceSheet', attendanceSheetSchema);
