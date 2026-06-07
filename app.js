// URL de la API de datos (Google Apps Script)
const API_URL =
  "https://script.google.com/macros/s/AKfycbxEyu57a5spnJNju9t4654U8SDBrWFWQ0GWLibubGy5ntZsOV3N-TeL73423-a23j6FwA/exec";

// Metas iniciales (serán actualizadas por datos de la API)
let META_GRUPAL = 0;
let META_RED = 0;
let META_PARTICULAR = 0;
let META_EXCEDENTES = 0;

// Metas por cada tipo de excedente (cargado desde la API)
let METAS_EXCEDENTES = {};

// Objetos Chart.js para evitar recrearlos sin destruir
let chartCumplimiento = null;
let chartIngresos = null;
let chartMensual = null;
let chartGestores = null;
let chartCumplimientoVisual = null;

// Registrar plugin de anotaciones si existe
if (typeof Chart !== "undefined" && typeof ChartAnnotation !== "undefined") {
    Chart.register(ChartAnnotation);
}

// Convierte texto con símbolos (€, ., etc) a número
function toNumber(valor) {
    if (typeof valor === "number") {
        return Number.isFinite(valor) ? valor : 0;
    }
    const texto = String(valor ?? "").trim();
    if (!texto) return 0;
    // Remover espacios, signos de moneda, puntos miles y normalizar comas
    const limpio = texto
        .replace(/\s/g, "")
        .replace(/\$/g, "")
        .replace(/\./g, "")
        .replace(/,/g, ".");
    const numero = Number(limpio);
    return Number.isFinite(numero) ? numero : 0;
}

// Parsea fecha en formato "dd/MM/yyyy" o ISO, devolviendo objeto Date
function parseFecha(valor) {
    if (valor instanceof Date && !isNaN(valor.getTime())) {
        return valor;
    }
    if (valor == null) return null;
    const texto = String(valor).trim();
    if (!texto) return null;
    // Formato dd/MM/yyyy
    const dmy = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
        const [, dd, mm, yyyy] = dmy;
        const fecha = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
        return isNaN(fecha.getTime()) ? null : fecha;
    }
    // Intentar ISO
    const fechaIso = new Date(texto);
    if (!isNaN(fechaIso.getTime())) {
        return fechaIso;
    }
    return null;
}

