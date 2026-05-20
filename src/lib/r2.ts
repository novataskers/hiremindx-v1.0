/**
 * Cloudflare R2 Storage Helper
 * S3-compatible wrapper for upload, fetch, and delete operations.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT!;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL!;

const s3Client = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

/** Upload a file buffer to R2 and return its public URL */
export async function uploadToR2(
  fileBuffer: Buffer,
  fileName: string,
  contentType: string
): Promise<string> {
  const key = `assist-uploads/${Date.now()}-${Math.random().toString(36).substring(2, 10)}-${fileName}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    })
  );

  return `${publicUrl}/${key}`;
}

/** Delete a file from R2 by its full public URL */
export async function deleteFromR2(fileUrl: string): Promise<void> {
  const key = fileUrl.replace(`${publicUrl}/`, "");

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    })
  );
}

/** Fetch a file from its public R2 URL into a Buffer */
export async function fetchFromR2(fileUrl: string): Promise<Buffer> {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch file from R2: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
