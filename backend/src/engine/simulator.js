/**
 * Motor de simulación de descargas en tolva.
 * Semana operativa: Lunes 06:00 → Sábado 22:00, pasos de PASO minutos.
 * Acepta parámetros de tolva (capacidad_tn, consumo_tn_h, nivel_inicial_tn, paso_minutos)
 * o el formato legacy (Capacidad_silo_tn, Consumo_tn_h, Nivel_inicial_tn, Paso_minutos).
 */

const IDX_DAY = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_INDEX = {
  Lunes: 0, LUNES: 0, lunes: 0,
  Martes: 1, MARTES: 1, martes: 1,
  Miércoles: 2, MIERCOLES: 2, Miercoles: 2, miércoles: 2, miercoles: 2,
  Jueves: 3, JUEVES: 3, jueves: 3,
  Viernes: 4, VIERNES: 4, viernes: 4,
  Sábado: 5, Sabado: 5, SABADO: 5, sábado: 5, sabado: 5,
};

function toNumber(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(',', '.');
  const n = Number(s);
  return Number.isNaN(n) ? 0 : n;
}

function coerceDay(v) {
  const s = String(v ?? '').trim();
  if (!s) return { dIdx: 0, dName: 'Lunes' };
  const norm = s === 'MIERCOLES' ? 'Miércoles' : s === 'SABADO' ? 'Sábado' : s.toLowerCase();
  const normalized = norm === 'miercoles' ? 'Miércoles' : norm === 'sabado' ? 'Sábado' : norm.charAt(0).toUpperCase() + norm.slice(1);
  const dIdx = DAY_INDEX[normalized] ?? 0;
  return { dIdx, dName: IDX_DAY[dIdx] };
}

function coerceTimeToStep(v, STEPS_H, PASO) {
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  function fromHM(hh, mm) {
    const H = clamp(Math.floor(hh), 0, 23);
    const M = clamp(Math.floor(mm), 0, 59);
    const step = H * STEPS_H + Math.round(M / PASO);
    const hhmm = String(H).padStart(2, '0') + ':' + String(M).padStart(2, '0');
    return { step, hhmm };
  }
  const s = String(v ?? '').trim();
  if (!s) return fromHM(0, 0);
  if (/^\d{1,2}[,.]\d{1,2}$/.test(s)) {
    const parts = s.split(/[,.]/);
    return fromHM(Number(parts[0]), Number(parts[1]));
  }
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const a = s.split(':');
    return fromHM(Number(a[0]), Number(a[1]));
  }
  return fromHM(0, 0);
}

