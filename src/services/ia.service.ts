import type { IMensaje } from "./../interfaces/mensaje.interface.js";
import { env } from "process";
import type { IntencionMensaje } from "../interfaces/mensaje.interface.js";
import type { Types } from "mongoose";
import { ServicioModel } from "../models/servicio.model.js";
import type { ITenant } from "../interfaces/tenant.interface.js";
import type { ICita } from "../interfaces/cita.interface.js";

interface ClasificacionResponse {
  intencion: IntencionMensaje;
  confianza: number;
}

interface ContextoGeneral {
  tenant: ITenant[];
  fechaHoy: string;
  cadenaMensajes: IMensaje[];
  citasExistentesFecha?: ICita[];
}

const API_KEY = env.API_KEY;
const GEMINI_ENDPOINT = `${env.URI_BASE}=${API_KEY}`;

export const contextoGeneral: ContextoGeneral = {
  tenant: [],
  fechaHoy: "",
  cadenaMensajes: [],
};

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
  mensaje: string
): Promise<EntidadesExtraccion> => {
  try {
    if (!serviciosActuales.length) {
      serviciosActuales = await ServicioModel.find(
        {},
        { _id: 1, nombreServicio: 1 }
      );
    }

    let arrayPrompts: { role: string; content: string }[] = [],
      text = `
      Mantienes un registro de información parcial para agendar una cita. 

      Tu tarea es actualizar solo los campos que cambien o se aclaren según el nuevo mensaje.
      Si el mensaje no menciona un campo, conserva el valor anterior.
      Nunca borres información ya confirmada, salvo que el nuevo mensaje la contradiga explícitamente.

      Devuelve solo el objeto JSON actualizado final, combinando los valores previos con los nuevos.

      Servicios disponibles: ${JSON.stringify(serviciosActuales)}

      Extrae y completa:
      {
        "tipoDocumento": string; (de quien será atendido)
        "numeroDocumento": string; (de quien será atendido)
        "nombresCompletos": string; (de quien será atendido)
        "fecha": "yyyy-mm-dd", // se puede interpretar expresiones naturales de tiempo (como ‘el próximo miércoles’ teniendo en cuenta que ${
          contextoGeneral.fechaHoy
        } solo como referencia)
        "servicio": "ObjectId" (de la lista anterior, se necesita que el cliente diga el nombre del servicio que desea y tu lo relacionas con el _id que coresponda),
        "hora"?: "hh:mm", // solo retornar si está dentro del horario de atención: ${JSON.stringify(
          contextoGeneral.tenant[0]?.horarios
        )} 
        "ambiguedad": true si los datos solicitados no son claros,
        "solapamiento": true si la fecha y hora solicitadas coinciden con otra cita ya agendada,
        "confirmacion": true si la persona confirma todos los datos explícitamente con "Si confirmo los datos de mi cita"
      }

      teniendo en cuenta las horas disponibles como sugerencias para evitar solapamiento: ${
        contextoGeneral.citasExistentesFecha?.length
          ? JSON.stringify(contextoGeneral.citasExistentesFecha)
          : "Se buscó en base de datos y No hay citas asignadas para esa fecha"
      }
        `;

    arrayPrompts.push({
      role: "user",
      content: text,
    });

    [...contextoGeneral.cadenaMensajes]
      .reverse()
      .forEach(({ contenido, respuesta }) => {
        arrayPrompts.push(
          {
            role: "user",
            content: `Mensaje de la persona: ${contenido.texto}`,
          },
          {
            role: "model",
            content: `Tu respuesta fue: ${
              JSON.stringify(contenido.entidades) == "{}"
                ? "No se extrajeron entidades por que el mensaje no aporta información suficiente para extraer datos"
                : JSON.stringify(contenido.entidades)
            }
          
          ayudando que la respuesta a la persona que se atiende sea: ${
            respuesta.texto
          }`,
          }
        );
      });

    arrayPrompts.push({
      role: "user",
      content: `último Mensaje de la persona a analizar y extraer los datos de la entidad junto con el contexto: ${mensaje}`,
    });

    // console.log(
    //   "🚀 ~ extraerEntidades ~ formatoContents(arrayPrompts):",
    //   JSON.stringify(formatoContents(arrayPrompts))
    // );

    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: formatoContents(arrayPrompts),
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 1,

          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              tipoDocumento: { type: "STRING" },
              numeroDocumento: { type: "STRING" },
              nombresCompletos: { type: "STRING" },
              servicio: { type: "STRING" },
              fecha: { type: "STRING" },
              hora: { type: "STRING" },
              ambiguedad: { type: "BOOLEAN" },
              solapamiento: { type: "BOOLEAN" },
              confirmacion: { type: "BOOLEAN" },
            },
            required: [
              "tipoDocumento",
              "numeroDocumento",
              "nombresCompletos",
              "servicio",
              "fecha",
              "ambiguedad",
              "solapamiento",
              "confirmacion",
            ],
          },
        },
      }),
    });

    const data = await response.json();
    const respuestaIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    // console.log(respuestaIA);

    respuestaIA
      .replace(/```json\s*/gi, "") // elimina ```json o ```JSON
      .replace(/```/g, "") // elimina los cierres ```
      .trim();

    let r = JSON.parse(respuestaIA) as EntidadesExtraccion;
    // console.log("🚀 ~ extraerEntidades ~ respuestaIA:", r);

    r = Object.fromEntries(
      Object.entries(r).filter(
        ([_, v]) => v !== "" && v !== null && v !== undefined
      )
    );

    return r;
  } catch (error) {
    console.error("Error al extraer entidades:", error);
    return { ambiguedad: true, solapamiento: false };
  }
};

let formatoContents: (
  array: any[]
) => { role: any; parts: { text: any }[] }[] = (array: any[]) => {
  return array.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.content }],
  }));
};

export const getGeminiReply = async (history: any[] = []) => {
  const formattedHistory = formatoContents(history);

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