// Carga los datos vía fetch y actualiza el dashboard
async function cargarDashboard() {
    // Manejo de errores de red y JSON
    let data;
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        data = await response.json();
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        // Mostrar mensaje al usuario en el contenedor de alertas
        const contenedor = document.getElementById("alertasGerenciales");
        if (contenedor) {
            contenedor.innerHTML = '';
            const errorDiv = document.createElement('div');
            errorDiv.className = 'alerta-item';
            const icon = document.createElement('i');
            icon.className = 'fas fa-triangle-exclamation';
            icon.setAttribute('aria-hidden', 'true');
            const span = document.createElement('span');
            span.textContent = `Error cargando datos: ${error.message}`;
            errorDiv.appendChild(icon);
            errorDiv.appendChild(span);
            contenedor.appendChild(errorDiv);
        }
        return;
    }
    const json = data;

    // Extraer configuraciones y datos
    const parametros = Array.isArray(json.parametros) ? json.parametros : [];
    const excedentesConfig = Array.isArray(json.excedentes) ? json.excedentes : [];
    let homenajes = Array.isArray(json.homenajes) ? json.homenajes : [];

    // Filtrado por rango de fecha
    const fechaInicio = document.getElementById("fechaInicio")?.value;
    const fechaFin = document.getElementById("fechaFin")?.value;
    let homenajesFiltrados = [...homenajes];
    if (fechaInicio && fechaFin) {
        const inicio = new Date(`${fechaInicio}T00:00:00`);
        const fin = new Date(`${fechaFin}T23:59:59.999`);
        homenajesFiltrados = homenajes.filter(item => {
            const fecha = parseFecha(item.Fecha);
            return fecha && fecha >= inicio && fecha <= fin;
        });
    }

    // Cargar metas excedentes desde configuración (tabla 1)
    METAS_EXCEDENTES = {};
    excedentesConfig.forEach((fila, index) => {
        if (index === 0) return; // omitir encabezado
        const nombre = String(fila[0] || "").trim().toUpperCase();
        const meta = toNumber(fila[1]);
        if (nombre) {
            METAS_EXCEDENTES[nombre] = meta;
        }
    });

    // Cargar metas grupal y por categoría
    parametros.forEach(fila => {
        const clave = String(fila[0] || "").trim().toUpperCase();
        const valor = String(fila[1] || "").trim().toUpperCase();
        if (clave === "SEDE") {
            META_GRUPAL = toNumber(fila[2]);
        }
        if (clave === "META_CATEGORIA" && valor === "RED") {
            META_RED = toNumber(fila[2]);
        }
        if (clave === "META_CATEGORIA" && valor === "PARTICULAR") {
            META_PARTICULAR = toNumber(fila[2]);
        }
        if (clave === "META_CATEGORIA" && valor === "EXCEDENTES") {
            META_EXCEDENTES = toNumber(fila[2]);
        }
    });

    // Calcular ventas por tipo
    let ventaTotal = 0, ventaRed = 0, ventaParticular = 0, ventaExcedentes = 0;
    homenajesFiltrados.forEach(item => {
        const valor = toNumber(item.Valor);
        ventaTotal += valor;
        const tipo = String(item.Tipo_Homenaje || "").toUpperCase().trim();
        const excedente = String(item.Tipo_Excedente || "").toUpperCase().trim();
        if (tipo === "RED") {
            ventaRed += valor;
        }
        if (tipo === "PARTICULAR") {
            ventaParticular += valor;
        }
        if (excedente && excedente !== "SOAT" && excedente !== "PENSIONADO") {
            ventaExcedentes += valor;
        }
    });

    // Actualizar KPIs principales y secundarios
    actualizarKPIs(ventaTotal, ventaRed, ventaParticular, ventaExcedentes);

    // Crear tablas y gráficos
    crearTablaCumplimiento(ventaRed, ventaParticular, ventaExcedentes);
    crearTablaExcedentes(homenajesFiltrados);
    llenarParticulares(homenajesFiltrados);
    crearGraficoIngresos(ventaRed, ventaParticular, ventaExcedentes);
    crearTopServicios(homenajesFiltrados);
    crearRankingGestores(homenajesFiltrados);
    crearGraficoMensual(homenajesFiltrados);
    crearGraficoGestores(homenajesFiltrados);
    crearIndicadoresEjecutivos(homenajesFiltrados);
    crearVelocimetroCumplimiento(ventaTotal);
    crearSemaforoGerencial(ventaRed, ventaParticular, ventaExcedentes);
    crearAlertasGerenciales(homenajesFiltrados);
}

// Actualiza los indicadores KPI superiores
function actualizarKPIs(ventaTotal, ventaRed, ventaParticular, ventaExcedentes) {
    const cumplimientoGeneral =
        META_GRUPAL > 0
            ? ((ventaTotal / META_GRUPAL) * 100).toFixed(1)
            : "0.0";
    const faltante = META_GRUPAL - ventaTotal;
    const ventasEl = document.getElementById("ventas");
    const cumplimientoEl = document.getElementById("cumplimiento");
    const faltanteEl = document.getElementById("faltante");
    const proyeccionEl = document.getElementById("proyeccion");
    const ultimaActualizacionEl = document.getElementById("ultimaActualizacion");

    if (ventasEl) ventasEl.textContent = "$" + ventaTotal.toLocaleString("es-CO");
    if (cumplimientoEl) cumplimientoEl.textContent = cumplimientoGeneral + "%";
    if (faltanteEl) faltanteEl.textContent = "$" + faltante.toLocaleString("es-CO");
    if (proyeccionEl) proyeccionEl.textContent = cumplimientoGeneral + "%";
    if (ultimaActualizacionEl) {
        ultimaActualizacionEl.textContent = new Date().toLocaleString("es-CO");
    }

    // Colorear porcentaje de cumplimiento según umbrales
    const cumplimientoNum = Number(cumplimientoGeneral);
    if (cumplimientoEl) {
        if (cumplimientoNum >= 100) {
            cumplimientoEl.style.color = "#16a34a"; // verde
        } else if (cumplimientoNum >= 80) {
            cumplimientoEl.style.color = "#f59e0b"; // amarillo
        } else {
            cumplimientoEl.style.color = "#dc2626"; // rojo
        }
    }

    // Actualizar gráfico de barras (Meta vs Real)
    crearGraficoCumplimiento(ventaRed, ventaParticular, ventaExcedentes);
}

