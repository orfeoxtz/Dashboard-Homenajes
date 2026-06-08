const API_URL = "https://script.google.com/macros/s/AKfycbxEyu57a5spnJNju9t4654U8SDBrWFWQ0GWLibubGy5ntZsOV3N-TeL73423-a23j6FwA/exec";

let META_GRUPAL = 0;
let META_RED = 0;
let META_PARTICULAR = 0;
let META_EXCEDENTES = 0;
let METAS_EXCEDENTES = {};

let DATASET = [];
let DATASET_FILTRADO = [];

let chartCumplimiento = null;
let chartIngresos = null;
let chartMensual = null;
let chartGestores = null;
let chartCumplimientoVisual = null;
let chartVentasVista = null;
let chartVentasCategoriaVista = null;
let chartCumplimientoAnual = null;
let chartRankingCompletoGestores = null;
let chartExcedentes = null;
let chartHistorico = null;

if (typeof Chart !== "undefined" && typeof ChartAnnotation !== "undefined") {
    Chart.register(ChartAnnotation);
}

function toNumber(valor) {
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;

    const texto = String(valor ?? "").trim();
    if (!texto) return 0;

    const limpio = texto
        .replace(/\s/g, "")
        .replace(/\$/g, "")
        .replace(/\./g, "")
        .replace(/,/g, ".");

    const numero = Number(limpio);
    return Number.isFinite(numero) ? numero : 0;
}

function formatMoney(valor) {
    return "$" + Math.round(toNumber(valor)).toLocaleString("es-CO");
}

function normalizarTexto(valor) {
    return String(valor ?? "").trim().toUpperCase();
}

function parseFecha(valor) {
    if (valor instanceof Date && !isNaN(valor.getTime())) return valor;
    if (valor == null) return null;

    const texto = String(valor).trim();
    if (!texto) return null;

    const dmy = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmy) {
        const [, dd, mm, yyyy] = dmy;
        const fecha = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
        return isNaN(fecha.getTime()) ? null : fecha;
    }

    const fechaIso = new Date(texto);
    return isNaN(fechaIso.getTime()) ? null : fechaIso;
}

function mesKey(fecha) {
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    return `${mes}/${fecha.getFullYear()}`;
}

function ordenarMeses(keys) {
    return keys.sort((a, b) => {
        const [ma, ya] = a.split("/").map(Number);
        const [mb, yb] = b.split("/").map(Number);
        return ya - yb || ma - mb;
    });
}

function obtenerRangoFechas() {
    return {
        fechaInicio: document.getElementById("fechaInicio")?.value || "",
        fechaFin: document.getElementById("fechaFin")?.value || "",
        busqueda: normalizarTexto(document.getElementById("busquedaGeneral")?.value || "")
    };
}

function filtrarDataset(homenajes) {
    const { fechaInicio, fechaFin, busqueda } = obtenerRangoFechas();

    const inicio = fechaInicio ? new Date(`${fechaInicio}T00:00:00`) : new Date("1900-01-01T00:00:00");
    const fin = fechaFin ? new Date(`${fechaFin}T23:59:59.999`) : new Date("2999-12-31T23:59:59.999");

    return homenajes.filter(item => {
        const fecha = parseFecha(item.Fecha);
        const cumpleFecha = fecha && fecha >= inicio && fecha <= fin;

        const textoBusqueda = normalizarTexto(`
            ${item.Gestor || ""}
            ${item.Tipo_Homenaje || ""}
            ${item.Tipo_Excedente || ""}
            ${item.Servicio || ""}
            ${item.Categoria || ""}
        `);

        const cumpleBusqueda = !busqueda || textoBusqueda.includes(busqueda);

        return cumpleFecha && cumpleBusqueda;
    });
}

function calcularResumen(homenajes) {
    let total = 0;
    let red = 0;
    let particular = 0;
    let excedentes = 0;

    homenajes.forEach(item => {
        const valor = toNumber(item.Valor);
        total += valor;

        const tipo = normalizarTexto(item.Tipo_Homenaje);
        const ex = normalizarTexto(item.Tipo_Excedente);

        if (tipo === "RED") red += valor;
        if (tipo === "PARTICULAR") particular += valor;
        if (ex && ex !== "SOAT" && ex !== "PENSIONADO") excedentes += valor;
    });

    return { total, red, particular, excedentes };
}

function setEstadoApi(tipo, texto) {
    const estado = document.getElementById("estadoApi");
    if (!estado) return;

    estado.className = `estado-api ${tipo}`;
    estado.innerHTML = `<i class="fas fa-circle"></i> ${texto}`;
}

