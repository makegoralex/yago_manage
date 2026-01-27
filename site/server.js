const http = require("http");
const querystring = require("querystring");
const { readData, updateData } = require("../data/store");

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

const renderDashboard = (company, employees, owner) =>
  renderLayout(
    "Кабинет владельца",
    `<div class="card">
      <h1>Организация: ${company.name}</h1>
      <p class="muted">Инвайт-код: ${company.inviteCode}</p>
      <p><a href="/owner/${owner.id}/recipes">Управление рецептами</a></p>
      <h2>Сотрудники</h2>
      ${
        employees.length
          ? `<ul>${employees.map((emp) => `<li>${emp.name}</li>`).join("")}</ul>`
          : "<p>Сотрудников пока нет.</p>"
      }
    </div>`
  );

const buildRecipeTree = (recipes, parentId = null) =>
  recipes
    .filter((item) => item.parentId === parentId)
    .map((item) => ({
      ...item,
      children: buildRecipeTree(recipes, item.id),
    }));

const renderRecipeTree = (nodes) => {
  if (!nodes.length) {
    return "<p>Рецепты пока не добавлены.</p>";
  }
  const renderNodes = (items) =>
    `<ul>${items
      .map(
        (item) =>
          `<li><strong>${item.name}</strong> (${
            item.type === "category" ? "Категория" : "Рецепт"
          }) <a href="/owner/${item.ownerId}/recipes/edit?id=${item.id}">Редактировать</a>${
            item.children.length ? renderNodes(item.children) : ""
          }</li>`
      )
      .join("")}</ul>`;
  return renderNodes(nodes);
};

const renderRecipeForm = (owner, recipes, error) => {
  const categoryOptions = [
    `<option value="">Без категории (корень)</option>`,
    ...recipes
      .filter((item) => item.type === "category")
      .map((item) => `<option value="${item.id}">${item.name}</option>`),
  ].join("");
  return `
    <h2>Добавить рецепт или категорию</h2>
    ${error ? `<div class="error">${error}</div>` : ""}
    <form method="POST" action="/owner/${owner.id}/recipes">
      <label>Название</label>
      <input type="text" name="name" required />
      <label>Родительская категория</label>
      <select name="parentId">
        ${categoryOptions}
      </select>
      <label>Тип</label>
      <select name="type">
        <option value="category">Категория</option>
        <option value="recipe">Рецепт</option>
      </select>
      <label>Описание рецепта</label>
      <textarea name="description" rows="4" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid #dcdde1;"></textarea>
      <button type="submit">Сохранить</button>
    </form>
  `;
};

const renderRecipeEdit = (owner, recipe, categories, error) => {
  const categoryOptions = [
    `<option value="">Без категории (корень)</option>`,
    ...categories.map(
      (item) =>
        `<option value="${item.id}" ${
          recipe.parentId === item.id ? "selected" : ""
        }>${item.name}</option>`
    ),
  ].join("");
  return renderLayout(
    "Редактирование рецепта",
    `<div class="card">
      <h1>Редактирование</h1>
      ${error ? `<div class="error">${error}</div>` : ""}
      <form method="POST" action="/owner/${owner.id}/recipes/edit">
        <input type="hidden" name="id" value="${recipe.id}" />
        <label>Название</label>
        <input type="text" name="name" value="${recipe.name}" required />
        <label>Родительская категория</label>
        <select name="parentId">
          ${categoryOptions}
        </select>
        <label>Тип</label>
        <select name="type">
          <option value="category" ${recipe.type === "category" ? "selected" : ""}>Категория</option>
          <option value="recipe" ${recipe.type === "recipe" ? "selected" : ""}>Рецепт</option>
        </select>
        <label>Описание рецепта</label>
        <textarea name="description" rows="4" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid #dcdde1;">${
          recipe.description || ""
        }</textarea>
        <button type="submit">Обновить</button>
      </form>
      <p class="muted"><a href="/owner/${owner.id}/recipes">Назад к списку</a></p>
    </div>`
  );
};

const renderRecipesPage = (owner, company, recipes, error) =>
  renderLayout(
    "Рецепты",
    `<div class="card">
      <h1>Рецепты компании ${company.name}</h1>
      ${renderRecipeForm(owner, recipes, error)}
      <h2>Дерево рецептов</h2>
      ${renderRecipeTree(buildRecipeTree(recipes))}
      <p class="muted"><a href="/">Выйти</a></p>
    </div>`
  );

