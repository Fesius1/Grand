const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const Database = require('./database');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const db = new Database();

// Настройка хранилища для аватарок
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

let players = [];
let maxPlayers = 4; // Максимальное количество игроков
const upload = multer({ storage: storage });

// Создайте папку 'uploads', если её нет
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/cards', express.static(path.join(__dirname, 'cards')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Регистрация пользователя
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const result = await db.registerUser(username, password);
    res.json(result);
});

// Вход пользователя
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const result = await db.loginUser(username, password);
    res.json(result);
});

// Обработка подключения клиентов
io.on('connection', (socket) => {
    console.log('A client connected');

    // Отправляем текущий список игроков новому клиенту
    socket.emit('updateLobby', players);

    // Обработка добавления нового игрока
    socket.on('addPlayer', (playerData) => {
        const newPlayer = { id: socket.id, name: playerData.name, avatar: playerData.avatar, hand: [], score: 0, totalScore: 0 };
        if (!players.some(player => player.id === newPlayer.id)) { // Проверка на дублирование
            players.push(newPlayer);
            io.emit('updateLobby', players);
            console.log(`${newPlayer.name} joined the lobby.`);
        }
    });

    // Обработка события начала игры
    socket.on('startGame', () => {
        if (players.length < 2) {
            socket.emit('message', 'Недостаточно игроков для начала игры.');
            return;
        }

        // Создаем и перемешиваем колоду
        const deck = shuffleDeck(createDeck());

        // Раздаем карты игрокам
        players.forEach(player => {
            player.hand = deck.splice(0, 12); // Каждому игроку раздается 12 карт
            io.to(player.id).emit('dealCards', player.hand); // Отправляем карты игроку
        });

        // Отправляем количество карт каждому игроку
        const playerCounts = {};
        players.forEach(player => {
            playerCounts[player.id] = player.hand.length; // Сохраняем количество карт
        });
        io.emit('updateCardCount', playerCounts); // Отправляем обновленное количество карт всем игрокам

        // Лог в чате
        io.emit('chatMessage', 'Игра началась!');
        console.log('Игра началась!');
    });

    // Обработка изменения аватарки
    socket.on('changeAvatar', (avatarPath) => {
        const player = players.find(p => p.id === socket.id);
        if (player) {
            player.avatar = avatarPath; // Обновляем аватарку игрока
            io.emit('updateLobby', players); // Обновляем лобби для всех
        }
    });

    // Обработка отключения игрока
    socket.on('disconnect', () => {
        players = players.filter(player => player.id !== socket.id); // Удаляем игрока из списка
        console.log('Client disconnected');
        // Уведомляем всех игроков о количестве игроков в лобби
        io.emit('updateLobby', players);
    });

    // Обработка действий игроков
    socket.on('drawCard', () => {
        // Логика для взятия карты
        const player = players.find(p => p.id === socket.id);
        if (player) {
            // Здесь должна быть логика для взятия карты из колоды
            io.emit('chatMessage', `${player.name} взял карту.`);
        }
    });

    socket.on('layDown', () => {
        const player = players.find(p => p.id === socket.id);
        if (player) {
            // Здесь должна быть логика для подложения карты
            io.emit('chatMessage', `${player.name} подложил карту.`);
        }
    });

    socket.on('discardCard', () => {
        const player = players.find(p => p.id === socket.id);
        if (player) {
            // Здесь должна быть логика для сброса карты
            io.emit('chatMessage', `${player.name} сбросил карту.`);
        }
    });

    socket.on('makeLaydown', () => {
        const player = players.find(p => p.id === socket.id);
        if (player) {
            // Здесь должна быть логика для выкладки
            io.emit('chatMessage', `${player.name} сделал выкладку.`);
        }
    });
});

// Запускаем сервер
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;

