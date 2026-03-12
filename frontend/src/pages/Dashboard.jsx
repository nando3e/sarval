import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { usePlan } from '../context/PlanContext';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import styles from './Dashboard.module.css';

const DAY_TICKS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>{d.label}</p>
      <p style={{ color: 'var(--accent)' }}>Nivel: <strong>{d.silo_level?.toFixed(1)} tn</strong></p>
    </div>
  );
}

function DayBand({ series, capacity }) {
  if (!series?.length) return null;
  const days = [...new Set(series.map((s) => s.day))];
  return days.map((day, i) => {
    const first = series.find((s) => s.day === day);
    const last = [...series].reverse().find((s) => s.day === day);
    if (!first || !last) return null;
    return (
      <ReferenceLine
        key={day}
        x={first.step_index}
        stroke="var(--border)"
        strokeDasharray="4 4"
        label={{ value: day, position: 'insideTopLeft', fontSize: 10, fill: 'var(--text-muted)' }}
      />
    );
  });
}

export default function Dashboard() {
  const { planId, weeks } = usePlan();
  const [data, setData] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dayFilter, setDayFilter] = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api('/api/dashboard'),
      api('/api/dashboard/silo-chart').catch(() => ({ series: [], week: null, parameters: {} })),
    ])
      .then(([dash, chart]) => {
        setData(dash);
        setChartData(chart);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load, planId]);

  if (loading) return <p className={styles.muted}>Cargando…</p>;
  if (error) return <p className={styles.error}>{error}</p>;
  if (!data) return null;

  const { parameters = {}, horas_paradas, stock_minimo, total_viajes, viajes_con_retraso, week } = data;
  const { series = [], parameters: chartParams = {} } = chartData || {};
  const capacity = chartParams.Capacidad_silo_tn || parameters.Capacidad_silo_tn || 40;
  const selectedWeek = planId == null
    ? (weeks.vigente || week)
    : (planId === weeks.proxima?.id
      ? weeks.proxima
      : weeks.pasadas?.find((item) => item.id === planId) || week);
  const weekScopeLabel = planId == null
    ? 'Semana actual'
    : (planId === weeks.proxima?.id ? 'Próxima semana' : 'Semana histórica');

  const filteredSeries = dayFilter === 'all' ? series : series.filter((s) => s.day === dayFilter);

  const activeDays = [...new Set(series.map((s) => s.day))].filter((d) => DAY_TICKS.includes(d));

  const noData = series.length === 0;

  /** Dominio Y: capacidad con margen del 10% */
  const yDomainMaxFn = (dataMax) => Math.ceil(Math.max(dataMax, capacity) * 1.1);

  /** Eje X: dominio con margen para que la primera y última barra no queden pegadas al eje */
  const xDomain =
    filteredSeries.length > 0
      ? [
          filteredSeries[0].step_index - 0.5,
          filteredSeries[filteredSeries.length - 1].step_index + 0.5,
        ]
      : ['dataMin', 'dataMax'];

  /** Eje X: número fijo de marcas, periodicidad uniforme */
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
        {selectedWeek && (
          <span className={styles.weekChip}>
            {selectedWeek.week_label}
          </span>
        )}
        <span className={styles.scopeChip}>{weekScopeLabel}</span>
      </div>

      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Capacidad silo (tn)</span>
          <span className={styles.cardValue}>{parameters.Capacidad_silo_tn ?? '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Nivel inicial (tn)</span>
          <span className={styles.cardValue}>{parameters.Nivel_inicial_tn ?? '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Consumo (tn/h)</span>
          <span className={styles.cardValue}>{parameters.Consumo_tn_h ?? '—'}</span>
        </div>
        <div className={`${styles.card} ${horas_paradas > 0 ? styles.cardDanger : ''}`}>
          <span className={styles.cardLabel}>Horas paradas</span>
          <span className={styles.cardValue}>{horas_paradas != null ? horas_paradas.toFixed(1) : '—'}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Stock mínimo (tn)</span>
          <span className={styles.cardValue}>{stock_minimo != null ? Number(stock_minimo).toFixed(1) : '—'}</span>
        </div>
        {total_viajes != null && (
          <div className={styles.card}>
            <span className={styles.cardLabel}>Viajes planif.</span>
            <span className={styles.cardValue}>{total_viajes}</span>
          </div>
        )}
        {viajes_con_retraso != null && (
          <div className={`${styles.card} ${viajes_con_retraso > 0 ? styles.cardWarn : ''}`}>
            <span className={styles.cardLabel}>Viajes con retraso</span>
            <span className={styles.cardValue}>{viajes_con_retraso}</span>
          </div>
        )}
      </div>

      <div className={styles.chartWrap}>
        <div className={styles.chartHeader}>
          <h2 className={styles.h2}>Nivel del silo</h2>
          <div className={styles.dayFilters}>
            <button
              type="button"
              className={dayFilter === 'all' ? styles.dayBtnActive : styles.dayBtn}
              onClick={() => setDayFilter('all')}
            >Toda la semana</button>
            {activeDays.map((d) => (
              <button
                key={d}
                type="button"
                className={dayFilter === d ? styles.dayBtnActive : styles.dayBtn}
                onClick={() => setDayFilter(d)}
              >{d}</button>
            ))}
          </div>
        </div>

        {noData ? (
          <p className={styles.muted}>Ejecuta un recálculo en Secuenciación para ver el gráfico del silo.</p>
        ) : (
          <>
            <div className={styles.legend}>
              <span className={styles.legendItem}><span className={styles.dot} style={{ background: 'var(--accent)' }} />Nivel silo</span>
              <span className={styles.legendItem}><span className={styles.dotLine} style={{ background: 'var(--text-muted)', opacity: 0.5 }} />Capacidad</span>
            </div>
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={filteredSeries} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
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
                <YAxis
                  domain={[0, yDomainMaxFn]}
                  allowDataOverflow={false}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `${v}tn`}
                  width={48}
                />
                <Tooltip content={<CustomTooltip />} />

                {/* Línea de capacidad máxima */}
                <ReferenceLine y={capacity} stroke="#94a3b8" strokeDasharray="6 3" strokeWidth={1} />

                {/* Marcas de cambio de día */}
                {activeDays.map((day) => {
                  const first = filteredSeries.find((s) => s.day === day);
                  return first ? (
                    <ReferenceLine
                      key={day}
                      x={first.step_index}
                      stroke="var(--border)"
                      strokeDasharray="4 4"
                      label={{ value: day, position: 'insideTopLeft', fontSize: 10, fill: 'var(--text-muted)', dy: -4 }}
                    />
                  ) : null;
                })}

                {/* Línea del nivel del silo (un punto por paso de media hora) */}
                <Line
                  type="linear"
                  dataKey="silo_level"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  );
}
