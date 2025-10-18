import { Document, Types } from "mongoose";

export interface IMensaje extends Document {
  tenant_id: Types.ObjectId;
  key: String;
  nombre: string;
  telefono: string;
  timestamp: Date;
  contenido: {
    texto: string;
    intencion?: string; // agendar|cambiar|cancelar|info|otro
    entidades?: {
      fecha?: string;
      hora?: string;
      servicio?: Types.ObjectId;
      ambiguedad: boolean;
      solapamiento: boolean;
    };
  };
  respuesta: {
    texto: string;
    timestamp: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}
