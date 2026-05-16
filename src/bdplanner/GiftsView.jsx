import { useMemo, useState } from 'react';
import GiftModal from './GiftModal.jsx';
import { buildWatchMap, resolveWishDisplay } from './wishList.js';
import { normalizeGift } from './storage.js';

function formatPrice(value) {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
}

export default function GiftsView({
  gifts,
  watches,
  formatThumb,
  onUpdateGifts,
}) {
  const [draftName, setDraftName] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGift, setEditingGift] = useState(null);

  const watchById = useMemo(() => buildWatchMap(watches), [watches]);

  const sortedGifts = useMemo(
    () => [...gifts].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite)),
    [gifts],
  );

  function commit(nextGifts) {
    onUpdateGifts(nextGifts.map(normalizeGift));
  }

  function openCreateModal() {
    const name = draftName.trim();
    setEditingGift(name ? { name } : null);
    setModalOpen(true);
  }

  function openEditModal(gift) {
    setEditingGift(gift);
    setModalOpen(true);
  }

  function handleSave(fields) {
    if (editingGift?.id) {
      commit(
        gifts.map((gift) =>
          gift.id === editingGift.id
            ? { ...gift, name: fields.name, price: fields.price, url: fields.url }
            : gift,
        ),
      );
    } else {
      commit([
        ...gifts,
        normalizeGift({
          id: crypto.randomUUID(),
          name: fields.name,
          price: fields.price,
          url: fields.url,
          isFavorite: false,
          addedAt: new Date().toISOString(),
        }),
      ]);
      setDraftName('');
    }
    setModalOpen(false);
    setEditingGift(null);
  }

  function removeGift(id) {
    commit(gifts.filter((gift) => gift.id !== id));
  }

  function toggleFavorite(id) {
    commit(
      gifts.map((gift) => (gift.id === id ? { ...gift, isFavorite: !gift.isFavorite } : gift)),
    );
  }

  return (
    <section className="panel bd-panel">
      <h2 className="bd-section-title">Lista de deseos</h2>
      <div className="bd-input-row">
        <input
          type="text"
          placeholder="Añadir idea rápida…"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              openCreateModal();
            }
          }}
        />
        <button type="button" className="btn primary" onClick={openCreateModal}>
          Añadir
        </button>
      </div>

      {sortedGifts.length === 0 ? (
        <p className="muted">Aún no tienes deseos. Añade uno manualmente o desde seguimientos CeX.</p>
      ) : (
        <ul className="bd-gift-list">
          {sortedGifts.map((gift) => {
            const display = resolveWishDisplay(gift, watchById);
            const priceText =
              display.price != null ? formatPrice(display.price) : display.priceLabel || '—';

            return (
              <li key={gift.id} className="bd-gift-item">
                <button
                  type="button"
                  className={`bd-fav-btn${gift.isFavorite ? ' is-active' : ''}`}
                  aria-label={gift.isFavorite ? 'Quitar favorito' : 'Marcar favorito'}
                  onClick={() => toggleFavorite(gift.id)}
                >
                  ♥
                </button>
                {gift.imageUrl && formatThumb ? (
                  <div className="bd-gift-thumb">{formatThumb(gift.imageUrl)}</div>
                ) : null}
                <div className="bd-gift-body">
                  <div className="bd-gift-title-row">
                    <strong>{gift.name}</strong>
                    {gift.cexWatchId ? (
                      <span
                        className={`bd-badge${display.orphaned ? ' is-warning' : ' is-linked'}`}
                      >
                        {display.orphaned ? 'Sin seguimiento' : 'CeX'}
                      </span>
                    ) : (
                      <span className="bd-badge">Manual</span>
                    )}
                  </div>
                  <p className="bd-gift-price">{priceText}</p>
                  {gift.url ? (
                    <a className="bd-gift-link" href={gift.url} target="_blank" rel="noreferrer">
                      Abrir enlace
                    </a>
                  ) : null}
                </div>
                <div className="bd-gift-actions">
                  <button type="button" className="btn ghost small" onClick={() => openEditModal(gift)}>
                    Editar
                  </button>
                  <button type="button" className="btn ghost small danger" onClick={() => removeGift(gift.id)}>
                    Eliminar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <GiftModal
        open={modalOpen}
        initial={editingGift}
        linkedToCex={Boolean(editingGift?.cexWatchId)}
        onClose={() => {
          setModalOpen(false);
          setEditingGift(null);
        }}
        onSave={handleSave}
      />
    </section>
  );
}
