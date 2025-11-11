import { CitaModel } from "../models/cita.model.js";
import type { ICita } from "../interfaces/cita.interface.js";
import { Types, type FilterQuery } from "mongoose";
import { addMinutes, parse, format } from "date-fns";
import { ServicioModel } from "../models/servicio.model.js";

export const crearCita = async (data: ICita) => {
  const { servicios_id, hora_inicio } = data;

  // Supón que el servicio tiene campo "duracion" en minutos
  const servicio = await ServicioModel.findById(servicios_id[0]);
  if (!servicio) throw new Error("Servicio no encontrado");

  const inicio = parse(hora_inicio, "HH:mm", new Date());
  const fin = addMinutes(inicio, servicio.duracion);
  data.hora_fin = format(fin, "HH:mm");

  const cita = new CitaModel(data);
  return await cita.save();
};

/** Obtener todas las citas (puede filtrarse por tenant o estado) */
export const obtenerCitas = async (filtro: FilterQuery<ICita> = {}) => {
  try {
    return await CitaModel.find(filtro)
      .populate("tenant_id", "nombre")
      .populate("cliente_id", "nombre telefono")
      .populate("servicios_id", "nombre duracion")
      .populate("recurso_id", "nombre tipo")
      .sort({ fecha: 1, hora_inicio: 1 })
      .lean();
  } catch (error: any) {
    throw new Error(`Error al obtener citas: ${error.message}`);
  }
};

/** Obtener una cita por su ID */
export const obtenerCitaPorId = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw new Error("ID de cita inválido");

  try {
    const cita = await CitaModel.findById(id)
      .populate("tenant_id", "nombre")
      .populate("cliente_id", "nombre telefono")
      .populate("servicios_id", "nombre duracion")
      .populate("recurso_id", "nombre tipo");

    if (!cita) throw new Error("Cita no encontrada");
    return cita;
  } catch (error: any) {
    throw new Error(`Error al obtener la cita: ${error.message}`);
  }
};

/** Actualizar una cita existente */
export const actualizarCita = async (id: string, data: Partial<ICita>) => {
  if (!Types.ObjectId.isValid(id)) throw new Error("ID de cita inválido");

  try {
    const citaActualizada = await CitaModel.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });

    if (!citaActualizada) throw new Error("Cita no encontrada para actualizar");
    return citaActualizada;
  } catch (error: any) {
    throw new Error(`Error al actualizar la cita: ${error.message}`);
  }
};

/** Eliminar una cita por su ID */
export const eliminarCita = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw new Error("ID de cita inválido");

  try {
    const resultado = await CitaModel.findByIdAndDelete(id);
    if (!resultado) throw new Error("Cita no encontrada para eliminar");
    return { mensaje: "Cita eliminada correctamente" };
  } catch (error: any) {
    throw new Error(`Error al eliminar la cita: ${error.message}`);
  }
};

/** Cambiar estado de una cita (confirmada / cancelada / pendiente) */
export const cambiarEstado = async (
  id: string,
  nuevoEstado: ICita["estado"]
) => {
  if (!Types.ObjectId.isValid(id)) throw new Error("ID de cita inválido");

  const estadosPermitidos = ["confirmada", "pendiente", "cancelada"];
  if (!estadosPermitidos.includes(nuevoEstado)) {
    throw new Error("Estado no válido");
  }

  try {
    const cita = await CitaModel.findByIdAndUpdate(
      id,
      { estado: nuevoEstado },
      { new: true }
    );

    if (!cita) throw new Error("Cita no encontrada para cambiar estado");
    return cita;
  } catch (error: any) {
    throw new Error(`Error al cambiar el estado de la cita: ${error.message}`);
  }
};

/** Verificar disponibilidad del recurso en una fecha y hora */
export const verificarDisponibilidad = async (
  recurso_id: string,
  fecha: string,
  hora_inicio: string,
  hora_fin: string
) => {
  try {
    const citas = await CitaModel.find({
      recurso_id,
      fecha,
      $or: [
        {
          hora_inicio: { $lt: hora_fin },
          hora_fin: { $gt: hora_inicio },
        },
      ],
    });

    return citas.length === 0; // true si está disponible
  } catch (error: any) {
    throw new Error(`Error al verificar disponibilidad: ${error.message}`);
  }
};
