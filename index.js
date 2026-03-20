const TelegramBot = require('node-telegram-bot-api');

const TOKEN = process.env.BOT_TOKEN || '8797406782:AAG48TbYoo8Use3FqUmA2zLFI0cI5AB5XgY';
const bot = new TelegramBot(TOKEN, { polling: true });

// Base de datos en memoria
const drivers = {}; // conductores registrados
const pendingRides = {}; // viajes pendientes
const activeRides = {}; // viajes activos

// ══════════════════════════════════════
//  INICIO
// ══════════════════════════════════════
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name;

  bot.sendMessage(chatId, 
    `🚗 *¡Bienvenido a Taxi Irapuato, ${name}!*\n\n` +
    `¿Qué eres tú?\n\n` +
    `👤 Soy *pasajero* → quiero un taxi\n` +
    `🚗 Soy *conductor* → quiero trabajar`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '👤 Soy Pasajero', callback_data: 'role_passenger' },
            { text: '🚗 Soy Conductor', callback_data: 'role_driver' }
          ]
        ]
      }
    }
  );
});

// ══════════════════════════════════════
//  SELECCIÓN DE ROL
// ══════════════════════════════════════
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const name = query.from.first_name;

  // --- REGISTRO CONDUCTOR ---
  if (data === 'role_driver') {
    drivers[chatId] = {
      id: chatId,
      name: name,
      available: false,
      username: query.from.username || name
    };
    bot.sendMessage(chatId,
      `✅ *¡Registrado como conductor, ${name}!*\n\n` +
      `Cuando quieras recibir viajes, activa tu disponibilidad:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🟢 Activarme (recibir viajes)', callback_data: 'driver_online' }]
          ]
        }
      }
    );
  }

  // --- CONDUCTOR EN LÍNEA ---
  if (data === 'driver_online') {
    if (drivers[chatId]) {
      drivers[chatId].available = true;
      const onlineCount = Object.values(drivers).filter(d => d.available).length;
      bot.sendMessage(chatId,
        `🟢 *¡Estás en línea!*\n\n` +
        `Conductores activos ahora: *${onlineCount}*\n\n` +
        `Te avisaré cuando llegue un viaje. 🚗`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔴 Desconectarme', callback_data: 'driver_offline' }]
            ]
          }
        }
      );
    }
  }

  // --- CONDUCTOR FUERA DE LÍNEA ---
  if (data === 'driver_offline') {
    if (drivers[chatId]) {
      drivers[chatId].available = false;
      bot.sendMessage(chatId,
        `🔴 *Te desconectaste.*\n\nHasta luego, ${name}! 👋\n\nCuando quieras volver:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🟢 Volver a conectarme', callback_data: 'driver_online' }]
            ]
          }
        }
      );
    }
  }

  // --- PASAJERO PIDE VIAJE ---
  if (data === 'role_passenger') {
    bot.sendMessage(chatId,
      `👤 *¡Hola ${name}!*\n\n📍 ¿Desde dónde te recogemos?\n\n_Escribe tu ubicación o colonia:_`,
      { parse_mode: 'Markdown' }
    );
    pendingRides[chatId] = { step: 'waiting_origin', name: name };
  }

  // --- CONDUCTOR ACEPTA VIAJE ---
  if (data.startsWith('accept_')) {
    const passengerId = parseInt(data.split('_')[1]);
    const ride = pendingRides[passengerId];

    if (!ride) {
      bot.sendMessage(chatId, '⚠️ Este viaje ya fue tomado por otro conductor.');
      return;
    }

    // Marcar viaje como tomado
    activeRides[passengerId] = {
      driverId: chatId,
      driverName: name,
      passengerName: ride.name
    };
    delete pendingRides[passengerId];

    // Avisar al conductor
    bot.sendMessage(chatId,
      `✅ *¡Viaje aceptado!*\n\n` +
      `👤 Pasajero: *${ride.name}*\n` +
      `📍 Origen: *${ride.origin}*\n` +
      `🏁 Destino: *${ride.destination}*\n\n` +
      `El pasajero ya fue notificado. ¡Buen viaje! 🚗`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Viaje completado', callback_data: `complete_${passengerId}` }]
          ]
        }
      }
    );

    // Avisar al pasajero
    const driverInfo = drivers[chatId];
    bot.sendMessage(passengerId,
      `🎉 *¡Conductor encontrado!*\n\n` +
      `🚗 Conductor: *${name}*\n` +
      `📞 Contacto: @${driverInfo?.username || name}\n\n` +
      `_Ya va en camino a recogerte_ 🚗💨`,
      { parse_mode: 'Markdown' }
    );

    // Avisar a otros conductores que ya fue tomado
    Object.values(drivers).forEach(driver => {
      if (driver.available && driver.id !== chatId) {
        bot.sendMessage(driver.id,
          `ℹ️ El viaje de ${ride.name} ya fue tomado.`
        );
      }
    });
  }

  // --- VIAJE COMPLETADO ---
  if (data.startsWith('complete_')) {
    const passengerId = parseInt(data.split('_')[1]);
    delete activeRides[passengerId];

    bot.sendMessage(chatId,
      `✅ *¡Viaje completado!*\n\nGracias por tu servicio. 💰\n\n¿Quieres seguir recibiendo viajes?`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🟢 Seguir recibiendo viajes', callback_data: 'driver_online' }]
          ]
        }
      }
    );

    bot.sendMessage(passengerId,
      `⭐ *¡Llegaste a tu destino!*\n\n¿Cómo estuvo tu viaje?\n\n_Gracias por usar Taxi Irapuato_ 🙏`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '⭐⭐⭐⭐⭐ Excelente', callback_data: 'rate_5' },
              { text: '⭐⭐⭐ Regular', callback_data: 'rate_3' }
            ]
          ]
        }
      }
    );
  }

  // --- CALIFICACIÓN ---
  if (data.startsWith('rate_')) {
    bot.sendMessage(chatId,
      `🙏 *¡Gracias por tu calificación!*\n\nNos vemos en tu próximo viaje. 🚗`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚗 Pedir otro viaje', callback_data: 'role_passenger' }]
          ]
        }
      }
    );
  }

  bot.answerCallbackQuery(query.id);
});