// Gráfico de barras: Meta vs Real por categoría
function crearGraficoCumplimiento(ventaRed, ventaParticular, ventaExcedentes) {
    const canvas = document.getElementById("ventasCategoria");
    if (!canvas) return;
    if (chartCumplimiento) chartCumplimiento.destroy();

    chartCumplimiento = new Chart(canvas, {
        type: "bar",
        data: {
            labels: ["🔴 RED", "🔵 PARTICULAR", "🟠 EXCEDENTES"],
            datasets: [
                {
                    label: "Meta",
                    data: [META_RED, META_PARTICULAR, META_EXCEDENTES],
                    backgroundColor: [
                        "rgba(255, 99, 132, 0.70)",
                        "rgba(54, 162, 235, 0.70)",
                        "rgba(255, 159, 64, 0.70)"
                    ]
                },
                {
                    label: "Real",
                    data: [ventaRed, ventaParticular, ventaExcedentes],
                    backgroundColor: [
                        "rgba(16, 185, 129, 0.95)",
                        "rgba(37, 99, 235, 0.95)",
                        "rgba(245, 158, 11, 0.95)"
                    ]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: "Meta vs Real" },
                annotation: {
                    annotations: {
                        metaRed: {
                            type: "line",
                            yMin: META_RED,
                            yMax: META_RED,
                            borderColor: "#ff2d55",
                            borderWidth: 3,
                            borderDash: [10, 6],
                            label: { display: true, content: "Meta RED" }
                        },
                        metaParticular: {
                            type: "line",
                            yMin: META_PARTICULAR,
                            yMax: META_PARTICULAR,
                            borderColor: "#8b5cf6",
                            borderWidth: 3,
                            borderDash: [10, 6],
                            label: { display: true, content: "Meta PARTICULAR" }
                        },
                        metaExcedentes: {
                            type: "line",
                            yMin: META_EXCEDENTES,
                            yMax: META_EXCEDENTES,
                            borderColor: "#f59e0b",
                            borderWidth: 3,
                            borderDash: [10, 6],
                            label: { display: true, content: "Meta EXCEDENTES" }
                        }
                    }
                }
            },
            scales: { y: { beginAtZero: true } }
        }
    });
    // Accesibilidad: añadir ARIA al canvas
    canvas.setAttribute('role','img');
    canvas.setAttribute('aria-label','Gráfico de Meta vs Real de ventas por categoría.');
}

// Llena la tabla de Cumplimiento por categoría (RED, PARTICULAR, EXCEDENTES)
function crearTablaCumplimiento(ventaRed, ventaParticular, ventaExcedentes) {
    const tbody = document.querySelector("#tablaCumplimiento tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    const datos = [
        { nombre: "RED", meta: META_RED, real: ventaRed },
        { nombre: "PARTICULAR", meta: META_PARTICULAR, real: ventaParticular },
        { nombre: "EXCEDENTES", meta: META_EXCEDENTES, real: ventaExcedentes }
    ];
    datos.forEach(item => {
        const porcentaje = item.meta > 0 ? ((item.real / item.meta) * 100).toFixed(1) : "0.0";
        const row = tbody.insertRow();
        const cell1 = row.insertCell(0);
        const cell2 = row.insertCell(1);
        const cell3 = row.insertCell(2);
        const cell4 = row.insertCell(3);
        cell1.textContent = item.nombre;
        cell2.textContent = `$${item.meta.toLocaleString("es-CO")}`;
        cell3.textContent = `$${item.real.toLocaleString("es-CO")}`;
        cell4.textContent = `${porcentaje}%`;
    });
}

