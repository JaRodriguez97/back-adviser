import { env } from "process";
import type { IntencionMensaje } from "../interfaces/mensaje.interface.js";
import type { Types } from "mongoose";
import { ServicioModel } from "../models/servicio.model.js";

interface ClasificacionResponse {
  intencion: IntencionMensaje;
  confianza: number;
}

const API_KEY = env.API_KEY;
const GEMINI_ENDPOINT = `${env.URI_BASE}=${API_KEY}`;

export const clasificarIntencion = async (
  mensaje: string,
  cadenaContenidoIntension?: {
    texto: string;
    intencion: IntencionMensaje | undefined;
    respuesta: string;
  }[]
): Promise<ClasificacionResponse> => {
  const PROMPT_CLASIFICACION = `
Tu trabajo es Clasificar mensajes de WhatsApp según su intención.  
Opciones:
- agendar → programar una nueva cita  
- cambiar → modificar una cita existente  
- cancelar → cancelar una cita  
- info → pedir información (servicios, precios, horarios)  
- otro → mensaje ambiguo o fuera de contexto  

Devuelve SOLO un JSON con:
{ "intencion": "<una de las cinco opciones>", "confianza": <número entre 0 y 1> }
`;

  try {
    const contexto: string[] = [PROMPT_CLASIFICACION];

    if (cadenaContenidoIntension && cadenaContenidoIntension.length)
      cadenaContenidoIntension.forEach(({ texto, intencion, respuesta }) => {
        if (texto) contexto.push(`la persona envió este mensaje: ${texto}`);
        if (intencion)
          contexto.push(
            `y tu analizaste que tenia esta Intención: ${intencion}`
          );
        if (respuesta)
          contexto.push(`ayudándome a llegar a esta Respuesta: ${respuesta}`);
      });

    contexto.push(
      `Manteniendo el contexto antes dado, ayudame a analizar y clasificar la intension de la conversación en ayuda del siguiente mensaje: ${mensaje}`,
      "tener muy presente el contexto, puede que el mensaje a analizar sea corto o ambiguo pero analiza junto con el contexto dado anteriormente"
    );

    const text = contexto.join("\n");

    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      const clasificacion = JSON.parse(respuestaIA) as ClasificacionResponse;
      console.log("🚀 ~ clasificarIntencion ~ respuestaIA:", clasificacion);
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
  fecha?: string; // formato yyyy-mm-dd
  hora?: string; // formato hh:mm
  servicio?: Types.ObjectId;
  tipoDocumento?: string;
  numeroDocumento?: string;
  nombresCompletos?: string;
  ambiguedad?: boolean;
  solapamiento?: boolean;
  confirmacion?: boolean;
}

let serviciosActuales: EntidadesExtraccion[] = [];

export const extraerEntidades = async (
  mensaje: string,
  entidad?: EntidadesExtraccion,
  horarios?: any[]
): Promise<EntidadesExtraccion> => {
  let PROMPT_EXTRACCION = ``;

  try {
    if (!serviciosActuales.length) {
      serviciosActuales = await ServicioModel.find(
        {},
        { _id: 1, nombreServicio: 1 }
      );
    }

    const vacio = Object.values(entidad!).every(
      (v) => v === undefined || v === null
    );

    if (!!entidad && !vacio) {
      PROMPT_EXTRACCION = `
        Mantienes un registro de información parcial para agendar una cita. 
        Tienes una entidad previa (posiblemente incompleta o un objeto vacio):
        ${JSON.stringify(entidad)}

        Tu tarea es actualizar solo los campos que cambien o se aclaren según el nuevo mensaje.
        Si el mensaje no menciona un campo, conserva el valor previo.
        Nunca borres información ya confirmada, salvo que el nuevo mensaje la contradiga explícitamente.

        Devuelve solo el objeto JSON actualizado final, combinando los valores previos con los nuevos.
        `;
    }

    const hoy = new Date().toISOString().split("T")[0];

    const text = `
      ${PROMPT_EXTRACCION}

      Servicios disponibles: ${JSON.stringify(serviciosActuales)}

      Extrae y completa:
      {
        "fecha"?: "yyyy-mm-dd", // usa ${hoy} como referencia para interpretar términos relativos ("mañana", "próximo viernes", etc.)
        "hora"?: "hh:mm", // solo retornar si dice la hora explicitamente y si está dentro del horario de atención: ${JSON.stringify(
          horarios
        )} 
        "servicio"?: "ObjectId" (de la lista anterior),
        "tipoDocumento"?: string; (de quien será atendido)
        "numeroDocumento"?: string; (de quien será atendido)
        "nombresCompletos"?: string; (de quien será atendido)
        "ambiguedad": true si la fecha, hora o servicio no son claros,
        "solapamiento": siempre false,
        "confirmacion": true si el cliente confirma todos los datos explícitamente
      }

      Mensaje del cliente: ${mensaje}

      Responde con el JSON actualizado, combinando lo anterior con la entidad previa.
      `;

    console.log("🚀 ~ extraerEntidades ~ mensaje:", mensaje);

    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
              fecha: { type: "STRING" },
              hora: { type: "STRING" },
              servicio: { type: "STRING" },
              tipoDocumento: { type: "STRING" },
              numeroDocumento: { type: "STRING" },
              nombresCompletos: { type: "STRING" },
              ambiguedad: { type: "BOOLEAN" },
              solapamiento: { type: "BOOLEAN" },
              confirmacion: { type: "BOOLEAN" },
            },
            required: ["ambiguedad", "solapamiento", "confirmacion"], // solo esto es obligatorio
          },
        },
      }),
    });

    const data = await response.json();
    const respuestaIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    try {
      const r = JSON.parse(respuestaIA) as EntidadesExtraccion;
      console.log("🚀 ~ extraerEntidades ~ respuestaIA:", r);

      return {
        fecha: r?.fecha || entidad?.fecha!,
        hora: r?.hora || entidad?.hora!,
        servicio: r?.servicio || entidad?.servicio!,
        tipoDocumento: r?.tipoDocumento || entidad?.tipoDocumento!,
        numeroDocumento: r?.numeroDocumento || entidad?.numeroDocumento!,
        nombresCompletos: r?.nombresCompletos || entidad?.nombresCompletos!,
        ambiguedad:
          typeof r?.ambiguedad == "boolean"
            ? r?.ambiguedad
            : entidad?.ambiguedad!,
        solapamiento:
          typeof r?.solapamiento == "boolean"
            ? r?.solapamiento
            : entidad?.solapamiento!,
        confirmacion:
          typeof r?.confirmacion == "boolean"
            ? r?.confirmacion
            : entidad?.confirmacion!,
      };
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
