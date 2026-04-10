const express = require("express");
const router = express.Router();
const { ensureAuthenticated } = require("../middleware/auth");
const Course = require("../models/Course");
const Certificate = require("../models/Certificate");
const Enrollment = require("../models/Enrollment");
const LessonProgress = require("../models/LessonProgress");
const { v4: uuidv4 } = require("uuid");

// 🎓 View all certificates for a student
router.get("/my-certificates", ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Find all certificates for the student with course details including thumbnail
    const certificates = await Certificate.find({ student: userId })
      .populate({
        path: 'course',
        select: 'title imageUrl thumbnail',
        populate: {
          path: 'instructor',
          select: 'name'
        }
      })
      .sort({ createdAt: -1 });

    // Format certificate data for the view
    const formattedCertificates = certificates.map(cert => {
      // Get the course image with proper fallback
      let courseImage = '/images/certificate-preview.jpg';
      if (cert.course) {
        // Check for thumbnail first, then imageUrl
        if (cert.course.thumbnail && cert.course.thumbnail.url) {
          courseImage = cert.course.thumbnail.url;
        } else if (cert.course.imageUrl) {
          courseImage = cert.course.imageUrl;
        }
      }

      return {
        id: cert._id,
        certificateId: cert.certificateId,
        courseId: cert.course?._id || null,
        courseName: cert.course?.title || 'Course',
        courseImage: courseImage,
        issueDate: cert.issuedAt || cert.createdAt || new Date(),
        downloadUrl: `/certificate/generate/${cert.course?._id || ''}`
      };
    });

    res.render("my-certificates", {
      title: "My Certificates",
      user: req.session.user,
      studentName: req.session.user.name, // Add student name to template data
      certificates: formattedCertificates,
      success_msg: req.flash("success_msg"),
      error_msg: req.flash("error_msg")
    });
  } catch (err) {
    console.error("Error fetching certificates:", err);
    req.flash("error_msg", "Error loading certificates. Please try again later.");
    res.redirect("/");
  }
});

// 🎓 Generate certificate when course completed
router.get("/generate/:courseId", ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const courseId = req.params.courseId;

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).send("Course not found");

    // Check if student completed all lessons
    const totalLessons = course.lessons.length;
    const completedLessons = await LessonProgress.countDocuments({
      student: userId,
      course: courseId,
      completed: true,
    });

    // Check if course is completed
    if (completedLessons < totalLessons || totalLessons === 0) {
      req.flash("error_msg", "Please complete the course to download your certificate.");
      return res.redirect(`/courses/${course.slug}`);
    }

    // Check if certificate access is enabled for this course
    if (!course.certificateAccess) {
      req.flash("error_msg", "Certificate access is not enabled for this course yet.");
      return res.redirect(`/courses/${course.slug}`);
    }

    // Check if already issued
    let cert = await Certificate.findOne({ student: userId, course: courseId });
    if (!cert) {
      cert = await Certificate.create({
        student: userId,
        course: courseId,
        certificateId: uuidv4().slice(0, 8).toUpperCase(),
      });
    }

    res.render("certificate", {
      title: "Certificate of Completion",
      studentName: req.session.user.name,
      courseTitle: course.title,
      issuedDate: new Date(cert.issuedAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      certificateId: cert.certificateId,
      instructorName: course.instructor ? course.instructor.name : "Instructor",
      download: false
    });
  } catch (err) {
    console.error("Error generating certificate:", err);
    res.status(500).send("Server error");
  }
});

// 📥 Download certificate as PDF
router.get("/:id/download", ensureAuthenticated, async (req, res) => {
  try {
    const certificate = await Certificate.findById(req.params.id)
      .populate({
        path: 'course',
        select: 'title instructor certificateAccess',
        populate: {
          path: 'instructor',
          select: 'name'
        }
      })
      .populate('student', 'name');

    if (!certificate) {
      req.flash('error_msg', 'Certificate not found');
      return res.redirect('/my-certificates');
    }

    // Check if the certificate belongs to the current user
    if (certificate.student._id.toString() !== req.session.user.id) {
      req.flash('error_msg', 'Unauthorized access to this certificate');
      return res.redirect('/my-certificates');
    }

    // Check if certificate access is enabled for this course
    if (!certificate.course.certificateAccess) {
      req.flash('error_msg', 'Certificate access is not enabled for this course');
      return res.redirect('/my-certificates');
    }

    // Generate a filename with course name and student name
    const courseName = certificate.course.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const studentName = certificate.student.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const date = new Date().toISOString().split('T')[0];
    const filename = `certificate_${courseName}_${studentName}_${date}.pdf`;

    // Set headers for file download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // In a real implementation, you would generate the PDF here
    // For now, we'll redirect to the view page with a download parameter
    res.redirect(`/certificate/${certificate._id}?download=true`);

  } catch (err) {
    console.error('Error downloading certificate:', err);
    req.flash('error_msg', 'Error downloading certificate');
    res.redirect('/my-certificates');
  }
});

// Update the existing certificate view route to handle downloads
router.get("/:id", ensureAuthenticated, async (req, res) => {
  try {
    const certificate = await Certificate.findById(req.params.id)
      .populate({
        path: 'course',
        select: 'title instructor certificateAccess',
        populate: {
          path: 'instructor',
          select: 'name'
        }
      })
      .populate('student', 'name');

    if (!certificate) {
      req.flash('error_msg', 'Certificate not found');
      return res.redirect('/my-certificates');
    }

    // Check if the certificate belongs to the current user
    if (certificate.student._id.toString() !== req.session.user.id) {
      req.flash('error_msg', 'Unauthorized access to this certificate');
      return res.redirect('/my-certificates');
    }

    // Check if certificate access is enabled for this course
    if (!certificate.course.certificateAccess) {
      req.flash('error_msg', 'Certificate access is not enabled for this course');
      return res.redirect('/my-certificates');
    }

    // If this is a download request, set appropriate headers
    if (req.query.download === 'true') {
      // In a real implementation, you would generate the PDF here
      // For now, we'll just render the certificate with a download button
      return res.render('certificate', {
        title: 'Certificate of Completion',
        studentName: certificate.student.name,
        courseTitle: certificate.course.title,
        issuedDate: new Date(certificate.issuedAt || certificate.createdAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric"
        }),
        certificateId: certificate.certificateId,
        instructorName: certificate.course.instructor?.name || 'Instructor',
        download: true
      });
    }

    // Regular view request
    res.render('certificate', {
      title: 'Certificate of Completion',
      studentName: certificate.student.name,
      courseTitle: certificate.course.title,
      issuedDate: new Date(certificate.issuedAt || certificate.createdAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric"
      }),
      certificateId: certificate.certificateId,
      instructorName: certificate.course.instructor?.name || 'Instructor'
    });

  } catch (err) {
    console.error('Error viewing certificate:', err);
    req.flash('error_msg', 'Error loading certificate');
    res.redirect('/my-certificates');
  }
});

module.exports = router;
