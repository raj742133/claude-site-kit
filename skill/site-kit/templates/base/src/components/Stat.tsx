import { Hint } from './Hint';

/** One number with its label, and what it means under the (i). Shown as it is - no count-up. */
export function Stat({
  n, label, tone, suffix, prefix, hint,
}: { n: number; label: string; tone?: 'warn' | 'accent' | 'corrected' | 'added' | 'unsure'; suffix?: string; prefix?: string; hint?: string }) {
  return (
    <div className={`stat-card${tone ? ` tone-${tone}` : ''}`}>
      <div className="stat-n">
        {prefix ? <span className="stat-suffix" style={{ marginLeft: 0, marginRight: 2 }}>{prefix}</span> : null}
        {n.toLocaleString('en-GB')}
        {suffix ? <span className="stat-suffix">{suffix}</span> : null}
      </div>
      <div className="stat-l">{label}{hint ? <Hint text={hint} label={label} /> : null}</div>
    </div>
  );
}
