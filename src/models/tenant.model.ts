import { Schema, model } from "mongoose";
import type { ITenant } from "../interfaces/tenant.interface.ts";

const TenantSchema = new Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
    },
    rubro: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    direccion: {
      type: String,
      required: true,
      trim: true,
    },
    contacto: {
      telefono: {
        type: String,
        required: true,
        trim: true,
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
      },
      whatsapp: {
        type: String,
        required: true,
        trim: true,
        unique: true,
      },
      redesSociales: [
        {
          type: String,
          trim: true,
        },
      ],
      required: true,
    },
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
      required: true,
    },
    politicas: {
      cancelacion_min_horas: {
        type: Number,
        required: true,
        min: 24, // mínimo de horas para cancelar
      },
      max_adelanto_dias: {
        type: Number,
        required: true,
        min: 1,
        max: 30, // máximo 1 mes
      },
    },
    activo: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// Índices
TenantSchema.index({ rubro: 1 });
TenantSchema.index({ "contacto.telefono": 1 }, { unique: true });

// Middleware para formatear el número de WhatsApp
TenantSchema.pre("save", function (next) {
  if (this.isModified("contacto.telefono")) {
    // Crear el enlace de WhatsApp usando el número de teléfono
    const numero = this.contacto.telefono.replace(/\D/g, "");
    this.contacto.whatsapp = `htps://wa.me/${numero}`;
  }
  next();
});

export const TenantModel = model<ITenant>("Tenant", TenantSchema);
