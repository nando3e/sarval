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

const IDX_DAY = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAY_INDEX = {
  Lunes: 0, LUNES: 0, lunes: 0,
  Martes: 1, MARTES: 1, martes: 1,
  Miércoles: 2, MIERCOLES: 2, Miercoles: 2, miércoles: 2, miercoles: 2,
  Jueves: 3, JUEVES: 3, jueves: 3,
  Viernes: 4, VIERNES: 4, viernes: 4,
  Sábado: 5, Sabado: 5, SABADO: 5, sábado: 5, sabado: 5,
  Domingo: 6, DOMINGO: 6, domingo: 6,
};

// La semana operativa abarca 7 días (Lunes..Domingo). Constantes derivadas del
// nº de pasos/hora para no repetir el "7 * 24 * STEPS_H" por todo el motor.
const WEEK_DAYS = 7;

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
  const START = 0;                                 // Lunes 00:00
  const END = WEEK_DAYS * 24 * STEPS_H - 1;        // Domingo 23:xx (último paso antes de medianoche)
  const trucks = [];
  for (const t of trips) {
    const dy = coerceDay(t.day);
    const tm = coerceTimeToStep(t.scheduled_time, STEPS_H, PASO);
    let arr = dy.dIdx * 24 * STEPS_H + tm.step;
    while (arr >= WEEK_DAYS * 24 * STEPS_H) arr -= WEEK_DAYS * 24 * STEPS_H;
    // Los camiones pueden llegar cualquier día/hora de la semana (Lunes 00:00 a
    // Domingo medianoche). Solo se ancla al borde si cayera fuera del rango.
    arr = Math.min(END, Math.max(START, arr));
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
 * entre hora_inicio y hora_inicio + periodo_horas, **pero saltando los
 * pasos que caen dentro de una parada** (la entrega se pospone hacia
 * adelante hasta completar el total previsto). Esto refleja la realidad:
 * durante una parada, ninguna actividad ocurre en la tolva (ni boxes,
 * ni camiones, ni consumo).
 */
function buildBoxEntryMap(boxEntries, STEPS_H, PASO, stoppedSteps) {
  const map = {};
  const WEEK_END = 6 * 24 * STEPS_H; // límite duro de la semana operativa
  for (const b of boxEntries) {
    const tons = toNumber(b.total_tons);
    const periodo = toNumber(b.periodo_horas) || 24;
    if (tons <= 0) continue;
    const dy = coerceDay(b.dia);
    const from = coerceTimeToStep(b.hora_inicio || '06:00', STEPS_H, PASO);
    const base = dy.dIdx * 24 * STEPS_H + from.step;
    const totalSteps = Math.max(1, Math.round(periodo * STEPS_H));
    const tonsPerStep = tons / totalSteps;
    let delivered = 0;
    let offset = 0;
    while (delivered < totalSteps) {
      const idx = base + offset;
      if (idx >= WEEK_END) break;
      if (!stoppedSteps.has(idx)) {
        map[idx] = (map[idx] || 0) + tonsPerStep;
        delivered++;
      }
      offset++;
    }
  }
  return map;
}

/**
 * Convierte las franjas de productividad en un mapa stepIndex → caudal (t/h).
 * En solapamientos gana la franja creada más tarde (mayor id). Los pasos no
 * cubiertos no aparecen en el mapa: el motor usará el consumo base de la tolva.
 */
function buildRateMap(periods, STEPS_H, PASO) {
  const map = {};
  const sorted = [...periods].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  for (const p of sorted) {
    const dy = coerceDay(p.dia);
    const from = coerceTimeToStep(p.hora_inicio, STEPS_H, PASO);
    const to = coerceTimeToStep(p.hora_fin, STEPS_H, PASO);
    const base = dy.dIdx * 24 * STEPS_H;
    const rate = toNumber(p.consumo_tn_h);
    for (let st = base + from.step; st < base + to.step; st++) {
      map[st] = rate;
    }
  }
  return map;
}

/**
 * Convierte las lecturas manuales de nivel en un mapa stepIndex → nivel_tn.
 * Cada lectura "reancla" el nivel del silo en ese paso (sustituye el estimado).
 */
function buildReadingMap(readings, STEPS_H, PASO) {
  const map = {};
  for (const r of readings) {
    const dy = coerceDay(r.dia);
    const tm = coerceTimeToStep(r.hora, STEPS_H, PASO);
    const step = dy.dIdx * 24 * STEPS_H + tm.step;
    map[step] = toNumber(r.nivel_tn);
  }
  return map;
}

/**
 * Ejecuta el motor de simulación para una tolva.
 * @param {Object} params - { capacidad_tn, consumo_tn_h, nivel_inicial_tn, paso_minutos, hora_inicio_consumo }
 * @param {Array} trips - Viajes filtrados por plan_id y tolva_id
 * @param {Array} [stoppages=[]] - Paradas programadas para esta tolva
 * @param {Array} [boxEntries=[]] - Entradas graduales de boxes
 * @param {Array} [readings=[]] - Lecturas manuales de nivel (reanclan la simulación)
 * @param {Array} [productivityPeriods=[]] - Franjas de caudal que sustituyen al consumo base
 * @returns {{ sequence: Array, simulation: Array }}
 */
export function run(params, trips, stoppages = [], boxEntries = [], readings = [], productivityPeriods = []) {
  const CAP = toNumber(params.capacidad_tn ?? params.Capacidad_silo_tn) || 40;
  const CONS_H = toNumber(params.consumo_tn_h ?? params.Consumo_tn_h) || 12;
  // Nivel inicial: se respeta el 0 explícito (silo vacío al empezar la semana);
  // solo se cae al defecto si no viene ningún valor.
  const nivelRaw = params.nivel_inicial_tn ?? params.Nivel_inicial_tn;
  const NIVEL0 = nivelRaw != null && String(nivelRaw).trim() !== '' ? toNumber(nivelRaw) : 20;
  const PASO = toNumber(params.paso_minutos ?? params.Paso_minutos) || 30;
  const STEPS_H = 60 / PASO;
  const CONS_STEP = CONS_H / STEPS_H;

  // La semana (recepción de camiones + curva) va de Lunes 00:00 a Domingo
  // medianoche. Los camiones pueden descargar en todo este rango.
  const START = () => 0;
  const END = () => WEEK_DAYS * 24 * STEPS_H - 1;

  // Ventana de CONSUMO base: del Lunes `hora_inicio_consumo` (def 06:00) al
  // Sábado `hora_fin_consumo` (def 22:00). Dentro de la ventana hay consumo
  // continuo (incl. noches). Fuera de ella NO hay consumo base... salvo que una
  // franja de productividad cubra el paso: una franja activa el consumo a su
  // caudal en cualquier día/hora (así se "amplía" el finde con franjas).
  const consInicio = coerceTimeToStep(params.hora_inicio_consumo ?? '06:00', STEPS_H, PASO);
  const CONSUMO_INICIO = consInicio.step;                       // step dentro del Lunes (día 0)
  const consFin = coerceTimeToStep(params.hora_fin_consumo ?? '22:00', STEPS_H, PASO);
  const CONSUMO_FIN = 5 * 24 * STEPS_H + consFin.step;          // Sábado (día 5) + hora fin

  const trucks = buildTrucks(trips, STEPS_H, PASO);
  const stoppedSteps = buildStoppageSteps(stoppages, STEPS_H, PASO);
  const boxMap = buildBoxEntryMap(boxEntries, STEPS_H, PASO, stoppedSteps);
  const readingMap = buildReadingMap(readings, STEPS_H, PASO);
  const rateMap = buildRateMap(productivityPeriods, STEPS_H, PASO);
  // Caudal (t/h) efectivo en un paso: franja si existe, si no el consumo base.
  const rateAt = (t) => (rateMap[t] != null ? rateMap[t] : CONS_H);

  let level = NIVEL0;
  const qC = [];
  const qN = [];
  const finalIdx = {};
  const entries = {};
  let pos = 0;

  for (let t = START(); t <= END(); t++) {
    // Re-anclaje: si hay una lectura manual en este paso, el nivel real
    // sustituye al estimado ANTES de procesar entradas/consumo. Esto afecta
    // al hueco disponible y por tanto a las decisiones de descarga (la
    // secuencia se recalcula desde aquí en adelante).
    if (readingMap[t] != null) {
      level = Math.max(0, Math.min(CAP, readingMap[t]));
    }

    const isStopped = stoppedSteps.has(t);

    // Entradas graduales de boxes: ya excluidas de los pasos con parada
    // al construir el mapa (se posponen automáticamente).
    const boxTons = boxMap[t] || 0;
    if (boxTons > 0) {
      level = Math.min(CAP, level + boxTons);
    }

    // `<= t` (no `=== t`): encola todo camión cuya llegada ya ocurrió o ocurre
    // en este paso. Evita que un step sin coincidencia exacta atasque el puntero.
    while (pos < trucks.length && trucks[pos].arr <= t) {
      (trucks[pos].crit ? qC : qN).push(trucks[pos]);
      pos++;
    }
    let space = CAP - level;

    // Durante una parada no hay ninguna actividad: ni descargas ni consumo.
    // Los camiones encolados esperan. Los no-críticos sin crítico delante
    // tampoco se evalúan (no se marcan retenidos por bloqueo de crítico
    // durante una parada).
    if (!isStopped) {
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
    }

    // Consume si NO hay parada y (está dentro de la ventana base de consumo
    // O hay una franja que cubre este paso). La franja activa el consumo fuera
    // de la ventana (finde, noches del finde, etc.).
    const inWindow = t >= CONSUMO_INICIO && t < CONSUMO_FIN;
    const consumes = !isStopped && (inWindow || rateMap[t] != null);
    const cons = consumes ? Math.min(rateAt(t) / STEPS_H, level) : 0;
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
    // Mismo re-anclaje que en el bucle de decisión, para que la curva
    // dibujada coincida con el nivel real medido.
    if (readingMap[t] != null) {
      lvl2 = Math.max(0, Math.min(CAP, readingMap[t]));
    }
    const d = Math.floor(t / (24 * STEPS_H));
    const hTxt = stepToHHMM(t, STEPS_H, PASO);
    const truckEnt = entries[t] || 0;
    const boxEnt = boxMap[t] || 0;
    const totalEnt = truckEnt + boxEnt;
    const isStopped = stoppedSteps.has(t);
    lvl2 = Math.min(CAP, lvl2 + totalEnt);
    const levelAfterEntry = lvl2;
    const inWindow = t >= CONSUMO_INICIO && t < CONSUMO_FIN;
    const consumes = !isStopped && (inWindow || rateMap[t] != null);
    const cons = consumes ? Math.min(rateAt(t) / STEPS_H, lvl2) : 0;
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
