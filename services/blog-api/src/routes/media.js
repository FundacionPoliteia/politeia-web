import { Router } from 'express';
import multer from 'multer';
import { HttpError } from '../errors.js';
import { saveExternalMedia, saveUploadedMedia } from '../repositories/media.js';
import { assertHttpsUrl, IMAGE_MIME_TYPES } from '../utils/validation.js';
import { config, requireConfig } from '../config.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const mediaRouter = Router();

mediaRouter.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (req.body.url) {
      assertHttpsUrl(req.body.url, 'url');
      const media = await saveExternalMedia({ url: req.body.url, actorEmail: req.user.email });
      return res.status(201).json({ item: media });
    }

    if (!req.file) throw new HttpError(400, 'file or url is required');
    if (!IMAGE_MIME_TYPES.has(req.file.mimetype)) {
      throw new HttpError(400, 'file must be JPEG, PNG, WebP, AVIF, or GIF');
    }
    if (!config.mediaBucket) requireConfig(['mediaBucket']);

    const media = await saveUploadedMedia({ file: req.file, actorEmail: req.user.email });
    res.status(201).json({ item: media });
  } catch (err) {
    next(err);
  }
});
