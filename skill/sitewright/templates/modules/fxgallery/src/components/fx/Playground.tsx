'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import site from '@/content/site.json';
import { LogoMark } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { BACKGROUND_COMPONENTS, CountUp, EXTRA_ATTACH, HEADLINE_COMPONENTS, INFO } from './catalog';

type Choice = { background: string; headline: string; buttons: string; cards: string; reveal: string; extras: string[] };
const NONE = 'none';
const START: Choice = { background: 'aurora', headline: 'split-words', buttons: 'glow-border', cards: 'spotlight', reveal: 'rise', extras: [] };
const SAMPLE = { before: 'Your work, ', accent: 'beautifully', after: ' in motion.' };
const ROTATE = ['beautifully', 'quickly', 'calmly'];

const css = (v: Record<string, string>) => v as CSSProperties;

/** Radio chips for one slot. `none` is always offered first. */
function Group({ title, items, value, onPick, none = true }: { title: string; items: readonly { id: string; label: string; desc: string }[]; value: string; onPick: (id: string) => void; none?: boolean }) {
  return (
    <fieldset className="fxg-group">
      <legend>{title}</legend>
      <div className="fxg-chips" role="radiogroup" aria-label={title}>
        {none ? <button type="button" role="radio" aria-checked={value === NONE} className={`fxg-chip${value === NONE ? ' on' : ''}`} onClick={() => onPick(NONE)}>None</button> : null}
        {items.map((it) => (
          <button key={it.id} type="button" role="radio" aria-checked={value === it.id} className={`fxg-chip${value === it.id ? ' on' : ''}`} onClick={() => onPick(it.id)} title={it.desc}>
            {it.label}
          </button>
        ))}
      </div>
      <p className="fxg-note">{items.find((i) => i.id === value)?.desc ?? (value === NONE ? 'Nothing added: the page keeps its default look.' : '')}</p>
    </fieldset>
  );
}

