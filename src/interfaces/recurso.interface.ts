import { Document, Types } from "mongoose";

export interface IRecurso extends Document {
  tenant_id: Types.ObjectId;
  nombre: string; // Nombre del barbero/estilista/cabina
  tipo: string; // "persona" o "espacio"
  descripcion?: string; // Información adicional
  activo: boolean; // Para deshabilitar temporalmente
  especialidades?: string[]; // Servicios que puede realizar (opcional)
  createdAt: Date;
  updatedAt: Date;
}
