console.log("APP.JS CARGADO CORRECTAMENTE");

const API_URL = "https://script.google.com/macros/s/AKfycbxEyu57a5spnJNju9t4654U8SDBrWFWQ0GWLibubGy5ntZsOV3N-TeL73423-a23j6FwA/exec";

let META_MENSUAL_BASE = Number(localStorage.getItem("metaMensualBase")) || 219133881;

let META_TRIMESTRAL_BASE = META_MENSUAL_BASE * 3;
let META_SEMESTRAL_BASE = META_MENSUAL_BASE * 6;
let META_ANUAL_BASE = META_MENSUAL_BASE * 12;

let META_RANGO_ACTUAL = 0;
let MESES_EQUIVALENTES_ACTUAL = 0;
let DIAS_RANGO_ACTUAL = 0;

let DATASET = [];
let DATASET_FILTRADO = [];

let charts = {};

function destruirChart(id){
    if(charts[id]){
        charts[id].destroy();
        charts[id] = null;
    }
}

function toNumber(valor){
    if(typeof valor === "number"){
        return Number.isFinite(valor) ? valor : 0;
    }

    const texto = String(valor ?? "").trim();
    if(!texto) return 0;

    const limpio = texto
        .replace(/\s/g, "")
        .replace(/\$/g, "")
        .replace(/\./g, "")
        .replace(/,/g, ".");

    const numero = Number(limpio);
    return Number.isFinite(numero) ? numero : 0;
}

function formatMoney(valor){
    return "$" + Math.round(toNumber(valor)).toLocaleString("es-CO");
}

function normalizarTexto(valor){
    return String(valor ?? "").trim().toUpperCase();
}

function setHtml(id, valor){
    const el = document.getElementById(id);
    if(el) el.innerHTML = valor;
}

function getCampo(item, posibles){
    for(const campo of posibles){
        if(item[campo] !== undefined && item[campo] !== null && String(item[campo]).trim() !== ""){
            return item[campo];
        }
    }
    return "";
}

function getFechaItem(item){
    return getCampo(item, [
        "Fecha",
        "FECHA",
        "fecha",
        "Fecha_Homenaje",
        "FECHA_HOMENAJE",
        "Fecha Homenaje",
        "FECHA HOMENAJE"
    ]);
}

function getValorItem(item){
    return getCampo(item, [
        "Valor",
        "VALOR",
        "valor",
        "Valor_Homenaje",
        "VALOR_HOMENAJE",
        "Valor Homenaje",
        "VALOR HOMENAJE",
        "Total",
        "TOTAL"
    ]);
}

function getGestorItem(item){
    return getCampo(item, [
        "Gestor",
        "GESTOR",
        "gestor",
        "Asesor",
        "ASESOR",
        "Vendedor",
        "VENDEDOR"
    ]);
}

function getTipoHomenajeItem(item){
    return getCampo(item, [
        "Tipo_Homenaje",
        "TIPO_HOMENAJE",
        "Tipo Homenaje",
        "TIPO HOMENAJE",
        "Categoria",
        "CATEGORIA",
        "Categoría",
        "CATEGORÍA"
    ]);
}

function getTipoExcedenteItem(item){
    return getCampo(item, [
        "Tipo_Excedente",
        "TIPO_EXCEDENTE",
        "Tipo Excedente",
        "TIPO EXCEDENTE",
        "Servicio",
        "SERVICIO",
        "Excedente",
        "EXCEDENTE"
    ]);
}

