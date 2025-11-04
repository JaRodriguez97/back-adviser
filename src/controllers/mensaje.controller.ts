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

// const API_KEY = env.API_KEY;
// const GEMINI_ENDPOINT = `${env.URI_BASE}=${API_KEY}`;

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
    }).limit(10);

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
        entidades = !cadenaMensajes[cadenaMensajes.length - 1]?.contenido
          .entidades?.confirmacion
          ? await extraerEntidades(
              contenido.texto,
              cadenaMensajes[cadenaMensajes.length - 1]?.contenido.entidades
            )
          : cadenaMensajes[cadenaMensajes.length - 1]?.contenido.entidades;
      }

      cadenaMensajes.forEach(({ contenido, respuesta }) => {
        contenido.texto = `{
          texto: ${
            contenido.texto
          }, // la respuesta que se le dio al cliente"
          intencion: ${JSON.stringify(
            contenido.intencion
          )}, // la intencion detectada en el mensaje del cliente
          entidades: ${JSON.stringify(
            contenido.entidades
          )} // las entidades o datos extraidas del mensaje (actual o anteriores) del cliente
        }`;

        cadenaMensajesfiltrados.push({
          role: "user",
          content: contenido.texto,
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

    respuesta = await getGeminiReply([
      {
        role: "user",
        content: `Eres un asistente virtual para la siguiente empresa o negocio: ${JSON.stringify(
          tenant
        )}.
        
        
        Trabaja con esos datos para ofrecer la mejor experiencia posible al cliente. si envian stickers o archivos multimedia, responde que no estas habilitado para procesarlos pero que estas atento a su mensaje de texto. si es un saludo, responde muy educadamente ofreciendo tu asistencia. la idea es mitigar a que el cliente exprese inicialmente sus necesidades. si quieres implementa emojis de forma muy profesional y adecuada al contexto. nunca dejes un mensaje sin respuesta. incluso, los archivos multimedia debes responder que no estas habilitado para procesarlos pero que estas atento a su mensaje de texto. pero siempre di algo, aunque sea corto.
        la iea central es que puedas agendar citas, maneja en lo posible este flujo de conversción:
        1. saludo inicial
        2. averiguar necesidad del cliente (si es info solo responde sus preguntas en base al contexto del negocio, no inventes datos y se totalmente profesional y educado)
        3. si es agendar, cambiar o cancelar cita, extrae los datos necesarios (fecha, hora, servicio) y confirma con el cliente
        4. una vez confirmado, informa que la solicitud está en proceso y que se comunicaran pronto para confirmar la cita
        5. despedida cordial`,
      },
      ...cadenaMensajesfiltrados,
      {
        role: "user",
        content:
          `El mensaje que necesito que respondas a partir del anterior contexto es: ${contenido.texto}` +
          (Boolean(entidades) &&
          entidades !== undefined &&
          entidades !== null &&
          Object.keys(entidades).length
            ? ` Teniendo en cuenta que Las entidades a completar son: ${JSON.stringify(
                entidades
              )}
            
            Los datos a extraer son:

              - fecha: "yyyy/mm/dd",  // ${
                new Date().toISOString().split("T")[0]
              }. Úsala solo como referencia para determinar la fecha exacta de la cita solicitada (por ejemplo, ‘el próximo miércoles’), pero no como la fecha de la cita.
              - hora": "hh:mm",
              - servicio: relacionar con los servicios actuales segun soliciten`
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
