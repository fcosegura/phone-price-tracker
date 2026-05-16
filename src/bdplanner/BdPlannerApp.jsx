import { useState } from 'react';
import CountdownView from './CountdownView.jsx';
import GiftsView from './GiftsView.jsx';
import SettingsView from './SettingsView.jsx';
import { useBirthdayCountdown } from './useBirthdayCountdown.js';
import { loadGifts } from './storage.js';
import { persistGifts } from './wishList.js';

const BD_VIEWS = {
  COUNTDOWN: 'countdown',
  GIFTS: 'gifts',
  SETTINGS: 'settings',
};

export default function BdPlannerApp({ watches, gifts, onGiftsChange, formatThumb }) {
  const [bdView, setBdView] = useState(BD_VIEWS.COUNTDOWN);
  const { birthDate, setBirthDate, countdown } = useBirthdayCountdown();

  function handleGiftsUpdate(nextGifts) {
    const saved = persistGifts(nextGifts);
    onGiftsChange(saved);
  }

  function handleDataImported() {
    onGiftsChange(loadGifts());
  }

  const titles = {
    [BD_VIEWS.COUNTDOWN]: { title: 'Cuenta atrás', subtitle: 'Días para el gran momento' },
    [BD_VIEWS.GIFTS]: { title: 'Lista de deseos', subtitle: 'Ideas para consentirte' },
    [BD_VIEWS.SETTINGS]: { title: 'Ajustes', subtitle: 'Cumpleaños y backup' },
  };

  const header = titles[bdView];

  return (
    <div className="bd-app">
      <div className="bd-header-copy">
        <h2>{header.title}</h2>
        <p className="subtitle">{header.subtitle}</p>
      </div>

      {bdView === BD_VIEWS.COUNTDOWN ? (
        <CountdownView countdown={countdown} birthDate={birthDate} />
      ) : null}
      {bdView === BD_VIEWS.GIFTS ? (
        <GiftsView
          gifts={gifts}
          watches={watches}
          formatThumb={formatThumb}
          onUpdateGifts={handleGiftsUpdate}
        />
      ) : null}
      {bdView === BD_VIEWS.SETTINGS ? (
        <SettingsView
          key={birthDate || 'empty'}
          birthDate={birthDate}
          onBirthDateChange={setBirthDate}
          onDataImported={handleDataImported}
        />
      ) : null}

      <nav className="bd-subnav" aria-label="Secciones cumpleaños">
        <button
          type="button"
          className={bdView === BD_VIEWS.COUNTDOWN ? 'active' : ''}
          onClick={() => setBdView(BD_VIEWS.COUNTDOWN)}
        >
          Reloj
        </button>
        <button
          type="button"
          className={bdView === BD_VIEWS.GIFTS ? 'active' : ''}
          onClick={() => setBdView(BD_VIEWS.GIFTS)}
        >
          Deseos
        </button>
        <button
          type="button"
          className={bdView === BD_VIEWS.SETTINGS ? 'active' : ''}
          onClick={() => setBdView(BD_VIEWS.SETTINGS)}
        >
          Ajustes
        </button>
      </nav>
    </div>
  );
}
