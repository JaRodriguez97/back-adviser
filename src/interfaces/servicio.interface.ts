import { Document, Types } from "mongoose";

export interface IServicio extends Document {
  tenant_id: Types.ObjectId;
  nombreServicio: string;
  duracion: number; // en minutos
  precio?: string;
  createdAt: Date;
  updatedAt: Date;
}
