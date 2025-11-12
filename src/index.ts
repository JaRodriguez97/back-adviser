import cors from "cors";
import { config } from "dotenv";
import express from "express";
import morgan from "morgan";
import { connectDB } from "./config/database.js";
import mensajeRoutes from "./routes/mensaje.routes.js";
import cron from "node-cron";
// import { proximoEspacioLibre } from "./services/tenant.service.js";


// Cargar variables de entorno
config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// Conectar a MongoDB
connectDB()
  .then(() => {
    console.log("Database connection ready");
  })
  .catch((err) => {
    console.error("Database connection error:", err);
    process.exit(1);
  });

// Importar rutas

// Rutas mínimas
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Configurar rutas con prefijo v1
app.use("/v1/messages", mensajeRoutes);

// Iniciar servidor
app.listen(PORT, () =>
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`)
);

cron.schedule(
  "0 0 * * *",
  async () => {
    const ahora = new Date();
    console.log("🔄 Ejecutando actualización de fecha disponible...");
    console.log(
      `🕛 Hora local: ${ahora.toLocaleString("es-CO", {
        timeZone: "America/Bogota",
      })}`
    );
    console.log(`🌍 Hora UTC: ${ahora.toUTCString()}`);

    try {
      // await proximoEspacioLibre();
      console.log("✅ Fecha actualizada correctamente");
    } catch (error) {
      console.error("❌ Error actualizando fecha disponible:", error);
    }
  },
  { timezone: "America/Bogota" }
);
