console.log("APP.JS CARGADO CORRECTAMENTE");

const API_URL = "https://script.google.com/macros/s/AKfycbxEyu57a5spnJNju9t4654U8SDBrWFWQ0GWLibubGy5ntZsOV3N-TeL73423-a23j6FwA/exec";

const META_MENSUAL_BASE = 219133881;
const META_TRIMESTRAL_BASE = META_MENSUAL_BASE * 3;
const META_SEMESTRAL_BASE = META_MENSUAL_BASE * 6;
const META_ANUAL_BASE = META_MENSUAL_BASE * 12;

let META_RANGO_ACTUAL = 0;
let MESES_EQUIVALENTES_ACTUAL = 0;
let DIAS_RANGO_ACTUAL = 0;

let DATASET = [];
let DATASET_FILTRADO = [];

let chartMetaReal = null;
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
let chartMetasAcumuladas = null;

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

function normalizarTexto(valor) {
    return String(valor ?? "").trim().toUpperCase();
}

function setHtml(id, valor) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = valor;
}

function getCampo(item, posibles) {
    for (const campo of posibles) {
        if (item[campo] !== undefined && item[campo] !== null && String(item[campo]).trim() !== "") {
            return item[campo];
        }
    }
    return "";
}

function getFechaItem(item) {
    return getCampo(item, ["Fecha", "FECHA", "fecha", "Fecha_Homenaje", "FECHA_HOMENAJE"]);
}

function getValorItem(item) {
    return getCampo(item, ["Valor", "VALOR", "valor", "Valor_Homenaje", "VALOR_HOMENAJE", "Total", "TOTAL"]);
}

function getGestorItem(item) {
    return getCampo(item, ["Gestor", "GESTOR", "gestor", "Asesor", "ASESOR", "Vendedor", "VENDEDOR"]);
}

function getTipoHomenajeItem(item) {
    return getCampo(item, ["Tipo_Homenaje", "TIPO_HOMENAJE", "Tipo Homenaje", "TIPO HOMENAJE", "Categoria", "CATEGORIA"]);
}

function getTipoExcedenteItem(item) {
    return getCampo(item, ["Tipo_Excedente", "TIPO_EXCEDENTE", "Tipo Excedente", "TIPO EXCEDENTE", "Servicio", "SERVICIO", "Excedente", "EXCEDENTE"]);
}

function convertirArrayAObjetos(tabla) {
    if (!Array.isArray(tabla) || tabla.length === 0) return [];

    if (typeof tabla[0] === "object" && !Array.isArray(tabla[0])) {
        return tabla;
    }

    if (Array.isArray(tabla[0])) {
        const encabezados = tabla[0].map(h => String(h || "").trim());

        return tabla.slice(1).map(fila => {
            const obj = {};
            encabezados.forEach((encabezado, index) => {
                obj[encabezado] = fila[index];
            });
            return obj;
        });
    }

    return [];
}

function obtenerHomenajesDesdeApi(json) {
    if (Array.isArray(json.homenajes)) return convertirArrayAObjetos(json.homenajes);
    if (Array.isArray(json.datos)) return convertirArrayAObjetos(json.datos);
    if (Array.isArray(json.data)) return convertirArrayAObjetos(json.data);
    if (Array.isArray(json.registros)) return convertirArrayAObjetos(json.registros);
    if (Array.isArray(json)) return convertirArrayAObjetos(json);
    return [];
}

function parseFecha(valor) {
    if (valor instanceof Date && !isNaN(valor.getTime())) return valor;

    if (typeof valor === "number") {
        if (valor > 20000) {
            const fechaExcel = new Date(Math.round((valor - 25569) * 86400 * 1000));
            return isNaN(fechaExcel.getTime()) ? null : fechaExcel;
        }
    }

    if (valor == null) return null;

    const texto = String(valor).trim();
    if (!texto) return null;

    const dmy = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
        const [, dd, mm, yyyy] = dmy;
        const fecha = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
        return isNaN(fecha.getTime()) ? null : fecha;
    }

    const ymd = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (ymd) {
        const [, yyyy, mm, dd] = ymd;
        const fecha = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
        return isNaN(fecha.getTime()) ? null : fecha;
    }

    const fechaIso = new Date(texto);
    return isNaN(fechaIso.getTime()) ? null : fechaIso;
}

function fechaISO(fecha) {
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, "0");
    const dd = String(fecha.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function inicioDia(fecha) {
    return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 0, 0, 0, 0);
}

function inicioMes(fecha) {
    return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
}

function finMes(fecha) {
    return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0);
}

function diasDelMes(fecha) {
    return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
}

