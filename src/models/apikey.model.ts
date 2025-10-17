import mongoose from "mongoose";
import type { IApiKey } from "../interfaces/apikey.interface.js";

const apiKeySchema = new mongoose.Schema<IApiKey>(
  {
    tenant_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// Índice compuesto para buscar por tenant y key
apiKeySchema.index({ tenant_id: 1, key: 1 });

export const ApiKeyModel = mongoose.model<IApiKey>("ApiKey", apiKeySchema);
