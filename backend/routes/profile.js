const express = require("express");
const mongoose = require('mongoose');
const router = express.Router();
const User = require("../models/User");
const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
const { ensureAuthenticated } = require("../middleware/auth");
const multer = require('multer');
const { storage } = require("../config/cloudinary");
const upload = multer({ storage });
const { cloudinary } = require("../config/cloudinary");
const bcrypt = require('bcryptjs');

// GET / - View user profile
router.get("/", ensureAuthenticated, async (req, res, next) => {
  try {
    if (!req.session || !req.session.user || !req.session.user.id) {
      console.error('Session or user ID not found in request');
      return res.redirect('/login');
    }

    const user = await User.findById(req.session.user.id).select('-password');
    if (!user) {
      console.error('User not found for ID:', req.session.user.id);
      req.flash('error_msg', 'User not found');
      return res.redirect('/login');
    }
    
    // Get flash messages
    const success_msg = req.flash('success_msg') || [];
    const error_msg = req.flash('error_msg') || [];
    
    res.render('profile/index', { 
      title: 'My Profile',
      user: user.toObject(),
      isOwnProfile: true,
      success_msg: success_msg.length ? success_msg : null,
      error_msg: error_msg.length ? error_msg : null,
      session: req.session || {}
    });
  } catch (err) {
    console.error('Error in profile route:', err);
    req.flash('error_msg', 'An error occurred while loading your profile');
    res.redirect('/');
  }
});

// GET /edit - Show edit profile form
router.get("/edit", ensureAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id).select('-password');
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/profile');
    }
    
    // Convert social links to the format expected by the form
    const socialLinks = user.socialLinks || {};
    
    res.render('profile/edit', { 
      title: 'Edit Profile',
      user: {
        ...user.toObject(),
        social: {
          twitter: socialLinks.twitter || '',
          linkedin: socialLinks.linkedin || '',
          github: socialLinks.github || '',
          website: socialLinks.website || ''
        }
      },
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (err) {
    console.error('Error loading edit profile:', err);
    req.flash('error_msg', 'Error loading profile editor');
    res.redirect('/profile');
  }
});

// GET /settings - Show account settings
router.get("/settings", ensureAuthenticated, async (req, res, next) => {
  try {
    if (!req.session || !req.session.user || !req.session.user.id) {
      // No session or user ID found
      return res.redirect('/login');
    }

    const user = await User.findById(req.session.user.id).select('-password');
    
    if (!user) {
      // User not found
      req.flash('error_msg', 'User not found');
      return res.redirect('/');
    }
    
    // Rendering settings page
    
    // Get flash messages before rendering
    const success_msg = req.flash('success_msg');
    const error_msg = req.flash('error_msg');
    
    res.render('profile/setting', { 
      title: 'Account Settings',
      user: user.toObject(),
      success_msg: success_msg.length ? success_msg : null,
      error_msg: error_msg.length ? error_msg : null,
      session: req.session || {}
    });
  } catch (err) {
    console.error('Error in /settings route:', err);
    req.flash('error_msg', 'An error occurred while loading settings');
    res.redirect('/profile');
  }
});

// GET /:id - View another user's profile
router.get("/:id", ensureAuthenticated, async (req, res) => {
  // Check if the ID is a valid MongoDB ObjectID
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.redirect('/profile');
  }
  
  try {
    // Don't allow users to view their own profile through this route
    if (req.params.id === req.session.user.id) {
      return res.redirect('/profile');
    }
    
    const user = await User.findById(req.params.id).select('-password -resetPasswordToken -resetPasswordExpires');
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('back');
    }
    
    res.render('profile/index', { 
      title: `${user.name}'s Profile`,
      user,
      isOwnProfile: false,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    req.flash('error_msg', 'Error loading user profile');
    res.redirect('back');
  }
});

