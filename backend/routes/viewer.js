// backend/routes/viewer.js
const express = require("express");
const router = express.Router();
const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
const LessonProgress = require("../models/LessonProgress");
const { ensureAuthenticated } = require("../middleware/auth");

// 🎬 Unified route that supports both /viewer/:courseId/:lessonId and ?lesson= format
router.get("/:courseId/:lessonId?", ensureAuthenticated, async (req, res) => {
  try {
    const courseId = req.params.courseId;
    const lessonId = req.params.lessonId || req.query.lesson;
    const userId = req.session.user._id || req.session.user.id;

    // Validate IDs
    if (!courseId || !lessonId) {
      req.flash("error_msg", "Invalid course or lesson.");
      return res.redirect("/courses");
    }

    // Fetch course
    const course = await Course.findById(courseId).lean();
    if (!course) {
      req.flash("error_msg", "Course not found.");
      return res.redirect("/courses");
    }

    // Find lesson
    const lesson = course.lessons.find(
      (l) => l._id.toString() === lessonId.toString()
    );
    if (!lesson) {
      req.flash("error_msg", "Lesson not found.");
      return res.redirect(`/courses/${course.slug}`);
    }

    // ✅ Check if user has access
    let accessAllowed = false;

    if (
      req.session.user.role === "instructor" &&
      course.instructor.toString() === userId.toString()
    ) {
      accessAllowed = true;
    } else {
      const enrollment = await Enrollment.findOne({
        student: userId,
        course: courseId,
        paymentStatus: "completed",
      });
      accessAllowed = !!enrollment;
    }

    if (!accessAllowed) {
      req.flash("error_msg", "You don’t have access to this lesson.");
      return res.redirect(`/courses/${course.slug}`);
    }

    // Save progress (mark as viewed and 100% complete)
    await LessonProgress.findOneAndUpdate(
      {
        student: userId,
        course: courseId,
        lesson: lessonId
      },
      {
        $set: {
          student: userId,
          course: courseId,
          lesson: lessonId,
          viewed: true,
          watchedPercent: 100,
          completed: true,
          lastWatched: new Date()
        }
      },
      { upsert: true, new: true }
    );
    
    // 🔁 Update overall course progress (same logic as progress save route)
    const totalLessons = course.lessons.length;
    if (totalLessons > 0) {
      const LessonProgress = require('../models/LessonProgress');
      const completedLessons = await LessonProgress.countDocuments({
        student: userId,
        course: courseId,
        completed: true,
      });

      const overallProgress = Math.round((completedLessons / totalLessons) * 100);

      // Update Enrollment progress for dashboard/course cards
      await Enrollment.findOneAndUpdate(
        { student: userId, course: courseId },
        { 
          $set: { 
            progressPercent: overallProgress,
            lastViewedLesson: lessonId 
          } 
        },
        { new: true }
      );
    } else {
      // Just update the last viewed lesson if no lessons exist
      await Enrollment.findOneAndUpdate(
        { student: userId, course: courseId },
        { $set: { lastViewedLesson: lessonId } },
        { new: true }
      );
    }

    // Find previous and next lessons
    const lessonIndex = course.lessons.findIndex(
      (l) => l._id.toString() === lessonId.toString()
    );
    const prevLesson = lessonIndex > 0 ? course.lessons[lessonIndex - 1] : null;
    const nextLesson = lessonIndex < course.lessons.length - 1 ? course.lessons[lessonIndex + 1] : null;

    // Render viewer
    res.render("viewer/viewer", {
      title: `${lesson.title} - ${course.title}`,
      course,
      lesson,
      prevLesson,
      nextLesson,
      session: req.session,
    });
  } catch (err) {
    console.error("Error loading viewer:", err);
    req.flash("error_msg", "Error loading lesson viewer.");
    res.redirect("/courses");
  }
});

// ✅ Track progress (e.g., watched/seen)
router.post("/progress/:courseId/:lessonId", ensureAuthenticated, async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const { progress } = req.body;
    const userId = req.session.user._id || req.session.user.id;

    await Enrollment.findOneAndUpdate(
      { student: userId, course: courseId },
      {
        $addToSet: { completedLessons: lessonId },
        $set: { progress: progress || 0, lastViewedLesson: lessonId },
      },
      { new: true, upsert: false }
    );

    res.json({ success: true, message: "Progress updated." });
  } catch (err) {
    console.error("Error updating progress:", err);
    res.status(500).json({ success: false, message: "Server error updating progress." });
  }
});

module.exports = router;
