// backend/routes/courses.js
const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();
const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
const User = require("../models/User");
const { ensureInstructor } = require("../middleware/roles");
const { ensureAuthenticated } = require("../middleware/auth");
const multer = require("multer");
const { storage } = require("../config/cloudinary");
const upload = multer({ storage });
const { cloudinary } = require("../config/cloudinary");

// ---------------------------------------------
// GET /courses - List all available courses
// ---------------------------------------------
router.get("/", async (req, res) => {
  try {
    const courses = await Course.find({}).populate("instructor", "name");
    
    // Get user's enrollments if logged in
    let userData = null;
    if (req.session.user) {
      const enrollments = await Enrollment.find({
        student: req.session.user.id,
        paymentStatus: 'completed'
      }).lean();
      
      userData = {
        ...req.session.user,
        enrollments: enrollments,
        enrolledCourses: enrollments
          .filter(e => e.status === 'active' || e.status === undefined)
          .map(e => e.course.toString())
      };
    }
    
    res.render("courses", {
      title: "All Courses",
      courses,
      user: userData,
      success_msg: req.flash("success_msg"),
      error_msg: req.flash("error_msg"),
    });
  } catch (err) {
    console.error("Error fetching courses:", err);
    req.flash("error_msg", "Server error fetching courses");
    return await res.redirect("/");
  }
});

// ---------------------------------------------
// GET /courses/:slug - Course detail page (Fixed Progress)
// ---------------------------------------------
router.get("/:slug", ensureAuthenticated, async (req, res) => {
  try {
    const LessonProgress = require("../models/LessonProgress");

    let lessonProgress = {};   // 🔥 MUST BE OUTSIDE IF BLOCK

    const course = await Course.findOne({ slug: req.params.slug })
      .populate("instructor", "name");
    if (!course) {
      req.flash("error_msg", "Course not found");
      return res.redirect("/courses");
    }

    // Check enrollment
    let enrolled = false;
    let progressPercent = 0;
    const userId = req.session.user.id;

    if (req.session.user && req.session.user.role === "student") {
      const enrollment = await Enrollment.findOne({
        student: userId,
        course: course._id,
        paymentStatus: "completed",
        status: { $in: ["active", null] } // Consider both active and legacy enrollments (where status might be null)
      });

      enrolled = !!enrollment;

      // 🔹 Add "processing payment" warning if applicable
      const pending = await Enrollment.findOne({
        student: userId,
        course: course._id,
        paymentStatus: "pending",
      });
      if (pending) {
        req.flash("error_msg", "Your payment is still processing. Try again shortly.");
      }
    }

    // 🔹 If enrolled, calculate detailed lesson + overall progress
    if (enrolled && course.lessons && course.lessons.length > 0) {
      
      const progresses = await LessonProgress.find({
        student: userId,
        course: course._id,
      }).lean();

      const progressMap = {};
      progresses.forEach((p) => {
        progressMap[p.lesson.toString()] = {
          percent: p.watchedPercent || (p.completed ? 100 : 0),
          completed: p.completed,
        };
      });

      // 🔹 Attach progress data to each lesson
      const lessonsWithProgress = course.lessons.map((lesson) => {
        const progressData = progressMap[lesson._id.toString()] || {};
        const progressPercent = progressData.percent || 0;
        const isCompleted = progressData.completed || false;
        
        // Convert lesson to plain object if it's a mongoose document
        const lessonObj = lesson.toObject ? lesson.toObject() : lesson;
        
        return {
          ...lessonObj,
          progressPercent: progressPercent,
          isCompleted: isCompleted,
          _id: lessonObj._id || lessonObj.id,
          // Ensure we have a valid progress value between 0 and 100
          progress: Math.min(100, Math.max(0, progressPercent))
        };
      });
      
      // Update the course's lessons with progress data
      course.lessons = lessonsWithProgress;

      // 🔹 Compute overall course progress
      const totalLessons = course.lessons.length;
      const completedCount = course.lessons.filter((l) => l.isCompleted).length;
      progressPercent = Math.round((completedCount / totalLessons) * 100);
      
      // Debug: First lesson progress data logged
      if (course.lessons.length > 0) {
        // First lesson progress processed
      }

      // 🔥 BUILD correct lessonProgress for EJS
      progresses.forEach(p => {
        lessonProgress[p.lesson.toString()] = {
          progress: p.watchedPercent || 0,
          completed: p.completed || false
        };
      });
    }

    res.render("course_detail", {
      title: course.title,
      course,
      enrolled,
      progressPercent,
      lessonProgress,  // 🔥 THIS WAS MISSING - Now added
      success_msg: req.flash("success_msg"),
      error_msg: req.flash("error_msg"),
    });
  } catch (err) {
    console.error("Error loading course:", err);
    req.flash("error_msg", "Server error");
    return await res.redirect("/courses");
  }
});

