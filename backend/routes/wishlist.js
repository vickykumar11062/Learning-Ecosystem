const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');

// GET /wishlist - Wishlist page
router.get('/', ensureAuthenticated, (req, res) => {
  try {
    res.render('wishlist', {
      title: 'My Wishlist',
      user: req.session.user,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (err) {
    console.error('Error rendering wishlist:', err);
    req.flash('error_msg', 'Error loading wishlist');
    res.redirect('/');
  }
});

module.exports = router;
