// backend/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // Basic Authentication
  name: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    lowercase: true
  },
  phone: { 
    type: String,
    trim: true
  },
  password: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    enum: ['student', 'instructor', 'admin'], 
    default: 'student' 
  },
  
  // Email Verification
  emailVerified: { 
    type: Boolean, 
    default: false 
  },
  emailOTP: { 
    type: String,
    select: false // Don't include in query results by default
  },
  emailOTPExpiry: { 
    type: Date,
    select: false // Don't include in query results by default
  },

  // Profile Information
  avatar: {
    url: String,
    public_id: String
  },
  dateOfBirth: Date,
  bio: {
    type: String,
    maxlength: 500
  },

  // Contact Information
  country: String,
  city: String,
  address: String,

  // Social Links
  socialLinks: {
    linkedin: { type: String, trim: true },
    twitter: { type: String, trim: true },
    github: { type: String, trim: true },
    website: { type: String, trim: true }
  },

  // Instructor/Student Fields
  expertise: [String],
  experience: {
    type: Number,
    min: 0
  },
  teachingPhilosophy: {
    type: String,
    maxlength: 1000
  },
  enrolledCourses: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Course' 
  }],

  // Password Reset
  resetToken: {
    type: String,
    select: false // Don't return this field in queries by default
  },
  resetTokenExpiry: {
    type: Date,
    select: false
  },
  
  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },

  // Timestamps
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('User', userSchema);