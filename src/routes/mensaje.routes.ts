import { Router } from "express";
import { recibirMensaje } from "../controllers/mensaje.controller.js";
import { authenticateApiKey } from "../middlewares/auth.middleware.js";

const router = Router();

// Aplicar middlewares en orden
router.use(authenticateApiKey);

/**
 * @route POST /v1/messages
 * @description Recibe mensajes de WhatsApp
 * @access Privado (requiere API Key)
 */
router.post("/", recibirMensaje);

export default router;
