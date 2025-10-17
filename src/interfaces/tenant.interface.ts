import { Document } from "mongoose";

export interface ITenant extends Document {
  nombre: string;
  rubro: string;
  direccion: string;
  contacto: {
    telefono: string;
    email?: string;
    whatsapp: string;
    redesSociales?: string[];
  };
  horarios: Map<string, string[]>;
  politicas: {
    cancelacion_min_horas: number;
    max_adelanto_dias: number;
  };
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
