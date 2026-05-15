import { useCallback, useEffect, useMemo, useState } from 'react';

const VIEWS = {
  HOME: 'home',
  WATCHES: 'watches',
  DETAIL: 'detail',
};

const RETAILERS = {
  CEX: 'cex',
  CC: 'cc',
};

function formatPrice(value) {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
}

function productImageProxyUrl(imageUrl, retailer = RETAILERS.CEX) {
  if (!imageUrl) {
    return null;
  }
  const route = retailer === RETAILERS.CC ? '/api/cc/image' : '/api/cex/image';
  return `${route}?url=${encodeURIComponent(imageUrl)}`;
}

function ProductThumb({ imageUrl, retailer = RETAILERS.CEX, size = 64 }) {
  const [failed, setFailed] = useState(false);
  const src = productImageProxyUrl(imageUrl, retailer);

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

function CcStoreSummary({ availability, compact = false }) {
  if (!availability) {
    return null;
  }
  if (!availability.inStock) {
    return compact ? null : <p className="muted">No disponible</p>;
  }
  return (
    <div className={`availability-summary cc-store${compact ? ' is-compact' : ''}`}>
      <p className="availability-heading">Artículo único</p>
      {availability.storeName ? (
        <p className="cc-store-name">
          <strong>{availability.storeName}</strong>
        </p>
      ) : (
        <p className="muted">Tienda por confirmar (actualiza el seguimiento)</p>
      )}
    </div>
  );
}

function StoreAvailabilitySummary({ availability, compact = false }) {
  if (!availability) {
    return null;
  }

  const { malagaStores, hasMalagaPickup, onlineAvailable, onlineQuantity } = availability;

  if (!hasMalagaPickup && !onlineAvailable) {
    return compact ? null : <p className="muted">Sin stock conocido</p>;
  }

  return (
    <div className={`availability-summary${compact ? ' is-compact' : ''}`}>
      {hasMalagaPickup ? (
        <div className="malaga-pickup">
          <p className="availability-heading">Recogida en Málaga</p>
          <ul className="malaga-store-list">
            {malagaStores.map((store) => (
              <li key={store.storeId ?? store.storeName}>
                <strong>{store.storeName}</strong>
                {store.quantity != null ? ` · ${store.quantity} uds.` : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {onlineAvailable ? (
        <p className={`online-purchase${hasMalagaPickup ? ' with-malaga' : ''}`}>
          {hasMalagaPickup ? 'También disponible: ' : ''}
          <strong>Compra online</strong>
          {onlineQuantity != null ? ` (${onlineQuantity} uds.)` : ''}
        </p>
      ) : null}
    </div>
  );
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

function sortSearchResults(list, sortBy) {
  const sorted = [...list];
  if (sortBy === 'price-asc') {
    return sorted.sort((a, b) => (a.sellPrice ?? 0) - (b.sellPrice ?? 0));
  }
  if (sortBy === 'price-desc') {
    return sorted.sort((a, b) => (b.sellPrice ?? 0) - (a.sellPrice ?? 0));
  }
  return sorted;
}

function SearchPanel({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [hideOutOfStock, setHideOutOfStock] = useState(true);
  const [malagaOnly, setMalagaOnly] = useState(false);
  const [sortBy, setSortBy] = useState('price-desc');

  const filtered = useMemo(() => {
    let list = results;
    if (hideOutOfStock) {
      list = list.filter((item) => item.inStock);
    }
    if (malagaOnly) {
      list = list.filter((item) => item.availability?.hasMalagaPickup);
    }
    if (gradeFilter) {
      list = list.filter((item) => (item.grade ?? '').toUpperCase() === gradeFilter);
    }
    return sortSearchResults(list, sortBy);
  }, [results, gradeFilter, hideOutOfStock, malagaOnly, sortBy]);

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
          <label className="toggle">
            <input
              type="checkbox"
              checked={malagaOnly}
              onChange={(e) => setMalagaOnly(e.target.checked)}
            />
            Solo recogida Málaga
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
          <label>
            Ordenar
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="price-desc">Precio: mayor a menor</option>
              <option value="price-asc">Precio: menor a mayor</option>
              <option value="relevance">Relevancia / stock</option>
            </select>
          </label>
        </div>
      ) : null}
      <ul className="result-list">
        {filtered.map((item) => (
          <li key={item.boxId} className="result-card">
            <ProductThumb key={item.boxId} imageUrl={item.imageUrl} size={72} />
            <div className="result-body">
              <h3>{item.title}</h3>
              <p className="meta">{item.variantLabel ?? 'Variante CeX'}</p>
              <p className={`stock-badge ${item.inStock ? 'in-stock' : 'out-of-stock'}`}>
                {item.stockStatus ?? (item.inStock ? 'Con stock' : 'Sin stock')}
              </p>
              <StoreAvailabilitySummary availability={item.availability} compact />
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

function CcResultList({ items, onSelect, searchQuery }) {
  return (
    <ul className="result-list">
      {items.map((item) => (
        <li key={item.productId} className="result-card cc-card">
          <ProductThumb key={item.productId} imageUrl={item.imageUrl} retailer={RETAILERS.CC} size={72} />
          <div className="result-body">
            <h3>{item.title}</h3>
            <p className="meta">{item.variantLabel ?? 'Cash Converters'}</p>
            <p className={`stock-badge ${item.inStock ? 'in-stock' : 'out-of-stock'}`}>
              {item.stockStatus ?? (item.inStock ? 'Disponible' : 'No disponible')}
            </p>
            <CcStoreSummary availability={item.availability} compact />
            <p className="price">{formatPrice(item.sellPrice)}</p>
            <button
              type="button"
              className="btn secondary"
              onClick={() => onSelect(item, searchQuery)}
            >
              Vigilar este artículo
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CcSearchPanel({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [alternates, setAlternates] = useState([]);
  const [relatedQueriesTried, setRelatedQueriesTried] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [hideUnavailable, setHideUnavailable] = useState(true);
  const [sortBy, setSortBy] = useState('price-desc');

  const filtered = useMemo(() => {
    let list = results;
    if (hideUnavailable) {
      list = list.filter((item) => item.inStock);
    }
    if (gradeFilter) {
      list = list.filter((item) => (item.grade ?? '').toLowerCase() === gradeFilter.toLowerCase());
    }
    return sortSearchResults(list, sortBy);
  }, [results, gradeFilter, hideUnavailable, sortBy]);

  async function runSearch({ q, start = 0, append = false }) {
    const params = new URLSearchParams({
      q,
      start: String(start),
      limit: '24',
    });
    if (append) {
      params.set('alternates', '0');
    }
    const payload = await api(`/api/cc/search?${params}`);
    const nextResults = payload.results ?? [];
    if (append) {
      setResults((prev) => {
        const seen = new Set(prev.map((item) => item.productId));
        const merged = [...prev];
        for (const item of nextResults) {
          if (!seen.has(item.productId)) {
            seen.add(item.productId);
            merged.push(item);
          }
        }
        return merged;
      });
    } else {
      setResults(nextResults);
      setAlternates(payload.alternates ?? []);
      setRelatedQueriesTried(payload.relatedQueriesTried ?? []);
    }
    setPagination(payload.pagination ?? null);
    return payload;
  }

  async function handleSearch(event) {
    event?.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setError('Introduce al menos 2 caracteres.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await runSearch({ q, start: 0, append: false });
    } catch (searchError) {
      setError(searchError.message);
      setResults([]);
      setAlternates([]);
      setRelatedQueriesTried([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadMore() {
    if (!pagination?.nextStart) {
      return;
    }
    const q = query.trim();
    setLoadingMore(true);
    setError('');
    try {
      await runSearch({ q, start: pagination.nextStart, append: true });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="panel">
      <h2>Buscar en Cash Converters</h2>
      <form className="search-form" onSubmit={handleSearch}>
        <input
          type="search"
          inputMode="search"
          placeholder="Ej. Galaxy Z fold 7"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="btn primary" disabled={loading}>
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      <p className="muted search-scope">Búsqueda en catálogo nacional de móviles CC</p>
      {pagination && results.length > 0 && results.length < 3 ? (
        <p className="muted search-hint">
          Solo {pagination.count} artículo{pagination.count === 1 ? '' : 's'} con esa búsqueda exacta.
          Revisa resultados similares abajo o prueba una consulta más corta.
        </p>
      ) : null}
      {results.length > 0 ? (
        <div className="filters">
          <label className="toggle">
            <input
              type="checkbox"
              checked={hideUnavailable}
              onChange={(e) => setHideUnavailable(e.target.checked)}
            />
            Solo disponibles
          </label>
          <label>
            Estado
            <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
              <option value="">Todos</option>
              <option value="Usado">Usado</option>
              <option value="Bueno">Bueno</option>
              <option value="Perfecto">Perfecto</option>
            </select>
          </label>
          <label>
            Ordenar
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="price-desc">Precio: mayor a menor</option>
              <option value="price-asc">Precio: menor a mayor</option>
            </select>
          </label>
        </div>
      ) : null}
      {filtered.length > 0 ? (
        <CcResultList items={filtered} onSelect={onSelect} searchQuery={query.trim()} />
      ) : results.length === 0 && !loading && query.trim().length >= 2 ? (
        <p className="muted">Sin resultados. Prueba otra búsqueda.</p>
      ) : null}
      {pagination?.hasMore ? (
        <button
          type="button"
          className="btn ghost block load-more"
          disabled={loadingMore}
          onClick={handleLoadMore}
        >
          {loadingMore ? 'Cargando…' : 'Cargar más resultados'}
        </button>
      ) : null}
      {alternates.map((group) => (
        <section key={group.query} className="alternate-results">
          <h3 className="alternate-heading">
            Similares: «{group.query}» ({group.results.length})
          </h3>
          <CcResultList items={group.results} onSelect={onSelect} searchQuery={group.query} />
        </section>
      ))}
      {alternates.length === 0 && relatedQueriesTried.length > 0 && results.length > 0 ? (
        <p className="muted search-hint">
          También buscamos: {relatedQueriesTried.map((q) => `«${q}»`).join(', ')}. En catálogo CC solo
          aparece este artículo para esas variantes.
        </p>
      ) : null}
    </section>
  );
}

function WatchCard({ watch, retailer, onOpen, onRemove, onRefresh }) {
  const delta = formatDelta(watch);
  const watchRetailer = retailer ?? watch.retailer ?? RETAILERS.CEX;
  return (
    <article className="watch-card">
      <button type="button" className="watch-main" onClick={() => onOpen(watch)}>
        <ProductThumb key={watch.id} imageUrl={watch.imageUrl} retailer={watchRetailer} size={64} />
        <div className="watch-copy">
          <h3>{watch.title}</h3>
          <p className="meta">{watch.variantLabel ?? watch.productId ?? watch.cexBoxId}</p>
          <p className="price">{formatPrice(watch.latestPrice?.sellPrice)}</p>
          {watchRetailer === RETAILERS.CC ? (
            <CcStoreSummary availability={watch.availability} compact />
          ) : (
            <StoreAvailabilitySummary availability={watch.availability} compact />
          )}
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

function DetailView({ watchId, retailer, onBack }) {
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
      <h3>Disponibilidad</h3>
      {retailer === RETAILERS.CC || data.watch?.retailer === RETAILERS.CC ? (
        <CcStoreSummary availability={data.availabilitySummary} />
      ) : (
        <>
          <StoreAvailabilitySummary availability={data.availabilitySummary} />
          {data.availabilitySummary?.hasMalagaPickup ? null : data.availabilitySummary?.onlineAvailable ? (
            <p className="muted detail-hint">
              No hay recogida en tiendas de Málaga. Las demás ubicaciones con stock equivalen a compra online en
              CeX.
            </p>
          ) : data.latestStores?.length ? (
            <ul className="store-list muted-stores">
              {data.latestStores
                .filter((store) => store.in_stock)
                .map((store) => (
                  <li key={`${store.store_id}-${store.recorded_at}`}>
                    <span>{store.store_name}</span>
                    <span className="out-stock">Sin recogida en Málaga</span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="muted">Sin datos de tiendas; actualiza para refrescar stock.</p>
          )}
        </>
      )}
    </section>
  );
}

export default function App() {
  const [retailer, setRetailer] = useState(RETAILERS.CEX);
  const [view, setView] = useState(VIEWS.HOME);
  const [watches, setWatches] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pulling, setPulling] = useState(false);

  const loadWatches = useCallback(async () => {
    const payload = await api(`/api/watches?retailer=${encodeURIComponent(retailer)}`);
    setWatches(payload.watches ?? []);
  }, [retailer]);

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

  function switchRetailer(nextRetailer) {
    setRetailer(nextRetailer);
    setView(VIEWS.HOME);
    setSelectedId(null);
    setMessage('');
    setError('');
  }

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
      const productId = item.boxId ?? item.productId;
      await api('/api/watches', {
        method: 'POST',
        body: JSON.stringify({
          retailer,
          productId,
          cexBoxId: productId,
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

  const headerTitle = retailer === RETAILERS.CC ? 'Cash Converters' : 'CeX Tracker';
  const headerSubtitle =
    retailer === RETAILERS.CC
      ? 'Precios de móviles en Cash Converters España'
      : 'Precios y stock en CeX España';

  return (
    <div className="app">
      <header className="header">
        <nav className="retailer-tabs" aria-label="Tienda">
          <button
            type="button"
            className={retailer === RETAILERS.CEX ? 'active' : ''}
            onClick={() => switchRetailer(RETAILERS.CEX)}
          >
            CeX
          </button>
          <button
            type="button"
            className={retailer === RETAILERS.CC ? 'active' : ''}
            onClick={() => switchRetailer(RETAILERS.CC)}
          >
            Cash Converters
          </button>
        </nav>
        <h1>{headerTitle}</h1>
        <p className="subtitle">{headerSubtitle}</p>
      </header>

      {pulling ? <p className="pull-hint">Actualizando…</p> : null}
      {message ? <p className="toast">{message}</p> : null}
      {error ? <p className="error banner">{error}</p> : null}

      <main className="main">
        {view === VIEWS.HOME && retailer === RETAILERS.CEX ? (
          <SearchPanel onSelect={handleAddWatch} />
        ) : null}
        {view === VIEWS.HOME && retailer === RETAILERS.CC ? (
          <CcSearchPanel onSelect={handleAddWatch} />
        ) : null}
        {view === VIEWS.WATCHES ? (
          <section className="panel">
            <h2>
              Mis móviles {retailer === RETAILERS.CC ? 'CC' : 'CeX'} ({watches.length})
            </h2>
            {watches.length === 0 ? (
              <p className="muted">No vigilas ningún listado. Busca un modelo para empezar.</p>
            ) : (
              <div className="watch-grid">
                {watches.map((watch) => (
                  <WatchCard
                    key={watch.id}
                    watch={watch}
                    retailer={retailer}
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
            retailer={retailer}
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