// ---------------------------------------------
// GET /courses/instructor/dashboard
// ---------------------------------------------
router.get(
  "/instructor/dashboard",
  ensureAuthenticated,
  ensureInstructor,
  async (req, res) => {
    try {
      const courses = await Course.find({ instructor: req.session.user.id }).sort({ createdAt: -1 });
      
      // Get flash messages from session
      const success_msg = req.session.flash?.success || [];
      const error_msg = req.session.flash?.error || [];
      
      // Clear flash after reading
      if (req.session.flash) {
        delete req.session.flash;
      }

      res.render("instructor/dashboard", {
        title: "Instructor Dashboard",
        courses,
        success_msg: success_msg.length > 0 ? success_msg : null,
        error_msg: error_msg.length > 0 ? error_msg : null,
      });
    } catch (err) {
      console.error("Error fetching instructor courses:", err);
      setFlash(req, 'error', 'Server error');
      return res.redirect("/");;
    }
  }
);

// ---------------------------------------------
// GET /courses/instructor/create
// ---------------------------------------------
router.get(
  "/instructor/create",
  ensureAuthenticated,
  ensureInstructor,
  (req, res) => {
    res.render("instructor/create_course", {
      title: "Create New Course",
    });
  }
);

// ---------------------------------------------
// POST /courses/instructor/create
// With Cloudinary thumbnail upload
// ---------------------------------------------
router.post(
  "/instructor/create",
  ensureAuthenticated,
  ensureInstructor,
  upload.single("thumbnail"),
  async (req, res) => {
    try {
      const { title, description, price, featured } = req.body;
      const slug = title.toLowerCase().trim().replace(/\s+/g, "-");

      const existing = await Course.findOne({ slug });
      if (existing) {
        req.flash("error_msg", "Course title already exists.");
        return res.redirect("/courses/instructor/create");
      }

      // Handle thumbnail upload if provided
      let thumbnailData = {};
      if (req.file) {
        thumbnailData = {
          url: req.file.path,
          public_id: req.file.filename
        };
      }

      const newCourse = new Course({
        title,
        description,
        slug,
        price,
        featured: featured === 'on', // Convert checkbox value to boolean
        instructor: req.session.user.id,
        thumbnail: thumbnailData,
      });

      await newCourse.save();

      req.flash("success_msg", "✅ Course created successfully!");
      res.redirect("/courses/instructor/dashboard");
    } catch (err) {
      console.error("Error creating course:", err);
      req.flash("error_msg", "Server error creating course");
      return await res.redirect("/courses/instructor/create");
    }
  }
);

// ---------------------------------------------
// GET /courses/instructor/edit/:id
// ---------------------------------------------
router.get(
  "/instructor/edit/:id",
  ensureAuthenticated,
  ensureInstructor,
  async (req, res) => {
    try {
      const course = await Course.findById(req.params.id);
      if (!course || course.instructor.toString() !== req.session.user.id) {
        req.flash("error_msg", "Unauthorized access.");
        return res.redirect("/courses/instructor/dashboard");
      }

      res.render("instructor/edit_course", {
        title: "Edit Course",
        course,
      });
    } catch (err) {
      console.error("Error loading edit course:", err);
      req.flash("error_msg", "Server error loading course.");
      res.redirect("/courses/instructor/dashboard");
    }
  }
);

