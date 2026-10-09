import { muscleParts } from '@dialed/shared';

export default function WeeklyMuscles({ summary, timezone }) {
  const max = Math.max(1, ...summary.counts.map(count => count.primarySets + count.secondarySets));
  const partCounts = new Map((summary.partCounts ?? []).map(count => [count.part, count]));
  return <section className="panel section-gap" aria-labelledby="weekly-muscles-title">
    <div className="section-title"><div><div className="eyebrow">MONDAY–SUNDAY</div><h2 id="weekly-muscles-title">Muscles this week</h2></div><span className="week-date">{summary.start}</span></div>
    <div className="legend"><span><i className="primary-dot"/>Primary target</span><span><i className="secondary-dot"/>Secondary involvement</span></div>
    <p className="muted small-text weekly-parts-hint">Expand a muscle group to see its parts and biased sets.</p>
    <div className="muscle-chart">{summary.counts.map(count => {
      const parts = muscleParts.filter(part => part.group === count.muscle);
      return <details key={count.muscle} className="weekly-muscle-group">
        <summary className="muscle-chart-row" aria-label={`${count.muscle}: ${count.primarySets} primary sets, ${count.secondarySets} secondary sets; show muscle parts`}>
          <span className="muscle-group-name">{count.muscle}</span>
          <span className="bar-track" aria-hidden="true"><span className="bar-primary" style={{ width: `${count.primarySets / max * 100}%` }}/><span className="bar-secondary" style={{ width: `${count.secondarySets / max * 100}%` }}/></span>
          <span>{count.primarySets} <small>/ {count.secondarySets}</small></span>
        </summary>
        <div className="weekly-parts">
          {parts.length ? <table className="part-count-table"><caption className="sr-only">{count.muscle} muscle parts this week</caption><thead><tr><th scope="col">Muscle part</th><th scope="col">Primary</th><th scope="col">Secondary</th><th scope="col">Biased</th></tr></thead><tbody>{parts.map(part => {
            const value = partCounts.get(part.id) ?? { primarySets: 0, secondarySets: 0, biasedSets: 0 };
            return <tr key={part.id} className={value.primarySets + value.secondarySets ? '' : 'untrained-part'}><th scope="row">{part.label}</th><td>{value.primarySets}</td><td>{value.secondarySets}</td><td className={value.biasedSets ? 'has-bias' : ''}>{value.biasedSets}</td></tr>;
          })}</tbody></table> : <p className="muted small-text">No part detail available for this group.</p>}
          {count.primarySets + count.secondarySets === 0 && <p className="muted small-text">No completed working sets for this group this week.</p>}
        </div>
      </details>;
    })}</div>
    {!!summary.unmappedSets && <p className="notice muscle-coverage">Part detail unavailable for {summary.unmappedSets} working {summary.unmappedSets === 1 ? 'set' : 'sets'} saved without muscle parts. Group totals still include these sets.</p>}
    <p className="muted small-text">Completed working sets only. Biased sets are included in primary counts and describe expected emphasis, not measured activation. A set can involve several parts, so part counts overlap. {timezone}.</p>
  </section>;
}
