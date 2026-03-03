const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "fiscalizacoes.json");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    const initialPayload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      records: []
    };
    await fs.writeFile(DATA_FILE, JSON.stringify(initialPayload, null, 2), "utf8");
  }
}

async function readRecords() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw || "{}");

  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.records)) return parsed.records;
  return [];
}

async function writeRecords(records) {
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    records
  };

  await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf8");
}

function normalizeRecord(record) {
  return {
    ...record,
    __backendId: record.__backendId || crypto.randomUUID()
  };
}

app.get("/api/fiscalizacoes", async (req, res) => {
  try {
    const records = await readRecords();
    res.json({ records });
  } catch (error) {
    res.status(500).json({ error: "Falha ao carregar fiscalizacoes." });
  }
});

app.post("/api/fiscalizacoes", async (req, res) => {
  try {
    const records = await readRecords();
    const record = normalizeRecord(req.body || {});

    records.push(record);
    await writeRecords(records);

    res.status(201).json({ record });
  } catch (error) {
    res.status(500).json({ error: "Falha ao salvar fiscalizacao." });
  }
});

app.put("/api/fiscalizacoes/:id", async (req, res) => {
  try {
    const records = await readRecords();
    const id = req.params.id;
    const index = records.findIndex((item) => item.__backendId === id);

    if (index === -1) {
      res.status(404).json({ error: "Fiscalizacao nao encontrada." });
      return;
    }

    const updatedRecord = normalizeRecord({
      ...records[index],
      ...req.body,
      __backendId: id
    });

    records[index] = updatedRecord;
    await writeRecords(records);

    res.json({ record: updatedRecord });
  } catch (error) {
    res.status(500).json({ error: "Falha ao atualizar fiscalizacao." });
  }
});

app.delete("/api/fiscalizacoes/:id", async (req, res) => {
  try {
    const records = await readRecords();
    const id = req.params.id;
    const nextRecords = records.filter((item) => item.__backendId !== id);

    if (nextRecords.length === records.length) {
      res.status(404).json({ error: "Fiscalizacao nao encontrada." });
      return;
    }

    await writeRecords(nextRecords);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: "Falha ao excluir fiscalizacao." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

ensureDataFile()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor em http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Falha ao iniciar servidor:", error);
    process.exit(1);
  });
