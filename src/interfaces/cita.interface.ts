import { Document, Types } from "mongoose";

export interface ICita extends Document {
  tenant_id: Types.ObjectId;
  cliente_id: Types.ObjectId;
  servicios_id: Types.ObjectId[];
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: "confirmada" | "pendiente" | "cancelada";
  recurso_id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
