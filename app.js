const API_URL =
"https://script.google.com/macros/s/AKfycbxEyu57a5spnJNju9t4654U8SDBrWFWQ0GWLibubGy5ntZsOV3N-TeL73423-a23j6FwA/exec";

let META_GRUPAL = 0;
let META_RED = 0;
let META_PARTICULAR = 0;
let META_EXCEDENTES = 0;

let METAS_EXCEDENTES = {};

let chartCumplimiento = null;
let chartIngresos = null;
let chartMensual = null;
let chartGestores = null;

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

async function cargarDashboard() {
    const response = await fetch(API_URL);
    const json = await response.json();

    const parametros = Array.isArray(json.parametros) ? json.parametros : [];
    const excedentesConfig = Array.isArray(json.excedentes) ? json.excedentes : [];
    const homenajes = Array.isArray(json.homenajes) ? json.homenajes : [];

    let homenajesFiltrados = [...homenajes];

    const fechaInicio = document.getElementById("fechaInicio")?.value;
    const fechaFin = document.getElementById("fechaFin")?.value;

    if (fechaInicio && fechaFin) {
        const inicio = new Date(`${fechaInicio}T00:00:00`);
        const fin = new Date(`${fechaFin}T23:59:59.999`);

        homenajesFiltrados = homenajes.filter(item => {
            const fecha = parseFecha(item.Fecha);
            return fecha && fecha >= inicio && fecha <= fin;
        });
    }

    METAS_EXCEDENTES = {};

    excedentesConfig.forEach((fila, index) => {
        if (index === 0) return;

        const nombre = String(fila[0] || "").trim().toUpperCase();
        const meta = toNumber(fila[1]);

        if (nombre) {
            METAS_EXCEDENTES[nombre] = meta;
        }
    });

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

    let ventaTotal = 0;
    let ventaRed = 0;
    let ventaParticular = 0;
    let ventaExcedentes = 0;

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

        if (
            excedente &&
            excedente !== "SOAT" &&
            excedente !== "PENSIONADO"
        ) {
            ventaExcedentes += valor;
        }
    });

    actualizarKPIs(
        ventaTotal,
        ventaRed,
        ventaParticular,
        ventaExcedentes
    );

    crearTablaCumplimiento(
        ventaRed,
        ventaParticular,
        ventaExcedentes
    );

    crearTablaExcedentes(
        homenajesFiltrados
    );

    llenarParticulares(
        homenajesFiltrados
    );

    crearGraficoIngresos(
        ventaRed,
        ventaParticular,
        ventaExcedentes
    );

    crearTopServicios(
        homenajesFiltrados
    );

    crearRankingGestores(
        homenajesFiltrados
    );

    crearGraficoMensual(
        homenajesFiltrados
    );

    crearGraficoGestores(
        homenajesFiltrados
    );

    crearIndicadoresEjecutivos(
        homenajesFiltrados
    );
}

function actualizarKPIs(
    ventaTotal,
    ventaRed,
    ventaParticular,
    ventaExcedentes
) {
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

    if (ventasEl) ventasEl.innerHTML = "$" + ventaTotal.toLocaleString("es-CO");
    if (cumplimientoEl) cumplimientoEl.innerHTML = cumplimientoGeneral + "%";
    if (faltanteEl) faltanteEl.innerHTML = "$" + faltante.toLocaleString("es-CO");
    if (proyeccionEl) proyeccionEl.innerHTML = cumplimientoGeneral + "%";
    if (ultimaActualizacionEl) {
        ultimaActualizacionEl.innerHTML = new Date().toLocaleString("es-CO");
    }

    const cumplimientoNumerico = Number(cumplimientoGeneral);

    if (cumplimientoEl) {
        if (cumplimientoNumerico >= 100) {
            cumplimientoEl.style.color = "#16a34a";
        } else if (cumplimientoNumerico >= 80) {
            cumplimientoEl.style.color = "#f59e0b";
        } else {
            cumplimientoEl.style.color = "#dc2626";
        }
    }

    crearGraficoCumplimiento(
        ventaRed,
        ventaParticular,
        ventaExcedentes
    );
}

