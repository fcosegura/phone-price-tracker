import { useCallback, useEffect, useMemo, useState } from 'react';

const VIEWS = {
  HOME: 'home',
  WATCHES: 'watches',
  DETAIL: 'detail',
};

function formatPrice(value) {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
}

function formatDelta(watch) {
  if (!watch?.priceChange || watch.priceChange.delta == null) {
    return { label: 'Sin cambio reciente', className: 'neutral' };
  }
  const { delta, percent } = watch.priceChange;
  if (delta === 0) {
    return { label: 'Sin cambio', className: 'neutral' };
  }
  const sign = delta > 0 ? '+' : '';
  const pct = percent != null ? ` (${sign}${percent.toFixed(1)}%)` : '';
  return {
    label: `${sign}${formatPrice(delta)}${pct}`,
    className: delta < 0 ? 'down' : 'up',
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? 'Error de red');
  }
  return payload;
}

function PriceChart({ prices }) {
  if (!prices?.length) {
    return <p className="muted">Aún no hay historial de precio.</p>;
  }
  const values = prices.map((p) => p.sell_price).filter((v) => v != null);
  if (values.length === 0) {
    return <p className="muted">Precio no disponible en el historial.</p>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 280;
  const height = 140;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * (height - 16) - 8;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historial de precio">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function SearchPanel({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [hideOutOfStock, setHideOutOfStock] = useState(true);

  const filtered = useMemo(() => {
    let list = results;
    if (hideOutOfStock) {
      list = list.filter((item) => item.inStock);
    }
    if (gradeFilter) {
      list = list.filter((item) => (item.grade ?? '').toUpperCase() === gradeFilter);
    }
    return list;
  }, [results, gradeFilter, hideOutOfStock]);

  async function handleSearch(event) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setError('Introduce al menos 2 caracteres.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = await api(`/api/cex/search?q=${encodeURIComponent(q)}`);
      setResults(payload.results ?? []);
    } catch (searchError) {
      setError(searchError.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <h2>Buscar en CeX España</h2>
      <form className="search-form" onSubmit={handleSearch}>
        <input
          type="search"
          inputMode="search"
          placeholder="Ej. Samsung Galaxy S24 Ultra 256GB"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="btn primary" disabled={loading}>
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      {results.length > 0 ? (
        <div className="filters">
          <label className="toggle">
            <input
              type="checkbox"
              checked={hideOutOfStock}
              onChange={(e) => setHideOutOfStock(e.target.checked)}
            />
            Solo con stock
          </label>
          <label>
            Grado
            <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
              <option value="">Todos</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </label>
        </div>
      ) : null}
      <ul className="result-list">
        {filtered.map((item) => (
          <li key={item.boxId} className="result-card">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" loading="lazy" width="72" height="72" />
            ) : (
              <div className="thumb-placeholder" />
            )}
            <div className="result-body">
              <h3>{item.title}</h3>
              <p className="meta">{item.variantLabel ?? 'Variante CeX'}</p>
              <p className={`stock-badge ${item.inStock ? 'in-stock' : 'out-of-stock'}`}>
                {item.stockStatus ?? (item.inStock ? 'Con stock' : 'Sin stock')}
              </p>
              <p className="price">{formatPrice(item.sellPrice)}</p>
              <button
                type="button"
                className="btn secondary"
                onClick={() => onSelect(item, query.trim())}
              >
                Vigilar este listado
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WatchCard({ watch, onOpen, onRemove, onRefresh }) {
  const delta = formatDelta(watch);
  return (
    <article className="watch-card">
      <button type="button" className="watch-main" onClick={() => onOpen(watch)}>
        {watch.imageUrl ? (
          <img src={watch.imageUrl} alt="" loading="lazy" width="64" height="64" />
        ) : (
          <div className="thumb-placeholder" />
        )}
        <div className="watch-copy">
          <h3>{watch.title}</h3>
          <p className="meta">{watch.variantLabel ?? watch.cexBoxId}</p>
          <p className="price">{formatPrice(watch.latestPrice?.sellPrice)}</p>
          <span className={`badge ${delta.className}`}>{delta.label}</span>
        </div>
      </button>
      <div className="watch-actions">
        <button type="button" className="btn ghost" onClick={() => onRefresh(watch.id)}>
          Actualizar
        </button>
        <button type="button" className="btn ghost danger" onClick={() => onRemove(watch.id)}>
          Quitar
        </button>
      </div>
    </article>
  );
}

function DetailView({ watchId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await api(`/api/watches/${watchId}/history`);
      setData(payload);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [watchId]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const payload = await api(`/api/watches/${watchId}/history`);
        if (active) {
          setData(payload);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [watchId]);

  async function handleRefresh() {
    try {
      await api(`/api/watches/${watchId}/refresh`, { method: 'POST', body: '{}' });
      await load();
    } catch (refreshError) {
      setError(refreshError.message);
    }
  }

  if (loading) {
    return <p className="muted">Cargando detalle…</p>;
  }
  if (error) {
    return <p className="error">{error}</p>;
  }
  if (!data?.watch) {
    return <p className="error">No encontrado.</p>;
  }

  const latestPrice = data.prices?.[data.prices.length - 1]?.sell_price;
  const prevPrice = data.prices?.length > 1 ? data.prices[data.prices.length - 2]?.sell_price : null;
  const delta =
    latestPrice != null && prevPrice != null
      ? latestPrice - prevPrice
      : null;

  return (
    <section className="panel detail">
      <button type="button" className="btn ghost back" onClick={onBack}>
        ← Volver
      </button>
      <h2>{data.watch.title}</h2>
      <p className="meta">{data.watch.variantLabel}</p>
      <p className="price large">{formatPrice(latestPrice)}</p>
      {delta != null && delta !== 0 ? (
        <span className={`badge ${delta < 0 ? 'down' : 'up'}`}>
          {delta > 0 ? '+' : ''}
          {formatPrice(delta)} vs lectura anterior
        </span>
      ) : (
        <span className="badge neutral">Sin cambio vs lectura anterior</span>
      )}
      <button type="button" className="btn primary block" onClick={handleRefresh}>
        Actualizar ahora
      </button>
      <h3>Historial de precio</h3>
      <PriceChart prices={data.prices} />
      <ul className="history-list">
        {[...(data.prices ?? [])].reverse().slice(0, 8).map((row) => (
          <li key={row.recorded_at}>
            <span>{new Date(row.recorded_at).toLocaleString('es-ES')}</span>
            <strong>{formatPrice(row.sell_price)}</strong>
          </li>
        ))}
      </ul>
      <h3>Disponibilidad en tiendas</h3>
      {data.latestStores?.length ? (
        <ul className="store-list">
          {data.latestStores.map((store) => (
            <li key={`${store.store_id}-${store.recorded_at}`}>
              <span>{store.store_name}</span>
              <span className={store.in_stock ? 'in-stock' : 'out-stock'}>
                {store.in_stock ? `En stock${store.quantity != null ? ` (${store.quantity})` : ''}` : 'Sin stock'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Sin datos de tiendas; puede mostrarse solo stock de catálogo.</p>
      )}
    </section>
  );
}

export default function App() {
  const [view, setView] = useState(VIEWS.HOME);
  const [watches, setWatches] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pulling, setPulling] = useState(false);

  const loadWatches = useCallback(async () => {
    const payload = await api('/api/watches');
    setWatches(payload.watches ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await loadWatches();
      } catch (loadError) {
        if (active) {
          setError(loadError.message);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [loadWatches]);

  useEffect(() => {
    let startY = 0;
    function onTouchStart(e) {
      if (window.scrollY <= 0) {
        startY = e.touches[0].clientY;
      }
    }
    async function onTouchEnd(e) {
      if (startY && e.changedTouches[0].clientY - startY > 80 && window.scrollY <= 0) {
        setPulling(true);
        try {
          await loadWatches();
          setMessage('Lista actualizada');
        } catch (pullError) {
          setError(pullError.message);
        } finally {
          setPulling(false);
          startY = 0;
        }
      }
    }
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [loadWatches]);

  async function handleAddWatch(item, searchQuery) {
    setError('');
    setMessage('');
    try {
      await api('/api/watches', {
        method: 'POST',
        body: JSON.stringify({
          cexBoxId: item.boxId,
          searchQuery,
          title: item.title,
          imageUrl: item.imageUrl,
          grade: item.grade,
          storageGb: item.storageGb,
          variantLabel: item.variantLabel,
        }),
      });
      await loadWatches();
      setMessage('Añadido a tu lista de seguimiento.');
      setView(VIEWS.WATCHES);
    } catch (addError) {
      setError(addError.message);
    }
  }

  async function handleRemove(id) {
    try {
      await api(`/api/watches/${id}`, { method: 'DELETE' });
      await loadWatches();
      if (selectedId === id) {
        setView(VIEWS.WATCHES);
        setSelectedId(null);
      }
    } catch (removeError) {
      setError(removeError.message);
    }
  }

  async function handleRefresh(id) {
    try {
      await api(`/api/watches/${id}/refresh`, { method: 'POST', body: '{}' });
      await loadWatches();
      setMessage('Precio actualizado.');
    } catch (refreshError) {
      setError(refreshError.message);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>CeX Tracker</h1>
        <p className="subtitle">Precios y stock en CeX España</p>
      </header>

      {pulling ? <p className="pull-hint">Actualizando…</p> : null}
      {message ? <p className="toast">{message}</p> : null}
      {error ? <p className="error banner">{error}</p> : null}

      <main className="main">
        {view === VIEWS.HOME ? <SearchPanel onSelect={handleAddWatch} /> : null}
        {view === VIEWS.WATCHES ? (
          <section className="panel">
            <h2>Mis móviles ({watches.length})</h2>
            {watches.length === 0 ? (
              <p className="muted">No vigilas ningún listado. Busca un modelo para empezar.</p>
            ) : (
              <div className="watch-grid">
                {watches.map((watch) => (
                  <WatchCard
                    key={watch.id}
                    watch={watch}
                    onOpen={(w) => {
                      setSelectedId(w.id);
                      setView(VIEWS.DETAIL);
                    }}
                    onRemove={handleRemove}
                    onRefresh={handleRefresh}
                  />
                ))}
              </div>
            )}
          </section>
        ) : null}
        {view === VIEWS.DETAIL && selectedId ? (
          <DetailView
            watchId={selectedId}
            onBack={() => {
              setView(VIEWS.WATCHES);
              loadWatches().catch(() => {});
            }}
          />
        ) : null}
      </main>

      <nav className="bottom-nav">
        <button
          type="button"
          className={view === VIEWS.HOME ? 'active' : ''}
          onClick={() => setView(VIEWS.HOME)}
        >
          Buscar
        </button>
        <button
          type="button"
          className={view === VIEWS.WATCHES || view === VIEWS.DETAIL ? 'active' : ''}
          onClick={() => {
            setView(VIEWS.WATCHES);
            setSelectedId(null);
          }}
        >
          Mis móviles
        </button>
      </nav>
    </div>
  );
}
