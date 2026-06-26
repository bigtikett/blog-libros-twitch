document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("matrix-landing-overlay");
  const canvas = document.getElementById("matrix-landing-canvas");
  if (!overlay || !canvas) return;

  const ctx = canvas.getContext("2d");
  const form = document.getElementById("matrix-landing-form");
  const passwordInput = document.getElementById("matrix-landing-pass");
  const statusDiv = document.getElementById("matrix-decrypting-status");
  const consoleBox = document.getElementById("matrix-landing-console");

  // Configuración del efecto Matrix Digital Rain
  let letras = "010101ABCDEFGHIJKLMNOPQRSTUVWXYZｦｱｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃ".split("");
  let fontSize = 14;
  let columnas = 0;
  let gotas = [];
  let matrixInterval = null;

  function redimensionarCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    columnas = Math.floor(canvas.width / fontSize);
    gotas = Array(columnas).fill(1);
  }

  function dibujarMatrix() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#00ff41";
    ctx.font = fontSize + "px monospace";

    for (let i = 0; i < gotas.length; i++) {
      const texto = letras[Math.floor(Math.random() * letras.length)];
      ctx.fillText(texto, i * fontSize, gotas[i] * fontSize);
      if (gotas[i] * fontSize > canvas.height && Math.random() * 0.975 > 0.95) {
        gotas[i] = 0;
      }
      gotas[i]++;
    }
  }

  // Inicializar lluvia digital de Matrix de inmediato
  redimensionarCanvas();
  window.addEventListener("resize", redimensionarCanvas);
  matrixInterval = setInterval(dibujarMatrix, 33);

  // Manejar el submit del formulario de descifrado (Cualquier contraseña es válida)
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();

      // Deshabilitar input y ocultar formulario
      if (passwordInput) passwordInput.disabled = true;
      form.classList.add("d-none");

      // Mostrar contenedor de logs de descifrado
      if (statusDiv) {
        statusDiv.classList.remove("d-none");
        const statusLines = statusDiv.querySelectorAll("span");
        
        // Efecto secuencial de logs de "hackeo"
        statusLines.forEach((line, index) => {
          line.style.opacity = "0";
          line.style.transition = "opacity 0.25s ease";
          setTimeout(() => {
            line.style.opacity = "1";
          }, index * 400);
        });

        // Flash verde y fadeout de la pantalla de Matrix
        setTimeout(() => {
          // Flash verde
          ctx.fillStyle = "rgba(0, 255, 65, 0.8)";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          overlay.style.transition = "opacity 0.8s ease";
          overlay.style.opacity = "0";
          document.body.classList.remove("matrix-active");

          setTimeout(() => {
            clearInterval(matrixInterval);
            window.removeEventListener("resize", redimensionarCanvas);
            overlay.style.display = "none";
            console.log("[SECURITY_CORE]: Decryption bypass active. Shell access granted.");
          }, 800);
        }, statusLines.length * 400 + 400);
      }
    });
  }
});