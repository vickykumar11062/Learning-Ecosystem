// backend/middleware/auth.js
module.exports.ensureAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) return next();
  req.flash('error_msg', 'Please login first');
  res.redirect('/login');
};
module.exports.ensureGuest = (req, res, next) => {
  if (!req.session || !req.session.user) return next();
  res.redirect('/');
};