async function cargarDashboard() {
    setEstadoApi("cargando", "Cargando...");

    const alertasBox = document.getElementById("alertasGerenciales");
    if (alertasBox) alertasBox.innerHTML = "<p>Cargando información...</p>";

    try {
        const response = await fetch(API_URL, { cache: "no-store" });
        if (!response.ok) throw new Error(`Error HTTP ${response.status}`);

        const json = await response.json();

        const parametros = Array.isArray(json.parametros) ? json.parametros : [];
        const excedentesConfig = Array.isArray(json.excedentes) ? json.excedentes : [];
        const homenajes = Array.isArray(json.homenajes) ? json.homenajes : [];

        DATASET = homenajes;
        DATASET_FILTRADO = filtrarDataset(DATASET);
        METAS_EXCEDENTES = {};

        excedentesConfig.forEach((fila, index) => {
            if (index === 0) return;
            const nombre = normalizarTexto(fila[0]);
            const meta = toNumber(fila[1]);
            if (nombre) METAS_EXCEDENTES[nombre] = meta;
        });

        parametros.forEach(fila => {
            const clave = normalizarTexto(fila[0]);
            const valor = normalizarTexto(fila[1]);

            if (clave === "SEDE") META_GRUPAL = toNumber(fila[2]);
            if (clave === "META_CATEGORIA" && valor === "RED") META_RED = toNumber(fila[2]);
            if (clave === "META_CATEGORIA" && valor === "PARTICULAR") META_PARTICULAR = toNumber(fila[2]);
            if (clave === "META_CATEGORIA" && valor === "EXCEDENTES") META_EXCEDENTES = toNumber(fila[2]);
        });

        const resumen = calcularResumen(DATASET_FILTRADO);

        actualizarKPIs(resumen.total);
        crearGraficoCumplimiento(resumen.red, resumen.particular, resumen.excedentes);
        crearTablaCumplimiento(resumen.red, resumen.particular, resumen.excedentes);
        crearTablaExcedentes(DATASET_FILTRADO);
        llenarParticulares(DATASET_FILTRADO);
        crearGraficoIngresos(resumen.red, resumen.particular, resumen.excedentes);
        crearTopServicios(DATASET_FILTRADO);
        crearRankingGestores(DATASET_FILTRADO);
        crearGraficoMensual(DATASET_FILTRADO);
        crearGraficoGestores(DATASET_FILTRADO);
        crearIndicadoresEjecutivos(DATASET_FILTRADO);
        crearVelocimetroCumplimiento(resumen.total);
        crearSemaforoGerencial(resumen.red, resumen.particular, resumen.excedentes);
        crearAlertasGerenciales(DATASET_FILTRADO);
        renderizarVistasAdicionales(DATASET_FILTRADO);
        actualizarAdmin(DATASET, DATASET_FILTRADO);
        crearResumenEjecutivo(DATASET_FILTRADO, resumen);

        setEstadoApi("ok", "Conectado");

    } catch (error) {
        console.error("Error al cargar dashboard:", error);
        setEstadoApi("error", "Error API");

        if (alertasBox) {
            alertasBox.innerHTML = `
                <div class="alerta-item">
                    <i class="fas fa-triangle-exclamation"></i>
                    <span>No fue posible cargar la información del dashboard. Verifica conexión, permisos del Apps Script o estructura de datos.</span>
                </div>
            `;
        }
    }
}

function actualizarKPIs(ventaTotal) {
    const cumplimientoGeneral = META_GRUPAL > 0 ? (ventaTotal / META_GRUPAL) * 100 : 0;
    const faltante = META_GRUPAL - ventaTotal;

    const elementos = {
        metaGrupal: formatMoney(META_GRUPAL),
        ventas: formatMoney(ventaTotal),
        cumplimiento: `${cumplimientoGeneral.toFixed(1)}%`,
        faltante: formatMoney(faltante),
        proyeccion: `${cumplimientoGeneral.toFixed(1)}%`,
        ultimaActualizacion: new Date().toLocaleString("es-CO")
    };

    Object.keys(elementos).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = elementos[id];
    });

    const cumplimientoEl = document.getElementById("cumplimiento");
    if (cumplimientoEl) cumplimientoEl.style.color = colorPorPorcentaje(cumplimientoGeneral);
}

function colorPorPorcentaje(porcentaje) {
    if (porcentaje >= 100) return "#16a34a";
    if (porcentaje >= 80) return "#f59e0b";
    return "#dc2626";
}

function badgeEstado(porcentaje) {
    if (porcentaje >= 100) return `<span class="badge badge-ok">Cumplido</span>`;
    if (porcentaje >= 80) return `<span class="badge badge-warning">En riesgo</span>`;
    return `<span class="badge badge-danger">Bajo meta</span>`;
}

