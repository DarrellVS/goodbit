/**
 * Parse timestamp strings like "1:30", "0:45", "2:15:30" into seconds
 */
export function parseTimestamp(timestamp: string): number | null {
  const parts = timestamp.split(':').map(p => parseInt(p, 10));
  
  if (parts.some(isNaN)) return null;
  
  if (parts.length === 2) {
    // MM:SS format
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  } else if (parts.length === 3) {
    // HH:MM:SS format
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }
  
  return null;
}

/**
 * Convert seconds to timestamp string format
 */
export function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Replace timestamps in markdown with clickable links
 */
export function enhanceMarkdownWithTimestamps(markdown: string, onTimestampClick: (seconds: number) => void): string {
  // Match timestamps in format MM:SS or HH:MM:SS
  const timestampRegex = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g;
  
  return markdown.replace(timestampRegex, (match) => {
    const seconds = parseTimestamp(match);
    if (seconds === null) return match;
    
    // Create a unique ID for this timestamp
    const id = `timestamp-${Math.random().toString(36).substr(2, 9)}`;
    
    // Store the click handler
    setTimeout(() => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('click', (e) => {
          e.preventDefault();
          onTimestampClick(seconds);
        });
      }
    }, 0);
    
    return `<a href="#" id="${id}" class="timestamp-link" data-seconds="${seconds}">${match}</a>`;
  });
}

/**
 * Extract all timestamps from markdown
 */
export interface TimestampAnnotation {
  timestamp: string;
  seconds: number;
  context: string; // surrounding text
}

export function extractTimestamps(markdown: string): TimestampAnnotation[] {
  const timestampRegex = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g;
  const annotations: TimestampAnnotation[] = [];
  const lines = markdown.split('\n');
  
  lines.forEach((line) => {
    let match;
    while ((match = timestampRegex.exec(line)) !== null) {
      const timestamp = match[0];
      const seconds = parseTimestamp(timestamp);
      
      if (seconds !== null) {
        // Get context (the line containing the timestamp)
        const context = line.trim();
        
        annotations.push({
          timestamp,
          seconds,
          context,
        });
      }
    }
  });
  
  return annotations;
}

