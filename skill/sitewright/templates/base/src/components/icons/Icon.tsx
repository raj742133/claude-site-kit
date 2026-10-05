import { ICONS } from './icons';

/**
 * One icon, drawn inline in the colour of the text around it (currentColor) and 1em high, so it follows the font size, the theme
 * and a hover state with no extra css. `name` is an id such as "lucide:coffee"; an empty or unknown name draws nothing, so a place
 * that has no icon keeps its default look. The icons are listed in icons.ts, which Sitewright writes from site.json
 * (`scaffold.mjs --apply-icons` changes them without touching anything else).
 */
export function Icon({ name, className }: { name?: string | null; className?: string }) {
  const icon = name ? ICONS[name] : undefined;
  if (!icon) return null;
  return (
    <svg
      className={`ic${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${icon.w} ${icon.h}`}
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
      dangerouslySetInnerHTML={{ __html: icon.b }}
    />
  );
}
