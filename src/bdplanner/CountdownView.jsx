export default function CountdownView({ countdown, birthDate }) {
  if (!birthDate) {
    return (
      <section className="panel bd-panel">
        <p className="muted">Configura tu fecha de nacimiento en Ajustes para ver la cuenta atrás.</p>
      </section>
    );
  }

  if (!countdown) {
    return (
      <section className="panel bd-panel">
        <p className="muted">Fecha de nacimiento no válida.</p>
      </section>
    );
  }

  const units = [
    { id: 'days', label: 'Días', value: countdown.days },
    { id: 'weeks', label: 'Semanas', value: countdown.weeks },
    { id: 'hours', label: 'Horas', value: countdown.hours },
    { id: 'minutes', label: 'Minutos', value: countdown.minutes },
  ];

  return (
    <section className="panel bd-panel">
      <div className="bd-age-display">
        <p className="muted">Cumplirás</p>
        <span className="bd-age-number">{countdown.age}</span>
        <p className="muted">años</p>
      </div>
      <div className="bd-countdown-grid">
        {units.map((unit) => (
          <div key={unit.id} className="bd-time-unit">
            <span className="bd-time-value">{unit.value}</span>
            <span className="bd-time-label">{unit.label}</span>
          </div>
        ))}
      </div>
      <p className="bd-countdown-footer muted">¡Tu próximo cumple es el {countdown.nextLabel}!</p>
    </section>
  );
}
