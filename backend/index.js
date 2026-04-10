// backend/server.js
const express = require("express");
const session = require("express-session");
const flash = require("connect-flash");
const mongoose = require("mongoose");
const path = require("path");
const dotenv = require("dotenv");

// Helper function to set flash messages in session
const setFlash = (req, type, message) => {
  if (!req.session.flash) {
    req.session.flash = {};
  }
  if (!req.session.flash[type]) {
    req.session.flash[type] = [];
  }
  if (Array.isArray(message)) {
    req.session.flash[type].push(...message);
  } else {
    req.session.flash[type].push(message);
  }
};

const cookieParser = require("cookie-parser");
const methodOverride = require("method-override");
const cors = require("cors");
// const helmet = require("helmet");
const compression = require("compression");
const debug = require('debug')('app:server');

// Load environment variables from backend/.env
const envPath = path.join(__dirname, '.env');
const result = dotenv.config({ path: envPath });

// Check for .env file loading errors
if (result.error) {
  process.stderr.write('❌ Error loading .env file:');
  process.stderr.write(result.error.message);
  process.stderr.write('\n💡 Please make sure the .env file exists in the backend directory\n');
  process.exit(1);
}

// Verify required environment variables
const requiredEnvVars = [
  'MONGO_URI',
  'SESSION_SECRET',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  process.stderr.write('❌ Missing required environment variables:\n');
  missingVars.forEach(varName => process.stderr.write(`  - ${varName}\n`));
  process.stderr.write('💡 Please check your .env file in the backend directory\n');
  process.exit(1);
}

// Environment variables loaded

// Import models
const Course = require("./models/Course");
const app = express();

// ✅ Connect to MongoDB
require("./config/db")();

// ✅ View engine setup
app.set("view engine", "ejs");
app.set("views", [
  path.join(__dirname, "..", "frontend", "views"),
  path.join(__dirname, "..", "frontend", "views", "instructor")
]);

// ✅ Add helper to include partials from the root views directory
app.locals.includeWithRoot = function (filePath) {
  return path.join(app.get("views")[0], "partials", `${filePath}.ejs`);
};

// Add view options
app.set('view options', { 
  root: [
    path.join(__dirname, "..", "frontend", "views"),
    path.join(__dirname, "..", "frontend", "views", "instructor")
  ]
});

// ✅ Security and core middlewares
// app.use(
//   helmet({
//     contentSecurityPolicy: {
//       directives: {
//         defaultSrc: ["'self'"],

//         scriptSrc: [
//           "'self'",
//           "'unsafe-inline'",
//           "'unsafe-eval'",
//           "https://cdn.jsdelivr.net",
//           "https://cdnjs.cloudflare.com",
//           "https://cdnjs.cloudflare.com",
//           "https://checkout.razorpay.com"
//         ],
//         scriptSrcElem: [
//           "'self'",
//           "https://cdn.jsdelivr.net",
//           "https://cdnjs.cloudflare.com",
//           "https://checkout.razorpay.com"
//         ],

//         styleSrc: [
//           "'self'",
//           "'unsafe-inline'",
//           "https://cdn.jsdelivr.net",
//           "https://cdnjs.cloudflare.com",
//           "https://fonts.googleapis.com"
//         ],
//         styleSrcElem: [
//           "'self'",
//           "'unsafe-inline'",
//           "https://cdn.jsdelivr.net",
//           "https://cdnjs.cloudflare.com",
//           "https://fonts.googleapis.com"
//         ],

//         fontSrc: [
//           "'self'",
//           "https://fonts.gstatic.com",
//           "https://cdnjs.cloudflare.com"
//         ],

//         imgSrc: [
//           "'self'",
//           "data:",
//           "https://res.cloudinary.com"
//         ],

//         connectSrc: [
//           "'self'",
//           "https://api.razorpay.com",
//           "https://cdn.jsdelivr.net"
//         ],

//         frameSrc: [
//           "'self'",
//           "https://api.razorpay.com",
//           "https://checkout.razorpay.com"
//         ],

//         objectSrc: ["'none'"], // Good practice
//         mediaSrc: ["'self'", "https://res.cloudinary.com"], // if hosting videos
//       },
//     },
//   })
// );


app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || "*",
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "..", "frontend", "public")));