// Llena la tabla de Excedentes (meta vs real)
function crearTablaExcedentes(homenajes) {
    const tbody = document.querySelector("#tablaExcedentes tbody");
    if (!tbody) return;
    // Limpiar tabla
    tbody.innerHTML = "";
    // Acumular valores reales por tipo de excedente
    const reales = {};
    homenajes.forEach(item => {
        const excedente = String(item.Tipo_Excedente || "").toUpperCase().trim();
        if (!excedente || excedente === "SOAT" || excedente === "PENSIONADO") {
            return;
        }
        const valor = toNumber(item.Valor);
        reales[excedente] = (reales[excedente] || 0) + valor;
    });
    // Mostrar cada excedente (Meta vs Real)
    Object.keys(METAS_EXCEDENTES).forEach(nombre => {
        const meta = toNumber(METAS_EXCEDENTES[nombre]);
        const real = toNumber(reales[nombre]);
        const porcentaje = meta > 0 ? ((real / meta) * 100).toFixed(1) : "0.0";
        const row = tbody.insertRow();
        const cell1 = row.insertCell(0);
        const cell2 = row.insertCell(1);
        const cell3 = row.insertCell(2);
        const cell4 = row.insertCell(3);
        cell1.textContent = nombre;
        cell2.textContent = `$${meta.toLocaleString("es-CO")}`;
        cell3.textContent = `$${real.toLocaleString("es-CO")}`;
        cell4.textContent = `${porcentaje}%`;
    });
}

// Llena la tabla de Particulares (SOAT, PENSIONADO, PLANES)
function llenarParticulares(homenajes) {
    const tbody = document.querySelector("#tablaParticulares tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    let soat = 0, pensionado = 0, planes = 0;
    homenajes.forEach(item => {
        const tipo = String(item.Tipo_Homenaje || "").toUpperCase().trim();
        const excedente = String(item.Tipo_Excedente || "").toUpperCase().trim();
        const cantidad = toNumber(item.Cantidad || 1);
        if (tipo === "PLAN") {
            planes += cantidad;
        }
        if (excedente === "SOAT") {
            soat += cantidad;
        }
        if (excedente === "PENSIONADO") {
            pensionado += cantidad;
        }
    });
    const total = soat + pensionado + planes;
    const valores = [
        { name: "SOAT", value: soat },
        { name: "PENSIONADO", value: pensionado },
        { name: "PLANES", value: planes }
    ];
    valores.forEach(item => {
        const porcentaje = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
        const row = tbody.insertRow();
        const cell1 = row.insertCell(0);
        const cell2 = row.insertCell(1);
        const cell3 = row.insertCell(2);
        cell1.textContent = item.name;
        cell2.textContent = item.value;
        cell3.textContent = `${porcentaje}%`;
    });
}

// Gráfico de pastel: composición de ingresos
function crearGraficoIngresos(ventaRed, ventaParticular, ventaExcedentes) {
    const canvas = document.getElementById("composicionIngresos");
    if (!canvas) return;
    if (chartIngresos) chartIngresos.destroy();

    chartIngresos = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: ["RED", "PARTICULAR", "EXCEDENTES"],
            datasets: [{
                data: [ventaRed, ventaParticular, ventaExcedentes],
                backgroundColor: [
                    "rgba(255, 99, 132, 0.90)",
                    "rgba(54, 162, 235, 0.90)",
                    "rgba(255, 159, 64, 0.90)"
                ],
                borderColor: "#ffffff",
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: "Composición de Ingresos" }
            }
        }
    });
    canvas.setAttribute('role','img');
    canvas.setAttribute('aria-label','Gráfico de pastel de composición de ingresos por categoría.');
}

