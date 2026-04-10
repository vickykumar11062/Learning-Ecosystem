const mongoose = require('mongoose');

const lessonProgressSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  lesson: { type: mongoose.Schema.Types.ObjectId, required: true },
  watchedPercent: { type: Number, default: 0 }, // for videos
  viewed: { type: Boolean, default: false }, // for pdfs/images
  completed: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
});

// Update the updatedAt timestamp on save
lessonProgressSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Add a compound index to ensure one progress document per student per lesson
lessonProgressSchema.index({ student: 1, lesson: 1 }, { unique: true });

// Method to update progress for both videos and documents
lessonProgressSchema.methods.updateProgress = async function(data) {
  if (data.percent !== undefined) this.watchedPercent = Math.min(100, Math.max(0, data.percent));
  if (data.viewed !== undefined) this.viewed = data.viewed;
  this.completed = (this.watchedPercent >= 90) || this.viewed;
  return this.save();
};

module.exports = mongoose.model('LessonProgress', lessonProgressSchema);
