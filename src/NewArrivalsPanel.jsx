import { useCallback, useEffect, useState } from 'react';

const DAY_OPTIONS = [1, 3, 5];

function formatPrice(value) {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
}

function formatFirstStockDate(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(String(value).trim().replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function cexImageProxyUrl(imageUrl) {
  if (!imageUrl) {
    return null;
  }
  return `/api/cex/image?url=${encodeURIComponent(imageUrl)}`;
}

function ProductThumb({ imageUrl, size = 72 }) {
  const [failed, setFailed] = useState(false);
  const src = cexImageProxyUrl(imageUrl);

  if (!src || failed) {
    return <div className="thumb-placeholder" style={{ width: size, height: size }} aria-hidden="true" />;
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function MalagaStoresSummary({ availability }) {
  if (!availability?.hasMalagaPickup) {
    return null;
  }

  const names = availability.malagaStores?.map((store) => store.storeName).filter(Boolean) ?? [];
  if (names.length === 0) {
    return <p className="store-availability malaga">Recogida en Málaga</p>;
  }

  return <p className="store-availability malaga">Málaga: {names.join(', ')}</p>;
}

export default function NewArrivalsPanel({ api, onSelect }) {
  const [days, setDays] = useState(3);
  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadArrivals = useCallback(
    async (selectedDays) => {
      setLoading(true);
      setError('');
      try {
        const payload = await api(`/api/cex/new-arrivals?days=${selectedDays}`);
        setResults(payload.results ?? []);
        setMeta({
          returned: payload.returned ?? payload.results?.length ?? 0,
          candidatesInRange: payload.candidatesInRange ?? 0,
          scannedBoxIds: payload.scannedBoxIds ?? 0,
          days: payload.days ?? selectedDays,
        });
      } catch (loadError) {
        setError(loadError.message);
        setResults([]);
        setMeta(null);
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  function handleDaysChange(option) {
    setDays(option);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadArrivals(days);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [days, loadArrivals]);

  return (
    <section className="panel">
      <h2>Novedades en Málaga</h2>
      <p className="muted new-arrivals-intro">
        Listados recién publicados en CeX en el rango elegido, con stock para recogida en tiendas de Málaga.
      </p>

      <div className="day-range-picker" role="group" aria-label="Rango de días">
        {DAY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={`day-range-option${days === option ? ' active' : ''}`}
            aria-pressed={days === option}
            disabled={loading}
            onClick={() => handleDaysChange(option)}
          >
            {option} día{option === 1 ? '' : 's'}
          </button>
        ))}
      </div>

      {loading ? <p className="muted">Buscando novedades…</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {meta && !loading ? (
        <p className="result-summary">
          {meta.returned} listado{meta.returned === 1 ? '' : 's'} en Málaga
          {meta.candidatesInRange > meta.returned
            ? ` (${meta.candidatesInRange} nuevos en catálogo sin stock en Málaga)`
            : ''}
        </p>
      ) : null}

      {!loading && !error && results.length === 0 ? (
        <p className="muted">
          No hay listados nuevos con recogida en Málaga en los últimos {days} día{days === 1 ? '' : 's'}.
        </p>
      ) : null}

      <ul className="result-list">
        {results.map((item) => (
          <li key={item.boxId} className="result-card">
            <ProductThumb imageUrl={item.imageUrl} size={72} />
            <div className="result-body">
              <h3>{item.title}</h3>
              <p className="meta">{item.variantLabel ?? 'Variante CeX'}</p>
              {formatFirstStockDate(item.firstStockInDate) ? (
                <p className="meta new-arrival-date">
                  Alta en catálogo: {formatFirstStockDate(item.firstStockInDate)}
                </p>
              ) : null}
              <MalagaStoresSummary availability={item.availability} />
              <p className="price">{formatPrice(item.sellPrice)}</p>
              <button type="button" className="btn secondary" onClick={() => onSelect(item, 'novedades-malaga')}>
                Vigilar este listado
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