// Session store setup
const MongoStore = require('connect-mongo');

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || "your-super-secret-key-here",
  resave: false,
  saveUninitialized: false, // Changed to false for security
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    ttl: 24 * 60 * 60, // 1 day
    autoRemove: 'native', // Native MongoDB driver's TTL index
    autoRemoveInterval: 10 // Check every 10 minutes
  }),
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Enable in production with HTTPS
    sameSite: 'lax'
  }
};

// In production, trust the first proxy (if using a reverse proxy like Nginx)
if (app.get('env') === 'production') {
  app.set('trust proxy', 1);
  sessionConfig.cookie.secure = true;
}

// Initialize session middleware
app.use(session(sessionConfig));

// Initialize flash after session
app.use(flash());

// Make session and flash available to all routes
app.use((req, res, next) => {
  // Ensure session exists
  if (!req.session) {
    console.error('Session not initialized');
    return next();
  }
  
  // Set default session values if they don't exist
  req.session.views = req.session.views || 0;
  
  // Make flash messages available to all templates
  if (typeof req.flash === 'function') {
    res.locals.success_msg = req.flash('success_msg') || [];
    res.locals.error_msg = req.flash('error_msg') || [];
  } else {
    res.locals.success_msg = [];
    res.locals.error_msg = [];
  }
  
  // Make user and session available to all templates
  res.locals.user = (req.session && req.session.user) || null;
  res.locals.session = req.session || {};
  
  // Handle success message from session (set during redirects)
  if (req.session && req.session.successMessage) {
    res.locals.success_msg.push(req.session.successMessage);
    delete req.session.successMessage;
  }
  
  next();
});

// ✅ Routes
// Privacy Policy Route
app.get("/privacy", (req, res) => {
  try {
    res.render('privacy', {
      title: 'Privacy Policy',
      user: req.user || null
    });
  } catch (error) {
    console.error('Error rendering privacy policy:', error);
    res.status(500).render('errors/500', { error: 'Error loading privacy policy' });
  }
});

// Terms and Conditions Route
app.get("/shipping-policy", (req, res) => {
  try {
    res.render('shipping-policy', {
      title: 'Shipping Policy',
      user: req.user || null,
      currentPath: '/shipping-policy'
    });
  } catch (error) {
    console.error('Error rendering shipping policy:', error);
    res.status(500).render('errors/500', { 
      title: 'Server Error',
      error: 'Failed to load shipping policy page',
      user: req.user || null
    });
  }
});

app.get("/refund-policy", (req, res) => {
  try {
    res.render('refund-policy', {
      title: 'Cancellation & Refund Policy',
      user: req.user || null,
      currentPath: '/refund-policy'
    });
  } catch (error) {
    console.error('Error rendering refund policy:', error);
    res.status(500).render('errors/500', { 
      title: 'Server Error',
      error: 'Failed to load refund policy page',
      user: req.user || null
    });
  }
});

app.get("/terms", (req, res) => {
  try {
    res.render('terms', {
      title: 'Terms & Conditions',
      user: req.user || null
    });
  } catch (error) {
    console.error('Error rendering terms and conditions:', error);
    res.status(500).render('errors/500', { error: 'Error loading terms and conditions' });
  }
});

