import { useState, useRef, useEffect } from 'react';
import { usePlan } from '../context/PlanContext';
import styles from './WeekSelector.module.css';

const HISTORIAL_EN_DROPDOWN = 8;

export default function WeekSelector() {
  const { weeks, planId, setPlanId, loadingWeeks, isSimulating, simulation, startSimulation } = usePlan();
  const { vigente, proxima, pasadas } = weeks;
  const [showHistorialModal, setShowHistorialModal] = useState(false);
  const [startingSim, setStartingSim] = useState(false);
  const selectRef = useRef(null);

  const currentLabel = planId == null && vigente
    ? vigente.week_label
    : planId === proxima?.id && proxima
      ? proxima.week_label
      : pasadas?.find((p) => p.id === planId)?.week_label || 'Semana vigente';

  const pasadasEnDropdown = pasadas?.slice(0, HISTORIAL_EN_DROPDOWN) ?? [];
  const hayMasHistorial = (pasadas?.length ?? 0) > HISTORIAL_EN_DROPDOWN;
  const selectedPasada = planId != null ? pasadas?.find((p) => p.id === planId) : null;
  const selectedEstaEnDropdown = selectedPasada && pasadasEnDropdown.some((p) => p.id === planId);

  useEffect(() => {
    if (!showHistorialModal || !selectRef.current) return;
    selectRef.current.value = String(planId ?? '');
  }, [showHistorialModal, planId]);

  const handleSelectChange = (e) => {
    const v = e.target.value;
    if (v === '__more__') {
      setShowHistorialModal(true);
      if (selectRef.current) selectRef.current.value = String(planId ?? '');
      return;
    }
    setPlanId(v ? Number(v) : null);
  };

  const pickHistorial = (id) => {
    setPlanId(id);
    setShowHistorialModal(false);
  };

  if (loadingWeeks) {
    return (
      <div className={styles.wrap}>
        <span className={styles.label}>Semana</span>
        <span className={styles.muted}>Cargando…</span>
      </div>
    );
  }

  // En simulación el selector se bloquea: no se puede cambiar de semana hasta
  // aplicar o cancelar. Se muestra la semana base sobre la que se simula.
  if (isSimulating) {
    const baseLabel =
      simulation?.parentId === proxima?.id ? proxima?.week_label : vigente?.week_label || 'Semana vigente';
    return (
      <div className={styles.wrap}>
        <span className={styles.label}>Semana</span>
        <span className={styles.simLocked} title={baseLabel}>
          🔴 Simulando sobre: {baseLabel}
        </span>
      </div>
    );
  }

  // Solo se puede simular la semana vigente o la próxima (nunca el historial).
  const puedeSimular = planId == null || (proxima && planId === proxima.id);

  const handleStartSimulation = async () => {
    setStartingSim(true);
    try {
      await startSimulation();
    } catch (err) {
      window.alert(err.message || 'No se pudo iniciar la simulación');
    } finally {
      setStartingSim(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <label className={styles.label} htmlFor="week-select">Semana</label>
      <select
        ref={selectRef}
        id="week-select"
        className={styles.select}
        value={planId ?? ''}
        onChange={handleSelectChange}
        title={currentLabel}
      >
        <option value="">{vigente ? vigente.week_label : 'Semana vigente'}</option>
        {proxima && <option value={proxima.id}>{proxima.week_label} (próxima)</option>}
        {(pasadasEnDropdown.length > 0 || hayMasHistorial || selectedPasada) && (
          <optgroup label="Historial">
            {selectedPasada && !selectedEstaEnDropdown && (
              <option value={selectedPasada.id}>{selectedPasada.week_label}</option>
            )}
            {pasadasEnDropdown.map((p) => (
              <option key={p.id} value={p.id}>{p.week_label}</option>
            ))}
            {hayMasHistorial && (
              <option value="__more__">Ver más historial ({pasadas.length - HISTORIAL_EN_DROPDOWN} más)…</option>
            )}
          </optgroup>
        )}
      </select>

      {puedeSimular && (
        <button
          type="button"
          className={styles.simBtn}
          onClick={handleStartSimulation}
          disabled={startingSim}
          title="Probar cambios sin tocar el plan real"
        >
          {startingSim ? 'Preparando…' : '🧪 Simular cambios'}
        </button>
      )}

      {showHistorialModal && pasadas?.length > 0 && (
        <div className={styles.modalBackdrop} onClick={() => setShowHistorialModal(false)} role="presentation">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Elegir semana (historial)</span>
              <button type="button" className={styles.modalClose} onClick={() => setShowHistorialModal(false)} aria-label="Cerrar">×</button>
            </div>
            <ul className={styles.modalList}>
              {pasadas.map((p) => (
                <li key={p.id}>
                  <button type="button" className={styles.modalItem} onClick={() => pickHistorial(p.id)}>
                    {p.week_label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
