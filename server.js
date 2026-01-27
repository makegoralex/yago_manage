const express = require("express");
const { readData } = require("./data/store");

const app = express();

app.use(express.urlencoded({ extended: false }));

const renderLayout = (title, body) => `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f5f6fa; margin: 0; padding: 40px; }
    .card { max-width: 520px; margin: 0 auto; background: #fff; padding: 24px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
    h1 { margin-top: 0; font-size: 22px; }
    label { display: block; margin-top: 12px; font-weight: 600; }
    input { width: 100%; padding: 10px 12px; margin-top: 6px; border-radius: 8px; border: 1px solid #dcdde1; }
    button { margin-top: 16px; padding: 10px 16px; border: none; border-radius: 8px; background: #2f80ed; color: #fff; font-weight: 600; cursor: pointer; }
    .error { color: #d63031; margin-top: 12px; }
    ul { padding-left: 18px; }
    .muted { color: #636e72; font-size: 14px; }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;

const renderLogin = (error) =>
  renderLayout(
    "Вход владельца",
    `<div class="card">
      <h1>Вход владельца</h1>
      <p class="muted">Введите логин и пароль, полученные в Telegram-боте.</p>
      <form method="POST" action="/login">
        <label>Логин</label>
        <input type="text" name="login" required />
        <label>Пароль</label>
        <input type="password" name="password" required />
        <button type="submit">Войти</button>
      </form>
      ${error ? `<div class="error">${error}</div>` : ""}
    </div>`
  );

const renderDashboard = (company, employees) =>
  renderLayout(
    "Кабинет владельца",
    `<div class="card">
      <h1>Организация: ${company.name}</h1>
      <p class="muted">Инвайт-код: ${company.inviteCode}</p>
      <h2>Сотрудники</h2>
      ${employees.length ? `<ul>${employees.map((emp) => `<li>${emp.name}</li>`).join("")}</ul>` : "<p>Сотрудников пока нет.</p>"}
    </div>`
  );

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/", (req, res) => {
  res.send(renderLogin());
});

app.post("/login", (req, res) => {
  const { login, password } = req.body;
  const data = readData();
  const owner = data.owners.find(
    (item) => item.login === login && item.password === password
  );

  if (!owner) {
    res.status(401).send(renderLogin("Неверный логин или пароль."));
    return;
  }

  const company = data.companies.find((item) => item.id === owner.companyId);
  if (!company) {
    res.status(404).send(renderLogin("Компания не найдена."));
    return;
  }

  const employees = data.employees.filter(
    (employee) => employee.companyId === company.id
  );
  res.send(renderDashboard(company, employees));
});

const PORT = process.env.PORT || 4101;
app.listen(PORT, () => console.log("staff running on", PORT));