function crearGraficoCumplimiento(ventaRed, ventaParticular, ventaExcedentes) {
    const canvas = document.getElementById("ventasCategoria");
    if (!canvas) return;

    if (chartCumplimiento) chartCumplimiento.destroy();

    chartCumplimiento = new Chart(canvas, {
        type: "bar",
        data: {
            labels: ["RED", "PARTICULAR", "EXCEDENTES"],
            datasets: [
                {
                    label: "Meta",
                    data: [META_RED, META_PARTICULAR, META_EXCEDENTES],
                    backgroundColor: ["rgba(239,68,68,.72)", "rgba(37,99,235,.72)", "rgba(245,158,11,.72)"],
                    borderRadius: 10
                },
                {
                    label: "Real",
                    data: [ventaRed, ventaParticular, ventaExcedentes],
                    backgroundColor: ["rgba(22,163,74,.95)", "rgba(37,99,235,.95)", "rgba(245,158,11,.95)"],
                    borderRadius: 10
                }
            ]
        },
        options: opcionesChartBasicas("Meta vs Real por Categoría")
    });
}

function opcionesChartBasicas(titulo) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: { display: true, text: titulo },
            legend: { position: "top" }
        },
        scales: {
            y: { beginAtZero: true, grid: { color: "rgba(148,163,184,.22)" } },
            x: { grid: { display: false } }
        }
    };
}

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
        const porcentaje = item.meta > 0 ? (item.real / item.meta) * 100 : 0;
        tbody.innerHTML += `
            <tr>
                <td>${item.nombre}</td>
                <td>${formatMoney(item.meta)}</td>
                <td>${formatMoney(item.real)}</td>
                <td>${porcentaje.toFixed(1)}%</td>
                <td>${badgeEstado(porcentaje)}</td>
            </tr>
        `;
    });
}

function crearTablaExcedentes(homenajes) {
    const tbody = document.querySelector("#tablaExcedentes tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const reales = {};

    homenajes.forEach(item => {
        const excedente = normalizarTexto(item.Tipo_Excedente);
        if (!excedente || excedente === "SOAT" || excedente === "PENSIONADO") return;

        reales[excedente] = (reales[excedente] || 0) + toNumber(item.Valor);
    });

    const filas = Object.keys(METAS_EXCEDENTES);

    if (filas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5">Sin configuración de excedentes</td></tr>`;
        return;
    }

    filas.forEach(nombre => {
        const meta = toNumber(METAS_EXCEDENTES[nombre]);
        const real = toNumber(reales[nombre]);
        const porcentaje = meta > 0 ? (real / meta) * 100 : 0;

        tbody.innerHTML += `
            <tr>
                <td>${nombre}</td>
                <td>${formatMoney(meta)}</td>
                <td>${formatMoney(real)}</td>
                <td>${porcentaje.toFixed(1)}%</td>
                <td>${badgeEstado(porcentaje)}</td>
            </tr>
        `;
    });
}

function llenarParticulares(homenajes) {
    const tbody = document.querySelector("#tablaParticulares tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    let soat = 0;
    let pensionado = 0;
    let planes = 0;

    homenajes.forEach(item => {
        const tipo = normalizarTexto(item.Tipo_Homenaje);
        const excedente = normalizarTexto(item.Tipo_Excedente);
        const cantidad = toNumber(item.Cantidad || 1);

        if (tipo === "PLAN") planes += cantidad;
        if (excedente === "SOAT") soat += cantidad;
        if (excedente === "PENSIONADO") pensionado += cantidad;
    });

    const total = soat + pensionado + planes;
    const datos = [["SOAT", soat], ["PENSIONADO", pensionado], ["PLANES", planes]];

    if (total === 0) {
        tbody.innerHTML = `<tr><td colspan="3">Sin registros</td></tr>`;
        return;
    }

    datos.forEach(item => {
        const porcentaje = total > 0 ? (item[1] / total) * 100 : 0;
        tbody.innerHTML += `
            <tr>
                <td>${item[0]}</td>
                <td>${item[1]}</td>
                <td>${porcentaje.toFixed(1)}%</td>
            </tr>
        `;
    });
}

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
                backgroundColor: ["rgba(239,68,68,.95)", "rgba(37,99,235,.95)", "rgba(245,158,11,.95)"],
                borderColor: "#ffffff",
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: "Composición de Ingresos" },
                legend: { position: "top" }
            }
        }
    });
}

