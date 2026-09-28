import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

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