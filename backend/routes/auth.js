const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");

// Helper: set flash message
const setFlash = (req, type, message) => {
  if (!req.session.flash) req.session.flash = {};
  if (!req.session.flash[type]) req.session.flash[type] = [];
  req.session.flash[type].push(message);
};

// ✅ Email sender setup (Gmail SMTP)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ------------------------------------
// GET /register
// ------------------------------------
router.get("/register", (req, res) => {
  if (req.session.user) return res.redirect("/");

  // Get flash messages from session
  const success_msg = req.flash('success') || [];
  const error_msg = req.flash('error') || [];
  const formData = req.flash('formData')[0] || {}; // Get the first formData if it exists
  
  // Check for email in query params (from resend OTP)
  const emailFromQuery = req.query.email || "";
  const showOTP = !!emailFromQuery || req.flash('showOTP').length > 0;
  
  // If we have an email from query params, use it as the form data
  if (emailFromQuery && !formData.email) {
    formData.email = emailFromQuery;
  }

  res.render("auth/register", {
    title: showOTP ? "Verify Your Email" : "Register - E-Courser",
    showOTP,
    success_msg: success_msg.length > 0 ? success_msg : null,
    error_msg: error_msg.length > 0 ? error_msg : null,
    formData,
    session: req.session || {},
    email: formData.email || emailFromQuery || "",
  });
});

// ------------------------------------
// POST /register  → Registration + OTP verification in one route
// ------------------------------------
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, password2, role, otp, step } = req.body;

    // STEP 1 — OTP Verification
    if (step === "verify") {
      const user = await User.findOne({ email: email.trim().toLowerCase() })
        .select('+emailOTP +emailOTPExpiry');

      if (!user) {
        return res.render("auth/register", {
          title: "Register - E-Courser",
          showOTP: false,
          error_msg: "User not found. Please register again.",
          success_msg: null,
          session: req.session || {},
        });
      }

      // Check if OTP exists
      if (!user.emailOTP) {
        return res.render("auth/register", {
          title: "Register - E-Courser",
          showOTP: true,
          email,
          error_msg: "No OTP found. Please request again.",
          success_msg: null,
          session: req.session || {},
        });
      }

      // Safe expiry check (UTC-safe)
      const expiryTime = new Date(user.emailOTPExpiry).getTime();
      const nowTime = Date.now();

      if (isNaN(expiryTime) || expiryTime <= nowTime) {
        return res.render("auth/register", {
          title: "Register - E-Courser",
          showOTP: true,
          email,
          error_msg: "OTP expired. Please click 'Resend OTP' to get a new one.",
          success_msg: null,
          session: req.session || {},
        });
      }

      // Compare OTP
      if (user.emailOTP !== otp) {
        return res.render("auth/register", {
          title: "Register - E-Courser",
          showOTP: true,
          email,
          error_msg: "Invalid OTP. Please try again.",
          success_msg: null,
          session: req.session || {},
        });
      }

      // ✅ Mark verified
      user.emailVerified = true;
      user.status = "active";
      user.emailOTP = undefined;
      user.emailOTPExpiry = undefined;
      await user.save();

      // Email verified successfully

      return res.render("auth/login", {
        title: "Login - E-Courser",
        success_msg: "Email verified successfully! You can now log in.",
        error_msg: null,
        session: req.session || {},
      });
    }

    // STEP 2️⃣ — New Registration
    const errors = [];
    if (!name || !email || !password || !password2)
      errors.push("Please fill in all fields");
    if (password !== password2) errors.push("Passwords do not match");
    if (password && password.length < 6)
      errors.push("Password must be at least 6 characters");

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({
      email: { $regex: new RegExp(`^${normalizedEmail}$`, "i") },
    });

    if (existingUser && !existingUser.emailVerified) {
      req.flash('error', 'Email already registered but not verified. Please verify via OTP.');
      req.flash('showOTP', true);
      return res.redirect(`/register?email=${encodeURIComponent(email)}`);
    }

    if (existingUser && existingUser.emailVerified) {
      req.flash('error', 'Email already registered and verified. Please log in.');
      return res.redirect('/login');
    }

    if (errors.length > 0) {
      req.flash('error', errors.join(', '));
      req.flash('formData', req.body);
      return res.redirect('/register');
    }

    // ✅ Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // ✅ Generate hardcoded OTP
    const otpCode = "123456";
    const otpExpiry = Date.now() + 10 * 60 * 1000;

    const newUser = new User({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: (role || "student").toLowerCase(),
      emailVerified: false,
      emailOTP: otpCode,
      emailOTPExpiry: new Date(otpExpiry),
      status: "pending",
    });

    await newUser.save();

    // Removed email sending for OTP, using hardcoded OTP "123456"

    req.flash('success', 'OTP sent to your email. Please verify it below.');
    req.flash('showOTP', true);
    return res.redirect(`/register?email=${encodeURIComponent(newUser.email)}`);
  } catch (err) {
    console.error("Registration error:", err);
    if (!res.headersSent) {
      req.flash('error', 'Server error. Please try again later.');
      req.flash('formData', req.body);
      return res.redirect('/register');
    }
  }
});