// ---------------------------------------------
// PUT /courses/instructor/edit/:id
// Update existing course with optional thumbnail update
// ---------------------------------------------
router.put(
  "/instructor/edit/:id",
  ensureAuthenticated,
  ensureInstructor,
  upload.single("thumbnail"),
  async (req, res) => {
    try {
      const { title, description, price, featured, removeThumbnail, certificateAccess } = req.body;
      const course = await Course.findById(req.params.id);
      
      if (!course) {
        req.flash("error_msg", "Course not found");
        return res.redirect("/courses/instructor/dashboard");
      }
      
      // Check if user is the course instructor
      if (course.instructor.toString() !== req.session.user.id) {
        req.flash("error_msg", "Not authorized to edit this course");
        return res.redirect("/courses/instructor/dashboard");
      }
      
      // Handle thumbnail update if new file is uploaded
      if (req.file) {
        try {
          // Delete old thumbnail from Cloudinary if it exists and is not the default
          if (course.thumbnail && course.thumbnail.public_id && !course.thumbnail.public_id.startsWith('default-')) {
            await cloudinary.uploader.destroy(course.thumbnail.public_id);
          }
          
          // Set new thumbnail
          course.thumbnail = {
            url: req.file.path,
            public_id: req.file.filename
          };
        } catch (uploadErr) {
          console.error('Error uploading thumbnail:', uploadErr);
          req.flash('error_msg', 'Error uploading thumbnail');
          return res.redirect('back');
        }
      } 
      // Handle thumbnail removal if requested
      else if (removeThumbnail === 'true') {
        try {
          // Delete old thumbnail from Cloudinary if it exists and is not the default
          if (course.thumbnail && course.thumbnail.public_id && !course.thumbnail.public_id.startsWith('default-')) {
            await cloudinary.uploader.destroy(course.thumbnail.public_id);
          }
          
          // Reset to default thumbnail
          course.thumbnail = {
            url: Course.DEFAULT_THUMBNAIL,
            public_id: null
          };
        } catch (deleteErr) {
          console.error('Error removing thumbnail:', deleteErr);
          req.flash('error_msg', 'Error removing thumbnail');
          return res.redirect('back');
        }
      }

      // Update course details
      course.title = title;
      course.description = description;
      course.price = price;
      course.featured = featured === 'on'; // Convert checkbox value to boolean
      // Handle certificate access - will be 'on' when checked, undefined when unchecked
      course.certificateAccess = certificateAccess === 'on';

      try {
        await course.save();
        req.flash('success_msg', 'Course updated successfully!');
        res.redirect(`/courses/${course.slug}`);
      } catch (err) {
        console.error('Error saving course:', err);
        req.flash('error_msg', 'Error updating course');
        return res.redirect('back');
      }
    } catch (err) {
      console.error("Error updating course:", err);
      req.flash("error_msg", "Server error updating course.");
      return await res.redirect("/courses/instructor/dashboard");
    }
  }
);

