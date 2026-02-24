/** Truncate file name to maxChars, always showing extension (e.g. "long-name....pdf") */
export function truncateFileName(name: string, maxChars: number = 22): string {
    if (!name || name.length <= maxChars) return name;
    const lastDot = name.lastIndexOf('.');
    const ext = lastDot >= 0 ? name.slice(lastDot) : ''; // e.g. ".pdf"
    const base = lastDot >= 0 ? name.slice(0, lastDot) : name;
    const baseMax = maxChars - ext.length - 3; // leave room for "..."
    if (baseMax <= 0) return name.slice(0, maxChars - 3) + '...';
    return base.slice(0, baseMax) + '...' + ext;
}
