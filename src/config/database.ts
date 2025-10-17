import mongoose from "mongoose";
import { config } from "dotenv";

config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/adviser";

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
};

