const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const User = require("../models/User");

// ------------------------------
// GET /forgot-password
// ------------------------------
router.get("/forgot-password", (req, res) => {
  res.render("auth/forgot-password", {
    title: "Forgot Password",
    error_msg: null,
    success_msg: null,
    session: req.session || {},
  });
});

// ------------------------------
// POST /forgot-password
// ------------------------------
router.post("/forgot-password", async (req, res) => {
  try {
    const { emailOrPhone } = req.body;

    if (!emailOrPhone) {
      return res.render("auth/forgot-password", {
        title: "Forgot Password",
        error_msg: "Please enter your email or phone number.",
        success_msg: null,
        session: req.session || {},
      });
    }

    // Find user by email or phone (case insensitive for email)
    const user = await User.findOne({
      $or: [
        { email: { $regex: new RegExp(`^${emailOrPhone}$`, "i") } },
        { phone: emailOrPhone },
      ],
    });

    if (!user) {
      return res.render("auth/forgot-password", {
        title: "Forgot Password",
        error_msg: "No account found with that email or phone.",
        success_msg: null,
        session: req.session || {},
      });
    }

    // Generate reset token
    const token = crypto.randomBytes(32).toString("hex");
    user.resetToken = token;
    user.resetTokenExpiry = Date.now() + 15 * 60 * 1000; // 15 min expiry
    await user.save();

    const resetURL = `${req.protocol}://${req.get("host")}/reset-password/${token}`;

    // Setup email transport
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Email message with enhanced UI
    const mailOptions = {
      from: `"EduLearn Support" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: "🔑 Password Reset Request - EduLearn",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
              color: white; 
              padding: 25px 20px; 
              text-align: center; 
              border-radius: 8px 8px 0 0;
            }
            .content { 
              padding: 30px; 
              background: #ffffff; 
              border: 1px solid #e0e0e0; 
              border-top: none;
              border-radius: 0 0 8px 8px;
            }
            .button { 
              display: inline-block; 
              padding: 12px 30px; 
              background: #4f46e5; 
              color: white !important; 
              text-decoration: none; 
              border-radius: 5px; 
              font-weight: 600; 
              margin: 20px 0;
              text-align: center;
            }
            .footer { 
              margin-top: 30px; 
              padding-top: 20px; 
              border-top: 1px solid #e0e0e0; 
              color: #666; 
              font-size: 14px; 
              text-align: center;
            }
            .code { 
              background: #f8f9fa; 
              padding: 15px; 
              border-radius: 5px; 
              word-break: break-all; 
              margin: 15px 0;
              font-family: monospace;
              color: #333;
            }
            .expiry-note { 
              color: #e53e3e; 
              font-weight: 600; 
              margin: 15px 0;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          
          <div class="content">
            <p>Hello <strong>${user.name || 'there'}</strong>,</p>
            
            <p>We received a request to reset your EduLearn account password. Click the button below to set a new password:</p>
            
            <div style="text-align: center; margin: 25px 0;">
              <a href="${resetURL}" class="button">Reset Password</a>
            </div>
            
            <p>Or copy and paste this link into your browser:</p>
            <div class="code">${resetURL}</div>
            
            <div class="expiry-note">⚠️ This link will expire in 15 minutes for security reasons.</div>
            
            <p>If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
            
            <div class="footer">
              <p>Best regards,<br>The EduLearn Team</p>
              <p style="font-size: 12px; color: #999; margin-top: 20px;">
                This is an automated message, please do not reply directly to this email.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    // Send email
    await transporter.sendMail(mailOptions);

    res.render("auth/forgot-password", {
      title: "Forgot Password",
      error_msg: null,
      success_msg: "Password reset link sent! Please check your email.",
      session: req.session || {},
    });
  } catch (err) {
    console.error("Forgot Password Error:", err);
    res.render("auth/forgot-password", {
      title: "Forgot Password",
      error_msg: "Something went wrong. Please try again.",
      success_msg: null,
      session: req.session || {},
    });
  }
});

// ------------------------------
// GET /reset-password/:token
// ------------------------------
router.get("/reset-password/:token", async (req, res) => {
  try {
    const user = await User.findOne({
      resetToken: req.params.token,
      resetTokenExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res.render("auth/forgot-password", {
        title: "Forgot Password",
        error_msg: "Invalid or expired token.",
        success_msg: null,
        session: req.session || {},
      });
    }

    res.render("auth/reset-password", {
      title: "Reset Password",
      token: req.params.token,
      error_msg: null,
      success_msg: null,
      session: req.session || {},
    });
  } catch (err) {
    console.error("Reset Password GET Error:", err);
    res.redirect("/forgot-password");
  }
});

// ------------------------------
// POST /reset-password/:token
// ------------------------------
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { password, confirmPassword } = req.body;

    const user = await User.findOne({
      resetToken: req.params.token,
      resetTokenExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res.render("auth/forgot-password", {
        title: "Forgot Password",
        error_msg: "Invalid or expired reset token.",
        success_msg: null,
        session: req.session || {},
      });
    }

    if (password !== confirmPassword) {
      return res.render("auth/reset-password", {
        title: "Reset Password",
        token: req.params.token,
        error_msg: "Passwords do not match.",
        success_msg: null,
        session: req.session || {},
      });
    }

    // Hash and update password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.render("auth/login", {
      title: "Login",
      success_msg: "Password reset successful! You can now log in.",
      error_msg: null,
      session: req.session || {},
    });
  } catch (err) {
    console.error("Reset Password POST Error:", err);
    res.render("auth/reset-password", {
      title: "Reset Password",
      token: req.params.token,
      error_msg: "Something went wrong. Please try again.",
      success_msg: null,
      session: req.session || {},
    });
  }
});

module.exports = router;
