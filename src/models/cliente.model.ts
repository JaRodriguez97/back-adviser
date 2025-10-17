import { Schema, model } from "mongoose";
import type { ICliente } from "../interfaces/cliente.interface.ts";

const ClienteSchema = new Schema(
  {
    nombre: {
      type: String,
      required: true,
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
    // Eliminar caracteres no numéricos
    const numero = this.telefono.replace(/\D/g, "");
    if (numero.length !== 10) {
      next(new Error("El número de teléfono debe tener 10 dígitos"));
      return;
    }
    this.telefono = `+57${numero}`;
  }
  next();
});

export const ClienteModel = model<ICliente>("Cliente", ClienteSchema);
