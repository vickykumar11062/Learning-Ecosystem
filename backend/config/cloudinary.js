// backend/config/cloudinary.js
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const dotenv = require("dotenv");

dotenv.config();

// 🔐 Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 🗂️ Dynamic storage rules for different file types
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    // Default values
    let folder = "courses/others";
    let resourceType = "auto";
    let format = undefined;
    let allowedFormats = [];

    // 🎬 Videos
    if (file.mimetype.startsWith("video")) {
      folder = "courses/videos";
      resourceType = "video";
      allowedFormats = ["mp4", "avi", "mov", "mkv"];
    }

    // 📄 PDFs (raw type)
    else if (file.mimetype.includes("pdf")) {
      folder = "courses/pdfs";
      resourceType = "raw";
      format = "pdf";
      allowedFormats = ["pdf"];
    }

    // 🖼️ Images (thumbnails, banners, etc.)
    else if (file.mimetype.startsWith("image")) {
      // Check if it's an avatar upload (from profile route)
      if (req.originalUrl.includes('/profile/edit')) {
        folder = "avatars";
        // Add user ID to the filename if available
        const userId = req.user?._id || 'user';
        return {
          folder,
          resource_type: 'image',
          public_id: `${userId}_${Date.now()}`,
          allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
          transformation: [
            { width: 150, height: 150, crop: 'thumb', gravity: 'face', quality: '30', fetch_format: 'auto' },
            { radius: 'max' }, // Makes the image circular
            { effect: 'saturation:-30' } // Reduce saturation for smaller file size
          ],
          secure: true
        };
      } else {
        folder = "courses/images";
        resourceType = "image";
        allowedFormats = ["jpg", "jpeg", "png", "gif", "webp"];
      }
    }

    // 🧹 Clean file name: remove spaces & special chars
    const cleanName = file.originalname
      .split(".")[0]
      .replace(/[^a-zA-Z0-9_-]/g, "_");

    // Base configuration
    const config = {
      folder,
      resource_type: resourceType,
      public_id: `${Date.now()}_${cleanName}`,
    };

    // ✅ Apply file-type–specific options
    if (format) config.format = format;
    if (allowedFormats.length > 0) config.allowed_formats = allowedFormats;

    // 🖼️ Apply transformation only for images (resize limit)
    if (resourceType === "image") {
    config.transformation = [
        { width: 1280, height: 720, crop: "limit", quality: "auto", fetch_format: "auto" },
    ];
    }

    // ✅ Always force secure URLs (https)
    config.secure = true;

    // ✅ Enable CDN caching for faster loading
    config.invalidate = false;


    return config;
  },
});

module.exports = { cloudinary, storage };
