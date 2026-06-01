import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { usePlan } from '../context/PlanContext';
import { useTolvas } from '../context/TolvaContext';
import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ReferenceDot, ResponsiveContainer,
} from 'recharts';
import styles from './Dashboard.module.css';

const DAY_TICKS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAY_FROM_JS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function roundToPaso(date, paso) {
  const mins = date.getHours() * 60 + date.getMinutes();
  const rounded = Math.round(mins / paso) * paso;
  const hh = Math.floor(rounded / 60) % 24;
  const mm = rounded % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function readingStep(dia, hora, paso) {
  const STEPS_H = 60 / paso;
  const dayIdx = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].indexOf(dia);
  if (dayIdx < 0) return null;
  const [hh, mm] = String(hora).slice(0, 5).split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return dayIdx * 24 * STEPS_H + hh * STEPS_H + Math.round(mm / paso);
}

function LevelTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>{d.label}</p>
      <p style={{ color: 'var(--accent)' }}>Nivel: <strong>{d.silo_level?.toFixed(1)} tn</strong></p>
      {d.is_stoppage && <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0 }}>Parada activa</p>}
    </div>
  );
}

// Un viaje puede tener varios proveedores separados por "|". Mostramos el
// primero y, si hay más, un "+N" con cuántos quedan (p.ej. "TORRENT +2").
function formatSupplier(supplier) {
  const parts = String(supplier || '').split('|').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} +${parts.length - 1}`;
}

function FlowTooltip({ active, payload, tripsByStep }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const truck = d.truck_entry_tons || 0;
  const box = d.box_entry_tons || 0;
  const cons = d.consumption_tons || 0;
  const trips = tripsByStep?.get?.(d.step_index) || [];
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>{d.label}</p>
      {trips.length > 0 ? (
        trips.map((t, i) => (
          <p key={i} style={{ color: '#22c55e', margin: '0.1rem 0' }}>
            {formatSupplier(t.supplier) && <span style={{ fontWeight: 600 }}>{formatSupplier(t.supplier)} · </span>}
            {t.trip_number || '[indefinido]'}: <strong>+{Number(t.tons).toFixed(1)} tn</strong>
            {t.critico && <span style={{ marginLeft: '0.4rem', padding: '0 0.3rem', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700, background: 'rgba(34,197,94,0.25)', border: '1px solid rgba(34,197,94,0.5)' }}>CR</span>}
          </p>
        ))
      ) : (
        truck > 0 && <p style={{ color: '#22c55e', margin: '0.1rem 0' }}>Entrada camión: <strong>+{truck.toFixed(1)} tn</strong></p>
      )}
      {box > 0 && <p style={{ color: '#f59e0b', margin: '0.1rem 0' }}>Entrada boxes: <strong>+{box.toFixed(2)} tn</strong></p>}
      {cons > 0 && <p style={{ color: '#ef4444', margin: '0.1rem 0' }}>Consumo: <strong>-{cons.toFixed(1)} tn</strong></p>}
      {trips.length === 0 && truck === 0 && box === 0 && cons === 0 && <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.8rem' }}>Sin flujo</p>}
      {d.is_stoppage && <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0.2rem 0 0' }}>Parada activa</p>}
    </div>
  );
}

const DAY_TO_IDX = { Lunes: 0, Martes: 1, Miércoles: 2, Jueves: 3, Viernes: 4, Sábado: 5, Domingo: 6 };

function tripsByStepFromSequence(sequence, paso) {
  const STEPS_H = 60 / (paso || 30);
  const map = new Map();
  for (const t of sequence || []) {
    const dayIdx = DAY_TO_IDX[t.dia_final];
    if (dayIdx == null || !t.hora_final) continue;
    const [hh, mm] = String(t.hora_final).slice(0, 5).split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) continue;
    const step = dayIdx * 24 * STEPS_H + hh * STEPS_H + Math.round(mm / (paso || 30));
    const entry = {
      trip_number: t.trip_number,
      supplier: t.supplier || '',
      tons: Number(t.tons) || 0,
      critico: !!t.critico,
    };
    if (!map.has(step)) map.set(step, []);
    map.get(step).push(entry);
  }
  return map;
}

export default function Dashboard() {
  const { planId, weeks } = usePlan();
  const { tolvas } = useTolvas();
  const [data, setData] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [sequence, setSequence] = useState([]);
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dayFilter, setDayFilter] = useState('all');
  const [selectedTolva, setSelectedTolva] = useState('');
  const [showReadingForm, setShowReadingForm] = useState(false);
  const [readingForm, setReadingForm] = useState({ dia: 'Lunes', hora: '08:00', nivel_tn: '', nota: '' });
  const [savingReading, setSavingReading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api(`/api/dashboard${selectedTolva ? `?tolva_id=${selectedTolva}` : ''}`),
      api(`/api/dashboard/silo-chart${selectedTolva ? `?tolva_id=${selectedTolva}` : ''}`).catch(() => ({ series: [], week: null, tolva: null })),
      api(`/api/planning/sequence${selectedTolva ? `?tolva_id=${selectedTolva}` : ''}`).catch(() => []),
      api(`/api/level-readings${selectedTolva ? `?tolva_id=${selectedTolva}` : ''}`).catch(() => []),
    ])
      .then(([dash, chart, seq, reads]) => {
        setData(dash);
        setChartData(chart);
        setSequence(seq);
        setReadings(reads);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedTolva]);

  useEffect(() => { load(); }, [load, planId]);

  // Recarga cuando los parámetros de una tolva cambian (evento emitido por Tolvas.jsx).
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('sarval:tolva-updated', handler);
    return () => window.removeEventListener('sarval:tolva-updated', handler);
  }, [load]);

  if (loading) return <p className={styles.muted}>Cargando…</p>;
  if (error) return <p className={styles.error}>{error}</p>;
  if (!data) return null;

  const { tolvas: tolvaStats = [], horas_paradas, stock_minimo, total_viajes, viajes_con_retraso, week } = data;
  const { series = [], tolva: chartTolva } = chartData || {};
  const capacity = chartTolva?.capacidad_tn || 40;

  const selectedWeek = planId == null
    ? (weeks.vigente || week)
    : (planId === weeks.proxima?.id
      ? weeks.proxima
      : weeks.pasadas?.find((item) => item.id === planId) || week);
  const weekScopeLabel = planId == null
    ? 'Semana actual'
    : (planId === weeks.proxima?.id ? 'Próxima semana' : 'Semana histórica');

  const baseFiltered = dayFilter === 'all' ? series : series.filter((s) => s.day === dayFilter);
  const filteredSeries = baseFiltered.map((s) => ({
    ...s,
    truck_entry_tons: s.truck_entry_tons != null ? s.truck_entry_tons : Math.max(0, (s.entries_tons || 0) - (s.box_entry_tons || 0)),
    consumption_neg: -Math.abs(s.consumption_tons || 0),
  }));
  // Mapa step_index -> [{trip_number, tons}] para mostrar los viajes concretos
  // en el tooltip del panel de flujos. Usamos el paso_minutos de la tolva
  // (tolvas context tiene paso_minutos; chartTolva no lo trae).
  const currentTolvaConfig = chartTolva ? tolvas.find((t) => t.id === chartTolva.id) : null;
  const paso = currentTolvaConfig?.paso_minutos || 30;
  const tripsByStep = tripsByStepFromSequence(sequence, paso);

  // Marcadores de lecturas manuales de nivel sobre el gráfico de nivel.
  const readingMarkers = readings
    .filter((r) => !chartTolva || r.tolva_id === chartTolva.id)
    .filter((r) => dayFilter === 'all' || r.dia === dayFilter)
    .map((r) => ({ id: r.id, step: readingStep(r.dia, r.hora, paso), nivel: Number(r.nivel_tn) }))
    .filter((m) => m.step != null);

  const openReadingForm = () => {
    setReadingForm({
      dia: DAY_FROM_JS[new Date().getDay()] || 'Lunes',
      hora: roundToPaso(new Date(), paso),
      nivel_tn: '',
      nota: '',
    });
    setShowReadingForm(true);
  };

  const saveReading = async () => {
    if (!chartTolva?.id || readingForm.nivel_tn === '') return;
    setSavingReading(true);
    setError('');
    try {
      await api('/api/level-readings', {
        method: 'POST',
        body: JSON.stringify({
          tolva_id: chartTolva.id,
          dia: readingForm.dia,
          hora: readingForm.hora,
          nivel_tn: Number(readingForm.nivel_tn),
          nota: readingForm.nota,
        }),
      });
      setShowReadingForm(false);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingReading(false);
    }
  };

  const deleteReading = async (id) => {
    setError('');
    try {
      await api(`/api/level-readings/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };
  // Serie en dientes de sierra para el panel de nivel: por cada paso con entrada,
  // insertamos un punto "pre-entrada" en step_index - 0.0001 con el nivel justo
  // antes de la descarga. Así el salto vertical mide exactamente las tn entradas.
  const levelSawtoothSeries = [];
  for (const p of filteredSeries) {
    const entries = Number(p.entries_tons) || 0;
    if (entries > 0.0001) {
      levelSawtoothSeries.push({
        ...p,
        step_index: p.step_index - 0.0001,
        silo_level: Math.max(0, p.silo_level - entries),
        _phase: 'pre',
      });
    }
    levelSawtoothSeries.push({ ...p, _phase: 'post' });
  }
  const activeDays = [...new Set(series.map((s) => s.day))].filter((d) => DAY_TICKS.includes(d));
  const noData = series.length === 0;

  const stoppageBands = [];
  for (let i = 0; i < filteredSeries.length; i++) {
    if (!filteredSeries[i].is_stoppage) continue;
    const start = filteredSeries[i].step_index;
    let end = start;
    while (i + 1 < filteredSeries.length && filteredSeries[i + 1].is_stoppage) {
      i++;
      end = filteredSeries[i].step_index;
    }
    stoppageBands.push({ id: `stop-${start}`, from: start - 0.5, to: end + 0.5 });
  }

  const nivelAlerta = chartTolva?.nivel_minimo_alerta_tn || null;

  const yDomainMaxFn = (dataMax) => Math.ceil(Math.max(dataMax, capacity) * 1.1);
  const xDomain =
    filteredSeries.length > 0
      ? [filteredSeries[0].step_index - 0.5, filteredSeries[filteredSeries.length - 1].step_index + 0.5]
      : ['dataMin', 'dataMax'];

  const xTickCount = 8;
  const xTicks =
    filteredSeries.length > 0
      ? Array.from({ length: xTickCount }, (_, i) => {
          const idx = Math.round((i / (xTickCount - 1)) * (filteredSeries.length - 1));
          return filteredSeries[Math.min(idx, filteredSeries.length - 1)].step_index;
        })
      : [];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.h1}>Dashboard</h1>
        {selectedWeek && <span className={styles.weekChip}>{selectedWeek.week_label}</span>}
        <span className={styles.scopeChip}>{weekScopeLabel}</span>
        {tolvas.length > 1 && (
          <select
            value={selectedTolva}
            onChange={(e) => setSelectedTolva(e.target.value)}
            style={{ padding: '0.3rem 0.5rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.85rem' }}
          >
            <option value="">Todas las tolvas</option>
            {tolvas.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre || `Tolva ${t.numero}`}</option>
            ))}
          </select>
        )}
        {selectedTolva && (
          <button
            type="button"
            onClick={() => setSelectedTolva('')}
            style={{ padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            ← Todas las tolvas
          </button>
        )}
      </div>

      {/* KPIs globales */}
      <div className={styles.cards}>
        <div className={`${styles.card} ${horas_paradas > 0 ? styles.cardDanger : ''}`}>
          <span className={styles.cardLabel}>Horas paradas</span>
          <span className={styles.cardValue}>{horas_paradas != null ? horas_paradas.toFixed(1) : '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Stock mínimo (tn)</span>
          <span className={styles.cardValue}>{stock_minimo != null ? Number(stock_minimo).toFixed(1) : '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Viajes planif.</span>
          <span className={styles.cardValue}>{total_viajes ?? '—'}</span>
        </div>
        <div className={`${styles.card} ${viajes_con_retraso > 0 ? styles.cardWarn : ''}`}>
          <span className={styles.cardLabel}>Viajes con retraso</span>
          <span className={styles.cardValue}>{viajes_con_retraso ?? '—'}</span>
        </div>
      </div>

      {/* KPIs por tolva */}
      {tolvaStats.length > 0 && !selectedTolva && (
        <>
          <h2 className={styles.h2}>Por tolva</h2>
          <div className={styles.cards}>
            {tolvaStats.map((ts) => (
              <div key={ts.tolva_id} className={styles.card} style={{ cursor: 'pointer' }} onClick={() => setSelectedTolva(String(ts.tolva_id))}>
                <span className={styles.cardLabel}>{ts.tolva_nombre || `Tolva ${ts.tolva_numero}`}</span>
                <span className={styles.cardValue}>{ts.total_viajes} viajes</span>
                <span className={styles.cardLabel} style={{ fontSize: '0.75rem' }}>
                  Cap: {ts.capacidad_tn}tn · Paradas: {ts.horas_paradas.toFixed(1)}h · Stock mín: {ts.stock_minimo != null ? ts.stock_minimo.toFixed(1) : '—'}tn
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Gráfico: solo si hay una sola tolva o se ha seleccionado una */}
      {(tolvas.length === 1 || selectedTolva) && (
      <div className={styles.chartWrap}>
        <div className={styles.chartHeader}>
          <h2 className={styles.h2}>
            Nivel {chartTolva ? `${chartTolva.nombre || `Tolva ${chartTolva.numero}`}` : 'de tolva'}
          </h2>
          <div className={styles.dayFilters}>
            <button type="button" className={dayFilter === 'all' ? styles.dayBtnActive : styles.dayBtn} onClick={() => setDayFilter('all')}>Toda la semana</button>
            {activeDays.map((d) => (
              <button key={d} type="button" className={dayFilter === d ? styles.dayBtnActive : styles.dayBtn} onClick={() => setDayFilter(d)}>{d}</button>
            ))}
            <button type="button" className={styles.dayBtn} onClick={openReadingForm} title="Registrar el nivel real medido en el silo. Reancla la simulación y recalcula la secuencia.">
              + Registrar nivel real
            </button>
          </div>
        </div>

        {showReadingForm && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '0.75rem', margin: '0.5rem 0 1rem', padding: '0.85rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', width: '100%' }}>
              Nivel real medido en <strong>{chartTolva?.nombre || `Tolva ${chartTolva?.numero}`}</strong>. La hora se redondea al paso de {paso} min. Al guardar se reancla la simulación y se recalcula la secuencia.
            </span>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Día
              <select value={readingForm.dia} onChange={(e) => setReadingForm((f) => ({ ...f, dia: e.target.value }))} style={{ padding: '0.4rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}>
                {DAY_TICKS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Hora
              <input type="time" value={readingForm.hora} step={paso * 60} onChange={(e) => setReadingForm((f) => ({ ...f, hora: e.target.value }))} style={{ padding: '0.4rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Nivel (tn)
              <input type="number" min="0" step="0.1" value={readingForm.nivel_tn} onChange={(e) => setReadingForm((f) => ({ ...f, nivel_tn: e.target.value }))} style={{ width: 90, padding: '0.4rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)', flex: 1, minWidth: 140 }}>
              Nota (opcional)
              <input value={readingForm.nota} onChange={(e) => setReadingForm((f) => ({ ...f, nota: e.target.value }))} style={{ padding: '0.4rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
            </label>
            <button type="button" disabled={savingReading || readingForm.nivel_tn === ''} onClick={saveReading} style={{ padding: '0.5rem 1rem', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'white', fontWeight: 500, cursor: 'pointer' }}>
              {savingReading ? 'Guardando…' : 'Guardar y recalcular'}
            </button>
            <button type="button" onClick={() => setShowReadingForm(false)} style={{ padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        )}

        {noData ? (
          <p className={styles.muted}>Ejecuta un recálculo en Secuenciación para ver el gráfico.</p>
        ) : (
          <>
            <div className={styles.legend}>
              <span className={styles.legendItem}><span className={styles.dot} style={{ background: 'var(--accent)' }} />Nivel tolva</span>
              <span className={styles.legendItem}><span className={styles.dotLine} style={{ background: '#94a3b8' }} />Capacidad</span>
              {nivelAlerta && <span className={styles.legendItem}><span className={styles.dotLine} style={{ background: '#ef4444' }} />Nivel mínimo alerta</span>}
              <span className={styles.legendItem}><span className={styles.dot} style={{ background: '#22c55e' }} />Camión</span>
              <span className={styles.legendItem}><span className={styles.dot} style={{ background: '#f59e0b' }} />Boxes</span>
              <span className={styles.legendItem}><span className={styles.dot} style={{ background: '#ef4444' }} />Consumo</span>
              {stoppageBands.length > 0 && <span className={styles.legendItem}><span className={styles.dot} style={{ background: '#94a3b8', opacity: 0.4 }} />Parada</span>}
              {readingMarkers.length > 0 && <span className={styles.legendItem}><span className={styles.dot} style={{ background: '#a855f7' }} />Lectura real</span>}
            </div>

            <div className={styles.chartPanelStack}>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={levelSawtoothSeries} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="step_index"
                    type="number"
                    domain={xDomain}
                    ticks={xTicks.length > 0 ? xTicks : undefined}
                    tickCount={xTicks.length > 0 ? undefined : 10}
                    tick={false}
                    height={0}
                  />
                  <YAxis domain={[0, yDomainMaxFn]} allowDataOverflow={false} tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v)}tn`} width={48} />
                  <Tooltip content={<LevelTooltip />} />
                  {stoppageBands.map((b) => (
                    <ReferenceArea key={b.id} x1={b.from} x2={b.to} fill="#94a3b8" fillOpacity={0.18} ifOverflow="extendDomain" />
                  ))}
                  <ReferenceLine y={capacity} stroke="#94a3b8" strokeDasharray="6 3" strokeWidth={1} label={{ value: 'Cap', position: 'right', fontSize: 10, fill: '#94a3b8' }} />
                  {nivelAlerta && (
                    <ReferenceLine y={nivelAlerta} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Alerta', position: 'right', fontSize: 10, fill: '#ef4444' }} />
                  )}
                  {activeDays.map((day) => {
                    const first = filteredSeries.find((s) => s.day === day);
                    return first ? (
                      <ReferenceLine key={day} x={first.step_index} stroke="var(--border)" strokeDasharray="4 4"
                        label={{ value: day, position: 'insideTopLeft', fontSize: 10, fill: 'var(--text-muted)', dy: -4 }} />
                    ) : null;
                  })}
                  <Area type="linear" dataKey="silo_level" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.12} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                  {readingMarkers.map((m) => (
                    <ReferenceDot key={`read-${m.id}`} x={m.step} y={m.nivel} r={5} fill="#a855f7" stroke="#fff" strokeWidth={1.5} ifOverflow="extendDomain"
                      label={{ value: `${m.nivel}t`, position: 'top', fontSize: 10, fill: '#a855f7' }} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>

              <ResponsiveContainer width="100%" height={170}>
                <ComposedChart data={filteredSeries} margin={{ top: 0, right: 20, left: 10, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="step_index"
                    type="number"
                    domain={xDomain}
                    ticks={xTicks.length > 0 ? xTicks : undefined}
                    tickCount={xTicks.length > 0 ? undefined : 10}
                    tickFormatter={(val) => {
                      const point = filteredSeries.find((s) => s.step_index === val)
                        ?? filteredSeries[Math.min(Math.max(0, Math.round(val)), filteredSeries.length - 1)];
                      return point ? point.time : '';
                    }}
                    tick={{ fontSize: 10 }}
                    angle={-45}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis domain={[-capacity, capacity]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v)}tn`} width={48} />
                  <Tooltip content={(props) => <FlowTooltip {...props} tripsByStep={tripsByStep} />} />
                  {stoppageBands.map((b) => (
                    <ReferenceArea key={`f-${b.id}`} x1={b.from} x2={b.to} fill="#94a3b8" fillOpacity={0.18} ifOverflow="extendDomain" />
                  ))}
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <Bar dataKey="truck_entry_tons" fill="#22c55e" stackId="entries" isAnimationActive={false} />
                  <Bar dataKey="box_entry_tons" fill="#f59e0b" stackId="entries" isAnimationActive={false} />
                  <Bar dataKey="consumption_neg" fill="#ef4444" isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {readings.filter((r) => !chartTolva || r.tolva_id === chartTolva.id).length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>Lecturas de nivel registradas</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {readings
                    .filter((r) => !chartTolva || r.tolva_id === chartTolva.id)
                    .map((r) => (
                      <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.6rem', borderRadius: 9999, background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.35)', fontSize: '0.8rem' }}>
                        <span style={{ color: '#a855f7', fontWeight: 600 }}>{r.dia} {String(r.hora).slice(0, 5)}</span>
                        <strong>{Number(r.nivel_tn).toFixed(1)} tn</strong>
                        {r.nota ? <span style={{ color: 'var(--text-muted)' }}>· {r.nota}</span> : null}
                        <button type="button" onClick={() => deleteReading(r.id)} title="Eliminar lectura y recalcular" style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1 }}>✕</button>
                      </span>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      )}
      {tolvas.length > 1 && !selectedTolva && (
        <p className={styles.muted} style={{ marginTop: '1rem' }}>
          Selecciona una tolva (clic en su tarjeta o en el desplegable) para ver su gráfico de nivel.
        </p>
      )}
    </div>
  );
}
