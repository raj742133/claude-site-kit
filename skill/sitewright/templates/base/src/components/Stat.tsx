import { Hint } from './Hint';
import { CountUp } from '@/components/fx';

/** One number with its label, and what it means under the (i). Counts up when the count-up effect is chosen, otherwise shown as it is. */
export function Stat({
  n, label, tone, suffix, prefix, hint,
}: { n: number; label: string; tone?: 'warn' | 'accent' | 'corrected' | 'added' | 'unsure'; suffix?: string; prefix?: string; hint?: string }) {
  return (
    <div className={`stat-card${tone ? ` tone-${tone}` : ''}`}>
      <div className="stat-n">
        {prefix ? <span className="stat-suffix" style={{ marginLeft: 0, marginRight: 2 }}>{prefix}</span> : null}
        <CountUp value={n} />
        {suffix ? <span className="stat-suffix">{suffix}</span> : null}
      </div>
      <div className="stat-l">{label}{hint ? <Hint text={hint} label={label} /> : null}</div>
    </div>
  );
}
