import { Document, Types } from "mongoose";

export interface ICita extends Document {
  tenant_id: Types.ObjectId;
  cliente_id: Types.ObjectId;
  servicios_id: Array<Types.ObjectId>;
  tipoDocumento?: string;
  numeroDocumento?: string;
  nombresCompletos?: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: "confirmada" | "pendiente" | "cancelada";
  createdAt?: Date;
  updatedAt?: Date;
}
