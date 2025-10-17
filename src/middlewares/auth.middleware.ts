import type { Request, Response, NextFunction } from "express";
import { ApiKeyModel } from "../models/apikey.model.js";

export const authenticateApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const apiKey = req.header("X-API-Key");

    if (!apiKey) {
      return res.status(401).json({
        error: "Se requiere API Key",
        code: "MISSING_API_KEY",
      });
    }

    const apiKeyDoc = await ApiKeyModel.findOne({
      key: apiKey,
      isActive: true,
    });

    if (!apiKeyDoc) {
      return res.status(401).json({
        error: "API Key inválida",
        code: "INVALID_API_KEY",
      });
    }

    // Añadir tenant_id al request para uso en controllers
    req.body.tenant_id = apiKeyDoc.tenant_id;

    next();
  } catch (error) {
    console.error("Error en autenticación:", error);
    res.status(500).json({
      error: "Error interno en autenticación",
      code: "AUTH_ERROR",
    });
  }
};
