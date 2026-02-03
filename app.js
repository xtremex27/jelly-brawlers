// Estado del Juego
const gameState = {
    screen: 'selection', // selection, playing
    selectedChar: null, // bear, cat, bunny
    selectedMap: 'forest', // forest, ice, lava
    playerPos: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 }, // Para físicas de inercia
    speed: 1.5, // Aceleración
    maxSpeed: 8,
    friction: 0.85, // 0.85 = normal, 0.98 = hielo (resbala más)
    keys: {
        w: false, a: false, s: false, d: false,
        ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false,
        " ": false
    },
    joystick: {
        active: false,
        dx: 0, // -1 a 1
        dy: 0  // -1 a 1
    },
    facingRight: true // Para flip animation
};

// Mapa de Assets para los personajes
const charAssets = {
    bear: 'character_grizzly_bear.png',
    cat: 'character_cute_cat.png',
    bunny: 'character_pink_bunny.png'
};

// =========================================
// SELECCIÓN (Lobby)
// =========================================

function selectChar(element) {
    document.querySelectorAll('.char-card').forEach(card => card.classList.remove('active'));
    element.classList.add('active');
    gameState.selectedChar = element.dataset.char;
}

function selectMap(mapType) {
    gameState.selectedMap = mapType;

    // UI Update
    document.querySelectorAll('.map-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.map-btn[data-map="${mapType}"]`).classList.add('active');

    // Configurar fricción según mapa
    if (mapType === 'ice') {
        gameState.friction = 0.96; // Muy resbaladizo
    } else if (mapType === 'lava') {
        gameState.friction = 0.80; // Suelo pegajoso/pesado
    } else {
        gameState.friction = 0.85; // Normal
    }
}

function startGame() {
    if (!gameState.selectedChar) {
        const firstCard = document.querySelector('.char-card');
        if (firstCard) selectChar(firstCard);
        else gameState.selectedChar = 'bear'; // fallback
    }

    // UI Switch
    document.getElementById('selection-screen').classList.add('hidden');
    const arena = document.getElementById('game-arena');
    arena.classList.remove('hidden');

    // Aplicar Tema del Mapa
    arena.className = `game-container map-${gameState.selectedMap}`;

    gameState.screen = 'playing';

    // Setup Player
    const playerImg = document.getElementById('player-img');
    playerImg.src = charAssets[gameState.selectedChar];

    // Center Player logic
    gameState.playerPos.x = window.innerWidth / 2;
    gameState.playerPos.y = window.innerHeight / 2;

    // Iniciar Loop
    window.requestAnimationFrame(gameLoop);
}

// =========================================
// INPUT HANDLING (Teclado)
// =========================================

window.addEventListener('keydown', (e) => {
    if (gameState.keys.hasOwnProperty(e.key) || Object.keys(gameState.keys).includes(e.key)) {
        gameState.keys[e.key] = true;
        hideControlsOverlay();
    }
});

window.addEventListener('keyup', (e) => {
    if (gameState.keys.hasOwnProperty(e.key) || Object.keys(gameState.keys).includes(e.key)) {
        gameState.keys[e.key] = false;
    }
});

function hideControlsOverlay() {
    const overlay = document.getElementById('controls-overlay');
    if (overlay && overlay.style.opacity !== '0') {
        overlay.style.opacity = '0';
    }
}

// =========================================
// JOYSTICK LOGIC (Touch)
// =========================================

const joystickZone = document.getElementById('joystick-zone');
const joystickNipple = document.getElementById('joystick-nipple');
const joystickBase = document.getElementById('joystick-base');

// Variables para el joystick
let joystickCenter = { x: 0, y: 0 };
const maxJoystickRadius = 50;

joystickZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    gameState.joystick.active = true;

    const rect = joystickBase.getBoundingClientRect();
    joystickCenter.x = rect.left + rect.width / 2;
    joystickCenter.y = rect.top + rect.height / 2;

    updateJoystickData(touch.clientX, touch.clientY);
    hideControlsOverlay();
}, { passive: false });

joystickZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (gameState.joystick.active) {
        const touch = e.changedTouches[0];
        updateJoystickData(touch.clientX, touch.clientY);
    }
}, { passive: false });

joystickZone.addEventListener('touchend', (e) => {
    gameState.joystick.active = false;
    gameState.joystick.dx = 0;
    gameState.joystick.dy = 0;

    // Reset Visuals
    joystickNipple.style.transform = `translate(-50%, -50%)`;
});

