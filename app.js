console.log("APP.JS CARGADO CORRECTAMENTE");

const API_URL = "https://script.google.com/macros/s/AKfycbxEyu57a5spnJNju9t4654U8SDBrWFWQ0GWLibubGy5ntZsOV3N-TeL73423-a23j6FwA/exec";

let META_MENSUAL_BASE = Number(localStorage.getItem("metaMensualBase")) || 219133881;
let ACCESS_CODE = localStorage.getItem("dashboardAccessCode") || "JKFH2026";

let META_TRIMESTRAL_BASE = META_MENSUAL_BASE * 3;
let META_SEMESTRAL_BASE = META_MENSUAL_BASE * 6;
let META_ANUAL_BASE = META_MENSUAL_BASE * 12;

let META_RANGO_ACTUAL = 0;
let MESES_EQUIVALENTES_ACTUAL = 0;
let DIAS_RANGO_ACTUAL = 0;

let DATASET = [];
let DATASET_NORMAL = [];
let DATASET_FILTRADO = [];

let charts = {};
let ULTIMO_RESUMEN = null;
let ULTIMA_META_INFO = null;

function destruirChart(id){
    if(charts[id]){
        charts[id].destroy();
        charts[id] = null;
    }
}

function toNumber(valor){
    if(typeof valor === "number") return Number.isFinite(valor) ? valor : 0;

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

function normalizarLlave(valor){
    return String(valor ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}

function setHtml(id, valor){
    const el = document.getElementById(id);
    if(el) el.innerHTML = valor;
}

function setValue(id, valor){
    const el = document.getElementById(id);
    if(el) el.value = valor;
}

function getCampo(item, posibles){
    const mapa = {};
    Object.keys(item || {}).forEach(k => mapa[normalizarLlave(k)] = item[k]);

    for(const campo of posibles){
        const llave = normalizarLlave(campo);
        if(mapa[llave] !== undefined && mapa[llave] !== null && String(mapa[llave]).trim() !== ""){
            return mapa[llave];
        }
    }

    return "";
}

function getFechaItem(item){
    return getCampo(item, ["Fecha","FECHA","fecha","Fecha_Homenaje","FECHA_HOMENAJE","Fecha Homenaje","FECHA HOMENAJE","Fecha Servicio","FECHA SERVICIO"]);
}

function getValorItem(item){
    return getCampo(item, ["Valor","VALOR","valor","Valor_Homenaje","VALOR_HOMENAJE","Valor Homenaje","VALOR HOMENAJE","Total","TOTAL","Venta","VENTA","Valor Total","VALOR TOTAL"]);
}

function getGestorItem(item){
    return getCampo(item, ["Gestor","GESTOR","gestor","Asesor","ASESOR","Vendedor","VENDEDOR","Responsable","RESPONSABLE"]);
}

function getTipoHomenajeItem(item){
    return getCampo(item, ["Tipo_Homenaje","TIPO_HOMENAJE","Tipo Homenaje","TIPO HOMENAJE","Categoria","CATEGORIA","Categoría","CATEGORÍA","Tipo","TIPO"]);
}

function getTipoExcedenteItem(item){
    return getCampo(item, ["Tipo_Excedente","TIPO_EXCEDENTE","Tipo Excedente","TIPO EXCEDENTE","Servicio","SERVICIO","Excedente","EXCEDENTE","Producto","PRODUCTO"]);
}

function getSedeItem(item){
    return getCampo(item, ["Sede","SEDE","Ciudad","CIUDAD","Sucursal","SUCURSAL","Zona","ZONA"]);
}

function getObservacionItem(item){
    return getCampo(item, ["Observacion","Observación","OBSERVACION","OBSERVACIÓN","Nota","NOTA","Detalle","DETALLE"]);
}

function convertirArrayAObjetos(tabla){
    if(!Array.isArray(tabla) || tabla.length === 0) return [];

    if(typeof tabla[0] === "object" && !Array.isArray(tabla[0])) return tabla;

    if(Array.isArray(tabla[0])){
        const encabezados = tabla[0].map(h => String(h || "").trim());
        return tabla.slice(1).map(fila => {
            const obj = {};
            encabezados.forEach((encabezado, index) => obj[encabezado] = fila[index]);
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

    if(typeof valor === "number" && valor > 20000){
        const fechaExcel = new Date(Math.round((valor - 25569) * 86400 * 1000));
        return isNaN(fechaExcel.getTime()) ? null : fechaExcel;
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

function finDia(fecha){
    return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 23, 59, 59, 999);
}

function inicioMes(fecha){
    return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
}

function finMes(fecha){
    return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0);
}

function inicioSemana(fecha){
    const f = inicioDia(fecha);
    const dia = f.getDay() || 7;
    f.setDate(f.getDate() - dia + 1);
    return f;
}

function finSemana(fecha){
    const f = inicioSemana(fecha);
    f.setDate(f.getDate() + 6);
    return finDia(f);
}

function inicioTrimestre(fecha){
    const mes = Math.floor(fecha.getMonth() / 3) * 3;
    return new Date(fecha.getFullYear(), mes, 1);
}

function finTrimestre(fecha){
    const inicio = inicioTrimestre(fecha);
    return new Date(inicio.getFullYear(), inicio.getMonth() + 3, 0);
}

function inicioSemestre(fecha){
    return new Date(fecha.getFullYear(), fecha.getMonth() < 6 ? 0 : 6, 1);
}

function finSemestre(fecha){
    return fecha.getMonth() < 6 ? new Date(fecha.getFullYear(), 6, 0) : new Date(fecha.getFullYear(), 12, 0);
}

function inicioAnio(fecha){
    return new Date(fecha.getFullYear(), 0, 1);
}

function finAnio(fecha){
    return new Date(fecha.getFullYear(), 11, 31);
}

function diasDelMes(fecha){
    return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
}

function diasEntre(fechaInicio, fechaFin){
    const inicio = inicioDia(fechaInicio);
    const fin = inicioDia(fechaFin);
    return Math.max(Math.floor((fin - inicio) / 86400000) + 1, 1);
}

function mesKey(fecha){
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    return `${mes}/${fecha.getFullYear()}`;
}

function fechaKey(fecha){
    return fechaISO(fecha);
}

function semanaKey(fecha){
    const ini = inicioSemana(fecha);
    const fin = finSemana(fecha);
    return `${fechaISO(ini)} a ${fechaISO(fin)}`;
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

function recalcularMetasBase(){
    META_TRIMESTRAL_BASE = META_MENSUAL_BASE * 3;
    META_SEMESTRAL_BASE = META_MENSUAL_BASE * 6;
    META_ANUAL_BASE = META_MENSUAL_BASE * 12;
}

function calcularMetaPorRango(fechaInicioTexto, fechaFinTexto){
    let inicio = typeof fechaInicioTexto === "string" ? new Date(`${fechaInicioTexto}T00:00:00`) : fechaInicioTexto;
    let fin = typeof fechaFinTexto === "string" ? new Date(`${fechaFinTexto}T23:59:59`) : fechaFinTexto;

    if(!inicio || isNaN(inicio.getTime())){
        const hoy = new Date();
        inicio = new Date(hoy.getFullYear(), 0, 1);
    }

    if(!fin || isNaN(fin.getTime())) fin = new Date();

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

    return {
        inicio,
        fin,
        meta,
        mesesEquivalentes,
        diasRango: diasEntre(inicio, fin),
        detalleMeses
    };
}

function normalizarRegistro(item){
    const fecha = parseFecha(getFechaItem(item));
    const valor = toNumber(getValorItem(item));

    return {
        raw:item,
        fecha,
        fechaTexto:getFechaItem(item),
        valor,
        gestor:String(getGestorItem(item) || "").trim(),
        categoria:String(getTipoHomenajeItem(item) || "").trim(),
        servicio:String(getTipoExcedenteItem(item) || "").trim(),
        sede:String(getSedeItem(item) || "").trim(),
        observacion:String(getObservacionItem(item) || "").trim()
    };
}

function obtenerRangoFechas(){
    return {
        fechaInicio: document.getElementById("fechaInicio")?.value || "",
        fechaFin: document.getElementById("fechaFin")?.value || "",
        gestor: document.getElementById("filtroGestor")?.value || "",
        categoria: document.getElementById("filtroCategoria")?.value || "",
        servicio: document.getElementById("filtroServicio")?.value || "",
        sede: document.getElementById("filtroSede")?.value || "",
        anio: document.getElementById("filtroAnio")?.value || "",
        mes: document.getElementById("filtroMes")?.value || "",
        estado: document.getElementById("filtroEstado")?.value || "",
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

function estadoRegistro(row){
    if(!row.fecha) return "bajo";
    const metaDiaria = META_MENSUAL_BASE / diasDelMes(row.fecha);
    const porcentaje = metaDiaria > 0 ? (row.valor / metaDiaria) * 100 : 0;
    if(porcentaje >= 100) return "cumplido";
    if(porcentaje >= 80) return "riesgo";
    return "bajo";
}

function coincideFiltrosNoFecha(row, f){
    if(f.gestor && row.gestor !== f.gestor) return false;
    if(f.categoria && row.categoria !== f.categoria) return false;
    if(f.servicio && row.servicio !== f.servicio) return false;
    if(f.sede && row.sede !== f.sede) return false;
    if(f.estado && estadoRegistro(row) !== f.estado) return false;

    if(f.busqueda){
        const texto = normalizarTexto(`${row.gestor} ${row.categoria} ${row.servicio} ${row.sede} ${row.observacion}`);
        if(!texto.includes(f.busqueda)) return false;
    }

    return true;
}

function filtrarDataset(){
    const f = obtenerRangoFechas();

    const inicio = f.fechaInicio ? new Date(`${f.fechaInicio}T00:00:00`) : new Date("1900-01-01T00:00:00");
    const fin = f.fechaFin ? new Date(`${f.fechaFin}T23:59:59.999`) : new Date("2999-12-31T23:59:59.999");

    return DATASET_NORMAL.filter(row => {
        if(!row.fecha) return false;
        if(row.fecha < inicio || row.fecha > fin) return false;

        if(f.anio && row.fecha.getFullYear() !== Number(f.anio)) return false;
        if(f.mes && row.fecha.getMonth() + 1 !== Number(f.mes)) return false;

        return coincideFiltrosNoFecha(row, f);
    });
}

function filtrarPorRangoConFiltros(inicio, fin){
    const f = obtenerRangoFechas();

    return DATASET_NORMAL.filter(row => {
        if(!row.fecha) return false;
        if(row.fecha < inicioDia(inicio) || row.fecha > finDia(fin)) return false;
        return coincideFiltrosNoFecha(row, f);
    });
}

function sumar(rows){
    return rows.reduce((acc, row) => acc + toNumber(row.valor), 0);
}

function calcularResumen(rows){
    let total = 0;
    let red = 0;
    let particular = 0;
    let excedentes = 0;

    rows.forEach(row => {
        const valor = toNumber(row.valor);
        total += valor;

        const tipo = normalizarTexto(row.categoria);
        const excedente = normalizarTexto(row.servicio);

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

function fillSelect(id, values){
    const select = document.getElementById(id);
    if(!select) return;

    const actual = select.value;
    const first = select.querySelector("option")?.outerHTML || `<option value="">Todos</option>`;

    select.innerHTML = first;

    [...new Set(values.filter(v => String(v || "").trim()))]
        .sort((a,b) => String(a).localeCompare(String(b), "es"))
        .forEach(v => {
            const option = document.createElement("option");
            option.value = v;
            option.textContent = v;
            select.appendChild(option);
        });

    select.value = actual;
}

function poblarFiltros(){
    fillSelect("filtroGestor", DATASET_NORMAL.map(r => r.gestor));
    fillSelect("filtroCategoria", DATASET_NORMAL.map(r => r.categoria));
    fillSelect("filtroServicio", DATASET_NORMAL.map(r => r.servicio));
    fillSelect("filtroSede", DATASET_NORMAL.map(r => r.sede));

    const selectAnio = document.getElementById("filtroAnio");
    if(selectAnio){
        const actual = selectAnio.value;
        selectAnio.innerHTML = `<option value="">Todos</option>`;

        [...new Set(DATASET_NORMAL.filter(r => r.fecha).map(r => r.fecha.getFullYear()))]
            .sort()
            .forEach(y => {
                const option = document.createElement("option");
                option.value = y;
                option.textContent = y;
                selectAnio.appendChild(option);
            });

        selectAnio.value = actual;
    }
}

async function cargarDashboard(){
    setEstadoApi("cargando", "Cargando...");

    try{
        const response = await fetch(API_URL, { cache:"no-store" });
        if(!response.ok) throw new Error(`Error HTTP ${response.status}`);

        const json = await response.json();
        const datos = obtenerHomenajesDesdeApi(json);

        DATASET = datos;
        DATASET_NORMAL = datos.map(normalizarRegistro);

        poblarFiltros();

        DATASET_FILTRADO = filtrarDataset();

        const f = obtenerRangoFechas();
        const metaInfo = calcularMetaPorRango(f.fechaInicio, f.fechaFin);
        const resumen = calcularResumen(DATASET_FILTRADO);

        META_RANGO_ACTUAL = metaInfo.meta;
        MESES_EQUIVALENTES_ACTUAL = metaInfo.mesesEquivalentes;
        DIAS_RANGO_ACTUAL = metaInfo.diasRango;

        ULTIMO_RESUMEN = resumen;
        ULTIMA_META_INFO = metaInfo;

        renderTodo(resumen, metaInfo);
        setEstadoApi("ok", "Conectado");

    }catch(error){
        console.error("Error al cargar dashboard:", error);
        setEstadoApi("error", "Error API");

        const mensaje = `
            <div class="alerta-item">
                <i class="fas fa-triangle-exclamation"></i>
                <span>No fue posible cargar la información. Verifica Apps Script, permisos, publicación web y estructura del JSON.</span>
            </div>
        `;

        setHtml("alertasGerenciales", mensaje);
        setHtml("alertasGerencialesVista", mensaje);
    }
}

function renderTodo(resumen, metaInfo){
    actualizarKPIs(resumen, metaInfo);
    crearResumenEjecutivo(DATASET_FILTRADO, resumen, metaInfo);
    crearGraficosDashboard(resumen);
    crearTablasPrincipales(DATASET_FILTRADO, resumen.total);
    crearTablaCumplimiento(resumen.total);
    crearTablaConsolidada();
    crearSemaforoGerencial(resumen.total);
    crearAlertasGerenciales(DATASET_FILTRADO, resumen.total);
    renderizarVistasAdicionales(DATASET_FILTRADO, resumen, metaInfo);
    actualizarProyeccionesGerenciales(resumen, metaInfo);
    actualizarCierreGerencial(DATASET_FILTRADO, resumen);
    actualizarDiagnosticoAvanzado();
    actualizarAdmin(DATASET_NORMAL, DATASET_FILTRADO, metaInfo);
    actualizarVistaMetas(metaInfo);
    actualizarBaseDatos();
    actualizarConfiguracion();
    generarReporteFormal();
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

    const diasAnalizados = Math.max(Math.min(DIAS_RANGO_ACTUAL, diasEntre(metaInfo.inicio, new Date())), 1);
    const promedioDiarioReal = ventaTotal / diasAnalizados;
    const proyeccion = promedioDiarioReal * DIAS_RANGO_ACTUAL;
    const ticketPromedio = DATASET_FILTRADO.length > 0 ? ventaTotal / DATASET_FILTRADO.length : 0;

    setHtml("metaGrupal", formatMoney(META_RANGO_ACTUAL));
    setHtml("ventas", formatMoney(ventaTotal));
    setHtml("cumplimiento", `${cumplimientoGeneral.toFixed(1)}%`);
    setHtml("faltante", formatMoney(faltante));
    setHtml("proyeccion", formatMoney(proyeccion));

    setHtml("metaMensual", formatMoney(META_MENSUAL_BASE));
    setHtml("metaSemanal", formatMoney(META_MENSUAL_BASE / 30.4375 * 7));
    setHtml("metaTrimestral", formatMoney(META_TRIMESTRAL_BASE));
    setHtml("metaSemestral", formatMoney(META_SEMESTRAL_BASE));
    setHtml("metaAnual", formatMoney(META_ANUAL_BASE));

    setHtml("mesesEquivalentes", MESES_EQUIVALENTES_ACTUAL.toFixed(2));
    setHtml("promedioDiarioReal", formatMoney(promedioDiarioReal));
    setHtml("totalRegistros", DATASET_FILTRADO.length);
    setHtml("ticketPromedio", formatMoney(ticketPromedio));
    setHtml("ultimaActualizacion", new Date().toLocaleString("es-CO"));
    setHtml("estadoCumplimientoTexto", textoEstado(cumplimientoGeneral));

    setHtml("tvMeta", formatMoney(META_RANGO_ACTUAL));
    setHtml("tvVentas", formatMoney(ventaTotal));
    setHtml("tvCumplimiento", `${cumplimientoGeneral.toFixed(1)}%`);
    setHtml("tvFaltante", formatMoney(faltante));

    setHtml("metaRangoDetalle", `${fechaISO(metaInfo.inicio)} a ${fechaISO(metaInfo.fin)}`);

    const cumplimientoEl = document.getElementById("cumplimiento");
    if(cumplimientoEl) cumplimientoEl.style.color = colorPorPorcentaje(cumplimientoGeneral);

    const tvCumplimiento = document.getElementById("tvCumplimiento");
    if(tvCumplimiento) tvCumplimiento.style.color = colorPorPorcentaje(cumplimientoGeneral);
}

function crearResumenEjecutivo(rows, resumen, metaInfo){
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (resumen.total / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - resumen.total, 0);

    let estado = "por debajo de la meta establecida";
    if(cumplimiento >= 100) estado = "con la meta cumplida";
    else if(cumplimiento >= 80) estado = "en zona de seguimiento preventivo";

    const texto = `
        El rango seleccionado comprende <strong>${MESES_EQUIVALENTES_ACTUAL.toFixed(2)} meses equivalentes</strong>, 
        con una meta calculada de <strong>${formatMoney(META_RANGO_ACTUAL)}</strong>. 
        Las ventas acumuladas son <strong>${formatMoney(resumen.total)}</strong>, equivalentes al 
        <strong>${cumplimiento.toFixed(1)}%</strong> de cumplimiento. 
        Actualmente el resultado se encuentra <strong>${estado}</strong>. 
        Faltante para cumplimiento: <strong>${formatMoney(faltante)}</strong>. 
        Registros analizados: <strong>${rows.length}</strong>.
    `;

    setHtml("resumenEjecutivoTexto", texto);
    setHtml("vistaResumenTexto", texto);

    const tbody = document.querySelector("#tablaResumenGerencial tbody");
    if(tbody){
        tbody.innerHTML = `
            <tr><td>Meta del rango</td><td>${formatMoney(META_RANGO_ACTUAL)}</td><td>${MESES_EQUIVALENTES_ACTUAL.toFixed(2)} meses equivalentes</td></tr>
            <tr><td>Venta real</td><td>${formatMoney(resumen.total)}</td><td>${rows.length} registros analizados</td></tr>
            <tr><td>Cumplimiento</td><td>${cumplimiento.toFixed(1)}%</td><td>${textoEstado(cumplimiento)}</td></tr>
            <tr><td>Faltante</td><td>${formatMoney(faltante)}</td><td>Valor pendiente para cumplir la meta</td></tr>
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

function crearChartBar(idCanvas, labels, data, label, titulo, color = "rgba(0,166,81,.90)", horizontal = false){
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
        options:{
            ...opcionesChartBasicas(titulo),
            indexAxis: horizontal ? "y" : "x"
        }
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

function crearGraficosDashboard(resumen){
    crearGraficoMetaReal(resumen.total, META_RANGO_ACTUAL);
    crearGraficoIngresos(resumen);
    crearGraficoMensual(DATASET_FILTRADO);
    crearVelocimetroCumplimiento(resumen.total, "velocimetroCumplimiento");
}

function crearGraficoMetaReal(ventaTotal, metaRango){
    crearChartBar("graficoMetaReal", ["Meta del rango", "Venta real"], [metaRango, ventaTotal], "Valor", "Meta calculada vs venta real", "rgba(0,166,81,.90)");
}

function crearGraficoIngresos(resumen){
    crearChartDoughnut("composicionIngresos", ["RED", "PARTICULAR", "EXCEDENTES"], [resumen.red, resumen.particular, resumen.excedentes], "Composición de ingresos");
}

function crearGraficoMensual(rows){
    const mensual = agruparPorPeriodo(rows, "mes");
    const etiquetas = ordenarMeses(Object.keys(mensual));
    const ventas = etiquetas.map(k => mensual[k]);
    const metas = etiquetas.map(() => META_MENSUAL_BASE);

    crearChartLine("ventasMensuales", etiquetas, [
        { label:"Venta mensual", data:ventas, backgroundColor:"rgba(0,166,81,.16)", borderColor:"#00a651", borderWidth:4, fill:true, tension:.35 },
        { label:"Meta mensual base", data:metas, borderColor:"#ef4444", borderWidth:3, borderDash:[8,6], pointRadius:0, fill:false }
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

function agruparCategorias(rows){
    const obj = {};
    rows.forEach(row => {
        const k = row.categoria || "SIN CATEGORÍA";
        obj[k] = (obj[k] || 0) + row.valor;
    });
    return obj;
}

function agruparServicios(rows){
    const obj = {};
    rows.forEach(row => {
        const k = row.servicio || "SIN SERVICIO";
        if(!obj[k]) obj[k] = { cantidad:0, valor:0 };
        obj[k].cantidad += 1;
        obj[k].valor += row.valor;
    });
    return obj;
}

function agruparSedes(rows){
    const obj = {};
    rows.forEach(row => {
        const k = row.sede || "SIN SEDE";
        if(!obj[k]) obj[k] = { cantidad:0, valor:0 };
        obj[k].cantidad += 1;
        obj[k].valor += row.valor;
    });
    return obj;
}

function agruparGestores(rows){
    const obj = {};
    rows.forEach(row => {
        const nombre = row.gestor || "SIN GESTOR";
        if(!obj[nombre]) obj[nombre] = { nombre, cantidad:0, valor:0 };
        obj[nombre].cantidad += 1;
        obj[nombre].valor += row.valor;
    });
    return obj;
}

function agruparExcedentes(rows){
    const obj = {};
    rows.forEach(row => {
        const nombre = normalizarTexto(row.servicio);
        if(!nombre || nombre === "SOAT" || nombre === "PENSIONADO") return;

        if(!obj[nombre]) obj[nombre] = { cantidad:0, valor:0 };
        obj[nombre].cantidad += 1;
        obj[nombre].valor += row.valor;
    });
    return obj;
}

function crearTablasPrincipales(rows, totalGeneral){
    crearTablaCategoriasGeneral(rows, totalGeneral, "#tablaCategorias tbody");
    crearTablaCategoriasGeneral(rows, totalGeneral, "#tablaCategoriasVista tbody");
    crearTablaServiciosGeneral(rows, totalGeneral, "#tablaTopServicios tbody", 10);
    crearTablaServiciosGeneral(rows, totalGeneral, "#tablaServiciosVista tbody", 0);
    crearTablaGestoresGeneral(rows, totalGeneral, "#tablaGestores tbody");
    crearTablaGestoresGeneral(rows, totalGeneral, "#tablaGestoresVista tbody");
    crearTablaExcedentesGeneral(rows, totalGeneral, "#tablaExcedentes tbody");
    crearTablaExcedentesGeneral(rows, totalGeneral, "#tablaExcedentesVista tbody");
    crearTablaSedesGeneral(rows, totalGeneral, "#tablaSedesVista tbody");

    const categorias = agruparCategorias(rows);
    const catLabels = Object.keys(categorias);
    crearChartDoughnut("graficoCategoriasVista", catLabels, catLabels.map(k => categorias[k]), "Ventas por categoría");

    const servicios = agruparServicios(rows);
    const serviciosRanking = Object.entries(servicios).sort((a,b) => b[1].valor - a[1].valor).slice(0, 12);
    crearChartBar("graficoServiciosVista", serviciosRanking.map(([n]) => n), serviciosRanking.map(([, d]) => d.valor), "Valor vendido", "Servicios por valor vendido", "rgba(245,158,11,.92)", true);

    const sedes = agruparSedes(rows);
    const sedesRanking = Object.entries(sedes).sort((a,b) => b[1].valor - a[1].valor);
    crearChartBar("graficoSedesVista", sedesRanking.map(([n]) => n), sedesRanking.map(([, d]) => d.valor), "Valor vendido", "Ventas por sede", "rgba(6,182,212,.92)", true);

    const gestores = Object.values(agruparGestores(rows)).sort((a,b) => b.valor - a.valor);
    const mejorGestor = gestores[0];

    setHtml("mejorGestor", mejorGestor ? mejorGestor.nombre : "-");
    setHtml("ventaMejorGestor", mejorGestor ? formatMoney(mejorGestor.valor) : formatMoney(0));

    const servicioTop = Object.entries(servicios).sort((a,b) => b[1].cantidad - a[1].cantidad)[0];

    setHtml("servicioTop", servicioTop ? servicioTop[0] : "-");
    setHtml("cantidadServicioTop", servicioTop ? servicioTop[1].cantidad : "0");
}

function crearTablaCategoriasGeneral(rows, totalGeneral, selector){
    const tbody = document.querySelector(selector);
    if(!tbody) return;

    const ranking = Object.entries(agruparCategorias(rows)).sort((a,b) => b[1] - a[1]);

    if(ranking.length === 0){
        tbody.innerHTML = `<tr><td colspan="3">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = ranking.map(([nombre, valor]) => {
        const p = totalGeneral > 0 ? (valor / totalGeneral) * 100 : 0;
        return `<tr><td>${nombre}</td><td>${formatMoney(valor)}</td><td>${p.toFixed(1)}%</td></tr>`;
    }).join("");
}

function crearTablaServiciosGeneral(rows, totalGeneral, selector, limite = 0){
    const tbody = document.querySelector(selector);
    if(!tbody) return;

    let ranking = Object.entries(agruparServicios(rows)).sort((a,b) => b[1].valor - a[1].valor);
    if(limite > 0) ranking = ranking.slice(0, limite);

    if(ranking.length === 0){
        tbody.innerHTML = `<tr><td colspan="4">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = ranking.map(([nombre, data]) => {
        const p = totalGeneral > 0 ? (data.valor / totalGeneral) * 100 : 0;
        return `<tr><td>${nombre}</td><td>${data.cantidad}</td><td>${formatMoney(data.valor)}</td><td>${p.toFixed(1)}%</td></tr>`;
    }).join("");
}

function crearTablaSedesGeneral(rows, totalGeneral, selector){
    const tbody = document.querySelector(selector);
    if(!tbody) return;

    const ranking = Object.entries(agruparSedes(rows)).sort((a,b) => b[1].valor - a[1].valor);

    if(ranking.length === 0){
        tbody.innerHTML = `<tr><td colspan="4">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = ranking.map(([nombre, data]) => {
        const p = totalGeneral > 0 ? (data.valor / totalGeneral) * 100 : 0;
        return `<tr><td>${nombre}</td><td>${data.cantidad}</td><td>${formatMoney(data.valor)}</td><td>${p.toFixed(1)}%</td></tr>`;
    }).join("");
}

function crearTablaGestoresGeneral(rows, totalGeneral, selector){
    const tbody = document.querySelector(selector);
    if(!tbody) return;

    const ranking = Object.values(agruparGestores(rows)).sort((a,b) => b.valor - a.valor);

    if(ranking.length === 0){
        tbody.innerHTML = `<tr><td colspan="4">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = ranking.map(item => {
        const p = totalGeneral > 0 ? (item.valor / totalGeneral) * 100 : 0;
        return `<tr><td>${item.nombre}</td><td>${item.cantidad}</td><td>${formatMoney(item.valor)}</td><td>${p.toFixed(1)}%</td></tr>`;
    }).join("");
}

function crearTablaExcedentesGeneral(rows, totalGeneral, selector){
    const tbody = document.querySelector(selector);
    if(!tbody) return;

    const ranking = Object.entries(agruparExcedentes(rows)).sort((a,b) => b[1].valor - a[1].valor);

    if(ranking.length === 0){
        tbody.innerHTML = `<tr><td colspan="4">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = ranking.map(([nombre, data]) => {
        const p = totalGeneral > 0 ? (data.valor / totalGeneral) * 100 : 0;
        return `<tr><td>${nombre}</td><td>${data.cantidad}</td><td>${formatMoney(data.valor)}</td><td>${p.toFixed(1)}%</td></tr>`;
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

function crearAlertasGerenciales(rows, ventaTotal){
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (ventaTotal / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - ventaTotal, 0);
    const alertas = [];

    if(rows.length === 0){
        alertas.push("No hay registros para el rango seleccionado. Verifica filtros, fechas o conexión con Google Sheets.");
    }else{
        if(cumplimiento < 80) alertas.push(`Cumplimiento crítico: ${cumplimiento.toFixed(1)}%. Faltante: ${formatMoney(faltante)}.`);
        if(cumplimiento >= 80 && cumplimiento < 100) alertas.push(`Cumplimiento en riesgo controlado: ${cumplimiento.toFixed(1)}%. Se requiere seguimiento diario.`);
        if(cumplimiento >= 100) alertas.push(`Meta cumplida con avance de ${cumplimiento.toFixed(1)}%.`);

        const promedioDiarioNecesario = DIAS_RANGO_ACTUAL > 0 ? faltante / DIAS_RANGO_ACTUAL : 0;
        if(faltante > 0) alertas.push(`Promedio diario necesario para cubrir el faltante: ${formatMoney(promedioDiarioNecesario)}.`);

        const gestores = Object.values(agruparGestores(rows)).sort((a,b) => b.valor - a.valor);
        const mejorGestor = gestores[0];
        if(mejorGestor && ventaTotal > 0 && mejorGestor.valor / ventaTotal > 0.35){
            alertas.push(`El gestor ${mejorGestor.nombre} concentra más del 35% de las ventas del rango.`);
        }

        const calidad = calcularCalidadDatos().calidad;
        if(calidad < 90) alertas.push(`Calidad de datos por debajo del 90%. Revisar registros incompletos o mal digitados.`);
    }

    const html = alertas.map(a => `
        <div class="alerta-item">
            <i class="fas fa-circle-exclamation"></i>
            <span>${a}</span>
        </div>
    `).join("");

    setHtml("alertasGerenciales", html || "<p>Sin alertas por el momento.</p>");
    setHtml("alertasGerencialesVista", html || "<p>Sin alertas por el momento.</p>");
}

function agruparPorPeriodo(rows, periodo){
    const datos = {};

    rows.forEach(row => {
        if(!row.fecha) return;

        let llave = "";
        if(periodo === "dia") llave = fechaKey(row.fecha);
        if(periodo === "semana") llave = semanaKey(row.fecha);
        if(periodo === "mes") llave = mesKey(row.fecha);
        if(periodo === "trimestre") llave = trimestreKey(row.fecha);
        if(periodo === "semestre") llave = semestreKey(row.fecha);
        if(periodo === "anio") llave = anioKey(row.fecha);

        datos[llave] = (datos[llave] || 0) + row.valor;
    });

    return datos;
}

function renderizarVistasAdicionales(rows, resumen, metaInfo){
    crearVistaVentas(rows);
    crearVistaCumplimientos(rows);
    crearVistaGestores(rows);
    crearVistaExcedentes(rows);
    crearVistaComparativos(rows, metaInfo);
    crearVistaTendencias(rows);
    crearVistaMetas();
    crearVelocimetroCumplimiento(resumen.total, "graficoTvCumplimiento");
}

function crearVistaVentas(rows){
    const mensual = agruparPorPeriodo(rows, "mes");
    const etiquetas = ordenarMeses(Object.keys(mensual));
    crearChartBar("ventasAnuales", etiquetas, etiquetas.map(k => mensual[k]), "Ventas", "Ventas mensuales acumuladas");

    const categorias = agruparCategorias(rows);
    const labels = Object.keys(categorias);
    crearChartDoughnut("ventasPorCategoriaVista", labels, labels.map(k => categorias[k]), "Participación por categoría");
}

function crearVistaCumplimientos(rows){
    crearCumplimientoDiario(rows);
    crearCumplimientoSemanal(rows);
    crearCumplimientoMensual(rows);
    crearCumplimientoTrimestral(rows);
    crearCumplimientoSemestral(rows);
    crearCumplimientoAnual(rows);
}

function crearCumplimientoDiario(rows){
    const diario = agruparPorPeriodo(rows, "dia");
    const etiquetas = ordenarFechas(Object.keys(diario));
    const ventas = etiquetas.map(k => diario[k]);
    const metas = etiquetas.map(k => META_MENSUAL_BASE / diasDelMes(new Date(`${k}T00:00:00`)));

    crearChartLine("graficoCumplimientoDiario", etiquetas, [
        { label:"Venta diaria", data:ventas, borderColor:"#00a651", backgroundColor:"rgba(0,166,81,.14)", fill:true, tension:.3 },
        { label:"Meta diaria", data:metas, borderColor:"#ef4444", borderDash:[8,6], pointRadius:0, fill:false }
    ], "Venta diaria vs meta diaria");

    llenarTablaCumplimiento("#tablaCumplimientoDiario tbody", etiquetas, metas, ventas);
}

function crearCumplimientoSemanal(rows){
    const semanal = agruparPorPeriodo(rows, "semana");
    const etiquetas = Object.keys(semanal).sort();
    const ventas = etiquetas.map(k => semanal[k]);
    const metas = etiquetas.map(k => {
        const [desde, hasta] = k.split(" a ");
        return calcularMetaPorRango(desde, hasta).meta;
    });

    crearChartLine("graficoCumplimientoSemanal", etiquetas, [
        { label:"Venta semanal", data:ventas, borderColor:"#2563eb", backgroundColor:"rgba(37,99,235,.14)", fill:true, tension:.3 },
        { label:"Meta semanal", data:metas, borderColor:"#ef4444", borderDash:[8,6], pointRadius:0, fill:false }
    ], "Venta semanal vs meta semanal");

    llenarTablaCumplimiento("#tablaCumplimientoSemanal tbody", etiquetas, metas, ventas);
}

function crearCumplimientoMensual(rows){
    const mensual = agruparPorPeriodo(rows, "mes");
    const etiquetas = ordenarMeses(Object.keys(mensual));
    const ventas = etiquetas.map(k => mensual[k]);
    const metas = etiquetas.map(() => META_MENSUAL_BASE);

    crearChartLine("cumplimientoMensualGrafico", etiquetas, [
        { label:"Venta mensual", data:ventas, borderColor:"#00a651", backgroundColor:"rgba(0,166,81,.14)", fill:true, tension:.3 },
        { label:"Meta mensual", data:metas, borderColor:"#ef4444", borderDash:[8,6], pointRadius:0, fill:false }
    ], "Cumplimiento mensual");

    llenarTablaCumplimiento("#tablaCumplimientoMensual tbody", etiquetas, metas, ventas);
}

function crearCumplimientoTrimestral(rows){
    const datos = agruparPorPeriodo(rows, "trimestre");
    const etiquetas = Object.keys(datos).sort();
    const ventas = etiquetas.map(k => datos[k]);
    const metas = etiquetas.map(() => META_TRIMESTRAL_BASE);

    crearChartBar("graficoCumplimientoTrimestral", etiquetas, ventas, "Venta trimestral", "Cumplimiento trimestral", "rgba(124,58,237,.90)");
    llenarTablaCumplimiento("#tablaCumplimientoTrimestral tbody", etiquetas, metas, ventas);
}

function crearCumplimientoSemestral(rows){
    const datos = agruparPorPeriodo(rows, "semestre");
    const etiquetas = Object.keys(datos).sort();
    const ventas = etiquetas.map(k => datos[k]);
    const metas = etiquetas.map(() => META_SEMESTRAL_BASE);

    crearChartBar("graficoCumplimientoSemestral", etiquetas, ventas, "Venta semestral", "Cumplimiento semestral", "rgba(37,99,235,.90)");
    llenarTablaCumplimiento("#tablaCumplimientoSemestral tbody", etiquetas, metas, ventas);
}

function crearCumplimientoAnual(rows){
    const datos = agruparPorPeriodo(rows, "anio");
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

function crearVistaGestores(rows){
    const gestores = Object.values(agruparGestores(rows)).sort((a,b) => b.valor - a.valor).slice(0, 15);
    crearChartBar("rankingCompletoGestores", gestores.map(i => i.nombre), gestores.map(i => i.valor), "Valor vendido", "Ranking completo de gestores", "rgba(37,99,235,.92)", true);
}

function crearVistaExcedentes(rows){
    const ranking = Object.entries(agruparExcedentes(rows)).sort((a,b) => b[1].valor - a[1].valor).slice(0, 12);
    crearChartBar("graficoExcedentes", ranking.map(([n]) => n), ranking.map(([, d]) => d.valor), "Excedentes", "Excedentes por valor", "rgba(245,158,11,.92)", true);
}

function crearVistaComparativos(rows, metaInfo){
    const mensual = agruparPorPeriodo(rows, "mes");
    const etiquetas = ordenarMeses(Object.keys(mensual));
    const ventas = etiquetas.map(k => mensual[k]);
    const metas = etiquetas.map(() => META_MENSUAL_BASE);

    crearChartLine("graficoComparativoMensual", etiquetas, [
        { label:"Venta mensual", data:ventas, borderColor:"#00a651", backgroundColor:"rgba(0,166,81,.14)", fill:true, tension:.3 },
        { label:"Meta mensual", data:metas, borderColor:"#ef4444", borderDash:[8,6], pointRadius:0, fill:false }
    ], "Comparativo mensual");

    const dias = DIAS_RANGO_ACTUAL;
    const inicioActual = metaInfo.inicio;
    const finActual = metaInfo.fin;
    const inicioAnterior = new Date(inicioActual);
    inicioAnterior.setDate(inicioAnterior.getDate() - dias);
    const finAnterior = new Date(inicioActual);
    finAnterior.setDate(finAnterior.getDate() - 1);

    const ventaActual = sumar(DATASET_FILTRADO);
    const ventaAnterior = sumar(filtrarPorRangoConFiltros(inicioAnterior, finAnterior));
    const diferencia = ventaActual - ventaAnterior;
    const crecimiento = ventaAnterior > 0 ? (diferencia / ventaAnterior) * 100 : 0;

    crearChartBar("graficoComparativoPeriodos", ["Periodo anterior", "Periodo actual"], [ventaAnterior, ventaActual], "Venta", "Actual vs anterior", "rgba(37,99,235,.90)");

    const tbody = document.querySelector("#tablaComparativos tbody");
    if(tbody){
        tbody.innerHTML = `
            <tr>
                <td>${fechaISO(inicioActual)} a ${fechaISO(finActual)}</td>
                <td>${formatMoney(ventaActual)}</td>
                <td>${formatMoney(ventaAnterior)}</td>
                <td>${formatMoney(diferencia)}</td>
                <td>${crecimiento.toFixed(1)}%</td>
            </tr>
        `;
    }
}

function crearVistaTendencias(rows){
    const mensual = agruparPorPeriodo(rows, "mes");
    const etiquetas = ordenarMeses(Object.keys(mensual));
    const valores = etiquetas.map(k => mensual[k]);

    crearChartLine("graficoHistorico", etiquetas, [
        { label:"Ventas históricas", data:valores, borderColor:"#00a651", backgroundColor:"rgba(0,166,81,.13)", fill:true, tension:.35 }
    ], "Serie histórica de ventas");
}

function crearVistaMetas(){
    const etiquetas = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const metas = etiquetas.map((_, index) => META_MENSUAL_BASE * (index + 1));

    crearChartLine("graficoMetasAcumuladas", etiquetas, [
        { label:"Meta acumulada", data:metas, borderColor:"#00a651", backgroundColor:"rgba(0,166,81,.14)", fill:true, tension:.25 }
    ], "Meta acumulada mensual");
}

function calcularPeriodo(tipo, refDate){
    let inicio, fin, nombre;

    if(tipo === "Diario"){
        inicio = inicioDia(refDate);
        fin = finDia(refDate);
        nombre = "Diario";
    }

    if(tipo === "Semanal"){
        inicio = inicioSemana(refDate);
        fin = finSemana(refDate);
        nombre = "Semanal";
    }

    if(tipo === "Mensual"){
        inicio = inicioMes(refDate);
        fin = finMes(refDate);
        nombre = "Mensual";
    }

    if(tipo === "Trimestral"){
        inicio = inicioTrimestre(refDate);
        fin = finTrimestre(refDate);
        nombre = "Trimestral";
    }

    if(tipo === "Semestral"){
        inicio = inicioSemestre(refDate);
        fin = finSemestre(refDate);
        nombre = "Semestral";
    }

    if(tipo === "Anual"){
        inicio = inicioAnio(refDate);
        fin = finAnio(refDate);
        nombre = "Anual";
    }

    const rows = filtrarPorRangoConFiltros(inicio, fin);
    const venta = sumar(rows);
    const meta = calcularMetaPorRango(inicio, fin).meta;
    const cumplimiento = meta > 0 ? (venta / meta) * 100 : 0;
    const faltante = Math.max(meta - venta, 0);
    const diasPeriodo = diasEntre(inicio, fin);
    const hoy = new Date();
    const finAnalisis = hoy < fin ? hoy : fin;
    const diasAnalizados = Math.max(diasEntre(inicio, finAnalisis), 1);
    const proyeccion = (venta / diasAnalizados) * diasPeriodo;

    return { nombre, meta, venta, cumplimiento, faltante, proyeccion };
}

function crearTablaConsolidada(){
    const tbody = document.querySelector("#tablaConsolidada tbody");
    if(!tbody || !ULTIMA_META_INFO) return;

    const ref = ULTIMA_META_INFO.fin;
    const periodos = ["Diario","Semanal","Mensual","Trimestral","Semestral","Anual"].map(p => calcularPeriodo(p, ref));

    tbody.innerHTML = periodos.map(p => `
        <tr>
            <td>${p.nombre}</td>
            <td>${formatMoney(p.meta)}</td>
            <td>${formatMoney(p.venta)}</td>
            <td>${p.cumplimiento.toFixed(1)}%</td>
            <td>${formatMoney(p.faltante)}</td>
            <td>${formatMoney(p.proyeccion)}</td>
            <td>${badgeEstado(p.cumplimiento)}</td>
        </tr>
    `).join("");
}

function actualizarProyeccionesGerenciales(resumen, metaInfo){
    const ventaTotal = resumen.total;
    const faltante = Math.max(META_RANGO_ACTUAL - ventaTotal, 0);

    const hoy = new Date();
    const diasAnalizados = Math.max(Math.min(DIAS_RANGO_ACTUAL, diasEntre(metaInfo.inicio, hoy)), 1);
    const promedioDiarioReal = ventaTotal / diasAnalizados;

    const proyMes = promedioDiarioReal * diasDelMes(metaInfo.fin);
    const proyAnual = promedioDiarioReal * 365;
    const valorDiarioNecesario = DIAS_RANGO_ACTUAL > 0 ? faltante / DIAS_RANGO_ACTUAL : 0;
    const cumplimientoProyectadoAnual = META_ANUAL_BASE > 0 ? (proyAnual / META_ANUAL_BASE) * 100 : 0;

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
    setHtml("proyMes", formatMoney(proyMes));
    setHtml("proyAnual", formatMoney(proyAnual));
    setHtml("riesgoProyectado", riesgo);
    setHtml("valorDiarioNecesario", formatMoney(valorDiarioNecesario));

    const riesgoEl = document.getElementById("riesgoProyectado");
    if(riesgoEl) riesgoEl.style.color = riesgoClase;

    crearChartBar("graficoProyeccionAnual", ["Meta anual", "Proyección anual"], [META_ANUAL_BASE, proyAnual], "Valor", "Meta anual vs proyección anual", "rgba(0,166,81,.90)");

    const tbody = document.querySelector("#tablaProyecciones tbody");
    if(tbody){
        tbody.innerHTML = `
            <tr><td>Meta anual</td><td>${formatMoney(META_ANUAL_BASE)}</td><td>Objetivo general anual configurado.</td></tr>
            <tr><td>Proyección mensual</td><td>${formatMoney(proyMes)}</td><td>Estimación de cierre mensual con ritmo actual.</td></tr>
            <tr><td>Proyección anual</td><td>${formatMoney(proyAnual)}</td><td>Estimación anualizada con promedio diario actual.</td></tr>
            <tr><td>Cumplimiento proyectado anual</td><td>${cumplimientoProyectadoAnual.toFixed(1)}%</td><td>${textoEstado(cumplimientoProyectadoAnual)}</td></tr>
            <tr><td>Valor diario necesario</td><td>${formatMoney(valorDiarioNecesario)}</td><td>Promedio requerido para cubrir el faltante del rango.</td></tr>
        `;
    }
}

function actualizarCierreGerencial(rows, resumen){
    const ventaTotal = resumen.total;
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (ventaTotal / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - ventaTotal, 0);
    const promedioDiarioMeta = DIAS_RANGO_ACTUAL > 0 ? META_RANGO_ACTUAL / DIAS_RANGO_ACTUAL : 0;
    const promedioDiarioReal = DIAS_RANGO_ACTUAL > 0 ? ventaTotal / DIAS_RANGO_ACTUAL : 0;

    let conclusion = "";

    if(cumplimiento >= 100){
        conclusion = `El desempeño del rango seleccionado es favorable. La meta se encuentra cumplida con un avance de <strong>${cumplimiento.toFixed(1)}%</strong>, superando la meta calculada de <strong>${formatMoney(META_RANGO_ACTUAL)}</strong>.`;
    }else if(cumplimiento >= 80){
        conclusion = `El desempeño se encuentra en zona de riesgo controlado con avance de <strong>${cumplimiento.toFixed(1)}%</strong>. Se requiere reforzar seguimiento para cerrar el faltante de <strong>${formatMoney(faltante)}</strong>.`;
    }else{
        conclusion = `El desempeño está por debajo del nivel esperado, con avance de <strong>${cumplimiento.toFixed(1)}%</strong>. La brecha frente a la meta es de <strong>${formatMoney(faltante)}</strong>.`;
    }

    setHtml("conclusionGerencial", conclusion);

    const plan = [];

    if(cumplimiento < 80){
        plan.push({ titulo:"Plan de choque comercial", texto:"Seguimiento diario a gestores, priorización de oportunidades activas y revisión de pendientes.", prioridad:"Alta" });
    }

    if(promedioDiarioReal < promedioDiarioMeta){
        plan.push({ titulo:"Incrementar promedio diario", texto:`Promedio real: ${formatMoney(promedioDiarioReal)}. Meta diaria requerida: ${formatMoney(promedioDiarioMeta)}.`, prioridad:"Alta" });
    }

    plan.push({ titulo:"Revisión por categoría", texto:"Identificar categorías fuertes y fortalecer líneas de baja participación.", prioridad:"Media" });
    plan.push({ titulo:"Seguimiento por gestor", texto:"Revisar ranking, concentración de ventas y asignar metas de recuperación.", prioridad:"Media" });
    plan.push({ titulo:"Reporte a gerencia", texto:"Exportar PDF formal y Excel para comité gerencial.", prioridad:"Baja" });

    const planBox = document.getElementById("planAccionGerencial");
    if(planBox){
        planBox.innerHTML = plan.map(item => {
            const clase = item.prioridad === "Alta" ? "prioridad-alta" : item.prioridad === "Media" ? "prioridad-media" : "prioridad-baja";
            return `<div class="plan-card"><h4>${item.titulo}</h4><p>${item.texto}</p><p class="${clase}">Prioridad: ${item.prioridad}</p></div>`;
        }).join("");
    }

    actualizarMatrizDecision(cumplimiento, promedioDiarioReal, promedioDiarioMeta, rows);
}

function actualizarMatrizDecision(cumplimiento, promedioDiarioReal, promedioDiarioMeta, rows){
    const tbody = document.querySelector("#tablaDecisionGerencial tbody");
    if(!tbody) return;

    const calidad = calcularCalidadDatos().calidad;

    const estadoCumplimiento = cumplimiento >= 100 ? "Bueno" : cumplimiento >= 80 ? "Riesgo" : "Crítico";
    const estadoPromedio = promedioDiarioReal >= promedioDiarioMeta ? "Bueno" : "Crítico";
    const estadoDatos = calidad >= 95 ? "Bueno" : calidad >= 80 ? "Riesgo" : "Crítico";

    tbody.innerHTML = `
        <tr><td>Cumplimiento de meta</td><td class="${claseEstado(estadoCumplimiento)}">${estadoCumplimiento}</td><td>Revisar avance contra meta y activar acciones según brecha.</td><td>${estadoCumplimiento === "Crítico" ? "Alta" : "Media"}</td></tr>
        <tr><td>Promedio diario</td><td class="${claseEstado(estadoPromedio)}">${estadoPromedio}</td><td>Comparar promedio real contra promedio requerido.</td><td>${estadoPromedio === "Crítico" ? "Alta" : "Media"}</td></tr>
        <tr><td>Calidad de datos</td><td class="${claseEstado(estadoDatos)}">${estadoDatos}</td><td>Validar registros con fecha, valor, gestor, categoría y sede.</td><td>${estadoDatos === "Crítico" ? "Alta" : "Baja"}</td></tr>
    `;
}

function claseEstado(estado){
    if(estado === "Bueno") return "estado-bueno";
    if(estado === "Riesgo") return "estado-riesgo";
    return "estado-critico";
}

function calcularCalidadDatos(){
    const totalApi = DATASET_NORMAL.length;
    const fechasInvalidas = DATASET_NORMAL.filter(row => !row.fecha).length;
    const valoresCero = DATASET_NORMAL.filter(row => row.valor === 0).length;
    const sinGestor = DATASET_NORMAL.filter(row => !row.gestor).length;
    const sinCategoria = DATASET_NORMAL.filter(row => !row.categoria).length;
    const sinSede = DATASET_NORMAL.filter(row => !row.sede).length;

    const errores = fechasInvalidas + valoresCero + sinGestor + sinCategoria + sinSede;
    const calidad = totalApi > 0 ? Math.max(100 - ((errores / (totalApi * 5)) * 100), 0) : 0;

    return { totalApi, fechasInvalidas, valoresCero, sinGestor, sinCategoria, sinSede, calidad };
}

function actualizarDiagnosticoAvanzado(){
    const d = calcularCalidadDatos();

    setHtml("diagTotalApi", d.totalApi);
    setHtml("diagTotalFiltrado", DATASET_FILTRADO.length);
    setHtml("diagFechasInvalidas", d.fechasInvalidas);
    setHtml("diagValoresCero", d.valoresCero);
    setHtml("diagSinGestor", d.sinGestor);
    setHtml("diagSinCategoria", d.sinCategoria);
    setHtml("diagCalidad", `${d.calidad.toFixed(1)}%`);

    const calidadEl = document.getElementById("diagCalidad");
    if(calidadEl) calidadEl.style.color = colorPorPorcentaje(d.calidad);

    let texto = "";
    if(d.totalApi === 0) texto = "No se están recibiendo registros desde la API. Verifica Apps Script, permisos y estructura del JSON.";
    else if(d.calidad >= 95) texto = "La calidad de datos es alta. La información recibida es suficiente para análisis gerencial.";
    else if(d.calidad >= 80) texto = "La calidad de datos es aceptable, pero existen registros que deben corregirse.";
    else texto = "La calidad de datos requiere revisión. Hay inconsistencias que pueden afectar metas, ventas y reportes.";

    setHtml("diagnosticoTexto", texto);

    const tbody = document.querySelector("#tablaDiagnosticoDatos tbody");
    if(tbody){
        const muestra = DATASET_NORMAL.slice(0, 50);

        if(muestra.length === 0){
            tbody.innerHTML = `<tr><td colspan="6">Sin registros recibidos desde la API</td></tr>`;
            return;
        }

        tbody.innerHTML = muestra.map(row => {
            const correcto = row.fecha && row.valor > 0 && row.gestor && row.categoria;
            return `
                <tr>
                    <td>${row.fechaTexto || "-"}</td>
                    <td>${row.gestor || "-"}</td>
                    <td>${row.categoria || "-"}</td>
                    <td>${row.servicio || "-"}</td>
                    <td>${formatMoney(row.valor)}</td>
                    <td>${correcto ? '<span class="badge badge-ok">Correcto</span>' : '<span class="badge badge-danger">Revisar</span>'}</td>
                </tr>
            `;
        }).join("");
    }
}

function actualizarVistaMetas(metaInfo){
    setHtml("vistaMetaDiaria", formatMoney(META_MENSUAL_BASE / 30.4375));
    setHtml("vistaMetaSemanal", formatMoney(META_MENSUAL_BASE / 30.4375 * 7));
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

    const f = obtenerRangoFechas();

    let texto = `${f.fechaInicio || "inicio"} - ${f.fechaFin || "fin"}`;
    if(f.gestor) texto += ` | Gestor: ${f.gestor}`;
    if(f.categoria) texto += ` | Categoría: ${f.categoria}`;
    if(f.servicio) texto += ` | Servicio: ${f.servicio}`;
    if(f.sede) texto += ` | Sede: ${f.sede}`;
    if(f.busqueda) texto += ` | Búsqueda: ${f.busqueda}`;

    setHtml("adminRangoFechas", texto);
}

function actualizarBaseDatos(){
    const d = calcularCalidadDatos();

    setHtml("bdTotalApi", DATASET_NORMAL.length);
    setHtml("bdTotalFiltrados", DATASET_FILTRADO.length);
    setHtml("bdFechasInvalidas", d.fechasInvalidas);
    setHtml("bdValoresCero", d.valoresCero);

    const tbody = document.querySelector("#tablaBaseDatos tbody");
    if(!tbody) return;

    const muestra = DATASET_FILTRADO.slice(0, 50);

    if(muestra.length === 0){
        tbody.innerHTML = `<tr><td colspan="6">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = muestra.map(row => `
        <tr>
            <td>${row.fechaTexto || "-"}</td>
            <td>${row.gestor || "-"}</td>
            <td>${row.categoria || "-"}</td>
            <td>${row.servicio || "-"}</td>
            <td>${row.sede || "-"}</td>
            <td>${formatMoney(row.valor)}</td>
        </tr>
    `).join("");
}

function actualizarConfiguracion(){
    setValue("configMetaMensual", META_MENSUAL_BASE);
    setValue("configTitulo", localStorage.getItem("dashboardTitulo") || "General Report Jkfh");
    setValue("configSubtitulo", localStorage.getItem("dashboardSubtitulo") || "Dashboard gerencial premium 4K | Seguimiento, control, metas y análisis ejecutivo");
    setValue("configAccessCode", ACCESS_CODE);

    setHtml("tituloDashboard", localStorage.getItem("dashboardTitulo") || "General Report Jkfh");
    setHtml("subtituloDashboard", localStorage.getItem("dashboardSubtitulo") || "Dashboard gerencial premium 4K | Seguimiento, control, metas y análisis ejecutivo");
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
        if(chart && typeof chart.resize === "function") chart.resize();
    });
}

function generarReporteFormal(){
    const reporte = document.getElementById("reporteFormal");
    if(!reporte || !ULTIMO_RESUMEN || !ULTIMA_META_INFO) return;

    const cumplimiento = META_RANGO_ACTUAL > 0 ? (ULTIMO_RESUMEN.total / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - ULTIMO_RESUMEN.total, 0);
    const d = calcularCalidadDatos();

    reporte.innerHTML = `
        <h1>${localStorage.getItem("dashboardTitulo") || "General Report Jkfh"}</h1>
        <p><strong>Reporte gerencial formal</strong></p>
        <p>Fecha de generación: ${new Date().toLocaleString("es-CO")}</p>
        <p>Rango analizado: ${fechaISO(ULTIMA_META_INFO.inicio)} a ${fechaISO(ULTIMA_META_INFO.fin)}</p>

        <div class="print-grid">
            <div class="print-kpi"><span>Meta del rango</span><strong>${formatMoney(META_RANGO_ACTUAL)}</strong></div>
            <div class="print-kpi"><span>Venta real</span><strong>${formatMoney(ULTIMO_RESUMEN.total)}</strong></div>
            <div class="print-kpi"><span>Cumplimiento</span><strong>${cumplimiento.toFixed(1)}%</strong></div>
            <div class="print-kpi"><span>Faltante</span><strong>${formatMoney(faltante)}</strong></div>
        </div>

        <h2>Resumen Ejecutivo</h2>
        <p>
            El rango seleccionado comprende ${MESES_EQUIVALENTES_ACTUAL.toFixed(2)} meses equivalentes. 
            La venta acumulada alcanza ${formatMoney(ULTIMO_RESUMEN.total)}, con un cumplimiento del ${cumplimiento.toFixed(1)}%.
            Estado general: ${textoEstado(cumplimiento)}.
        </p>

        <h2>Tabla Gerencial Consolidada</h2>
        <table>
            <thead>
                <tr><th>Indicador</th><th>Resultado</th></tr>
            </thead>
            <tbody>
                <tr><td>Meta mensual base</td><td>${formatMoney(META_MENSUAL_BASE)}</td></tr>
                <tr><td>Meta anual</td><td>${formatMoney(META_ANUAL_BASE)}</td></tr>
                <tr><td>Registros analizados</td><td>${DATASET_FILTRADO.length}</td></tr>
                <tr><td>Calidad de datos</td><td>${d.calidad.toFixed(1)}%</td></tr>
            </tbody>
        </table>

        <h2>Conclusión Gerencial</h2>
        <p>${document.getElementById("conclusionGerencial")?.innerText || ""}</p>

        <h2>Plan de Acción</h2>
        <p>Reforzar seguimiento por gestor, validar registros incompletos, monitorear cumplimiento diario y exportar informe para comité gerencial.</p>
    `;
}

function exportarExcel(){
    if(typeof XLSX === "undefined") return;

    const hojaDatos = DATASET_FILTRADO.map(row => ({
        Fecha: row.fechaTexto || "",
        Gestor: row.gestor || "",
        Categoria: row.categoria || "",
        Servicio: row.servicio || "",
        Sede: row.sede || "",
        Valor: row.valor
    }));

    const resumen = calcularResumen(DATASET_FILTRADO);
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (resumen.total / META_RANGO_ACTUAL) * 100 : 0;
    const d = calcularCalidadDatos();

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
        ["Registros Filtrados", DATASET_FILTRADO.length],
        ["Calidad de datos %", d.calidad]
    ]);

    const wsDatos = XLSX.utils.json_to_sheet(hojaDatos);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen Ejecutivo");
    XLSX.utils.book_append_sheet(wb, wsDatos, "Base Filtrada");

    XLSX.writeFile(wb, "dashboard_gerencial_homenajes.xlsx");
    setHtml("estadoReporte", "Reporte Excel generado correctamente.");
}

function exportarPDF(){
    generarReporteFormal();

    const elemento = document.getElementById("reporteFormal");
    if(!elemento || typeof html2pdf === "undefined") return;

    const opciones = {
        margin:0.25,
        filename:"reporte_gerencial_homenajes.pdf",
        image:{ type:"jpeg", quality:0.98 },
        html2canvas:{ scale:2, useCORS:true },
        jsPDF:{ unit:"in", format:"a4", orientation:"portrait" },
        pagebreak:{ mode:["css", "legacy"] }
    };

    html2pdf().set(opciones).from(elemento).save();
    setHtml("estadoReporte", "Reporte PDF formal generado correctamente.");
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
    if(!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
}

function limpiarFiltros(){
    ["filtroGestor","filtroCategoria","filtroServicio","filtroSede","filtroAnio","filtroMes","filtroEstado"].forEach(id => setValue(id, ""));
    setValue("busquedaGeneral", "");
    setValue("fechaInicio", "");
    setValue("fechaFin", "");
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

function guardarConfigVisual(){
    const titulo = document.getElementById("configTitulo")?.value || "General Report Jkfh";
    const subtitulo = document.getElementById("configSubtitulo")?.value || "Dashboard gerencial premium 4K | Seguimiento, control, metas y análisis ejecutivo";

    localStorage.setItem("dashboardTitulo", titulo);
    localStorage.setItem("dashboardSubtitulo", subtitulo);

    actualizarConfiguracion();
    alert("Configuración visual guardada correctamente.");
}

function guardarAccessCode(){
    const code = document.getElementById("configAccessCode")?.value || "JKFH2026";
    ACCESS_CODE = code;
    localStorage.setItem("dashboardAccessCode", code);
    alert("Código de acceso actualizado correctamente.");
}

function aplicarPreferencias(){
    const tema = localStorage.getItem("dashboardTema");
    const sidebar = localStorage.getItem("dashboardSidebar");

    if(tema === "dark") document.body.classList.add("dark-mode");
    if(sidebar === "collapsed") document.body.classList.add("sidebar-collapsed");

    actualizarConfiguracion();
}

function validarAcceso(){
    const panel = document.getElementById("accessPanel");
    if(!panel) return;

    const autorizado = sessionStorage.getItem("dashboardAutorizado") === "1";
    if(autorizado){
        panel.classList.add("hidden");
        return;
    }

    panel.classList.remove("hidden");
}

function ingresarDashboard(){
    const valor = document.getElementById("accessCode")?.value || "";

    if(valor === ACCESS_CODE){
        sessionStorage.setItem("dashboardAutorizado", "1");
        document.getElementById("accessPanel")?.classList.add("hidden");
    }else{
        alert("Código incorrecto.");
    }
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
document.getElementById("btnGuardarConfigVisual")?.addEventListener("click", guardarConfigVisual);
document.getElementById("btnGuardarAccess")?.addEventListener("click", guardarAccessCode);

document.getElementById("btnAccess")?.addEventListener("click", ingresarDashboard);
document.getElementById("accessCode")?.addEventListener("keyup", event => {
    if(event.key === "Enter") ingresarDashboard();
});

document.getElementById("busquedaGeneral")?.addEventListener("keyup", event => {
    if(event.key === "Enter") cargarDashboard();
});

[
    "filtroGestor",
    "filtroCategoria",
    "filtroServicio",
    "filtroSede",
    "filtroAnio",
    "filtroMes",
    "filtroEstado"
].forEach(id => {
    document.getElementById(id)?.addEventListener("change", cargarDashboard);
});

aplicarPreferencias();
validarAcceso();
recalcularMetasBase();
establecerFechasPorDefecto();
cargarDashboard();
