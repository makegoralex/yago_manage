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
    keyboard: [["Профиль", "Рецепты"], ["График", "На смене"], ["Закончить смену"]],
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

const DEFAULT_REPORT_CONFIG = {
  templates: [],
  rules: [],
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

const normalizeReportConfig = (company) => {
  if (!company || !company.reportConfig) {
    return { ...DEFAULT_REPORT_CONFIG };
  }
  return {
    templates: Array.isArray(company.reportConfig.templates) ? company.reportConfig.templates : [],
    rules: Array.isArray(company.reportConfig.rules) ? company.reportConfig.rules : [],
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

const formatDateTime = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
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
  rows.push(["Отменить запись"]);
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

const buildCancelKeyboard = (labels) => {
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

const buildEmployeeBookingOptions = (bookings, schedule) =>
  bookings.map((item) => {
    const shiftLabel = getShiftLabel(schedule, item.dayIndex, item.shiftId);
    return `${item.date} ${shiftLabel}`;
  });

const getActiveShift = (data, companyId, employeeId) =>
  data.shiftStatuses.find(
    (item) =>
      item.companyId === companyId &&
      item.employeeId === employeeId &&
      !item.endedAt
  );

const notifyOwnerReportStatus = (data, companyId, message) => {
  const owner = data.owners.find((item) => item.companyId === companyId);
  if (!owner || !owner.telegramId) {
    return;
  }
  bot.sendMessage(owner.telegramId, message);
};

const notifyOwnerCancellation = (data, companyId, message) => {
  const owner = data.owners.find((item) => item.companyId === companyId);
  if (!owner || !owner.telegramId) {
    return;
  }
  bot.sendMessage(owner.telegramId, message);
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

const createReportSubmission = (data, companyId, employeeId, rule, templateId, dueAt, status, shiftStatusId) =>
  updateData((draft) => {
    draft.reportSubmissions.push({
      id: createId(),
      companyId,
      employeeId,
      ruleId: rule.id,
      templateId,
      status,
      dueAt: dueAt.toISOString(),
      shiftStatusId,
      date: new Date().toISOString(),
      answers: [],
      photos: [],
    });
    return draft;
  });

const ensurePendingReport = (data, companyId, employeeId, reportConfig) => {
  const pending = data.reportSubmissions.find(
    (item) =>
      item.companyId === companyId &&
      item.employeeId === employeeId &&
      (item.status === "pending" || item.status === "pending_late")
  );
  if (pending) {
    return pending;
  }

  const activeShift = getActiveShift(data, companyId, employeeId);
  if (!activeShift) {
    return null;
  }

  const rules = reportConfig.rules;
  const now = new Date();

  const createIfDue = (rule, baseTime) => {
    const template = reportConfig.templates.find((item) => item.id === rule.templateId);
    if (!template) {
      return null;
    }
    const submissions = data.reportSubmissions.filter(
      (item) =>
        item.companyId === companyId &&
        item.employeeId === employeeId &&
        item.ruleId === rule.id &&
        item.shiftStatusId === activeShift.id &&
        item.status !== "cancelled"
    );
    if (submissions.some((item) => item.status === "pending" || item.status === "pending_late")) {
      return null;
    }
    if (rule.trigger !== "periodic" && submissions.length) {
      return null;
    }
    const dueAt = new Date(baseTime.getTime() + rule.offsetMinutes * 60000);
    if (now < dueAt) {
      return null;
    }
    const windowMinutes = rule.windowMinutes || 0;
    const isLate = windowMinutes ? now > new Date(dueAt.getTime() + windowMinutes * 60000) : false;
    const created = createReportSubmission(
      data,
      companyId,
      employeeId,
      rule,
      template.id,
      dueAt,
      isLate ? "pending_late" : "pending",
      activeShift.id
    );
    return created.reportSubmissions[created.reportSubmissions.length - 1];
  };

  const startRules = rules.filter((rule) => rule.trigger === "start");
  for (const rule of startRules) {
    const submission = createIfDue(rule, new Date(activeShift.startedAt));
    if (submission) {
      return submission;
    }
  }

  if (activeShift.endedAt) {
    const endRules = rules.filter((rule) => rule.trigger === "end");
    for (const rule of endRules) {
      const submission = createIfDue(rule, new Date(activeShift.endedAt));
      if (submission) {
        return submission;
      }
    }
  }

  const periodicRules = rules.filter((rule) => rule.trigger === "periodic");
  for (const rule of periodicRules) {
    const template = reportConfig.templates.find((item) => item.id === rule.templateId);
    if (!template) {
      continue;
    }
    const submissions = data.reportSubmissions.filter(
      (item) =>
        item.companyId === companyId &&
        item.employeeId === employeeId &&
        item.ruleId === rule.id &&
        item.shiftStatusId === activeShift.id &&
        item.status !== "cancelled"
    );
    const lastSubmission = submissions
      .filter((item) => item.submittedAt)
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0];
    const baseTime = lastSubmission ? new Date(lastSubmission.submittedAt) : new Date(activeShift.startedAt);
    const dueAt = new Date(baseTime.getTime() + rule.intervalMinutes * 60000);
    if (now >= dueAt) {
      const windowMinutes = rule.windowMinutes || 0;
      const isLate = windowMinutes ? now > new Date(dueAt.getTime() + windowMinutes * 60000) : false;
      const created = createReportSubmission(
        data,
        companyId,
        employeeId,
        rule,
        template.id,
        dueAt,
        isLate ? "pending_late" : "pending",
        activeShift.id
      );
      return created.reportSubmissions[created.reportSubmissions.length - 1];
    }
  }
  return null;
};

const handleReportFlow = (session, msg, data, companyId, employeeId) => {
  const chatId = msg.chat.id;
  const submissionId = session.reportSubmissionId;
  if (!submissionId || !session.reportTemplate) {
    return false;
  }
  const template = session.reportTemplate;

  if (session.step === "report-item") {
    if (!msg.text) {
      bot.sendMessage(chatId, "Ответьте текстом на пункт чек-листа.");
      return true;
    }
    session.reportAnswers.push(msg.text.trim());
    session.reportIndex += 1;
    if (session.reportIndex < template.items.length) {
      bot.sendMessage(chatId, template.items[session.reportIndex]);
      return true;
    }
    if (template.requirePhoto) {
      session.step = "report-photo";
      bot.sendMessage(chatId, "Пришлите фотоотчёт.");
      return true;
    }
    const submittedAt = new Date().toISOString();
    let finalStatus = "submitted";
    updateData((draft) => {
      const target = draft.reportSubmissions.find((item) => item.id === submissionId);
      if (target) {
        target.answers = session.reportAnswers;
        finalStatus = target.status === "pending_late" ? "late" : "submitted";
        target.status = finalStatus;
        target.submittedAt = submittedAt;
      }
      return draft;
    });
    notifyOwnerReportStatus(
      data,
      companyId,
      `Отчёт сотрудника отправлен: ${template.name}. Статус: ${finalStatus}.`
    );
    bot.sendMessage(chatId, "Отчёт отправлен. Спасибо!");
    session.view = null;
    session.step = null;
    session.reportSubmissionId = null;
    session.reportTemplate = null;
    session.reportAnswers = null;
    session.reportIndex = null;
    sendEmployeeMenu(chatId);
    return true;
  }

  if (session.step === "report-photo") {
    if (!msg.photo || !msg.photo.length) {
      bot.sendMessage(chatId, "Нужно отправить фото.");
      return true;
    }
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const submittedAt = new Date().toISOString();
    let finalStatus = "submitted";
    updateData((draft) => {
      const target = draft.reportSubmissions.find((item) => item.id === submissionId);
      if (target) {
        target.answers = session.reportAnswers;
        target.photos = [fileId];
        finalStatus = target.status === "pending_late" ? "late" : "submitted";
        target.status = finalStatus;
        target.submittedAt = submittedAt;
      }
      return draft;
    });
    notifyOwnerReportStatus(
      data,
      companyId,
      `Отчёт сотрудника с фото отправлен: ${template.name}. Статус: ${finalStatus}.`
    );
    bot.sendMessage(chatId, "Отчёт отправлен. Спасибо!");
    session.view = null;
    session.step = null;
    session.reportSubmissionId = null;
    session.reportTemplate = null;
    session.reportAnswers = null;
    session.reportIndex = null;
    sendEmployeeMenu(chatId);
    return true;
  }

  return false;
};

const startReportFlow = (session, chatId, reportConfig, submission) => {
  const template = reportConfig.templates.find((item) => item.id === submission.templateId);
  if (!template) {
    bot.sendMessage(chatId, "Шаблон отчёта не найден.");
    return false;
  }
  session.view = "report";
  session.step = "report-item";
  session.reportSubmissionId = submission.id;
  session.reportTemplate = template;
  session.reportAnswers = [];
  session.reportIndex = 0;
  bot.sendMessage(chatId, `Отчёт: ${template.name}\nОтветьте на чек-лист.`);
  bot.sendMessage(chatId, template.items[0]);
  return true;
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
    (item) =>
      item.companyId === companyId &&
      item.employeeId === employeeId &&
      item.status !== "cancelled" &&
      item.status !== "declined"
  );
  const upcomingSummary = buildEmployeeBookingSummary(employeeBookings, schedule);
  bot.sendMessage(chatId, `Ваши смены:\n${upcomingSummary}`);

  session.view = "schedule";
  session.step = "schedule-date";
  session.employeeBookings = employeeBookings;
  session.cancelOptions = new Map(
    buildEmployeeBookingOptions(employeeBookings, schedule).map((label, index) => [
      label,
      employeeBookings[index],
    ])
  );
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
    session.employeeBookings = null;
    session.cancelOptions = null;
    session.cancelTarget = null;
    sendEmployeeMenu(chatId);
    return true;
  }

  if (text === "Отменить запись") {
    if (!session.cancelOptions || !session.cancelOptions.size) {
      bot.sendMessage(chatId, "У вас нет активных записей для отмены.");
      return true;
    }
    session.step = "cancel-select";
    bot.sendMessage(chatId, "Выберите смену для отмены:", buildCancelKeyboard([...session.cancelOptions.keys()]));
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
        const available = Math.max(shift.slots - counts.approved, 0);
        const label =
          available > 0
            ? `${shift.start}-${shift.end} (свободно: ${available}, занято: ${counts.approved}, ожидание: ${counts.pending})`
            : `${shift.start}-${shift.end} (мест нет, занято: ${counts.approved}, ожидание: ${counts.pending})`;
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
        item.status !== "declined" &&
        item.status !== "cancelled"
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

  if (session.step === "cancel-select") {
    if (text === "Назад") {
      session.step = "schedule-date";
      bot.sendMessage(
        chatId,
        "Выберите дату для просмотра смен:",
        buildDateKeyboard([...session.scheduleDates.keys()])
      );
      return true;
    }
    if (!session.cancelOptions || !session.cancelOptions.has(text)) {
      return false;
    }
    session.cancelTarget = session.cancelOptions.get(text);
    session.step = "cancel-reason";
    bot.sendMessage(chatId, "Укажите причину отмены смены:");
    return true;
  }

  if (session.step === "cancel-reason") {
    if (!session.cancelTarget) {
      session.step = "schedule-date";
      bot.sendMessage(chatId, "Не удалось найти запись для отмены. Попробуйте ещё раз.");
      return true;
    }
    const reason = text;
    const bookingId = session.cancelTarget.id;
    updateData((draft) => {
      const target = draft.bookings.find((item) => item.id === bookingId);
      if (target) {
        target.status = "cancelled";
        target.cancelReason = reason;
        target.cancelledAt = new Date().toISOString();
      }
      return draft;
    });
    notifyOwnerCancellation(
      data,
      companyId,
      `Сотрудник отменил смену ${session.cancelTarget.date} ${getShiftLabel(
        schedule,
        session.cancelTarget.dayIndex,
        session.cancelTarget.shiftId
      )}.\nПричина: ${reason}`
    );
    bot.sendMessage(chatId, "Запись отменена. Слот освобождён.");
    session.view = null;
    session.step = null;
    session.scheduleDates = null;
    session.scheduleShifts = null;
    session.employeeBookings = null;
    session.cancelOptions = null;
    session.cancelTarget = null;
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
  const hasText = typeof msg.text === "string";
  const hasPhoto = msg.photo && msg.photo.length;
  if ((!hasText && !hasPhoto) || (hasText && msg.text.startsWith("/"))) {
    return;
  }

  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const text = hasText ? msg.text.trim() : "";
  const session = getSession(telegramId);
  const data = readData();

  const existingEmployee = findEmployeeByTelegramId(data, telegramId);
  const existingOwner = existingEmployee ? null : findOwnerByTelegramId(data, telegramId);
  if (existingEmployee) {
    const company = data.companies.find((item) => item.id === existingEmployee.companyId);
    const reportConfig = normalizeReportConfig(company);
    if (session.view === "report") {
      if (handleReportFlow(session, msg, data, existingEmployee.companyId, existingEmployee.id)) {
        return;
      }
    }
    const pendingReport = ensurePendingReport(
      data,
      existingEmployee.companyId,
      existingEmployee.id,
      reportConfig
    );
    if (pendingReport) {
      if (session.view !== "report") {
        startReportFlow(session, chatId, reportConfig, pendingReport);
      }
      return;
    }
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

    if (text === "На смене") {
      const activeShift = getActiveShift(data, existingEmployee.companyId, existingEmployee.id);
      if (activeShift) {
        bot.sendMessage(chatId, "Смена уже начата.");
        return;
      }
      updateData((draft) => {
        draft.shiftStatuses.push({
          id: createId(),
          companyId: existingEmployee.companyId,
          employeeId: existingEmployee.id,
          startedAt: new Date().toISOString(),
          endedAt: null,
        });
        return draft;
      });
      bot.sendMessage(chatId, "Смена начата. Проверьте отчёты.");
      const refreshed = readData();
      const pending = ensurePendingReport(
        refreshed,
        existingEmployee.companyId,
        existingEmployee.id,
        reportConfig
      );
      if (pending) {
        startReportFlow(session, chatId, reportConfig, pending);
      }
      return;
    }

    if (text === "Закончить смену") {
      const activeShift = getActiveShift(data, existingEmployee.companyId, existingEmployee.id);
      if (!activeShift) {
        bot.sendMessage(chatId, "У вас нет активной смены.");
        return;
      }
      updateData((draft) => {
        const target = draft.shiftStatuses.find((item) => item.id === activeShift.id);
        if (target) {
          target.endedAt = new Date().toISOString();
        }
        return draft;
      });
      bot.sendMessage(chatId, "Смена завершена. Проверьте отчёты.");
      const refreshed = readData();
      const pending = ensurePendingReport(
        refreshed,
        existingEmployee.companyId,
        existingEmployee.id,
        reportConfig
      );
      if (pending) {
        startReportFlow(session, chatId, reportConfig, pending);
      }
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
