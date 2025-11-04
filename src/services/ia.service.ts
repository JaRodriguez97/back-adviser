import { env } from "process";
import type { IntencionMensaje } from "../interfaces/mensaje.interface.js";
import type { Types } from "mongoose";
import { ServicioModel } from "../models/servicio.model.js";

interface ClasificacionResponse {
  intencion: IntencionMensaje;
  confianza: number;
}

const PROMPT_CLASIFICACION = `Eres un asistente especializado en clasificar mensajes de WhatsApp para una agenda de citas.
Clasifica la intención del mensaje en una de estas categorías:
- agendar: El cliente quiere programar una nueva cita
- cambiar: El cliente quiere modificar una cita existente
- cancelar: El cliente quiere cancelar una cita
- info: El cliente solicita información sobre servicios, horarios o precios
- otro: El mensaje es ambiguo o requiere atención personalizada

{
  "intencion": "una de las cinco opciones",
  "confianza": número entre 0 y 1
}`;

const API_KEY = env.API_KEY;
const GEMINI_ENDPOINT = `${env.URI_BASE}=${API_KEY}`;

export const clasificarIntencion = async (
  mensaje: string,
  intencionPrevia?: IntencionMensaje,
  textoPrevia?: string,
  respuestaPrevia?: string
): Promise<ClasificacionResponse> => {
  try {
    let text = PROMPT_CLASIFICACION;

    if (intencionPrevia) {
      text =
        text +
        `\n\nLa intención previa detectada era: ${intencionPrevia}. Tenla en cuenta al clasificar el siguiente mensaje.`;
    }

    if (textoPrevia) {
      text =
        text +
        `\n\nEl mensaje previo del cliente era: ${textoPrevia}. Tenlo en cuenta al clasificar el siguiente mensaje.`;
    }

    if (respuestaPrevia) {
      text =
        text +
        `\n\nLa respuesta previa dada al cliente fue: ${respuestaPrevia}. Tenla en cuenta al clasificar el siguiente mensaje.`;
    }

    text = text + `\n\nMensaje a clasificar: ${mensaje}`;
    const response = await fetch(GEMINI_ENDPOINT as string, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 1,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              intencion: { type: "STRING" },
              confianza: { type: "NUMBER" },
            },
            propertyOrdering: ["intencion", "confianza"],
          },
        },
      }),
    });

    const data = await response.json();
    const respuestaIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    try {
      // console.log("🚀 ~ clasificarIntencion ~ respuestaIA:", respuestaIA);
      const clasificacion = JSON.parse(respuestaIA) as ClasificacionResponse;
      return clasificacion;
    } catch {
      // Si hay error al parsear, asumimos que la respuesta es ambigua
      return {
        intencion: "otro",
        confianza: 0,
      };
    }
  } catch (error) {
    console.error("Error al clasificar intención:", error);
    return {
      intencion: "otro",
      confianza: 0,
    };
  }
};

interface EntidadesExtraccion {
  fecha?: string; // formato yyyy/mm/dd
  hora?: string; // formato hh:mm
  servicio?: Types.ObjectId;
  ambiguedad?: boolean;
  solapamiento?: boolean;
  confirmacion?: boolean;
}

let PROMPT_EXTRACCION = `Las entidades a extraer son:

{
  "fecha"?: "yyyy/mm/dd", // ${
  new Date().toISOString().split("T")[0]
}. Úsala solo como referencia para determinar la fecha exacta de la cita solicitada (por ejemplo, ‘el próximo miércoles’), pero no como la fecha de la cita.
  "hora"?: "hh:mm",
  "servicio"?: "ObjectId", // en base al listado de servicios que se ofrecen
  "ambiguedad": true si no es claro en la fecha, hora o servicio que desea en este mensaje y segun el contexto (no siempre deben venir los 3 datos en el mismo mensaje), false si todo es claro
  "solapamiento": false siempre false,
  "confirmacion": true si el cliente ya ha confirmado los datos de la cita de manera explícita, false si no
}`;
  // "solapamiento": true si la nueva información entra en conflicto con datos previos, false si no hay conflicto

let serviciosActuales: EntidadesExtraccion[] = [];

export const extraerEntidades = async (
  mensaje: string,
  entidad?: EntidadesExtraccion
): Promise<EntidadesExtraccion> => {
  try {
    if (!serviciosActuales.length) {
      serviciosActuales = await ServicioModel.find({}, { _id: 1, nombre: 1 });
    }

    if (entidad && Object.keys(entidad).length) {
      PROMPT_EXTRACCION = `${PROMPT_EXTRACCION}
      Teniendo en cuenta que los datos previos extraídos son:
      ${JSON.stringify(entidad)}
      realiza los ajustes o cambios necesarios al analizar el mensaje final manteniendo los datos del json que sean adecuados.`;
    }

    const response = await fetch(GEMINI_ENDPOINT as string, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${PROMPT_EXTRACCION}
                
                Servicios actuales: ${JSON.stringify(serviciosActuales)}
                
                Mensaje a analizar manteniendo los datos de la entidad que se está creando: ${mensaje}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 1,

          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              fecha: { type: "STRING" },
              hora: { type: "STRING" },
              servicio: { type: "STRING" },
              ambiguedad: { type: "BOOLEAN" },
              solapamiento: { type: "BOOLEAN" },
              confirmacion: { type: "BOOLEAN" },
            },
            required: ["ambiguedad"], // solo esto es obligatorio
          },
        },
      }),
    });

    const data = await response.json();
    const respuestaIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    try {
      console.log("🚀 ~ extraerEntidades ~ respuestaIA:", respuestaIA);
      const r = JSON.parse(respuestaIA) as EntidadesExtraccion;

      r.solapamiento = false;
      return r;
    } catch {
      return { ambiguedad: true, solapamiento: false };
    }
  } catch (error) {
    console.error("Error al extraer entidades:", error);
    return { ambiguedad: true, solapamiento: false };
  }
};

export const getGeminiReply = async (history: any[] = []) => {
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
        temperature: 0.3,
        topK: 32,
        topP: 0.85,
        maxOutputTokens: 512,
      },
    }),
  });

  const data = await response.json();

  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  console.log("🚀 ~ getGeminiReply ~ reply:", reply);

  if (!reply) console.log("🚀 ~ getGeminiReply ~ data:", JSON.stringify(data));

  return reply;
};