function crearTopServicios(homenajes) {
    const tbody = document.querySelector("#tablaTopServicios tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const servicios = {};

    homenajes.forEach(item => {
        const servicio = normalizarTexto(item.Tipo_Excedente);
        if (!servicio || servicio === "SOAT" || servicio === "PENSIONADO") return;

        if (!servicios[servicio]) servicios[servicio] = { cantidad: 0, valor: 0 };

        servicios[servicio].cantidad += 1;
        servicios[servicio].valor += toNumber(item.Valor);
    });

    const ranking = Object.entries(servicios)
        .sort((a, b) => b[1].valor - a[1].valor)
        .slice(0, 10);

    if (ranking.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3">Sin registros</td></tr>`;
        return;
    }

    ranking.forEach(([nombre, data]) => {
        tbody.innerHTML += `
            <tr>
                <td>${nombre}</td>
                <td>${data.cantidad}</td>
                <td>${formatMoney(data.valor)}</td>
            </tr>
        `;
    });
}

function crearRankingGestores(homenajes) {
    const tbody = document.querySelector("#tablaGestores tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const gestores = {};
    const total = homenajes.reduce((acc, item) => acc + toNumber(item.Valor), 0);

    homenajes.forEach(item => {
        const nombre = String(item.Gestor || "").trim();
        if (!nombre) return;

        const llave = nombre.toUpperCase();

        if (!gestores[llave]) {
            gestores[llave] = { nombre, cantidad: 0, valor: 0 };
        }

        gestores[llave].cantidad += 1;
        gestores[llave].valor += toNumber(item.Valor);
    });

    const ranking = Object.values(gestores).sort((a, b) => b.valor - a.valor);

    if (ranking.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4">Sin registros</td></tr>`;
        return;
    }

    ranking.forEach(item => {
        const participacion = total > 0 ? (item.valor / total) * 100 : 0;

        tbody.innerHTML += `
            <tr>
                <td>${item.nombre}</td>
                <td>${item.cantidad}</td>
                <td>${formatMoney(item.valor)}</td>
                <td>${participacion.toFixed(1)}%</td>
            </tr>
        `;
    });
}

function crearGraficoMensual(homenajes) {
    const canvas = document.getElementById("ventasMensuales");
    if (!canvas) return;

    if (chartMensual) chartMensual.destroy();

    const ventasMes = {};

    homenajes.forEach(item => {
        const fecha = parseFecha(item.Fecha);
        if (!fecha) return;

        const llave = mesKey(fecha);
        ventasMes[llave] = (ventasMes[llave] || 0) + toNumber(item.Valor);
    });

    const etiquetas = ordenarMeses(Object.keys(ventasMes));
    const valores = etiquetas.map(clave => ventasMes[clave]);

    chartMensual = new Chart(canvas, {
        type: "line",
        data: {
            labels: etiquetas,
            datasets: [{
                label: "Ventas Mensuales",
                data: valores,
                backgroundColor: "rgba(0,166,81,.16)",
                borderColor: "#00a651",
                borderWidth: 4,
                pointBackgroundColor: "#00a651",
                pointBorderColor: "#ffffff",
                pointBorderWidth: 2,
                pointRadius: 5,
                fill: true,
                tension: .35
            }]
        },
        options: opcionesChartBasicas("Tendencia de Ventas Mensuales")
    });
}

function crearGraficoGestores(homenajes) {
    const canvas = document.getElementById("graficoGestores");
    if (!canvas) return;

    if (chartGestores) chartGestores.destroy();

    const gestores = {};

    homenajes.forEach(item => {
        const nombre = String(item.Gestor || "").trim();
        if (!nombre) return;

        const llave = nombre.toUpperCase();
        if (!gestores[llave]) gestores[llave] = { nombre, valor: 0 };

        gestores[llave].valor += toNumber(item.Valor);
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
                backgroundColor: "rgba(37,99,235,.95)",
                borderRadius: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: "y",
            plugins: {
                title: { display: true, text: "Top 10 Gestores por Ventas" },
                legend: { display: false }
            },
            scales: {
                x: { beginAtZero: true, grid: { color: "rgba(148,163,184,.22)" } },
                y: { grid: { display: false } }
            }
        }
    });
}

function crearIndicadoresEjecutivos(homenajes) {
    const gestores = {};
    const servicios = {};
    let ventaTotal = 0;

    homenajes.forEach(item => {
        const valor = toNumber(item.Valor);
        ventaTotal += valor;

        const gestor = String(item.Gestor || "").trim();
        if (gestor) gestores[gestor] = (gestores[gestor] || 0) + valor;

        const servicio = String(item.Tipo_Excedente || "").trim();
        if (servicio) servicios[servicio] = (servicios[servicio] || 0) + 1;
    });

    const mejorGestor = Object.entries(gestores).sort((a, b) => b[1] - a[1])[0];
    const servicioTop = Object.entries(servicios).sort((a, b) => b[1] - a[1])[0];

    setHtml("mejorGestor", mejorGestor ? mejorGestor[0] : "-");
    setHtml("ventaMejorGestor", mejorGestor ? formatMoney(mejorGestor[1]) : formatMoney(0));
    setHtml("servicioTop", servicioTop ? servicioTop[0] : "-");
    setHtml("cantidadServicioTop", servicioTop ? servicioTop[1] : "0");

    const hoy = new Date();
    const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    const diaActual = hoy.getDate();
    const diasRestantes = Math.max(diasMes - diaActual, 0);

    const faltante = META_GRUPAL - ventaTotal;
    const metaDiaria = diasRestantes > 0 ? faltante / diasRestantes : 0;
    const proyeccionMes = diaActual > 0 ? (ventaTotal / diaActual) * diasMes : ventaTotal;

    setHtml("metaDiaria", formatMoney(metaDiaria));
    setHtml("proyeccionMes", formatMoney(proyeccionMes));
}

function setHtml(id, valor) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = valor;
}