function stepToHHMM(s, STEPS_H, PASO) {
  const hh = Math.floor((s % (24 * STEPS_H)) / STEPS_H);
  const mm = (s % STEPS_H) * PASO;
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

/**
 * Construye la lista de camiones (trucks) a partir de los viajes de la BD.
 * Cada trip: { id, trip_number, day, scheduled_time, supplier, tons, is_critical, is_extra }
 * scheduled_time puede venir como string "08:00" o como time de PostgreSQL.
 */
function buildTrucks(trips, STEPS_H, PASO) {
  const trucks = [];
  for (const t of trips) {
    const dy = coerceDay(t.day);
    const tm = coerceTimeToStep(t.scheduled_time, STEPS_H, PASO);
    let arr = dy.dIdx * 24 * STEPS_H + tm.step;
    while (arr >= 6 * 24 * STEPS_H) arr -= 6 * 24 * STEPS_H;
    trucks.push({
      id: t.id,
      trip_number: t.trip_number,
      tn: toNumber(t.tons),
      crit: !!t.is_critical,
      day: dy.dIdx,
      arr,
      hReal: tm.hhmm,
      horaPrev: tm.hhmm,
      prov: String(t.supplier ?? ''),
      extra: !!t.is_extra,
    });
  }
  trucks.sort((a, b) => a.arr - b.arr || a.id - b.id);
  return trucks;
}

/**
 * Ejecuta el motor de simulación para una tolva.
 * @param {Object} params - Objeto tolva con { capacidad_tn, consumo_tn_h, nivel_inicial_tn, paso_minutos }
 *                          También acepta formato legacy { Capacidad_silo_tn, Consumo_tn_h, Nivel_inicial_tn, Paso_minutos }
 * @param {Array} trips - Viajes de la BD (ya filtrados por plan_id y tolva_id)
 * @returns { { sequence: Array, simulation: Array } }
 */
export function run(params, trips) {
  const CAP = toNumber(params.capacidad_tn ?? params.Capacidad_silo_tn) || 40;
  const CONS_H = toNumber(params.consumo_tn_h ?? params.Consumo_tn_h) || 12;
  const NIVEL0 = toNumber(params.nivel_inicial_tn ?? params.Nivel_inicial_tn) || 20;
  const PASO = toNumber(params.paso_minutos ?? params.Paso_minutos) || 30;
  const STEPS_H = 60 / PASO;
  const CONS_STEP = CONS_H / STEPS_H;

  const START = () => 6 * STEPS_H;
  const END = () => 5 * 24 * STEPS_H + 22 * STEPS_H;

  const trucks = buildTrucks(trips, STEPS_H, PASO);

  let level = NIVEL0;
  const qC = [];
  const qN = [];
  const finalIdx = {};
  const entries = {};
  let pos = 0;

  for (let t = START(); t <= END(); t++) {
    while (pos < trucks.length && trucks[pos].arr === t) {
      (trucks[pos].crit ? qC : qN).push(trucks[pos]);
      pos++;
    }
    let space = CAP - level;

    let moved = true;
    while (moved && qC.length > 0) {
      moved = false;
      if (qC[0].tn <= space) {
        const tr = qC.shift();
        level += tr.tn;
        space = CAP - level;
        finalIdx[tr.id] = t;
        entries[t] = (entries[t] || 0) + tr.tn;
        moved = true;
      } else break;
    }
    moved = true;
    while (moved && qN.length > 0 && space > 0) {
      moved = false;
      if (qN[0].tn <= space) {
        const tr = qN.shift();
        level += tr.tn;
        space = CAP - level;
        finalIdx[tr.id] = t;
        entries[t] = (entries[t] || 0) + tr.tn;
        moved = true;
      }
    }
    const cons = Math.min(CONS_STEP, level);
    level -= cons;
  }

  for (const tr of qC) {
    finalIdx[tr.id] = END();
    entries[END()] = (entries[END()] || 0) + tr.tn;
  }
  for (const tr of qN) {
    finalIdx[tr.id] = END();
    entries[END()] = (entries[END()] || 0) + tr.tn;
  }

  const sequence = trucks.map((tr) => {
    const fin = finalIdx[tr.id];
    const diaFinal = fin !== undefined ? IDX_DAY[Math.floor(fin / (24 * STEPS_H))] : null;
    const horaFinal = fin !== undefined ? stepToHHMM(fin, STEPS_H, PASO) : null;
    const retCap = fin !== undefined ? (fin - tr.arr) / STEPS_H : 0;
    return {
      trip_id: tr.id,
      trip_number: tr.trip_number,
      day: IDX_DAY[tr.day],
      hora_prevista: tr.horaPrev,
      supplier: tr.prov,
      tons: tr.tn,
      critico: tr.crit,
      extra: tr.extra,
      final_day: diaFinal,
      final_time: horaFinal,
      delay_capacity_hours: retCap,
    };
  });

  let lvl2 = NIVEL0;
  const simulation = [];
  for (let t = START(); t <= END(); t++) {
    const d = Math.floor(t / (24 * STEPS_H));
    const hTxt = stepToHHMM(t, STEPS_H, PASO);
    const ent = entries[t] || 0;
    const levelAtStart = lvl2;
    lvl2 = Math.min(CAP, lvl2 + ent);
    const cons = Math.min(CONS_STEP, lvl2);
    lvl2 -= cons;
    simulation.push({
      step_index: t,
      day: IDX_DAY[d],
      time: hTxt,
      entries_tons: ent,
      consumption_tons: cons,
      silo_level: levelAtStart,
      is_stoppage: cons < CONS_STEP,
    });
  }

  return { sequence, simulation };
}
