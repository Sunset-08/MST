import "dotenv/config";
import express from "express";
import cors from "cors";
import { authErrorHandler, authRouter } from "./routes/auth.routes.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "16kb" }));

app.use("/api/auth", authRouter);

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    service: "SECUREX API",
    status: "healthy",
  });
});

app.listen(PORT, () => {
  console.log(`SECUREX API running on http://localhost:${PORT}`);
});

app.use(authErrorHandler);
