/**
 * YouTube Utility Functions
 * Handles YouTube URL validation, video ID extraction, and time format conversion
 */

/**
 * Extract video ID from various YouTube URL formats
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://youtube.com/watch?v=VIDEO_ID
 * - Direct video ID (11 characters)
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.trim().match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Validate if a string is a valid YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}

/**
 * Convert MM:SS format to seconds
 * Examples: "2:05" → 125, "0:30" → 30, "10:45" → 645
 * @param timeString Time in MM:SS format
 * @returns Seconds as number, or null if invalid
 */
export function timeToSeconds(timeString: string): number | null {
  if (!timeString || typeof timeString !== 'string') return null;

  const trimmed = timeString.trim();
  const parts = trimmed.split(':');

  if (parts.length !== 2) return null;

  const minutes = parseInt(parts[0], 10);
  const seconds = parseInt(parts[1], 10);

  if (
    isNaN(minutes) ||
    isNaN(seconds) ||
    minutes < 0 ||
    seconds < 0 ||
    seconds >= 60
  ) {
    return null;
  }

  return minutes * 60 + seconds;
}

/**
 * Convert seconds to MM:SS format
 * Examples: 125 → "2:05", 30 → "0:30", 645 → "10:45"
 * @param seconds Number of seconds
 * @returns Time string in MM:SS format
 */
export function secondsToTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Validate MM:SS format
 * @param timeString Time string to validate
 * @returns true if valid MM:SS format, false otherwise
 */
export function isValidTimeFormat(timeString: string): boolean {
  return timeToSeconds(timeString) !== null;
}