// ---------------------------------------------
// DELETE /courses/instructor/delete/:id - Delete a course
// ---------------------------------------------
router.delete(
  "/instructor/delete/:id",
  ensureAuthenticated,
  ensureInstructor,
  async (req, res) => {
    const isAjax = req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest';
    const sendJson = (status, data) => isAjax ? res.status(status).json(data) : res.redirect('/courses/instructor/dashboard');
    
    try {
      // Finding course with ID
      const course = await Course.findById(req.params.id);
      
      if (!course) {
        return sendJson(404, { success: false, message: 'Course not found' });
      }
      
      // Course found, proceeding with deletion
      // Check if the current user is the instructor of the course
      if (course.instructor.toString() !== req.session.user.id) {
        return sendJson(403, { 
          success: false, 
          message: 'Unauthorized: You can only delete your own courses' 
        });
      }

      // Deleting lesson resources from Cloudinary
      // Delete all lesson resources from Cloudinary
      for (const [index, lesson] of course.lessons.entries()) {
        if (lesson.resource && lesson.resource.public_id) {
          try {
            await cloudinary.uploader.destroy(lesson.resource.public_id);
          } catch (cloudinaryErr) {
            // Error deleting resource from Cloudinary
            // Continue with deletion even if Cloudinary deletion fails
          }
        }
      }

      // Delete thumbnail from Cloudinary if exists
      if (course.thumbnail && course.thumbnail.public_id) {
        try {
          // Deleting thumbnail from Cloudinary
          await cloudinary.uploader.destroy(course.thumbnail.public_id);
        } catch (cloudinaryErr) {
          // Continue with deletion even if Cloudinary deletion fails
        }
      }

      // Deleting enrollments
      // Delete all enrollments for this course
      const enrollments = await Enrollment.deleteMany({ course: req.params.id });

      // Deleting course from database
      // Finally, delete the course
      await Course.findByIdAndDelete(req.params.id);
      if (isAjax) {
        return res.json({ 
          success: true, 
          message: 'Course deleted successfully' 
        });
      }
      
      // For regular form submission
      req.flash("success_msg", "🗑️ Course deleted successfully!");
      return res.redirect("/courses/instructor/dashboard");
      
    } catch (err) {
      console.error("Error in delete course route:", err);
      
      if (isAjax) {
        return res.status(500).json({ 
          success: false, 
          message: 'Server error: ' + (err.message || 'Unknown error')
        });
      }
      
      req.flash("error_msg", "Server error deleting course: " + (err.message || 'Unknown error'));
      return res.redirect("/courses/instructor/dashboard");
    }
  }
);

// ---------------------------------------------
// DELETE /courses/instructor/delete-lesson/:courseId/:lessonId
// ---------------------------------------------
router.delete(
  "/instructor/delete-lesson/:courseId/:lessonId",
  ensureAuthenticated,
  ensureInstructor,
  async (req, res) => {
    try {
      const { courseId, lessonId } = req.params;
      const course = await Course.findById(courseId);
      
      // Check if course exists and user is the instructor
      if (!course || course.instructor.toString() !== req.session.user.id) {
        return res.status(403).json({ 
          success: false, 
          message: 'Unauthorized: You can only delete lessons from your own courses' 
        });
      }

      // Find the lesson to get its resource information
      const lesson = course.lessons.id(lessonId);
      if (!lesson) {
        return res.status(404).json({ 
          success: false, 
          message: 'Lesson not found' 
        });
      }

      // Delete the resource from Cloudinary if it exists
      if (lesson.resource && lesson.resource.public_id) {
        try {
          await cloudinary.uploader.destroy(lesson.resource.public_id);
        } catch (cloudinaryErr) {
          console.error('Error deleting resource from Cloudinary:', cloudinaryErr);
          // Continue with deletion even if Cloudinary deletion fails
        }
      }

      // Remove the lesson from the course
      course.lessons = course.lessons.filter(
        l => l._id.toString() !== lessonId
      );

      await course.save();

      // Return success response
      res.json({ 
        success: true, 
        message: 'Lesson deleted successfully' 
      });
    } catch (err) {
      console.error('Error deleting lesson:', err);
      res.status(500).json({ 
        success: false, 
        message: 'Server error while deleting lesson' 
      });
    }
  }
);

