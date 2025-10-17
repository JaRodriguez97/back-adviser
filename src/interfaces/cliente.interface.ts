import { Document, Types } from "mongoose";

export interface ICliente extends Document {
  nombre: string;
  telefono: string;
  email?: string;
  tenant_id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
