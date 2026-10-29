import { muscleParts } from '@dialed/shared';

export default function WeeklyMuscles({ summary, timezone }) {
  const max = Math.max(1, ...summary.counts.map(count => count.primarySets + count.secondarySets));
  const partCounts = new Map((summary.partCounts ?? []).map(count => [count.part, count]));
  const weekStart = new Date(`${summary.start}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return <section className="panel section-gap" aria-labelledby="weekly-muscles-title">
    <div className="section-title"><div><div className="eyebrow">MONDAY–SUNDAY</div><h2 id="weekly-muscles-title">Muscles this week</h2></div><span className="week-date">Week of <time dateTime={summary.start}>{weekStart}</time></span></div>
    <div className="legend"><span><i className="primary-dot" aria-hidden="true"/>Primary sets</span><span><i className="secondary-dot" aria-hidden="true"/>Secondary sets</span></div>
    <p className="muted small-text weekly-parts-hint">Select a muscle group to see its parts and emphasis.</p>
    <div className="muscle-chart">{summary.counts.map(count => {
      const parts = muscleParts.filter(part => part.group === count.muscle);
      return <details key={count.muscle} className="weekly-muscle-group">
        <summary className="muscle-chart-row" aria-label={`${count.muscle}: ${count.primarySets} primary ${count.primarySets === 1 ? 'set' : 'sets'}, ${count.secondarySets} secondary ${count.secondarySets === 1 ? 'set' : 'sets'}; show muscle parts`}>
          <span className="muscle-group-name">{count.muscle}</span>
          <span className="bar-track" aria-hidden="true"><span className="bar-primary" style={{ width: `${count.primarySets / max * 100}%` }}/><span className="bar-secondary" style={{ width: `${count.secondarySets / max * 100}%` }}/></span>
          <span>{count.primarySets} <small>/ {count.secondarySets}</small></span>
        </summary>
        <div className="weekly-parts">
          {parts.length ? <div className="part-count-scroll" role="region" aria-label={`${count.muscle} muscle part counts`} tabIndex={0}><table className="part-count-table"><caption className="sr-only">{count.muscle} muscle parts this week</caption><thead><tr><th scope="col">Muscle part</th><th scope="col">Primary</th><th scope="col">Secondary</th><th scope="col">Biased</th></tr></thead><tbody>{parts.map(part => {
            const value = partCounts.get(part.id) ?? { primarySets: 0, secondarySets: 0, biasedSets: 0 };
            return <tr key={part.id} className={value.primarySets + value.secondarySets ? '' : 'untrained-part'}><th scope="row">{part.label}</th><td>{value.primarySets}</td><td>{value.secondarySets}</td><td className={value.biasedSets ? 'has-bias' : ''}>{value.biasedSets}</td></tr>;
          })}</tbody></table></div> : <p className="muted small-text">No muscle part detail available for this group.</p>}
          {count.primarySets + count.secondarySets === 0 && <p className="muted small-text">No completed working sets for this group this week.</p>}
        </div>
      </details>;
    })}</div>
    {!!summary.unmappedSets && <p className="notice muscle-coverage">Part detail unavailable for {summary.unmappedSets} working {summary.unmappedSets === 1 ? 'set' : 'sets'} saved without muscle parts. These sets remain in your weekly working set total.</p>}
    {!!(summary.unassignedDeltSets?.primarySets || summary.unassignedDeltSets?.secondarySets) && <p className="notice muscle-coverage">Delt head unspecified: {summary.unassignedDeltSets.primarySets} primary {summary.unassignedDeltSets.primarySets === 1 ? 'set' : 'sets'} and {summary.unassignedDeltSets.secondarySets} secondary {summary.unassignedDeltSets.secondarySets === 1 ? 'set' : 'sets'} from older workouts. These sets remain in your weekly working set total without being assigned to a delt head.</p>}
    <details className="weekly-count-notes"><summary>How set counts work</summary><p className="muted small-text">Completed working sets only. Biased sets are included in primary counts and describe expected emphasis, not measured activation. A set can involve several groups or parts, so group and part counts overlap.</p><p className="muted small-text">Your week follows {timezone.replaceAll('_', ' ')} time.</p></details>
  </section>;
}
