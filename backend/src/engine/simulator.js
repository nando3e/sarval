/**
 * Motor de simulación de descargas en tolva.
 * Semana operativa: Lunes 06:00 → Sábado 22:00, pasos de PASO minutos.
 *
 * FASE B: Anticipación de críticos.
 * Antes de descargar un no-crítico, el motor comprueba si hay un viaje
 * crítico próximo que no cabría si se descarga el no-crítico ahora.
 * Si es así, retiene el no-crítico hasta que el crítico haya descargado
 * o el consumo haya creado espacio suficiente.
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
      retained: false,
    });
  }
  trucks.sort((a, b) => a.arr - b.arr || a.id - b.id);
  return trucks;
}

/**
 * Busca el próximo camión crítico que aún no ha llegado.
 * Recorre trucks desde fromPos en adelante.
 */
function findNextCriticalArrival(trucks, fromPos) {
  for (let i = fromPos; i < trucks.length; i++) {
    if (trucks[i].crit) return trucks[i];
  }
  return null;
}

/**
 * Comprueba si descargar `extraTons` ahora haría que el próximo crítico
 * no quepa cuando llegue. Solo retiene si SIN la descarga el crítico SÍ cabría.
 *
 * @returns {boolean} true = retener el no-crítico
 */
function wouldBlockCritical(currentLevel, extraTons, currentStep, nextCrit, CAP, CONS_STEP) {
  if (!nextCrit) return false;
  const stepsUntil = nextCrit.arr - currentStep;
  if (stepsUntil <= 0) return false;

  const consumeUntil = stepsUntil * CONS_STEP;

  const levelWithout = Math.max(0, currentLevel - consumeUntil);
  const spaceWithout = CAP - levelWithout;

  const levelWith = Math.max(0, currentLevel + extraTons - consumeUntil);
  const spaceWith = CAP - levelWith;

  return spaceWith < nextCrit.tn && spaceWithout >= nextCrit.tn;
}

/**
 * Convierte un array de paradas (stoppages) en un Set de step-indices
 * donde la productividad es 0.
 */
function buildStoppageSteps(stoppages, STEPS_H, PASO) {
  const stopped = new Set();
  for (const s of stoppages) {
    const dy = coerceDay(s.dia);
    const from = coerceTimeToStep(s.hora_inicio, STEPS_H, PASO);
    const to = coerceTimeToStep(s.hora_fin, STEPS_H, PASO);
    const base = dy.dIdx * 24 * STEPS_H;
    for (let st = base + from.step; st < base + to.step; st++) {
      stopped.add(st);
    }
  }
  return stopped;
}

/**
 * Convierte las entradas de boxes en un mapa stepIndex → tons que se
 * añaden gradualmente. Las toneladas totales se reparten linealmente
 * entre hora_inicio y hora_inicio + periodo_horas.
 */
function buildBoxEntryMap(boxEntries, STEPS_H, PASO) {
  const map = {};
  for (const b of boxEntries) {
    const tons = toNumber(b.total_tons);
    const periodo = toNumber(b.periodo_horas) || 24;
    if (tons <= 0) continue;
    const dy = coerceDay(b.dia);
    const from = coerceTimeToStep(b.hora_inicio || '06:00', STEPS_H, PASO);
    const base = dy.dIdx * 24 * STEPS_H + from.step;
    const totalSteps = Math.max(1, Math.round(periodo * STEPS_H));
    const tonsPerStep = tons / totalSteps;
    for (let i = 0; i < totalSteps; i++) {
      const idx = base + i;
      map[idx] = (map[idx] || 0) + tonsPerStep;
    }
  }
  return map;
}

/**
 * Ejecuta el motor de simulación para una tolva.
 * @param {Object} params - { capacidad_tn, consumo_tn_h, nivel_inicial_tn, paso_minutos }
 * @param {Array} trips - Viajes filtrados por plan_id y tolva_id
 * @param {Array} [stoppages=[]] - Paradas programadas para esta tolva
 * @param {Array} [boxEntries=[]] - Entradas graduales de boxes
 * @returns {{ sequence: Array, simulation: Array }}
 */