// ------------------------------------
// POST /resend-otp - Resend OTP to user's email
// ------------------------------------
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      setFlash(req, 'error', 'Email is required');
      return res.redirect('/register');
    }

    // Find the user by email and include the OTP fields
    const user = await User.findOne({ email: email.trim().toLowerCase() })
      .select('+emailOTP +emailOTPExpiry');
    
    if (!user) {
      setFlash(req, 'error', 'No account found with this email. Please register first.');
      return res.redirect('/register');
    }

    // Generate new hardcoded OTP
    const otpCode = "123456";
    const now = new Date();
    const expiryTime = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now
    
    // OTP expiry time set

    // Update user with new OTP
    user.emailOTP = otpCode;
    user.emailOTPExpiry = expiryTime;
    
    // Save and refetch to ensure we have the correct data
    await user.save();
    const updatedUser = await User.findById(user._id).select('+emailOTP +emailOTPExpiry');
    
    // OTP saved with expiry

    req.flash('success', 'New OTP generated successfully.');
    req.session.showOTPForm = true;

    // Removed email sending for OTP, using hardcoded OTP "123456"
    
    // Redirect back to registration page with OTP form shown
    setFlash(req, 'success', 'A new verification code has been sent to your email.');
    return res.redirect(`/register?email=${encodeURIComponent(user.email)}`);

  } catch (err) {
    console.error('Error resending OTP:', err);
    setFlash(req, 'error', 'Failed to resend verification code. Please try again.');
    return res.redirect('/register');
  }
});

// ------------------------------------
// GET /login
// ------------------------------------
router.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/");

  // Get flash messages from session
  const success_msg = req.flash('success') || [];
  const error_msg = req.flash('error') || [];
  const email = req.flash('email') || [];

  // Get any error from query params (for OAuth failures)
  const oauthError = req.query.error;
  if (oauthError) {
    error_msg.push(oauthError);
  }

  res.render("auth/login", {
    title: "Login - E-Courser",
    success_msg: success_msg.length > 0 ? success_msg : null,
    error_msg: error_msg.length > 0 ? error_msg : null,
    email: email[0] || "",
    session: req.session || {}
  });
});

// ------------------------------------
// POST /login
// ------------------------------------
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    setFlash(req, "error", "Please enter both email and password.");
    return res.redirect(303, "/login");
  }

  try {
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${email.trim()}$`, "i") },
    });

    if (!user) {
      setFlash(req, "error", "No account found with this email.");
      return res.redirect(303, "/login");
    }

    if (!user.emailVerified) {
      setFlash(req, "error", "Please verify your email before logging in.");
      return res.redirect(303, "/register");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      setFlash(req, "error", "Incorrect password.");
      return res.redirect(303, "/login");
    }

    if (user.status === "suspended") {
      setFlash(req, "error", "Your account has been suspended. Contact support.");
      return res.redirect(303, "/login");
    }

    req.session.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    user.lastLogin = new Date();
    await user.save();

    setFlash(req, "success", `Welcome back, ${user.name}!`);
    
    // Redirect based on user role
    const redirectUrl = user.role === 'instructor' ? '/courses/instructor/dashboard' : '/';
    req.session.save(() => res.redirect(303, redirectUrl));
  } catch (err) {
    console.error("Login error:", err);
    setFlash(req, "error", "Server error. Please try again later.");
    return res.redirect(303, "/login");
  }
});

// ------------------------------------
// GET /logout
// ------------------------------------
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
});

module.exports = router;