// ---------------------------------------------
// GET /courses/student/dashboard
// ---------------------------------------------
router.get("/student/dashboard", ensureAuthenticated, async (req, res) => {
  try {
    const LessonProgress = require('../models/LessonProgress');
    
    const enrollments = await Enrollment.find({
      student: req.session.user.id,
      paymentStatus: 'completed',
      status: { $in: ['active', null] }  // Include both active and legacy enrollments
    }).populate({
      path: 'course',
      populate: { path: 'instructor', select: 'name' }
    });
    
    // Enrollments found for user

    // Process each course to add progress information
    const courses = [];
    let totalProgress = 0;
    let completedCourses = 0;
    
    for (const en of enrollments) {
      if (!en.course) continue; // Skip if course is not found
      
      const course = en.course.toObject();
      const lessons = course.lessons?.length || 0;
      let progressPercent = 0;
      let lastAccessed = null;
      let allLessonsCompleted = false;
      
      if (lessons > 0) {
        // Get all lesson IDs for this course
        const lessonIds = course.lessons.map(l => l._id.toString());
        
        // Get all lesson progresses for this course and student
        const [lessonProgresses, lastProgress] = await Promise.all([
          LessonProgress.find({
            student: req.session.user.id,
            course: course._id,
            lesson: { $in: lessonIds }
          }),
          LessonProgress.findOne({
            student: req.session.user.id,
            course: course._id,
            lesson: { $in: lessonIds }
          }).sort({ updatedAt: -1 })
        ]);
        
        // Create a map of completed lessons
        const completedLessons = new Set(
          lessonProgresses
            .filter(lp => lp.completed)
            .map(lp => lp.lesson.toString())
        );
        
        // Count completed lessons that are still in the course
        const completed = lessonIds.filter(id => completedLessons.has(id)).length;
        
        // Calculate progress percentage
        progressPercent = Math.min(100, Math.round((completed / lessons) * 100));
        
        // Check if all lessons are completed
        allLessonsCompleted = (completed === lessons) && (lessons > 0);
        
        // Progress calculated
        
        // Add completed lessons count to course object
        course.completedLessons = completed;
        
        // If there's progress data, find the last accessed lesson
        if (lastProgress) {
          const lastLesson = course.lessons.find(l => l._id.toString() === lastProgress.lesson.toString());
          if (lastLesson) {
            course.lastAccessedLesson = lastLesson;
            course.lastAccessedAt = lastProgress.updatedAt;
          }
        }
      }
      
      // Add course completion status
      course.progressPercent = progressPercent || 0;
      course.allLessonsCompleted = allLessonsCompleted;
      totalProgress += progressPercent;
      
      // A course is considered completed if all lessons are completed
      if (allLessonsCompleted) {
        completedCourses++;
      }
      
      // Sort courses by last accessed (most recent first)
      courses.push(course);
    }
    
    // Sort courses by last accessed date (most recent first)
    courses.sort((a, b) => {
      const dateA = a.lastAccessedAt ? new Date(a.lastAccessedAt) : new Date(0);
      const dateB = b.lastAccessedAt ? new Date(b.lastAccessedAt) : new Date(0);
      return dateB - dateA;
    });
    
    const totalCourses = courses.length;
    const averageProgress = totalCourses ? Math.round(totalProgress / totalCourses) : 0;

    res.render("student/dashboard", {
      title: "My Learning Dashboard",
      courses,
      totalCourses,
      averageProgress,
      completedCourses,
      success_msg: req.flash("success_msg"),
      error_msg: req.flash("error_msg"),
    });
  } catch (err) {
    console.error("Error loading student dashboard:", err);
    req.flash("error_msg", "Server error loading dashboard");
    res.redirect("/");
  }
});

