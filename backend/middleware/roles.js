// backend/middleware/roles.js
module.exports.ensureInstructor = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'instructor') return next();
  req.flash('error_msg', 'Instructor access only');
  res.redirect('/login');
};
module.exports.ensureStudent = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'student') return next();
  req.flash('error_msg', 'Student access only');
  res.redirect('/login');
};
