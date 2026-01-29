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

const DEFAULT_REPORT_CONFIG = {
  templates: [],
  rules: [],
};

const renderLayout = (title, body) => `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f3f5fb;
      --card: #ffffff;
      --text: #1f2a37;
      --muted: #6b7280;
      --primary: #2f80ed;
      --primary-weak: #eef2ff;
      --border: #e5e9f2;
      --danger: #e17055;
    }
    * { box-sizing: border-box; }
    body {
      font-family: "Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, Arial, sans-serif;
      background: var(--bg);
      margin: 0;
      padding: 32px 20px 60px;
      color: var(--text);
    }
    a { color: inherit; }
    .page { max-width: 1040px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
    .card {
      background: var(--card);
      padding: 28px;
      border-radius: 16px;
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
      width: 100%;
    }
    .card--narrow { max-width: 520px; margin: 0 auto; }
    .card h1 { margin-top: 0; font-size: 24px; }
    h2 { margin-top: 24px; font-size: 18px; }
    label { display: block; margin-top: 12px; font-weight: 600; }
    input,
    textarea,
    select {
      width: 100%;
      padding: 10px 12px;
      margin-top: 6px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: #fff;
      font-size: 14px;
    }
    button,
    .button {
      margin-top: 16px;
      padding: 10px 16px;
      border: none;
      border-radius: 10px;
      background: var(--primary);
      color: #fff;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 14px;
    }
    .button.secondary { background: var(--primary-weak); color: #1d4ed8; }
    .button.ghost { background: #f1f5f9; color: #334155; }
    .button.danger { background: var(--danger); }
    .button + .button { margin-left: 8px; }
    .error { color: #d63031; margin-top: 12px; }
    ul { padding-left: 18px; }
    .muted { color: var(--muted); font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
    textarea { resize: vertical; }
    .grid { display: grid; gap: 12px; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; }
    .row > * { flex: 1; min-width: 160px; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #f1f2f6; font-size: 12px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .page-nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
    .menu-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 16px 0 8px; }
    .menu-card {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 16px;
      text-decoration: none;
      background: #f8fafc;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .menu-card:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08); }
    .menu-card strong { display: block; margin-bottom: 6px; }
  </style>
</head>
<body>
  <div class="page">
    ${body}
  </div>
</body>
</html>`;

const renderOwnerNav = (owner, { showBack = true } = {}) => `
  <div class="page-nav">
    <div class="actions">
      ${showBack ? `<a class="button secondary" href="/owner/${owner.id}">← Назад</a>` : ""}
    </div>
    <a class="button ghost" href="/">Выйти</a>
  </div>
`;