function diasEntre(fechaInicio, fechaFin) {
    const inicio = inicioDia(fechaInicio);
    const fin = inicioDia(fechaFin);
    return Math.floor((fin - inicio) / 86400000) + 1;
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

function establecerFechasPorDefecto() {
    const fechaInicio = document.getElementById("fechaInicio");
    const fechaFin = document.getElementById("fechaFin");

    if (!fechaInicio || !fechaFin) return;

    if (!fechaInicio.value && !fechaFin.value) {
        const hoy = new Date();
        const enero = new Date(hoy.getFullYear(), 0, 1);

        fechaInicio.value = fechaISO(enero);
        fechaFin.value = fechaISO(hoy);
    }
}

function calcularMetaPorRango(fechaInicioTexto, fechaFinTexto) {
    let inicio = fechaInicioTexto ? new Date(`${fechaInicioTexto}T00:00:00`) : null;
    let fin = fechaFinTexto ? new Date(`${fechaFinTexto}T23:59:59`) : null;

    if (!inicio || isNaN(inicio.getTime())) {
        const hoy = new Date();
        inicio = new Date(hoy.getFullYear(), 0, 1);
    }

    if (!fin || isNaN(fin.getTime())) {
        fin = new Date();
    }

    if (fin < inicio) {
        const temp = inicio;
        inicio = fin;
        fin = temp;
    }

    let cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    const limite = new Date(fin.getFullYear(), fin.getMonth(), 1);

    let meta = 0;
    let mesesEquivalentes = 0;
    let detalleMeses = [];

    while (cursor <= limite) {
        const mesInicio = inicioMes(cursor);
        const mesFin = finMes(cursor);

        const desde = inicio > mesInicio ? inicioDia(inicio) : mesInicio;
        const hasta = fin < mesFin ? inicioDia(fin) : mesFin;

        const diasSeleccionados = diasEntre(desde, hasta);
        const totalDiasMes = diasDelMes(cursor);

        const factorMes = diasSeleccionados / totalDiasMes;
        const metaMes = META_MENSUAL_BASE * factorMes;

        meta += metaMes;
        mesesEquivalentes += factorMes;

        detalleMeses.push({
            mes: mesKey(cursor),
            diasSeleccionados,
            totalDiasMes,
            factorMes,
            metaMes
        });

        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    const diasRango = diasEntre(inicio, fin);

    return {
        inicio,
        fin,
        meta,
        mesesEquivalentes,
        diasRango,
        detalleMeses
    };
}

function filtrarDataset(homenajes) {
    const { fechaInicio, fechaFin, busqueda } = obtenerRangoFechas();

    const inicio = fechaInicio ? new Date(`${fechaInicio}T00:00:00`) : new Date("1900-01-01T00:00:00");
    const fin = fechaFin ? new Date(`${fechaFin}T23:59:59.999`) : new Date("2999-12-31T23:59:59.999");

    return homenajes.filter(item => {
        const fecha = parseFecha(getFechaItem(item));
        const cumpleFecha = fecha && fecha >= inicio && fecha <= fin;

        const textoBusqueda = normalizarTexto(`
            ${getGestorItem(item)}
            ${getTipoHomenajeItem(item)}
            ${getTipoExcedenteItem(item)}
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
        const valor = toNumber(getValorItem(item));
        total += valor;

        const tipo = normalizarTexto(getTipoHomenajeItem(item));
        const excedente = normalizarTexto(getTipoExcedenteItem(item));

        if (tipo === "RED") red += valor;
        else if (tipo === "PARTICULAR") particular += valor;
        else if (excedente && excedente !== "SOAT" && excedente !== "PENSIONADO") excedentes += valor;
    });

    return { total, red, particular, excedentes };
}

function setEstadoApi(tipo, texto) {
    const estado = document.getElementById("estadoApi");
    if (!estado) return;

    estado.className = `estado-api ${tipo}`;
    estado.innerHTML = `<i class="fas fa-circle"></i> ${texto}`;

    setHtml("adminEstadoConexion", texto);
}

async function cargarDashboard() {
    setEstadoApi("cargando", "Cargando...");

    const alertasBox = document.getElementById("alertasGerenciales");
    if (alertasBox) alertasBox.innerHTML = "<p>Cargando información...</p>";

    try {
        const response = await fetch(API_URL, { cache: "no-store" });
        if (!response.ok) throw new Error(`Error HTTP ${response.status}`);

        const json = await response.json();

        console.log("RESPUESTA API:", json);

        const homenajes = obtenerHomenajesDesdeApi(json);

        DATASET = homenajes;
        DATASET_FILTRADO = filtrarDataset(DATASET);

        const { fechaInicio, fechaFin } = obtenerRangoFechas();
        const metaInfo = calcularMetaPorRango(fechaInicio, fechaFin);

        META_RANGO_ACTUAL = metaInfo.meta;
        MESES_EQUIVALENTES_ACTUAL = metaInfo.mesesEquivalentes;
        DIAS_RANGO_ACTUAL = metaInfo.diasRango;

        const resumen = calcularResumen(DATASET_FILTRADO);

        actualizarKPIs(resumen, metaInfo);
        crearResumenEjecutivo(DATASET_FILTRADO, resumen, metaInfo);
        crearGraficoMetaReal(resumen.total, META_RANGO_ACTUAL);
        crearGraficoIngresos(resumen);
        crearGraficoMensual(DATASET_FILTRADO);
        crearVelocimetroCumplimiento(resumen.total);
        crearTablaCumplimiento(resumen.total);
        crearTablaCategorias(DATASET_FILTRADO, resumen.total);
        crearTablaExcedentes(DATASET_FILTRADO, resumen.total);
        crearTopServicios(DATASET_FILTRADO, resumen.total);
        crearRankingGestores(DATASET_FILTRADO, resumen.total);
        crearGraficoGestores(DATASET_FILTRADO);
        crearSemaforoGerencial(resumen.total);
        crearAlertasGerenciales(DATASET_FILTRADO, resumen.total);
        renderizarVistasAdicionales(DATASET_FILTRADO);
        actualizarAdmin(DATASET, DATASET_FILTRADO, metaInfo);
        actualizarVistaMetas(metaInfo);

        setEstadoApi("ok", "Conectado");

    } catch (error) {
        console.error("Error al cargar dashboard:", error);
        setEstadoApi("error", "Error API");

        if (alertasBox) {
            alertasBox.innerHTML = `
                <div class="alerta-item">
                    <i class="fas fa-triangle-exclamation"></i>
                    <span>No fue posible cargar la información. Verifica que app.js esté bien pegado, que el Apps Script esté publicado y que la API entregue datos.</span>
                </div>
            `;
        }
    }
}

function colorPorPorcentaje(porcentaje) {
    if (porcentaje >= 100) return "#16a34a";
    if (porcentaje >= 80) return "#f59e0b";
    return "#dc2626";
}

function textoEstado(porcentaje) {
    if (porcentaje >= 100) return "Meta cumplida";
    if (porcentaje >= 80) return "En riesgo controlado";
    return "Bajo meta";
}

function badgeEstado(porcentaje) {
    if (porcentaje >= 100) return `<span class="badge badge-ok">Cumplido</span>`;
    if (porcentaje >= 80) return `<span class="badge badge-warning">En riesgo</span>`;
    return `<span class="badge badge-danger">Bajo meta</span>`;
}

function actualizarKPIs(resumen, metaInfo) {
    const ventaTotal = resumen.total;
    const cumplimientoGeneral = META_RANGO_ACTUAL > 0 ? (ventaTotal / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - ventaTotal, 0);

    const promedioDiarioMeta = DIAS_RANGO_ACTUAL > 0 ? META_RANGO_ACTUAL / DIAS_RANGO_ACTUAL : 0;
    const promedioDiarioReal = DIAS_RANGO_ACTUAL > 0 ? ventaTotal / DIAS_RANGO_ACTUAL : 0;

    const proyeccion = promedioDiarioReal * DIAS_RANGO_ACTUAL;
    const ticketPromedio = DATASET_FILTRADO.length > 0 ? ventaTotal / DATASET_FILTRADO.length : 0;

    setHtml("metaGrupal", formatMoney(META_RANGO_ACTUAL));
    setHtml("ventas", formatMoney(ventaTotal));
    setHtml("cumplimiento", `${cumplimientoGeneral.toFixed(1)}%`);
    setHtml("faltante", formatMoney(faltante));
    setHtml("proyeccion", formatMoney(proyeccion));
    setHtml("metaMensual", formatMoney(META_MENSUAL_BASE));
    setHtml("metaTrimestral", formatMoney(META_TRIMESTRAL_BASE));
    setHtml("metaSemestral", formatMoney(META_SEMESTRAL_BASE));
    setHtml("metaAnual", formatMoney(META_ANUAL_BASE));
    setHtml("mesesEquivalentes", MESES_EQUIVALENTES_ACTUAL.toFixed(2));
    setHtml("metaDiaria", formatMoney(promedioDiarioMeta));
    setHtml("promedioDiarioReal", formatMoney(promedioDiarioReal));
    setHtml("totalRegistros", DATASET_FILTRADO.length);
    setHtml("ticketPromedio", formatMoney(ticketPromedio));
    setHtml("ultimaActualizacion", new Date().toLocaleString("es-CO"));
    setHtml("estadoCumplimientoTexto", textoEstado(cumplimientoGeneral));

    const desde = fechaISO(metaInfo.inicio);
    const hasta = fechaISO(metaInfo.fin);
    setHtml("metaRangoDetalle", `${desde} a ${hasta}`);

    const cumplimientoEl = document.getElementById("cumplimiento");
    if (cumplimientoEl) cumplimientoEl.style.color = colorPorPorcentaje(cumplimientoGeneral);
}

function crearResumenEjecutivo(homenajes, resumen, metaInfo) {
    const el = document.getElementById("resumenEjecutivoTexto");
    if (!el) return;

    const cumplimiento = META_RANGO_ACTUAL > 0 ? (resumen.total / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - resumen.total, 0);

    let estado = "por debajo de la meta establecida";
    if (cumplimiento >= 100) estado = "con la meta cumplida";
    else if (cumplimiento >= 80) estado = "cerca del cumplimiento esperado";

    el.innerHTML = `
        El rango seleccionado comprende <strong>${MESES_EQUIVALENTES_ACTUAL.toFixed(2)} meses equivalentes</strong>, 
        con una meta calculada de <strong>${formatMoney(META_RANGO_ACTUAL)}</strong>. 
        Las ventas acumuladas son <strong>${formatMoney(resumen.total)}</strong>, equivalentes al 
        <strong>${cumplimiento.toFixed(1)}%</strong> de cumplimiento. 
        Actualmente el resultado se encuentra <strong>${estado}</strong>. 
        Faltante para cumplimiento: <strong>${formatMoney(faltante)}</strong>. 
        Registros analizados: <strong>${homenajes.length}</strong>.
    `;
}

function opcionesChartBasicas(titulo) {
    return {
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
            title:{ display:true, text:titulo },
            legend:{ position:"top" }
        },
        scales:{
            y:{ beginAtZero:true, grid:{ color:"rgba(148,163,184,.22)" } },
            x:{ grid:{ display:false } }
        }
    };
}

function crearGraficoMetaReal(ventaTotal, metaRango) {
    const canvas = document.getElementById("graficoMetaReal");
    if (!canvas) return;

    if (chartMetaReal) chartMetaReal.destroy();

    chartMetaReal = new Chart(canvas, {
        type:"bar",
        data:{
            labels:["Meta del rango", "Venta real"],
            datasets:[{
                label:"Valor",
                data:[metaRango, ventaTotal],
                backgroundColor:["rgba(37,99,235,.85)", "rgba(0,166,81,.90)"],
                borderRadius:12
            }]
        },
        options:opcionesChartBasicas("Meta calculada vs venta real")
    });
}

function crearGraficoIngresos(resumen) {
    const canvas = document.getElementById("composicionIngresos");
    if (!canvas) return;

    if (chartIngresos) chartIngresos.destroy();

    chartIngresos = new Chart(canvas, {
        type:"doughnut",
        data:{
            labels:["RED", "PARTICULAR", "EXCEDENTES"],
            datasets:[{
                data:[resumen.red, resumen.particular, resumen.excedentes],
                backgroundColor:[
                    "rgba(239,68,68,.95)",
                    "rgba(37,99,235,.95)",
                    "rgba(245,158,11,.95)"
                ],
                borderColor:"#ffffff",
                borderWidth:2
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            plugins:{
                title:{ display:true, text:"Composición de ingresos" },
                legend:{ position:"top" }
            }
        }
    });
}

function crearGraficoMensual(homenajes) {
    const canvas = document.getElementById("ventasMensuales");
    if (!canvas) return;

    if (chartMensual) chartMensual.destroy();

    const ventasMes = {};

    homenajes.forEach(item => {
        const fecha = parseFecha(getFechaItem(item));
        if (!fecha) return;

        const llave = mesKey(fecha);
        ventasMes[llave] = (ventasMes[llave] || 0) + toNumber(getValorItem(item));
    });

    const etiquetas = ordenarMeses(Object.keys(ventasMes));
    const valores = etiquetas.map(clave => ventasMes[clave]);
    const metas = etiquetas.map(() => META_MENSUAL_BASE);

    chartMensual = new Chart(canvas, {
        type:"line",
        data:{
            labels:etiquetas,
            datasets:[
                {
                    label:"Venta mensual",
                    data:valores,
                    backgroundColor:"rgba(0,166,81,.16)",
                    borderColor:"#00a651",
                    borderWidth:4,
                    pointBackgroundColor:"#00a651",
                    pointBorderColor:"#ffffff",
                    pointBorderWidth:2,
                    pointRadius:5,
                    fill:true,
                    tension:.35
                },
                {
                    label:"Meta mensual base",
                    data:metas,
                    borderColor:"#ef4444",
                    borderWidth:3,
                    borderDash:[8,6],
                    pointRadius:0,
                    fill:false,
                    tension:0
                }
            ]
        },
        options:opcionesChartBasicas("Ventas mensuales vs meta mensual")
    });
}

function crearVelocimetroCumplimiento(ventaTotal) {
    const canvas = document.getElementById("velocimetroCumplimiento");
    if (!canvas) return;

    const porcentajeReal = META_RANGO_ACTUAL > 0 ? (ventaTotal / META_RANGO_ACTUAL) * 100 : 0;
    const porcentaje = Math.min(porcentajeReal, 100);
    const restante = Math.max(100 - porcentaje, 0);

    const etiqueta = textoEstado(porcentajeReal).toUpperCase();
    const color = colorPorPorcentaje(porcentajeReal);

    const texto = document.getElementById("cumplimientoVisual");
    if (texto) {
        texto.innerHTML = `${porcentajeReal.toFixed(1)}%`;
        texto.style.color = color;
    }

    if (chartCumplimientoVisual) chartCumplimientoVisual.destroy();

    const centerTextPlugin = {
        id:"centerTextPlugin",
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
        type:"doughnut",
        data:{
            labels:["Avance", "Restante"],
            datasets:[{
                data:[porcentaje, restante],
                backgroundColor:[color, "#e5e7eb"],
                borderWidth:0,
                cutout:"78%"
            }]
        },
        plugins:[centerTextPlugin],
        options:{
            responsive:true,
            maintainAspectRatio:false,
            plugins:{
                legend:{ display:false },
                title:{ display:true, text:"Cumplimiento de meta del rango" }
            }
        }
    });
}

function crearTablaCumplimiento(ventaTotal) {
    const tbody = document.querySelector("#tablaCumplimiento tbody");
    if (!tbody) return;

    const cumplimiento = META_RANGO_ACTUAL > 0 ? (ventaTotal / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - ventaTotal, 0);

    tbody.innerHTML = `
        <tr>
            <td>Meta del rango seleccionado</td>
            <td>${formatMoney(META_RANGO_ACTUAL)}</td>
            <td>${formatMoney(ventaTotal)}</td>
            <td>${cumplimiento.toFixed(1)}%</td>
            <td>${formatMoney(faltante)}</td>
            <td>${badgeEstado(cumplimiento)}</td>
        </tr>
    `;
}

function crearTablaCategorias(homenajes, totalGeneral) {
    const tbody = document.querySelector("#tablaCategorias tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const categorias = {};

    homenajes.forEach(item => {
        let categoria = normalizarTexto(getTipoHomenajeItem(item));
        if (!categoria) categoria = "SIN CATEGORÍA";

        categorias[categoria] = (categorias[categoria] || 0) + toNumber(getValorItem(item));
    });

    const ranking = Object.entries(categorias).sort((a, b) => b[1] - a[1]);

    if (ranking.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3">Sin registros</td></tr>`;
        return;
    }

    ranking.forEach(([nombre, valor]) => {
        const participacion = totalGeneral > 0 ? (valor / totalGeneral) * 100 : 0;

        tbody.innerHTML += `
            <tr>
                <td>${nombre}</td>
                <td>${formatMoney(valor)}</td>
                <td>${participacion.toFixed(1)}%</td>
            </tr>
        `;
    });
}

function crearTablaExcedentes(homenajes, totalGeneral) {
    const tbody = document.querySelector("#tablaExcedentes tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const excedentes = {};

    homenajes.forEach(item => {
        const nombre = normalizarTexto(getTipoExcedenteItem(item));
        if (!nombre || nombre === "SOAT" || nombre === "PENSIONADO") return;

        if (!excedentes[nombre]) {
            excedentes[nombre] = { cantidad:0, valor:0 };
        }

        excedentes[nombre].cantidad += 1;
        excedentes[nombre].valor += toNumber(getValorItem(item));
    });

    const ranking = Object.entries(excedentes).sort((a, b) => b[1].valor - a[1].valor);

    if (ranking.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4">Sin registros</td></tr>`;
        return;
    }

    ranking.forEach(([nombre, data]) => {
        const participacion = totalGeneral > 0 ? (data.valor / totalGeneral) * 100 : 0;

        tbody.innerHTML += `
            <tr>
                <td>${nombre}</td>
                <td>${data.cantidad}</td>
                <td>${formatMoney(data.valor)}</td>
                <td>${participacion.toFixed(1)}%</td>
            </tr>
        `;
    });
}

function crearTopServicios(homenajes, totalGeneral) {
    const tbody = document.querySelector("#tablaTopServicios tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const servicios = {};

    homenajes.forEach(item => {
        const servicio = normalizarTexto(getTipoExcedenteItem(item));
        if (!servicio) return;

        if (!servicios[servicio]) {
            servicios[servicio] = { cantidad:0, valor:0 };
        }

        servicios[servicio].cantidad += 1;
        servicios[servicio].valor += toNumber(getValorItem(item));
    });

    const ranking = Object.entries(servicios)
        .sort((a, b) => b[1].valor - a[1].valor)
        .slice(0, 10);

    if (ranking.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4">Sin registros</td></tr>`;
        return;
    }

    ranking.forEach(([nombre, data]) => {
        const participacion = totalGeneral > 0 ? (data.valor / totalGeneral) * 100 : 0;

        tbody.innerHTML += `
            <tr>
                <td>${nombre}</td>
                <td>${data.cantidad}</td>
                <td>${formatMoney(data.valor)}</td>
                <td>${participacion.toFixed(1)}%</td>
            </tr>
        `;
    });
}

function crearRankingGestores(homenajes, totalGeneral) {
    const tbody = document.querySelector("#tablaGestores tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const gestores = {};

    homenajes.forEach(item => {
        const nombre = String(getGestorItem(item) || "").trim();
        if (!nombre) return;

        const llave = nombre.toUpperCase();

        if (!gestores[llave]) {
            gestores[llave] = { nombre, cantidad:0, valor:0 };
        }

        gestores[llave].cantidad += 1;
        gestores[llave].valor += toNumber(getValorItem(item));
    });

    const ranking = Object.values(gestores).sort((a, b) => b.valor - a.valor);

    if (ranking.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4">Sin registros</td></tr>`;
        setHtml("mejorGestor", "-");
        setHtml("ventaMejorGestor", formatMoney(0));
        return;
    }

    ranking.forEach(item => {
        const participacion = totalGeneral > 0 ? (item.valor / totalGeneral) * 100 : 0;

        tbody.innerHTML += `
            <tr>
                <td>${item.nombre}</td>
                <td>${item.cantidad}</td>
                <td>${formatMoney(item.valor)}</td>
                <td>${participacion.toFixed(1)}%</td>
            </tr>
        `;
    });

    const mejorGestor = ranking[0];

    setHtml("mejorGestor", mejorGestor.nombre);
    setHtml("ventaMejorGestor", formatMoney(mejorGestor.valor));
}

function crearGraficoGestores(homenajes) {
    const canvas = document.getElementById("graficoGestores");
    if (!canvas) return;

    if (chartGestores) chartGestores.destroy();

    const gestores = {};

    homenajes.forEach(item => {
        const nombre = String(getGestorItem(item) || "").trim();
        if (!nombre) return;

        const llave = nombre.toUpperCase();

        if (!gestores[llave]) {
            gestores[llave] = { nombre, valor:0 };
        }

        gestores[llave].valor += toNumber(getValorItem(item));
    });

    const ranking = Object.values(gestores)
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 10);

    chartGestores = new Chart(canvas, {
        type:"bar",
        data:{
            labels:ranking.map(item => item.nombre),
            datasets:[{
                label:"Ventas",
                data:ranking.map(item => item.valor),
                backgroundColor:"rgba(37,99,235,.95)",
                borderRadius:10
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            indexAxis:"y",
            plugins:{
                title:{ display:true, text:"Top 10 gestores por ventas" },
                legend:{ display:false }
            },
            scales:{
                x:{ beginAtZero:true, grid:{ color:"rgba(148,163,184,.22)" } },
                y:{ grid:{ display:false } }
            }
        }
    });
}

function crearIndicadoresServicioTop(homenajes) {
    const servicios = {};

    homenajes.forEach(item => {
        const servicio = String(getTipoExcedenteItem(item) || "").trim();
        if (!servicio) return;

        servicios[servicio] = (servicios[servicio] || 0) + 1;
    });

    const servicioTop = Object.entries(servicios).sort((a, b) => b[1] - a[1])[0];

    setHtml("servicioTop", servicioTop ? servicioTop[0] : "-");
    setHtml("cantidadServicioTop", servicioTop ? servicioTop[1] : "0");
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

function crearSemaforoGerencial(ventaTotal) {
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (ventaTotal / META_RANGO_ACTUAL) * 100 : 0;

    actualizarSemaforo("semaforoGeneral", "semaforoGeneralTexto", cumplimiento, "Cumplimiento general");
    actualizarSemaforo("semaforoVenta", "semaforoVentaTexto", cumplimiento, "Venta real");
    actualizarSemaforo("semaforoProyeccion", "semaforoProyeccionTexto", cumplimiento, "Proyección");
}

function crearAlertasGerenciales(homenajes, ventaTotal) {
    const contenedor = document.getElementById("alertasGerenciales");
    if (!contenedor) return;

    const alertas = [];
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (ventaTotal / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - ventaTotal, 0);

    if (homenajes.length === 0) {
        contenedor.innerHTML = `
            <div class="alerta-item">
                <i class="fas fa-circle-exclamation"></i>
                <span>No hay registros para el rango seleccionado. Verifica fechas, datos o conexión con Google Sheets.</span>
            </div>
        `;
        return;
    }

    if (cumplimiento < 80) {
        alertas.push(`El cumplimiento está en ${cumplimiento.toFixed(1)}%, por debajo del nivel esperado. Faltante: ${formatMoney(faltante)}.`);
    }

    if (cumplimiento >= 80 && cumplimiento < 100) {
        alertas.push(`El cumplimiento está en zona de riesgo controlado con ${cumplimiento.toFixed(1)}%. Se recomienda reforzar cierre comercial.`);
    }

    if (cumplimiento >= 100) {
        alertas.push(`Meta cumplida. El avance actual es de ${cumplimiento.toFixed(1)}%.`);
    }

    const promedioDiarioNecesario = DIAS_RANGO_ACTUAL > 0 ? faltante / DIAS_RANGO_ACTUAL : 0;

    if (faltante > 0) {
        alertas.push(`Promedio diario necesario para cubrir el faltante del rango: ${formatMoney(promedioDiarioNecesario)}.`);
    }

    contenedor.innerHTML = alertas.map(a => `
        <div class="alerta-item">
            <i class="fas fa-circle-exclamation"></i>
            <span>${a}</span>
        </div>
    `).join("");
}

function crearGraficoVentasVista(homenajes) {
    const canvas = document.getElementById("ventasAnuales");
    if (!canvas) return;

    if (chartVentasVista) chartVentasVista.destroy();

    const ventasMes = {};

    homenajes.forEach(item => {
        const fecha = parseFecha(getFechaItem(item));
        if (!fecha) return;

        const llave = mesKey(fecha);
        ventasMes[llave] = (ventasMes[llave] || 0) + toNumber(getValorItem(item));
    });

    const etiquetas = ordenarMeses(Object.keys(ventasMes));
    const valores = etiquetas.map(k => ventasMes[k]);

    chartVentasVista = new Chart(canvas, {
        type:"bar",
        data:{
            labels:etiquetas,
            datasets:[{
                label:"Ventas",
                data:valores,
                backgroundColor:"rgba(0,166,81,.92)",
                borderRadius:10
            }]
        },
        options:opcionesChartBasicas("Ventas mensuales acumuladas")
    });
}

function crearGraficoCategoriaVista(homenajes) {
    const canvas = document.getElementById("ventasPorCategoriaVista");
    if (!canvas) return;

    if (chartVentasCategoriaVista) chartVentasCategoriaVista.destroy();

    const categorias = {};

    homenajes.forEach(item => {
        let categoria = normalizarTexto(getTipoHomenajeItem(item));
        if (!categoria) categoria = "SIN CATEGORÍA";

        categorias[categoria] = (categorias[categoria] || 0) + toNumber(getValorItem(item));
    });

    const labels = Object.keys(categorias);
    const valores = labels.map(k => categorias[k]);

    chartVentasCategoriaVista = new Chart(canvas, {
        type:"doughnut",
        data:{
            labels,
            datasets:[{
                data:valores,
                backgroundColor:[
                    "rgba(239,68,68,.95)",
                    "rgba(37,99,235,.95)",
                    "rgba(245,158,11,.95)",
                    "rgba(124,58,237,.95)",
                    "rgba(6,182,212,.95)"
                ],
                borderColor:"#fff",
                borderWidth:2
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            plugins:{
                title:{ display:true, text:"Participación por categoría" },
                legend:{ position:"top" }
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
        const fecha = parseFecha(getFechaItem(item));
        if (!fecha) return;

        const llave = mesKey(fecha);
        mensual[llave] = (mensual[llave] || 0) + toNumber(getValorItem(item));
    });

    const etiquetas = ordenarMeses(Object.keys(mensual));
    const valores = etiquetas.map(k => mensual[k]);
    const porcentaje = valores.map(v => META_MENSUAL_BASE > 0 ? (v / META_MENSUAL_BASE) * 100 : 0);

    chartCumplimientoAnual = new Chart(canvas, {
        type:"line",
        data:{
            labels:etiquetas,
            datasets:[
                {
                    label:"% Cumplimiento mensual",
                    data:porcentaje,
                    borderColor:"#7c3aed",
                    backgroundColor:"rgba(124,58,237,.13)",
                    fill:true,
                    tension:.3,
                    pointRadius:5
                },
                {
                    label:"Meta 100%",
                    data:etiquetas.map(() => 100),
                    borderColor:"#ef4444",
                    borderDash:[8,6],
                    fill:false,
                    pointRadius:0
                }
            ]
        },
        options:opcionesChartBasicas("Cumplimiento mensual contra meta base")
    });
}

function crearGraficoRankingCompletoGestores(homenajes) {
    const canvas = document.getElementById("rankingCompletoGestores");
    if (!canvas) return;

    if (chartRankingCompletoGestores) chartRankingCompletoGestores.destroy();

    const gestores = {};

    homenajes.forEach(item => {
        const nombre = String(getGestorItem(item) || "").trim();
        if (!nombre) return;

        gestores[nombre] = (gestores[nombre] || 0) + toNumber(getValorItem(item));
    });

    const ranking = Object.entries(gestores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);

    chartRankingCompletoGestores = new Chart(canvas, {
        type:"bar",
        data:{
            labels:ranking.map(([nombre]) => nombre),
            datasets:[{
                label:"Valor vendido",
                data:ranking.map(([, valor]) => valor),
                backgroundColor:"rgba(37,99,235,.92)",
                borderRadius:10
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            indexAxis:"y",
            plugins:{ legend:{ display:false } },
            scales:{
                x:{ beginAtZero:true },
                y:{ grid:{ display:false } }
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
        const ex = normalizarTexto(getTipoExcedenteItem(item));
        if (!ex || ex === "SOAT" || ex === "PENSIONADO") return;

        excedentes[ex] = (excedentes[ex] || 0) + toNumber(getValorItem(item));
    });

    const ranking = Object.entries(excedentes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12);

    chartExcedentes = new Chart(canvas, {
        type:"bar",
        data:{
            labels:ranking.map(([nombre]) => nombre),
            datasets:[{
                label:"Excedentes",
                data:ranking.map(([, valor]) => valor),
                backgroundColor:"rgba(245,158,11,.92)",
                borderRadius:10
            }]
        },
        options:opcionesChartBasicas("Excedentes por valor")
    });
}

function crearGraficoHistorico(homenajes) {
    const canvas = document.getElementById("graficoHistorico");
    if (!canvas) return;

    if (chartHistorico) chartHistorico.destroy();

    const mensual = {};

    homenajes.forEach(item => {
        const fecha = parseFecha(getFechaItem(item));
        if (!fecha) return;

        const llave = mesKey(fecha);
        mensual[llave] = (mensual[llave] || 0) + toNumber(getValorItem(item));
    });

    const etiquetas = ordenarMeses(Object.keys(mensual));
    const valores = etiquetas.map(k => mensual[k]);

    chartHistorico = new Chart(canvas, {
        type:"line",
        data:{
            labels:etiquetas,
            datasets:[{
                label:"Ventas históricas",
                data:valores,
                borderColor:"#00a651",
                backgroundColor:"rgba(0,166,81,.13)",
                fill:true,
                tension:.35,
                pointRadius:5,
                pointBackgroundColor:"#00a651"
            }]
        },
        options:opcionesChartBasicas("Serie histórica de ventas")
    });
}

function crearGraficoMetasAcumuladas() {
    const canvas = document.getElementById("graficoMetasAcumuladas");
    if (!canvas) return;

    if (chartMetasAcumuladas) chartMetasAcumuladas.destroy();

    const etiquetas = [
        "Enero",
        "Febrero",
        "Marzo",
        "Abril",
        "Mayo",
        "Junio",
        "Julio",
        "Agosto",
        "Septiembre",
        "Octubre",
        "Noviembre",
        "Diciembre"
    ];

    const metas = etiquetas.map((_, index) => META_MENSUAL_BASE * (index + 1));

    chartMetasAcumuladas = new Chart(canvas, {
        type:"line",
        data:{
            labels:etiquetas,
            datasets:[{
                label:"Meta acumulada",
                data:metas,
                borderColor:"#00a651",
                backgroundColor:"rgba(0,166,81,.14)",
                fill:true,
                tension:.25,
                pointRadius:5
            }]
        },
        options:opcionesChartBasicas("Meta acumulada mensual")
    });
}

function crearIndicadoresServicioTop(homenajes) {
    const servicios = {};

    homenajes.forEach(item => {
        const servicio = String(getTipoExcedenteItem(item) || "").trim();
        if (!servicio) return;

        servicios[servicio] = (servicios[servicio] || 0) + 1;
    });

    const servicioTop = Object.entries(servicios).sort((a, b) => b[1] - a[1])[0];

    setHtml("servicioTop", servicioTop ? servicioTop[0] : "-");
    setHtml("cantidadServicioTop", servicioTop ? servicioTop[1] : "0");
}

function renderizarVistasAdicionales(homenajes) {
    crearIndicadoresServicioTop(homenajes);
    crearGraficoVentasVista(homenajes);
    crearGraficoCategoriaVista(homenajes);
    crearGraficoCumplimientoAnual(homenajes);
    crearGraficoRankingCompletoGestores(homenajes);
    crearGraficoExcedentes(homenajes);
    crearGraficoHistorico(homenajes);
    crearGraficoMetasAcumuladas();
}

function actualizarVistaMetas(metaInfo) {
    setHtml("vistaMetaMensual", formatMoney(META_MENSUAL_BASE));
    setHtml("vistaMetaTrimestral", formatMoney(META_TRIMESTRAL_BASE));
    setHtml("vistaMetaSemestral", formatMoney(META_SEMESTRAL_BASE));
    setHtml("vistaMetaAnual", formatMoney(META_ANUAL_BASE));
    setHtml("vistaMetaRango", formatMoney(metaInfo.meta));
    setHtml("vistaMesesRango", metaInfo.mesesEquivalentes.toFixed(2));
}

function actualizarAdmin(totalOriginal, totalFiltrado, metaInfo) {
    setHtml("adminMetaMensual", formatMoney(META_MENSUAL_BASE));
    setHtml("adminMetaGeneral", formatMoney(metaInfo.meta));
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
        chartMetaReal,
        chartIngresos,
        chartMensual,
        chartGestores,
        chartCumplimientoVisual,
        chartVentasVista,
        chartVentasCategoriaVista,
        chartCumplimientoAnual,
        chartRankingCompletoGestores,
        chartExcedentes,
        chartHistorico,
        chartMetasAcumuladas
    ].forEach(chart => {
        if (chart && typeof chart.resize === "function") chart.resize();
    });
}

function exportarExcel() {
    if (typeof XLSX === "undefined") return;

    const hojaDatos = DATASET_FILTRADO.map(item => ({
        Fecha: getFechaItem(item) || "",
        Gestor: getGestorItem(item) || "",
        Tipo_Homenaje: getTipoHomenajeItem(item) || "",
        Tipo_Excedente: getTipoExcedenteItem(item) || "",
        Valor: toNumber(getValorItem(item))
    }));

    const resumen = calcularResumen(DATASET_FILTRADO);
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (resumen.total / META_RANGO_ACTUAL) * 100 : 0;

    const wsResumen = XLSX.utils.aoa_to_sheet([
        ["Indicador", "Valor"],
        ["Meta Mensual Base", META_MENSUAL_BASE],
        ["Meta Trimestral", META_TRIMESTRAL_BASE],
        ["Meta Semestral", META_SEMESTRAL_BASE],
        ["Meta Anual", META_ANUAL_BASE],
        ["Meta del Rango", META_RANGO_ACTUAL],
        ["Meses Equivalentes", MESES_EQUIVALENTES_ACTUAL],
        ["Ventas Totales", resumen.total],
        ["Cumplimiento %", cumplimiento],
        ["Faltante", Math.max(META_RANGO_ACTUAL - resumen.total, 0)],
        ["Registros Filtrados", DATASET_FILTRADO.length]
    ]);

    const wsDatos = XLSX.utils.json_to_sheet(hojaDatos);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen Ejecutivo");
    XLSX.utils.book_append_sheet(wb, wsDatos, "Base Filtrada");

    XLSX.writeFile(wb, "dashboard_gerencial_homenajes.xlsx");
}

function exportarPDF() {
    const elemento = document.getElementById("panelExportar");
    if (!elemento || typeof html2pdf === "undefined") return;

    const opciones = {
        margin:0.2,
        filename:"dashboard_gerencial_homenajes.pdf",
        image:{ type:"jpeg", quality:0.98 },
        html2canvas:{ scale:2, useCORS:true },
        jsPDF:{ unit:"in", format:"a4", orientation:"landscape" },
        pagebreak:{ mode:["css", "legacy"] }
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

    establecerFechasPorDefecto();
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
establecerFechasPorDefecto();
cargarDashboard();