export function Playground() {
  const [c, setC] = useState<Choice>(START);
  const [primary, setPrimary] = useState<string>(site.brand.colors.primary);
  const [signal, setSignal] = useState<string>(site.brand.colors.signal);
  const [run, setRun] = useState(0);
  const [shown, setShown] = useState(true);
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof Choice>(k: K, v: Choice[K]) => { setC((o) => ({ ...o, [k]: v })); setRun((n) => n + 1); };
  const toggleExtra = (id: string) => setC((o) => ({ ...o, extras: o.extras.includes(id) ? o.extras.filter((x) => x !== id) : [...o.extras, id] }));
  const preset = (name: string) => {
    const p = INFO.presets[name as keyof typeof INFO.presets];
    setC({ background: p.heroBackground === 'territory' ? NONE : p.heroBackground, headline: p.headline, buttons: p.buttons, cards: p.cards, reveal: p.reveal, extras: [...p.extras] });
    setRun((n) => n + 1);
  };

  // Replay the entrance: headline remounts (key), cards drop out and back in.
  useEffect(() => {
    setShown(false);
    const t = setTimeout(() => setShown(true), 140);
    return () => clearTimeout(t);
  }, [run]);

  // Page-level extras are attached only while selected.
  useEffect(() => {
    const offs = c.extras.map((id) => EXTRA_ATTACH[id]?.()).filter((f): f is () => void => typeof f === 'function');
    return () => offs.forEach((off) => off());
  }, [c.extras]);

  const Bg = c.background !== NONE ? BACKGROUND_COMPONENTS[c.background] : undefined;
  const Head = HEADLINE_COMPONENTS[c.headline] ?? HEADLINE_COMPONENTS[NONE]!;
  const snippet = useMemo(() => JSON.stringify({
    effects: {
      heroBackground: c.background === NONE ? 'none' : c.background,
      headline: c.headline,
      ...(c.headline === 'rotate' ? { rotateWords: ROTATE } : {}),
      buttons: c.buttons, cards: c.cards, reveal: c.reveal,
      ...(c.extras.length ? { extras: c.extras } : {}),
    },
  }, null, 2), [c]);

  const attrs: Record<string, string> = {};
  if (c.buttons !== NONE) attrs['data-fx-buttons'] = c.buttons;
  if (c.cards !== NONE) attrs['data-fx-cards'] = c.cards;
  if (c.reveal !== 'rise') attrs['data-fx-reveal'] = c.reveal;
  const stats = [{ n: 1284, l: 'orders' }, { n: 96, l: 'shipped today' }, { n: 7, l: 'need attention' }];
  const cards = ['Pick a bean', 'Roast to order', 'Track every parcel'];

  return (
    <div className="fxg">
      <header className="fxg-bar">
        <a className="fxg-brand" href="/" aria-label="__BRAND__ home"><span className="brand-mark"><LogoMark size={26} /></span><b>__BRAND__</b><span className="muted"> / effects</span></a>
        <ThemeToggle />
      </header>

      <div className="fxg-wrap">
        <div className="fxg-intro">
          <p className="eyebrow">Effects gallery</p>
          <h1>Pick how __BRAND__ feels.</h1>
          <p className="muted">Everything on the right is live. Choose a background, headline animation, button and card style, then copy the config underneath into <code>site.json</code>.</p>
          <div className="fxg-presets" role="group" aria-label="Presets">
            <span className="muted small">Presets</span>
            {Object.keys(INFO.presets).map((p) => <button key={p} type="button" className="btn sm" onClick={() => preset(p)}>{p}</button>)}
          </div>
        </div>

        <div className="fxg-layout">
          <section className="fxg-stage" aria-label="Live preview">
            <div className="fxg-hero" key={`${c.background}-${primary}-${signal}`} style={css({ '--primary': primary, '--signal': signal })} {...attrs}>
              {Bg ? <Bg /> : null}
              <div className="fxg-hero-in">
                <p className="eyebrow">Live preview</p>
                <h2 className="fxg-h1" key={`${c.headline}-${run}`}><Head {...SAMPLE} words={ROTATE} /></h2>
                <p className="fxg-sub">The headline, background, buttons and cards below all use the effects you picked.</p>
                <div className="fxg-btns">
                  <a className="btn primary" href="#install" onClick={(e) => e.preventDefault()}>Get started</a>
                  <a className="btn" href="#more" onClick={(e) => e.preventDefault()}>See how it works</a>
                </div>
              </div>
            </div>

            <div className="fxg-below" style={css({ '--primary': primary, '--signal': signal })} {...attrs}>
              <div className="fxg-stats">
                {stats.map((s, i) => (
                  <div key={`${s.l}-${run}-${c.extras.includes('count-up')}`} className={`stat-card rv${shown ? ' in' : ''}`} style={css({ transitionDelay: `${i * 90}ms` })}>
                    <div className="stat-n">{c.extras.includes('count-up') ? <CountUp value={s.n} /> : s.n.toLocaleString('en-GB')}</div>
                    <div className="stat-l">{s.l}</div>
                  </div>
                ))}
              </div>
              <div className="fxg-cards">
                {cards.map((t, i) => (
                  <article key={t} className={`card pad rv${shown ? ' in' : ''}`} style={css({ transitionDelay: `${i * 110}ms` })}>
                    <h3 className="card-h">{t}</h3>
                    <p className="muted small">Hover or touch this card to see the card effect. Press the buttons above for the button effect.</p>
                  </article>
                ))}
              </div>
              <button type="button" className="btn" onClick={() => setRun((n) => n + 1)}>Replay entrance</button>
            </div>
          </section>

          <aside className="fxg-controls" aria-label="Choose effects">
            <fieldset className="fxg-group">
              <legend>Brand colours</legend>
              <div className="fxg-colors">
                <label>Primary <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} /></label>
                <label>Accent <input type="color" value={signal} onChange={(e) => setSignal(e.target.value)} /></label>
              </div>
            </fieldset>
            <Group title="Hero background" items={INFO.background} value={c.background} onPick={(v) => set('background', v)} />
            <Group title="Headline animation" items={INFO.headline} value={c.headline} onPick={(v) => set('headline', v)} />
            <Group title="Buttons" items={INFO.buttons} value={c.buttons} onPick={(v) => set('buttons', v)} />
            <Group title="Cards" items={INFO.cards} value={c.cards} onPick={(v) => set('cards', v)} />
            <Group title="Scroll reveal" items={INFO.reveal} value={c.reveal} onPick={(v) => set('reveal', v)} none={false} />
            <fieldset className="fxg-group">
              <legend>Extras</legend>
              <div className="fxg-chips">
                {INFO.extras.map((x) => (
                  <button key={x.id} type="button" role="checkbox" aria-checked={c.extras.includes(x.id)} className={`fxg-chip${c.extras.includes(x.id) ? ' on' : ''}`} onClick={() => toggleExtra(x.id)} title={x.desc}>{x.label}</button>
                ))}
              </div>
              <p className="fxg-note">Cursor glow and sparks need a mouse; scroll progress shows at the top of this page.</p>
            </fieldset>
          </aside>
        </div>

        <section className="fxg-code card pad" aria-label="Config to copy">
          <div className="fxg-code-head">
            <h2 className="card-h">Your config</h2>
            <button type="button" className="btn sm" onClick={() => { void navigator.clipboard?.writeText(snippet).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <p className="muted small">Paste this next to <code>brand</code> in <code>site.json</code>, then run the generator again. Nothing else changes.</p>
          <pre className="codeblock"><code>{snippet}</code></pre>
        </section>
      </div>
    </div>
  );
}
