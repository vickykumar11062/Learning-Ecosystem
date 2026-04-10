// backend/routes/payment.js
const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const Razorpay = require("razorpay");
const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
const Order = require("../models/Order");
const User = require("../models/User");
const { ensureAuthenticated } = require("../middleware/auth");

// Initialize Razorpay with logging
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error('❌ Error: Razorpay credentials are missing. Please check your .env file');
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ---------------------------------------------
// POST /payment/create-order - Create Razorpay Order
// ---------------------------------------------
router.post("/create-order", ensureAuthenticated, async (req, res) => {
  try {
    const { courseId } = req.body;
    
    // Find the course
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    // Check for existing active enrollment
    const existingEnrollment = await Enrollment.findOne({
      student: req.session.user.id,
      course: courseId,
      paymentStatus: 'completed',
      status: { $in: ['active', null] } // Only check active or legacy enrollments
    });

    if (existingEnrollment) {
      return res.status(400).json({ 
        success: false, 
        message: "You are already enrolled in this course" 
      });
    }

    // Amount in paise (multiply by 100)
    const amountInPaise = Math.round(course.price * 100);

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: {
        courseId: course._id.toString(),
        studentId: req.session.user.id,
        courseTitle: course.title
      }
    });

    // Create Order in database
    const order = new Order({
      razorpayOrderId: razorpayOrder.id,
      amount: amountInPaise,
      currency: "INR",
      student: req.session.user.id,
      course: courseId,
      status: 'created'
    });
    await order.save();

 // ✅ Check for any existing enrollment (including left ones) to handle re-enrollment
let enrollment = await Enrollment.findOne({
  student: req.session.user.id,
  course: courseId
});

if (enrollment) {
  // Get user details for updating enrollment
  const user = await User.findById(req.session.user.id);
  if (!user) {
    return res.status(400).json({ 
      success: false, 
      message: "User not found" 
    });
  }
  
  // Update existing enrollment (could be pending, failed, or left status)
  enrollment.order = order._id;
  enrollment.paymentStatus = "pending";
  enrollment.amount = amountInPaise;
  enrollment.studentName = user.name;
  enrollment.studentEmail = user.email;
  enrollment.status = 'active'; // Reset status to active for re-enrollments
  enrollment.leftAt = null; // Clear leftAt timestamp
  await enrollment.save();
} else {
  // Get user details for enrollment
const user = await User.findById(req.session.user.id);
if (!user) {
  return res.status(400).json({ 
    success: false, 
    message: "User not found" 
  });
}

enrollment = await Enrollment.create({
  student: req.session.user.id,
  studentName: user.name,
  studentEmail: user.email,
  course: courseId,
  order: order._id,
  paymentStatus: "pending",
  amount: amountInPaise,
});
}

    await enrollment.save();

    res.json({
      success: true,
      orderId: razorpayOrder.id,
      amount: amountInPaise,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
      courseTitle: course.title,
      studentName: req.session.user.name,
      studentEmail: req.session.user.email
    });
  } catch (err) {
    console.error("Error creating order:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to create order",
      error: err.message 
    });
  }
});

