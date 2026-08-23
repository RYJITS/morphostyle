import express from "express";
import { handleMorphoStyleRequest, loadMorphoStyleEnvironment } from "./server/index.mjs";

const PORT = Number(process.env.PORT || 3000);
const app = express();

await loadMorphoStyleEnvironment();

app.use((req, res) => {
  handleMorphoStyleRequest(req, res).catch((error) => {
    console.error("MorphoStyle runtime error", error);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: "Erreur serveur." });
    } else {
      res.end();
    }
  });
});

app.listen(PORT, () => {
  console.log(`MorphoStyle Express app ready on port ${PORT}`);
});
