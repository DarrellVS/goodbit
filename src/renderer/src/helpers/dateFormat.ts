/** Days in an average month, so the bands do not drift over a year. */
const DAYS_PER_MONTH = 30.44;
const DAYS_PER_YEAR = 365.25;

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'} ago`;

/**
 * How long ago, in words.
 *
 * Two things this used to get wrong, both from bands that did not meet.
 *
 * The weeks band ran while `days / 7` was under 4, and the months band counted
 * `floor(days / 30)`, so **28 and 29 days fell between them and rendered as
 * "0 months ago"**. The bands now hand over at the same number, and a month
 * count is rounded and never allowed to reach zero.
 *
 * And a date in the future produced a negative difference, which passed the
 * `< 60 seconds` test and came back as "just now", so a clip with a skewed
 * clock read as brand new. There is no honest relative phrasing for that, so
 * it falls back to the date itself.
 */
export function formatRelativeTime(date: Date | string): string {
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) return '';

  const diffMs = Date.now() - then.getTime();
  // Ahead of the clock by more than a minute. Saying "just now" would be a
  // confident lie about a file whose age is not knowable.
  if (diffMs < -60_000) return formatExactDate(then);

  const secs = Math.max(0, Math.floor(diffMs / 1000));
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (secs < 60) return 'just now';
  if (mins < 60) return plural(mins, 'minute');
  if (hours < 24) return plural(hours, 'hour');
  if (days === 1) return 'yesterday';
  if (days < 7) return plural(days, 'day');
  if (days < 28) return plural(Math.floor(days / 7), 'week');

  const months = Math.max(1, Math.round(days / DAYS_PER_MONTH));
  if (months < 12) return plural(months, 'month');

  return plural(Math.max(1, Math.round(days / DAYS_PER_YEAR)), 'year');
}

export function formatExactDate(date: Date | string): string {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

export function formatDate(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateStr = date.toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (dateStr === todayStr) return 'Today';
  if (dateStr === yesterdayStr) return 'Yesterday';

  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
  });
}

