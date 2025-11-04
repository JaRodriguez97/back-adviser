import { Schema, model } from "mongoose";
import type { IMensaje } from "../interfaces/mensaje.interface.ts";

const MensajeSchema = new Schema(
  {
    tenant_id: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    message_id: {
      type: String,
      required: true,
      unique: true,
    },
    key: { type: String, required: true },
    nombre: { type: String },
    telefono: { type: String, required: true },
    timestamp: {
      type: Date,
      required: true,
    },
    contenido: {
      texto: {
        type: String,
        required: true,
      },
      intencion: {
        type: String,
        enum: ["agendar", "cambiar", "cancelar", "info", "otro"],
      },
      entidades: {
        fecha: { type: String },
        hora: { type: String },
        servicio: {
          type: Schema.Types.ObjectId,
          ref: "Servicio",
        },
        ambiguedad: { type: Boolean },
        solapamiento: { type: Boolean },
        confirmacion: { type: Boolean },
      },
    },
    respuesta: {
      texto: { type: String },
      timestamp: { type: Date, default: Date.now },
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// Índices
MensajeSchema.index({ tenant_id: 1, cliente_id: 1, timestamp: -1 });
MensajeSchema.index({ tenant_id: 1, timestamp: -1 });

// Índice compuesto para verificación rápida de duplicados
MensajeSchema.index({ tenant_id: 1, message_id: 1 }, { unique: true });

export const MensajeModel = model<IMensaje>("Mensaje", MensajeSchema);
