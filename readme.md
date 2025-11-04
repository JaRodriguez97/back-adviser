### proximo paso, testeo para confirmar continuidad de la conversación, evitar saludos repetitivos, además de ofreecer información en base al tenant de bd, para diferenciar entre alguna acción de citas o info para poder proceder a crear las citas interfaces y de ahí en adelante

1) Alcance del MVP (no negociable) ❌

    Único objetivo: agendar/cambiar/cancelar citas por WhatsApp. Nada de dashboards, ni reportes.
    Estado: Solo estructura base de mensajes implementada.

    Llamadas a IA por mensaje: máx. 3 (intención, extracción, redacción).
    Estado: Sin implementar integración con IA.

    Idioma: español neutral, sin "creatividad" del modelo. Temperatura baja.
    Estado: Pendiente configuración de IA.

2) Legal, privacidad y consentimiento ❌

    Política de privacidad simple: qué capturas (teléfono, mensaje, fecha, key de notificación), para qué, y dónde lo envías.
    Estado: Sin implementar.

    Opt-in explícito del negocio para "Acceso a notificaciones".
    Estado: Sin implementar.

    Nada de "prometer ser WhatsApp oficial"; di "gestión de notificaciones para agenda".
    Estado: Sin implementar.

3) Multi-tenant desde el día 0 🟡
    Implementado en modelos de base de datos con tenant_id y sus índices correspondientes.

    Todo documento en BD lleva tenant_id.

    Separación absoluta por tenant_id en queries y en índices.

    No expongas ObjectId como “token”; usa API Key por tenant.

4) Modelo de tiempo y anti-solapamiento (el corazón) 🟡
    Implementado modelo de citas con validaciones de fecha/hora usando date-fns.
    Estado: Modelo base creado, sin integración date-fns.

    Cada servicio tiene duración en minutos.
    Estado: Implementado en modelo.

    Cita = { tenant_id, cliente_id, servicio_id, start, end, estado }.
    Estado: Estructura implementada, sin validaciones.

    formato fecha yyyy/mm/dd y formato de hora hh:mm se da manejo en el código con Date o preguntando directamente a la IA
    Estado: Pendiente implementación de formatos.

    Estrategia anti-choques:
    Estado: Sin implementar.

        Opción A (simple y robusta): discretiza en slots de 5–15 min y crea un doc por slot reservado. Índice único en { tenant_id, recurso_id, fecha, slot }.
        Estado: Pendiente decisión e implementación.

        Opción B (sin slots): transacción con consulta de overlap y escritura atómica. Si encuentra overlap, rechaza.
        Estado: Pendiente decisión e implementación.

    Buffers opcionales: tiempo mínimo entre citas; regla por tenant.
    Estado: Sin implementar.

5) Recursos y disponibilidad ❌
    Implementado modelo de recursos con horarios flexibles.

    Si el negocio tiene varias personas/cabinas, define recurso_id por agenda.

    Disponibilidad del tenant: reglas por día de semana y excepciones (feriados).

    Validación de rango máximo de reserva (p. ej. 30 días).

6) Flujo IA en 4 pasos (máx. 5) 🟡

    Clasificación de intención: agendar | cambiar | cancelar | info | otro.
    Estado: ✅ Implementado con Gemini AI, temperatura 0.1 y formato JSON estricto.
    Estado: ✅ Integrado en el flujo de mensajes con manejo de errores.

    Extracción: { fecha, hora, servicio }, ambigüedad y/o solapamientos.
    Estado: ✅ Estructura implementada con schema JSON estricto.
    Estado: ✅ Implementada extracción de fecha, hora, servicio y confirmación.
    Estado: ✅ Manejo de ambigüedad y solapamientos integrado.

    Validación backend: horarios, duración, políticas. Sin IA.
    Estado: ❌ Pendiente.

    Redacción: confirmación o alternativas cercanas; si ambiguo, pedir precisión.
    Estado: ❌ Pendiente.

    Opcional: resumen estructurado para log/analytics (sin PII sensible).
    Estado: ❌ Pendiente.

Usa un solo LLM (Gemini) para pasos 1, 2 y 4 con prompts distintos. Temperatura baja (0.1), salida JSON estricta.
Estado: Pendiente integración con LLM.

7) Idempotencia y concurrencia 🟡

    Genera message_id estable por notificación: hash de {from, timestamp, text}.
    Estado: ✅ Implementado con respuesta 204 para duplicados. Solución simple y efectiva.

    En cambios/cancelaciones, verifica estado actual antes de mutar (optimistic lock con updated_at o versión).
    Estado: ❌ Pendiente.

    Nota: Se decidió usar solo message_id para idempotencia, simplificando la implementación y manteniendo la funcionalidad requerida.

8) Seguridad mínima que no te estorbe �

    API Key por tenant obligatoria en header. Rotable, pero no caduca si no quieres complicarte aún.
    Estado: Implementado modelo y autenticación básica, falta rotación.

    API Key por dispositivo opcional si instalas en varios celulares.
    Estado: Modelo preparado, falta implementación.

    CORS cerrado a tu app.
    Estado: Configuración básica implementada.

    No loguees contenido completo del mensaje en texto plano; usa redacción parcial o hash si hace falta.
    Estado: Sin implementar.