const renderLogin = (error) =>
  renderLayout(
    "Вход владельца",
    `<div class="card card--narrow">
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
      ${renderOwnerNav(owner, { showBack: false })}
      <h1>Организация: ${company.name}</h1>
      <p class="muted">Инвайт-код: ${company.inviteCode}</p>
      <div class="menu-grid">
        <a class="menu-card" href="/owner/${owner.id}/recipes">
          <strong>Управление рецептами</strong>
          <span class="muted">Структура меню и описания блюд.</span>
        </a>
        <a class="menu-card" href="/owner/${owner.id}/schedule">
          <strong>График работы и смены</strong>
          <span class="muted">Настройка расписания и подтверждение смен.</span>
        </a>
        <a class="menu-card" href="/owner/${owner.id}/reports">
          <strong>Контроль работы</strong>
          <span class="muted">Шаблоны и отчётность сотрудников.</span>
        </a>
      </div>
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

const normalizeReportConfig = (company) => {
  if (!company.reportConfig) {
    return { ...DEFAULT_REPORT_CONFIG };
  }
  const existing = company.reportConfig;
  return {
    templates: Array.isArray(existing.templates) ? existing.templates : [],
    rules: Array.isArray(existing.rules) ? existing.rules : [],
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
  <p class="muted">Сначала настройте один день, затем примените эти значения к другим дням (например, ко всем будням).</p>
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
    <div class="card" style="background:#f8fafc;border:1px solid var(--border);margin-top:16px;padding:16px;">
      <strong>Быстрое применение</strong>
      <p class="muted" style="margin-top:6px;">Выберите день-источник и отметьте дни, куда скопировать время и смены.</p>
      <div class="row">
        <div>
          <label>День-источник</label>
          <select id="copy-source">
            ${DAYS.map((day) => `<option value="${day.index}">${day.label}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Скопировать в дни</label>
          <div class="row">
            ${DAYS.map(
              (day) =>
                `<label class="muted" style="font-weight:500;"><input type="checkbox" data-copy-target="${day.index}" /> ${day.label}</label>`
            ).join("")}
          </div>
        </div>
      </div>
      <button type="button" class="button secondary" id="copy-apply">Применить ко выбранным дням</button>
    </div>
    <h3>Дни недели</h3>
    ${DAYS.map((dayMeta) => {
      const day = schedule.days.find((item) => item.dayIndex === dayMeta.index);
      return `
        <div class="grid" style="margin-bottom:12px;">
          <strong>${dayMeta.label}</strong>
          <div class="row">
            <div>
              <label>Открытие</label>
              <input type="time" name="open_${dayMeta.index}" value="${day.open || ""}" placeholder="08:00" />
            </div>
            <div>
              <label>Закрытие</label>
              <input type="time" name="close_${dayMeta.index}" value="${day.close || ""}" placeholder="21:00" />
            </div>
          </div>
          <label>Смены (формат: 08:00-15:00:2, 14:00-21:00:1)</label>
          <input type="text" name="shifts_${dayMeta.index}" value="${formatShiftInputValue(day)}" />
          <p class="muted" style="margin-top:6px;">Каждая смена: время начала-окончания и количество мест через двоеточие.</p>
        </div>
      `;
    }).join("")}
    <button type="submit">Сохранить график</button>
  </form>
  <script>
    (function () {
      const applyButton = document.getElementById("copy-apply");
      if (!applyButton) return;
      applyButton.addEventListener("click", () => {
        const sourceIndex = document.getElementById("copy-source").value;
        const sourceOpen = document.querySelector(\`input[name="open_\${sourceIndex}"]\`).value;
        const sourceClose = document.querySelector(\`input[name="close_\${sourceIndex}"]\`).value;
        const sourceShifts = document.querySelector(\`input[name="shifts_\${sourceIndex}"]\`).value;
        document.querySelectorAll("[data-copy-target]").forEach((checkbox) => {
          if (!checkbox.checked) return;
          const targetIndex = checkbox.getAttribute("data-copy-target");
          document.querySelector(\`input[name="open_\${targetIndex}"]\`).value = sourceOpen;
          document.querySelector(\`input[name="close_\${targetIndex}"]\`).value = sourceClose;
          document.querySelector(\`input[name="shifts_\${targetIndex}"]\`).value = sourceShifts;
        });
      });
    })();
  </script>
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
              <button type="submit" class="button">Подтвердить</button>
            </form>
            <form method="POST" action="/owner/${owner.id}/schedule/booking">
              <input type="hidden" name="bookingId" value="${booking.id}" />
              <input type="hidden" name="action" value="decline" />
              <button type="submit" class="button danger">Отклонить</button>
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
      ${renderOwnerNav(owner)}
      <h1>График работы: ${company.name}</h1>
      ${renderScheduleForm(owner, schedule, error)}
      <h2>Текущее расписание</h2>
      <ul>${buildScheduleSummary(schedule)}</ul>
      <h2>Кто выходит на смены</h2>
      ${renderScheduleRoster(bookings, employees, schedule)}
      <h2>Заявки на подтверждение</h2>
      ${renderPendingBookings(owner, pendingBookings, employees, schedule)}
    </div>`
  );

const renderReportTemplates = (templates) => {
  if (!templates.length) {
    return "<p class=\"muted\">Шаблоны пока не добавлены.</p>";
  }
  return `<ul>${templates
    .map(
      (template) =>
        `<li><strong>${template.name}</strong> (${template.requirePhoto ? "фото" : "без фото"})<br/><span class="muted">Чек-лист: ${template.items.join(
          ", "
        )}</span></li>`
    )
    .join("")}</ul>`;
};

const renderReportRules = (rules, templates) => {
  if (!rules.length) {
    return "<p class=\"muted\">Правила отчётности пока не заданы.</p>";
  }
  const templateName = (id) => {
    const template = templates.find((item) => item.id === id);
    return template ? template.name : "не найден";
  };
  return `<ul>${rules
    .map((rule) => {
      const timing =
        rule.trigger === "periodic"
          ? `каждые ${rule.intervalMinutes} мин., окно ${rule.windowMinutes} мин.`
          : `через ${rule.offsetMinutes} мин.`;
      const triggerLabel =
        rule.trigger === "start" ? "Начало смены" : rule.trigger === "end" ? "Конец смены" : "В течение смены";
      return `<li><strong>${rule.name}</strong> (${triggerLabel}, ${timing}) — шаблон: ${templateName(rule.templateId)}</li>`;
    })
    .join("")}</ul>`;
};

const renderReportSubmissions = (submissions, employees, templates) => {
  if (!submissions.length) {
    return "<p class=\"muted\">Отчётов за последние 14 дней нет.</p>";
  }
  const rows = submissions
    .map((submission) => {
      const employee = employees.find((item) => item.id === submission.employeeId);
      const template = templates.find((item) => item.id === submission.templateId);
      const answers = submission.answers && submission.answers.length ? submission.answers.join("; ") : "—";
      const photos = submission.photos && submission.photos.length ? submission.photos.join(", ") : "—";
      return `
        <tr>
          <td>${submission.date}</td>
          <td>${employee ? employee.name : "Неизвестный"}</td>
          <td>${template ? template.name : "Шаблон удалён"}</td>
          <td><span class="pill">${submission.status}</span></td>
          <td>${answers}</td>
          <td>${photos}</td>
        </tr>
      `;
    })
    .join("");
  return `
    <table>
      <thead>
        <tr>
          <th>Дата</th>
          <th>Сотрудник</th>
          <th>Шаблон</th>
          <th>Статус</th>
          <th>Ответы</th>
          <th>Фото</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
};

const renderReportsPage = (owner, company, employees, reportConfig, submissions, error) => {
  const templateOptions = reportConfig.templates
    .map((template) => `<option value="${template.id}">${template.name}</option>`)
    .join("");
  return renderLayout(
    "Контроль работы",
    `<div class="card">
      ${renderOwnerNav(owner)}
      <h1>Контроль работы: ${company.name}</h1>
      ${error ? `<div class="error">${error}</div>` : ""}
      <div class="card" style="background:#f8fafc;border:1px solid var(--border);margin-top:12px;padding:16px;">
        <strong>Как настроить контроль</strong>
        <ol class="muted" style="margin-top:8px;">
          <li>Создайте шаблон отчёта: список пунктов, по которым сотрудник должен отчитаться.</li>
          <li>Создайте правило: когда отправлять отчёт (начало/конец/в течение смены).</li>
          <li>Сотрудник получит напоминание и заполнит отчёт по выбранному шаблону.</li>
        </ol>
      </div>
      <h2>Шаблоны отчётов</h2>
      <form method="POST" action="/owner/${owner.id}/reports/templates">
        <label>Название шаблона</label>
        <input type="text" name="templateName" required />
        <label>Чек-лист (через запятую)</label>
        <input type="text" name="templateItems" placeholder="Пришёл вовремя, Одежда, Касса" required />
        <p class="muted" style="margin-top:6px;">Пример: “Пришёл вовремя, Форма, Чистота рабочей зоны”.</p>
        <label><input type="checkbox" name="templatePhoto" value="yes" /> Требуется фото</label>
        <button type="submit">Добавить шаблон</button>
      </form>
      ${renderReportTemplates(reportConfig.templates)}
      <h2>Правила отчётности</h2>
      <form method="POST" action="/owner/${owner.id}/reports/rules">
        <label>Название правила</label>
        <input type="text" name="ruleName" required />
        <label>Шаблон</label>
        <select name="ruleTemplate" required>
          ${templateOptions || "<option value=\"\">Нет шаблонов</option>"}
        </select>
        <p class="muted" style="margin-top:6px;">Выберите, по какому шаблону сотрудник будет отчитываться.</p>
        <label>Когда отправлять</label>
        <select name="ruleTrigger">
          <option value="start">Начало смены</option>
          <option value="periodic">В течение смены</option>
          <option value="end">Конец смены</option>
        </select>
        <label>Смещение или интервал (мин)</label>
        <input type="number" name="ruleInterval" value="0" min="0" />
        <label>Окно отправки (мин) для периодических</label>
        <input type="number" name="ruleWindow" value="15" min="5" />
        <p class="muted" style="margin-top:6px;">
          <strong>Подсказка:</strong> для начала/конца смены укажите смещение (например, 10 — отправить через 10 минут).
          Для “В течение смены” укажите интервал (например, 120 — каждые 2 часа) и окно (например, 15 минут).
        </p>
        <button type="submit">Добавить правило</button>
      </form>
      ${renderReportRules(reportConfig.rules, reportConfig.templates)}
      <h2>Отчёты за 14 дней</h2>
      ${renderReportSubmissions(submissions, employees, reportConfig.templates)}
    </div>`
  );
};

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
      ${renderOwnerNav(owner)}
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
      ${renderOwnerNav(owner)}
      <h1>Рецепты компании ${company.name}</h1>
      ${renderRecipeForm(owner, recipes, error)}
      <h2>Дерево рецептов</h2>
      ${renderRecipeTree(buildRecipeTree(recipes))}
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

    if (!section) {
      const employees = data.employees.filter((employee) => employee.companyId === company.id);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderDashboard(company, employees, owner));
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

    if (section === "reports") {
      const reportConfig = normalizeReportConfig(company);
      const employees = data.employees.filter((employee) => employee.companyId === company.id);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const submissions = data.reportSubmissions.filter(
        (submission) =>
          submission.companyId === company.id && new Date(submission.date) >= cutoff
      );
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderReportsPage(owner, company, employees, reportConfig, submissions));
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

    if (section === "reports") {
      parseBody(req, (payload) => {
        const reportConfig = normalizeReportConfig(company);
        const employees = data.employees.filter((employee) => employee.companyId === company.id);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 14);
        const submissions = data.reportSubmissions.filter(
          (submission) =>
            submission.companyId === company.id && new Date(submission.date) >= cutoff
        );

        const renderError = (message) => {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderReportsPage(owner, company, employees, reportConfig, submissions, message));
        };

        if (action === "templates") {
          const name = (payload.templateName || "").trim();
          const items = (payload.templateItems || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
          const requirePhoto = payload.templatePhoto === "yes";
          if (!name || !items.length) {
            renderError("Заполните название и чек-лист.");
            return;
          }
          updateData((draft) => {
            const targetCompany = draft.companies.find((item) => item.id === company.id);
            if (targetCompany) {
              const nextConfig = normalizeReportConfig(targetCompany);
              nextConfig.templates.push({
                id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
                name,
                items,
                requirePhoto,
              });
              targetCompany.reportConfig = nextConfig;
            }
            return draft;
          });
          res.writeHead(302, { Location: `/owner/${owner.id}/reports` });
          res.end();
          return;
        }

        if (action === "rules") {
          const name = (payload.ruleName || "").trim();
          const templateId = payload.ruleTemplate;
          const trigger = payload.ruleTrigger;
          const interval = Number.parseInt(payload.ruleInterval, 10);
          const window = Number.parseInt(payload.ruleWindow, 10);
          if (!name || !templateId) {
            renderError("Выберите шаблон и задайте название правила.");
            return;
          }
          const safeTrigger = ["start", "end", "periodic"].includes(trigger) ? trigger : "start";
          if (Number.isNaN(interval) || interval < 0) {
            renderError("Интервал или смещение должно быть числом.");
            return;
          }
          if (safeTrigger === "periodic" && (Number.isNaN(window) || window < 5)) {
            renderError("Окно отправки должно быть не меньше 5 минут.");
            return;
          }
          updateData((draft) => {
            const targetCompany = draft.companies.find((item) => item.id === company.id);
            if (targetCompany) {
              const nextConfig = normalizeReportConfig(targetCompany);
              nextConfig.rules.push({
                id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
                name,
                templateId,
                trigger: safeTrigger,
                offsetMinutes: safeTrigger === "periodic" ? 0 : interval,
                intervalMinutes: safeTrigger === "periodic" ? Math.max(interval, 1) : 0,
                windowMinutes: safeTrigger === "periodic" ? Math.max(window, 5) : 0,
              });
              targetCompany.reportConfig = nextConfig;
            }
            return draft;
          });
          res.writeHead(302, { Location: `/owner/${owner.id}/reports` });
          res.end();
          return;
        }

        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
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