// POST /edit - Update profile
router.post("/edit", 
  ensureAuthenticated, 
  upload.single('avatar'),
  async (req, res) => {
    try {
      const { 
        name, 
        email, 
        phone, 
        bio, 
        dateOfBirth,
        address,
        city,
        country,
        expertise,
        experience,
        teachingPhilosophy,
        currentPassword,
        newPassword,
        confirmPassword
      } = req.body;

      const socialLinks = {
        twitter: req.body['social[twitter]'] || '',
        linkedin: req.body['social[linkedin]'] || '',
        github: req.body['social[github]'] || '',
        website: req.body['social[website]'] || ''
      };

      // Find user
      const user = await User.findById(req.session.user.id);
      if (!user) {
        req.flash('error_msg', 'User not found');
        return res.redirect('/profile');
      }

      // Update basic info
      user.name = name || user.name;
      user.email = email || user.email;
      user.phone = phone || user.phone;
      user.bio = bio || user.bio;
      user.dateOfBirth = dateOfBirth || user.dateOfBirth;
      user.address = address || user.address;
      user.city = city || user.city;
      user.country = country || user.country;
      user.socialLinks = socialLinks;

      // Instructor-specific fields
      if (user.role === 'instructor') {
        user.expertise = expertise || user.expertise;
        user.experience = experience || user.experience;
        user.teachingPhilosophy = teachingPhilosophy || user.teachingPhilosophy;
      }

      // Handle avatar upload
      if (req.file) {
        try {
          // If there's an existing avatar, delete it from Cloudinary
          if (user.avatar && user.avatar.public_id) {
            await cloudinary.uploader.destroy(user.avatar.public_id);
          }
          
          // Get the uploaded file details from Cloudinary
          const result = await cloudinary.uploader.upload(req.file.path, {
            folder: 'avatars',
            public_id: `${user._id}_${Date.now()}`,
            width: 150,
            height: 150,
            crop: 'thumb',
            gravity: 'face',
            quality: '30',
            fetch_format: 'auto',
            radius: 'max'
          });
          
          // Save the Cloudinary URL and public_id
          user.avatar = {
            url: result.secure_url, // Use secure URL (HTTPS)
            public_id: result.public_id
          };
          
          // Avatar uploaded successfully
        } catch (error) {
          console.error('Error uploading avatar:', error);
          req.flash('error_msg', 'Failed to upload avatar. Please try again.');
          return res.redirect('/profile/edit');
        }
      }

      // Handle password change if all fields are provided
      if (currentPassword && newPassword && confirmPassword) {
        const isMatch = await user.matchPassword(currentPassword);
        if (!isMatch) {
          req.flash('error_msg', 'Current password is incorrect');
          return res.redirect('/profile/edit');
        }

        if (newPassword !== confirmPassword) {
          req.flash('error_msg', 'New passwords do not match');
          return res.redirect('/profile/edit');
        }

        user.password = newPassword;
      }

      await user.save();
      
      // Update session
      req.session.user = {
        id: user._id,
        name: user.name,
        role: user.role,
        avatar: user.avatar?.url
      };

      req.flash('success_msg', 'Profile updated successfully');
      res.redirect('/profile');
      
    } catch (err) {
      console.error('Error updating profile:', err);
      
      if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(val => val.message);
        req.flash('error_msg', messages.join(', '));
      } else if (err.code === 11000) {
        req.flash('error_msg', 'Email is already in use');
      } else {
        req.flash('error_msg', 'Error updating profile');
      }
      
      res.redirect('/profile/edit');
    }
  }
);


// POST /delete-account - Handle account deletion
router.post("/delete-account", ensureAuthenticated, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { confirmEmail } = req.body;
    const userId = req.session.user.id;

    // Read user and capture name/email immediately (before any other anonymization)
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      req.flash('error_msg', 'User not found');
      return res.redirect('/profile/settings');
    }

    if (user.email !== confirmEmail) {
      await session.abortTransaction();
      session.endSession();
      req.flash('error_msg', 'Email does not match. Please try again.');
      return res.redirect('/profile/settings');
    }

    // Delete Cloudinary avatar if present (outside transaction - safe to attempt)
    if (user.avatar && user.avatar.public_id) {
      try {
        await cloudinary.uploader.destroy(user.avatar.public_id);
      } catch (err) {
        console.error('Error deleting avatar from Cloudinary:', err);
        // we don't abort here; continue
      }
    }

    // If user is instructor: delete courses
    if (user.role === 'instructor') {
      const courses = await Course.find({ instructor: userId }).session(session);

      for (const course of courses) {
        // delete course image if present
        if (course.image && course.image.public_id) {
          try { 
            await cloudinary.uploader.destroy(course.image.public_id); 
          } catch (err) { 
            console.error(err); 
          }
        }

        // delete lesson resources (if you use a Lesson model stored outside course)
        try {
          const Lesson = mongoose.model('Lesson');
          const lessons = await Lesson.find({ course: course._id }).session(session);
          for (const lesson of lessons) {
            if (lesson.video && lesson.video.public_id) {
              try { 
                await cloudinary.uploader.destroy(lesson.video.public_id, { resource_type: 'video' }); 
              } catch (e) { 
                console.error(e); 
              }
            }
            if (lesson.resources && lesson.resources.length) {
              for (const resource of lesson.resources) {
                if (resource.public_id) {
                  try { 
                    await cloudinary.uploader.destroy(resource.public_id); 
                  } catch (e) { 
                    console.error(e); 
                  }
                }
              }
            }
          }
          await Lesson.deleteMany({ course: course._id }).session(session);
        } catch (e) {
          // If Lesson model doesn't exist, ignore
        }
      }

      // delete courses
      await Course.deleteMany({ instructor: userId }).session(session);
    }

    // ✅ CRITICAL FIX: DO NOT UPDATE ENROLLMENTS AT ALL
    // The enrollments already have studentName and studentEmail stored
    // We DON'T need to change anything - just leave them as is
    // The student reference will naturally become invalid when user is deleted
    
    // Note: We're NOT updating enrollments here because:
    // 1. studentName and studentEmail are already stored and won't change
    // 2. The student ObjectId reference will remain but point to deleted user
    // 3. Queries should handle this gracefully by not populating deleted users

    // Remove student from Course.students arrays
    await Course.updateMany(
      { students: userId }, 
      { $pull: { students: userId } }, 
      { session }
    );

    // Finally delete user
    await User.findByIdAndDelete(userId).session(session);

    await session.commitTransaction();
    session.endSession();

    // Flash + destroy express session cookie for the logged-in user
    req.flash('success', 'Your account has been permanently deleted.');

    // Save session then destroy
    req.session.save(() => {
      res.clearCookie('connect.sid');
      req.session.destroy(err => {
        if (err) {
          console.error('Error destroying session after delete:', err);
          return res.redirect('/');
        }
        return res.redirect('/');
      });
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error deleting account:', err);
    req.flash('error_msg', 'Error deleting account. Please try again.');
    return res.redirect('/profile/settings');
  }
});


module.exports = router;
