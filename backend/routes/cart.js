const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');

// GET /cart - Shopping Cart page
router.get('/', ensureAuthenticated, (req, res) => {
  try {
    res.render('cart', {
      title: 'My Shopping Cart',
      user: req.session.user,
      success_msg: req.flash('success_msg'),
      error_msg: req.flash('error_msg')
    });
  } catch (err) {
    console.error('Error rendering cart:', err);
    req.flash('error_msg', 'Error loading shopping cart');
    res.redirect('/');
  }
});

module.exports = router;
