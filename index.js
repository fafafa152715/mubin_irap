const TelegramBot = require('node-telegram-bot-api');

const TOKEN = process.env.BOT_TOKEN || '8797406782:AAG48TbYoo8Use3FqUmA2zLFI0cI5AB5XgY';
const bot = new TelegramBot(TOKEN, { polling: true });

const drivers = {};
const pendingRides = {};
const activeRides = {};
const waitingPrice = {}; // conductor esperando escribir precio

const stats = {
  totalRides: 0,
  cancelledRides: 0,
  driverStats: {},
  destinations: {},
  hourlyRides: {},
};

function addStat(driverId, driverName, destination) {
  stats.totalRides++;
  if (!stats.driverStats[driverId]) {
    stats.driverStats[driverId] = { name: driverName, count: 0 };
  }
  stats.driverStats[driverId].count++;
  stats.destinations[destination] = (stats.destinations[destination] || 0) + 1;
  const hour = new Date().getHours();
  stats.hourlyRides[hour] = (stats.hourlyRides[hour] || 0) + 1;
}

function getTopDriver() {
  const entries = Object.values(stats.driverStats);
  if (entries.length === 0) return 'Sin datos';
  entries.sort((a, b) => b.count - a.count);
  return `${entries[0].name} (${entries[0].count} viajes)`;
}

