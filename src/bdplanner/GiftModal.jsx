import { useState } from 'react';

function GiftModalForm({ initial, linkedToCex, onClose, onSave }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState(initial?.price ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');

  function handleSubmit(event) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }
    onSave({
      name: trimmedName,
      price: linkedToCex ? initial?.price ?? '' : price.trim(),
      url: url.trim(),
    });
  }

  return (
    <>
      <div className="bd-modal-header">
        <h3 id="gift-modal-title">{initial?.id ? 'Editar deseo' : 'Nuevo deseo'}</h3>
        <button type="button" className="bd-close-modal" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
      </div>
      <form className="bd-modal-body" onSubmit={handleSubmit}>
        <label className="bd-field">
          <span>Nombre</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="bd-field">
          <span>URL</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </label>
        {linkedToCex ? (
          <p className="bd-hint muted">El precio se toma del seguimiento CeX mientras esté activo.</p>
        ) : (
          <label className="bd-field">
            <span>Precio manual (€)</span>
            <input
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Ej. 299"
            />
          </label>
        )}
        <div className="bd-modal-footer">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn primary">
            Guardar
          </button>
        </div>
      </form>
    </>
  );
}

export default function GiftModal({ open, initial, linkedToCex, onClose, onSave }) {
  if (!open) {
    return null;
  }

  const formKey = initial?.id ?? `new-${initial?.name ?? ''}`;

  return (
    <div className="bd-modal-overlay active" role="presentation" onClick={onClose}>
      <div
        className="bd-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gift-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <GiftModalForm
          key={formKey}
          initial={initial}
          linkedToCex={linkedToCex}
          onClose={onClose}
          onSave={onSave}
        />
      </div>
    </div>
  );
}
