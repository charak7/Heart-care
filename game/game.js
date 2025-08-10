(function () {
  "use strict";

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const btnStart = document.getElementById("btn-start");
  const btnPause = document.getElementById("btn-pause");
  const btnRestart = document.getElementById("btn-restart");

  const GRID_SIZE = 24; // cells per row/col
  const TILE = Math.floor(canvas.width / GRID_SIZE);
  const INITIAL_SNAKE_LENGTH = 4;
  const INITIAL_SPEED_MS = 120;

  const COLORS = {
    background: "#0d1f28",
    grid: "#0f2835",
    snakeHead: "#6af1a1",
    snakeBody: "#38c681",
    food: "#ff6961",
    text: "#d6eef7",
    shadow: "rgba(0,0,0,0.25)",
  };

  const KEY_TO_DIR = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 },
    a: { x: -1, y: 0 },
    s: { x: 0, y: 1 },
    d: { x: 1, y: 0 },
  };

  let gameState = createInitialState();
  let loopId = null;

  function createInitialState() {
    const startX = Math.floor(GRID_SIZE / 2);
    const startY = Math.floor(GRID_SIZE / 2);
    const snake = [];
    for (let i = 0; i < INITIAL_SNAKE_LENGTH; i++) {
      snake.push({ x: startX - i, y: startY });
    }
    return {
      snake,
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
      food: randomFreeCell(snake),
      score: 0,
      speedMs: INITIAL_SPEED_MS,
      isRunning: false,
      isGameOver: false,
      lastTickAt: 0,
    };
  }

  function randomFreeCell(occupied) {
    const occupiedSet = new Set(occupied.map(p => `${p.x},${p.y}`));
    let x, y;
    do {
      x = Math.floor(Math.random() * GRID_SIZE);
      y = Math.floor(Math.random() * GRID_SIZE);
    } while (occupiedSet.has(`${x},${y}`));
    return { x, y };
  }

  function startGame() {
    if (gameState.isGameOver) return;
    if (gameState.isRunning) return;
    gameState.isRunning = true;
    scheduleNextTick(gameState.speedMs);
  }

  function pauseGame() {
    gameState.isRunning = false;
    if (loopId !== null) {
      clearTimeout(loopId);
      loopId = null;
    }
    draw();
  }

  function restartGame() {
    gameState = createInitialState();
    scoreEl.textContent = "0";
    draw();
  }

  btnStart.addEventListener("click", startGame);
  btnPause.addEventListener("click", pauseGame);
  btnRestart.addEventListener("click", restartGame);

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      if (gameState.isRunning) {
        pauseGame();
      } else if (!gameState.isGameOver) {
        startGame();
      } else {
        restartGame();
      }
      e.preventDefault();
      return;
    }

    const key = e.key;
    if (!(key in KEY_TO_DIR)) return;

    const desired = KEY_TO_DIR[key];
    const cur = gameState.direction;

    // Disallow reversing direction in the same axis
    const isOpposite = cur.x + desired.x === 0 && cur.y + desired.y === 0;
    if (isOpposite) return;

    gameState.nextDirection = desired;
  });

  function scheduleNextTick(delay) {
    if (loopId !== null) clearTimeout(loopId);
    loopId = setTimeout(tick, delay);
  }

  function tick() {
    if (!gameState.isRunning) return;

    gameState.direction = gameState.nextDirection;

    const head = gameState.snake[0];
    const newHead = {
      x: head.x + gameState.direction.x,
      y: head.y + gameState.direction.y,
    };

    // Wall collision
    if (
      newHead.x < 0 ||
      newHead.x >= GRID_SIZE ||
      newHead.y < 0 ||
      newHead.y >= GRID_SIZE
    ) {
      endGame();
      return;
    }

    // Self collision
    for (let i = 0; i < gameState.snake.length; i++) {
      const part = gameState.snake[i];
      if (part.x === newHead.x && part.y === newHead.y) {
        endGame();
        return;
      }
    }

    const ateFood = newHead.x === gameState.food.x && newHead.y === gameState.food.y;

    gameState.snake.unshift(newHead);
    if (ateFood) {
      gameState.score += 10;
      scoreEl.textContent = String(gameState.score);
      gameState.food = randomFreeCell(gameState.snake);

      // Accelerate every 50 points
      if (gameState.score % 50 === 0 && gameState.speedMs > 60) {
        gameState.speedMs -= 8;
      }
    } else {
      gameState.snake.pop();
    }

    draw();
    scheduleNextTick(gameState.speedMs);
  }

  function endGame() {
    gameState.isRunning = false;
    gameState.isGameOver = true;
    if (loopId !== null) {
      clearTimeout(loopId);
      loopId = null;
    }
    drawGameOver();
  }

  function clear() {
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawGrid() {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= GRID_SIZE; x++) {
      ctx.beginPath();
      ctx.moveTo(x * TILE + 0.5, 0);
      ctx.lineTo(x * TILE + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= GRID_SIZE; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * TILE + 0.5);
      ctx.lineTo(canvas.width, y * TILE + 0.5);
      ctx.stroke();
    }
  }

  function drawSnake() {
    const { snake } = gameState;
    for (let i = 0; i < snake.length; i++) {
      const { x, y } = snake[i];
      ctx.fillStyle = i === 0 ? COLORS.snakeHead : COLORS.snakeBody;
      const padding = i === 0 ? 2 : 3;
      ctx.fillRect(
        x * TILE + padding,
        y * TILE + padding,
        TILE - padding * 2,
        TILE - padding * 2
      );
    }
  }

  function drawFood() {
    const { x, y } = gameState.food;
    ctx.fillStyle = COLORS.food;
    const radius = Math.floor(TILE / 2) - 3;
    const centerX = x * TILE + TILE / 2;
    const centerY = y * TILE + TILE / 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGameOver() {
    draw();
    const message = "Game Over";
    ctx.fillStyle = COLORS.text;
    ctx.shadowColor = COLORS.shadow;
    ctx.shadowBlur = 8;
    ctx.font = "bold 36px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(message, canvas.width / 2, canvas.height / 2 - 10);

    ctx.font = "16px system-ui, sans-serif";
    ctx.shadowBlur = 0;
    ctx.fillText("Press Restart or Space to play again", canvas.width / 2, canvas.height / 2 + 24);
  }

  function draw() {
    clear();
    drawGrid();
    drawFood();
    drawSnake();
  }

  // Initial draw so the board is visible before start
  draw();
})();