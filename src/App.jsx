import { useCallback, useEffect, useMemo, useState } from 'react';
import BdPlannerApp from './bdplanner/BdPlannerApp.jsx';
import { loadGifts } from './bdplanner/storage.js';
import { isWatchInWishlist, persistGifts, toggleWishFromWatch } from './bdplanner/wishList.js';

const VIEWS = {
  HOME: 'home',
  WATCHES: 'watches',
  DETAIL: 'detail',
  BIRTHDAY: 'birthday',
};

function Icon({ name, className = '', filled = false }) {
  const commonProps = {
    className: `icon${className ? ` ${className}` : ''}`,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': 'true',
  };

  if (name === 'heart') {
    return (
      <svg {...commonProps} fill={filled ? 'currentColor' : 'none'}>
        <path
          d="M20.25 8.75c0 5.25-8.25 9.75-8.25 9.75S3.75 14 3.75 8.75A4.25 4.25 0 0 1 11.2 6a.99.99 0 0 0 1.6 0 4.25 4.25 0 0 1 7.45 2.75Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  const paths = {
    bell: (
      <>
        <path
          d="M18.25 9.9c0-3.45-2.35-6.15-6.25-6.15S5.75 6.45 5.75 9.9c0 5.35-2 5.8-2 5.8h16.5s-2-.45-2-5.8Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9.75 18.25a2.35 2.35 0 0 0 4.5 0"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </>
    ),
    list: (
      <>
        <path d="M8 7h11M8 12h11M8 17h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </>
    ),
    refresh: (
      <>
        <path
          d="M19 7.75v4.5h-4.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18.1 12.25A6.25 6.25 0 1 1 16 7.6L19 10.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
    search: (
      <>
        <path
          d="M10.75 18.25a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path d="m16.15 16.15 4.1 4.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
    trash: (
      <>
        <path d="M4.75 6.75h14.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path
          d="M9.75 6.75V5.4c0-.9.7-1.65 1.6-1.65h1.3c.9 0 1.6.75 1.6 1.65v1.35M17.25 6.75l-.75 12.1a1.55 1.55 0 0 1-1.55 1.4h-5.9a1.55 1.55 0 0 1-1.55-1.4l-.75-12.1"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M10 10.75v5.5M14 10.75v5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
    gift: (
      <>
        <path
          d="M12 8.25v11.25M8.25 11.25h7.5M6.75 8.25h10.5c.6 0 1.05-.45 1.05-1.05v-1.2c0-.6-.45-1.05-1.05-1.05H6.75c-.6 0-1.05.45-1.05 1.05v1.2c0 .6.45 1.05 1.05 1.05Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9.75 5.25c0-1.2 1.05-2.1 2.25-2.1s2.25.9 2.25 2.1M9.75 5.25H6.9c-.75 0-1.35.6-1.35 1.35v1.2M14.25 5.25h2.85c.75 0 1.35.6 1.35 1.35v1.2"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
    cake: (
      <path
        d="M6 14.25h12M8.25 10.5c0-1.2.9-2.1 2.1-2.1h3.3c1.2 0 2.1.9 2.1 2.1M7.5 14.25V11.1M12 14.25V10.35M16.5 14.25V11.1M5.25 14.25v2.25c0 .45.3.75.75.75h12c.45 0 .75-.3.75-.75v-2.25"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  };

  return <svg {...commonProps}>{paths[name]}</svg>;
}

const SEARCH_RESULT_LIMIT = 250;
const WATCH_SORT_OPTIONS = {
  FAVORITES: 'favorites',
  PRICE_ASC: 'price-asc',
  PRICE_DESC: 'price-desc',
  LAST_CHANGE_DESC: 'last-change-desc',
  LAST_CHANGE_ASC: 'last-change-asc',
};

function formatPrice(value) {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
}

function formatDateTime(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function cexImageProxyUrl(imageUrl) {
  if (!imageUrl) {
    return null;
  }
  return `/api/cex/image?url=${encodeURIComponent(imageUrl)}`;
}

function ProductThumb({ imageUrl, size = 64 }) {
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

function getWatchLastChange(watch) {
  return watch.lastChangeAt ?? watch.latestPrice?.recordedAt ?? watch.lastCheckedAt ?? watch.updatedAt ?? watch.createdAt;
}

function getWatchPrice(watch) {
  return watch.latestPrice?.sellPrice ?? null;
}

function compareNullableNumbers(a, b, direction = 'asc') {
  const aMissing = a == null || Number.isNaN(a);
  const bMissing = b == null || Number.isNaN(b);
  if (aMissing && bMissing) {
    return 0;
  }
  if (aMissing) {
    return 1;
  }
  if (bMissing) {
    return -1;
  }
  return direction === 'asc' ? a - b : b - a;
}

function compareWatchDates(a, b, direction = 'desc') {
  const aTime = getWatchLastChange(a) ? new Date(getWatchLastChange(a)).getTime() : Number.NaN;
  const bTime = getWatchLastChange(b) ? new Date(getWatchLastChange(b)).getTime() : Number.NaN;
  return compareNullableNumbers(aTime, bTime, direction === 'asc' ? 'asc' : 'desc');
}

function sortWatches(list, sortBy) {
  return [...list].sort((a, b) => {
    const favoriteOrder = Number(b.isFavorite) - Number(a.isFavorite);
    if (favoriteOrder !== 0) {
      return favoriteOrder;
    }

    if (sortBy === WATCH_SORT_OPTIONS.PRICE_ASC) {
      return compareNullableNumbers(getWatchPrice(a), getWatchPrice(b), 'asc') || compareWatchDates(a, b);
    }
    if (sortBy === WATCH_SORT_OPTIONS.PRICE_DESC) {
      return compareNullableNumbers(getWatchPrice(a), getWatchPrice(b), 'desc') || compareWatchDates(a, b);
    }
    if (sortBy === WATCH_SORT_OPTIONS.LAST_CHANGE_ASC) {
      return compareWatchDates(a, b, 'asc');
    }
    return compareWatchDates(a, b, 'desc') || a.title.localeCompare(b.title, 'es');
  });
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
  const [lastQuery, setLastQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchMeta, setSearchMeta] = useState(null);
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

  async function runSearch(q, options = {}) {
    const stockOnly = options.hideOutOfStock ?? hideOutOfStock;
    const searchSort = options.sortBy ?? sortBy;
    const params = new URLSearchParams({
      q,
      limit: String(SEARCH_RESULT_LIMIT),
      sort: searchSort,
    });
    if (stockOnly) {
      params.set('inStockOnly', '1');
    }

    setLoading(true);
    setError('');
    try {
      const payload = await api(`/api/cex/search?${params.toString()}`);
      setResults(payload.results ?? []);
      setSearchMeta({
        total: payload.total ?? payload.results?.length ?? 0,
        returned: payload.returned ?? payload.results?.length ?? 0,
        truncated: Boolean(payload.truncated),
        limit: payload.limit ?? SEARCH_RESULT_LIMIT,
      });
    } catch (searchError) {
      setError(searchError.message);
      setResults([]);
      setSearchMeta(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(event) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setError('Introduce al menos 2 caracteres.');
      return;
    }
    setLastQuery(q);
    await runSearch(q);
  }

  function handleStockFilterChange(event) {
    const checked = event.target.checked;
    setHideOutOfStock(checked);
    if (lastQuery) {
      runSearch(lastQuery, { hideOutOfStock: checked });
    }
  }

  function handleSortChange(event) {
    const value = event.target.value;
    setSortBy(value);
    if (lastQuery) {
      runSearch(lastQuery, { sortBy: value });
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
              onChange={handleStockFilterChange}
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
            <select value={sortBy} onChange={handleSortChange}>
              <option value="price-desc">Precio: mayor a menor</option>
              <option value="price-asc">Precio: menor a mayor</option>
              <option value="relevance">Relevancia / stock</option>
            </select>
          </label>
        </div>
      ) : null}
      {searchMeta ? (
        <p className="result-summary">
          Mostrando {filtered.length} de {searchMeta.total} resultados
          {searchMeta.truncated ? ` (límite ${searchMeta.limit})` : ''}
        </p>
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

function WatchCard({ watch, onOpen, onRemove, onRefresh, onToggleFavorite, onToggleWish, isInWishlist }) {
  const delta = formatDelta(watch);
  const lastChangeLabel = formatDateTime(getWatchLastChange(watch));
  return (
    <article className={`watch-card${watch.isFavorite ? ' is-favorite' : ''}`}>
      <button
        type="button"
        className="icon-button remove-watch"
        aria-label={`Quitar ${watch.title}`}
        onClick={() => onRemove(watch.id)}
      >
        <Icon name="trash" />
      </button>
      <div className="watch-card-content">
        <div className="watch-thumb-wrap">
          <ProductThumb key={watch.id} imageUrl={watch.imageUrl} size={76} />
          <button
            type="button"
            className={`favorite-icon-button${watch.isFavorite ? ' is-active' : ''}`}
            aria-label={watch.isFavorite ? 'Quitar favorito' : 'Marcar favorito'}
            onClick={() => onToggleFavorite(watch)}
          >
            <Icon name="heart" filled={watch.isFavorite} />
          </button>
          <button
            type="button"
            className={`wish-icon-button${isInWishlist ? ' is-active' : ''}`}
            aria-label={isInWishlist ? 'Quitar de deseos' : 'Añadir a deseos de cumpleaños'}
            onClick={() => onToggleWish(watch)}
          >
            <Icon name="gift" />
          </button>
        </div>
        <button
          type="button"
          className="watch-main"
          aria-label={`Abrir detalle de ${watch.title}`}
          onClick={() => onOpen(watch)}
        >
          <div className="watch-copy">
            <h3>{watch.title}</h3>
            {watch.variantLabel ? <p className="watch-variant">{watch.variantLabel}</p> : null}
            <p className="price">{formatPrice(watch.latestPrice?.sellPrice)}</p>
            <div className="watch-status-line">
              <span className={`badge ${delta.className}`}>{delta.label}</span>
              {lastChangeLabel ? <span className="last-change">Último cambio: {lastChangeLabel}</span> : null}
            </div>
            <StoreAvailabilitySummary availability={watch.availability} compact />
          </div>
        </button>
      </div>
      <button type="button" className="btn primary refresh-action" onClick={() => onRefresh(watch.id)}>
        <Icon name="refresh" />
        Actualizar
      </button>
    </article>
  );
}

function DetailView({ watchId, onBack, watch, onToggleWish, isInWishlist }) {
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
  const lastCheckedLabel = formatDateTime(data.watch.lastCheckedAt ?? data.watch.updatedAt);

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
        <span className="badge neutral">
          Sin cambio vs lectura anterior
          {lastCheckedLabel ? <span className="badge-note">Último check: {lastCheckedLabel}</span> : null}
        </span>
      )}
      <div className="detail-actions">
        <button type="button" className="btn primary block" onClick={handleRefresh}>
          Actualizar ahora
        </button>
        {watch ? (
          <button
            type="button"
            className={`btn secondary block wish-toggle-detail${isInWishlist ? ' is-active' : ''}`}
            onClick={() => onToggleWish(watch)}
          >
            <Icon name="gift" />
            {isInWishlist ? 'Quitar de deseos de cumpleaños' : 'Añadir a deseos de cumpleaños'}
          </button>
        ) : null}
      </div>
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
    </section>
  );
}

export default function App() {
  const [view, setView] = useState(VIEWS.HOME);
  const [watches, setWatches] = useState([]);
  const [gifts, setGifts] = useState(() => loadGifts());
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pulling, setPulling] = useState(false);
  const [watchSort, setWatchSort] = useState(WATCH_SORT_OPTIONS.FAVORITES);

  const loadWatches = useCallback(async () => {
    const payload = await api('/api/watches');
    setWatches(payload.watches ?? []);
  }, []);

  const sortedWatches = useMemo(() => sortWatches(watches, watchSort), [watches, watchSort]);

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

  async function handleToggleFavorite(watch) {
    try {
      await api(`/api/watches/${watch.id}/favorite`, {
        method: 'PATCH',
        body: JSON.stringify({ isFavorite: !watch.isFavorite }),
      });
      await loadWatches();
      setMessage(watch.isFavorite ? 'Quitado de favoritos.' : 'Añadido a favoritos.');
    } catch (favoriteError) {
      setError(favoriteError.message);
    }
  }

  function handleToggleWish(watch) {
    const wasInList = isWatchInWishlist(gifts, watch);
    const next = persistGifts(toggleWishFromWatch(gifts, watch));
    setGifts(next);
    setMessage(wasInList ? 'Quitado de deseos de cumpleaños.' : 'Añadido a deseos de cumpleaños.');
  }

  const selectedWatch = useMemo(
    () => watches.find((watch) => watch.id === selectedId) ?? null,
    [watches, selectedId],
  );

  const headerCopy = useMemo(() => {
    if (view === VIEWS.BIRTHDAY) {
      return { title: 'BD Planner', subtitle: 'Cuenta atrás y deseos' };
    }
    if (view === VIEWS.WATCHES || view === VIEWS.DETAIL) {
      return { title: 'CeX Tracker', subtitle: 'Precios y stock en CeX España' };
    }
    return { title: 'CeX Tracker', subtitle: 'Precios y stock en CeX España' };
  }, [view]);

  function renderGiftThumb(imageUrl) {
    return <ProductThumb imageUrl={imageUrl} size={48} />;
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>{headerCopy.title}</h1>
          <p className="subtitle">{headerCopy.subtitle}</p>
        </div>
        <button type="button" className="notification-button" aria-label="Notificaciones">
          <Icon name="bell" />
        </button>
      </header>

      {pulling ? <p className="pull-hint">Actualizando…</p> : null}
      {message ? <p className="toast">{message}</p> : null}
      {error ? <p className="error banner">{error}</p> : null}

      <main className="main">
        {view === VIEWS.HOME ? <SearchPanel onSelect={handleAddWatch} /> : null}
        {view === VIEWS.WATCHES ? (
          <section className="panel">
            <h2>Mis seguimientos ({watches.length})</h2>
            {watches.length === 0 ? (
              <p className="muted">No vigilas ningún listado. Busca un modelo para empezar.</p>
            ) : (
              <div className="watch-list-block">
                <div className="filters watch-filters">
                  <label>
                    Ordenar
                    <select value={watchSort} onChange={(event) => setWatchSort(event.target.value)}>
                      <option value={WATCH_SORT_OPTIONS.FAVORITES}>Favoritos</option>
                      <option value={WATCH_SORT_OPTIONS.PRICE_ASC}>Precio: menor a mayor</option>
                      <option value={WATCH_SORT_OPTIONS.PRICE_DESC}>Precio: mayor a menor</option>
                      <option value={WATCH_SORT_OPTIONS.LAST_CHANGE_DESC}>Último cambio: reciente primero</option>
                      <option value={WATCH_SORT_OPTIONS.LAST_CHANGE_ASC}>Último cambio: antiguo primero</option>
                    </select>
                  </label>
                </div>
                <div className="watch-grid">
                  {sortedWatches.map((watch) => (
                    <WatchCard
                      key={watch.id}
                      watch={watch}
                      onOpen={(w) => {
                        setSelectedId(w.id);
                        setView(VIEWS.DETAIL);
                      }}
                      onRemove={handleRemove}
                      onRefresh={handleRefresh}
                      onToggleFavorite={handleToggleFavorite}
                      onToggleWish={handleToggleWish}
                      isInWishlist={isWatchInWishlist(gifts, watch)}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : null}
        {view === VIEWS.DETAIL && selectedId ? (
          <DetailView
            watchId={selectedId}
            watch={selectedWatch}
            isInWishlist={selectedWatch ? isWatchInWishlist(gifts, selectedWatch) : false}
            onToggleWish={handleToggleWish}
            onBack={() => {
              setView(VIEWS.WATCHES);
              loadWatches().catch(() => {});
            }}
          />
        ) : null}
        {view === VIEWS.BIRTHDAY ? (
          <BdPlannerApp
            watches={watches}
            gifts={gifts}
            onGiftsChange={setGifts}
            formatThumb={renderGiftThumb}
          />
        ) : null}
      </main>

      <nav className="bottom-nav">
        <button
          type="button"
          className={view === VIEWS.HOME ? 'active' : ''}
          onClick={() => setView(VIEWS.HOME)}
        >
          <Icon name="search" />
          <span>Buscar</span>
        </button>
        <button
          type="button"
          className={view === VIEWS.WATCHES || view === VIEWS.DETAIL ? 'active' : ''}
          onClick={() => {
            setView(VIEWS.WATCHES);
            setSelectedId(null);
          }}
        >
          <Icon name="list" />
          <span>Seguimientos</span>
        </button>
        <button
          type="button"
          className={view === VIEWS.BIRTHDAY ? 'active' : ''}
          onClick={() => {
            setView(VIEWS.BIRTHDAY);
            setSelectedId(null);
            loadWatches().catch(() => {});
          }}
        >
          <Icon name="cake" />
          <span>Cumpleaños</span>
        </button>
      </nav>
    </div>
  );
}
