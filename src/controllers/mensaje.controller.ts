import type { Request, Response } from "express";
import { MensajeModel } from "../models/mensaje.model.js";
import type { IMensaje } from "../interfaces/mensaje.interface.js";
import { ClienteModel } from "../models/cliente.model.js";
import { Types } from "mongoose";
import { env } from "process";

const API_KEY = env.API_KEY;
const GEMINI_ENDPOINT = `${env.URI_BASE}=${API_KEY}`;

const getGeminiReply = async (history: any[] = []) => {
  const formattedHistory = history.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.content }],
  }));
  console.log("🚀 ~ getGeminiReply ~ formattedHistory:", formattedHistory)

  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: formattedHistory,
      generationConfig: {
        temperature: 0.7,
        topK: 32,
        topP: 1,
        maxOutputTokens: 256,
      },
    }),
  });

  const data = await response.json();

  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return reply;
};

export const recibirMensaje = async (req: any, res: Response) => {
  try {
    const { tenant_id, telefono, nombre, timestamp, contenido, key } =
      req.body as IMensaje;
    let respuesta;

    console.log("Mensaje llegado:", req.body);
    // Verificar si el cliente existe, si no, crearlo
    let cliente = await ClienteModel.findOne({
      tenant_id: new Types.ObjectId(tenant_id),
      telefono,
    });

    if (!cliente)
      cliente = await ClienteModel.create({
        tenant_id: new Types.ObjectId(tenant_id),
        telefono,
        nombre,
      });

    let cadenaMensajes = await MensajeModel.find({
      tenant_id:  new Types.ObjectId(tenant_id),
      telefono,
    });

    let cadenaMensajesfiltrados: { role: string; content: string; }[] = [];

    if (cadenaMensajes.length) {
      cadenaMensajes.forEach(({ contenido, respuesta }) => {
        cadenaMensajesfiltrados.push({
          role: "user",
          content: contenido.texto,
        });
        cadenaMensajesfiltrados.push({
          role: "system",
          content: respuesta.texto,
        });
      });
    }

    respuesta = await getGeminiReply([
      {
        role: "system",
        content: `Eres un asistente virtual para una empresa de publicidad interna, externa y digitalmente en Cali, Colombia. Responde de manera profesional y concisa.`,
      },
      ...cadenaMensajesfiltrados,
      { role: "user", content: contenido.texto },
    ]);

    // Crear el registro del mensaje
    const nuevoMensaje = await MensajeModel.create({
      tenant_id: new Types.ObjectId(tenant_id),
      key,
      nombre,
      telefono,
      timestamp,
      tipo: "entrante",
      contenido,
      respuesta: { texto: respuesta },
    });

    nuevoMensaje.save();

    res.status(201).json({
      respuesta,
      mensaje: nuevoMensaje,
    });
  } catch (error) {
    console.error("Error al procesar mensaje:", error);
    res.status(500).json({
      error: "Error interno al procesar el mensaje",
    });
  }
};
