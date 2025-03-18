const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

class Database {
    constructor() {
        this.db = new sqlite3.Database('game.db', (err) => {
            if (err) {
                console.error(err.message);
            } else {
                console.log('Connected to the database.');
                this.createTables();
            }
        });
    }

    createTables() {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                avatar TEXT,
                gamesPlayed INTEGER DEFAULT 0,
                gamesWon INTEGER DEFAULT 0
            )
        `, (err) => {
            if (err) {
                console.error(err.message);
            }
        });
    }

    registerUser(username, password) {
        return new Promise((resolve, reject) => {
            this.db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, password], function(err) {
                if (err) {
                    console.error(err.message);
                    resolve({ success: false, message: 'Username already exists.' });
                } else {
                    resolve({ success: true, message: 'Registration successful.' });
                }
            });
        });
    }

    async loginUser(username, password) {
        return new Promise((resolve, reject) => {
            this.db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, row) => {
                if (err) {
                    console.error(err.message);
                    resolve({ success: false, message: 'Database error.' });
                } else if (row && await bcrypt.compare(password, row.password)) {
                    resolve({
                        success: true,
                        message: 'Login successful.',
                        avatar: row.avatar,
                        gamesPlayed: row.gamesPlayed,
                        gamesWon: row.gamesWon
                    });
                } else {
                    resolve({ success: false, message: 'Invalid credentials.' });
                }
            });
        });
    }
}

module.exports = Database;
