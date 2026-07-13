import { BadRequestException, Injectable } from "@nestjs/common";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomBytes } from "crypto";

type UploadedFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
};

@Injectable()
export class R2StorageService {
  private client: S3Client | null = null;

  private getClient() {
    if (this.client) return this.client;

    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const region = process.env.R2_REGION || "auto";

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new BadRequestException("Cloudflare R2 is not configured.");
    }

    this.client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    });

    return this.client;
  }

  private publicUrlForKey(key: string) {
    const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
    if (!publicBaseUrl) throw new BadRequestException("R2_PUBLIC_BASE_URL is not configured.");
    return `${publicBaseUrl}/${key}`;
  }

  private buildKey(folder: string, originalName = "document") {
    const extension = originalName.includes(".") ? originalName.split(".").pop() : "file";
    const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
    const sanitizedBase = nameWithoutExt.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    const suffix = randomBytes(8).toString("hex");
    return `${folder}/${Date.now()}-${suffix}-${sanitizedBase || "document"}.${extension}`;
  }

  async uploadFile(file: UploadedFile, folder = "staff-documents") {
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) throw new BadRequestException("R2_BUCKET_NAME is not configured.");
    if (!file.buffer) throw new BadRequestException("Uploaded file buffer is missing.");

    const key = this.buildKey(folder, file.originalname);

    await this.getClient().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || "application/octet-stream",
      }),
    );

    return {
      key,
      url: this.publicUrlForKey(key),
      originalName: file.originalname || "document",
      contentType: file.mimetype || "application/octet-stream",
    };
  }
}
