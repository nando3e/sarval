import XLSX from 'xlsx';

const VALID_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_ALIASES = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', miércoles: 'Miércoles',
  jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', sábado: 'Sábado',
  LUNES: 'Lunes', MARTES: 'Martes', MIERCOLES: 'Miércoles', MIÉRCOLES: 'Miércoles',
  JUEVES: 'Jueves', VIERNES: 'Viernes', SABADO: 'Sábado', SÁBADO: 'Sábado',
};

function normalizeDay(raw) {
  const s = String(raw ?? '').trim();
  return VALID_DAYS.includes(s) ? s : (DAY_ALIASES[s] ?? null);
}

function normalizeTime(raw) {
  if (typeof raw === 'number') {
    const totalMinutes = Math.round(raw * 24 * 60);
    const hh = Math.floor(totalMinutes / 60) % 24;
    const mm = totalMinutes % 60;
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }
  const s = String(raw ?? '').trim();
  const m1 = s.match(/^(\d{1,2})[:\.,](\d{2})/);
  if (m1) return String(Number(m1[1])).padStart(2, '0') + ':' + m1[2];
  const m2 = s.match(/^(\d{1,2}):(\d{2}):\d{2}/);
  if (m2) return String(Number(m2[1])).padStart(2, '0') + ':' + m2[2];
  return null;
}

function normalizeCritical(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  return s === 'sí' || s === 'si' || s === 'yes' || s === 'true' || s === '1';
}

/**
 * Parsea un buffer de CSV o Excel (Planificacion Base).
 * Espera columnas: ID | Día | Hora | Proveedor | Toneladas | Crítico
 * Devuelve { trips: Array, errors: Array }
 */
export function parseFile(buffer, filename) {
  const ext = (filename ?? '').split('.').pop().toLowerCase();
  let rows;

  if (ext === 'csv') {
    const wb = XLSX.read(buffer, { type: 'buffer', raw: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  } else {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames.find((s) => s.toLowerCase().includes('planificacion') || s.toLowerCase().includes('base')) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  }

  if (rows.length < 2) {
    return { trips: [], errors: ['El archivo está vacío o solo tiene cabecera.'] };
  }

  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const colMap = {
    id: header.findIndex((h) => h === 'id' || h === 'numero' || h === 'num'),
    day: header.findIndex((h) => h.includes('dia') || h.includes('día') || h === 'day'),
    time: header.findIndex((h) => h.includes('hora') || h === 'time'),
    supplier: header.findIndex((h) => h.includes('proveedor') || h.includes('supplier')),
    tons: header.findIndex((h) => h.includes('tonelada') || h.includes('tons') || h.includes('tn')),
    critical: header.findIndex((h) => h.includes('critico') || h.includes('crítico') || h.includes('critical')),
    tolva: header.findIndex((h) => h.includes('tolva') || h === 'hopper'),
  };

  if (colMap.day < 0 || colMap.time < 0 || colMap.supplier < 0 || colMap.tons < 0) {
    return { trips: [], errors: [`No se encontraron las columnas necesarias. Cabecera detectada: ${JSON.stringify(rows[0])}`] };
  }

  const trips = [];
  const errors = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    const rawId = colMap.id >= 0 ? row[colMap.id] : i;
    const tripNumber = Number(rawId) || i;
    const day = normalizeDay(row[colMap.day]);
    const time = normalizeTime(row[colMap.time]);
    const supplier = String(row[colMap.supplier] ?? '').trim();
    const rawTons = row[colMap.tons];
    const tons = typeof rawTons === 'number' ? rawTons : Number(String(rawTons).replace(',', '.'));
    const isCritical = colMap.critical >= 0 ? normalizeCritical(row[colMap.critical]) : false;

    if (!day) { errors.push(`Fila ${rowNum}: día inválido "${row[colMap.day]}"`); continue; }
    if (!time) { errors.push(`Fila ${rowNum}: hora inválida "${row[colMap.time]}"`); continue; }
    if (!supplier) { errors.push(`Fila ${rowNum}: proveedor vacío`); continue; }
    if (Number.isNaN(tons) || tons <= 0) { errors.push(`Fila ${rowNum}: toneladas inválidas "${rawTons}"`); continue; }

    const tolva = colMap.tolva >= 0 ? row[colMap.tolva] : null;
    trips.push({ trip_number: tripNumber, day, scheduled_time: time, supplier, tons, is_critical: isCritical, tolva });
  }

  return { trips, errors };
}
