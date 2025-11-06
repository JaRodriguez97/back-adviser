import type { Response } from "express";
import { Types } from "mongoose";
import type { IMensaje } from "../interfaces/mensaje.interface.js";
import { ClienteModel } from "../models/cliente.model.js";
import { MensajeModel } from "../models/mensaje.model.js";
import { TenantModel } from "../models/tenant.model.js";
import {
  clasificarIntencion,
  extraerEntidades,
  getGeminiReply,
} from "../services/ia.service.js";
import { generateMessageId } from "../utils/hash.utils.js";

// ==============================
// Sistema de control de mensajes
// ==============================

const MAX_MESSAGES_PER_MINUTE = 5;
const WINDOW_TIME = 60 * 1000;
const MESSAGE_INTERVAL = WINDOW_TIME / MAX_MESSAGES_PER_MINUTE;

const messageQueue: (() => Promise<
  Response<any, Record<string, any>> | undefined
>)[] = [];

setInterval(async () => {
  if (messageQueue.length === 0) return;

  const processMessage = messageQueue.shift();
  if (!processMessage) return;

  try {
    await processMessage();
  } catch (err) {
    console.error("Error al procesar mensaje desde la cola:", err);
  }
}, MESSAGE_INTERVAL);

function enqueueMessage(
  fn: () => Promise<Response<any, Record<string, any>> | undefined>
) {
  messageQueue.push(fn);
}

// ==============================
// Controlador principal
// ==============================

export const recibirMensaje = async (req: any, res: Response) => {
  try {
    let { tenant_id, telefono, nombre, timestamp, contenido, key } =
        req.body as IMensaje,
      respuesta!: string;

    enqueueMessage(async () => {
      try {
        // Verificar duplicados
        const message_id = generateMessageId(
          telefono,
          timestamp,
          contenido.texto
        );
        const mensajeExistente = await MensajeModel.findOne({
          message_id,
          tenant_id: new Types.ObjectId(tenant_id),
        });

        if (mensajeExistente) {
          return res.status(204).send();
        }

        // Clasificar la intención del mensaje y extraer entidades
        let clasificacion;
        let entidades: IMensaje["contenido"]["entidades"];

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
        })
          .limit(10)
          .sort({ timestamp: -1 });

        let cadenaMensajesfiltrados: { role: string; content: string }[] = [];

        if (cadenaMensajes.length) {
          //* si no existe cadena de mensajes, significa que es cliente nuevoMensaje, por ende, es posible que solo esté saludando, asi que el primero no sería reelevante analizarlo para clasificar ni tampoco la intensión
          clasificacion = await clasificarIntencion(
            contenido.texto,
            cadenaMensajes[cadenaMensajes.length - 1]?.contenido.intencion,
            cadenaMensajes[cadenaMensajes.length - 1]?.contenido.texto,
            cadenaMensajes[cadenaMensajes.length - 1]?.respuesta.texto
          );

          if (
            ["agendar", "cambiar", "cancelar"].includes(clasificacion.intencion)
          ) {
            let contenidoAnterior =
                cadenaMensajes[cadenaMensajes.length - 1]?.contenido!,
              e = contenidoAnterior?.entidades;

            if (!e || (!e.fecha && !e.hora && !e.servicio)) {
              e = [...cadenaMensajes].reverse().find(({ contenido }) => {
                const en = contenido?.entidades;
                return en && (en.fecha || en.hora || en.servicio);
              })?.contenido.entidades || {};
            }

            entidades =
              e && !e?.confirmacion
                ? await extraerEntidades(contenido.texto, e)
                : e;

            console.log(
              "🚀 ~ recibirMensaje ~ entidades despues de 'fusion':",
              entidades
            );
          }

          cadenaMensajes.forEach(({ contenido, respuesta }) => {
            // Construimos una descripción mínima en lenguaje natural, sin JSON ni etiquetas inútiles
            const partes = [];

            if (contenido.texto) partes.push(`Cliente: ${contenido.texto}`);

            if (contenido.intencion)
              partes.push(
                `Intención detectada: ${JSON.stringify(contenido.intencion)}`
              );

            if (contenido.entidades && Object.keys(contenido.entidades).length)
              partes.push(
                `Datos extraídos: ${Object.entries(contenido.entidades)
                  .map(([k, v]) => `${k}: ${v ?? "?"}`)
                  .join(", ")}`
              );

            const textoCompacto = partes.join(". ") + ".";

            cadenaMensajesfiltrados.push({
              role: "user",
              content: textoCompacto,
            });

            cadenaMensajesfiltrados.push({
              role: "model",
              content: respuesta.texto,
            });
          });
        }

        let tenant = await TenantModel.aggregate([
          { $match: { _id: tenant_id } },
          {
            $lookup: {
              from: "servicios", // Nombre exacto de la colección de servicios
              localField: "_id", // Campo del Tenant que relaciona
              foreignField: "tenant_id", // Campo en servicios que apunta al Tenant
              as: "servicios", // Nombre del array resultante
            },
          },
        ]);

        if (!tenant.length) throw new Error("Tenant no encontrado");

        respuesta = await getGeminiReply([
          {
            role: "user",
            content: `
            Eres EMILY, asistente virtual del negocio: ${JSON.stringify(
              tenant
            )}.  
            Tu función: atender a las personas, ofrecer información, además de agendar o modificar citas.  
            Responde SIEMPRE (aunque sea breve).  
            Si el mensaje es saludo → responde cordialmente e invita a contar su necesidad.  
            Si es multimedia o sticker → di que no puedes procesarlo, pero esperas su texto.  
            Flujo ideal:  
            1) Saludo → 2) Detectar necesidad → 3) Si cita: obtener fecha, hora y servicio → 4) Confirmar → 5) Decir que se contactarán pronto.  
            Usa tono profesional, amable y natural. Puedes usar emojis con criterio.`,
          },
          ...cadenaMensajesfiltrados,
          {
            role: "user",
            content:
              `
              Responde SOLO texto (sin formato ni estructura).  
              Mensaje del cliente: "${contenido.texto}".` +
              (entidades && Object.keys(entidades).length
                ? ` Entidades a completar: ${JSON.stringify(entidades)}.  
                    Datos esperados: fecha ("yyyy-mm-dd"), hora ("hh:mm"), servicio (nombre exacto).  
                    Hoy es ${
                      new Date().toISOString().split("T")[0]
                    } (solo referencia para interpretar expresiones como "el próximo miércoles").`
                : ""),
          },
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

        await nuevoMensaje.save();

        return res.status(201).json({
          respuesta,
          mensaje: nuevoMensaje,
        });
      } catch (err) {
        console.error("❌ Error interno al procesar mensaje:", err);
        return res.status(500).json({
          error: "Error interno del servidor",
        });
      }
    });
  } catch (error) {
    console.error("Error al procesar mensaje:", error);
    res.status(500).json({
      error: "Error interno al procesar el mensaje",
    });
  }
};