// ---------------------------------------------
// ✅ FIXED: GET /courses/instructor/earnings
// Now properly handles deleted student accounts
// ---------------------------------------------
router.get(
  "/instructor/earnings",
  ensureAuthenticated,
  ensureInstructor,
  async (req, res) => {
    try {
      // First get all courses with their prices
      const courses = await Course.find({ instructor: req.session.user.id }, 'title thumbnail price').lean();
      
      // Create a map of course IDs to course data for quick lookup
      const courseMap = {};
      courses.forEach(course => {
        courseMap[course._id] = {
          title: course.title,
          thumbnail: course.thumbnail?.url || "/images/default-course.jpg",
          price: course.price || 0
        };
      });
      
      if (courses.length === 0) {
        return res.render("instructor/earnings", {
          title: "Earnings Dashboard",
          totalEarnings: 0,
          currentMonthEarnings: 0,
          monthlyData: [],
          courseEarnings: [],
          transactions: [],
        });
      }

      const courseIds = courses.map(c => c._id);
      
      // Get all enrollments first
      const enrollments = await Enrollment.find({
        course: { $in: courseIds },
        paymentStatus: "completed",
      })
        .populate("course", "title thumbnail")
        .sort({ enrolledAt: -1 })
        .lean();

      // Get all student IDs from enrollments
      const studentIds = [...new Set(enrollments.map(e => e.student).filter(Boolean))];
      
      // Check which students still exist
      const existingStudents = new Set();
      if (studentIds.length > 0) {
        const users = await User.find({ _id: { $in: studentIds } }, '_id');
        users.forEach(user => existingStudents.add(user._id.toString()));
      }

      let totalEarnings = 0;
      const monthlyEarnings = {};
      const courseEarningsMap = {};
      const transactions = [];

      for (const e of enrollments) {
        const amount = (e.amount || 0) / 100;
        const courseId = e.course?._id?.toString();
        const month = e.enrolledAt
          ? e.enrolledAt.toISOString().substring(0, 7)
          : new Date().toISOString().substring(0, 7);

        // Aggregate course earnings
        if (!courseEarningsMap[courseId]) {
          const courseInfo = courseMap[courseId] || {
            title: e.course?.title || "Untitled",
            thumbnail: e.course?.thumbnail?.url || "/images/default-course.jpg",
            price: 0
          };
          
          courseEarningsMap[courseId] = {
            _id: courseId,
            title: courseInfo.title,
            thumbnail: courseInfo.thumbnail,
            price: courseInfo.price, // Use the price from our course map
            enrollments: 0,
            earnings: 0,
            students: []
          };
        }
        
        // Check if student exists AND is still enrolled (not left)
        const studentExists = e.student && existingStudents.has(e.student.toString());
        const hasLeft = e.status === 'left' || e.status === 'cancelled';
        
        courseEarningsMap[courseId].students.push({
          _id: (studentExists && !hasLeft) ? e.student : null,  // Set to null if deleted or left
          studentName: e.studentName || "Unknown Student",
          studentEmail: e.studentEmail || "N/A",
          amount: amount,
          enrolledAt: e.enrolledAt,
          leftAt: e.leftAt,
          status: hasLeft ? 'left' : (studentExists ? 'active' : 'deleted')
        });
        
        courseEarningsMap[courseId].enrollments = courseEarningsMap[courseId].students.length;
        courseEarningsMap[courseId].earnings += amount;

        totalEarnings += amount;
        monthlyEarnings[month] = (monthlyEarnings[month] || 0) + amount;
        
        // Push to transaction history with stored student data
        transactions.push({
          courseTitle: e.course?.title || "Untitled Course",
          studentName: e.studentName || "Unknown Student", // From enrollment record
          studentEmail: e.studentEmail || "N/A", // From enrollment record
          studentId: studentExists ? e.student : null, // Set to null if student doesn't exist
          amount,
          enrolledAt: e.enrolledAt
            ? new Date(e.enrolledAt).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "Unknown Date",
          paymentId: e.razorpayPaymentId || "N/A",
          orderId: e.order?.toString() || "N/A",
        });
      }

      const courseEarnings = Object.values(courseEarningsMap).sort(
        (a, b) => b.earnings - a.earnings
      );

      const monthlyData = Object.entries(monthlyEarnings)
        .map(([month, amount]) => ({
          month,
          amount,
          formattedMonth: new Date(month + "-01").toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          }),
        }))
        .sort((a, b) => new Date(a.month) - new Date(b.month));

      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const currentMonthEarnings = monthlyEarnings[monthKey] || 0;

      res.render("instructor/earnings", {
        title: "Earnings Dashboard",
        totalEarnings,
        currentMonthEarnings,
        monthlyData: monthlyData,
        courseEarnings,
        transactions,
      });
    } catch (err) {
      // Log error to error tracking system in production
      process.stderr.write(`Error fetching earnings: ${err.message}\n`);
      req.flash("error_msg", "Error loading earnings data");
      res.redirect("/courses/instructor/dashboard");
    }
  }
);

