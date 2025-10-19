import { Schema, model } from "mongoose";
import type { ICliente } from "../interfaces/cliente.interface.ts";

const ClienteSchema = new Schema(
  {
    nombre: {
      type: String,
      trim: true,
    },
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
    tenant_id: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// Índice compuesto único por tenant_id y teléfono
ClienteSchema.index({ tenant_id: 1, telefono: 1 }, { unique: true });

// Middleware para formatear el número de teléfono
ClienteSchema.pre("save", function (next) {
  if (this.isModified("telefono")) {
    // limpiar espacios y caracteres no numéricos excepto +
    let numero = this.telefono.replace(/\s+/g, "").replace(/[^\d+]/g, "");

    // quitar el +57 si ya viene, para validar longitud
    const sinPrefijo = numero.replace(/^\+57/, "");

    if (sinPrefijo.length !== 10) {
      return next(new Error("El número de teléfono debe tener 10 dígitos"));
    }

    // volver a guardar con prefijo obligatorio
    this.telefono = `+57${sinPrefijo}`;
  }

  next();
});

ClienteSchema.pre('findOne', function (next) {
  const filtro = this.getFilter(); // accede al objeto del filtro

  if (filtro.telefono) {
    let numero = filtro.telefono.replace(/\s+/g, '').replace(/[^\d+]/g, '');
    const sinPrefijo = numero.replace(/^\+57/, '');
    filtro.telefono = `+57${sinPrefijo}`;
    this.setQuery(filtro); // reescribe el filtro
  }

  next();
});


export const ClienteModel = model<ICliente>("Cliente", ClienteSchema);
