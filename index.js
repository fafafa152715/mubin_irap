const TelegramBot = require('node-telegram-bot-api');

const TOKEN = process.env.BOT_TOKEN || '8797406782:AAG48TbYoo8Use3FqUmA2zLFI0cI5AB5XgY';
const bot = new TelegramBot(TOKEN, { polling: true });

// Base de datos en memoria
const drivers = {};
const pendingRides = {};
const activeRides = {};

// Estadísticas
const stats = {
  totalRides: 0,
  cancelledRides: 0,
  driverStats: {},
  destinations: {},
  hourlyRides: {},
};

function addStat(driverId, driverName, destination) {
  stats.totalRides++;
  // Por conductor
  if (!stats.driverStats[driverId]) {
    stats.driverStats[driverId] = { name: driverName, count: 0 };
  }
  stats.driverStats[driverId].count++;
  // Por destino
  stats.destinations[destination] = (stats.destinations[destination] || 0) + 1;
  // Por hora
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
    `🚗 *¡Bienvenido a Taxi Irapuato, ${name}!*\n\n¿Qué eres tú?`,
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
//  ESTADÍSTICAS (solo admin)
// ══════════════════════════════════════
bot.onText(/\/estadisticas/, (msg) => {
  const chatId = msg.chat.id;
  const onlineDrivers = Object.values(drivers).filter(d => d.available).length;

  bot.sendMessage(chatId,
    `📊 *Estadísticas de Taxi Irapuato*\n\n` +
    `🚗 Viajes completados: *${stats.totalRides}*\n` +
    `❌ Viajes cancelados: *${stats.cancelledRides}*\n` +
    `🟢 Conductores activos ahora: *${onlineDrivers}*\n` +
    `🏆 Mejor conductor: *${getTopDriver()}*\n` +
    `📍 Destino más popular: *${getTopDestination()}*\n` +
    `⏰ Hora pico: *${getPeakHour()}*\n` +
    `💰 Estimado ganado: *$${stats.totalRides * 50} pesos*`,
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
      `✅ *¡Registrado como conductor, ${name}!*\n\nActiva tu disponibilidad cuando quieras trabajar:`,
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
      `👤 *¡Hola ${name}!*\n\n📍 ¿Desde dónde te recogemos?\n\n_Escribe tu ubicación o colonia:_`,
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

    // Marcar viaje como activo
    activeRides[passengerId] = {
      driverId: chatId,
      driverName: name,
      passengerName: ride.name,
      destination: ride.destination
    };
    delete pendingRides[passengerId];

    // Avisar al conductor con botón de recoger pasajero
    bot.sendMessage(chatId,
      `✅ *¡Viaje aceptado!*\n\n` +
      `👤 Pasajero: *${ride.name}*\n` +
      `📍 Origen: *${ride.origin}*\n` +
      `🏁 Destino: *${ride.destination}*\n\n` +
      `_Ve a recoger al pasajero_ 🚗`,
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

    // Avisar al pasajero
    const driverInfo = drivers[chatId];
    bot.sendMessage(passengerId,
      `🎉 *¡Conductor encontrado!*\n\n` +
      `🚗 Conductor: *${name}*\n` +
      `📞 Contacto: @${driverInfo?.username || name}\n\n` +
      `_Ya va en camino a recogerte_ 🚗💨`,
      { parse_mode: 'Markdown' }
    );

    // Avisar a otros conductores
    Object.values(drivers).forEach(driver => {
      if (driver.available && driver.id !== chatId) {
        bot.sendMessage(driver.id, `ℹ️ El viaje de ${ride.name} ya fue tomado.`);
      }
    });
  }

  // CONDUCTOR RECOGIÓ AL PASAJERO
  if (data.startsWith('picked_')) {
    const passengerId = parseInt(data.split('_')[1]);
    const ride = activeRides[passengerId];

    if (!ride) {
      bot.answerCallbackQuery(query.id);
      return;
    }

    // Avisar al conductor
    bot.sendMessage(chatId,
      `🚗 *¡Viaje en progreso!*\n\n` +
      `🏁 Destino: *${ride.destination}*\n\n` +
      `_Cuando llegues al destino, toca "Finalizar viaje"_`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏁 Finalizar viaje', callback_data: `complete_${passengerId}` }]
          ]
        }
      }
    );

    // Avisar al pasajero
    bot.sendMessage(passengerId,
      `🚗 *¡Ya vas en camino!*\n\nDisfruta tu viaje a *${ride.destination}* 😊`,
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
      `💰 ¡Gracias por tu servicio!\n\n` +
      `Viajes completados hoy: *${stats.driverStats[chatId]?.count || 1}*`,
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
      `😔 *El conductor canceló el viaje.*\n\nIntenta pedir otro. 🚗`,
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
//  FLUJO PASAJERO - MENSAJES
// ══════════════════════════════════════
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith('/')) return;

  const ride = pendingRides[chatId];
  if (!ride) return;

  // PASO 1: Origen
  if (ride.step === 'waiting_origin') {
    pendingRides[chatId].origin = text;
    pendingRides[chatId].step = 'waiting_destination';
    bot.sendMessage(chatId,
      `📍 Origen: *${text}*\n\n🏁 ¿A dónde vas?\n\n_Escribe tu destino:_`,
      { parse_mode: 'Markdown' }
    );
  }

  // PASO 2: Destino y buscar conductor
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
      `_Hay ${availableDrivers.length} conductores disponibles_ ⏳`,
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

console.log('🚗 Bot Taxi Irapuato iniciado correctamente...');
