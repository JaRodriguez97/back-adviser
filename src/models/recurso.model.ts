import { Schema, model } from "mongoose";
import type { IRecurso } from "../interfaces/recurso.interface.ts";

const RecursoSchema = new Schema(
  {
    tenant_id: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    nombre: {
      type: String,
      required: true,
      trim: true,
    },
    tipo: {
      type: String,
      required: true,
      enum: ["persona", "espacio"],
      default: "persona",
    },
    descripcion: {
      type: String,
      trim: true,
    },
    activo: {
      type: Boolean,
      default: true,
    },
    especialidades: [
      {
        type: String,
        trim: true,
      },
    ],
    horarios: {
      type: Map,
      of: [
        {
          type: String,
          validate: {
            validator: function (v: string) {
              return /^([01]?[0-9]|2[0-3]):[0-5][0-9]-([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(
                v
              );
            },
            message: "El formato de horario debe ser HH:MM-HH:MM",
          },
        },
      ],
      required: false, // Opcional, si no se define usa los horarios del tenant
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// Índices
RecursoSchema.index({ tenant_id: 1, nombre: 1 });
RecursoSchema.index({ tenant_id: 1, tipo: 1 });

export const RecursoModel = model<IRecurso>("Recurso", RecursoSchema);