const parseBody = (req, callback) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    callback(querystring.parse(body));
  });
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "staff-site" }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderLogin());
    return;
  }

  if (req.method === "POST" && url.pathname === "/login") {
    parseBody(req, ({ login, password }) => {
      const data = readData();
      const owner = data.owners.find(
        (item) => item.login === login && item.password === password
      );

      if (!owner) {
        res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
        res.end(renderLogin("Неверный логин или пароль."));
        return;
      }

      const company = data.companies.find((item) => item.id === owner.companyId);
      if (!company) {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end(renderLogin("Компания не найдена."));
        return;
      }

      const employees = data.employees.filter(
        (employee) => employee.companyId === company.id
      );
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderDashboard(company, employees, owner));
    });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/owner/")) {
    const [, , ownerId, section] = url.pathname.split("/");
    if (section !== "recipes") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    const data = readData();
    const owner = data.owners.find((item) => item.id === ownerId);
    if (!owner) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderLogin("Владелец не найден."));
      return;
    }

    const company = data.companies.find((item) => item.id === owner.companyId);
    if (!company) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderLogin("Компания не найдена."));
      return;
    }

    if (url.pathname.endsWith("/edit")) {
      const recipeId = url.searchParams.get("id");
      const recipe = data.recipes.find(
        (item) => item.id === recipeId && item.companyId === company.id
      );
      if (!recipe) {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end(renderRecipesPage(owner, company, data.recipes, "Рецепт не найден."));
        return;
      }
      const categories = data.recipes.filter(
        (item) => item.companyId === company.id && item.type === "category" && item.id !== recipe.id
      );
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderRecipeEdit(owner, recipe, categories));
      return;
    }

    const recipes = data.recipes
      .filter((item) => item.companyId === company.id)
      .map((item) => ({ ...item, ownerId: owner.id }));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderRecipesPage(owner, company, recipes));
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/owner/")) {
    const [, , ownerId, section, action] = url.pathname.split("/");
    if (section !== "recipes") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    const data = readData();
    const owner = data.owners.find((item) => item.id === ownerId);
    if (!owner) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderLogin("Владелец не найден."));
      return;
    }
    const company = data.companies.find((item) => item.id === owner.companyId);
    if (!company) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderLogin("Компания не найдена."));
      return;
    }

    parseBody(req, (payload) => {
      const name = (payload.name || "").trim();
      const type = payload.type === "recipe" ? "recipe" : "category";
      const description = (payload.description || "").trim();
      const parentId = payload.parentId ? payload.parentId : null;
      const errorBase = (message) => {
        const recipes = data.recipes
          .filter((item) => item.companyId === company.id)
          .map((item) => ({ ...item, ownerId: owner.id }));
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(renderRecipesPage(owner, company, recipes, message));
      };

      if (action === "edit") {
        const recipeId = payload.id;
        const current = data.recipes.find(
          (item) => item.id === recipeId && item.companyId === company.id
        );
        if (!current) {
          errorBase("Рецепт не найден.");
          return;
        }
        if (!name) {
          errorBase("Укажите название.");
          return;
        }
        if (type === "recipe" && !description) {
          errorBase("Добавьте описание рецепта.");
          return;
        }
        updateData((draft) => {
          const target = draft.recipes.find((item) => item.id === recipeId);
          if (target) {
            target.name = name;
            target.type = type;
            target.description = type === "recipe" ? description : "";
            target.parentId = parentId || null;
          }
          return draft;
        });
        res.writeHead(302, { Location: `/owner/${owner.id}/recipes` });
        res.end();
        return;
      }

      if (!name) {
        errorBase("Укажите название.");
        return;
      }

      if (type === "recipe" && !description) {
        errorBase("Добавьте описание рецепта.");
        return;
      }

      updateData((draft) => {
        draft.recipes.push({
          id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
          companyId: company.id,
          name,
          type,
          description: type === "recipe" ? description : "",
          parentId: parentId || null,
        });
        return draft;
      });

      res.writeHead(302, { Location: `/owner/${owner.id}/recipes` });
      res.end();
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

const PORT = process.env.PORT || 4101;
server.listen(PORT, () => console.log("staff-site running on", PORT));
