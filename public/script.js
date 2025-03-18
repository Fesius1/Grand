document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const response = await fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    });

    const result = await response.json();
    if (result.success) {
        localStorage.setItem('username', username);
        localStorage.setItem('avatar', result.avatar); // Сохраняем аватарку
        localStorage.setItem('gamesPlayed', result.gamesPlayed);
        localStorage.setItem('gamesWon', result.gamesWon);
        window.location.href = 'lobby.html';
    } else {
        alert(result.message);
    }
});

document.getElementById('registerButton').addEventListener('click', async () => {
    const username = prompt("Введите логин:");
    const password = prompt("Введите пароль:");

    const response = await fetch('/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
    });

    const result = await response.json();
    alert(result.message);
});