// ---------------------------------------------
// ✅ FIXED: DELETE /courses/instructor/remove-student/:courseId/:studentId
// Now handles both active and deleted student accounts
// ---------------------------------------------
router.delete(
  "/instructor/remove-student/:courseId/:studentId",
  ensureAuthenticated,
  ensureInstructor,
  async (req, res) => {
    try {
      const { courseId, studentId } = req.params;
      const instructorId = req.session.user.id;

      // Verify the course exists and belongs to this instructor
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ 
          success: false, 
          message: 'Course not found' 
        });
      }

      if (course.instructor.toString() !== instructorId) {
        // Security: Unauthorized attempt logged
        return res.status(403).json({ 
          success: false, 
          message: 'Unauthorized: You can only remove students from your own courses' 
        });
      }

      // ✅ CRITICAL FIX: Handle both cases - active user or deleted user (null)
      
      let enrollment;
      
      if (studentId === 'null' || !studentId) {
        // Student account was deleted - find enrollment by course only
        // Removing deleted student from course
        enrollment = await Enrollment.findOneAndDelete({
          student: null, // Student is null because account was deleted
          course: courseId,
          paymentStatus: "completed",
        });
      } else {
        // Student account still exists - find by both student and course
        // Removing active student from course
        enrollment = await Enrollment.findOneAndDelete({
          student: studentId,
          course: courseId,
          paymentStatus: "completed",
        });
      }

      if (!enrollment) {
        // No enrollment found for removal
        return res.status(404).json({ 
          success: false, 
          message: 'Enrollment not found or already removed' 
        });
      }
      
      // Student successfully removed from course

      // ✅ Only update User if student ID exists (account not deleted)
      if (studentId && studentId !== 'null') {
        await User.findByIdAndUpdate(studentId, { 
          $pull: { enrolledCourses: courseId } 
        });
      }

      // ✅ Update Course - remove student reference and enrollment
      const updateFields = { 
        $pull: { enrollments: enrollment._id }
      };
      
      // Only pull from students array if studentId exists
      if (studentId && studentId !== 'null') {
        updateFields.$pull.students = studentId;
      }
      
      await Course.findByIdAndUpdate(courseId, updateFields);

      res.json({ 
        success: true, 
        message: 'Enrollment removed successfully' 
      });
    } catch (err) {
      console.error("Error removing student:", err);
      res.status(500).json({ 
        success: false, 
        message: 'Server error: ' + err.message
      });
    }
  }
);

