import type { Request, Response } from "express";
import { MensajeModel } from "../models/mensaje.model.js";
import type { IMensaje } from "../interfaces/mensaje.interface.js";
import { ClienteModel } from "../models/cliente.model.js";
import { Types } from "mongoose";
import { env } from "process";
import { generateMessageId } from "../utils/hash.utils.js";
import {
  clasificarIntencion,
  extraerEntidades,
} from "../services/ia.service.js";

const API_KEY = env.API_KEY;
const GEMINI_ENDPOINT = `${env.URI_BASE}=${API_KEY}`;

const getGeminiReply = async (history: any[] = []) => {
  const formattedHistory = history.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.content }],
  }));

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
  // console.log("🚀 ~ getGeminiReply ~ data:", JSON.stringify(data));

  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  console.log("🚀 ~ getGeminiReply ~ reply:", reply);
  return reply;
};

export const recibirMensaje = async (req: any, res: Response) => {
  try {
    let { tenant_id, telefono, nombre, timestamp, contenido, key } =
        req.body as IMensaje,
      respuesta;

    // Verificar duplicados
    const message_id = generateMessageId(telefono, timestamp, contenido.texto);
    const mensajeExistente = await MensajeModel.findOne({
      message_id,
      tenant_id: new Types.ObjectId(tenant_id),
    });

    if (mensajeExistente) {
      return res.status(204).send();
    }

    // Clasificar la intención del mensaje y extraer entidades
    let clasificacion;
    let entidades;

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

    // Obtener mensajes anteriores para contexto
    let cadenaMensajes = await MensajeModel.find({
      tenant_id: new Types.ObjectId(tenant_id),
      telefono,
    }).limit(10);

    let cadenaMensajesfiltrados: { role: string; content: string }[] = [];

    if (cadenaMensajes.length) {
      cadenaMensajes.forEach(({ contenido, respuesta }) => {
        cadenaMensajesfiltrados.push({
          role: "user",
          content: contenido.texto,
        });
        cadenaMensajesfiltrados.push({
          role: "model",
          content: respuesta.texto,
        });
      });
      // si no existe cedna de mensajes, significa que es cliente nuevoMensaje, por endOfDecade, es posible que solo esté saludando, asi que el primero no sería reelevante analizarlo para clasificar ni tampoco la intensión
      clasificacion = await clasificarIntencion(contenido.texto);

      if (["agendar", "cambiar", "cancelar"].includes(clasificacion.intencion))
        entidades = await extraerEntidades(
          contenido.texto,
          clasificacion.intencion
        );
    }

    respuesta = await getGeminiReply([
      {
        role: "user",
        content: `Eres un asistente virtual para una IPS Sur Salud en Cali, Colombia. Responde de manera profesional y concisa. ignora los stickers, si te envia, ya sabes que es para alguna cosa graciosa pero amable, no le des importancia y concentra en el mensaje de texto.`,
        // content: `Eres un asistente virtual para una empresa de publicidad interna, externa y digitalmente en Cali, Colombia. Responde de manera profesional y concisa.`,
      },
      ...cadenaMensajesfiltrados,
      { role: "user", content: contenido.texto },
    ]);

    if (clasificacion && clasificacion.intencion) {
      contenido = {
        texto: contenido.texto,
        intencion: clasificacion.intencion,
      };
    }

    if (entidades && Object.keys(entidades).length) {
      contenido = {
        ...contenido,
        entidades,
      };
    }

    // Crear el registro del mensaje
    const nuevoMensaje = await MensajeModel.create({
      tenant_id: new Types.ObjectId(tenant_id),
      key,
      nombre,
      telefono,
      timestamp,
      contenido,
      respuesta: { texto: respuesta },
      message_id,
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
