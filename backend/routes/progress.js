const express = require("express");
const router = express.Router();
const LessonProgress = require("../models/LessonProgress");
const Enrollment = require("../models/Enrollment");
const Course = require("../models/Course");
const { ensureAuthenticated } = require("../middleware/auth");

// 📊 Get overall course progress
router.get("/overall/:courseId", ensureAuthenticated, async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.session.user.id;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ success: false, message: "Course not found" });

    const totalLessons = course.lessons.length || 0;
    const completedLessons = await LessonProgress.countDocuments({
      student: userId,
      course: courseId,
      completed: true,
    });

    const overallProgress = totalLessons
      ? Math.round((completedLessons / totalLessons) * 100)
      : 0;

    res.json({ success: true, overallProgress });
  } catch (err) {
    console.error("Error fetching overall progress:", err);
    res.status(500).json({ success: false, message: "Server error fetching progress" });
  }
});

// 🧠 Save or update lesson progress
router.post("/save", ensureAuthenticated, async (req, res) => {
  try {
    const { courseId, lessonId, viewed, percent } = req.body;
    const userId = req.session.user.id;

    // Progress save request initiated

    let progress = await LessonProgress.findOne({
      student: userId,
      course: courseId,
      lesson: lessonId,
    });

    if (!progress) {
      progress = new LessonProgress({
        student: userId,
        course: courseId,
        lesson: lessonId,
        watchedPercent: percent || (viewed ? 100 : 0),
        completed: viewed || (percent >= 90),
      });
      // Created new progress record
    } else {
      progress.watchedPercent = Math.max(progress.watchedPercent, percent || 0);
      progress.completed = viewed || progress.watchedPercent >= 90;
      // Updated existing progress
    }

    await progress.save();
    // Progress saved to database

    // 🔁 Update overall course progress for dashboard/cards
    const course = await Course.findById(courseId);
    if (course && course.lessons.length > 0) {
      const totalLessons = course.lessons.length;
      const completedLessons = await LessonProgress.countDocuments({
        student: userId,
        course: courseId,
        completed: true,
      });

      const overallProgress = Math.round((completedLessons / totalLessons) * 100);
      // Course progress calculated

      // Update Enrollment progress for dashboard/course cards
      const enrollmentUpdate = await Enrollment.findOneAndUpdate(
        { student: userId, course: courseId },
        { $set: { progressPercent: overallProgress } },
        { new: true }
      );
      
      // Enrollment progress updated

      return res.json({
        success: true,
        message: "Progress saved and dashboard updated",
        overallProgress,
      });
    }

    res.json({ success: true, message: "Progress saved (no lessons found)" });
  } catch (error) {
    console.error("Error saving progress:", error);
    res.status(500).json({ success: false, message: "Server error saving progress" });
  }
});

// 🧮 Manual refresh (optional, called from viewer.js)
router.post("/refresh", ensureAuthenticated, async (req, res) => {
  try {
    const { courseId } = req.body;
    const userId = req.session.user.id;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ success: false, message: "Course not found" });

    const totalLessons = course.lessons.length || 0;
    const completedLessons = await LessonProgress.countDocuments({
      student: userId,
      course: courseId,
      completed: true,
    });

    const overallProgress = totalLessons
      ? Math.round((completedLessons / totalLessons) * 100)
      : 0;

    await Enrollment.findOneAndUpdate(
      { student: userId, course: courseId },
      { $set: { progressPercent: overallProgress } },
      { new: true }
    );

    res.json({ success: true, overallProgress });
  } catch (err) {
    console.error("Error refreshing progress:", err);
    res.status(500).json({ success: false, message: "Server error refreshing progress" });
  }
});

module.exports = router;