// Llena la tabla Top Servicios
function crearTopServicios(homenajes) {
    const tbody = document.querySelector("#tablaTopServicios tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    const servicios = {};
    homenajes.forEach(item => {
        const servicio = String(item.Tipo_Excedente || "").trim().toUpperCase();
        if (!servicio || servicio === "SOAT" || servicio === "PENSIONADO") {
            return;
        }
        if (!servicios[servicio]) {
            servicios[servicio] = { cantidad: 0, valor: 0 };
        }
        servicios[servicio].cantidad += 1;
        servicios[servicio].valor += toNumber(item.Valor);
    });
    Object.entries(servicios)
        .sort((a, b) => b[1].valor - a[1].valor)
        .slice(0, 10)
        .forEach(([nombre, data]) => {
            const row = tbody.insertRow();
            const cell1 = row.insertCell(0);
            const cell2 = row.insertCell(1);
            const cell3 = row.insertCell(2);
            cell1.textContent = nombre;
            cell2.textContent = data.cantidad;
            cell3.textContent = `$${data.valor.toLocaleString("es-CO")}`;
        });
}

// Llena la tabla Ranking de Gestores
function crearRankingGestores(homenajes) {
    const tbody = document.querySelector("#tablaGestores tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    const gestores = {};
    homenajes.forEach(item => {
        const nombre = String(item.Gestor || "").trim();
        if (!nombre) return;
        const key = nombre.toUpperCase();
        if (!gestores[key]) {
            gestores[key] = { nombre, cantidad: 0, valor: 0 };
        }
        gestores[key].cantidad += 1;
        gestores[key].valor += toNumber(item.Valor);
    });
    const ranking = Object.values(gestores).sort((a, b) => b.valor - a.valor);
    ranking.forEach(item => {
        const row = tbody.insertRow();
        const cell1 = row.insertCell(0);
        const cell2 = row.insertCell(1);
        const cell3 = row.insertCell(2);
        cell1.textContent = item.nombre;
        cell2.textContent = item.cantidad;
        cell3.textContent = `$${item.valor.toLocaleString("es-CO")}`;
    });
}

// Gráfico Top 10 Gestores (barras horizontales)
function crearGraficoGestores(homenajes) {
    const canvas = document.getElementById("graficoGestores");
    if (!canvas) return;
    if (chartGestores) chartGestores.destroy();

    const gestores = {};
    homenajes.forEach(item => {
        const nombre = String(item.Gestor || "").trim();
        if (!nombre) return;
        const key = nombre.toUpperCase();
        if (!gestores[key]) {
            gestores[key] = { nombre, valor: 0 };
        }
        gestores[key].valor += toNumber(item.Valor);
    });
    const ranking = Object.values(gestores)
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 10);

    chartGestores = new Chart(canvas, {
        type: "bar",
        data: {
            labels: ranking.map(item => item.nombre),
            datasets: [{
                label: "Ventas",
                data: ranking.map(item => item.valor),
                backgroundColor: "rgba(37, 99, 235, 0.92)"
            }]
        },
        options: {
            indexAxis: "y", // barras horizontales
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: "Top 10 Gestores por Ventas" },
                legend: { display: false }
            },
            scales: {
                x: { beginAtZero: true }
            }
        }
    });
    canvas.setAttribute('role','img');
    canvas.setAttribute('aria-label','Gráfico de barras horizontal de top 10 gestores por ventas.');
}

