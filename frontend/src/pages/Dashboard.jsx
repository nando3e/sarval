import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { usePlan } from '../context/PlanContext';
import { useTolvas } from '../context/TolvaContext';
import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from 'recharts';
import styles from './Dashboard.module.css';

const DAY_TICKS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

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

function FlowTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const truck = d.truck_entry_tons || 0;
  const box = d.box_entry_tons || 0;
  const cons = d.consumption_tons || 0;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>{d.label}</p>
      {truck > 0 && <p style={{ color: '#22c55e', margin: '0.1rem 0' }}>Entrada camión: <strong>+{truck.toFixed(1)} tn</strong></p>}
      {box > 0 && <p style={{ color: '#f59e0b', margin: '0.1rem 0' }}>Entrada boxes: <strong>+{box.toFixed(2)} tn</strong></p>}
      {cons > 0 && <p style={{ color: '#ef4444', margin: '0.1rem 0' }}>Consumo: <strong>-{cons.toFixed(1)} tn</strong></p>}
      {truck === 0 && box === 0 && cons === 0 && <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.8rem' }}>Sin flujo</p>}
      {d.is_stoppage && <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0.2rem 0 0' }}>Parada activa</p>}
    </div>
  );
}

export default function Dashboard() {
  const { planId, weeks } = usePlan();
  const { tolvas } = useTolvas();
  const [data, setData] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dayFilter, setDayFilter] = useState('all');
  const [selectedTolva, setSelectedTolva] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api(`/api/dashboard${selectedTolva ? `?tolva_id=${selectedTolva}` : ''}`),
      api(`/api/dashboard/silo-chart${selectedTolva ? `?tolva_id=${selectedTolva}` : ''}`).catch(() => ({ series: [], week: null, tolva: null })),
    ])
      .then(([dash, chart]) => {
        setData(dash);
        setChartData(chart);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedTolva]);

  useEffect(() => { load(); }, [load, planId]);

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
  const flowMax = Math.max(
    1,
    ...filteredSeries.map((s) => Math.max(s.truck_entry_tons || 0, s.box_entry_tons || 0)),
    ...filteredSeries.map((s) => Math.abs(s.consumption_neg || 0))
  );

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

      {/* Gráfico */}
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
          </div>
        </div>

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
            </div>

            <div className={styles.chartPanelStack}>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={levelSawtoothSeries} syncId="tolva-sync" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
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
                  <YAxis domain={[0, yDomainMaxFn]} allowDataOverflow={false} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}tn`} width={48} />
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
                </ComposedChart>
              </ResponsiveContainer>

              <ResponsiveContainer width="100%" height={170}>
                <ComposedChart data={filteredSeries} syncId="tolva-sync" margin={{ top: 0, right: 20, left: 10, bottom: 30 }}>
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
                  <YAxis domain={[-flowMax, flowMax]} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}tn`} width={48} />
                  <Tooltip content={<FlowTooltip />} />
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
          </>
        )}
      </div>
    </div>
  );
}
