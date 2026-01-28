const TelegramBot = require("node-telegram-bot-api");
const { readData, updateData } = require("../data/store");

const token = process.env.TG_BOT_TOKEN;

if (!token) {
  console.error("TG_BOT_TOKEN is required");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const sessions = new Map();

const MAIN_MENU = {
  reply_markup: {
    keyboard: [["Профиль", "Рецепты"], ["График"]],
    resize_keyboard: true,
  },
};

const ROLE_MENU = {
  reply_markup: {
    keyboard: [["Я владелец", "Я сотрудник"], ["Вход"]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

const OWNER_MENU = {
  reply_markup: {
    keyboard: [["График"], ["В меню"]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

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

const createId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const generateInviteCode = (companies) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (companies.some((company) => company.inviteCode === code));
  return code;
};

const normalizeSchedule = (company) => {
  if (!company || !company.scheduleConfig) {
    return { ...DEFAULT_SCHEDULE };
  }
  const existing = company.scheduleConfig;
  return {
    bookingMode: existing.bookingMode === "manual" ? "manual" : "auto",
    bookingPeriod: existing.bookingPeriod === "monthly" ? "monthly" : "weekly",
    days: DAYS.map((day) => {
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
    }),
  };
};

const getPeriodRange = (period, now = new Date()) => {
  const start = new Date(now);
  const end = new Date(now);
  if (period === "monthly") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateKey = (value) => {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(year, month - 1, day);
};

const formatDateLabel = (date) => {
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const weekday = DAYS.find((item) => item.index === date.getDay());
  return `${weekday ? weekday.label : ""} ${day}.${month}`;
};

const getDatesInRange = (start, end) => {
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const getSession = (userId) => {
  if (!sessions.has(userId)) {
    sessions.set(userId, { role: null, step: null, data: {} });
  }
  return sessions.get(userId);
};

const resetSession = (userId) => {
  sessions.delete(userId);
};

const findOwnerByTelegramId = (data, telegramId) =>
  data.owners.find((owner) => owner.telegramId === telegramId);

const findEmployeeByTelegramId = (data, telegramId) =>
  data.employees.find((employee) => employee.telegramId === telegramId);

const sendEmployeeMenu = (chatId) => {
  bot.sendMessage(chatId, "Выберите раздел:", MAIN_MENU);
};

const buildRecipeKeyboard = (items, includeBack) => {
  const rows = items.map((item) => [item.name]);
  const controlRow = [];
  if (includeBack) {
    controlRow.push("Назад");
  }
  controlRow.push("В меню");
  rows.push(controlRow);
  return {
    reply_markup: {
      keyboard: rows,
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
};

const getRecipeChildren = (data, companyId, parentId) =>
  data.recipes.filter(
    (item) => item.companyId === companyId && item.parentId === parentId
  );

const startRecipeFlow = (session, chatId, data, companyId) => {
  session.view = "recipes";
  session.recipeStack = [null];
  const items = getRecipeChildren(data, companyId, null);
  if (!items.length) {
    bot.sendMessage(
      chatId,
      "Рецептов пока нет. Обратитесь к владельцу.",
      {
        reply_markup: {
          keyboard: [["В меню"]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
    );
    return;
  }
  session.recipeOptions = new Map(items.map((item) => [item.name, item.id]));
  bot.sendMessage(chatId, "Выберите категорию:", buildRecipeKeyboard(items, false));
};

const handleRecipeNavigation = (session, chatId, data, companyId, text) => {
  if (text === "В меню") {
    session.view = null;
    session.recipeStack = null;
    session.recipeOptions = null;
    sendEmployeeMenu(chatId);
    return true;
  }

  if (text === "Назад") {
    if (session.recipeStack && session.recipeStack.length > 1) {
      session.recipeStack.pop();
    }
    const parentId = session.recipeStack ? session.recipeStack[session.recipeStack.length - 1] : null;
    const items = getRecipeChildren(data, companyId, parentId);
    if (!items.length) {
      bot.sendMessage(
        chatId,
        "В этой категории пока нет подкатегорий или рецептов.",
        buildRecipeKeyboard([], session.recipeStack && session.recipeStack.length > 1)
      );
      return true;
    }
    session.recipeOptions = new Map(items.map((item) => [item.name, item.id]));
    bot.sendMessage(chatId, "Выберите раздел:", buildRecipeKeyboard(items, session.recipeStack.length > 1));
    return true;
  }

  if (!session.recipeOptions || !session.recipeOptions.has(text)) {
    return false;
  }

  const recipeId = session.recipeOptions.get(text);
  const selected = data.recipes.find((item) => item.id === recipeId);
  if (!selected) {
    bot.sendMessage(chatId, "Раздел не найден. Попробуйте ещё раз.");
    return true;
  }

  if (selected.type === "recipe") {
    bot.sendMessage(
      chatId,
      `Рецепт: ${selected.name}\n\n${selected.description || "Описание пока не заполнено."}`,
      buildRecipeKeyboard([], session.recipeStack && session.recipeStack.length > 1)
    );
    return true;
  }

  session.recipeStack.push(selected.id);
  const items = getRecipeChildren(data, companyId, selected.id);
  if (!items.length) {
    bot.sendMessage(
      chatId,
      "В этой категории пока нет подкатегорий или рецептов.",
      buildRecipeKeyboard([], true)
    );
    return true;
  }
  session.recipeOptions = new Map(items.map((item) => [item.name, item.id]));
  bot.sendMessage(chatId, "Выберите раздел:", buildRecipeKeyboard(items, true));
  return true;
};

const buildDateKeyboard = (dates) => {
  const rows = dates.map((label) => [label]);
  rows.push(["В меню"]);
  return {
    reply_markup: {
      keyboard: rows,
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
};

const buildShiftKeyboard = (labels) => {
  const rows = labels.map((label) => [label]);
  rows.push(["Назад", "В меню"]);
  return {
    reply_markup: {
      keyboard: rows,
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
};

const getScheduleDates = (schedule) => {
  const { start, end } = getPeriodRange(schedule.bookingPeriod);
  return getDatesInRange(start, end).filter((date) => {
    const dayConfig = schedule.days.find((item) => item.dayIndex === date.getDay());
    return dayConfig && dayConfig.shifts.length > 0;
  });
};

const getBookingCounts = (data, companyId, dateKey, shiftId) => {
  const filtered = data.bookings.filter(
    (item) => item.companyId === companyId && item.date === dateKey && item.shiftId === shiftId
  );
  return {
    approved: filtered.filter((item) => item.status === "approved").length,
    pending: filtered.filter((item) => item.status === "pending").length,
  };
};

const getShiftLabel = (schedule, dayIndex, shiftId) => {
  const day = schedule.days.find((item) => item.dayIndex === dayIndex);
  const shift = day ? day.shifts.find((item) => item.id === shiftId) : null;
  return shift ? `${shift.start}-${shift.end}` : "смена удалена";
};

const buildEmployeeBookingSummary = (bookings, schedule) => {
  if (!bookings.length) {
    return "Пока нет записей на смены.";
  }
  return bookings
    .map((item) => {
      const shiftLabel = getShiftLabel(schedule, item.dayIndex, item.shiftId);
      return `• ${item.date} ${shiftLabel} (${item.status})`;
    })
    .join("\n");
};

const buildOwnerScheduleSummary = (bookings, schedule, employees) => {
  if (!bookings.length) {
    return "Пока нет записей на смены.";
  }
  const grouped = new Map();
  bookings.forEach((booking) => {
    if (!grouped.has(booking.date)) {
      grouped.set(booking.date, new Map());
    }
    const shiftMap = grouped.get(booking.date);
    if (!shiftMap.has(booking.shiftId)) {
      shiftMap.set(booking.shiftId, []);
    }
    shiftMap.get(booking.shiftId).push(booking);
  });

  const sortedDates = [...grouped.keys()].sort();
  return sortedDates
    .map((date) => {
      const shifts = grouped.get(date);
      const shiftLines = [...shifts.entries()]
        .map(([shiftId, items]) => {
          const shiftLabel = getShiftLabel(schedule, items[0]?.dayIndex, shiftId);
          const people = items
            .map((item) => {
              const employee = employees.find((emp) => emp.id === item.employeeId);
              const name = employee ? employee.name : "Неизвестный сотрудник";
              return `${name} (${item.status})`;
            })
            .join(", ");
          return `  - ${shiftLabel}: ${people}`;
        })
        .join("\n");
      return `${date}\n${shiftLines}`;
    })
    .join("\n\n");
};

const startScheduleFlow = (session, chatId, data, companyId, employeeId) => {
  const company = data.companies.find((item) => item.id === companyId);
  const schedule = normalizeSchedule(company);
  const dates = getScheduleDates(schedule);
  if (!dates.length) {
    bot.sendMessage(chatId, "График пока не настроен или нет доступных смен.", MAIN_MENU);
    return;
  }

  const employeeBookings = data.bookings.filter(
    (item) => item.companyId === companyId && item.employeeId === employeeId
  );
  const upcomingSummary = buildEmployeeBookingSummary(employeeBookings, schedule);
  bot.sendMessage(chatId, `Ваши смены:\n${upcomingSummary}`);

  session.view = "schedule";
  session.step = "schedule-date";
  session.scheduleDates = new Map(
    dates.map((date) => [formatDateLabel(date), formatDateKey(date)])
  );
  bot.sendMessage(
    chatId,
    "Выберите дату для просмотра смен:",
    buildDateKeyboard([...session.scheduleDates.keys()])
  );
};

const handleScheduleNavigation = (session, chatId, data, companyId, employeeId, text) => {
  const company = data.companies.find((item) => item.id === companyId);
  const schedule = normalizeSchedule(company);

  if (text === "В меню") {
    session.view = null;
    session.step = null;
    session.scheduleDates = null;
    session.scheduleShifts = null;
    sendEmployeeMenu(chatId);
    return true;
  }

  if (session.step === "schedule-date") {
    if (!session.scheduleDates || !session.scheduleDates.has(text)) {
      return false;
    }
    const dateKey = session.scheduleDates.get(text);
    const date = parseDateKey(dateKey);
    const dayConfig = schedule.days.find((item) => item.dayIndex === date.getDay());
    if (!dayConfig || !dayConfig.shifts.length) {
      bot.sendMessage(chatId, "В этот день смен нет. Выберите другую дату.");
      return true;
    }
    session.step = "schedule-shift";
    session.selectedDateKey = dateKey;
    session.scheduleShifts = new Map(
      dayConfig.shifts.map((shift) => {
        const counts = getBookingCounts(data, companyId, dateKey, shift.id);
        const label = `${shift.start}-${shift.end} (мест: ${shift.slots}, занято: ${counts.approved}, ожидание: ${counts.pending})`;
        return [label, shift.id];
      })
    );
    bot.sendMessage(
      chatId,
      `Смены на ${text}. Выберите смену:`,
      buildShiftKeyboard([...session.scheduleShifts.keys()])
    );
    return true;
  }

  if (session.step === "schedule-shift") {
    if (text === "Назад") {
      session.step = "schedule-date";
      session.scheduleShifts = null;
      bot.sendMessage(
        chatId,
        "Выберите дату для просмотра смен:",
        buildDateKeyboard([...session.scheduleDates.keys()])
      );
      return true;
    }
    if (!session.scheduleShifts || !session.scheduleShifts.has(text)) {
      return false;
    }
    const shiftId = session.scheduleShifts.get(text);
    const dateKey = session.selectedDateKey;
    const dayConfig = schedule.days.find((item) =>
      item.shifts.some((shift) => shift.id === shiftId)
    );
    const shift = dayConfig ? dayConfig.shifts.find((item) => item.id === shiftId) : null;
    if (!shift) {
      bot.sendMessage(chatId, "Смена не найдена. Попробуйте ещё раз.");
      return true;
    }

    const alreadyBooked = data.bookings.find(
      (item) =>
        item.companyId === companyId &&
        item.employeeId === employeeId &&
        item.date === dateKey &&
        item.shiftId === shiftId &&
        item.status !== "declined"
    );
    if (alreadyBooked) {
      bot.sendMessage(chatId, "Вы уже записаны на эту смену.");
      return true;
    }

    const counts = getBookingCounts(data, companyId, dateKey, shiftId);
    if (schedule.bookingMode === "auto" && counts.approved >= shift.slots) {
      bot.sendMessage(chatId, "Все слоты заняты. Выберите другую смену.");
      return true;
    }

    const status = schedule.bookingMode === "auto" ? "approved" : "pending";
    updateData((draft) => {
      draft.bookings.push({
        id: createId(),
        companyId,
        employeeId,
        date: dateKey,
        dayIndex: dayConfig.dayIndex,
        shiftId,
        status,
        createdAt: new Date().toISOString(),
      });
      return draft;
    });
    bot.sendMessage(
      chatId,
      status === "approved"
        ? "Вы записаны на смену."
        : "Заявка отправлена владельцу на подтверждение."
    );
    session.view = null;
    session.step = null;
    session.scheduleDates = null;
    session.scheduleShifts = null;
    sendEmployeeMenu(chatId);
    return true;
  }

  return false;
};

bot.onText(/\/start/, (msg) => {
  const telegramId = msg.from.id;
  resetSession(telegramId);
  bot.sendMessage(
    msg.chat.id,
    "Добро пожаловать! Выберите регистрацию или вход:",
    ROLE_MENU
  );
});

bot.on("message", (msg) => {
  if (!msg.text || msg.text.startsWith("/")) {
    return;
  }

  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const text = msg.text.trim();
  const session = getSession(telegramId);
  const data = readData();

  const existingEmployee = findEmployeeByTelegramId(data, telegramId);
  const existingOwner = existingEmployee ? null : findOwnerByTelegramId(data, telegramId);
  if (existingEmployee) {
    if (session.view === "recipes") {
      if (
        handleRecipeNavigation(
          session,
          chatId,
          data,
          existingEmployee.companyId,
          text
        )
      ) {
        return;
      }
    }

    if (session.view === "schedule") {
      if (
        handleScheduleNavigation(
          session,
          chatId,
          data,
          existingEmployee.companyId,
          existingEmployee.id,
          text
        )
      ) {
        return;
      }
    }

    if (text === "Профиль") {
      const company = data.companies.find((item) => item.id === existingEmployee.companyId);
      const companyName = company ? company.name : "(не найдена)";
      bot.sendMessage(
        chatId,
        `Профиль\nИмя: ${existingEmployee.name}\nКомпания: ${companyName}`,
        MAIN_MENU
      );
      return;
    }

    if (text === "Рецепты") {
      startRecipeFlow(session, chatId, data, existingEmployee.companyId);
      return;
    }

    if (text === "График") {
      startScheduleFlow(session, chatId, data, existingEmployee.companyId, existingEmployee.id);
      return;
    }

    if (text === "Назад") {
      sendEmployeeMenu(chatId);
      return;
    }
  }

  if (existingOwner) {
    if (text === "В меню") {
      bot.sendMessage(chatId, "Раздел владельца:", OWNER_MENU);
      return;
    }

    if (text === "График") {
      const company = data.companies.find((item) => item.id === existingOwner.companyId);
      const schedule = normalizeSchedule(company);
      const employees = data.employees.filter((item) => item.companyId === existingOwner.companyId);
      const bookings = data.bookings.filter((item) => item.companyId === existingOwner.companyId);
      const summary = buildOwnerScheduleSummary(bookings, schedule, employees);
      bot.sendMessage(chatId, `Расписание смен:\n${summary}`, OWNER_MENU);
      return;
    }
  }

  if (text === "Я владелец") {
    session.role = "owner";
    session.step = "company";
    session.data = {};
    bot.sendMessage(chatId, "Введите название компании:");
    return;
  }

  if (text === "Я сотрудник") {
    session.role = "employee";
    session.step = "invite";
    session.data = {};
    bot.sendMessage(chatId, "Введите инвайт-код компании:");
    return;
  }

  if (text === "Вход") {
    const employee = findEmployeeByTelegramId(data, telegramId);
    if (employee) {
      sendEmployeeMenu(chatId);
      return;
    }
    const owner = findOwnerByTelegramId(data, telegramId);
    if (owner) {
      bot.sendMessage(chatId, "Раздел владельца:", OWNER_MENU);
      return;
    }

    session.role = "login";
    session.step = "login";
    session.data = {};
    bot.sendMessage(chatId, "Введите логин владельца:");
    return;
  }

  if (session.role === "owner") {
    if (session.step === "company") {
      session.data.companyName = text;
      session.step = "login";
      bot.sendMessage(chatId, "Введите логин для входа на сайт:");
      return;
    }

    if (session.step === "login") {
      session.data.login = text;
      session.step = "password";
      bot.sendMessage(chatId, "Введите пароль:");
      return;
    }

    if (session.step === "password") {
      session.data.password = text;
      const ownerId = createId();
      const companyId = createId();
      const updated = updateData((draft) => {
        const inviteCode = generateInviteCode(draft.companies);
        draft.companies.push({
          id: companyId,
          name: session.data.companyName,
          inviteCode,
          ownerId,
        });
        draft.owners.push({
          id: ownerId,
          telegramId,
          login: session.data.login,
          password: session.data.password,
          companyId,
        });
        return draft;
      });

      const company = updated.companies.find((item) => item.id === companyId);
      bot.sendMessage(
        chatId,
        `Регистрация завершена!\nИнвайт-код: ${company.inviteCode}\nЛогин: ${session.data.login}`
      );
      bot.sendMessage(chatId, "Раздел владельца:", OWNER_MENU);
      resetSession(telegramId);
      return;
    }
  }

  if (session.role === "login") {
    if (session.step === "login") {
      session.data.login = text;
      session.step = "password";
      bot.sendMessage(chatId, "Введите пароль:");
      return;
    }

    if (session.step === "password") {
      session.data.password = text;
      const owner = data.owners.find(
        (item) =>
          item.login === session.data.login &&
          item.password === session.data.password
      );

      if (!owner) {
        bot.sendMessage(chatId, "Неверный логин или пароль.");
        resetSession(telegramId);
        return;
      }

      const company = data.companies.find((item) => item.id === owner.companyId);
      const companyName = company ? company.name : "(не найдена)";
      const inviteCode = company ? company.inviteCode : "—";
      bot.sendMessage(
        chatId,
        `Вход выполнен!\nКомпания: ${companyName}\nИнвайт-код: ${inviteCode}`
      );
      bot.sendMessage(chatId, "Раздел владельца:", OWNER_MENU);
      resetSession(telegramId);
      return;
    }
  }

  if (session.role === "employee") {
    if (session.step === "invite") {
      const company = data.companies.find(
        (item) => item.inviteCode.toLowerCase() === text.toLowerCase()
      );
      if (!company) {
        bot.sendMessage(chatId, "Инвайт-код не найден. Попробуйте ещё раз:");
        return;
      }
      session.data.companyId = company.id;
      session.step = "name";
      bot.sendMessage(chatId, "Введите ваше имя:");
      return;
    }

    if (session.step === "name") {
      const employeeId = createId();
      updateData((draft) => {
        draft.employees.push({
          id: employeeId,
          telegramId,
          name: text,
          companyId: session.data.companyId,
        });
        return draft;
      });
      bot.sendMessage(chatId, "Вы успешно зарегистрированы!");
      resetSession(telegramId);
      sendEmployeeMenu(chatId);
      return;
    }
  }
});

console.log("staff-bot started");
