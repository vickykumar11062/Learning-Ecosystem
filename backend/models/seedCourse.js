// seedCourses.js
const mongoose = require("mongoose");
const Course = require("./Course");
const User = require("./User");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI ;

// MongoDB Connection
mongoose.connect(MONGO_URI)
  .then(() => {})
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// Instructor ID for seeding - This should be a valid ObjectId from your users collection
const instructorId = "690ce259943e2c5d5a6dd649"; // Make sure this ID exists in your users collection

// Debug: List all users to verify the instructor exists
const listUsers = async () => {
  try {
    const users = await User.find({}).select('_id name email role');
    return users;
  } catch (err) {
    console.error('Error fetching users:', err);
    return [];
  }
};

// Dummy course data
const courses = [
  {
    title: "JavaScript for Beginners",
    slug: "javascript-for-beginners",
    description: "A beginner-friendly guide to JavaScript programming.",
    price: 499,
    instructor: instructorId,
    thumbnail: { url: "https://via.placeholder.com/400x250?text=JS+Course" },
  },
  {
    title: "Mastering Python",
    slug: "mastering-python",
    description: "Learn Python programming with hands-on examples.",
    price: 799,
    instructor: instructorId,
    thumbnail: { url: "https://via.placeholder.com/400x250?text=Python+Course" },
  },
  {
    title: "React from Zero to Hero",
    slug: "react-from-zero-to-hero",
    description: "Become a React developer with this in-depth guide.",
    price: 999,
    instructor: instructorId,
    thumbnail: { url: "https://via.placeholder.com/400x250?text=React+Course" },
  },
  {
    title: "Full-stack MERN Bootcamp",
    slug: "full-stack-mern-bootcamp",
    description: "Learn full-stack development using MongoDB, Express, React, and Node.js.",
    price: 1299,
    instructor: instructorId,
    thumbnail: { url: "https://via.placeholder.com/400x250?text=MERN+Course" },
  }
];

// Seed Function
const seedCourses = async () => {
  try {
    // First, list all users to verify the instructor exists
    const users = await listUsers();
    
    if (users.length === 0) {
      console.error('❌ No users found in the database. Please create an instructor account first.');
      process.exit(1);
    }
    
    // Find the instructor
    const instructor = users.find(u => u._id.toString() === instructorId);
    
    if (!instructor) {
      console.error('❌ Error: Instructor not found with ID:', instructorId);
      users.forEach(user => {});
      process.exit(1);
    }

    // Clear existing courses for this instructor
    await Course.deleteMany({ instructor: instructorId });
    
    // Add instructor reference to all courses
    const coursesWithInstructor = courses.map(course => ({
      ...course,
      instructor: instructorId
    }));
    
    // Insert new courses
    const created = await Course.insertMany(coursesWithInstructor);
  } catch (err) {
    console.error('❌ Error seeding courses:', err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Run the seeder
seedCourses();