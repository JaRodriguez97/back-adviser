import type { Response } from "express";
import { Types } from "mongoose";
import type { IMensaje } from "../interfaces/mensaje.interface.js";
import { ClienteModel } from "../models/cliente.model.js";
import { MensajeModel } from "../models/mensaje.model.js";
import { TenantModel } from "../models/tenant.model.js";
import {
  clasificarIntencion,
  contextoGeneral,
  extraerEntidades,
  getGeminiReply,
} from "../services/ia.service.js";
import { generateMessageId } from "../utils/hash.utils.js";
import { obtenerCitas } from "../services/cita.service.js";
import type { ICita } from "../interfaces/cita.interface.js";

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

    const hoy = new Date();

    // Crear una fecha ajustada a la zona horaria de Colombia
    const opciones = { timeZone: "America/Bogota" };
    const fechaColombia = new Date(hoy.toLocaleString("en-US", opciones));

    // Obtener la fecha en formato ISO (YYYY-MM-DD) según hora de Colombia
    const fechaISO = fechaColombia.toISOString().split("T")[0];

    // Día de la semana en español según hora de Colombia
    const diaSemana = fechaColombia.toLocaleDateString("es-ES", {
      weekday: "long",
      timeZone: "America/Bogota",
    });

    contextoGeneral.fechaHoy = `Hoy es ${diaSemana} ${fechaISO}`;

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
        contextoGeneral.cadenaMensajes = await MensajeModel.find({
          tenant_id: new Types.ObjectId(tenant_id),
          telefono,
        })
          .limit(10)
          .sort({ timestamp: -1 });

        let cadenaMensajesfiltrados: { role: string; content: string }[] = [];

        contextoGeneral.tenant = await TenantModel.aggregate([
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

        if (!contextoGeneral.tenant.length)
          throw new Error("Tenant no encontrado");

        if (contextoGeneral.cadenaMensajes.length) {
          //* si no existe cadena de mensajes, significa que es cliente nuevoMensaje, por ende, es posible que solo esté saludando, asi que el primero no sería reelevante analizarlo para clasificar ni tampoco la intensión
          let cadenaContenidoIntension = contextoGeneral.cadenaMensajes.map(
            ({ contenido, respuesta }) => ({
              texto: contenido.texto,
              intencion: contenido.intencion,
              respuesta: respuesta.texto,
            })
          );
          clasificacion = await clasificarIntencion(
            contenido.texto,
            cadenaContenidoIntension
          );

          if (
            ["agendar", "cambiar", "cancelar"].includes(clasificacion.intencion)
          ) {
            if (!entidades?.confirmacion)
              entidades = await extraerEntidades(contenido.texto);

            console.log("🚀 ~ recibirMensaje ~ entidades:", entidades);

            if (
              entidades &&
              entidades.fecha &&
              entidades.servicio &&
              entidades.tipoDocumento &&
              entidades.numeroDocumento &&
              entidades.nombresCompletos
            )
              // consultar entidad entre las citas para ver disponibilidad de tiempo y evitar solapamientos
              contextoGeneral.citasExistentesFecha = await obtenerCitas({
                tenant_id: new Types.ObjectId(tenant_id),
                fecha: entidades.fecha,
              });
          }

          contextoGeneral.cadenaMensajes.forEach(({ contenido, respuesta }) => {
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

        const inicioPrompt = `
        Eres Emily, asistente virtual del negocio: ${JSON.stringify(
          contextoGeneral.tenant
        )}.

        Tu función: atender a las personas, ofrecer información, además de agendar o modificar citas.
        Usa tono amable y natural. Puedes usar emojis de sobra, imagina que regalan emojis.
        
        Y estás hablando con ${
          nombre
            ? nombre + " y su numero de telefono es " + telefono
            : "un cliente nuevo con número de telefono " + telefono
        }.`;
        let content = "";

        if (contextoGeneral.citasExistentesFecha) {
          content = `
            ${inicioPrompt}
            
            ya iniciamos el proceso de agendamiento de cita, ya tengo todos los datos necesarios de la posible persona a ser atendida:
            ${JSON.stringify(entidades)}

            Ahora necesito que me ayudes a:
            1 -> confirmar la disponibilidad de horas para la fecha solicitada ${
              entidades?.fecha
            }, mostrando las horas disponibles como sugerencias: ${
            contextoGeneral.citasExistentesFecha.length
              ? JSON.stringify(contextoGeneral.citasExistentesFecha)
              : "Se buscó en base de datos y No hay citas asignadas para esa fecha"
          }.
            2 - > Asegurarse que la persona elija una hora adecuada segun el horario de atención y el solapamiento con otras citas tiene que ser evitado en su totalidad
            2 - > Luego de que la persona seleccione una hora confirmar todos los datos aportados y la hora seleccionada
            3 - > solicita que diga "Si confirmo los datos de mi cita" para finalizar el proceso de agendamiento.
            4 - > cuando ya esté creada la cita le confirmas que ha sido creada con estos datos: ${"aqui deben ir los datos cuando la cita se cree"} y finalmente acompañas el mensaje diciendo que un agente se contactará pronto
            `;
        } else {
          content = `
            ${inicioPrompt}
            
            Si el mensaje es saludo → responde cordialmente e invita a contar su necesidad.  
            Si es multimedia o sticker → di que no puedes procesarlo, pero esperas su texto.  
            Flujo ideal:  
            1) Saludo → 2) Detectar necesidad → 3) Si cita obtener los siguientes datos en 1 mensaje Solicitar:
            
            - tipo de documento "CC, TI, CE, PP, etc" (del posible paciente, puede ser diferente de la persona que escribe)
            - número de documento "sin puntos ni comas" (del posible paciente, puede ser diferente de la persona que escribe)
            - nombres Completos (del posible paciente, puede ser diferente de la persona que escribe)
            - fecha que desea el servicio además que se puede interpretar expresiones naturales de tiempo (como ‘el próximo miércoles’ teniendo en cuenta que ${contextoGeneral.fechaHoy} solo como referencia)
            - servicio 

            todos estos datos necesito que el cliente los responda en 1 solo mensaje, en 1 solo bloque, en una misma interacción
            `;
        }

        respuesta = await getGeminiReply([
          {
            role: "user",
            content,
          },
          ...cadenaMensajesfiltrados,
          {
            role: "user",
            content: `
             Actualmente hay estos datos
              ${JSON.stringify(entidades)} 
              
              y a continuación el Mensaje de la persona que necesito le des respuesta en base a todo el contexto dado anteriormente: "${
                contenido.texto
              }".
              `,
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
