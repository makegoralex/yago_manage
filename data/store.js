const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "db.json");

const emptyData = {
  owners: [],
  employees: [],
  companies: [],
};

const ensureDatabase = () => {
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
  return JSON.parse(raw);
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