function convertirArrayAObjetos(tabla){
    if(!Array.isArray(tabla) || tabla.length === 0) return [];

    if(typeof tabla[0] === "object" && !Array.isArray(tabla[0])){
        return tabla;
    }

    if(Array.isArray(tabla[0])){
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

function obtenerHomenajesDesdeApi(json){
    if(Array.isArray(json.homenajes)) return convertirArrayAObjetos(json.homenajes);
    if(Array.isArray(json.datos)) return convertirArrayAObjetos(json.datos);
    if(Array.isArray(json.data)) return convertirArrayAObjetos(json.data);
    if(Array.isArray(json.registros)) return convertirArrayAObjetos(json.registros);
    if(Array.isArray(json.result)) return convertirArrayAObjetos(json.result);
    if(Array.isArray(json)) return convertirArrayAObjetos(json);

    return [];
}

function parseFecha(valor){
    if(valor instanceof Date && !isNaN(valor.getTime())) return valor;

    if(typeof valor === "number"){
        if(valor > 20000){
            const fechaExcel = new Date(Math.round((valor - 25569) * 86400 * 1000));
            return isNaN(fechaExcel.getTime()) ? null : fechaExcel;
        }
    }

    if(valor == null) return null;

    const texto = String(valor).trim();
    if(!texto) return null;

    const dmy = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(dmy){
        const [, dd, mm, yyyy] = dmy;
        const fecha = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
        return isNaN(fecha.getTime()) ? null : fecha;
    }

    const ymd = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(ymd){
        const [, yyyy, mm, dd] = ymd;
        const fecha = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
        return isNaN(fecha.getTime()) ? null : fecha;
    }

    const fechaIso = new Date(texto);
    return isNaN(fechaIso.getTime()) ? null : fechaIso;
}

function fechaISO(fecha){
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, "0");
    const dd = String(fecha.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function inicioDia(fecha){
    return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 0, 0, 0, 0);
}

function inicioMes(fecha){
    return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
}

function finMes(fecha){
    return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0);
}

function diasDelMes(fecha){
    return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
}

function diasEntre(fechaInicio, fechaFin){
    const inicio = inicioDia(fechaInicio);
    const fin = inicioDia(fechaFin);
    return Math.floor((fin - inicio) / 86400000) + 1;
}

function mesKey(fecha){
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    return `${mes}/${fecha.getFullYear()}`;
}

function fechaKey(fecha){
    return fechaISO(fecha);
}

function trimestreKey(fecha){
    const trimestre = Math.floor(fecha.getMonth() / 3) + 1;
    return `T${trimestre}/${fecha.getFullYear()}`;
}

function semestreKey(fecha){
    const semestre = fecha.getMonth() < 6 ? 1 : 2;
    return `S${semestre}/${fecha.getFullYear()}`;
}

function anioKey(fecha){
    return String(fecha.getFullYear());
}

function ordenarMeses(keys){
    return keys.sort((a, b) => {
        const [ma, ya] = a.split("/").map(Number);
        const [mb, yb] = b.split("/").map(Number);
        return ya - yb || ma - mb;
    });
}

function ordenarFechas(keys){
    return keys.sort((a, b) => new Date(a) - new Date(b));
}

function obtenerRangoFechas(){
    return {
        fechaInicio: document.getElementById("fechaInicio")?.value || "",
        fechaFin: document.getElementById("fechaFin")?.value || "",
        busqueda: normalizarTexto(document.getElementById("busquedaGeneral")?.value || "")
    };
}

function establecerFechasPorDefecto(){
    const fechaInicio = document.getElementById("fechaInicio");
    const fechaFin = document.getElementById("fechaFin");

    if(!fechaInicio || !fechaFin) return;

    if(!fechaInicio.value && !fechaFin.value){
        const hoy = new Date();
        const enero = new Date(hoy.getFullYear(), 0, 1);

        fechaInicio.value = fechaISO(enero);
        fechaFin.value = fechaISO(hoy);
    }
}

function recalcularMetasBase(){
    META_TRIMESTRAL_BASE = META_MENSUAL_BASE * 3;
    META_SEMESTRAL_BASE = META_MENSUAL_BASE * 6;
    META_ANUAL_BASE = META_MENSUAL_BASE * 12;
}

function calcularMetaPorRango(fechaInicioTexto, fechaFinTexto){
    let inicio = fechaInicioTexto ? new Date(`${fechaInicioTexto}T00:00:00`) : null;
    let fin = fechaFinTexto ? new Date(`${fechaFinTexto}T23:59:59`) : null;

    if(!inicio || isNaN(inicio.getTime())){
        const hoy = new Date();
        inicio = new Date(hoy.getFullYear(), 0, 1);
    }

    if(!fin || isNaN(fin.getTime())){
        fin = new Date();
    }

    if(fin < inicio){
        const temp = inicio;
        inicio = fin;
        fin = temp;
    }

    let cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    const limite = new Date(fin.getFullYear(), fin.getMonth(), 1);

    let meta = 0;
    let mesesEquivalentes = 0;
    let detalleMeses = [];

    while(cursor <= limite){
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

function filtrarDataset(homenajes){
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

function calcularResumen(homenajes){
    let total = 0;
    let red = 0;
    let particular = 0;
    let excedentes = 0;

    homenajes.forEach(item => {
        const valor = toNumber(getValorItem(item));
        total += valor;

        const tipo = normalizarTexto(getTipoHomenajeItem(item));
        const excedente = normalizarTexto(getTipoExcedenteItem(item));

        if(tipo === "RED") red += valor;
        else if(tipo === "PARTICULAR") particular += valor;
        else if(excedente && excedente !== "SOAT" && excedente !== "PENSIONADO") excedentes += valor;
    });

    return { total, red, particular, excedentes };
}

function setEstadoApi(tipo, texto){
    const estado = document.getElementById("estadoApi");
    if(!estado) return;

    estado.className = `estado-api ${tipo}`;
    estado.innerHTML = `<i class="fas fa-circle"></i> ${texto}`;

    setHtml("adminEstadoConexion", texto);
}

async function cargarDashboard(){
    setEstadoApi("cargando", "Cargando...");

    const alertasBox = document.getElementById("alertasGerenciales");
    if(alertasBox) alertasBox.innerHTML = "<p>Cargando información...</p>";

    try{
        const response = await fetch(API_URL, { cache:"no-store" });
        if(!response.ok) throw new Error(`Error HTTP ${response.status}`);

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
        crearVelocimetroCumplimiento(resumen.total, "velocimetroCumplimiento");
        crearTablaCumplimiento(resumen.total);
        crearTablasPrincipales(DATASET_FILTRADO, resumen.total);
        crearSemaforoGerencial(resumen.total);
        crearAlertasGerenciales(DATASET_FILTRADO, resumen.total);
        renderizarVistasAdicionales(DATASET_FILTRADO, resumen, metaInfo);
        ejecutarModulosFinales(DATASET_FILTRADO, resumen, metaInfo);
        actualizarAdmin(DATASET, DATASET_FILTRADO, metaInfo);
        actualizarVistaMetas(metaInfo);
        actualizarBaseDatos();
        actualizarConfiguracion();

        setEstadoApi("ok", "Conectado");

    }catch(error){
        console.error("Error al cargar dashboard:", error);
        setEstadoApi("error", "Error API");

        if(alertasBox){
            alertasBox.innerHTML = `
                <div class="alerta-item">
                    <i class="fas fa-triangle-exclamation"></i>
                    <span>No fue posible cargar la información. Verifica que app.js esté bien pegado, que el Apps Script esté publicado y que la API entregue datos.</span>
                </div>
            `;
        }
    }
}

function colorPorPorcentaje(porcentaje){
    if(porcentaje >= 100) return "#16a34a";
    if(porcentaje >= 80) return "#f59e0b";
    return "#dc2626";
}

function textoEstado(porcentaje){
    if(porcentaje >= 100) return "Meta cumplida";
    if(porcentaje >= 80) return "En riesgo controlado";
    return "Bajo meta";
}

function badgeEstado(porcentaje){
    if(porcentaje >= 100) return `<span class="badge badge-ok">Cumplido</span>`;
    if(porcentaje >= 80) return `<span class="badge badge-warning">En riesgo</span>`;
    return `<span class="badge badge-danger">Bajo meta</span>`;
}

function actualizarKPIs(resumen, metaInfo){
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

    setHtml("tvMeta", formatMoney(META_RANGO_ACTUAL));
    setHtml("tvVentas", formatMoney(ventaTotal));
    setHtml("tvCumplimiento", `${cumplimientoGeneral.toFixed(1)}%`);
    setHtml("tvFaltante", formatMoney(faltante));

    const desde = fechaISO(metaInfo.inicio);
    const hasta = fechaISO(metaInfo.fin);
    setHtml("metaRangoDetalle", `${desde} a ${hasta}`);

    const cumplimientoEl = document.getElementById("cumplimiento");
    if(cumplimientoEl) cumplimientoEl.style.color = colorPorPorcentaje(cumplimientoGeneral);

    const tvCumplimiento = document.getElementById("tvCumplimiento");
    if(tvCumplimiento) tvCumplimiento.style.color = colorPorPorcentaje(cumplimientoGeneral);
}

function crearResumenEjecutivo(homenajes, resumen, metaInfo){
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (resumen.total / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - resumen.total, 0);

    let estado = "por debajo de la meta establecida";
    if(cumplimiento >= 100) estado = "con la meta cumplida";
    else if(cumplimiento >= 80) estado = "cerca del cumplimiento esperado";

    const texto = `
        El rango seleccionado comprende <strong>${MESES_EQUIVALENTES_ACTUAL.toFixed(2)} meses equivalentes</strong>, 
        con una meta calculada de <strong>${formatMoney(META_RANGO_ACTUAL)}</strong>. 
        Las ventas acumuladas son <strong>${formatMoney(resumen.total)}</strong>, equivalentes al 
        <strong>${cumplimiento.toFixed(1)}%</strong> de cumplimiento. 
        Actualmente el resultado se encuentra <strong>${estado}</strong>. 
        Faltante para cumplimiento: <strong>${formatMoney(faltante)}</strong>. 
        Registros analizados: <strong>${homenajes.length}</strong>.
    `;

    setHtml("resumenEjecutivoTexto", texto);
    setHtml("vistaResumenTexto", texto);

    const tbody = document.querySelector("#tablaResumenGerencial tbody");
    if(tbody){
        tbody.innerHTML = `
            <tr>
                <td>Meta del rango</td>
                <td>${formatMoney(META_RANGO_ACTUAL)}</td>
                <td>${MESES_EQUIVALENTES_ACTUAL.toFixed(2)} meses equivalentes</td>
            </tr>
            <tr>
                <td>Venta real</td>
                <td>${formatMoney(resumen.total)}</td>
                <td>${homenajes.length} registros analizados</td>
            </tr>
            <tr>
                <td>Cumplimiento</td>
                <td>${cumplimiento.toFixed(1)}%</td>
                <td>${textoEstado(cumplimiento)}</td>
            </tr>
            <tr>
                <td>Faltante</td>
                <td>${formatMoney(faltante)}</td>
                <td>Valor pendiente para cumplir la meta</td>
            </tr>
        `;
    }
}

function opcionesChartBasicas(titulo){
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

function crearChartBar(idCanvas, labels, data, label, titulo, color = "rgba(0,166,81,.90)"){
    const canvas = document.getElementById(idCanvas);
    if(!canvas) return;

    destruirChart(idCanvas);

    charts[idCanvas] = new Chart(canvas, {
        type:"bar",
        data:{
            labels,
            datasets:[{
                label,
                data,
                backgroundColor:color,
                borderRadius:10
            }]
        },
        options:opcionesChartBasicas(titulo)
    });
}

function crearChartLine(idCanvas, labels, datasets, titulo){
    const canvas = document.getElementById(idCanvas);
    if(!canvas) return;

    destruirChart(idCanvas);

    charts[idCanvas] = new Chart(canvas, {
        type:"line",
        data:{ labels, datasets },
        options:opcionesChartBasicas(titulo)
    });
}

function crearChartDoughnut(idCanvas, labels, data, titulo){
    const canvas = document.getElementById(idCanvas);
    if(!canvas) return;

    destruirChart(idCanvas);

    charts[idCanvas] = new Chart(canvas, {
        type:"doughnut",
        data:{
            labels,
            datasets:[{
                data,
                backgroundColor:[
                    "rgba(239,68,68,.95)",
                    "rgba(37,99,235,.95)",
                    "rgba(245,158,11,.95)",
                    "rgba(124,58,237,.95)",
                    "rgba(6,182,212,.95)",
                    "rgba(236,72,153,.95)",
                    "rgba(249,115,22,.95)"
                ],
                borderColor:"#ffffff",
                borderWidth:2
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            plugins:{
                title:{ display:true, text:titulo },
                legend:{ position:"top" }
            }
        }
    });
}

function crearGraficoMetaReal(ventaTotal, metaRango){
    const canvas = document.getElementById("graficoMetaReal");
    if(!canvas) return;

    destruirChart("graficoMetaReal");

    charts.graficoMetaReal = new Chart(canvas, {
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

function crearGraficoIngresos(resumen){
    crearChartDoughnut(
        "composicionIngresos",
        ["RED", "PARTICULAR", "EXCEDENTES"],
        [resumen.red, resumen.particular, resumen.excedentes],
        "Composición de ingresos"
    );
}

function crearGraficoMensual(homenajes){
    const mensual = agruparPorPeriodo(homenajes, "mes");
    const etiquetas = ordenarMeses(Object.keys(mensual));
    const ventas = etiquetas.map(k => mensual[k]);
    const metas = etiquetas.map(() => META_MENSUAL_BASE);

    crearChartLine("ventasMensuales", etiquetas, [
        {
            label:"Venta mensual",
            data:ventas,
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
    ], "Ventas mensuales vs meta mensual");
}

function crearVelocimetroCumplimiento(ventaTotal, canvasId){
    const canvas = document.getElementById(canvasId);
    if(!canvas) return;

    const porcentajeReal = META_RANGO_ACTUAL > 0 ? (ventaTotal / META_RANGO_ACTUAL) * 100 : 0;
    const porcentaje = Math.min(porcentajeReal, 100);
    const restante = Math.max(100 - porcentaje, 0);

    const etiqueta = textoEstado(porcentajeReal).toUpperCase();
    const color = colorPorPorcentaje(porcentajeReal);

    if(canvasId === "velocimetroCumplimiento"){
        const texto = document.getElementById("cumplimientoVisual");
        if(texto){
            texto.innerHTML = `${porcentajeReal.toFixed(1)}%`;
            texto.style.color = color;
        }
    }

    destruirChart(canvasId);

    const centerTextPlugin = {
        id:`centerTextPlugin_${canvasId}`,
        afterDraw(chart){
            const { ctx, chartArea } = chart;
            if(!chartArea) return;

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

    charts[canvasId] = new Chart(canvas, {
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

function crearTablaCumplimiento(ventaTotal){
    const tbody = document.querySelector("#tablaCumplimiento tbody");
    if(!tbody) return;

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

function agruparCategorias(homenajes){
    const categorias = {};

    homenajes.forEach(item => {
        let categoria = normalizarTexto(getTipoHomenajeItem(item));
        if(!categoria) categoria = "SIN CATEGORÍA";
        categorias[categoria] = (categorias[categoria] || 0) + toNumber(getValorItem(item));
    });

    return categorias;
}

function agruparServicios(homenajes){
    const servicios = {};

    homenajes.forEach(item => {
        const servicio = normalizarTexto(getTipoExcedenteItem(item));
        if(!servicio) return;

        if(!servicios[servicio]){
            servicios[servicio] = { cantidad:0, valor:0 };
        }

        servicios[servicio].cantidad += 1;
        servicios[servicio].valor += toNumber(getValorItem(item));
    });

    return servicios;
}

function agruparGestores(homenajes){
    const gestores = {};

    homenajes.forEach(item => {
        const nombre = String(getGestorItem(item) || "").trim();
        if(!nombre) return;

        const llave = nombre.toUpperCase();

        if(!gestores[llave]){
            gestores[llave] = { nombre, cantidad:0, valor:0 };
        }

        gestores[llave].cantidad += 1;
        gestores[llave].valor += toNumber(getValorItem(item));
    });

    return gestores;
}

function agruparExcedentes(homenajes){
    const excedentes = {};

    homenajes.forEach(item => {
        const nombre = normalizarTexto(getTipoExcedenteItem(item));
        if(!nombre || nombre === "SOAT" || nombre === "PENSIONADO") return;

        if(!excedentes[nombre]){
            excedentes[nombre] = { cantidad:0, valor:0 };
        }

        excedentes[nombre].cantidad += 1;
        excedentes[nombre].valor += toNumber(getValorItem(item));
    });

    return excedentes;
}

function crearTablasPrincipales(homenajes, totalGeneral){
    crearTablaCategoriasGeneral(homenajes, totalGeneral, "#tablaCategorias tbody");
    crearTablaCategoriasGeneral(homenajes, totalGeneral, "#tablaCategoriasVista tbody");
    crearTablaServiciosGeneral(homenajes, totalGeneral, "#tablaTopServicios tbody", 10);
    crearTablaServiciosGeneral(homenajes, totalGeneral, "#tablaServiciosVista tbody", 0);
    crearTablaGestoresGeneral(homenajes, totalGeneral, "#tablaGestores tbody");
    crearTablaGestoresGeneral(homenajes, totalGeneral, "#tablaGestoresVista tbody");
    crearTablaExcedentesGeneral(homenajes, totalGeneral, "#tablaExcedentes tbody");
    crearTablaExcedentesGeneral(homenajes, totalGeneral, "#tablaExcedentesVista tbody");

    const categorias = agruparCategorias(homenajes);
    const catLabels = Object.keys(categorias);
    crearChartDoughnut("graficoCategoriasVista", catLabels, catLabels.map(k => categorias[k]), "Ventas por categoría");

    const servicios = agruparServicios(homenajes);
    const serviciosRanking = Object.entries(servicios).sort((a,b) => b[1].valor - a[1].valor).slice(0, 12);

    crearChartBar(
        "graficoServiciosVista",
        serviciosRanking.map(([nombre]) => nombre),
        serviciosRanking.map(([, data]) => data.valor),
        "Valor vendido",
        "Servicios por valor vendido",
        "rgba(245,158,11,.92)"
    );

    const gestores = Object.values(agruparGestores(homenajes)).sort((a,b) => b.valor - a.valor);
    const mejorGestor = gestores[0];

    setHtml("mejorGestor", mejorGestor ? mejorGestor.nombre : "-");
    setHtml("ventaMejorGestor", mejorGestor ? formatMoney(mejorGestor.valor) : formatMoney(0));

    const serviciosPorCantidad = Object.entries(servicios).sort((a,b) => b[1].cantidad - a[1].cantidad)[0];

    setHtml("servicioTop", serviciosPorCantidad ? serviciosPorCantidad[0] : "-");
    setHtml("cantidadServicioTop", serviciosPorCantidad ? serviciosPorCantidad[1].cantidad : "0");
}

function crearTablaCategoriasGeneral(homenajes, totalGeneral, selector){
    const tbody = document.querySelector(selector);
    if(!tbody) return;

    const categorias = agruparCategorias(homenajes);
    const ranking = Object.entries(categorias).sort((a,b) => b[1] - a[1]);

    if(ranking.length === 0){
        tbody.innerHTML = `<tr><td colspan="3">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = ranking.map(([nombre, valor]) => {
        const participacion = totalGeneral > 0 ? (valor / totalGeneral) * 100 : 0;

        return `
            <tr>
                <td>${nombre}</td>
                <td>${formatMoney(valor)}</td>
                <td>${participacion.toFixed(1)}%</td>
            </tr>
        `;
    }).join("");
}

function crearTablaServiciosGeneral(homenajes, totalGeneral, selector, limite = 0){
    const tbody = document.querySelector(selector);
    if(!tbody) return;

    const servicios = agruparServicios(homenajes);
    let ranking = Object.entries(servicios).sort((a,b) => b[1].valor - a[1].valor);

    if(limite > 0) ranking = ranking.slice(0, limite);

    if(ranking.length === 0){
        tbody.innerHTML = `<tr><td colspan="4">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = ranking.map(([nombre, data]) => {
        const participacion = totalGeneral > 0 ? (data.valor / totalGeneral) * 100 : 0;

        return `
            <tr>
                <td>${nombre}</td>
                <td>${data.cantidad}</td>
                <td>${formatMoney(data.valor)}</td>
                <td>${participacion.toFixed(1)}%</td>
            </tr>
        `;
    }).join("");
}

function crearTablaGestoresGeneral(homenajes, totalGeneral, selector){
    const tbody = document.querySelector(selector);
    if(!tbody) return;

    const ranking = Object.values(agruparGestores(homenajes)).sort((a,b) => b.valor - a.valor);

    if(ranking.length === 0){
        tbody.innerHTML = `<tr><td colspan="4">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = ranking.map(item => {
        const participacion = totalGeneral > 0 ? (item.valor / totalGeneral) * 100 : 0;

        return `
            <tr>
                <td>${item.nombre}</td>
                <td>${item.cantidad}</td>
                <td>${formatMoney(item.valor)}</td>
                <td>${participacion.toFixed(1)}%</td>
            </tr>
        `;
    }).join("");
}

function crearTablaExcedentesGeneral(homenajes, totalGeneral, selector){
    const tbody = document.querySelector(selector);
    if(!tbody) return;

    const ranking = Object.entries(agruparExcedentes(homenajes)).sort((a,b) => b[1].valor - a[1].valor);

    if(ranking.length === 0){
        tbody.innerHTML = `<tr><td colspan="4">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = ranking.map(([nombre, data]) => {
        const participacion = totalGeneral > 0 ? (data.valor / totalGeneral) * 100 : 0;

        return `
            <tr>
                <td>${nombre}</td>
                <td>${data.cantidad}</td>
                <td>${formatMoney(data.valor)}</td>
                <td>${participacion.toFixed(1)}%</td>
            </tr>
        `;
    }).join("");
}

function actualizarSemaforo(idEstado, idTexto, porcentaje, nombre){
    const estado = document.getElementById(idEstado);
    const texto = document.getElementById(idTexto);

    if(!estado || !texto) return;

    let clase = "semaforo-danger";
    let simbolo = "●";
    let mensaje = "Bajo meta";

    if(porcentaje >= 100){
        clase = "semaforo-ok";
        simbolo = "✓";
        mensaje = "Cumplido";
    }else if(porcentaje >= 80){
        clase = "semaforo-warning";
        simbolo = "!";
        mensaje = "En riesgo";
    }

    estado.className = "semaforo-estado " + clase;
    estado.innerHTML = simbolo;
    texto.innerHTML = `${nombre}: ${porcentaje.toFixed(1)}% - ${mensaje}`;
}

function crearSemaforoGerencial(ventaTotal){
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (ventaTotal / META_RANGO_ACTUAL) * 100 : 0;

    actualizarSemaforo("semaforoGeneral", "semaforoGeneralTexto", cumplimiento, "Cumplimiento general");
    actualizarSemaforo("semaforoVenta", "semaforoVentaTexto", cumplimiento, "Venta real");
    actualizarSemaforo("semaforoProyeccion", "semaforoProyeccionTexto", cumplimiento, "Proyección");
}

function crearAlertasGerenciales(homenajes, ventaTotal){
    const contenedor = document.getElementById("alertasGerenciales");
    const contenedorVista = document.getElementById("alertasGerencialesVista");

    const cumplimiento = META_RANGO_ACTUAL > 0 ? (ventaTotal / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - ventaTotal, 0);

    const alertas = [];

    if(homenajes.length === 0){
        alertas.push("No hay registros para el rango seleccionado. Verifica fechas, datos o conexión con Google Sheets.");
    }else{
        if(cumplimiento < 80){
            alertas.push(`El cumplimiento está en ${cumplimiento.toFixed(1)}%, por debajo del nivel esperado. Faltante: ${formatMoney(faltante)}.`);
        }

        if(cumplimiento >= 80 && cumplimiento < 100){
            alertas.push(`El cumplimiento está en zona de riesgo controlado con ${cumplimiento.toFixed(1)}%. Se recomienda reforzar cierre comercial.`);
        }

        if(cumplimiento >= 100){
            alertas.push(`Meta cumplida. El avance actual es de ${cumplimiento.toFixed(1)}%.`);
        }

        const promedioDiarioNecesario = DIAS_RANGO_ACTUAL > 0 ? faltante / DIAS_RANGO_ACTUAL : 0;

        if(faltante > 0){
            alertas.push(`Promedio diario necesario para cubrir el faltante del rango: ${formatMoney(promedioDiarioNecesario)}.`);
        }

        const gestores = Object.values(agruparGestores(homenajes)).sort((a,b) => b.valor - a.valor);
        const mejorGestor = gestores[0];

        if(mejorGestor && ventaTotal > 0 && mejorGestor.valor / ventaTotal > 0.35){
            alertas.push(`El gestor ${mejorGestor.nombre} concentra más del 35% de las ventas del rango.`);
        }
    }

    const html = alertas.map(a => `
        <div class="alerta-item">
            <i class="fas fa-circle-exclamation"></i>
            <span>${a}</span>
        </div>
    `).join("");

    if(contenedor) contenedor.innerHTML = html || "<p>Sin alertas por el momento.</p>";
    if(contenedorVista) contenedorVista.innerHTML = html || "<p>Sin alertas por el momento.</p>";
}

function agruparPorPeriodo(homenajes, periodo){
    const datos = {};

    homenajes.forEach(item => {
        const fecha = parseFecha(getFechaItem(item));
        if(!fecha) return;

        let llave = "";

        if(periodo === "dia") llave = fechaKey(fecha);
        if(periodo === "mes") llave = mesKey(fecha);
        if(periodo === "trimestre") llave = trimestreKey(fecha);
        if(periodo === "semestre") llave = semestreKey(fecha);
        if(periodo === "anio") llave = anioKey(fecha);

        datos[llave] = (datos[llave] || 0) + toNumber(getValorItem(item));
    });

    return datos;
}

function renderizarVistasAdicionales(homenajes, resumen, metaInfo){
    crearVistaVentas(homenajes);
    crearVistaCumplimientos(homenajes);
    crearVistaGestores(homenajes);
    crearVistaExcedentes(homenajes);
    crearVistaComparativos(homenajes);
    crearVistaTendencias(homenajes);
    crearVistaMetas();
    crearVelocimetroCumplimiento(resumen.total, "graficoTvCumplimiento");
}

function crearVistaVentas(homenajes){
    const mensual = agruparPorPeriodo(homenajes, "mes");
    const etiquetas = ordenarMeses(Object.keys(mensual));
    const valores = etiquetas.map(k => mensual[k]);

    crearChartBar("ventasAnuales", etiquetas, valores, "Ventas", "Ventas mensuales acumuladas");

    const categorias = agruparCategorias(homenajes);
    const labels = Object.keys(categorias);
    crearChartDoughnut("ventasPorCategoriaVista", labels, labels.map(k => categorias[k]), "Participación por categoría");
}

function crearVistaCumplimientos(homenajes){
    crearCumplimientoDiario(homenajes);
    crearCumplimientoMensual(homenajes);
    crearCumplimientoTrimestral(homenajes);
    crearCumplimientoSemestral(homenajes);
    crearCumplimientoAnual(homenajes);
}

function crearCumplimientoDiario(homenajes){
    const diario = agruparPorPeriodo(homenajes, "dia");
    const etiquetas = ordenarFechas(Object.keys(diario));
    const ventas = etiquetas.map(k => diario[k]);

    const metas = etiquetas.map(k => {
        const fecha = new Date(`${k}T00:00:00`);
        return META_MENSUAL_BASE / diasDelMes(fecha);
    });

    crearChartLine("graficoCumplimientoDiario", etiquetas, [
        {
            label:"Venta diaria",
            data:ventas,
            borderColor:"#00a651",
            backgroundColor:"rgba(0,166,81,.14)",
            fill:true,
            tension:.3
        },
        {
            label:"Meta diaria",
            data:metas,
            borderColor:"#ef4444",
            borderDash:[8,6],
            pointRadius:0,
            fill:false
        }
    ], "Venta diaria vs meta diaria");

    llenarTablaCumplimiento("#tablaCumplimientoDiario tbody", etiquetas, metas, ventas);
}

function crearCumplimientoMensual(homenajes){
    const mensual = agruparPorPeriodo(homenajes, "mes");
    const etiquetas = ordenarMeses(Object.keys(mensual));
    const ventas = etiquetas.map(k => mensual[k]);
    const metas = etiquetas.map(() => META_MENSUAL_BASE);

    crearChartLine("cumplimientoMensualGrafico", etiquetas, [
        {
            label:"Venta mensual",
            data:ventas,
            borderColor:"#00a651",
            backgroundColor:"rgba(0,166,81,.14)",
            fill:true,
            tension:.3
        },
        {
            label:"Meta mensual",
            data:metas,
            borderColor:"#ef4444",
            borderDash:[8,6],
            pointRadius:0,
            fill:false
        }
    ], "Cumplimiento mensual");

    llenarTablaCumplimiento("#tablaCumplimientoMensual tbody", etiquetas, metas, ventas);
}

function crearCumplimientoTrimestral(homenajes){
    const datos = agruparPorPeriodo(homenajes, "trimestre");
    const etiquetas = Object.keys(datos).sort();
    const ventas = etiquetas.map(k => datos[k]);
    const metas = etiquetas.map(() => META_TRIMESTRAL_BASE);

    crearChartBar("graficoCumplimientoTrimestral", etiquetas, ventas, "Venta trimestral", "Cumplimiento trimestral", "rgba(124,58,237,.90)");
    llenarTablaCumplimiento("#tablaCumplimientoTrimestral tbody", etiquetas, metas, ventas);
}

function crearCumplimientoSemestral(homenajes){
    const datos = agruparPorPeriodo(homenajes, "semestre");
    const etiquetas = Object.keys(datos).sort();
    const ventas = etiquetas.map(k => datos[k]);
    const metas = etiquetas.map(() => META_SEMESTRAL_BASE);

    crearChartBar("graficoCumplimientoSemestral", etiquetas, ventas, "Venta semestral", "Cumplimiento semestral", "rgba(37,99,235,.90)");
    llenarTablaCumplimiento("#tablaCumplimientoSemestral tbody", etiquetas, metas, ventas);
}

function crearCumplimientoAnual(homenajes){
    const datos = agruparPorPeriodo(homenajes, "anio");
    const etiquetas = Object.keys(datos).sort();
    const ventas = etiquetas.map(k => datos[k]);
    const metas = etiquetas.map(() => META_ANUAL_BASE);

    crearChartBar("cumplimientoAnualGrafico", etiquetas, ventas, "Venta anual", "Cumplimiento anual", "rgba(0,166,81,.90)");
    llenarTablaCumplimiento("#tablaCumplimientoAnual tbody", etiquetas, metas, ventas);
}

function llenarTablaCumplimiento(selector, etiquetas, metas, ventas){
    const tbody = document.querySelector(selector);
    if(!tbody) return;

    if(etiquetas.length === 0){
        tbody.innerHTML = `<tr><td colspan="5">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = etiquetas.map((etiqueta, index) => {
        const meta = metas[index] || 0;
        const venta = ventas[index] || 0;
        const porcentaje = meta > 0 ? (venta / meta) * 100 : 0;

        return `
            <tr>
                <td>${etiqueta}</td>
                <td>${formatMoney(meta)}</td>
                <td>${formatMoney(venta)}</td>
                <td>${porcentaje.toFixed(1)}%</td>
                <td>${badgeEstado(porcentaje)}</td>
            </tr>
        `;
    }).join("");
}

function crearVistaGestores(homenajes){
    const gestores = Object.values(agruparGestores(homenajes))
        .sort((a,b) => b.valor - a.valor)
        .slice(0, 15);

    crearChartBar(
        "rankingCompletoGestores",
        gestores.map(item => item.nombre),
        gestores.map(item => item.valor),
        "Valor vendido",
        "Ranking completo de gestores",
        "rgba(37,99,235,.92)"
    );
}

function crearVistaExcedentes(homenajes){
    const ranking = Object.entries(agruparExcedentes(homenajes))
        .sort((a,b) => b[1].valor - a[1].valor)
        .slice(0, 12);

    crearChartBar(
        "graficoExcedentes",
        ranking.map(([nombre]) => nombre),
        ranking.map(([, data]) => data.valor),
        "Excedentes",
        "Excedentes por valor",
        "rgba(245,158,11,.92)"
    );
}

function crearVistaComparativos(homenajes){
    const mensual = agruparPorPeriodo(homenajes, "mes");
    const etiquetas = ordenarMeses(Object.keys(mensual));
    const ventas = etiquetas.map(k => mensual[k]);
    const metas = etiquetas.map(() => META_MENSUAL_BASE);

    crearChartLine("graficoComparativoMensual", etiquetas, [
        {
            label:"Venta mensual",
            data:ventas,
            borderColor:"#00a651",
            backgroundColor:"rgba(0,166,81,.14)",
            fill:true,
            tension:.3
        },
        {
            label:"Meta mensual",
            data:metas,
            borderColor:"#ef4444",
            borderDash:[8,6],
            pointRadius:0,
            fill:false
        }
    ], "Comparativo mensual");

    const tbody = document.querySelector("#tablaComparativos tbody");

    if(tbody){
        if(etiquetas.length === 0){
            tbody.innerHTML = `<tr><td colspan="5">Sin registros</td></tr>`;
            return;
        }

        tbody.innerHTML = etiquetas.map((etiqueta, index) => {
            const venta = ventas[index];
            const meta = metas[index];
            const cumplimiento = meta > 0 ? (venta / meta) * 100 : 0;
            const diferencia = venta - meta;

            return `
                <tr>
                    <td>${etiqueta}</td>
                    <td>${formatMoney(venta)}</td>
                    <td>${formatMoney(meta)}</td>
                    <td>${cumplimiento.toFixed(1)}%</td>
                    <td>${formatMoney(diferencia)}</td>
                </tr>
            `;
        }).join("");
    }
}

function crearVistaTendencias(homenajes){
    const mensual = agruparPorPeriodo(homenajes, "mes");
    const etiquetas = ordenarMeses(Object.keys(mensual));
    const valores = etiquetas.map(k => mensual[k]);

    crearChartLine("graficoHistorico", etiquetas, [
        {
            label:"Ventas históricas",
            data:valores,
            borderColor:"#00a651",
            backgroundColor:"rgba(0,166,81,.13)",
            fill:true,
            tension:.35,
            pointRadius:5,
            pointBackgroundColor:"#00a651"
        }
    ], "Serie histórica de ventas");
}

function crearVistaMetas(){
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

    crearChartLine("graficoMetasAcumuladas", etiquetas, [
        {
            label:"Meta acumulada",
            data:metas,
            borderColor:"#00a651",
            backgroundColor:"rgba(0,166,81,.14)",
            fill:true,
            tension:.25,
            pointRadius:5
        }
    ], "Meta acumulada mensual");
}

function ejecutarModulosFinales(homenajes, resumen, metaInfo){
    actualizarProyeccionesGerenciales(homenajes, resumen, metaInfo);
    actualizarCierreGerencial(homenajes, resumen, metaInfo);
    actualizarDiagnosticoAvanzado(homenajes);
}

function actualizarProyeccionesGerenciales(homenajes, resumen, metaInfo){
    const ventaTotal = resumen.total;
    const faltante = Math.max(META_RANGO_ACTUAL - ventaTotal, 0);

    const diasRango = Math.max(DIAS_RANGO_ACTUAL, 1);
    const promedioDiarioReal = ventaTotal / diasRango;
    const proyeccionRango = promedioDiarioReal * diasRango;
    const proyeccionAnual = promedioDiarioReal * 365;

    const valorDiarioNecesario = diasRango > 0 ? faltante / diasRango : 0;
    const cumplimientoProyectadoAnual = META_ANUAL_BASE > 0 ? (proyeccionAnual / META_ANUAL_BASE) * 100 : 0;

    let riesgo = "BAJO";
    let riesgoClase = "#16a34a";

    if(cumplimientoProyectadoAnual < 80){
        riesgo = "ALTO";
        riesgoClase = "#dc2626";
    }else if(cumplimientoProyectadoAnual < 100){
        riesgo = "MEDIO";
        riesgoClase = "#f59e0b";
    }

    setHtml("proyPromedioDiario", formatMoney(promedioDiarioReal));
    setHtml("proyRango", formatMoney(proyeccionRango));
    setHtml("proyAnual", formatMoney(proyeccionAnual));
    setHtml("riesgoProyectado", riesgo);
    setHtml("valorDiarioNecesario", formatMoney(valorDiarioNecesario));

    const riesgoEl = document.getElementById("riesgoProyectado");
    if(riesgoEl) riesgoEl.style.color = riesgoClase;

    crearGraficoProyeccionAnual(proyeccionAnual);

    const tbody = document.querySelector("#tablaProyecciones tbody");

    if(tbody){
        tbody.innerHTML = `
            <tr>
                <td>Meta anual</td>
                <td>${formatMoney(META_ANUAL_BASE)}</td>
                <td>Objetivo general anual configurado.</td>
            </tr>
            <tr>
                <td>Proyección anual</td>
                <td>${formatMoney(proyeccionAnual)}</td>
                <td>Estimación con base en el ritmo diario del rango filtrado.</td>
            </tr>
            <tr>
                <td>Cumplimiento proyectado anual</td>
                <td>${cumplimientoProyectadoAnual.toFixed(1)}%</td>
                <td>${textoEstado(cumplimientoProyectadoAnual)}</td>
            </tr>
            <tr>
                <td>Faltante del rango</td>
                <td>${formatMoney(faltante)}</td>
                <td>Valor pendiente para cumplir la meta seleccionada.</td>
            </tr>
            <tr>
                <td>Valor diario necesario</td>
                <td>${formatMoney(valorDiarioNecesario)}</td>
                <td>Promedio requerido para cubrir el faltante del rango.</td>
            </tr>
        `;
    }
}

function crearGraficoProyeccionAnual(proyeccionAnual){
    const canvas = document.getElementById("graficoProyeccionAnual");
    if(!canvas) return;

    destruirChart("graficoProyeccionAnual");

    charts.graficoProyeccionAnual = new Chart(canvas, {
        type:"bar",
        data:{
            labels:["Meta anual", "Proyección anual"],
            datasets:[{
                label:"Valor",
                data:[META_ANUAL_BASE, proyeccionAnual],
                backgroundColor:[
                    "rgba(37,99,235,.90)",
                    "rgba(0,166,81,.90)"
                ],
                borderRadius:12
            }]
        },
        options:opcionesChartBasicas("Meta anual vs proyección anual")
    });
}

function actualizarCierreGerencial(homenajes, resumen, metaInfo){
    const ventaTotal = resumen.total;
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (ventaTotal / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - ventaTotal, 0);
    const promedioDiarioMeta = DIAS_RANGO_ACTUAL > 0 ? META_RANGO_ACTUAL / DIAS_RANGO_ACTUAL : 0;
    const promedioDiarioReal = DIAS_RANGO_ACTUAL > 0 ? ventaTotal / DIAS_RANGO_ACTUAL : 0;

    let conclusion = "";

    if(cumplimiento >= 100){
        conclusion = `
            El desempeño del rango seleccionado es favorable. La meta se encuentra cumplida con un avance de 
            <strong>${cumplimiento.toFixed(1)}%</strong>, superando la meta calculada de 
            <strong>${formatMoney(META_RANGO_ACTUAL)}</strong>. Se recomienda mantener el ritmo comercial, 
            fortalecer los servicios de mayor participación y documentar las prácticas exitosas del periodo.
        `;
    }else if(cumplimiento >= 80){
        conclusion = `
            El desempeño del rango seleccionado se encuentra en zona de riesgo controlado con un avance de 
            <strong>${cumplimiento.toFixed(1)}%</strong>. La venta acumulada es de 
            <strong>${formatMoney(ventaTotal)}</strong> frente a una meta de 
            <strong>${formatMoney(META_RANGO_ACTUAL)}</strong>. Se requiere reforzar el seguimiento diario 
            para cerrar el faltante de <strong>${formatMoney(faltante)}</strong>.
        `;
    }else{
        conclusion = `
            El desempeño del rango seleccionado se encuentra por debajo del nivel esperado, con un avance de 
            <strong>${cumplimiento.toFixed(1)}%</strong>. La brecha frente a la meta es de 
            <strong>${formatMoney(faltante)}</strong>. Se recomienda activar un plan de choque comercial, 
            seguimiento por gestor y revisión de servicios con baja rotación.
        `;
    }

    setHtml("conclusionGerencial", conclusion);

    const plan = [];

    if(cumplimiento < 80){
        plan.push({
            titulo:"Plan de choque comercial",
            texto:"Realizar seguimiento diario a gestores, priorizar oportunidades activas y revisar casos pendientes de cierre.",
            prioridad:"Alta"
        });
    }

    if(promedioDiarioReal < promedioDiarioMeta){
        plan.push({
            titulo:"Incrementar promedio diario",
            texto:`El promedio diario real es ${formatMoney(promedioDiarioReal)}, por debajo de la meta diaria de ${formatMoney(promedioDiarioMeta)}.`,
            prioridad:"Alta"
        });
    }

    plan.push({
        titulo:"Revisión de categorías",
        texto:"Identificar las categorías con mayor participación y fortalecer las de menor rendimiento.",
        prioridad:"Media"
    });

    plan.push({
        titulo:"Seguimiento por gestor",
        texto:"Revisar ranking, concentración de ventas y asignar metas de recuperación por responsable.",
        prioridad:"Media"
    });

    plan.push({
        titulo:"Reporte a gerencia",
        texto:"Exportar PDF y Excel del dashboard para revisión en comité gerencial.",
        prioridad:"Baja"
    });

    const planBox = document.getElementById("planAccionGerencial");

    if(planBox){
        planBox.innerHTML = plan.map(item => {
            const clase =
                item.prioridad === "Alta" ? "prioridad-alta" :
                item.prioridad === "Media" ? "prioridad-media" :
                "prioridad-baja";

            return `
                <div class="plan-card">
                    <h4>${item.titulo}</h4>
                    <p>${item.texto}</p>
                    <p class="${clase}">Prioridad: ${item.prioridad}</p>
                </div>
            `;
        }).join("");
    }

    actualizarMatrizDecision(cumplimiento, promedioDiarioReal, promedioDiarioMeta, homenajes);
}

function actualizarMatrizDecision(cumplimiento, promedioDiarioReal, promedioDiarioMeta, homenajes){
    const tbody = document.querySelector("#tablaDecisionGerencial tbody");
    if(!tbody) return;

    const estadoCumplimiento =
        cumplimiento >= 100 ? "Bueno" :
        cumplimiento >= 80 ? "Riesgo" :
        "Crítico";

    const estadoPromedio =
        promedioDiarioReal >= promedioDiarioMeta ? "Bueno" : "Crítico";

    const estadoDatos =
        homenajes.length > 0 ? "Bueno" : "Crítico";

    tbody.innerHTML = `
        <tr>
            <td>Cumplimiento de meta</td>
            <td class="${claseEstado(estadoCumplimiento)}">${estadoCumplimiento}</td>
            <td>Revisar avance contra meta y activar acciones según brecha.</td>
            <td>${estadoCumplimiento === "Crítico" ? "Alta" : "Media"}</td>
        </tr>
        <tr>
            <td>Promedio diario</td>
            <td class="${claseEstado(estadoPromedio)}">${estadoPromedio}</td>
            <td>Comparar promedio real contra promedio requerido.</td>
            <td>${estadoPromedio === "Crítico" ? "Alta" : "Media"}</td>
        </tr>
        <tr>
            <td>Calidad de datos</td>
            <td class="${claseEstado(estadoDatos)}">${estadoDatos}</td>
            <td>Validar que la API entregue registros con fecha, valor, gestor y categoría.</td>
            <td>${estadoDatos === "Crítico" ? "Alta" : "Baja"}</td>
        </tr>
    `;
}

function claseEstado(estado){
    if(estado === "Bueno") return "estado-bueno";
    if(estado === "Riesgo") return "estado-riesgo";
    return "estado-critico";
}

function actualizarDiagnosticoAvanzado(){
    const totalApi = DATASET.length;
    const totalFiltrado = DATASET_FILTRADO.length;

    const fechasInvalidas = DATASET.filter(item => !parseFecha(getFechaItem(item))).length;
    const valoresCero = DATASET.filter(item => toNumber(getValorItem(item)) === 0).length;
    const sinGestor = DATASET.filter(item => !String(getGestorItem(item) || "").trim()).length;
    const sinCategoria = DATASET.filter(item => !String(getTipoHomenajeItem(item) || "").trim()).length;

    const errores = fechasInvalidas + valoresCero + sinGestor + sinCategoria;
    const calidad = totalApi > 0 ? Math.max(100 - ((errores / (totalApi * 4)) * 100), 0) : 0;

    setHtml("diagTotalApi", totalApi);
    setHtml("diagTotalFiltrado", totalFiltrado);
    setHtml("diagFechasInvalidas", fechasInvalidas);
    setHtml("diagValoresCero", valoresCero);
    setHtml("diagSinGestor", sinGestor);
    setHtml("diagSinCategoria", sinCategoria);
    setHtml("diagCalidad", `${calidad.toFixed(1)}%`);

    const calidadEl = document.getElementById("diagCalidad");
    if(calidadEl) calidadEl.style.color = colorPorPorcentaje(calidad);

    let texto = "";

    if(totalApi === 0){
        texto = "No se están recibiendo registros desde la API. Verifica Apps Script, permisos de publicación y estructura del JSON.";
    }else if(calidad >= 95){
        texto = "La calidad de datos es alta. La información recibida es suficiente para análisis gerencial.";
    }else if(calidad >= 80){
        texto = "La calidad de datos es aceptable, pero existen registros que deben corregirse para mejorar la precisión del dashboard.";
    }else{
        texto = "La calidad de datos requiere revisión. Hay inconsistencias que pueden afectar metas, ventas, gráficos y reportes.";
    }

    setHtml("diagnosticoTexto", texto);

    const tbody = document.querySelector("#tablaDiagnosticoDatos tbody");

    if(tbody){
        const muestra = DATASET.slice(0, 50);

        if(muestra.length === 0){
            tbody.innerHTML = `<tr><td colspan="6">Sin registros recibidos desde la API</td></tr>`;
            return;
        }

        tbody.innerHTML = muestra.map(item => {
            const fecha = getFechaItem(item);
            const gestor = getGestorItem(item);
            const categoria = getTipoHomenajeItem(item);
            const servicio = getTipoExcedenteItem(item);
            const valor = toNumber(getValorItem(item));

            const correcto = parseFecha(fecha) && valor > 0 && gestor && categoria;

            return `
                <tr>
                    <td>${fecha || "-"}</td>
                    <td>${gestor || "-"}</td>
                    <td>${categoria || "-"}</td>
                    <td>${servicio || "-"}</td>
                    <td>${formatMoney(valor)}</td>
                    <td>${correcto ? '<span class="badge badge-ok">Correcto</span>' : '<span class="badge badge-danger">Revisar</span>'}</td>
                </tr>
            `;
        }).join("");
    }
}

function actualizarVistaMetas(metaInfo){
    setHtml("vistaMetaMensual", formatMoney(META_MENSUAL_BASE));
    setHtml("vistaMetaTrimestral", formatMoney(META_TRIMESTRAL_BASE));
    setHtml("vistaMetaSemestral", formatMoney(META_SEMESTRAL_BASE));
    setHtml("vistaMetaAnual", formatMoney(META_ANUAL_BASE));
    setHtml("vistaMetaRango", formatMoney(metaInfo.meta));
    setHtml("vistaMesesRango", metaInfo.mesesEquivalentes.toFixed(2));
}

function actualizarAdmin(totalOriginal, totalFiltrado, metaInfo){
    setHtml("adminMetaMensual", formatMoney(META_MENSUAL_BASE));
    setHtml("adminMetaGeneral", formatMoney(metaInfo.meta));
    setHtml("adminUltimaActualizacion", new Date().toLocaleString("es-CO"));
    setHtml("adminTotalRegistros", `${totalFiltrado.length} / ${totalOriginal.length}`);

    const { fechaInicio, fechaFin, busqueda } = obtenerRangoFechas();

    let texto = "Sin filtro";
    if(fechaInicio || fechaFin || busqueda){
        texto = `${fechaInicio || "inicio"} - ${fechaFin || "fin"}`;
        if(busqueda) texto += ` | Búsqueda: ${busqueda}`;
    }

    setHtml("adminRangoFechas", texto);
}

function actualizarBaseDatos(){
    const fechasInvalidas = DATASET.filter(item => !parseFecha(getFechaItem(item))).length;
    const valoresCero = DATASET.filter(item => toNumber(getValorItem(item)) === 0).length;

    setHtml("bdTotalApi", DATASET.length);
    setHtml("bdTotalFiltrados", DATASET_FILTRADO.length);
    setHtml("bdFechasInvalidas", fechasInvalidas);
    setHtml("bdValoresCero", valoresCero);

    const tbody = document.querySelector("#tablaBaseDatos tbody");
    if(!tbody) return;

    const muestra = DATASET_FILTRADO.slice(0, 50);

    if(muestra.length === 0){
        tbody.innerHTML = `<tr><td colspan="5">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = muestra.map(item => `
        <tr>
            <td>${getFechaItem(item) || "-"}</td>
            <td>${getGestorItem(item) || "-"}</td>
            <td>${getTipoHomenajeItem(item) || "-"}</td>
            <td>${getTipoExcedenteItem(item) || "-"}</td>
            <td>${formatMoney(getValorItem(item))}</td>
        </tr>
    `).join("");
}

function actualizarConfiguracion(){
    const input = document.getElementById("configMetaMensual");
    if(input) input.value = META_MENSUAL_BASE;
}

function cambiarVista(seccion){
    document.querySelectorAll(".menu-item").forEach(item => item.classList.remove("active"));
    document.querySelectorAll(".vista").forEach(v => v.classList.remove("active-view"));

    const itemMenu = document.querySelector(`.menu-item[data-seccion="${seccion}"]`);
    if(itemMenu) itemMenu.classList.add("active");

    const vista = document.getElementById(seccion);
    if(vista) vista.classList.add("active-view");

    setTimeout(redimensionarGraficos, 180);
}

function redimensionarGraficos(){
    Object.values(charts).forEach(chart => {
        if(chart && typeof chart.resize === "function"){
            chart.resize();
        }
    });
}

function exportarExcel(){
    if(typeof XLSX === "undefined") return;

    const hojaDatos = DATASET_FILTRADO.map(item => ({
        Fecha:getFechaItem(item) || "",
        Gestor:getGestorItem(item) || "",
        Tipo_Homenaje:getTipoHomenajeItem(item) || "",
        Tipo_Excedente:getTipoExcedenteItem(item) || "",
        Valor:toNumber(getValorItem(item))
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

    setHtml("estadoReporte", "Reporte Excel generado correctamente.");
}

function exportarPDF(){
    const elemento = document.getElementById("panelExportar");
    if(!elemento || typeof html2pdf === "undefined") return;

    const opciones = {
        margin:0.2,
        filename:"dashboard_gerencial_homenajes.pdf",
        image:{ type:"jpeg", quality:0.98 },
        html2canvas:{ scale:2, useCORS:true },
        jsPDF:{ unit:"in", format:"a4", orientation:"landscape" },
        pagebreak:{ mode:["css", "legacy"] }
    };

    html2pdf().set(opciones).from(elemento).save();

    setHtml("estadoReporte", "Reporte PDF generado correctamente.");
}

function alternarTema(){
    document.body.classList.toggle("dark-mode");
    localStorage.setItem("dashboardTema", document.body.classList.contains("dark-mode") ? "dark" : "light");
    setTimeout(redimensionarGraficos, 150);
}

function alternarSidebar(){
    document.body.classList.toggle("sidebar-collapsed");
    localStorage.setItem("dashboardSidebar", document.body.classList.contains("sidebar-collapsed") ? "collapsed" : "expanded");
    setTimeout(redimensionarGraficos, 250);
}

function pantallaCompleta(){
    if(!document.fullscreenElement){
        document.documentElement.requestFullscreen?.();
    }else{
        document.exitFullscreen?.();
    }
}

function limpiarFiltros(){
    const fechaInicio = document.getElementById("fechaInicio");
    const fechaFin = document.getElementById("fechaFin");
    const busqueda = document.getElementById("busquedaGeneral");

    if(fechaInicio) fechaInicio.value = "";
    if(fechaFin) fechaFin.value = "";
    if(busqueda) busqueda.value = "";

    establecerFechasPorDefecto();
    cargarDashboard();
}

function guardarMetaMensual(){
    const input = document.getElementById("configMetaMensual");
    if(!input) return;

    const nuevaMeta = toNumber(input.value);

    if(nuevaMeta <= 0){
        alert("Ingrese una meta válida mayor a cero.");
        return;
    }

    META_MENSUAL_BASE = nuevaMeta;
    localStorage.setItem("metaMensualBase", String(nuevaMeta));
    recalcularMetasBase();
    cargarDashboard();

    alert("Meta mensual guardada correctamente.");
}

function aplicarPreferencias(){
    const tema = localStorage.getItem("dashboardTema");
    const sidebar = localStorage.getItem("dashboardSidebar");

    if(tema === "dark") document.body.classList.add("dark-mode");
    if(sidebar === "collapsed") document.body.classList.add("sidebar-collapsed");
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

document.getElementById("reporteExcelResumen")?.addEventListener("click", exportarExcel);
document.getElementById("reportePdfGeneral")?.addEventListener("click", exportarPDF);
document.getElementById("reporteRecargar")?.addEventListener("click", cargarDashboard);
document.getElementById("btnGuardarMeta")?.addEventListener("click", guardarMetaMensual);

document.getElementById("busquedaGeneral")?.addEventListener("keyup", event => {
    if(event.key === "Enter") cargarDashboard();
});

aplicarPreferencias();
recalcularMetasBase();
establecerFechasPorDefecto();
cargarDashboard();
