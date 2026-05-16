import { useRef, useState } from 'react';
import { exportBackup, importBackup } from './storage.js';

export default function SettingsView({ birthDate, onBirthDateChange, onDataImported }) {
  const fileRef = useRef(null);
  const [localDate, setLocalDate] = useState(birthDate);

  function handleSave() {
    if (localDate) {
      onBirthDateChange(localDate);
    }
  }

  function handleExport() {
    const data = exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `bd_planner_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        importBackup(data);
        if (data.birthDate) {
          setLocalDate(data.birthDate);
          onBirthDateChange(data.birthDate);
        }
        onDataImported();
      } catch {
        window.alert('Error al importar. Comprueba que el archivo sea JSON válido.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  return (
    <section className="panel bd-panel">
      <h2 className="bd-section-title">Configuración</h2>
      <p className="muted">Introduce tu fecha de nacimiento para la cuenta atrás personalizada.</p>
      <label className="bd-field block">
        <span>Fecha de nacimiento</span>
        <input
          type="date"
          value={localDate}
          onChange={(e) => setLocalDate(e.target.value)}
        />
      </label>
      <button type="button" className="btn primary block" onClick={handleSave}>
        Guardar fecha
      </button>

      <h3 className="bd-subheading">Datos y backup</h3>
      <p className="muted">Exporta o restaura deseos y fecha de cumpleaños.</p>
      <div className="bd-backup-actions">
        <button type="button" className="btn secondary" onClick={handleExport}>
          Exportar JSON
        </button>
        <button type="button" className="btn secondary" onClick={() => fileRef.current?.click()}>
          Importar JSON
        </button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={handleImport} />
      </div>
    </section>
  );
}
