import { Reveal } from './Reveal'
import { Counter } from './Counter'

const STATS = [
  { to: 100000, suffix: '+', label: 'Photos indexed smoothly' },
  { to: 20000, suffix: '+', label: 'Videos with full metadata' },
  { to: 300, suffix: 'ms', label: 'Cold query response time' },
  { to: 0, suffix: '', label: 'Files copied or moved', display: 'Zero' }
]

export function Stats(): JSX.Element {
  return (
    <section id="performance" className="relative py-24 px-5">
      <div className="max-w-6xl mx-auto">
        <Reveal className="max-w-xl mb-14">
          <div className="section-label mb-3">Performance</div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            Fast at every scale, not just in the demo
          </h2>
          <p className="mt-4 text-[15px] text-neutral-400 leading-relaxed">
            Background workers handle scanning, thumbnails, hashing, and metadata — the interface
            stays responsive whether your library has 500 photos or half a million.
          </p>
        </Reveal>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08}>
              <div className="panel p-6 text-center h-full flex flex-col items-center justify-center">
                <div className="text-3xl sm:text-4xl font-semibold text-white tabular-nums">
                  {s.display ?? <Counter to={s.to} suffix={s.suffix} />}
                </div>
                <div className="mt-2 text-[12.5px] text-neutral-500 leading-snug">{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
