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
    keyboard: [["Профиль", "Рецепты"]],
    resize_keyboard: true,
  },
};

const ROLE_MENU = {
  reply_markup: {
    keyboard: [["Я владелец", "Я сотрудник"]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
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

bot.onText(/\/start/, (msg) => {
  const telegramId = msg.from.id;
  const data = readData();
  const owner = findOwnerByTelegramId(data, telegramId);
  if (owner) {
    const company = data.companies.find((item) => item.id === owner.companyId);
    const companyName = company ? company.name : "(не найдена)";
    const inviteCode = company ? company.inviteCode : "—";
    bot.sendMessage(
      msg.chat.id,
      `Вы уже зарегистрированы как владелец.\nКомпания: ${companyName}\nИнвайт-код: ${inviteCode}`
    );
    return;
  }

  const employee = findEmployeeByTelegramId(data, telegramId);
  if (employee) {
    sendEmployeeMenu(msg.chat.id);
    return;
  }

  resetSession(telegramId);
  bot.sendMessage(msg.chat.id, "Кто вы?", ROLE_MENU);
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
  if (existingEmployee) {
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
      bot.sendMessage(
        chatId,
        "Раздел рецептов в разработке. Пока тут пусто.",
        {
          reply_markup: {
            keyboard: [["Назад"]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
      return;
    }

    if (text === "Назад") {
      sendEmployeeMenu(chatId);
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
