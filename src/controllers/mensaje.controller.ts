import type { Request, Response } from "express";
import { MensajeModel } from "../models/mensaje.model.js";
import type { IMensaje } from "../interfaces/mensaje.interface.js";
import { ClienteModel } from "../models/cliente.model.js";
import { Types } from "mongoose";

export const recibirMensaje = async (req: any, res: Response) => {
  try {
    const { tenant_id, telefono, nombre, timestamp, contenido, key } =
        req.body as IMensaje,
      respuesta = "Mensaje recibido correctamente";
      console.log("Mensaje llegado:", req.body);
    // Verificar si el cliente existe, si no, crearlo
    let cliente = await ClienteModel.findOne({
      tenant_id: new Types.ObjectId(tenant_id),
      telefono,
    });

    if (!cliente)
      cliente = await ClienteModel.create({
        tenant_id: new Types.ObjectId(tenant_id),
        telefono,
        nombre,
      });

    // Crear el registro del mensaje
    const nuevoMensaje = await MensajeModel.create({
      tenant_id: new Types.ObjectId(tenant_id),
      key,
      nombre,
      telefono,
      timestamp,
      tipo: "entrante",
      contenido,
      respuesta: { texto: respuesta },
    });

    res.status(201).json({
      respuesta,
      mensaje: nuevoMensaje,
    });
  } catch (error) {
    console.error("Error al procesar mensaje:", error);
    res.status(500).json({
      error: "Error interno al procesar el mensaje",
    });
  }
};
