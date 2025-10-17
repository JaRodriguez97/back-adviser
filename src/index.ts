import cors from "cors";
import { config } from "dotenv";
import express from "express";
import morgan from "morgan";
import { connectDB } from "./config/database.js";
import mensajeRoutes from "./routes/mensaje.routes.js";

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
