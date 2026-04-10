const mongoose = require("mongoose");

const enrollmentSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // Store static user info for history
  studentName: {
    type: String,
    required: true,
  },

  studentEmail: {
    type: String,
    required: true,
  },

  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
  },

  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
  },

  paymentStatus: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
  },

  amount: {
    type: Number,
    default: 0,
  },

  enrolledAt: {
    type: Date,
    default: Date.now,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  updatedAt: {
    type: Date,
  },

  progress: { 
    type: Number, 
    default: 0,
    min: 0,
    max: 100
  },

  progressPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },

  completedLessons: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Course.lessons' 
  }],

  lastViewedLesson: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Course.lessons' 
  },
  
  // Track when student left the course
  leftAt: {
    type: Date,
    default: null
  },
  
  // Track enrollment status
  status: {
    type: String,
    enum: ['active', 'left', 'completed', 'refunded'],
    default: 'active'
  }
});

// Automatically update "updatedAt" before saving
enrollmentSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Add indexes for common queries
enrollmentSchema.index({ student: 1, status: 1 });
enrollmentSchema.index({ course: 1, status: 1 });
enrollmentSchema.index({ status: 1, leftAt: -1 });

module.exports = mongoose.model("Enrollment", enrollmentSchema);
