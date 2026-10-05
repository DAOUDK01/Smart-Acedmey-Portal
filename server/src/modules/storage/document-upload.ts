import { BadRequestException } from "@nestjs/common";
import { extname } from "path";

const ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp"]);
const ALLOWED_MIME = /^(application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|image\/(jpeg|png|webp))$/;

export const DOCUMENT_UPLOAD_LIMITS = { fileSize: 15 * 1024 * 1024, files: 20 };

/** Multer fileFilter for identity and academic documents: PDF, Word or common image formats only. */
export function documentFileFilter(
  _req: unknown,
  file: { originalname?: string; mimetype?: string },
  cb: (error: Error | null, accept: boolean) => void,
) {
  const extension = extname(file.originalname || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME.test(file.mimetype || "")) {
    cb(new BadRequestException("Documents must be PDF, Word, JPG, PNG or WebP files"), false);
    return;
  }
  cb(null, true);
}