function getTopDestination() {
  const entries = Object.entries(stats.destinations);
  if (entries.length === 0) return 'Sin datos';
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function getPeakHour() {
  const entries = Object.entries(stats.hourlyRides);
  if (entries.length === 0) return 'Sin datos';
  entries.sort((a, b) => b[1] - a[1]);
  return `${entries[0][0]}:00 hrs`;
}

// ══════════════════════════════════════
//  INICIO
// ══════════════════════════════════════
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name;

  bot.sendMessage(chatId,
    `🚗 *¡Bienvenido a Mubi Irapuato, ${name}!*\n\n¿Qué eres tú?`,
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
//  ESTADÍSTICAS
// ══════════════════════════════════════
bot.onText(/\/estadisticas/, (msg) => {
  const chatId = msg.chat.id;
  const onlineDrivers = Object.values(drivers).filter(d => d.available).length;

  bot.sendMessage(chatId,
    `📊 *Estadísticas de Mubi Irapuato*\n\n` +
    `🚗 Viajes completados: *${stats.totalRides}*\n` +
    `❌ Viajes cancelados: *${stats.cancelledRides}*\n` +
    `🟢 Conductores activos ahora: *${onlineDrivers}*\n` +
    `🏆 Mejor conductor: *${getTopDriver()}*\n` +
    `📍 Destino más popular: *${getTopDestination()}*\n` +
    `⏰ Hora pico: *${getPeakHour()}*\n` +
    `💰 Total viajes hoy: *${stats.totalRides}*`,
    { parse_mode: 'Markdown' }
  );
});

// ══════════════════════════════════════
//  CONDUCTORES ACTIVOS
// ══════════════════════════════════════
bot.onText(/\/conductores/, (msg) => {
  const chatId = msg.chat.id;
  const online = Object.values(drivers).filter(d => d.available);

  if (online.length === 0) {
    bot.sendMessage(chatId, '😔 No hay conductores conectados ahora.');
    return;
  }

  const list = online.map((d, i) => `${i + 1}. 🟢 ${d.name}`).join('\n');
  bot.sendMessage(chatId,
    `🚗 *Conductores disponibles: ${online.length}*\n\n${list}`,
    { parse_mode: 'Markdown' }
  );
});

// ══════════════════════════════════════
//  CALLBACKS
// ══════════════════════════════════════
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const name = query.from.first_name;

  // REGISTRO CONDUCTOR
  if (data === 'role_driver') {
    drivers[chatId] = {
      id: chatId,
      name: name,
      available: false,
      username: query.from.username || name
    };
    bot.sendMessage(chatId,
      `✅ *¡Registrado como conductor, ${name}!*\n\nActívate cuando quieras trabajar:`,
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

  // CONDUCTOR EN LÍNEA
  if (data === 'driver_online') {
    if (drivers[chatId]) {
      drivers[chatId].available = true;
      const onlineCount = Object.values(drivers).filter(d => d.available).length;
      bot.sendMessage(chatId,
        `🟢 *¡Estás en línea!*\n\nConductores activos ahora: *${onlineCount}*\n\nTe avisaré cuando llegue un viaje. 🚗`,
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

  // CONDUCTOR FUERA DE LÍNEA
  if (data === 'driver_offline') {
    if (drivers[chatId]) {
      drivers[chatId].available = false;
      bot.sendMessage(chatId,
        `🔴 *Te desconectaste.*\n\nHasta luego! 👋`,
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

  // PASAJERO
  if (data === 'role_passenger') {
    bot.sendMessage(chatId,
      `👤 *¡Hola ${name}!*\n\n📍 ¿Desde dónde te recogemos?\n\n_Escribe tu colonia o dirección:_`,
      { parse_mode: 'Markdown' }
    );
    pendingRides[chatId] = { step: 'waiting_origin', name: name };
  }

  // CONDUCTOR ACEPTA VIAJE
  if (data.startsWith('accept_')) {
    const passengerId = parseInt(data.split('_')[1]);
    const ride = pendingRides[passengerId];

    if (!ride) {
      bot.sendMessage(chatId, '⚠️ Este viaje ya fue tomado por otro conductor.');
      bot.answerCallbackQuery(query.id);
      return;
    }

    // Guardar que este conductor está esperando escribir el precio
    waitingPrice[chatId] = {
      passengerId: passengerId,
      passengerName: ride.name,
      origin: ride.origin,
      destination: ride.destination
    };

    // Pedir precio al conductor
    bot.sendMessage(chatId,
      `✅ *¡Viaje aceptado!*\n\n` +
      `👤 Pasajero: *${ride.name}*\n` +
      `📍 Origen: *${ride.origin}*\n` +
      `🏁 Destino: *${ride.destination}*\n\n` +
      `💰 *¿Cuánto cobras por este viaje?*\n\n_Escribe solo el número, ejemplo: 50_`,
      { parse_mode: 'Markdown' }
    );

    // Avisar a otros conductores que ya fue tomado
    Object.values(drivers).forEach(driver => {
      if (driver.available && driver.id !== chatId) {
        bot.sendMessage(driver.id, `ℹ️ El viaje de ${ride.name} ya fue tomado.`);
      }
    });
  }

  // PASAJERO ACEPTA PRECIO
  if (data.startsWith('price_accept_')) {
    const parts = data.split('_');
    const driverId = parseInt(parts[2]);
    const passengerId = parseInt(parts[3]);
    const price = parts[4];
    const ride = pendingRides[passengerId];

    delete pendingRides[passengerId];

    activeRides[passengerId] = {
      driverId: driverId,
      driverName: drivers[driverId]?.name || 'Conductor',
      passengerName: ride?.name || 'Pasajero',
      destination: waitingPrice[driverId]?.destination || ''
    };
    delete waitingPrice[driverId];

    // Confirmar al conductor
    bot.sendMessage(driverId,
      `✅ *¡Pasajero aceptó el precio de $${price}!*\n\n` +
      `Ve a recoger a *${ride?.name}*\n` +
      `📍 En: *${waitingPrice[driverId]?.origin || ''}*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Ya recogí al pasajero', callback_data: `picked_${passengerId}` }],
            [{ text: '❌ Cancelar viaje', callback_data: `cancel_${passengerId}` }]
          ]
        }
      }
    );

    // Confirmar al pasajero
    const driverInfo = drivers[driverId];
    bot.sendMessage(passengerId,
      `🎉 *¡Confirmado!*\n\n` +
      `🚗 Conductor: *${driverInfo?.name || 'Conductor'}*\n` +
      `📞 Contacto: @${driverInfo?.username || driverInfo?.name}\n` +
      `💰 Precio acordado: *$${price} pesos*\n\n` +
      `_Ya va en camino a recogerte_ 🚗💨`,
      { parse_mode: 'Markdown' }
    );
  }

  // PASAJERO RECHAZA PRECIO
  if (data.startsWith('price_reject_')) {
    const parts = data.split('_');
    const driverId = parseInt(parts[2]);
    const passengerId = parseInt(parts[3]);

    delete waitingPrice[driverId];

    bot.sendMessage(driverId,
      `😔 *El pasajero rechazó el precio.*\n\n`,
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
      `😔 *El conductor no llegó a un acuerdo contigo.*\n\n¿Quieres intentar de nuevo?`,
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

  // CONDUCTOR RECOGIÓ AL PASAJERO
  if (data.startsWith('picked_')) {
    const passengerId = parseInt(data.split('_')[1]);
    const ride = activeRides[passengerId];

    bot.sendMessage(chatId,
      `🚗 *¡Viaje en progreso!*\n\n` +
      `🏁 Destino: *${ride?.destination || ''}*\n\n` +
      `_Toca "Finalizar viaje" cuando lleguen_`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏁 Finalizar viaje', callback_data: `complete_${passengerId}` }]
          ]
        }
      }
    );

    bot.sendMessage(passengerId,
      `🚗 *¡Ya vas en camino!*\n\nDisfruta tu viaje 😊`,
      { parse_mode: 'Markdown' }
    );
  }

  // VIAJE COMPLETADO
  if (data.startsWith('complete_')) {
    const passengerId = parseInt(data.split('_')[1]);
    const ride = activeRides[passengerId];

    if (ride) {
      addStat(chatId, name, ride.destination);
      delete activeRides[passengerId];
    }

    bot.sendMessage(chatId,
      `✅ *¡Viaje completado!*\n\n` +
      `💰 ¡Gracias por tu servicio!\n` +
      `Viajes completados: *${stats.driverStats[chatId]?.count || 1}*`,
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
      `⭐ *¡Llegaste a tu destino!*\n\n¿Cómo estuvo tu viaje?`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '⭐⭐⭐⭐⭐ Excelente', callback_data: 'rate_5' },
              { text: '⭐⭐⭐ Regular', callback_data: 'rate_3' },
              { text: '⭐ Malo', callback_data: 'rate_1' }
            ]
          ]
        }
      }
    );
  }

  // CANCELAR VIAJE
  if (data.startsWith('cancel_')) {
    const passengerId = parseInt(data.split('_')[1]);
    stats.cancelledRides++;
    delete activeRides[passengerId];

    bot.sendMessage(chatId,
      `❌ *Viaje cancelado.*`,
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
      `😔 *El conductor canceló el viaje.*\n\n¿Quieres intentar de nuevo?`,
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

  // CALIFICACIÓN
  if (data.startsWith('rate_')) {
    const stars = data.split('_')[1];
    const emojis = { '5': '🌟', '3': '😊', '1': '😔' };
    bot.sendMessage(chatId,
      `${emojis[stars]} *¡Gracias por calificar!*\n\nNos vemos en tu próximo viaje. 🚗`,
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
//  MENSAJES DE TEXTO
// ══════════════════════════════════════
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/')) return;

  // CONDUCTOR ESCRIBE EL PRECIO
  if (waitingPrice[chatId]) {
    const price = text.replace(/[^0-9]/g, '');
    if (!price) {
      bot.sendMessage(chatId, '⚠️ Escribe solo el número del precio, ejemplo: *50*', { parse_mode: 'Markdown' });
      return;
    }

    const info = waitingPrice[chatId];
    const passengerId = info.passengerId;

    // Mandar precio al pasajero para que acepte o rechace
    bot.sendMessage(passengerId,
      `💰 *El conductor propone cobrarte:*\n\n` +
      `📍 Origen: *${info.origin}*\n` +
      `🏁 Destino: *${info.destination}*\n` +
      `💵 Precio: *$${price} pesos*\n\n` +
      `¿Aceptas?`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Aceptar', callback_data: `price_accept_${chatId}_${passengerId}_${price}` },
              { text: '❌ Rechazar', callback_data: `price_reject_${chatId}_${passengerId}` }
            ]
          ]
        }
      }
    );

    bot.sendMessage(chatId,
      `⏳ *Esperando respuesta del pasajero...*\n\nPropusiste: *$${price} pesos*`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // FLUJO PASAJERO
  const ride = pendingRides[chatId];
  if (!ride) return;

  if (ride.step === 'waiting_origin') {
    pendingRides[chatId].origin = text;
    pendingRides[chatId].step = 'waiting_destination';
    bot.sendMessage(chatId,
      `📍 Origen: *${text}*\n\n🏁 ¿A dónde vas?\n\n_Escribe tu destino:_`,
      { parse_mode: 'Markdown' }
    );
  }

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
      `_Hay ${availableDrivers.length} conductores disponibles_ ⏳\n` +
      `_El conductor te propondrá el precio antes de confirmar_ 💰`,
      { parse_mode: 'Markdown' }
    );

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
              [{ text: '✅ Aceptar viaje', callback_data: `accept_${chatId}` }],
              [{ text: '❌ Rechazar', callback_data: `reject_${chatId}` }]
            ]
          }
        }
      );
    });
  }
});

console.log('🚗 Mubi Irapuato bot iniciado correctamente...');
