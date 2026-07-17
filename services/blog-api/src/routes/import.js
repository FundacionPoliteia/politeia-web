import { Router } from 'express';
import mammoth from 'mammoth';
import multer from 'multer';
import { HttpError } from '../errors.js';
import { saveUploadedMedia } from '../repositories/media.js';
import { htmlToMarkdown, htmlToSafeHtml } from '../utils/content.js';
import { IMAGE_MIME_TYPES } from '../utils/validation.js';

const DOCX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
  'application/zip',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

export const importRouter = Router();

importRouter.post('/docx', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, 'file is required');
    if (!isDocx(req.file)) throw new HttpError(400, 'file must be a .docx document');

    const warnings = [];
    const result = await mammoth.convertToHtml(
      { buffer: req.file.buffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          if (!IMAGE_MIME_TYPES.has(image.contentType)) {
            warnings.push(`Unsupported embedded image type: ${image.contentType}`);
            return { alt: 'Unsupported image' };
          }

          const base64 = await image.read('base64');
          const buffer = Buffer.from(base64, 'base64');
          const media = await saveUploadedMedia({
            actorEmail: req.user.email,
            file: {
              buffer,
              mimetype: image.contentType,
              size: buffer.length,
            },
          });

          return { src: media.url };
        }),
      }
    );

    warnings.push(...result.messages.map((message) => message.message).filter(Boolean));

    const contentHtml = htmlToSafeHtml(normalizeImportedHtml(result.value));
    const contentMarkdown = htmlToMarkdown(contentHtml);

    if (!contentMarkdown) throw new HttpError(400, 'document has no importable content');

    res.json({
      contentMarkdown,
      contentHtml,
      warnings,
    });
  } catch (err) {
    next(err);
  }
});

function isDocx(file) {
  const name = file.originalname || '';
  return name.toLowerCase().endsWith('.docx') && DOCX_MIME_TYPES.has(file.mimetype);
}

function normalizeImportedHtml(html = '') {
  return html.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
}