// Indicadores ejecutivos (Mejor gestor, servicio top, meta diaria, proyección)
function crearIndicadoresEjecutivos(homenajes) {
    let gestores = {}, servicios = {};
    let ventaTotal = 0;
    homenajes.forEach(item => {
        const valor = toNumber(item.Valor);
        ventaTotal += valor;
        const gestor = String(item.Gestor || "").trim();
        if (gestor) {
            gestores[gestor] = (gestores[gestor] || 0) + valor;
        }
        const servicio = String(item.Tipo_Excedente || "").trim();
        if (servicio) {
            servicios[servicio] = (servicios[servicio] || 0) + 1;
        }
    });
    // Mejor gestor
    const mejorGestor = Object.entries(gestores).sort((a, b) => b[1] - a[1])[0];
    if (mejorGestor) {
        const mejorGestorEl = document.getElementById("mejorGestor");
        const ventaMejorGestorEl = document.getElementById("ventaMejorGestor");
        if (mejorGestorEl) mejorGestorEl.textContent = mejorGestor[0];
        if (ventaMejorGestorEl) {
            ventaMejorGestorEl.textContent = "$" + mejorGestor[1].toLocaleString("es-CO");
        }
    }
    // Servicio top
    const servicioTop = Object.entries(servicios).sort((a, b) => b[1] - a[1])[0];
    if (servicioTop) {
        const servicioTopEl = document.getElementById("servicioTop");
        const cantidadServicioTopEl = document.getElementById("cantidadServicioTop");
        if (servicioTopEl) servicioTopEl.textContent = servicioTop[0];
        if (cantidadServicioTopEl) cantidadServicioTopEl.textContent = servicioTop[1];
    }
    // Meta diaria y proyección
    const hoy = new Date();
    const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    const diaActual = hoy.getDate();
    const diasRestantes = diasMes - diaActual;
    const faltante = META_GRUPAL - ventaTotal;
    const metaDiaria = diasRestantes > 0 ? faltante / diasRestantes : 0;
    const proyeccionMes = diaActual > 0 ? (ventaTotal / diaActual) * diasMes : ventaTotal;
    const metaDiariaEl = document.getElementById("metaDiaria");
    const proyeccionMesEl = document.getElementById("proyeccionMes");
    if (metaDiariaEl) {
        metaDiariaEl.textContent = "$" + Math.round(metaDiaria).toLocaleString("es-CO");
    }
    if (proyeccionMesEl) {
        proyeccionMesEl.textContent = "$" + Math.round(proyeccionMes).toLocaleString("es-CO");
    }
}

// Velocímetro de cumplimiento grupal
function crearVelocimetroCumplimiento(ventaTotal) {
    const canvas = document.getElementById("velocimetroCumplimiento");
    if (!canvas) return;
    const porcentaje = META_GRUPAL > 0
        ? Math.min((ventaTotal / META_GRUPAL) * 100, 100)
        : 0;
    const restante = Math.max(100 - porcentaje, 0);
    const etiqueta =
        porcentaje >= 100 ? "META CUMPLIDA" :
        porcentaje >= 80 ? "EN RIESGO" :
        "BAJO META";
    const color =
        porcentaje >= 100 ? "#16a34a" :
        porcentaje >= 80 ? "#f59e0b" :
        "#dc2626";
    const texto = document.getElementById("cumplimientoVisual");
    if (texto) {
        texto.textContent = `${porcentaje.toFixed(1)}% - ${etiqueta}`;
        texto.style.color = color;
    }
    if (chartCumplimientoVisual) chartCumplimientoVisual.destroy();

    // Plugin para texto centrado
    const centerTextPlugin = {
        id: "centerTextPlugin",
        afterDraw(chart) {
            const { ctx, chartArea } = chart;
            if (!chartArea) return;
            const x = (chartArea.left + chartArea.right) / 2;
            const y = (chartArea.top + chartArea.bottom) / 2;
            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = color;
            ctx.font = "700 26px Segoe UI";
            ctx.fillText(`${porcentaje.toFixed(1)}%`, x, y - 10);
            ctx.fillStyle = "#334155";
            ctx.font = "600 13px Segoe UI";
            ctx.fillText(etiqueta, x, y + 18);
            ctx.restore();
        }
    };

    chartCumplimientoVisual = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: ["Avance", "Restante"],
            datasets: [{
                data: [porcentaje, restante],
                backgroundColor: [color, "#e5e7eb"],
                borderWidth: 0,
                cutout: "78%"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: "Cumplimiento Grupal" }
            }
        },
        plugins: [centerTextPlugin]
    });
    canvas.setAttribute('role','img');
    canvas.setAttribute('aria-label','Velocímetro de cumplimiento grupal.');
}