export function run(params, trips, stoppages = [], boxEntries = []) {
  const CAP = toNumber(params.capacidad_tn ?? params.Capacidad_silo_tn) || 40;
  const CONS_H = toNumber(params.consumo_tn_h ?? params.Consumo_tn_h) || 12;
  const NIVEL0 = toNumber(params.nivel_inicial_tn ?? params.Nivel_inicial_tn) || 20;
  const PASO = toNumber(params.paso_minutos ?? params.Paso_minutos) || 30;
  const STEPS_H = 60 / PASO;
  const CONS_STEP = CONS_H / STEPS_H;

  const START = () => 6 * STEPS_H;
  const END = () => 5 * 24 * STEPS_H + 22 * STEPS_H;

  const trucks = buildTrucks(trips, STEPS_H, PASO);
  const stoppedSteps = buildStoppageSteps(stoppages, STEPS_H, PASO);
  const boxMap = buildBoxEntryMap(boxEntries, STEPS_H, PASO);

  let level = NIVEL0;
  const qC = [];
  const qN = [];
  const finalIdx = {};
  const entries = {};
  let pos = 0;

  for (let t = START(); t <= END(); t++) {
    // Entradas graduales de boxes (afectan nivel pero NO se mezclan en entries)
    const boxTons = boxMap[t] || 0;
    if (boxTons > 0) {
      level = Math.min(CAP, level + boxTons);
    }

    while (pos < trucks.length && trucks[pos].arr === t) {
      (trucks[pos].crit ? qC : qN).push(trucks[pos]);
      pos++;
    }
    let space = CAP - level;

    // 1) Descargar críticos que caben
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

    // 2) No-críticos: solo si no hay críticos esperando en cola
    //    y si no bloquean a un próximo crítico futuro
    const critWaiting = qC.length > 0;
    if (!critWaiting) {
      const nextCrit = findNextCriticalArrival(trucks, pos);
      moved = true;
      while (moved && qN.length > 0 && space > 0) {
        moved = false;
        const candidate = qN[0];
        if (candidate.tn > space) break;

        if (wouldBlockCritical(level, candidate.tn, t, nextCrit, CAP, CONS_STEP)) {
          candidate.retained = true;
          break;
        }

        const tr = qN.shift();
        level += tr.tn;
        space = CAP - level;
        finalIdx[tr.id] = t;
        entries[t] = (entries[t] || 0) + tr.tn;
        moved = true;
      }
    } else {
      // Si hay un crítico esperando, marcamos los no-críticos como retenidos
      for (const nc of qN) nc.retained = true;
    }

    const isStopped = stoppedSteps.has(t);
    const cons = isStopped ? 0 : Math.min(CONS_STEP, level);
    level -= cons;
  }

  // Viajes que no se descargaron durante la semana
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
      retained_for_critical: tr.retained,
    };
  });

  let lvl2 = NIVEL0;
  const simulation = [];
  for (let t = START(); t <= END(); t++) {
    const d = Math.floor(t / (24 * STEPS_H));
    const hTxt = stepToHHMM(t, STEPS_H, PASO);
    const truckEnt = entries[t] || 0;
    const boxEnt = boxMap[t] || 0;
    const totalEnt = truckEnt + boxEnt;
    const isStopped = stoppedSteps.has(t);
    lvl2 = Math.min(CAP, lvl2 + totalEnt);
    const levelAfterEntry = lvl2;
    const cons = isStopped ? 0 : Math.min(CONS_STEP, lvl2);
    lvl2 -= cons;
    simulation.push({
      step_index: t,
      day: IDX_DAY[d],
      time: hTxt,
      entries_tons: totalEnt,
      box_entry_tons: boxEnt,
      consumption_tons: cons,
      silo_level: levelAfterEntry,
      is_stoppage: isStopped,
    });
  }

  return { sequence, simulation };
}