function crearVelocimetroCumplimiento(ventaTotal) {
    const canvas = document.getElementById("velocimetroCumplimiento");
    if (!canvas) return;

    const porcentajeReal = META_GRUPAL > 0 ? (ventaTotal / META_GRUPAL) * 100 : 0;
    const porcentaje = Math.min(porcentajeReal, 100);
    const restante = Math.max(100 - porcentaje, 0);

    const etiqueta = porcentajeReal >= 100 ? "META CUMPLIDA" : porcentajeReal >= 80 ? "EN RIESGO" : "BAJO META";
    const color = colorPorPorcentaje(porcentajeReal);

    const texto = document.getElementById("cumplimientoVisual");
    if (texto) {
        texto.innerHTML = `${porcentajeReal.toFixed(1)}% - ${etiqueta}`;
        texto.style.color = color;
    }

    if (chartCumplimientoVisual) chartCumplimientoVisual.destroy();

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
            ctx.font = "800 28px Segoe UI";
            ctx.fillText(`${porcentajeReal.toFixed(1)}%`, x, y - 10);
            ctx.fillStyle = "#334155";
            ctx.font = "700 13px Segoe UI";
            ctx.fillText(etiqueta, x, y + 20);
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
        plugins: [centerTextPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: "Cumplimiento Grupal" }
            }
        }
    });
}

function actualizarSemaforo(idEstado, idTexto, porcentaje, nombre) {
    const estado = document.getElementById(idEstado);
    const texto = document.getElementById(idTexto);
    if (!estado || !texto) return;

    let clase = "semaforo-danger";
    let simbolo = "●";
    let mensaje = "Bajo meta";

    if (porcentaje >= 100) {
        clase = "semaforo-ok";
        simbolo = "✓";
        mensaje = "Cumplido";
    } else if (porcentaje >= 80) {
        clase = "semaforo-warning";
        simbolo = "!";
        mensaje = "En riesgo";
    }

    estado.className = "semaforo-estado " + clase;
    estado.innerHTML = simbolo;
    texto.innerHTML = `${nombre}: ${porcentaje.toFixed(1)}% - ${mensaje}`;
}

function crearSemaforoGerencial(ventaRed, ventaParticular, ventaExcedentes) {
    actualizarSemaforo("semaforoRed", "semaforoRedTexto", META_RED > 0 ? (ventaRed / META_RED) * 100 : 0, "RED");
    actualizarSemaforo("semaforoParticular", "semaforoParticularTexto", META_PARTICULAR > 0 ? (ventaParticular / META_PARTICULAR) * 100 : 0, "PARTICULAR");
    actualizarSemaforo("semaforoExcedentes", "semaforoExcedentesTexto", META_EXCEDENTES > 0 ? (ventaExcedentes / META_EXCEDENTES) * 100 : 0, "EXCEDENTES");
}

function crearAlertasGerenciales(homenajes) {
    const contenedor = document.getElementById("alertasGerenciales");
    if (!contenedor) return;

    const alertas = [];
    const total = homenajes.reduce((acc, item) => acc + toNumber(item.Valor), 0);
    const porcGrupo = META_GRUPAL > 0 ? (total / META_GRUPAL) * 100 : 0;

    if (homenajes.length === 0) {
        contenedor.innerHTML = `<p>No hay registros para el filtro seleccionado.</p>`;
        return;
    }

    if (porcGrupo < 80) {
        alertas.push(`El cumplimiento grupal está en ${porcGrupo.toFixed(1)}%, por debajo del nivel esperado.`);
    }

    if (porcGrupo >= 100) {
        alertas.push(`La meta grupal se encuentra cumplida con un avance de ${porcGrupo.toFixed(1)}%.`);
    }

    const gestores = {};
    homenajes.forEach(item => {
        const gestor = String(item.Gestor || "").trim();
        if (!gestor) return;
        gestores[gestor] = (gestores[gestor] || 0) + toNumber(item.Valor);
    });

    const mejorGestor = Object.entries(gestores).sort((a, b) => b[1] - a[1])[0];
    if (mejorGestor && total > 0 && mejorGestor[1] / total > 0.35) {
        alertas.push(`El gestor ${mejorGestor[0]} concentra más del 35% de las ventas filtradas.`);
    }

    if (alertas.length === 0) {
        contenedor.innerHTML = `<p>Sin alertas por el momento.</p>`;
        return;
    }

    contenedor.innerHTML = alertas.map(a => `
        <div class="alerta-item">
            <i class="fas fa-circle-exclamation"></i>
            <span>${a}</span>
        </div>
    `).join("");
}