// ---------------------------------------------
// POST /payment/verify - Verify payment signature
router.post("/verify", ensureAuthenticated, async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature 
    } = req.body;

    // Create signature for verification
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      // Find the order
      const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
      
      if (!order) {
        return res.status(404).json({ 
          success: false, 
          message: "Order not found" 
        });
      }

      // Update order status
      order.razorpayPaymentId = razorpay_payment_id;
      order.razorpaySignature = razorpay_signature;
      order.status = 'completed';
      order.paidAt = new Date();
      await order.save();

      // Update enrollment to completed
      const enrollment = await Enrollment.findOne({
        student: req.session.user.id,
        course: order.course,
        order: order._id
      }).populate('course', 'title slug');

      if (!enrollment) {
        return res.status(404).json({ 
          success: false, 
          message: "Enrollment not found" 
        });
      }

      // ✅ CRITICAL FIX: Only update payment status and enrollment date
      // DO NOT update studentName or studentEmail here
      // They should already be set during enrollment creation
      enrollment.paymentStatus = 'completed';
      enrollment.enrolledAt = new Date();
      
      // ❌ REMOVE THESE LINES - Don't overwrite name/email
      // const user = await User.findById(req.session.user.id);
      // if (user) {
      //   enrollment.studentName = user.name;
      //   enrollment.studentEmail = user.email;
      // }
      
      await enrollment.save();

      // Add enrollment reference to course
      const course = await Course.findById(order.course);
      if (course) {
        // Add enrollment if not already exists
        if (!course.enrollments.includes(enrollment._id)) {
          course.enrollments.push(enrollment._id);
          await course.save();
        }

        // Add course to student's enrolled courses if not already added
        if (!course.students.includes(req.session.user.id)) {
          course.students.push(req.session.user.id);
          await course.save();
        }
      }

      // Add course to user's enrolled courses
      const user = await User.findById(req.session.user.id);
      if (user && !user.enrolledCourses.includes(order.course)) {
        user.enrolledCourses.push(order.course);
        await user.save();
      }

      res.json({
        success: true,
        message: "Payment verified successfully. You now have access to the course!",
        enrollmentId: enrollment._id,
        courseId: order.course,
        courseSlug: enrollment.course?.slug,
        redirectUrl: `/courses/${enrollment.course?.slug}`
      });
    } else {
      // Payment verification failed
      const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
      if (order) {
        order.status = 'failed';
        await order.save();

        // Update enrollment to failed
        const enrollment = await Enrollment.findOne({
          student: req.session.user.id,
          course: order.course,
          order: order._id
        });
        if (enrollment) {
          enrollment.paymentStatus = 'failed';
          await enrollment.save();
        }
      }

      res.status(400).json({
        success: false,
        message: "Payment verification failed"
      });
    }
  } catch (err) {
    console.error("Error verifying payment:", err);
    res.status(500).json({ 
      success: false, 
      message: "Payment verification error",
      error: err.message 
    });
  }
});

// ---------------------------------------------
// POST /payment/webhook - Razorpay Webhook Handler
// ---------------------------------------------
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const webhookSignature = req.headers["x-razorpay-signature"];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return res.status(500).send("Webhook secret not configured");
    }

    // Verify signature
    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== webhookSignature) {
      return res.status(400).send("Invalid signature");
    }

    const event = req.body.event;
    const paymentEntity = req.body.payload.payment.entity;

    if (event === "payment.captured") {
      const orderId = paymentEntity.order_id;
      const paymentId = paymentEntity.id;

      const order = await Order.findOne({ razorpayOrderId: orderId });
      if (!order || order.status === "completed") {
        return res.status(200).json({ success: true });
      }

      // ✅ Update order safely
      order.razorpayPaymentId = paymentId;
      order.status = "completed";
      order.paidAt = new Date();
      await order.save();

      // Get enrollment
      const enrollment = await Enrollment.findOne({
        course: order.course,
        order: order._id
      });

      if (enrollment && enrollment.paymentStatus !== "completed") {

        // ❗ DO NOT overwrite name/email here.
        // Only update status.
        enrollment.paymentStatus = "completed";
        enrollment.enrolledAt = new Date();
        await enrollment.save();

        // Add to course
        const course = await Course.findById(order.course);
        if (course && !course.enrollments.includes(enrollment._id)) {
          course.enrollments.push(enrollment._id);
          await course.save();
        }
      }
    }

    if (event === "payment.failed") {
      const orderId = paymentEntity.order_id;

      const order = await Order.findOne({ razorpayOrderId: orderId });
      if (order) {
        order.status = "failed";
        await order.save();

        const enrollment = await Enrollment.findOne({
          course: order.course,
          order: order._id
        });

        if (enrollment) {
          enrollment.paymentStatus = "failed";
          await enrollment.save();
        }
      }
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Webhook Error:", err);
    res.status(500).send("Webhook failed");
  }
});


module.exports = router;