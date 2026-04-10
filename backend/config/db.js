// backend/config/db.js
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file in the root directory
const envPath = path.resolve(__dirname, '..', '..', '.env');
dotenv.config({ path: envPath });

// Check if MONGO_URI is set
if (!process.env.MONGO_URI) {
  process.stderr.write('❌ Error: MONGO_URI is not defined in .env file\n');
  process.stderr.write('💡 Please create a .env file in the root directory with MONGO_URI\n');
  process.stderr.write('Example: MONGO_URI=mongodb://localhost:27017/\n');
  process.exit(1);
}

// Ensure the connection string includes the database name
const ensureDatabaseName = (uri) => {
  try {
    const url = new URL(uri);
    // If no database name is specified, add course_website
    if (!url.pathname || url.pathname === '/') {
      return uri.endsWith('/') ? `${uri}course_website` : `${uri}/course_website`;
    }
    return uri;
  } catch (e) {
    // If URI parsing fails, return the original URI
    return uri;
  }
};

// Get the MongoDB URI and ensure it has the database name
const MONGO_URI = ensureDatabaseName(process.env.MONGO_URI);

// Enable debug mode in development
if (process.env.NODE_ENV === 'development') {
  mongoose.set('debug', true);
}

// Cache the connection to avoid multiple connections
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

module.exports = async function connectDB() {
  // If we have a cached connection, return it
  if (cached.conn) {
    return cached.conn;
  }

  // If no connection promise exists, create one
  if (!cached.promise) {
    const opts = {
      dbName: 'course_website',
      serverSelectionTimeoutMS: 10000, // 10 seconds
      socketTimeoutMS: 45000, // 45 seconds
      bufferCommands: false,
      family: 4, // Use IPv4, skip trying IPv6
    };

    console.log('🌐 Connecting to MongoDB...');

    cached.promise = mongoose.connect(process.env.MONGO_URI, opts)
      .then((mongoose) => {
        console.log("✅ MongoDB connected");
        return mongoose;
      })
      .catch((err) => {
        process.stderr.write(`❌ MongoDB connection error: ${err.message}\n`);
        process.stderr.write('💡 Please make sure:\n');
        process.stderr.write('1. MongoDB is running\n');
        process.stderr.write('2. The connection string in .env is correct\n');
        process.stderr.write('3. Your IP is whitelisted if using MongoDB Atlas\n');
        process.exit(1);
      });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
};