function crearGraficoCumplimiento(
    ventaRed,
    ventaParticular,
    ventaExcedentes
) {
    const canvas = document.getElementById("ventasCategoria");
    if (!canvas) return;

    if (chartCumplimiento) {
        chartCumplimiento.destroy();
    }

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
                }
            },
            scales: {
                y: {
                    beginAtZero: true
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
        const excedente = String(item.Tipo_Excedente || "").toUpperCase().trim();

        if (
            excedente === "" ||
            excedente === "SOAT" ||
            excedente === "PENSIONADO"
        ) {
            return;
        }

        const valor = toNumber(item.Valor);

        reales[excedente] = (reales[excedente] || 0) + valor;
    });

    Object.keys(METAS_EXCEDENTES).forEach(nombre => {
        const meta = toNumber(METAS_EXCEDENTES[nombre]);
        const real = toNumber(reales[nombre]);
        const porcentaje = meta > 0 ? ((real / meta) * 100).toFixed(1) : "0.0";

        tbody.innerHTML += `
            <tr>
                <td>${nombre}</td>
                <td>$${meta.toLocaleString("es-CO")}</td>
                <td>$${real.toLocaleString("es-CO")}</td>
                <td>${porcentaje}%</td>
            </tr>
        `;
    });
}

function crearTablaCumplimiento(
    ventaRed,
    ventaParticular,
    ventaExcedentes
) {
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
                <td>$${item.meta.toLocaleString("es-CO")}</td>
                <td>$${item.real.toLocaleString("es-CO")}</td>
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

    [
        ["SOAT", soat],
        ["PENSIONADO", pensionado],
        ["PLANES", planes]
    ].forEach(item => {
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

function crearGraficoIngresos(
    ventaRed,
    ventaParticular,
    ventaExcedentes
) {
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
                        "rgba(255, 99, 132, 0.90)",
                        "rgba(54, 162, 235, 0.90)",
                        "rgba(255, 159, 64, 0.90)"
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
        const servicio = String(item.Tipo_Excedente || "").trim().toUpperCase();

        if (
            servicio === "" ||
            servicio === "SOAT" ||
            servicio === "PENSIONADO"
        ) {
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
            tbody.innerHTML += `
                <tr>
                    <td>${nombre}</td>
                    <td>${data.cantidad}</td>
                    <td>$${data.valor.toLocaleString("es-CO")}</td>
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
                }
            },
            scales: {
                y: {
                    beginAtZero: true
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

    ranking.forEach(item => {
        tbody.innerHTML += `
            <tr>
                <td>${item.nombre}</td>
                <td>${item.cantidad}</td>
                <td>$${item.valor.toLocaleString("es-CO")}</td>
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
                    backgroundColor: "rgba(37, 99, 235, 0.92)"
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
                    beginAtZero: true
                }
            }
        }
    });
}

function crearIndicadoresEjecutivos(homenajes) {
    let gestores = {};
    let servicios = {};
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

    if (mejorGestor) {
        const mejorGestorEl = document.getElementById("mejorGestor");
        const ventaMejorGestorEl = document.getElementById("ventaMejorGestor");

        if (mejorGestorEl) mejorGestorEl.innerHTML = mejorGestor[0];
        if (ventaMejorGestorEl) {
            ventaMejorGestorEl.innerHTML = "$" + mejorGestor[1].toLocaleString("es-CO");
        }
    }

    const servicioTop = Object.entries(servicios).sort((a, b) => b[1] - a[1])[0];

    if (servicioTop) {
        const servicioTopEl = document.getElementById("servicioTop");
        const cantidadServicioTopEl = document.getElementById("cantidadServicioTop");

        if (servicioTopEl) servicioTopEl.innerHTML = servicioTop[0];
        if (cantidadServicioTopEl) cantidadServicioTopEl.innerHTML = servicioTop[1];
    }

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
        metaDiariaEl.innerHTML = "$" + Math.round(metaDiaria).toLocaleString("es-CO");
    }

    if (proyeccionMesEl) {
        proyeccionMesEl.innerHTML = "$" + Math.round(proyeccionMes).toLocaleString("es-CO");
    }
}

document
.getElementById("btnFiltrar")
?.addEventListener(
    "click",
    cargarDashboard
);

cargarDashboard();
