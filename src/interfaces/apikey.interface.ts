import { Document, Types } from "mongoose";

export interface IApiKey extends Document {
  tenant_id: Types.ObjectId;
  key: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