// Функция для создания колоды карт
function createDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']; // Без джокеров
    const newDeck = [];

    // Создаем две колоды карт
    for (let suit of suits) {
        for (let value of values) {
            newDeck.push({ suit, rank: value });
            newDeck.push({ suit, rank: value }); // Добавляем вторую колоду
        }
    }

    // Добавляем 4 джокера
    for (let i = 0; i < 2; i++) {
        newDeck.push({ suit: 'black', rank: 'Joker' });
        newDeck.push({ suit: 'red', rank: 'Joker' });
    }

    return newDeck;
}

// Функция для перемешивания колоды
function shuffleDeck(deck) {
    // Алгоритм Фишера-Йетса для перемешивания
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// Объект игрока
class Player {
    constructor(name, id) { // Добавлено id
        this.name = name;
        this.id = id; // Сохраняем id игрока
        this.laydowns = []; // Выкладки
        this.jokers = []; // Хранение джокеров и их заменяемых карт
        this.hand = []; // Карты на руке
        this.score = 0; // Очки игрока в текущем раунде
        this.totalScore = 0; // Общий счет игрока
        this.gamesPlayed = 0; // Количество сыгранных игр
        this.gamesWon = 0; // Количество побед
        this.avatar = ''; // Путь к аватарке
    }

    // Метод для добавления выкладки
    addLaydown(laydown) {
        this.laydowns.push(laydown);
        this.score += laydown.calculatePoints(); // Добавляем очки за новую выкладку
    }

    // Метод для подсчета отрицательных очков
    calculateNegativePoints() {
        let negativePoints = 0;
        this.hand.forEach(card => {
            if (card.rank >= 2 && card.rank <= 9) {
                negativePoints -= 5; // Каждая карта от 2 до 9 -5 очков
            } else if (card.rank >= 10 && card.rank <= 14) {
                negativePoints -= 10; // Каждая карта от 10 до туза -10 очков
            } else if (card.rank === 'JOKER') {
                negativePoints -= 30; // Джокер -30 очков
            }
        });
        return negativePoints;
    }
}

// Функция для создания колоды карт
// function createDeck() {
//     const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
//     const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']; // Без джокеров
//     const newDeck = [];

//     // Создаем две колоды карт
//     for (let suit of suits) {
//         for (let value of values) {
//             newDeck.push({ suit, rank: value });
//             newDeck.push({ suit, rank: value }); // Добавляем вторую колоду
//         }
//     }

//     // Добавляем 4 джокера
//     for (let i = 0; i < 4; i++) {
//         newDeck.push({ suit: 'none', rank: 'JOKER' });
//     }

//     return newDeck;
// }

// Функция для перемешивания колоды
function shuffleDeck(deck) {
    // Алгоритм Фишера-Йетса для перемешивания
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// Функция для раздачи начальных карт игрокам
function dealInitialHands() {
    for (let player of players) {
        player.hand = deck.splice(0, 12); // Каждому игроку раздается 12 карт
        io.to(player.id).emit('dealCards', player.hand); // Отправляем карты игроку
    }
}

// Логика для взятия карты из сброса
function drawCardFromDiscard(player, cardIndex) {
    // Проверяем, достаточно ли очков у игрока для взятия карты из сброса
    if (player.score < 30) {
        console.log(`${player.name} не может взять карту из сброса, так как у него менее 30 очков.`);
        return;
    }

    if (discardPile.length > cardIndex) {
        // Берем выбранную карту из сброса
        const cardToTake = discardPile[cardIndex];
        player.hand.push(cardToTake); // Добавляем карту в руку игрока

        // Забираем все последующие карты из сброса
        for (let i = cardIndex + 1; i < discardPile.length; i++) {
            player.hand.push(discardPile[i]);
        }

        // Очищаем сброс, начиная с выбранной карты
        discardPile.splice(cardIndex); // Удаляем все карты, начиная с cardIndex

        console.log(`${player.name} взял карту ${cardToTake.rank} ${cardToTake.suit} из сброса.`);
    } else {
        console.log("Выбранный индекс карты из сброса неверен.");
    }
}

// Логика для взятия карты
function drawCard(player, fromDeck = true) {
    if (fromDeck) {
        player.hand.push(deck.pop()); // Берем карту из колоды
        console.log(`${player.name} взял карту из колоды.`);
    } else {
        console.log("Игрок пытается взять карту из сброса.");
        // Здесь можно вызвать drawCardFromDiscard с нужным индексом
        // Например, если игрок хочет взять карту с индексом 0 из сброса:
        drawCardFromDiscard(player, 0); // Замените 0 на нужный индекс
    }
}

// Функция для выбора нескольких карт для выкладки
function selectCardsForLaydown(player, selectedCards) {
    // Проверяем, что выбранные карты могут быть выложены
    if (canLaydown(selectedCards)) {
        // Удаляем выбранные карты из руки игрока
        selectedCards.forEach(card => {
            const index = player.hand.indexOf(card);
            if (index > -1) {
                player.hand.splice(index, 1);
            }
        });
        // Добавляем выкладку в общую коллекцию выкладок
        laydowns.push(selectedCards);
    } else {
        console.log("Невозможно выложить выбранные карты.");
    }
}

// Функция для обновления порядка карт в руке игрока
function updateCardOrder(player, newOrder) {
    // Проверяем, что новый порядок соответствует количеству карт в руке
    if (newOrder.length === player.hand.length) {
        player.hand = newOrder;
    } else {
        console.log("Неверный порядок карт.");
    }
}

// Функция для проверки возможности выкладки
function canLaydown(selectedCards) {
    const isAcesLaydown = selectedCards.every(card => card.rank === 14); // Проверяем, все ли карты тузы
    const isSequential = checkIfSequential(selectedCards); // Ваша функция для проверки последовательности

    // Логика для обработки выкладок
    if (isAcesLaydown) {
        // Обработка выкладки тузов
        selectedCards.forEach(card => {
            if (card.isJoker) {
                const score = getJokerValue(card, isAcesLaydown);
                // Добавьте логику для подсчета очков
            }
        });
    } else if (isSequential) {
        // Обработка последовательной выкладки
        selectedCards.forEach(card => {
            if (card.isJoker) {
                const score = getJokerValue(card, isAcesLaydown);
                // Добавьте логику для подсчета очков
            }
        });
    }
    // Сначала проверим, есть ли джокеры среди выбранных карт
    const jokers = selectedCards.filter(card => card.rank === 'JOKER');
    const nonJokers = selectedCards.filter(card => card.rank !== 'JOKER');

    // Проверка на выкладку "3-4 карты одного достоинства"
    const sameRankGroups = groupByRank(nonJokers);
    if (jokers.length > 0) {
        // Если есть джокеры, добавляем их к группам
        for (const rank in sameRankGroups) {
            if (sameRankGroups[rank].length + jokers.length >= 3) {
                return true; // Можно выложить
            }
        }
    } else {
        // Проверяем без джокеров
        for (const rank in sameRankGroups) {
            if (sameRankGroups[rank].length >= 3) {
                return true; // Можно выложить
            }
        }
    }

    // Проверка на выкладку "последовательные карты одной масти"
    if (isSequential(nonJokers)) {
        return true; // Можно выложить последовательность
    }

    return false; // Невозможно выложить
}

// Группировка карт по достоинству
function groupByRank(cards) {
    return cards.reduce((acc, card) => {
        acc[card.rank] = acc[card.rank] || [];
        acc[card.rank].push(card);
        return acc;
    }, {});
}

// Проверка на последовательность с цикличностью
function isSequential(cards) {
    // Сначала проверяем, все ли карты одной масти
    const suit = cards[0].suit;
    if (!cards.every(card => card.suit === suit)) {
        return false; // Разные масти
    }

    // Сортируем карты по достоинству
    const sortedCards = cards.sort((a, b) => a.rank - b.rank);
    
    // Проверка на количество карт
    if (sortedCards.length < 3) {
        return false; // Не достаточно карт для выкладки
    }

    // Проверка цикличности
    const ranks = sortedCards.map(card => card.rank);
    const uniqueRanks = [...new Set(ranks)];

    for (let i = 0; i < uniqueRanks.length; i++) {
        const nextRank = (uniqueRanks[i] + 1) % 13; // Цикличность
        if (!uniqueRanks.includes(nextRank)) {
            return false; // Не последовательные
        }
    }

    return true; // Последовательные карты одной масти
}

// Функция для подсчета очков
function calculateScore(player) {
    let score = 0;

    player.hand.forEach(card => {
        if (card.rank === 'JOKER') {
            // Если это джокер, нужно определить, какую карту он заменяет
            score += getJokerValue(card); // Функция для получения значения джокера
        } else if (card.rank >= 2 && card.rank <= 9) {
            score += 5; // Карты от 2 до 9
        } else if (card.rank >= 10 && card.rank <= 14) {
            score += 10; // Карты от 10 до туза
        }
    });

    // Проверка на выкладку из тузов
    if (player.laydowns.some(laydown => laydown.every(card => card.rank === 14))) {
        score += player.laydowns.flat().filter(card => card.rank === 14).length * 25; // Тузы
    }

    return score;
}

// Функция для завершения раунда
function endRound(player) {
    if (player.hand.length === 0) { // Проверяем, остались ли карты у игрока
        const roundPoints = player.score; // Очки за выкладки текущего игрока
        player.totalScore += roundPoints + 30; // Добавляем 30 очков за победу в раунде

        console.log(`${player.name} wins the round! Total score: ${player.totalScore}`);

        // Подсчет очков для остальных игроков
        players.forEach(p => {
            if (p !== player) {
                const negativePoints = calculateNegativePoints(p); // Функция для подсчета негативных очков
                p.totalScore += p.score + negativePoints; // Добавляем очки за выкладки и негативные очки
            }
        });

        // Проверка на конец игры
        if (player.totalScore >= 1000) {
            console.log(`${player.name} wins the game!`);
            // Логика завершения игры
            return;
        }

        // Обнуляем локальные очки и раздаем карты заново
        resetGame(); // Сбрасываем игру
    }
}

// Функция для подсчета негативных очков
function calculateNegativePoints(player) {
    let negativePoints = 0;
    player.hand.forEach(card => {
        if (card.rank >= 2 && card.rank <= 9) {
            negativePoints -= 5; // Каждая карта от 2 до 9 -5 очков
        } else if (card.rank >= 10 && card.rank <= 14) {
            negativePoints -= 10; // Каждая карта от 10 до туза -10 очков
        } else if (card.rank === 'JOKER') {
            negativePoints -= 30; // Джокер -30 очков
        }
    });
    return negativePoints;
}

// Функция для сброса игры
function resetGame() {
    deck = shuffleDeck(createDeck()); // Перемешиваем колоду
    players.forEach(player => {
        player.hand = deck.splice(0, 12); // Раздаем по 12 карт каждому игроку
        player.score = 0; // Сбрасываем очки текущего раунда
        io.to(player.id).emit('dealCards', player.hand); // Отправляем карты игроку
    });

    // Переход к следующему игроку
    currentPlayerIndex = (currentPlayerIndex + 1) % players.length; // Переход к следующему игроку
    console.log(`It's now ${players[currentPlayerIndex].name}'s turn.`);
}

// Функция для сброса карты
function discardCard(player, card) {
    const cardIndex = player.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit); // Находим индекс карты в руке игрока
    if (cardIndex > -1) {
        // Удаляем карту из руки игрока
        player.hand.splice(cardIndex, 1);
        // Добавляем карту в массив сброса
        discardPile.push(card);
        console.log(`${player.name} сбросил карту ${card.rank} ${card.suit}.`);
    } else {
        console.log(`${player.name} не может сбросить карту ${card.rank} ${card.suit}, так как она не у него на руке.`);
    }
}
