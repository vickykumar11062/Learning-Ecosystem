// backend/routes/upload.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const { storage, cloudinary } = require("../config/cloudinary");
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max
});

const { ensureAuthenticated } = require("../middleware/auth");
const { ensureInstructor } = require("../middleware/roles");
const Course = require("../models/Course");

// ---------------------------------------------
// GET /upload/:courseId → upload form
// ---------------------------------------------
router.get("/:courseId", ensureAuthenticated, ensureInstructor, async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course || course.instructor.toString() !== req.session.user.id) {
      req.flash("error_msg", "Unauthorized access");
      return res.redirect("/courses/instructor/dashboard");
    }

    res.render("instructor/upload_material", {
      title: "Upload Course Materials",
      course,
    });
  } catch (err) {
    console.error("Upload form error:", err);
    req.flash("error_msg", "Server error");
    res.redirect("/courses/instructor/dashboard");
  }
});

// ---------------------------------------------
// POST /upload/:courseId → upload file
// ---------------------------------------------
router.post("/:courseId", ensureAuthenticated, ensureInstructor, upload.single("file"), async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course || course.instructor.toString() !== req.session.user.id) {
      req.flash("error_msg", "Unauthorized upload");
      return res.redirect("/courses/instructor/dashboard");
    }

    const file = req.file;
    if (!file) {
      req.flash("error_msg", "Please select a file to upload");
      return res.redirect(`/upload/${req.params.courseId}`);
    }

    let resourceType = "image";
    if (file.mimetype.startsWith("video")) resourceType = "video";
    else if (file.mimetype.includes("pdf")) resourceType = "pdf";

  let fileUrl = file.path;

// Force inline viewing for PDFs
if (resourceType === "pdf") {
  fileUrl = fileUrl.replace('/upload/', '/upload/fl_attachment:false/');
}



    course.lessons.push({
      title: req.body.title || "Untitled Resource",
      description: req.body.description || "",
      resource: {
        url: fileUrl,
        public_id: file.filename,
      },
      resourceType,
    });

    await course.save();
    req.flash("success_msg", "Material uploaded successfully!");
    res.redirect(`/courses/${course.slug}`);
  } catch (err) {
    console.error("Upload error:", err);
    req.flash("error_msg", "Server error uploading material");
    res.redirect("/courses/instructor/dashboard");
  }
});

// ---------------------------------------------
// ✅ DELETE /upload/delete/:courseId/:lessonId
// ---------------------------------------------
// DELETE /upload/delete/:courseId/:lessonId
router.delete("/delete/:courseId/:lessonId", ensureAuthenticated, ensureInstructor, async (req, res) => {
  try {
    const { courseId, lessonId } = req.params;
    const course = await Course.findById(courseId);

    if (!course || course.instructor.toString() !== req.session.user.id) {
      req.flash("error_msg", "Unauthorized delete action");
      return res.redirect("/courses/instructor/dashboard");
    }

    // Find lesson index
    const lesson = course.lessons.id(lessonId);
    if (!lesson) {
      req.flash("error_msg", "Material not found");
      return res.redirect(`/courses/${course.slug}`);
    }

    // Delete file from Cloudinary
    if (lesson.resource && lesson.resource.public_id) {
      try {
        await cloudinary.uploader.destroy(lesson.resource.public_id, {
          resource_type:
            lesson.resourceType === "video"
              ? "video"
              : lesson.resourceType === "pdf"
              ? "raw"
              : "image",
        });
      } catch (err) {
        console.warn("⚠️ Cloudinary deletion failed:", err.message);
      }
    }

    // ✅ Modern way to remove a subdocument
    course.lessons.pull({ _id: lessonId });
    await course.save();

    req.flash("success_msg", "✅ Material deleted successfully!");
    res.redirect(`/courses/${course.slug}`);
  } catch (err) {
    console.error("❌ Error deleting material:", err);
    req.flash("error_msg", "Server error deleting material");
    res.redirect(`/courses/${req.params.courseId}`);
  }
});



module.exports = router;