function crearResumenEjecutivo(homenajes, resumen) {
    const el = document.getElementById("resumenEjecutivoTexto");
    if (!el) return;

    const cumplimiento = META_GRUPAL > 0 ? (resumen.total / META_GRUPAL) * 100 : 0;
    const faltante = META_GRUPAL - resumen.total;

    let estado = "por debajo de la meta";
    if (cumplimiento >= 100) estado = "con la meta cumplida";
    else if (cumplimiento >= 80) estado = "cerca del cumplimiento esperado";

    el.innerHTML = `
        El dashboard presenta ${homenajes.length} registros filtrados, con ventas acumuladas por 
        <strong>${formatMoney(resumen.total)}</strong>, equivalentes al 
        <strong>${cumplimiento.toFixed(1)}%</strong> de cumplimiento. 
        El estado general se encuentra <strong>${estado}</strong>. 
        Faltante estimado: <strong>${formatMoney(faltante)}</strong>.
    `;
}

function crearGraficoVentasVista(homenajes) {
    const canvas = document.getElementById("ventasAnuales");
    if (!canvas) return;

    if (chartVentasVista) chartVentasVista.destroy();

    const ventasMes = {};
    homenajes.forEach(item => {
        const fecha = parseFecha(item.Fecha);
        if (!fecha) return;

        const llave = mesKey(fecha);
        ventasMes[llave] = (ventasMes[llave] || 0) + toNumber(item.Valor);
    });

    const etiquetas = ordenarMeses(Object.keys(ventasMes));
    const valores = etiquetas.map(k => ventasMes[k]);

    chartVentasVista = new Chart(canvas, {
        type: "bar",
        data: {
            labels: etiquetas,
            datasets: [{
                label: "Ventas",
                data: valores,
                backgroundColor: "rgba(0,166,81,.92)",
                borderRadius: 10
            }]
        },
        options: opcionesChartBasicas("Ventas Mensuales Acumuladas")
    });
}

function crearGraficoCategoriaVista(resumen) {
    const canvas = document.getElementById("ventasPorCategoriaVista");
    if (!canvas) return;

    if (chartVentasCategoriaVista) chartVentasCategoriaVista.destroy();

    chartVentasCategoriaVista = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: ["RED", "PARTICULAR", "EXCEDENTES"],
            datasets: [{
                data: [resumen.red, resumen.particular, resumen.excedentes],
                backgroundColor: ["rgba(239,68,68,.95)", "rgba(37,99,235,.95)", "rgba(245,158,11,.95)"],
                borderColor: "#fff",
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: "Participación por Categoría" },
                legend: { position: "top" }
            }
        }
    });
}