// Home Route
app.get("/", async (req, res) => {
  debug('Handling GET / request');
  try {
    debug('Fetching featured courses...');
    const featuredCourses = await Course.find({ featured: true })
      .populate('instructor', 'name')
      .limit(3)
      .sort({ createdAt: -1 })
      .lean();
    
    debug(`Found ${featuredCourses ? featuredCourses.length : 0} featured courses`);
    
    // Get flash messages from session
    let success_msg = [];
    let error_msg = [];
    
    // Check for flash messages in session
    if (req.session) {
      // Check for success messages
      if (req.session.success) {
        success_msg = Array.isArray(req.session.success) 
          ? [...req.session.success] 
          : [req.session.success];
        delete req.session.success;
      }
      // Check for error messages
      if (req.session.error) {
        error_msg = Array.isArray(req.session.error)
          ? [...req.session.error]
          : [req.session.error];
        delete req.session.error;
      }
      // Check for success_msg (for backward compatibility)
      if (req.session.success_msg) {
        const msgs = Array.isArray(req.session.success_msg) 
          ? req.session.success_msg 
          : [req.session.success_msg];
        success_msg = [...success_msg, ...msgs];
        delete req.session.success_msg;
      }
      // Check for error_msg (for backward compatibility)
      if (req.session.error_msg) {
        const msgs = Array.isArray(req.session.error_msg) 
          ? req.session.error_msg 
          : [req.session.error_msg];
        error_msg = [...error_msg, ...msgs];
        delete req.session.error_msg;
      }
    }
    
    debug(`Rendering home with ${success_msg.length} success and ${error_msg.length} error messages`);
    
    // Ensure session data is properly structured for the navbar
    const viewData = {
      pageTitle: "EduLearn - Master New Skills",
      title: "EduLearn - Master New Skills",
      session: {
        user: req.session.user || null,
        ...req.session
      },
      success_msg: success_msg.length > 0 ? success_msg : null,
      error_msg: error_msg.length > 0 ? error_msg : null,
      featuredCourses: featuredCourses || []
    };
    
    debug('View data:', JSON.stringify({
      ...viewData,
      session: 'Session data present',
      featuredCourses: `Array of ${viewData.featuredCourses.length} courses`,
      hasSuccessMsg: !!viewData.success_msg,
      hasErrorMsg: !!viewData.error_msg
    }));
    
    res.render("index", viewData);
    debug('Successfully rendered index page');
  } catch (error) {
    debug('Error in GET /: %O', error);
    
    const viewData = {
      pageTitle: "EduLearn - Master New Skills",
      title: "EduLearn - Master New Skills",
      session: req.session || {},
      success_msg: null,
      error_msg: ['Error loading featured courses'],
      featuredCourses: []
    };
    
    res.render("index", viewData);
  }
});

// About Page Route
app.get('/about', (req, res) => {
  try {
    res.render('about', {
      pageTitle: 'About Us - EduLearn',
      title: 'About Us',
      session: req.session
    });
  } catch (error) {
    console.error('Error rendering about page:', error);
    req.flash('error_msg', 'Error loading about page');
    res.redirect('/');
  }
});

// Contact Page Route
app.get('/contact', (req, res) => {
  try {
    res.render('contact', {
      pageTitle: 'Contact Us - EduLearn',
      title: 'Contact Us',
      session: req.session
    });
  } catch (error) {
    console.error('Error rendering contact page:', error);
    req.flash('error_msg', 'Error loading contact page');
    res.redirect('/');
  }
});

// Main routes
app.use("/", require("./routes/auth"));
app.use("/courses", require("./routes/courses"));
app.use("/viewer", require("./routes/viewer"));
app.use("/upload", require("./routes/upload"));
app.use("/payment", require("./routes/payment"));
app.use("/profile", require("./routes/profile"));
app.use("/progress", require("./routes/progress"));
app.use("/certificate", require("./routes/certificates"));

// Wishlist and Cart routes
app.use("/wishlist", require("./routes/wishlist"));
app.use("/cart", require("./routes/cart"));

// Password reset routes
const resetPasswordRouter = require('./routes/resetPassword');
app.use('/', resetPasswordRouter);

// ✅ Error handling
// 404 - Not Found
app.use((req, res) => {
  debug(`404 - Page Not Found: ${req.originalUrl}`);
  res.status(404).render("errors/404", { 
    title: "Page Not Found",
    session: req.session
  });
});

// 500 - Internal Server Error
app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  // Error logged for debugging

  const errorObj = { 
    message: err.message,
    stack: err.stack,
    ...err 
  };

  res.status(500).render("errors/500", { 
    title: "Server Error",
    session: req.session,
    error: errorObj
  });
});

// 505 - HTTP Version Not Supported
app.use((err, req, res, next) => {
  if (err.status === 505 || err.code === 'HPE_INVALID_HTTP_TOKEN') {

    const timestamp = new Date().toISOString();
    // HTTP version error logged for debugging

    const errorObj = { 
      message: err.message,
      stack: err.stack,
      ...err 
    };

    return res.status(505).render("errors/505", { 
      title: "HTTP Version Not Supported",
      session: req.session,
      error: errorObj
    });
  }
  next(err);
});

// ✅ For Render or Railway automatic binding
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  debug(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