// Actualiza el semáforo gerencial (RED, PARTICULAR, EXCEDENTES)
function actualizarSemaforo(idEstado, idTexto, porcentaje, nombre) {
    const estado = document.getElementById(idEstado);
    const texto = document.getElementById(idTexto);
    if (!estado || !texto) return;
    let clase = "semaforo-danger", simbolo = "●", mensaje = "Bajo meta";
    if (porcentaje >= 100) {
        clase = "semaforo-ok"; simbolo = "✓"; mensaje = "Cumplido";
    } else if (porcentaje >= 80) {
        clase = "semaforo-warning"; simbolo = "!"; mensaje = "En riesgo";
    }
    estado.className = "semaforo-estado " + clase;
    estado.innerHTML = simbolo;
    texto.textContent = `${nombre}: ${porcentaje.toFixed(1)}% - ${mensaje}`;
}

// Construye el semáforo completo
function crearSemaforoGerencial(ventaRed, ventaParticular, ventaExcedentes) {
    const porcRed = META_RED > 0 ? (ventaRed / META_RED) * 100 : 0;
    const porcParticular = META_PARTICULAR > 0 ? (ventaParticular / META_PARTICULAR) * 100 : 0;
    const porcExcedentes = META_EXCEDENTES > 0 ? (ventaExcedentes / META_EXCEDENTES) * 100 : 0;
    actualizarSemaforo("semaforoRed", "semaforoRedTexto", porcRed, "RED");
    actualizarSemaforo("semaforoParticular", "semaforoParticularTexto", porcParticular, "PARTICULAR");
    actualizarSemaforo("semaforoExcedentes", "semaforoExcedentesTexto", porcExcedentes, "EXCEDENTES");
}

// Genera alertas automáticas basadas en el análisis de datos
function crearAlertasGerenciales(homenajes) {
    const contenedor = document.getElementById("alertasGerenciales");
    if (!contenedor) return;
    const alertas = [];
    const total = homenajes.reduce((acc, item) => acc + toNumber(item.Valor), 0);
    const porcGrupo = META_GRUPAL > 0 ? (total / META_GRUPAL) * 100 : 0;
    if (porcGrupo < 80) {
        alertas.push(`El cumplimiento grupal está en ${porcGrupo.toFixed(1)}%, por debajo del nivel esperado.`);
    }
    // Revisar concentración de ventas en un gestor
    const gestores = {};
    homenajes.forEach(item => {
        const gestor = String(item.Gestor || "").trim();
        if (!gestor) return;
        gestores[gestor] = (gestores[gestor] || 0) + toNumber(item.Valor);
    });
    const mejorGestor = Object.entries(gestores).sort((a,b) => b[1] - a[1])[0];
    if (mejorGestor && mejorGestor[1] > META_GRUPAL * 0.35) {
        alertas.push(`El gestor ${mejorGestor[0]} concentra una participación alta de ventas.`);
    }
    // Revisar excedentes por debajo de meta
    const excedentes = {};
    homenajes.forEach(item => {
        const ex = String(item.Tipo_Excedente || "").trim().toUpperCase();
        if (!ex || ex === "SOAT" || ex === "PENSIONADO") return;
        excedentes[ex] = (excedentes[ex] || 0) + toNumber(item.Valor);
    });
    const topExcedente = Object.entries(excedentes).sort((a,b) => b[1] - a[1])[0];
    if (topExcedente && METAS_EXCEDENTES[topExcedente[0]]) {
        const porcEx = (topExcedente[1] / METAS_EXCEDENTES[topExcedente[0]]) * 100;
        if (porcEx < 80) {
            alertas.push(`El excedente ${topExcedente[0]} está por debajo de meta.`);
        }
    }
    // Mostrar las alertas
    contenedor.innerHTML = "";
    if (alertas.length === 0) {
        const p = document.createElement("p");
        p.textContent = "Sin alertas por el momento.";
        contenedor.appendChild(p);
        return;
    }
    alertas.forEach(mensaje => {
        const div = document.createElement("div");
        div.className = "alerta-item";
        const icon = document.createElement("i");
        icon.className = "fas fa-circle-exclamation";
        icon.setAttribute("aria-hidden", "true");
        const span = document.createElement("span");
        span.textContent = mensaje;
        div.appendChild(icon);
        div.appendChild(span);
        contenedor.appendChild(div);
    });
}

// Inicializar evento de filtrado por fecha
document.getElementById("btnFiltrar")?.addEventListener("click", cargarDashboard);
cargarDashboard();