function updateJoystickData(touchX, touchY) {
    let deltaX = touchX - joystickCenter.x;
    let deltaY = touchY - joystickCenter.y;

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const clampedDistance = Math.min(distance, maxJoystickRadius);
    const angle = Math.atan2(deltaY, deltaX);

    const visualX = Math.cos(angle) * clampedDistance;
    const visualY = Math.sin(angle) * clampedDistance;

    joystickNipple.style.transform = `translate(calc(-50% + ${visualX}px), calc(-50% + ${visualY}px))`;

    gameState.joystick.dx = deltaX / maxJoystickRadius;
    gameState.joystick.dy = deltaY / maxJoystickRadius;

    if (distance > maxJoystickRadius) {
        gameState.joystick.dx = Math.cos(angle);
        gameState.joystick.dy = Math.sin(angle);
    }
}

function triggerAction() {
    gameState.keys[" "] = true;
    setTimeout(() => { gameState.keys[" "] = false; }, 200);
}


// =========================================
// GAME LOOP & PHYSICS
// =========================================

function gameLoop() {
    if (gameState.screen !== 'playing') return;

    // 1. Calcular Input Force
    let forceX = 0;
    let forceY = 0;

    if (gameState.keys.w || gameState.keys.ArrowUp) forceY -= 1;
    if (gameState.keys.s || gameState.keys.ArrowDown) forceY += 1;
    if (gameState.keys.a || gameState.keys.ArrowLeft) forceX -= 1;
    if (gameState.keys.d || gameState.keys.ArrowRight) forceX += 1;

    if (gameState.joystick.active) {
        forceX = gameState.joystick.dx;
        forceY = gameState.joystick.dy;
    }

    const mag = Math.sqrt(forceX * forceX + forceY * forceY);
    if (mag > 1) {
        forceX /= mag;
        forceY /= mag;
    }

    // 2. Aplicar Aceleración
    if (mag > 0.1) {
        gameState.velocity.x += forceX * gameState.speed;
        gameState.velocity.y += forceY * gameState.speed;

        // Determinar dirección
        if (forceX > 0.1) gameState.facingRight = true;
        if (forceX < -0.1) gameState.facingRight = false;
    }

    // 3. Aplicar Fricción
    gameState.velocity.x *= gameState.friction;
    gameState.velocity.y *= gameState.friction;

    // 4. Actualizar Posición
    gameState.playerPos.x += gameState.velocity.x;
    gameState.playerPos.y += gameState.velocity.y;

    // 5. Límites
    if (gameState.playerPos.x < 40) { gameState.playerPos.x = 40; gameState.velocity.x *= -0.5; }
    if (gameState.playerPos.x > window.innerWidth - 40) { gameState.playerPos.x = window.innerWidth - 40; gameState.velocity.x *= -0.5; }
    if (gameState.playerPos.y < 40) { gameState.playerPos.y = 40; gameState.velocity.y *= -0.5; }
    if (gameState.playerPos.y > window.innerHeight - 40) { gameState.playerPos.y = window.innerHeight - 40; gameState.velocity.y *= -0.5; }

    // 6. ANIMACIÓN PROCEDURAL (Flip & Wobble)
    const playerEl = document.getElementById('player');
    const playerSprite = document.querySelector('.player-sprite');

    // Rotación por "caminata torpe" (Wobble)
    // Usamos velocidad X para inclinarlo hacia adelante/atrás + un seno del tiempo para tambalearse
    const speed = Math.sqrt(gameState.velocity.x ** 2 + gameState.velocity.y ** 2);
    const wobble = Math.sin(Date.now() / 100) * (speed * 2); // Tambaleo rápido al correr
    const tilt = gameState.velocity.x * 2; // Inclinación por velocidad

    const totalRotation = tilt + wobble;

    // Flip Horizontal (Mirar izq/der)
    const scaleX = gameState.facingRight ? 1 : -1;

    // Efecto de GOLPE (Squash)
    let scaleY = 1;
    if (gameState.keys[" "]) {
        scaleY = 0.8; // Aplastar
        playerEl.style.filter = "brightness(1.5)";
    } else {
        playerEl.style.filter = "none";
    }

    // Aplicar transformaciones
    // Movemos el contenedor player completo
    playerEl.style.transform = `translate3d(${gameState.playerPos.x - 50}px, ${gameState.playerPos.y - 50}px, 0)`; // -50 mitad de 100px

    // Aplicamos rotaciones y escalas al sprite interno
    // scaleX invierte, scaleY aplasta
    playerSprite.style.transform = `scale(${scaleX}, ${scaleY}) rotate(${totalRotation}deg)`;

    requestAnimationFrame(gameLoop);
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    console.log("Jelly Brawlers Procedural Anim Loaded");
});
