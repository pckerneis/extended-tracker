/**
 * Format a time value in seconds as `hh:mm:ss:mls`
 * @param timeSeconds the seconds value to format
 */
export function formatTime(timeSeconds: number): string {
  if (timeSeconds === null) {
    return null;
  }

  const minutes = Math.floor(timeSeconds / 60);
  const seconds = Math.floor(timeSeconds % 60);
  const ms = Math.floor((timeSeconds * 1000) % 1000);

  return [
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0'),
    ms.toString().padStart(3, '0').substr(0, 3),
  ].join(':');
}
