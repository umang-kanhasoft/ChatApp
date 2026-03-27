import fs from 'node:fs';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const cloudinaryEnabled =
  Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

if (cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
}

export const uploadToCloudinary = async ({ filePath, folder = 'chatapp', resourceType = 'auto' }) => {
  if (!cloudinaryEnabled) {
    return { url: null, secureUrl: null, publicId: null };
  }

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    });

    return {
      url: result.url,
      secureUrl: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      format: result.format,
      resourceType: result.resource_type,
    };
  } finally {
    fs.unlink(filePath, (error) => {
      if (error && error.code !== 'ENOENT') {
        logger.warn('failed to clean up uploaded temp file', {
          filePath,
          error,
        });
      }
    });
  }
};
