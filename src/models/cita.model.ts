import { Schema, model } from "mongoose";
import { parse, isAfter } from "date-fns";
import type { ICita } from "../interfaces/cita.interface.ts";

const CitaSchema = new Schema(
  {
    tenant_id: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    cliente_id: {
      type: Schema.Types.ObjectId,
      ref: "Cliente",
      required: true,
    },
    tipoDocumento: {
      type: String,
      trim: true,
      required: true,
    },
    numeroDocumento: {
      type: String,
      trim: true,
      required: true,
    },
    nombresCompletos: {
      type: String,
      trim: true,
      required: true,
    },
    servicios_id: [
      {
        type: Schema.Types.ObjectId,
        ref: "Servicio",
        required: true,
      },
    ],
    fecha: {
      type: String,
      required: true,
      validate: {
        validator: function (v: string) {
          return /^\d{4}\/\d{2}\/\d{2}$/.test(v);
        },
        message: "El formato de fecha debe ser YYYY/MM/DD",
      },
    },
    hora_inicio: {
      type: String,
      required: true,
      validate: {
        validator: function (v: string) {
          return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: "El formato de hora debe ser HH:MM",
      },
    },
    hora_fin: {
      type: String,
      required: true,
      validate: {
        validator: function (v: string) {
          return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: "El formato de hora debe ser HH:MM",
      },
    },
    estado: {
      type: String,
      required: true,
      enum: ["confirmada", "pendiente", "cancelada"],
      default: "pendiente",
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// Índices
CitaSchema.index({ tenant_id: 1, hora_inicio: 1 });
CitaSchema.index({ tenant_id: 1, recurso_id: 1, hora_inicio: 1 });

// Middleware para validar que hora_fin sea mayor que hora_inicio
CitaSchema.pre("save", function (next) {
  if (this.isModified("hora_inicio") || this.isModified("hora_fin")) {
    const inicio = parse(this.hora_inicio, "HH:mm", new Date());
    const fin = parse(this.hora_fin, "HH:mm", new Date());

    if (!isAfter(fin, inicio)) {
      next(new Error("La hora de fin debe ser posterior a la hora de inicio"));
      return;
    }
  }
  next();
});

export const CitaModel = model<ICita>("Cita", CitaSchema);
