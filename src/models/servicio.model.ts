import { Schema, model } from "mongoose";
import type { IServicio } from "../interfaces/servicio.interface.ts";

const ServicioSchema = new Schema(
  {
    tenant_id: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    nombreServicio: {
      type: String,
      required: true,
      trim: true,
    },
    duracion: {
      type: Number,
      required: true,
      min: 5, // mínimo 5 minutos
      max: 480, // máximo 8 horas
      validate: {
        validator: function (v: number) {
          return v % 5 === 0; // múltiplos de 5 minutos
        },
        message: "La duración debe ser en múltiplos de 5 minutos",
      },
    },
    precio: {
      type: String,
      trim: true,
      validate: {
        validator: function (v: string) {
          return /^\d{1,3}(,\d{3})*(\.\d{3})*$/.test(v);
        },
        message:
          "El formato del precio debe ser numérico con separadores de miles (ejemplo: 20.000)",
      },
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// Índice compuesto para búsqueda eficiente de servicios por tenant
ServicioSchema.index({ tenant_id: 1, nombreServicio: 1 });

export const ServicioModel = model<IServicio>("Servicio", ServicioSchema);
