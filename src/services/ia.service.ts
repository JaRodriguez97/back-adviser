import { env } from "process";

export type IntencionMensaje =
  | "agendar"
  | "cambiar"
  | "cancelar"
  | "info"
  | "otro";

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

Responde SOLO en formato JSON con:
{
  "intencion": "una de las cinco opciones",
  "confianza": número entre 0 y 1
}`;

const API_KEY = env.API_KEY;
const GEMINI_ENDPOINT = `${env.URI_BASE}=${API_KEY}`;

export const clasificarIntencion = async (
  mensaje: string
): Promise<ClasificacionResponse> => {
  try {
    const response = await fetch(GEMINI_ENDPOINT as string, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${PROMPT_CLASIFICACION}\n\nMensaje a clasificar: "${mensaje}"`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 1,
        },
      }),
    });

    const data = await response.json();
    const respuestaIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    try {
      console.log("🚀 ~ clasificarIntencion ~ respuestaIA:", respuestaIA);
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
  ambiguedad: boolean;
  solapamiento: boolean;
}

const PROMPT_EXTRACCION = `Extrae las entidades del siguiente mensaje para una cita.
Responde SOLO en formato JSON con:
{
  "fecha": "yyyy/mm/dd" o null si no hay fecha clara,
  "hora": "hh:mm" o null si no hay hora clara,
  "ambiguedad": true si falta información o hay múltiples interpretaciones, false si todo es claro
}`;

export const extraerEntidades = async (
  mensaje: string,
  intencion: IntencionMensaje
): Promise<EntidadesExtraccion> => {
  // Solo procesar intenciones relevantes
  if (!["agendar", "cambiar", "cancelar"].includes(intencion)) {
    return { ambiguedad: true, solapamiento: false };
  }

  try {
    const response = await fetch(GEMINI_ENDPOINT as string, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${PROMPT_EXTRACCION}\n\nMensaje a analizar: "${mensaje}"`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 1,
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
