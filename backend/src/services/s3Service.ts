import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getConfig } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { buildStorageKey } from '../utils/uploadSecurity';

let s3: S3Client | undefined;

function getS3Client(): S3Client {
  if (s3) return s3;

  const config = getConfig();
  s3 = new S3Client({
    region: config.awsRegion,
    credentials:
      config.awsAccessKeyId && config.awsSecretAccessKey
        ? {
            accessKeyId: config.awsAccessKeyId,
            secretAccessKey: config.awsSecretAccessKey,
          }
        : undefined,
  });
  return s3;
}

export async function uploadToS3(
  fileBuffer: Buffer,
  safeFileName: string,
  courseId: string,
  contentType: string
): Promise<string> {
  const config = getConfig();
  if (!config.awsS3Bucket) {
    throw new AppError('Upload storage is not configured', 503, 'UPLOAD_STORAGE_UNAVAILABLE');
  }

  const s3Key = buildStorageKey(`courses/${courseId}/uploads`, safeFileName);

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: config.awsS3Bucket,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: contentType,
    })
  );

  return s3Key;
}
