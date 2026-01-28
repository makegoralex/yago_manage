const http = require("http");
const querystring = require("querystring");
const { readData, updateData } = require("../data/store");

const DAYS = [
  { key: "mon", label: "Пн", index: 1 },
  { key: "tue", label: "Вт", index: 2 },
  { key: "wed", label: "Ср", index: 3 },
  { key: "thu", label: "Чт", index: 4 },
  { key: "fri", label: "Пт", index: 5 },
  { key: "sat", label: "Сб", index: 6 },
  { key: "sun", label: "Вс", index: 0 },
];

const DEFAULT_SCHEDULE = {
  bookingMode: "auto",
  bookingPeriod: "weekly",
  days: DAYS.map((day) => ({
    dayIndex: day.index,
    open: "",
    close: "",
    shifts: [],
  })),
};

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
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #eceff4; }
    textarea { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #dcdde1; }
    .grid { display: grid; gap: 12px; }
    .row { display: flex; gap: 12px; }
    .row > * { flex: 1; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #f1f2f6; font-size: 12px; }
    .actions { display: flex; gap: 8px; }
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
      <p><a href="/owner/${owner.id}/schedule">График работы и смены</a></p>
      <h2>Сотрудники</h2>
      ${
        employees.length
          ? `<ul>${employees.map((emp) => `<li>${emp.name}</li>`).join("")}</ul>`
          : "<p>Сотрудников пока нет.</p>"
      }
    </div>`
  );

const normalizeSchedule = (company) => {
  if (!company.scheduleConfig) {
    return { ...DEFAULT_SCHEDULE };
  }
  const existing = company.scheduleConfig;
  const days = DAYS.map((day) => {
    const current = (existing.days || []).find((item) => item.dayIndex === day.index);
    if (!current) {
      return { dayIndex: day.index, open: "", close: "", shifts: [] };
    }
    return {
      dayIndex: day.index,
      open: current.open || "",
      close: current.close || "",
      shifts: Array.isArray(current.shifts) ? current.shifts : [],
    };
  });
  return {
    bookingMode: existing.bookingMode === "manual" ? "manual" : "auto",
    bookingPeriod: existing.bookingPeriod === "monthly" ? "monthly" : "weekly",
    days,
  };
};

const formatScheduleLine = (day) => {
  if (!day.open || !day.close) {
    return "выходной";
  }
  const shifts = day.shifts.length
    ? day.shifts
        .map((shift) => `${shift.start}-${shift.end} (${shift.slots} мест)`)
        .join(", ")
    : "без смен";
  return `${day.open}-${day.close}, смены: ${shifts}`;
};

const buildScheduleSummary = (schedule) =>
  DAYS.map((day) => {
    const info = schedule.days.find((item) => item.dayIndex === day.index);
    return `<li><strong>${day.label}</strong>: ${formatScheduleLine(info)}</li>`;
  }).join("");

const formatShiftInputValue = (day) =>
  day.shifts
    .map((shift) => `${shift.start}-${shift.end}:${shift.slots}`)
    .join(", ");

const renderScheduleForm = (owner, schedule, error) => `
  <h2>Настройка графика</h2>
  ${error ? `<div class="error">${error}</div>` : ""}
  <form method="POST" action="/owner/${owner.id}/schedule">
    <label>Режим бронирования</label>
    <select name="bookingMode">
      <option value="auto" ${schedule.bookingMode === "auto" ? "selected" : ""}>Автоматически подтверждать</option>
      <option value="manual" ${schedule.bookingMode === "manual" ? "selected" : ""}>Подтверждать вручную</option>
    </select>
    <label>Период открытия записей</label>
    <select name="bookingPeriod">
      <option value="weekly" ${schedule.bookingPeriod === "weekly" ? "selected" : ""}>Раз в неделю</option>
      <option value="monthly" ${schedule.bookingPeriod === "monthly" ? "selected" : ""}>Раз в месяц</option>
    </select>
    <h3>Дни недели</h3>
    ${DAYS.map((dayMeta) => {
      const day = schedule.days.find((item) => item.dayIndex === dayMeta.index);
      return `
        <div class="grid" style="margin-bottom:12px;">
          <strong>${dayMeta.label}</strong>
          <div class="row">
            <div>
              <label>Открытие</label>
              <input type="text" name="open_${dayMeta.index}" value="${day.open || ""}" placeholder="08:00" />
            </div>
            <div>
              <label>Закрытие</label>
              <input type="text" name="close_${dayMeta.index}" value="${day.close || ""}" placeholder="21:00" />
            </div>
          </div>
          <label>Смены (формат: 08:00-15:00:2, 14:00-21:00:1)</label>
          <input type="text" name="shifts_${dayMeta.index}" value="${formatShiftInputValue(day)}" />
        </div>
      `;
    }).join("")}
    <button type="submit">Сохранить график</button>
  </form>
`;

const renderPendingBookings = (owner, bookings, employees, schedule) => {
  if (!bookings.length) {
    return "<p class=\"muted\">Нет заявок на подтверждение.</p>";
  }
  const rows = bookings
    .map((booking) => {
      const employee = employees.find((item) => item.id === booking.employeeId);
      const day = schedule.days.find((item) => item.dayIndex === booking.dayIndex);
      const shift = day ? day.shifts.find((item) => item.id === booking.shiftId) : null;
      const shiftLabel = shift ? `${shift.start}-${shift.end}` : "смена удалена";
      return `
        <tr>
          <td>${employee ? employee.name : "Неизвестный сотрудник"}</td>
          <td>${booking.date}</td>
          <td>${shiftLabel}</td>
          <td><span class="pill">${booking.status}</span></td>
          <td class="actions">
            <form method="POST" action="/owner/${owner.id}/schedule/booking">
              <input type="hidden" name="bookingId" value="${booking.id}" />
              <input type="hidden" name="action" value="approve" />
              <button type="submit">Подтвердить</button>
            </form>
            <form method="POST" action="/owner/${owner.id}/schedule/booking">
              <input type="hidden" name="bookingId" value="${booking.id}" />
              <input type="hidden" name="action" value="decline" />
              <button type="submit" style="background:#e17055;">Отклонить</button>
            </form>
          </td>
        </tr>
      `;
    })
    .join("");
  return `
    <table>
      <thead>
        <tr>
          <th>Сотрудник</th>
          <th>Дата</th>
          <th>Смена</th>
          <th>Статус</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
};

const renderScheduleRoster = (bookings, employees, schedule) => {
  if (!bookings.length) {
    return "<p class=\"muted\">Пока нет записей на смены.</p>";
  }
  const grouped = new Map();
  bookings.forEach((booking) => {
    if (!grouped.has(booking.date)) {
      grouped.set(booking.date, new Map());
    }
    const shifts = grouped.get(booking.date);
    if (!shifts.has(booking.shiftId)) {
      shifts.set(booking.shiftId, []);
    }
    shifts.get(booking.shiftId).push(booking);
  });

  const sortedDates = [...grouped.keys()].sort();
  const sections = sortedDates
    .map((date) => {
      const shifts = grouped.get(date);
      const shiftRows = [...shifts.entries()]
        .map(([shiftId, items]) => {
          const dayIndex = items[0]?.dayIndex;
          const day = schedule.days.find((item) => item.dayIndex === dayIndex);
          const shift = day ? day.shifts.find((item) => item.id === shiftId) : null;
          const shiftLabel = shift ? `${shift.start}-${shift.end}` : "смена удалена";
          const people = items
            .map((item) => {
              const employee = employees.find((emp) => emp.id === item.employeeId);
              const name = employee ? employee.name : "Неизвестный сотрудник";
              return `${name} (${item.status})`;
            })
            .join(", ");
          return `<li><strong>${shiftLabel}</strong>: ${people}</li>`;
        })
        .join("");
      return `<div style="margin-bottom:12px;"><strong>${date}</strong><ul>${shiftRows}</ul></div>`;
    })
    .join("");

  return sections;
};

const renderSchedulePage = (owner, company, employees, schedule, bookings, pendingBookings, error) =>
  renderLayout(
    "График работы",
    `<div class="card">
      <h1>График работы: ${company.name}</h1>
      ${renderScheduleForm(owner, schedule, error)}
      <h2>Текущее расписание</h2>
      <ul>${buildScheduleSummary(schedule)}</ul>
      <h2>Кто выходит на смены</h2>
      ${renderScheduleRoster(bookings, employees, schedule)}
      <h2>Заявки на подтверждение</h2>
      ${renderPendingBookings(owner, pendingBookings, employees, schedule)}
      <p class="muted"><a href="/">Выйти</a></p>
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

const isValidTime = (value) => /^\d{2}:\d{2}$/.test(value);

const parseShifts = (value, dayIndex) => {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index) => {
      const match = chunk.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*:\s*(\d+)$/);
      if (!match) {
        throw new Error("Неверный формат смен. Используйте 08:00-15:00:2.");
      }
      const [, start, end, slotsRaw] = match;
      const slots = Number.parseInt(slotsRaw, 10);
      if (!isValidTime(start) || !isValidTime(end) || Number.isNaN(slots) || slots < 1) {
        throw new Error("Неверный формат смен. Используйте 08:00-15:00:2.");
      }
      return {
        id: `${dayIndex}-${start}-${end}-${index}`,
        start,
        end,
        slots,
      };
    });
};

const parseSchedulePayload = (payload) => {
  const bookingMode = payload.bookingMode === "manual" ? "manual" : "auto";
  const bookingPeriod = payload.bookingPeriod === "monthly" ? "monthly" : "weekly";
  const days = DAYS.map((day) => {
    const open = (payload[`open_${day.index}`] || "").trim();
    const close = (payload[`close_${day.index}`] || "").trim();
    const shiftsRaw = (payload[`shifts_${day.index}`] || "").trim();
    if (!open && !close && !shiftsRaw) {
      return { dayIndex: day.index, open: "", close: "", shifts: [] };
    }
    if (!open || !close || !isValidTime(open) || !isValidTime(close)) {
      throw new Error(`Укажите корректное время открытия и закрытия для дня ${day.label}.`);
    }
    const shifts = parseShifts(shiftsRaw, day.index);
    return {
      dayIndex: day.index,
      open,
      close,
      shifts,
    };
  });
  return { bookingMode, bookingPeriod, days };
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

    if (section === "schedule") {
      const schedule = normalizeSchedule(company);
      const employees = data.employees.filter((employee) => employee.companyId === company.id);
      const companyBookings = data.bookings.filter((booking) => booking.companyId === company.id);
      const pendingBookings = companyBookings.filter((booking) => booking.status === "pending");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderSchedulePage(owner, company, employees, schedule, companyBookings, pendingBookings));
      return;
    }

    if (section !== "recipes") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
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

    if (section === "schedule") {
      parseBody(req, (payload) => {
        if (action === "booking") {
          const booking = data.bookings.find(
            (item) => item.id === payload.bookingId && item.companyId === company.id
          );
          if (!booking) {
            res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
            const employees = data.employees.filter((employee) => employee.companyId === company.id);
            const companyBookings = data.bookings.filter((item) => item.companyId === company.id);
            const pendingBookings = companyBookings.filter((item) => item.status === "pending");
            res.end(
              renderSchedulePage(
                owner,
                company,
                employees,
                normalizeSchedule(company),
                companyBookings,
                pendingBookings,
                "Заявка не найдена."
              )
            );
            return;
          }

          const schedule = normalizeSchedule(company);
          const day = schedule.days.find((item) => item.dayIndex === booking.dayIndex);
          const shift = day ? day.shifts.find((item) => item.id === booking.shiftId) : null;
          if (payload.action === "approve" && shift) {
            const approvedCount = data.bookings.filter(
              (item) =>
                item.companyId === company.id &&
                item.shiftId === booking.shiftId &&
                item.date === booking.date &&
                item.status === "approved"
            ).length;
            if (approvedCount >= shift.slots) {
              res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
              const employees = data.employees.filter((employee) => employee.companyId === company.id);
              const companyBookings = data.bookings.filter((item) => item.companyId === company.id);
              const pendingBookings = companyBookings.filter((item) => item.status === "pending");
              res.end(
                renderSchedulePage(
                  owner,
                  company,
                  employees,
                  schedule,
                  companyBookings,
                  pendingBookings,
                  "Все слоты в смене уже заняты."
                )
              );
              return;
            }
          }

          updateData((draft) => {
            const target = draft.bookings.find((item) => item.id === payload.bookingId);
            if (target) {
              target.status = payload.action === "approve" ? "approved" : "declined";
            }
            return draft;
          });
          res.writeHead(302, { Location: `/owner/${owner.id}/schedule` });
          res.end();
          return;
        }

        try {
          const schedule = parseSchedulePayload(payload);
          updateData((draft) => {
            const targetCompany = draft.companies.find((item) => item.id === company.id);
            if (targetCompany) {
              targetCompany.scheduleConfig = schedule;
            }
            return draft;
          });
          res.writeHead(302, { Location: `/owner/${owner.id}/schedule` });
          res.end();
        } catch (error) {
          const employees = data.employees.filter((employee) => employee.companyId === company.id);
          const companyBookings = data.bookings.filter((booking) => booking.companyId === company.id);
          const pendingBookings = companyBookings.filter((booking) => booking.status === "pending");
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            renderSchedulePage(
              owner,
              company,
              employees,
              normalizeSchedule(company),
              companyBookings,
              pendingBookings,
              error.message
            )
          );
        }
      });
      return;
    }

    if (section !== "recipes") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
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
