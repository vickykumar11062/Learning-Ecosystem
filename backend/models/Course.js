// backend/models/Course.js
const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
  title: String,
  description: String,
  resource: {
    url: String,
    public_id: String
  }, // Cloudinary details
  resourceType: String, // video | pdf | image
  createdAt: { type: Date, default: Date.now }
});

// Default thumbnail path (relative to the public directory)
const DEFAULT_THUMBNAIL = '/images/course_thumbnail.png';

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: String,
  price: { type: Number, default: 0 },
  thumbnail: {
    url: { 
      type: String,
      default: DEFAULT_THUMBNAIL
    },
    public_id: { 
      type: String,
      default: null 
    }
  },
  instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  featured: { type: Boolean, default: false },
  lessons: [lessonSchema],

  // 🆕 Add this field to store student references
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Certificate access control
  certificateAccess: { 
    type: Boolean, 
    default: false 
  },

  // Existing enrollments reference (for payments)
  enrollments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment' }],

  rating: { type: Number, default: 0 },
  reviews: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: Number,
    comment: String
  }],

  createdAt: { type: Date, default: Date.now }
});

// Add static property for default thumbnail
courseSchema.statics.DEFAULT_THUMBNAIL = DEFAULT_THUMBNAIL;

module.exports = mongoose.model('Course', courseSchema);
