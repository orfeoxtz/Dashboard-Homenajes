const API_URL = "https://script.google.com/macros/s/AKfycbxEyu57a5spnJNju9t4654U8SDBrWFWQ0GWLibubGy5ntZsOV3N-TeL73423-a23j6FwA/exec";

let META_GRUPAL = 0;
let META_RED = 0;
let META_PARTICULAR = 0;
let META_EXCEDENTES = 0;
let METAS_EXCEDENTES = {};

let chartCumplimiento = null;
let chartIngresos = null;
let chartMensual = null;
let chartGestores = null;
let chartCumplimientoVisual = null;

if (typeof Chart !== "undefined" && typeof ChartAnnotation !== "undefined") {
    Chart.register(ChartAnnotation);
}

function toNumber(valor) {
    if (typeof valor === "number") {
        return Number.isFinite(valor) ? valor : 0;
    }

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

function formatPercent(valor, decimales = 1) {
    const n = Number.isFinite(valor) ? valor : 0;
    return `${n.toFixed(decimales)}%`;
}

function parseFecha(valor) {
    if (valor instanceof Date && !isNaN(valor.getTime())) {
        return valor;
    }

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
    if (!isNaN(fechaIso.getTime())) {
        return fechaIso;
    }

    return null;
}

function normalizarTexto(valor) {
    return String(valor ?? "").trim().toUpperCase();
}

function obtenerHomenajesFiltrados(homenajes) {
    const fechaInicio = document.getElementById("fechaInicio")?.value;
    const fechaFin = document.getElementById("fechaFin")?.value;

    if (!fechaInicio && !fechaFin) {
        return [...homenajes];
    }

    const inicio = fechaInicio ? new Date(`${fechaInicio}T00:00:00`) : new Date("1900-01-01T00:00:00");
    const fin = fechaFin ? new Date(`${fechaFin}T23:59:59.999`) : new Date("2999-12-31T23:59:59.999");

    return homenajes.filter(item => {
        const fecha = parseFecha(item.Fecha);
        return fecha && fecha >= inicio && fecha <= fin;
    });
}

async function cargarDashboard() {
    const alertasBox = document.getElementById("alertasGerenciales");
    if (alertasBox) {
        alertasBox.innerHTML = "<p>Cargando información...</p>";
    }

    try {
        const response = await fetch(API_URL, { cache: "no-store" });

        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
        }

        const json = await response.json();

        const parametros = Array.isArray(json.parametros) ? json.parametros : [];
        const excedentesConfig = Array.isArray(json.excedentes) ? json.excedentes : [];
        const homenajes = Array.isArray(json.homenajes) ? json.homenajes : [];

        let homenajesFiltrados = obtenerHomenajesFiltrados(homenajes);

        METAS_EXCEDENTES = {};

        excedentesConfig.forEach((fila, index) => {
            if (index === 0) return;

            const nombre = normalizarTexto(fila[0]);
            const meta = toNumber(fila[1]);

            if (nombre) {
                METAS_EXCEDENTES[nombre] = meta;
            }
        });

        parametros.forEach(fila => {
            const clave = normalizarTexto(fila[0]);
            const valor = normalizarTexto(fila[1]);

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

        let ventaTotal = 0;
        let ventaRed = 0;
        let ventaParticular = 0;
        let ventaExcedentes = 0;

        homenajesFiltrados.forEach(item => {
            const valor = toNumber(item.Valor);
            ventaTotal += valor;

            const tipo = normalizarTexto(item.Tipo_Homenaje);
            const excedente = normalizarTexto(item.Tipo_Excedente);

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

        actualizarKPIs(ventaTotal);
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

    } catch (error) {
        console.error("Error al cargar dashboard:", error);

        const alertasBox = document.getElementById("alertasGerenciales");
        if (alertasBox) {
            alertasBox.innerHTML = `
                <div class="alerta-item">
                    <i class="fas fa-triangle-exclamation"></i>
                    <span>No fue posible cargar la información del dashboard.</span>
                </div>
            `;
        }
    }
}

function actualizarKPIs(ventaTotal) {
    const cumplimientoGeneral = META_GRUPAL > 0
        ? ((ventaTotal / META_GRUPAL) * 100)
        : 0;

    const faltante = META_GRUPAL - ventaTotal;

    const ventasEl = document.getElementById("ventas");
    const metaGrupalEl = document.getElementById("metaGrupal");
    const cumplimientoEl = document.getElementById("cumplimiento");
    const faltanteEl = document.getElementById("faltante");
    const proyeccionEl = document.getElementById("proyeccion");
    const ultimaActualizacionEl = document.getElementById("ultimaActualizacion");

    if (metaGrupalEl) metaGrupalEl.innerHTML = formatMoney(META_GRUPAL);
    if (ventasEl) ventasEl.innerHTML = formatMoney(ventaTotal);
    if (cumplimientoEl) cumplimientoEl.innerHTML = formatPercent(cumplimientoGeneral);
    if (faltanteEl) faltanteEl.innerHTML = formatMoney(faltante);
    if (proyeccionEl) proyeccionEl.innerHTML = formatPercent(cumplimientoGeneral);

    if (ultimaActualizacionEl) {
        ultimaActualizacionEl.innerHTML = new Date().toLocaleString("es-CO");
    }

    if (cumplimientoEl) {
        if (cumplimientoGeneral >= 100) {
            cumplimientoEl.style.color = "#16a34a";
        } else if (cumplimientoGeneral >= 80) {
            cumplimientoEl.style.color = "#f59e0b";
        } else {
            cumplimientoEl.style.color = "#dc2626";
        }
    }
}

function crearGraficoCumplimiento(ventaRed, ventaParticular, ventaExcedentes) {
    const canvas = document.getElementById("ventasCategoria");
    if (!canvas) return;

    if (chartCumplimiento) {
        chartCumplimiento.destroy();
    }

    chartCumplimiento = new Chart(canvas, {
        type: "bar",
        data: {
            labels: ["RED", "PARTICULAR", "EXCEDENTES"],
            datasets: [
                {
                    label: "Meta",
                    data: [META_RED, META_PARTICULAR, META_EXCEDENTES],
                    backgroundColor: [
                        "rgba(255, 99, 132, 0.72)",
                        "rgba(54, 162, 235, 0.72)",
                        "rgba(255, 159, 64, 0.72)"
                    ],
                    borderRadius: 10
                },
                {
                    label: "Real",
                    data: [ventaRed, ventaParticular, ventaExcedentes],
                    backgroundColor: [
                        "rgba(16, 185, 129, 0.95)",
                        "rgba(37, 99, 235, 0.95)",
                        "rgba(245, 158, 11, 0.95)"
                    ],
                    borderRadius: 10
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: "Meta vs Real"
                },
                annotation: {
                    annotations: {
                        metaRed: {
                            type: "line",
                            yMin: META_RED,
                            yMax: META_RED,
                            borderColor: "#ff2d55",
                            borderWidth: 3,
                            borderDash: [10, 6],
                            label: {
                                display: true,
                                content: "Meta RED"
                            }
                        },
                        metaParticular: {
                            type: "line",
                            yMin: META_PARTICULAR,
                            yMax: META_PARTICULAR,
                            borderColor: "#8b5cf6",
                            borderWidth: 3,
                            borderDash: [10, 6],
                            label: {
                                display: true,
                                content: "Meta PARTICULAR"
                            }
                        },
                        metaExcedentes: {
                            type: "line",
                            yMin: META_EXCEDENTES,
                            yMax: META_EXCEDENTES,
                            borderColor: "#f59e0b",
                            borderWidth: 3,
                            borderDash: [10, 6],
                            label: {
                                display: true,
                                content: "Meta EXCEDENTES"
                            }
                        }
                    }
                },
                legend: {
                    position: "top"
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: "rgba(148,163,184,.2)"
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function crearTablaExcedentes(homenajes) {
    const tbody = document.querySelector("#tablaExcedentes tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const reales = {};

    homenajes.forEach(item => {
        const excedente = normalizarTexto(item.Tipo_Excedente);

        if (!excedente || excedente === "SOAT" || excedente === "PENSIONADO") {
            return;
        }

        const valor = toNumber(item.Valor);
        reales[excedente] = (reales[excedente] || 0) + valor;
    });

    const filas = Object.keys(METAS_EXCEDENTES);

    if (filas.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4">Sin configuración de excedentes</td>
            </tr>
        `;
        return;
    }

    filas.forEach(nombre => {
        const meta = toNumber(METAS_EXCEDENTES[nombre]);
        const real = toNumber(reales[nombre]);
        const porcentaje = meta > 0 ? ((real / meta) * 100).toFixed(1) : "0.0";

        tbody.innerHTML += `
            <tr>
                <td>${nombre}</td>
                <td>${formatMoney(meta)}</td>
                <td>${formatMoney(real)}</td>
                <td>${porcentaje}%</td>
            </tr>
        `;
    });
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
        const porcentaje = item.meta > 0 ? ((item.real / item.meta) * 100).toFixed(1) : "0.0";

        tbody.innerHTML += `
            <tr>
                <td>${item.nombre}</td>
                <td>${formatMoney(item.meta)}</td>
                <td>${formatMoney(item.real)}</td>
                <td>${porcentaje}%</td>
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

    const datos = [
        ["SOAT", soat],
        ["PENSIONADO", pensionado],
        ["PLANES", planes]
    ];

    if (total === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3">Sin registros</td>
            </tr>
        `;
        return;
    }

    datos.forEach(item => {
        const porcentaje = total > 0 ? ((item[1] / total) * 100).toFixed(1) : "0.0";

        tbody.innerHTML += `
            <tr>
                <td>${item[0]}</td>
                <td>${item[1]}</td>
                <td>${porcentaje}%</td>
            </tr>
        `;
    });
}

function crearGraficoIngresos(ventaRed, ventaParticular, ventaExcedentes) {
    const canvas = document.getElementById("composicionIngresos");
    if (!canvas) return;

    if (chartIngresos) {
        chartIngresos.destroy();
    }

    chartIngresos = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: ["RED", "PARTICULAR", "EXCEDENTES"],
            datasets: [
                {
                    data: [ventaRed, ventaParticular, ventaExcedentes],
                    backgroundColor: [
                        "rgba(255, 99, 132, 0.95)",
                        "rgba(54, 162, 235, 0.95)",
                        "rgba(255, 159, 64, 0.95)"
                    ],
                    borderColor: "#ffffff",
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: "Composición de Ingresos"
                },
                legend: {
                    position: "top"
                }
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

        if (!servicio || servicio === "SOAT" || servicio === "PENSIONADO") {
            return;
        }

        if (!servicios[servicio]) {
            servicios[servicio] = { cantidad: 0, valor: 0 };
        }

        servicios[servicio].cantidad += 1;
        servicios[servicio].valor += toNumber(item.Valor);
    });

    const ranking = Object.entries(servicios)
        .sort((a, b) => b[1].valor - a[1].valor)
        .slice(0, 10);

    if (ranking.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3">Sin registros</td>
            </tr>
        `;
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

function crearGraficoMensual(homenajes) {
    const canvas = document.getElementById("ventasMensuales");
    if (!canvas) return;

    if (chartMensual) {
        chartMensual.destroy();
    }

    const ventasMes = {};

    homenajes.forEach(item => {
        const fecha = parseFecha(item.Fecha);
        if (!fecha) return;

        const mes = String(fecha.getMonth() + 1).padStart(2, "0");
        const anio = fecha.getFullYear();
        const llave = `${mes}/${anio}`;

        if (!ventasMes[llave]) {
            ventasMes[llave] = 0;
        }

        ventasMes[llave] += toNumber(item.Valor);
    });

    const etiquetas = Object.keys(ventasMes).sort((a, b) => {
        const [ma, ya] = a.split("/").map(Number);
        const [mb, yb] = b.split("/").map(Number);
        return ya - yb || ma - mb;
    });

    const valores = etiquetas.map(clave => ventasMes[clave]);

    chartMensual = new Chart(canvas, {
        type: "line",
        data: {
            labels: etiquetas,
            datasets: [
                {
                    label: "Ventas Mensuales",
                    data: valores,
                    backgroundColor: "rgba(0, 166, 81, 0.18)",
                    borderColor: "#00a651",
                    borderWidth: 4,
                    pointBackgroundColor: "#00a651",
                    pointBorderColor: "#ffffff",
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 8,
                    fill: true,
                    tension: 0.35
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: "Tendencia de Ventas Mensuales"
                },
                annotation: {
                    annotations: {
                        metaGrupal: {
                            type: "line",
                            yMin: META_GRUPAL,
                            yMax: META_GRUPAL,
                            borderColor: "#ff2d55",
                            borderWidth: 4,
                            borderDash: [10, 6],
                            label: {
                                display: true,
                                content: "Meta Grupal"
                            }
                        }
                    }
                },
                legend: {
                    display: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: "rgba(148,163,184,.2)"
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function crearRankingGestores(homenajes) {
    const tbody = document.querySelector("#tablaGestores tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const gestores = {};

    homenajes.forEach(item => {
        const nombre = String(item.Gestor || "").trim();
        if (!nombre) return;

        const llave = nombre.toUpperCase();

        if (!gestores[llave]) {
            gestores[llave] = {
                nombre,
                cantidad: 0,
                valor: 0
            };
        }

        gestores[llave].cantidad += 1;
        gestores[llave].valor += toNumber(item.Valor);
    });

    const ranking = Object.values(gestores).sort((a, b) => b.valor - a.valor);

    if (ranking.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3">Sin registros</td>
            </tr>
        `;
        return;
    }

    ranking.forEach(item => {
        tbody.innerHTML += `
            <tr>
                <td>${item.nombre}</td>
                <td>${item.cantidad}</td>
                <td>${formatMoney(item.valor)}</td>
            </tr>
        `;
    });
}

function crearGraficoGestores(homenajes) {
    const canvas = document.getElementById("graficoGestores");
    if (!canvas) return;

    if (chartGestores) {
        chartGestores.destroy();
    }

    const gestores = {};

    homenajes.forEach(item => {
        const nombre = String(item.Gestor || "").trim();
        if (!nombre) return;

        const llave = nombre.toUpperCase();

        if (!gestores[llave]) {
            gestores[llave] = {
                nombre,
                valor: 0
            };
        }

        gestores[llave].valor += toNumber(item.Valor);
    });

    const ranking = Object.values(gestores)
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 10);

    chartGestores = new Chart(canvas, {
        type: "bar",
        data: {
            labels: ranking.map(item => item.nombre),
            datasets: [
                {
                    label: "Ventas",
                    data: ranking.map(item => item.valor),
                    backgroundColor: "rgba(37, 99, 235, 0.95)",
                    borderRadius: 10
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: "y",
            plugins: {
                title: {
                    display: true,
                    text: "Top 10 Gestores por Ventas"
                },
                annotation: {
                    annotations: {
                        metaReferencia: {
                            type: "line",
                            xMin: META_GRUPAL / 10,
                            xMax: META_GRUPAL / 10,
                            borderColor: "#ff2d55",
                            borderWidth: 4,
                            borderDash: [10, 6],
                            label: {
                                display: true,
                                content: "Referencia"
                            }
                        }
                    }
                },
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        color: "rgba(148,163,184,.2)"
                    }
                },
                y: {
                    grid: {
                        display: false
                    }
                }
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
        if (gestor) {
            if (!gestores[gestor]) {
                gestores[gestor] = 0;
            }
            gestores[gestor] += valor;
        }

        const servicio = String(item.Tipo_Excedente || "").trim();
        if (servicio) {
            if (!servicios[servicio]) {
                servicios[servicio] = 0;
            }
            servicios[servicio]++;
        }
    });

    const mejorGestor = Object.entries(gestores).sort((a, b) => b[1] - a[1])[0];
    const servicioTop = Object.entries(servicios).sort((a, b) => b[1] - a[1])[0];

    const mejorGestorEl = document.getElementById("mejorGestor");
    const ventaMejorGestorEl = document.getElementById("ventaMejorGestor");
    const servicioTopEl = document.getElementById("servicioTop");
    const cantidadServicioTopEl = document.getElementById("cantidadServicioTop");

    if (mejorGestorEl) {
        mejorGestorEl.innerHTML = mejorGestor ? mejorGestor[0] : "-";
    }

    if (ventaMejorGestorEl) {
        ventaMejorGestorEl.innerHTML = mejorGestor ? formatMoney(mejorGestor[1]) : formatMoney(0);
    }

    if (servicioTopEl) {
        servicioTopEl.innerHTML = servicioTop ? servicioTop[0] : "-";
    }

    if (cantidadServicioTopEl) {
        cantidadServicioTopEl.innerHTML = servicioTop ? servicioTop[1] : "0";
    }

    const hoy = new Date();
    const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    const diaActual = hoy.getDate();
    const diasRestantes = Math.max(diasMes - diaActual, 0);

    const faltante = META_GRUPAL - ventaTotal;
    const metaDiaria = diasRestantes > 0 ? faltante / diasRestantes : 0;
    const proyeccionMes = diaActual > 0 ? (ventaTotal / diaActual) * diasMes : ventaTotal;

    const metaDiariaEl = document.getElementById("metaDiaria");
    const proyeccionMesEl = document.getElementById("proyeccionMes");

    if (metaDiariaEl) {
        metaDiariaEl.innerHTML = formatMoney(metaDiaria);
    }

    if (proyeccionMesEl) {
        proyeccionMesEl.innerHTML = formatMoney(proyeccionMes);
    }
}

function crearVelocimetroCumplimiento(ventaTotal) {
    const canvas = document.getElementById("velocimetroCumplimiento");
    if (!canvas) return;

    const porcentaje = META_GRUPAL > 0
        ? Math.min((ventaTotal / META_GRUPAL) * 100, 100)
        : 0;

    const restante = Math.max(100 - porcentaje, 0);

    const etiqueta =
        porcentaje >= 100
            ? "META CUMPLIDA"
            : porcentaje >= 80
                ? "EN RIESGO"
                : "BAJO META";

    const color =
        porcentaje >= 100
            ? "#16a34a"
            : porcentaje >= 80
                ? "#f59e0b"
                : "#dc2626";

    const texto = document.getElementById("cumplimientoVisual");
    if (texto) {
        texto.innerHTML = `${porcentaje.toFixed(1)}% - ${etiqueta}`;
        texto.style.color = color;
    }

    if (chartCumplimientoVisual) {
        chartCumplimientoVisual.destroy();
    }

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
            datasets: [
                {
                    data: [porcentaje, restante],
                    backgroundColor: [color, "#e5e7eb"],
                    borderWidth: 0,
                    cutout: "78%"
                }
            ]
        },
        plugins: [centerTextPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: "Cumplimiento Grupal"
                }
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
    const porcRed = META_RED > 0 ? (ventaRed / META_RED) * 100 : 0;
    const porcParticular = META_PARTICULAR > 0 ? (ventaParticular / META_PARTICULAR) * 100 : 0;
    const porcExcedentes = META_EXCEDENTES > 0 ? (ventaExcedentes / META_EXCEDENTES) * 100 : 0;

    actualizarSemaforo("semaforoRed", "semaforoRedTexto", porcRed, "RED");
    actualizarSemaforo("semaforoParticular", "semaforoParticularTexto", porcParticular, "PARTICULAR");
    actualizarSemaforo("semaforoExcedentes", "semaforoExcedentesTexto", porcExcedentes, "EXCEDENTES");
}

function crearAlertasGerenciales(homenajes) {
    const contenedor = document.getElementById("alertasGerenciales");
    if (!contenedor) return;

    const alertas = [];

    const total = homenajes.reduce((acc, item) => acc + toNumber(item.Valor), 0);
    const porcGrupo = META_GRUPAL > 0 ? (total / META_GRUPAL) * 100 : 0;

    if (porcGrupo < 80) {
        alertas.push(`El cumplimiento grupal está en ${porcGrupo.toFixed(1)}%, por debajo del nivel esperado.`);
    }

    const gestores = {};
    homenajes.forEach(item => {
        const gestor = String(item.Gestor || "").trim();
        if (!gestor) return;
        gestores[gestor] = (gestores[gestor] || 0) + toNumber(item.Valor);
    });

    const mejorGestor = Object.entries(gestores).sort((a, b) => b[1] - a[1])[0];
    if (mejorGestor && mejorGestor[1] > META_GRUPAL * 0.35) {
        alertas.push(`El gestor ${mejorGestor[0]} concentra una participación alta de ventas.`);
    }

    const excedentes = {};
    homenajes.forEach(item => {
        const ex = normalizarTexto(item.Tipo_Excedente);
        if (!ex || ex === "SOAT" || ex === "PENSIONADO") return;
        excedentes[ex] = (excedentes[ex] || 0) + toNumber(item.Valor);
    });

    const topExcedente = Object.entries(excedentes).sort((a, b) => b[1] - a[1])[0];
    if (topExcedente && METAS_EXCEDENTES[topExcedente[0]]) {
        const porcEx = (topExcedente[1] / METAS_EXCEDENTES[topExcedente[0]]) * 100;
        if (porcEx < 80) {
            alertas.push(`El excedente ${topExcedente[0]} está por debajo de meta.`);
        }
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

document.getElementById("btnFiltrar")?.addEventListener("click", cargarDashboard);

cargarDashboard();