// ══════════════════════════════════════
//  FLUJO DE CONVERSACIÓN - PASAJERO
// ══════════════════════════════════════
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/')) return;

  const ride = pendingRides[chatId];
  if (!ride) return;

  // PASO 1: Recibir origen
  if (ride.step === 'waiting_origin') {
    pendingRides[chatId].origin = text;
    pendingRides[chatId].step = 'waiting_destination';
    bot.sendMessage(chatId,
      `📍 Origen: *${text}*\n\n🏁 ¿A dónde vas?\n\n_Escribe tu destino:_`,
      { parse_mode: 'Markdown' }
    );
  }

  // PASO 2: Recibir destino y buscar conductor
  else if (ride.step === 'waiting_destination') {
    pendingRides[chatId].destination = text;
    pendingRides[chatId].step = 'searching';

    const availableDrivers = Object.values(drivers).filter(d => d.available);

    if (availableDrivers.length === 0) {
      bot.sendMessage(chatId,
        `😔 *No hay conductores disponibles ahora.*\n\nIntenta en unos minutos. ⏳`,
        { parse_mode: 'Markdown' }
      );
      delete pendingRides[chatId];
      return;
    }

    bot.sendMessage(chatId,
      `🔍 *Buscando conductor...*\n\n` +
      `📍 Origen: *${ride.origin}*\n` +
      `🏁 Destino: *${text}*\n\n` +
      `_Hay ${availableDrivers.length} conductores disponibles. Te avisamos cuando acepten._ ⏳`,
      { parse_mode: 'Markdown' }
    );

    // Avisar a todos los conductores disponibles
    availableDrivers.forEach(driver => {
      bot.sendMessage(driver.id,
        `🚨 *¡NUEVO VIAJE!*\n\n` +
        `👤 Pasajero: *${ride.name}*\n` +
        `📍 Origen: *${ride.origin}*\n` +
        `🏁 Destino: *${text}*\n\n` +
        `⚡ ¿Aceptas el viaje?`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Aceptar viaje', callback_data: `accept_${chatId}` }]
            ]
          }
        }
      );
    });
  }
});

// ══════════════════════════════════════
//  COMANDO /conductores - ver activos
// ══════════════════════════════════════
bot.onText(/\/conductores/, (msg) => {
  const chatId = msg.chat.id;
  const online = Object.values(drivers).filter(d => d.available);
  
  if (online.length === 0) {
    bot.sendMessage(chatId, '😔 No hay conductores conectados ahora.');
    return;
  }

  const list = online.map((d, i) => `${i+1}. 🟢 ${d.name}`).join('\n');
  bot.sendMessage(chatId,
    `🚗 *Conductores disponibles: ${online.length}*\n\n${list}`,
    { parse_mode: 'Markdown' }
  );
});

console.log('🚗 Bot de Taxi Irapuato iniciado...');
