const fs = require("fs");
const path = require("path");

const resolveDbPath = () => {
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
  }
  if (process.env.DATA_DIR) {
    return path.join(process.env.DATA_DIR, "db.json");
  }
  return path.join(__dirname, "db.json");
};

const DB_PATH = resolveDbPath();

const emptyData = {
  owners: [],
  employees: [],
  companies: [],
  recipes: [],
};

const ensureDatabase = () => {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(emptyData, null, 2));
    return;
  }

  const contents = fs.readFileSync(DB_PATH, "utf8").trim();
  if (!contents) {
    fs.writeFileSync(DB_PATH, JSON.stringify(emptyData, null, 2));
  }
};

const readData = () => {
  ensureDatabase();
  const raw = fs.readFileSync(DB_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return {
    ...emptyData,
    ...parsed,
    recipes: parsed.recipes || [],
  };
};

const writeData = (data) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

const updateData = (updater) => {
  const current = readData();
  const updated = updater(current) || current;
  writeData(updated);
  return updated;
};

module.exports = {
  DB_PATH,
  readData,
  writeData,
  updateData,
};
