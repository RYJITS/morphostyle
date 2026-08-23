import express from "express";

const PORT = Number(process.env.PORT || 3000);
const app = express();

const runtime = import("./server/index.mjs").then(async (module) => {
  await module.loadMorphoStyleEnvironment();
  return module;
});

app.use(async (req, res) => {
  try {
    const module = await runtime;
    await module.handleMorphoStyleRequest(req, res);
  } catch (error) {
    console.error("MorphoStyle runtime error", error);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: "Erreur serveur." });
    } else {
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`MorphoStyle Express app ready on port ${PORT}`);
});
