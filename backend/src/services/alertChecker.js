import pool from '../db/pool.js';
import { notifyWebhooks } from './webhookEmitter.js';

/**
 * Analiza los resultados de simulación de un recálculo y genera alertas:
 * - low_level_alert: nivel cae por debajo de nivel_minimo_alerta_tn
 * - empty_prediction: nivel llega a 0 (predicción de vaciado)
 * - critical_wait_exceeded: un viaje crítico espera más de max_espera_critico_h
 */
export async function checkAlerts(planId, tolvas, sequencesByTolva, simulationsByTolva) {
  const recipientsRows = await pool.query(
    'SELECT id, nombre, rol, telefono, email, canal_preferido FROM personal_planta WHERE activo = true AND recibir_alertas = true'
  );
  const recipients = recipientsRows.rows;

  for (const tolva of tolvas) {
    const simulation = simulationsByTolva[tolva.id] || [];
    const sequences = sequencesByTolva[tolva.id] || [];
    const tolvaLabel = tolva.nombre || `Tolva ${tolva.numero}`;

    // 1) Low level alert
    const alertLevel = tolva.nivel_minimo_alerta_tn != null ? Number(tolva.nivel_minimo_alerta_tn) : null;
    if (alertLevel != null && alertLevel > 0) {
      const lowPoints = simulation.filter((s) => s.silo_level < alertLevel);
      if (lowPoints.length > 0) {
        const first = lowPoints[0];
        await notifyWebhooks('low_level_alert', {
          plan_id: planId,
          tolva: { id: tolva.id, numero: tolva.numero, nombre: tolvaLabel },
          nivel_minimo_alerta_tn: alertLevel,
          primer_punto: { day: first.day, time: first.time, level: first.silo_level },
          total_pasos_bajo: lowPoints.length,
          recipients,
        });
      }
    }

    // 2) Empty prediction (level reaches 0)
    const emptyPoints = simulation.filter((s) => s.silo_level <= 0);
    if (emptyPoints.length > 0) {
      const first = emptyPoints[0];
      await notifyWebhooks('empty_prediction', {
        plan_id: planId,
        tolva: { id: tolva.id, numero: tolva.numero, nombre: tolvaLabel },
        primer_punto: { day: first.day, time: first.time },
        total_pasos_vacio: emptyPoints.length,
        recipients,
      });
    }

    // 3) Critical wait exceeded
    const maxWait = tolva.max_espera_critico_h != null ? Number(tolva.max_espera_critico_h) : null;
    if (maxWait != null && maxWait > 0) {
      const exceeded = sequences.filter(
        (s) => s.critico && Number(s.delay_capacity_hours) > maxWait
      );
      for (const trip of exceeded) {
        await notifyWebhooks('critical_wait_exceeded', {
          plan_id: planId,
          tolva: { id: tolva.id, numero: tolva.numero, nombre: tolvaLabel },
          max_espera_critico_h: maxWait,
          trip: {
            trip_id: trip.trip_id,
            trip_number: trip.trip_number,
            supplier: trip.supplier,
            tons: trip.tons,
            delay_hours: trip.delay_capacity_hours,
          },
          recipients,
        });
      }
    }
  }
}
