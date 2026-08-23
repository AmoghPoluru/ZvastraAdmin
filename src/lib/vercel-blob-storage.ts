/**
 * Vercel Blob Storage Integration for Payload CMS
 * 
 * This handles storing media files in Vercel Blob Storage
 * while keeping metadata in MongoDB.
 */

import { put, head, del } from '@vercel/blob';

export interface BlobUploadResult {
  url: string;
  pathname: string;
}

/**
 * Upload a file to Vercel Blob Storage
 */
export async function uploadToBlob(
  file: Buffer | Uint8Array | ArrayBuffer,
  filename: string,
  contentType?: string,
  options?: { overwrite?: boolean; cacheControlMaxAge?: number }
): Promise<BlobUploadResult> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN is required. ' +
      'Get it from: Vercel Dashboard → Storage → Blob → Create Token'
    );
  }

  try {
    // Convert to Buffer if needed
    let buffer: Buffer;
    if (Buffer.isBuffer(file)) {
      buffer = file;
    } else if (file instanceof ArrayBuffer) {
      buffer = Buffer.from(file);
    } else {
      buffer = Buffer.from(file.buffer || file);
    }
    
    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: contentType || 'application/octet-stream',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: options?.overwrite ? false : true,
      allowOverwrite: options?.overwrite === true,
      ...(typeof options?.cacheControlMaxAge === 'number'
        ? { cacheControlMaxAge: options.cacheControlMaxAge }
        : {}),
    });

    return {
      url: blob.url,
      pathname: blob.pathname,
    };
  } catch (error: any) {
    console.error('Vercel Blob upload error:', error);
    throw new Error(`Failed to upload to Vercel Blob: ${error.message}`);
  }
}

/**
 * Check if a file exists in Vercel Blob Storage
 */
export async function checkBlobExists(url: string): Promise<boolean> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return false;
  }

  try {
    await head(url, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a file from Vercel Blob Storage
 */
export async function deleteFromBlob(url: string): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN is required. ' +
      'Get it from: Vercel Dashboard → Storage → Blob → Create Token'
    );
  }

  try {
    await del(url, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch (error: any) {
    console.error('Vercel Blob delete error:', error);
    // Don't throw - if file doesn't exist or already deleted, that's okay
    if (!error.message?.includes('not found') && !error.message?.includes('404')) {
      throw new Error(`Failed to delete from Vercel Blob: ${error.message}`);
    }
  }
}
