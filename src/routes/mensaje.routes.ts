import { Router } from "express";
import { recibirMensaje } from "../controllers/mensaje.controller.js";
import { authenticateApiKey } from "../middlewares/auth.middleware.js";

const router = Router();

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateApiKey);

/**
 * @route POST /v1/messages
 * @description Recibe mensajes de WhatsApp
 * @access Privado (requiere API Key)
 */
router.post("/", recibirMensaje);

export default router;
