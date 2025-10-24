import crypto from "crypto";

export const generateMessageId = (
  from: string,
  timestamp: string | Date,
  text: string
): string => {
  const data = `${from}:${new Date(timestamp).toISOString()}:${text}`;
  return crypto.createHash("sha256").update(data).digest("hex");
};
