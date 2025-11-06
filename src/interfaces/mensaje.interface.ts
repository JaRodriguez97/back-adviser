import { Document, Types } from "mongoose";

export type IntencionMensaje =
  | "agendar"
  | "cambiar"
  | "cancelar"
  | "info"
  | "otro";

export interface IMensaje extends Document {
  tenant_id: Types.ObjectId;
  key: String;
  nombre: string;
  telefono: string;
  timestamp: Date;
  message_id: string;
  contenido: {
    texto: string;
    intencion?: IntencionMensaje;
    entidades?: {
      fecha?: string;
      hora?: string;
      servicio?: Types.ObjectId;
      tipoDocumento?: string;
      numeroDocumento?: string;
      nombresCompletos?: string;
      ambiguedad?: boolean;
      solapamiento?: boolean;
      confirmacion?: boolean;
    };
  };
  respuesta: {
    texto: string;
    timestamp: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}