9) Datos y MongoDB (colecciones e índices) 🟡
    Implementados modelos base: tenant, cliente, cita, servicio.
    Estado: ✅ Modelos base con índices principales
    Estado: ❌ Pendiente modelo de recursos
    Estado: 🟡 TTL index en mensajes por implementar
ejemplos de resultados que se quieren implementar
    tenant:
    {
        "id": ObjectId,
        "nombre": "Barbería Los Brothers",
        "rubro": "barberia",
        "direccion": "Calle 123 # 45-67",
        "contacto": {
            "telefono": "+57 3001234567",
            "email": "info@losbrothers.com",
            "whatsapp": "wa.me/573001234567",
            "redesSociales": [
                "www.tiktok.com/losbrothers",
                "www.instagram.com/losbrothers"
            ]
        }
        "horarios": {
            "lunes-viernes": ["08:00-18:00"],
            "sabado": ["09:00-14:00"]
        },
        "politicas": {
            "cancelacion_min_horas": 24,
            "max_adelanto_dias": 30
        }
    }


    cliente: 
    {
        "id": objectid,
        "nombre": "Juan Pérez",
        "telefono": "+57 3109876543",
        "email": "juanperez@mail.com", => opcional
        "tenant_id": objectid
    }
    Índice: { tenant_id, telefono } único.

    cita: 
    {
        "id": objectid,
        "tenant_id": objectid,
        "cliente_id": objectid,
        "servicios_id": objectid[],
        "fecha": "2025/08/30",
        "hora_inicio": "10:00",
        "hora_fin": "10:45",
        "estado": "confirmada",
        "recurso_id": objectid
    }
    Índices:
        { tenant_id, start }
        { tenant_id, recurso_id, start }
        Si usas slots: índice único { tenant_id, recurso_id, fecha, slot }.

    servicio:
    {
        "id": objectid,
        "tenant_id": objectid,
        "NombreServicio": "corte cabello",
        "Duración": 45 => (en minutos).
        "Precio": "20.000" => (opcional).
    }

    recursos: Pendiente


    mensajes: {
        "id": objectid,
        "tenant_id": objectid,
        "cliente_id": objectid,
        "timestamp": Date,
        "contenido": {
            "texto": string,
            "intencion": string,      // agendar|cambiar|cancelar|info|otro
            "entidades": object,       // fecha, hora, servicio extraídos
            "contexto_previo": string  // hash o referencia al mensaje anterior relacionado
        },
        // "TTL": 30 // días de retención (aun por debatir)
    }
    Índices: 
        { tenant_id, cliente_id, timestamp }
        { tenant_id, timestamp }
        // TTL index en timestamp

    api_keys: { tenant_id, key } con índice único en key.

10) Arquitectura mínima 🟡
    Express y MongoDB:
    Estado: ✅ Configuración básica implementada
    Estado: ✅ Conexión a MongoDB con manejo de errores

    API Express endpoints:
    Estado: 🟡 /v1/messages implementado parcialmente
    Estado: ❌ /v1/availability pendiente
    Estado: ❌ /v1/appointments pendiente

    Servicio IA:
    Estado: ✅ Implementación base con Gemini AI
    Estado: ✅ Funciones puras con entrada/salida JSON estricta

    Cola ligera (Redis opcional) para picos; si no, directo en request con timeout.

    Tareas diferidas: reintentos de envío de respuesta, limpieza de “holds”/locks.

11) Observabilidad sin drama 🔄

    Logging con request_id y tenant_id en cada línea.

    Métricas clave: tasa de acierto de intención, % mensajes ambiguos, tiempo de respuesta, tasa de conflicto de agenda.

    Alertas simples: cuando la IA devuelve JSON inválido o el índice único revienta por choques.

12) Pruebas mínimas que salvan vidas 🔄

    Unitarias: solapamiento, cálculo de end por duración, parser de fechas.

    Integración: flujo completo agendar/cambiar/cancelar con reloj fijo.

    Contract tests del JSON de IA (schema validation).

    Carga: 50–100 req/min por tenant durante 5 min para ver que no explota.

13) Costos y límites de IA 🔄

    Máx. 3 llamadas IA por mensaje. Si falla una, fallback a respuesta de aclaración.

    Cachea plantillas de prompts. No guardes PII en prompts persistentes.

    Establece presupuesto mensual por tenant si algún día cobras por uso.

14) Entrega en campo (tu caso Cali) 🔄

    Onboarding en 10 minutos: instalar app, pegar API Key y tenant_id, probar mensaje de “eco”.

    Script de verificación: ping al backend, verificación de permisos y un “dummy booking”.

15) Roadmap inmediato (cuando el MVP respire) 🔄

    Lista de espera simple por choque.

    Ventanas de “bloqueo temporal” al iniciar reserva (lock con TTL 60 s).

    Multi-recurso real.

    Políticas de cancelación automáticas.