// ---------------------------------------------
// GET /courses/instructor/debug-enrollments
// Debug route to check enrollment data
// ---------------------------------------------
router.get(
  "/instructor/debug-enrollments",
  ensureAuthenticated,
  ensureInstructor,
  async (req, res) => {
    try {
      // Get all courses by this instructor
      const courses = await Course.find({ instructor: req.session.user.id });
      const courseIds = courses.map(course => course._id);

      // Get ALL enrollments (not just completed)
      const allEnrollments = await Enrollment.find({
        course: { $in: courseIds }
      }).populate('course', 'title price');

      // Get completed enrollments
      const completedEnrollments = await Enrollment.find({
        course: { $in: courseIds },
        paymentStatus: 'completed'
      }).populate('course', 'title price');

      res.json({
        totalCourses: courses.length,
        totalEnrollments: allEnrollments.length,
        completedEnrollments: completedEnrollments.length,
        allEnrollments: allEnrollments.map(e => ({
          _id: e._id,
          student: e.studentName || 'Unknown',
          course: e.course ? e.course.title : 'Unknown',
          paymentStatus: e.paymentStatus,
          amount: e.amount,
          amountInRupees: e.amount ? (e.amount / 100).toFixed(2) : 0,
          enrolledAt: e.enrolledAt,
          createdAt: e.createdAt
        })),
        completedEnrollments: completedEnrollments.map(e => ({
          _id: e._id,
          student: e.student ? e.student.name : 'Unknown',
          course: e.course ? e.course.title : 'Unknown',
          paymentStatus: e.paymentStatus,
          amount: e.amount,
          amountInRupees: e.amount ? (e.amount / 100).toFixed(2) : 0,
          enrolledAt: e.enrolledAt
        }))
      });
    } catch (err) {
      console.error("Debug error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------------------------------------------
// POST /courses/instructor/fix-enrollments
// One-time fix for existing enrollments with missing amounts
// ---------------------------------------------
// ==================================
// Wishlist Routes - Coming Soon
// ==================================
router.get("/wishlist", ensureAuthenticated, (req, res) => {
  return res.status(200).json({ message: "Wishlist feature is coming soon!" });
});

// ==================================
// Shopping Cart Routes - Coming Soon
// ==================================
router.get("/cart", ensureAuthenticated, (req, res) => {
  return res.status(200).json({ message: "Shopping cart feature is coming soon!" });
});

// ==================================
// Instructor Routes
// ==================================
router.post(
  "/instructor/fix-enrollments",
  ensureAuthenticated,
  ensureInstructor,
  async (req, res) => {
    try {
      const courses = await Course.find({ instructor: req.session.user.id });
      const courseIds = courses.map(course => course._id);

      // Find enrollments with missing or zero amounts
      const enrollmentsToFix = await Enrollment.find({
        course: { $in: courseIds },
        $or: [
          { amount: { $exists: false } },
          { amount: 0 },
          { amount: null }
        ]
      }).populate('course', 'price');

      let fixed = 0;
      for (const enrollment of enrollmentsToFix) {
        if (enrollment.course && enrollment.course.price) {
          // Set amount in paise
          enrollment.amount = Math.round(enrollment.course.price * 100);
          await enrollment.save();
          fixed++;
        }
      }

      res.json({
        success: true,
        message: `Fixed ${fixed} enrollments`,
        details: {
          totalFound: enrollmentsToFix.length,
          fixed: fixed
        }
      });
    } catch (err) {
      console.error("Fix error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------------------------------------------
// ---------------------------------------------
// FIXED: DELETE /courses/leave/:id
// ---------------------------------------------
router.delete("/leave/:id", ensureAuthenticated, async (req, res) => {
  // Leave course request initiated
  
  try {
    if (!req.session.user || req.session.user.role !== "student") {
      // Access denied: Only students can leave courses
      req.flash("error_msg", "Only students can leave courses");
      return res.redirect("/courses");
    }

    const courseId = req.params.id;
    const userId = req.session.user.id;
    const LessonProgress = require("../models/LessonProgress");

    // 1. Looking for active enrollment...
    const enrollment = await Enrollment.findOne({
  student: userId,
  course: courseId,
  paymentStatus: "completed",
  status: { $in: ["active", null] }
});


    if (!enrollment) {
      // No active enrollment found for this course
      req.flash("error_msg", "You are not enrolled in this course.");
      return res.redirect("/courses/student/dashboard");
    }
    // Enrollment found

    // 2. Updating enrollment status to 'left'...
    enrollment.status = "left";
    enrollment.leftAt = new Date();
    enrollment.progress = 0;
    enrollment.completedLessons = [];
    enrollment.lastViewedLesson = null;
    await enrollment.save();
    // Enrollment updated successfully

    // 3. Deleting lesson progress...
    const deleteResult = await LessonProgress.deleteMany({
      student: userId,
      course: courseId
    });
    // Progress records deleted

    // 4. Updating user's enrolled courses...
    const userUpdate = await User.findByIdAndUpdate(userId, {
      $pull: { enrolledCourses: courseId }
    }, { new: true });
    // User updated

    // 5. Updating course references...
    const courseUpdate = await Course.findByIdAndUpdate(
      courseId, 
      { 
        $pull: { 
          students: userId,
          enrollments: enrollment._id 
        } 
      },
      { new: true }
    );
    // Course updated

    // 6. Course leave process completed successfully
    req.flash(
      "success_msg",
      "You successfully left the course. All progress has been reset."
    );
    return res.redirect("/courses/student/dashboard");
  } catch (err) {
    console.error('--- ERROR IN LEAVE COURSE ROUTE ---');
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    });
    req.flash("error_msg", "Server error while leaving course. Please try again.");
    return res.redirect("/courses/student/dashboard");
  }
});


// Toggle certificate access for a course
router.post('/:id/toggle-certificate-access', ensureAuthenticated, ensureInstructor, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Check if the current user is the course instructor
    if (course.instructor.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Toggle the certificate access
    course.certificateAccess = !course.certificateAccess;
    await course.save();

    res.json({ 
      success: true, 
      certificateAccess: course.certificateAccess,
      message: `Certificate access ${course.certificateAccess ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    console.error('Error toggling certificate access:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
