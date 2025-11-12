import type { FilterQuery, UpdateQuery } from "mongoose";
import type { ITenant } from "../interfaces/tenant.interface.ts";
import { TenantModel } from "../models/tenant.model.js";
import { addDays, differenceInMinutes, isBefore, parseISO } from "date-fns";
import { obtenerCitas } from "../services/cita.service.js";

/**
 * Crea un nuevo tenant
 */
export const crearTenant = async (data: ITenant) => {
  const nuevoTenant = new TenantModel(data);
  return await nuevoTenant.save();
};

/**
 * Obtiene todos los tenants (con filtros opcionales)
 */
export const obtenerTenants = async (filtro: FilterQuery<ITenant> = {}) => {
  return await TenantModel.find(filtro).lean();
};

/**
 * Obtiene un tenant por su ID
 */
export const obtenerTenantPorId = async (id: string) => {
  return await TenantModel.findById(id).lean();
};

/**
 * Actualiza un tenant
 */
export const actualizarTenant = async (
  id: string,
  data: UpdateQuery<ITenant>
) => {
  return await TenantModel.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  }).lean();
};

/**
 * Elimina un tenant (lógicamente o físicamente)
 */
export const eliminarTenant = async (id: string, logico = true) => {
  if (logico) {
    return await TenantModel.findByIdAndUpdate(
      id,
      { activo: false },
      { new: true }
    ).lean();
  }
  return await TenantModel.findByIdAndDelete(id).lean();
};

/**
 * Obtiene todos los tenants activos
 */
export const obtenerTenantsActivos = async () => {
  return await TenantModel.find({ activo: true }).lean();
};

/**
 * Actualiza la fecha de próxima disponibilidad de un tenant
 */
export const actualizarFechaProximaDisponible = async (
  id: string,
  fecha: Date
) => {
  return await TenantModel.findByIdAndUpdate(
    id,
    { "politicas.fechaProximaDisponible": fecha },
    { new: true, runValidators: true }
  ).lean();
};

/**
 * Verifica si existe un tenant con un whatsapp o teléfono determinado
 */
export const existeTenantPorContacto = async (whatsapp: string) => {
  return await TenantModel.exists({ "contacto.whatsapp": whatsapp });
};

// --------------------------------------------
// Función principal
// --------------------------------------------
export async function proximoEspacioLibre(
  fecha: string,
  horaInicio: string,
  horaFin: string
): Promise<Date | null> {
  let fechaBase = parseISO(fecha);

  for (let i = 1; i < 30; i++) {
    const fechaAnalizada = addDays(fechaBase, i);
    const citas = await obtenerCitas({ fecha: fechaAnalizada });

    // Si no hay citas, retornamos el inicio de jornada de ese día
    if (citas.length === 0) {
      return combinarFechaHora(fechaAnalizada, horaInicio);
    }

    // Ordenar citas por horaInicio
    const citasOrdenadas = citas.sort((a, b) =>
      a.hora_inicio.localeCompare(b.hora_inicio)
    );

    // Convertir jornada laboral en fechas
    const inicioJornada = combinarFechaHora(fechaAnalizada, horaInicio);
    const finJornada = combinarFechaHora(fechaAnalizada, horaFin);

    // Buscar huecos entre citas
    let horaActual = inicioJornada;

    for (const cita of citasOrdenadas) {
      const inicioCita = combinarFechaHora(fechaAnalizada, cita.hora_inicio);
      const finCita = combinarFechaHora(fechaAnalizada, cita.hora_fin);

      // ¿Hay espacio entre la hora actual y el inicio de la cita?
      const minutosDisponibles = differenceInMinutes(inicioCita, horaActual);

      if (minutosDisponibles >= 30) {
        // Hueco encontrado
        return horaActual;
      }

      // Mover la hora actual al final de la cita
      if (isBefore(horaActual, finCita)) {
        horaActual = finCita;
      }
    }

    // Revisar si hay espacio al final de la jornada
    const minutosRestantes = differenceInMinutes(finJornada, horaActual);
    if (minutosRestantes >= 30) {
      return horaActual;
    }
  }

  // Si en 30 días no hay hueco
  return null;
}

// --------------------------------------------
// Helper: combinar fecha con hora tipo "HH:mm"
// --------------------------------------------
function combinarFechaHora(fecha: Date, hora: string): Date {
  const [horas, minutos] = hora.split(":").map(Number);
  const nuevaFecha = new Date(fecha);
  nuevaFecha.setHours(horas!, minutos, 0, 0);
  return nuevaFecha;
}