function crearGraficoCumplimientoAnual(homenajes) {
    const canvas = document.getElementById("cumplimientoAnual");
    if (!canvas) return;

    if (chartCumplimientoAnual) chartCumplimientoAnual.destroy();

    const mensual = {};
    homenajes.forEach(item => {
        const fecha = parseFecha(item.Fecha);
        if (!fecha) return;

        const llave = mesKey(fecha);
        mensual[llave] = (mensual[llave] || 0) + toNumber(item.Valor);
    });

    const etiquetas = ordenarMeses(Object.keys(mensual));
    const valores = etiquetas.map(k => mensual[k]);
    const metaMensual = META_GRUPAL > 0 ? META_GRUPAL / 12 : 0;
    const porcentaje = valores.map(v => metaMensual > 0 ? (v / metaMensual) * 100 : 0);

    chartCumplimientoAnual = new Chart(canvas, {
        type: "line",
        data: {
            labels: etiquetas,
            datasets: [
                {
                    label: "% Cumplimiento mensual",
                    data: porcentaje,
                    borderColor: "#7c3aed",
                    backgroundColor: "rgba(124,58,237,.13)",
                    fill: true,
                    tension: .3,
                    pointRadius: 5
                },
                {
                    label: "Meta 100%",
                    data: etiquetas.map(() => 100),
                    borderColor: "#ef4444",
                    borderDash: [8, 6],
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: opcionesChartBasicas("Cumplimiento Mensual vs Meta")
    });
}

function crearGraficoRankingCompletoGestores(homenajes) {
    const canvas = document.getElementById("rankingCompletoGestores");
    if (!canvas) return;

    if (chartRankingCompletoGestores) chartRankingCompletoGestores.destroy();

    const gestores = {};

    homenajes.forEach(item => {
        const nombre = String(item.Gestor || "").trim();
        if (!nombre) return;

        gestores[nombre] = (gestores[nombre] || 0) + toNumber(item.Valor);
    });

    const ranking = Object.entries(gestores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);

    chartRankingCompletoGestores = new Chart(canvas, {
        type: "bar",
        data: {
            labels: ranking.map(([nombre]) => nombre),
            datasets: [{
                label: "Valor vendido",
                data: ranking.map(([, valor]) => valor),
                backgroundColor: "rgba(37,99,235,.92)",
                borderRadius: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: "y",
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true },
                y: { grid: { display: false } }
            }
        }
    });
}

function crearGraficoExcedentes(homenajes) {
    const canvas = document.getElementById("graficoExcedentes");
    if (!canvas) return;

    if (chartExcedentes) chartExcedentes.destroy();

    const excedentes = {};

    homenajes.forEach(item => {
        const ex = normalizarTexto(item.Tipo_Excedente);
        if (!ex || ex === "SOAT" || ex === "PENSIONADO") return;

        excedentes[ex] = (excedentes[ex] || 0) + toNumber(item.Valor);
    });

    const ranking = Object.entries(excedentes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12);

    chartExcedentes = new Chart(canvas, {
        type: "bar",
        data: {
            labels: ranking.map(([nombre]) => nombre),
            datasets: [{
                label: "Excedentes",
                data: ranking.map(([, valor]) => valor),
                backgroundColor: "rgba(245,158,11,.92)",
                borderRadius: 10
            }]
        },
        options: opcionesChartBasicas("Excedentes por Valor")
    });
}

function crearGraficoHistorico(homenajes) {
    const canvas = document.getElementById("graficoHistorico");
    if (!canvas) return;

    if (chartHistorico) chartHistorico.destroy();

    const mensual = {};

    homenajes.forEach(item => {
        const fecha = parseFecha(item.Fecha);
        if (!fecha) return;

        const llave = mesKey(fecha);
        mensual[llave] = (mensual[llave] || 0) + toNumber(item.Valor);
    });

    const etiquetas = ordenarMeses(Object.keys(mensual));
    const valores = etiquetas.map(k => mensual[k]);

    chartHistorico = new Chart(canvas, {
        type: "line",
        data: {
            labels: etiquetas,
            datasets: [{
                label: "Ventas históricas",
                data: valores,
                borderColor: "#00a651",
                backgroundColor: "rgba(0,166,81,.13)",
                fill: true,
                tension: .35,
                pointRadius: 5,
                pointBackgroundColor: "#00a651"
            }]
        },
        options: opcionesChartBasicas("Serie Histórica de Ventas")
    });
}

function renderizarVistasAdicionales(homenajes) {
    const resumen = calcularResumen(homenajes);

    crearGraficoVentasVista(homenajes);
    crearGraficoCategoriaVista(resumen);
    crearGraficoCumplimientoAnual(homenajes);
    crearGraficoRankingCompletoGestores(homenajes);
    crearGraficoExcedentes(homenajes);
    crearGraficoHistorico(homenajes);
}

function actualizarAdmin(totalOriginal, totalFiltrado) {
    setHtml("adminMetaGeneral", formatMoney(META_GRUPAL));
    setHtml("adminUltimaActualizacion", new Date().toLocaleString("es-CO"));
    setHtml("adminTotalRegistros", `${totalFiltrado.length} / ${totalOriginal.length}`);

    const { fechaInicio, fechaFin, busqueda } = obtenerRangoFechas();

    let texto = "Sin filtro";
    if (fechaInicio || fechaFin || busqueda) {
        texto = `${fechaInicio || "inicio"} - ${fechaFin || "fin"}`;
        if (busqueda) texto += ` | Búsqueda: ${busqueda}`;
    }

    setHtml("adminRangoFechas", texto);
}

function cambiarVista(seccion) {
    document.querySelectorAll(".menu-item").forEach(item => item.classList.remove("active"));
    document.querySelectorAll(".vista").forEach(v => v.classList.remove("active-view"));

    const itemMenu = document.querySelector(`.menu-item[data-seccion="${seccion}"]`);
    if (itemMenu) itemMenu.classList.add("active");

    const vista = document.getElementById(seccion);
    if (vista) vista.classList.add("active-view");

    setTimeout(redimensionarGraficos, 150);
}

function redimensionarGraficos() {
    [
        chartCumplimiento,
        chartIngresos,
        chartMensual,
        chartGestores,
        chartCumplimientoVisual,
        chartVentasVista,
        chartVentasCategoriaVista,
        chartCumplimientoAnual,
        chartRankingCompletoGestores,
        chartExcedentes,
        chartHistorico
    ].forEach(chart => {
        if (chart && typeof chart.resize === "function") chart.resize();
    });
}

function exportarExcel() {
    if (typeof XLSX === "undefined") return;

    const hojaDatos = DATASET_FILTRADO.map(item => ({
        Fecha: item.Fecha || "",
        Gestor: item.Gestor || "",
        Tipo_Homenaje: item.Tipo_Homenaje || "",
        Tipo_Excedente: item.Tipo_Excedente || "",
        Cantidad: toNumber(item.Cantidad || 1),
        Valor: toNumber(item.Valor)
    }));

    const resumen = calcularResumen(DATASET_FILTRADO);

    const wsResumen = XLSX.utils.aoa_to_sheet([
        ["Indicador", "Valor"],
        ["Meta Grupal", META_GRUPAL],
        ["Ventas Totales", resumen.total],
        ["Cumplimiento %", META_GRUPAL > 0 ? (resumen.total / META_GRUPAL) * 100 : 0],
        ["Red", resumen.red],
        ["Particular", resumen.particular],
        ["Excedentes", resumen.excedentes],
        ["Registros Filtrados", DATASET_FILTRADO.length]
    ]);

    const wsDatos = XLSX.utils.json_to_sheet(hojaDatos);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen Ejecutivo");
    XLSX.utils.book_append_sheet(wb, wsDatos, "Base Filtrada");

    XLSX.writeFile(wb, "dashboard_gerencial_4k.xlsx");
}

function exportarPDF() {
    const elemento = document.getElementById("panelExportar");
    if (!elemento || typeof html2pdf === "undefined") return;

    const opciones = {
        margin: 0.2,
        filename: "dashboard_gerencial_4k.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "in", format: "a4", orientation: "landscape" },
        pagebreak: { mode: ["css", "legacy"] }
    };

    html2pdf().set(opciones).from(elemento).save();
}

function alternarTema() {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem("dashboardTema", document.body.classList.contains("dark-mode") ? "dark" : "light");
    setTimeout(redimensionarGraficos, 150);
}

function alternarSidebar() {
    document.body.classList.toggle("sidebar-collapsed");
    localStorage.setItem("dashboardSidebar", document.body.classList.contains("sidebar-collapsed") ? "collapsed" : "expanded");
    setTimeout(redimensionarGraficos, 250);
}

function pantallaCompleta() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
    } else {
        document.exitFullscreen?.();
    }
}

function limpiarFiltros() {
    const fechaInicio = document.getElementById("fechaInicio");
    const fechaFin = document.getElementById("fechaFin");
    const busqueda = document.getElementById("busquedaGeneral");

    if (fechaInicio) fechaInicio.value = "";
    if (fechaFin) fechaFin.value = "";
    if (busqueda) busqueda.value = "";

    cargarDashboard();
}

function aplicarPreferencias() {
    const tema = localStorage.getItem("dashboardTema");
    const sidebar = localStorage.getItem("dashboardSidebar");

    if (tema === "dark") document.body.classList.add("dark-mode");
    if (sidebar === "collapsed") document.body.classList.add("sidebar-collapsed");
}

document.querySelectorAll(".menu-item").forEach(item => {
    item.addEventListener("click", () => cambiarVista(item.dataset.seccion));
});

document.getElementById("btnFiltrar")?.addEventListener("click", cargarDashboard);
document.getElementById("btnRecargar")?.addEventListener("click", cargarDashboard);
document.getElementById("btnLimpiar")?.addEventListener("click", limpiarFiltros);
document.getElementById("btnPdf")?.addEventListener("click", exportarPDF);
document.getElementById("btnExcel")?.addEventListener("click", exportarExcel);
document.getElementById("btnTema")?.addEventListener("click", alternarTema);
document.getElementById("btnSidebar")?.addEventListener("click", alternarSidebar);
document.getElementById("btnFull")?.addEventListener("click", pantallaCompleta);

document.getElementById("busquedaGeneral")?.addEventListener("keyup", event => {
    if (event.key === "Enter") cargarDashboard();
});

aplicarPreferencias();
cargarDashboard();
