import mongoose from 'mongoose';

// Layout is embedded: it is bounded (<= 12 sections / 5000 seats), always read with the venue,
// and never written concurrently. Per-event seat STATUS lives in EventSeat instead.
const seatSchema = new mongoose.Schema({ number: Number, label: String, x: Number, y: Number }, { _id: false });
const rowSchema = new mongoose.Schema({ label: String, seats: [seatSchema] }, { _id: false });
const sectionSchema = new mongoose.Schema({ key: String, name: String, labelY: Number, rows: [rowSchema] }, { _id: false });

const sectionSpecSchema = new mongoose.Schema(
  { name: String, rows: Number, seatsPerRow: Number, aisleAfter: [Number] },
  { _id: false }
);

const venueSchema = new mongoose.Schema(
  {
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    address: { type: String, required: true, trim: true, maxlength: 300 },
    city: { type: String, required: true, trim: true, maxlength: 60 },
    // What the organizer typed (so the editor can be re-opened) ...
    layoutSpec: { stageLabel: String, sections: [sectionSpecSchema] },
    // ... and what we generated from it.
    layout: {
      width: Number,
      height: Number,
      stageLabel: String,
      sections: [sectionSchema],
    },
    capacity: { type: Number, required: true },
  },
  { timestamps: true }
);

export const Venue = mongoose.model('Venue', venueSchema);
