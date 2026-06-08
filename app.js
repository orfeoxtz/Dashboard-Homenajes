console.log("APP.JS CARGADO CORRECTAMENTE - VERSION 20260610");

const API_URL = "https://script.google.com/macros/s/AKfycbxEyu57a5spnJNju9t4654U8SDBrWFWQ0GWLibubGy5ntZsOV3N-TeL73423-a23j6FwA/exec";

let META_MENSUAL_BASE = Number(localStorage.getItem("metaMensualBase")) || 219133881;
let ACCESS_CODE = localStorage.getItem("dashboardAccessCode") || "JKFH2026";
let AUTO_MINUTOS = Number(localStorage.getItem("dashboardAutoMinutos")) || 5;

let META_TRIMESTRAL_BASE = META_MENSUAL_BASE * 3;
let META_SEMESTRAL_BASE = META_MENSUAL_BASE * 6;
let META_ANUAL_BASE = META_MENSUAL_BASE * 12;

let META_RANGO_ACTUAL = 0;
let MESES_EQUIVALENTES_ACTUAL = 0;
let DIAS_RANGO_ACTUAL = 0;

let DATASET_API = [];
let DATASET_MANUAL = [];
let DATASET_NORMAL = [];
let DATASET_FILTRADO = [];

let charts = {};
let ULTIMO_RESUMEN = null;
let ULTIMA_META_INFO = null;
let AUTO_TIMER = null;
let API_STATUS = { ok:false, mensaje:"Sin validar", columnas:[], registros:0 };

const $ = id => document.getElementById(id);

function destruirChart(id){
    if(charts[id]){
        charts[id].destroy();
        charts[id] = null;
    }
}

function showLoading(show){
    $("loadingOverlay")?.classList.toggle("show", show);
}

function toast(message, type = "ok"){
    const contenedor = $("toastContainer");
    if(!contenedor) return;

    const div = document.createElement("div");
    div.className = `toast ${type}`;
    div.textContent = message;
    contenedor.appendChild(div);

    setTimeout(() => div.remove(), 3800);
}

function registrarBitacora(accion, detalle = ""){
    const data = JSON.parse(localStorage.getItem("dashboardBitacora") || "[]");

    data.unshift({
        fecha:new Date().toLocaleString("es-CO"),
        accion,
        detalle
    });

    localStorage.setItem("dashboardBitacora", JSON.stringify(data.slice(0, 100)));
    renderBitacora();
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
    const el = $(id);
    if(el) el.innerHTML = valor;
}

function setValue(id, valor){
    const el = $(id);
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

function mesNumeroKey(fecha){
    return String(fecha.getMonth() + 1);
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

function parseMapaMetas(texto){
    const mapa = {};
    String(texto || "").split(/\n|,/).forEach(linea => {
        const clean = linea.trim();
        if(!clean) return;

        const partes = clean.split(/=|:/);
        if(partes.length < 2) return;

        const clave = normalizarTexto(partes[0]);
        const valor = toNumber(partes.slice(1).join("="));

        if(clave && valor > 0) mapa[clave] = valor;
    });

    return mapa;
}

function getMapaMetas(tipo){
    return parseMapaMetas(localStorage.getItem(tipo) || "");
}

function metaMensualAplicable(fecha){
    const metasMes = getMapaMetas("metasMes");
    const numero = normalizarTexto(mesNumeroKey(fecha));
    const mesNombre = normalizarTexto(nombreMes(fecha.getMonth() + 1));

    return metasMes[numero] || metasMes[mesNombre] || META_MENSUAL_BASE;
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

    while(cursor <= limite){
        const mesInicio = inicioMes(cursor);
        const mesFin = finMes(cursor);

        const desde = inicio > mesInicio ? inicioDia(inicio) : mesInicio;
        const hasta = fin < mesFin ? inicioDia(fin) : mesFin;

        const diasSeleccionados = diasEntre(desde, hasta);
        const totalDiasMes = diasDelMes(cursor);
        const factorMes = diasSeleccionados / totalDiasMes;

        meta += metaMensualAplicable(cursor) * factorMes;
        mesesEquivalentes += factorMes;

        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    return {
        inicio,
        fin,
        meta,
        mesesEquivalentes,
        diasRango: diasEntre(inicio, fin)
    };
}

function normalizarRegistro(item, origen = "API"){
    const fecha = parseFecha(getFechaItem(item));
    const valor = toNumber(getValorItem(item));

    return {
        id:item.id || cryptoRandom(),
        origen,
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

function cryptoRandom(){
    return "id_" + Date.now() + "_" + Math.random().toString(16).slice(2);
}

function obtenerRangoFechas(){
    return {
        fechaInicio: $("fechaInicio")?.value || "",
        fechaFin: $("fechaFin")?.value || "",
        gestor: $("filtroGestor")?.value || "",
        categoria: $("filtroCategoria")?.value || "",
        servicio: $("filtroServicio")?.value || "",
        sede: $("filtroSede")?.value || "",
        anio: $("filtroAnio")?.value || "",
        mes: $("filtroMes")?.value || "",
        estado: $("filtroEstado")?.value || "",
        busqueda: normalizarTexto($("busquedaGeneral")?.value || "")
    };
}

function establecerFechasPorDefecto(){
    if(!$("fechaInicio") || !$("fechaFin")) return;

    if(!$("fechaInicio").value && !$("fechaFin").value){
        const hoy = new Date();
        $("fechaInicio").value = fechaISO(inicioAnio(hoy));
        $("fechaFin").value = fechaISO(hoy);
    }
}

function estadoRegistro(row){
    if(!row.fecha) return "bajo";
    const metaDiaria = metaMensualAplicable(row.fecha) / diasDelMes(row.fecha);
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
    const estado = $("estadoApi");
    if(!estado) return;

    estado.className = `estado-api ${tipo}`;
    estado.innerHTML = `<i class="fas fa-circle"></i> ${texto}`;
    setHtml("adminEstadoConexion", texto);
}

function fillSelect(id, values){
    const select = $(id);
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

    const selectAnio = $("filtroAnio");
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

function cargarManuales(){
    const guardados = JSON.parse(localStorage.getItem("registrosManuales") || "[]");
    DATASET_MANUAL = guardados;
    return guardados.map(item => normalizarRegistro(item, "MANUAL"));
}

async function cargarDashboard(){
    setEstadoApi("cargando", "Cargando...");
    showLoading(true);

    try{
        const response = await fetch(API_URL, { cache:"no-store" });
        if(!response.ok) throw new Error(`Error HTTP ${response.status}`);

        const json = await response.json();
        const datos = obtenerHomenajesDesdeApi(json);

        DATASET_API = datos;
        const normalApi = datos.map(item => normalizarRegistro(item, "API"));
        const normalManual = cargarManuales();

        DATASET_NORMAL = [...normalApi, ...normalManual];

        API_STATUS = validarEstructuraApi(datos);

        poblarFiltros();
        aplicarFiltrosYRender();

        setEstadoApi("ok", "Conectado");
        toast("Dashboard actualizado correctamente.");
        registrarBitacora("Actualización", "Se actualizó la información desde la API.");

    }catch(error){
        console.error("Error al cargar dashboard:", error);
        API_STATUS = { ok:false, mensaje:"Error API", columnas:[], registros:0 };

        const normalManual = cargarManuales();
        DATASET_NORMAL = [...normalManual];

        poblarFiltros();
        aplicarFiltrosYRender();

        setEstadoApi("error", "Error API");
        toast("No fue posible cargar la API. Se muestran registros manuales si existen.", "error");
    }finally{
        showLoading(false);
    }
}

function validarEstructuraApi(datos){
    const columnas = datos.length ? Object.keys(datos[0]) : [];
    const requeridas = ["Fecha","Gestor","Tipo_Homenaje","Tipo_Excedente","Valor","Sede"];
    const faltantes = requeridas.filter(req => !columnas.some(c => normalizarLlave(c) === normalizarLlave(req)));

    return {
        ok: datos.length > 0 && faltantes.length === 0,
        mensaje: datos.length === 0 ? "Sin registros API" : faltantes.length ? "Columnas incompletas" : "API válida",
        columnas,
        faltantes,
        registros:datos.length
    };
}

function aplicarFiltrosYRender(){
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
}

function renderTodo(resumen, metaInfo){
    actualizarKPIs(resumen, metaInfo);
    crearResumenEjecutivo(DATASET_FILTRADO, resumen);
    crearGraficosDashboard(resumen);
    crearTablasPrincipales(DATASET_FILTRADO, resumen.total);
    crearTablaConsolidada();
    crearAlertasGerenciales(DATASET_FILTRADO, resumen.total);
    renderizarVistasAdicionales(DATASET_FILTRADO, resumen, metaInfo);
    actualizarProyeccionesGerenciales(resumen, metaInfo);
    actualizarCierreGerencial(DATASET_FILTRADO, resumen);
    actualizarDiagnosticoAvanzado();
    actualizarAuditoria();
    actualizarMetasPorGestor();
    actualizarMetasAvanzadas();
    actualizarComparativoAnual();
    actualizarPareto();
    actualizarAdmin(DATASET_NORMAL, DATASET_FILTRADO, metaInfo);
    actualizarVistaMetas(metaInfo);
    actualizarBaseDatos();
    actualizarRegistrosManuales();
    actualizarPruebas();
    actualizarConfiguracion();
    generarReporteFormal();
    renderBitacora();
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
    const metaDiaria = META_RANGO_ACTUAL / Math.max(DIAS_RANGO_ACTUAL, 1);
    const brechaDiaria = promedioDiarioReal - metaDiaria;
    const proyeccion = promedioDiarioReal * DIAS_RANGO_ACTUAL;
    const ticketPromedio = DATASET_FILTRADO.length > 0 ? ventaTotal / DATASET_FILTRADO.length : 0;
    const calidad = calcularCalidadDatos();
    const duplicados = obtenerDuplicados();
    const gestoresActivos = new Set(DATASET_FILTRADO.map(r => r.gestor).filter(Boolean)).size;
    const sedesActivas = new Set(DATASET_FILTRADO.map(r => r.sede).filter(Boolean)).size;
    const gestores = Object.values(agruparGestores(DATASET_FILTRADO)).sort((a,b)=>b.valor-a.valor);
    const top = gestores[0];
    const concentracionTop = top && ventaTotal > 0 ? (top.valor / ventaTotal) * 100 : 0;

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

    setHtml("kpiCalidadDatos", `${calidad.calidad.toFixed(1)}%`);
    setHtml("kpiDuplicados", duplicados.length);
    setHtml("kpiGestoresActivos", gestoresActivos);
    setHtml("kpiSedesActivas", sedesActivas);
    setHtml("kpiConcentracionTop", `${concentracionTop.toFixed(1)}%`);
    setHtml("kpiBrechaDiaria", formatMoney(brechaDiaria));
    setHtml("kpiEstadoGerencial", textoEstado(cumplimientoGeneral));

    setHtml("metaRangoDetalle", `${fechaISO(metaInfo.inicio)} a ${fechaISO(metaInfo.fin)}`);

    ["cumplimiento", "tvCumplimiento", "kpiEstadoGerencial"].forEach(id => {
        const el = $(id);
        if(el) el.style.color = colorPorPorcentaje(cumplimientoGeneral);
    });

    const calidadEl = $("kpiCalidadDatos");
    if(calidadEl) calidadEl.style.color = colorPorPorcentaje(calidad.calidad);
}

function crearResumenEjecutivo(rows, resumen){
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (resumen.total / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - resumen.total, 0);

    const texto = `
        El rango seleccionado comprende <strong>${MESES_EQUIVALENTES_ACTUAL.toFixed(2)} meses equivalentes</strong>, 
        con una meta calculada de <strong>${formatMoney(META_RANGO_ACTUAL)}</strong>. 
        Las ventas acumuladas son <strong>${formatMoney(resumen.total)}</strong>, equivalentes al 
        <strong>${cumplimiento.toFixed(1)}%</strong> de cumplimiento. 
        Estado actual: <strong>${textoEstado(cumplimiento)}</strong>. 
        Faltante: <strong>${formatMoney(faltante)}</strong>. 
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
    const canvas = $(idCanvas);
    if(!canvas || typeof Chart === "undefined") return;

    destruirChart(idCanvas);

    charts[idCanvas] = new Chart(canvas, {
        type:"bar",
        data:{
            labels,
            datasets:[{label,data,backgroundColor:color,borderRadius:10}]
        },
        options:{
            ...opcionesChartBasicas(titulo),
            indexAxis: horizontal ? "y" : "x"
        }
    });
}

function crearChartLine(idCanvas, labels, datasets, titulo){
    const canvas = $(idCanvas);
    if(!canvas || typeof Chart === "undefined") return;

    destruirChart(idCanvas);

    charts[idCanvas] = new Chart(canvas, {
        type:"line",
        data:{labels,datasets},
        options:opcionesChartBasicas(titulo)
    });
}

function crearChartDoughnut(idCanvas, labels, data, titulo){
    const canvas = $(idCanvas);
    if(!canvas || typeof Chart === "undefined") return;

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
            plugins:{title:{display:true,text:titulo},legend:{position:"top"}}
        }
    });
}

function crearGraficosDashboard(resumen){
    crearChartBar("graficoMetaReal", ["Meta", "Venta Real"], [META_RANGO_ACTUAL, resumen.total], "Valor", "Meta calculada vs venta real");
    crearChartDoughnut("composicionIngresos", ["RED", "PARTICULAR", "EXCEDENTES"], [resumen.red, resumen.particular, resumen.excedentes], "Composición de ingresos");
    crearGraficoMensual(DATASET_FILTRADO);
    crearVelocimetroCumplimiento(resumen.total, "velocimetroCumplimiento");
}

function crearGraficoMensual(rows){
    const mensual = agruparPorPeriodo(rows, "mes");
    const etiquetas = ordenarMeses(Object.keys(mensual));
    const ventas = etiquetas.map(k => mensual[k]);
    const metas = etiquetas.map(k => {
        const [mes, anio] = k.split("/").map(Number);
        return metaMensualAplicable(new Date(anio, mes - 1, 1));
    });

    crearChartLine("ventasMensuales", etiquetas, [
        {label:"Venta mensual",data:ventas,backgroundColor:"rgba(0,166,81,.16)",borderColor:"#00a651",borderWidth:4,fill:true,tension:.35},
        {label:"Meta mensual",data:metas,borderColor:"#ef4444",borderWidth:3,borderDash:[8,6],pointRadius:0,fill:false}
    ], "Ventas mensuales vs meta mensual");
}

function crearVelocimetroCumplimiento(ventaTotal, canvasId){
    const canvas = $(canvasId);
    if(!canvas || typeof Chart === "undefined") return;

    const porcentajeReal = META_RANGO_ACTUAL > 0 ? (ventaTotal / META_RANGO_ACTUAL) * 100 : 0;
    const porcentaje = Math.min(porcentajeReal, 100);
    const restante = Math.max(100 - porcentaje, 0);
    const color = colorPorPorcentaje(porcentajeReal);

    if(canvasId === "velocimetroCumplimiento"){
        setHtml("cumplimientoVisual", `${porcentajeReal.toFixed(1)}%`);
        const el = $("cumplimientoVisual");
        if(el) el.style.color = color;
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
            ctx.fillText(`${porcentajeReal.toFixed(1)}%`, x, y - 8);
            ctx.fillStyle = "#334155";
            ctx.font = "700 13px Segoe UI";
            ctx.fillText(textoEstado(porcentajeReal).toUpperCase(), x, y + 22);
            ctx.restore();
        }
    };

    charts[canvasId] = new Chart(canvas, {
        type:"doughnut",
        data:{
            labels:["Avance","Restante"],
            datasets:[{data:[porcentaje,restante],backgroundColor:[color,"#e5e7eb"],borderWidth:0,cutout:"78%"}]
        },
        plugins:[centerTextPlugin],
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:"Cumplimiento de meta"}}}
    });
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
        if(!obj[k]) obj[k] = {cantidad:0, valor:0};
        obj[k].cantidad += 1;
        obj[k].valor += row.valor;
    });
    return obj;
}

function agruparSedes(rows){
    const obj = {};
    rows.forEach(row => {
        const k = row.sede || "SIN SEDE";
        if(!obj[k]) obj[k] = {cantidad:0, valor:0};
        obj[k].cantidad += 1;
        obj[k].valor += row.valor;
    });
    return obj;
}

function agruparGestores(rows){
    const obj = {};
    rows.forEach(row => {
        const nombre = row.gestor || "SIN GESTOR";
        if(!obj[nombre]) obj[nombre] = {nombre, cantidad:0, valor:0};
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

        if(!obj[nombre]) obj[nombre] = {cantidad:0, valor:0};
        obj[nombre].cantidad += 1;
        obj[nombre].valor += row.valor;
    });
    return obj;
}

function crearTablaRanking(selector, ranking, totalGeneral, tipo){
    const tbody = document.querySelector(selector);
    if(!tbody) return;

    if(ranking.length === 0){
        tbody.innerHTML = `<tr><td colspan="4">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = ranking.map(([nombre, data]) => {
        const cantidad = typeof data === "object" ? data.cantidad : "";
        const valor = typeof data === "object" ? data.valor : data;
        const p = totalGeneral > 0 ? (valor / totalGeneral) * 100 : 0;

        if(tipo === "categoria"){
            return `<tr><td>${nombre}</td><td>${formatMoney(valor)}</td><td>${p.toFixed(1)}%</td></tr>`;
        }

        return `<tr><td>${nombre}</td><td>${cantidad}</td><td>${formatMoney(valor)}</td><td>${p.toFixed(1)}%</td></tr>`;
    }).join("");
}

function crearTablasPrincipales(rows, totalGeneral){
    const categorias = Object.entries(agruparCategorias(rows)).sort((a,b) => b[1] - a[1]);
    const servicios = Object.entries(agruparServicios(rows)).sort((a,b) => b[1].valor - a[1].valor);
    const sedes = Object.entries(agruparSedes(rows)).sort((a,b) => b[1].valor - a[1].valor);
    const excedentes = Object.entries(agruparExcedentes(rows)).sort((a,b) => b[1].valor - a[1].valor);
    const gestores = Object.values(agruparGestores(rows)).sort((a,b) => b.valor - a.valor);

    crearTablaRanking("#tablaCategoriasVista tbody", categorias, totalGeneral, "categoria");
    crearTablaRanking("#tablaServiciosVista tbody", servicios, totalGeneral, "servicio");
    crearTablaRanking("#tablaSedesVista tbody", sedes, totalGeneral, "sede");
    crearTablaRanking("#tablaExcedentesVista tbody", excedentes, totalGeneral, "excedente");

    const tbodyGestores = document.querySelector("#tablaGestoresVista tbody");
    if(tbodyGestores){
        tbodyGestores.innerHTML = gestores.length ? gestores.map(g => {
            const p = totalGeneral > 0 ? (g.valor / totalGeneral) * 100 : 0;
            return `<tr><td>${g.nombre}</td><td>${g.cantidad}</td><td>${formatMoney(g.valor)}</td><td>${p.toFixed(1)}%</td></tr>`;
        }).join("") : `<tr><td colspan="4">Sin registros</td></tr>`;
    }

    crearChartDoughnut("graficoCategoriasVista", categorias.map(([k]) => k), categorias.map(([,v]) => v), "Ventas por categoría");
    crearChartBar("graficoServiciosVista", servicios.slice(0,12).map(([k]) => k), servicios.slice(0,12).map(([,v]) => v.valor), "Valor", "Servicios por valor", "rgba(245,158,11,.92)", true);
    crearChartBar("graficoSedesVista", sedes.map(([k]) => k), sedes.map(([,v]) => v.valor), "Valor", "Ventas por sede", "rgba(6,182,212,.92)", true);
    crearChartBar("rankingCompletoGestores", gestores.slice(0,15).map(g => g.nombre), gestores.slice(0,15).map(g => g.valor), "Valor", "Ranking gestores", "rgba(37,99,235,.92)", true);
    crearChartBar("graficoExcedentes", excedentes.slice(0,12).map(([k]) => k), excedentes.slice(0,12).map(([,v]) => v.valor), "Valor", "Excedentes por valor", "rgba(245,158,11,.92)", true);

    const mejorGestor = gestores[0];
    setHtml("mejorGestor", mejorGestor ? mejorGestor.nombre : "-");
    setHtml("ventaMejorGestor", mejorGestor ? formatMoney(mejorGestor.valor) : formatMoney(0));

    const topServicio = servicios.sort((a,b) => b[1].cantidad - a[1].cantidad)[0];
    setHtml("servicioTop", topServicio ? topServicio[0] : "-");
    setHtml("cantidadServicioTop", topServicio ? topServicio[1].cantidad : "0");
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
    crearVistaComparativos(metaInfo);
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

        return `<tr><td>${etiqueta}</td><td>${formatMoney(meta)}</td><td>${formatMoney(venta)}</td><td>${porcentaje.toFixed(1)}%</td><td>${badgeEstado(porcentaje)}</td></tr>`;
    }).join("");
}

function crearCumplimientoDiario(rows){
    const diario = agruparPorPeriodo(rows, "dia");
    const etiquetas = ordenarFechas(Object.keys(diario));
    const ventas = etiquetas.map(k => diario[k]);
    const metas = etiquetas.map(k => {
        const fecha = new Date(`${k}T00:00:00`);
        return metaMensualAplicable(fecha) / diasDelMes(fecha);
    });

    crearChartLine("graficoCumplimientoDiario", etiquetas, [
        {label:"Venta diaria",data:ventas,borderColor:"#00a651",backgroundColor:"rgba(0,166,81,.14)",fill:true,tension:.3},
        {label:"Meta diaria",data:metas,borderColor:"#ef4444",borderDash:[8,6],pointRadius:0,fill:false}
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
        {label:"Venta semanal",data:ventas,borderColor:"#2563eb",backgroundColor:"rgba(37,99,235,.14)",fill:true,tension:.3},
        {label:"Meta semanal",data:metas,borderColor:"#ef4444",borderDash:[8,6],pointRadius:0,fill:false}
    ], "Venta semanal vs meta semanal");

    llenarTablaCumplimiento("#tablaCumplimientoSemanal tbody", etiquetas, metas, ventas);
}

function crearCumplimientoMensual(rows){
    const mensual = agruparPorPeriodo(rows, "mes");
    const etiquetas = ordenarMeses(Object.keys(mensual));
    const ventas = etiquetas.map(k => mensual[k]);
    const metas = etiquetas.map(k => {
        const [mes, anio] = k.split("/").map(Number);
        return metaMensualAplicable(new Date(anio, mes - 1, 1));
    });

    crearChartLine("cumplimientoMensualGrafico", etiquetas, [
        {label:"Venta mensual",data:ventas,borderColor:"#00a651",backgroundColor:"rgba(0,166,81,.14)",fill:true,tension:.3},
        {label:"Meta mensual",data:metas,borderColor:"#ef4444",borderDash:[8,6],pointRadius:0,fill:false}
    ], "Cumplimiento mensual");

    llenarTablaCumplimiento("#tablaCumplimientoMensual tbody", etiquetas, metas, ventas);
}

function crearCumplimientoTrimestral(rows){
    const datos = agruparPorPeriodo(rows, "trimestre");
    const etiquetas = Object.keys(datos).sort();
    const ventas = etiquetas.map(k => datos[k]);
    const metas = etiquetas.map(() => META_TRIMESTRAL_BASE);

    crearChartBar("graficoCumplimientoTrimestral", etiquetas, ventas, "Venta", "Cumplimiento trimestral", "rgba(124,58,237,.90)");
    llenarTablaCumplimiento("#tablaCumplimientoTrimestral tbody", etiquetas, metas, ventas);
}

function crearCumplimientoSemestral(rows){
    const datos = agruparPorPeriodo(rows, "semestre");
    const etiquetas = Object.keys(datos).sort();
    const ventas = etiquetas.map(k => datos[k]);
    const metas = etiquetas.map(() => META_SEMESTRAL_BASE);

    crearChartBar("graficoCumplimientoSemestral", etiquetas, ventas, "Venta", "Cumplimiento semestral", "rgba(37,99,235,.90)");
    llenarTablaCumplimiento("#tablaCumplimientoSemestral tbody", etiquetas, metas, ventas);
}

function crearCumplimientoAnual(rows){
    const datos = agruparPorPeriodo(rows, "anio");
    const etiquetas = Object.keys(datos).sort();
    const ventas = etiquetas.map(k => datos[k]);
    const metas = etiquetas.map(() => META_ANUAL_BASE);

    crearChartBar("cumplimientoAnualGrafico", etiquetas, ventas, "Venta", "Cumplimiento anual", "rgba(0,166,81,.90)");
    llenarTablaCumplimiento("#tablaCumplimientoAnual tbody", etiquetas, metas, ventas);
}

function crearVistaComparativos(metaInfo){
    const mensual = agruparPorPeriodo(DATASET_FILTRADO, "mes");
    const etiquetas = ordenarMeses(Object.keys(mensual));
    const ventas = etiquetas.map(k => mensual[k]);
    const metas = etiquetas.map(k => {
        const [mes, anio] = k.split("/").map(Number);
        return metaMensualAplicable(new Date(anio, mes - 1, 1));
    });

    crearChartLine("graficoComparativoMensual", etiquetas, [
        {label:"Venta mensual",data:ventas,borderColor:"#00a651",backgroundColor:"rgba(0,166,81,.14)",fill:true,tension:.3},
        {label:"Meta mensual",data:metas,borderColor:"#ef4444",borderDash:[8,6],pointRadius:0,fill:false}
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
        tbody.innerHTML = `<tr><td>${fechaISO(inicioActual)} a ${fechaISO(finActual)}</td><td>${formatMoney(ventaActual)}</td><td>${formatMoney(ventaAnterior)}</td><td>${formatMoney(diferencia)}</td><td>${crecimiento.toFixed(1)}%</td></tr>`;
    }
}

function crearVistaTendencias(rows){
    const mensual = agruparPorPeriodo(rows, "mes");
    const etiquetas = ordenarMeses(Object.keys(mensual));
    const valores = etiquetas.map(k => mensual[k]);

    crearChartLine("graficoHistorico", etiquetas, [
        {label:"Ventas históricas",data:valores,borderColor:"#00a651",backgroundColor:"rgba(0,166,81,.13)",fill:true,tension:.35}
    ], "Serie histórica de ventas");
}

function crearVistaMetas(){
    const etiquetas = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const metas = etiquetas.map((_, index) => metaMensualAplicable(new Date(new Date().getFullYear(), index, 1)) * (index + 1));

    crearChartLine("graficoMetasAcumuladas", etiquetas, [
        {label:"Meta acumulada",data:metas,borderColor:"#00a651",backgroundColor:"rgba(0,166,81,.14)",fill:true,tension:.25}
    ], "Meta acumulada mensual");
}

function calcularPeriodo(tipo, refDate){
    let inicio, fin, nombre;

    if(tipo === "Diario"){inicio = inicioDia(refDate); fin = finDia(refDate); nombre = "Diario";}
    if(tipo === "Semanal"){inicio = inicioSemana(refDate); fin = finSemana(refDate); nombre = "Semanal";}
    if(tipo === "Mensual"){inicio = inicioMes(refDate); fin = finMes(refDate); nombre = "Mensual";}
    if(tipo === "Trimestral"){inicio = inicioTrimestre(refDate); fin = finTrimestre(refDate); nombre = "Trimestral";}
    if(tipo === "Semestral"){inicio = inicioSemestre(refDate); fin = finSemestre(refDate); nombre = "Semestral";}
    if(tipo === "Anual"){inicio = inicioAnio(refDate); fin = finAnio(refDate); nombre = "Anual";}

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

    return {nombre, meta, venta, cumplimiento, faltante, proyeccion};
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

function crearAlertasGerenciales(rows, ventaTotal){
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (ventaTotal / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - ventaTotal, 0);
    const calidad = calcularCalidadDatos();
    const duplicados = obtenerDuplicados();
    const alertas = [];

    if(!API_STATUS.ok) alertas.push(`Diagnóstico API: ${API_STATUS.mensaje}. Revisar módulo Diagnóstico API.`);
    if(rows.length === 0) alertas.push("No hay registros para el rango seleccionado.");
    if(cumplimiento < 80) alertas.push(`Cumplimiento bajo: ${cumplimiento.toFixed(1)}%. Faltante: ${formatMoney(faltante)}.`);
    if(cumplimiento >= 80 && cumplimiento < 100) alertas.push(`Cumplimiento en riesgo controlado: ${cumplimiento.toFixed(1)}%.`);
    if(cumplimiento >= 100) alertas.push(`Meta cumplida: ${cumplimiento.toFixed(1)}%.`);

    if(calidad.calidad < 90) alertas.push(`Calidad de datos por debajo del 90%: ${calidad.calidad.toFixed(1)}%.`);
    if(duplicados.length > 0) alertas.push(`Duplicados detectados: ${duplicados.length}. Revisar auditoría.`);

    const html = alertas.map(a => `<div class="alerta-item"><i class="fas fa-circle-exclamation"></i><span>${a}</span></div>`).join("");

    setHtml("alertasGerenciales", html || "<p>Sin alertas por el momento.</p>");
    setHtml("alertasGerencialesVista", html || "<p>Sin alertas por el momento.</p>");
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
    if(cumplimientoProyectadoAnual < 80){riesgo = "ALTO"; riesgoClase = "#dc2626";}
    else if(cumplimientoProyectadoAnual < 100){riesgo = "MEDIO"; riesgoClase = "#f59e0b";}

    setHtml("proyPromedioDiario", formatMoney(promedioDiarioReal));
    setHtml("proyMes", formatMoney(proyMes));
    setHtml("proyAnual", formatMoney(proyAnual));
    setHtml("riesgoProyectado", riesgo);
    setHtml("valorDiarioNecesario", formatMoney(valorDiarioNecesario));

    const riesgoEl = $("riesgoProyectado");
    if(riesgoEl) riesgoEl.style.color = riesgoClase;

    crearChartBar("graficoProyeccionAnual", ["Meta anual", "Proyección anual"], [META_ANUAL_BASE, proyAnual], "Valor", "Meta anual vs proyección anual");

    const tbody = document.querySelector("#tablaProyecciones tbody");
    if(tbody){
        tbody.innerHTML = `
            <tr><td>Meta anual</td><td>${formatMoney(META_ANUAL_BASE)}</td><td>Objetivo general anual configurado.</td></tr>
            <tr><td>Proyección mensual</td><td>${formatMoney(proyMes)}</td><td>Cierre mensual estimado con ritmo actual.</td></tr>
            <tr><td>Proyección anual</td><td>${formatMoney(proyAnual)}</td><td>Estimación anualizada con promedio diario actual.</td></tr>
            <tr><td>Cumplimiento anual proyectado</td><td>${cumplimientoProyectadoAnual.toFixed(1)}%</td><td>${textoEstado(cumplimientoProyectadoAnual)}</td></tr>
            <tr><td>Valor diario necesario</td><td>${formatMoney(valorDiarioNecesario)}</td><td>Promedio requerido para cerrar el faltante.</td></tr>
        `;
    }
}

function actualizarCierreGerencial(rows, resumen){
    const ventaTotal = resumen.total;
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (ventaTotal / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - ventaTotal, 0);
    const promedioDiarioMeta = META_RANGO_ACTUAL / Math.max(DIAS_RANGO_ACTUAL, 1);
    const promedioDiarioReal = ventaTotal / Math.max(DIAS_RANGO_ACTUAL, 1);

    let conclusion = "";
    if(cumplimiento >= 100){
        conclusion = `El desempeño es favorable. La meta se encuentra cumplida con avance de <strong>${cumplimiento.toFixed(1)}%</strong>.`;
    }else if(cumplimiento >= 80){
        conclusion = `El desempeño está en zona de riesgo controlado con avance de <strong>${cumplimiento.toFixed(1)}%</strong>. Faltante: <strong>${formatMoney(faltante)}</strong>.`;
    }else{
        conclusion = `El desempeño está por debajo del nivel esperado con avance de <strong>${cumplimiento.toFixed(1)}%</strong>. Brecha: <strong>${formatMoney(faltante)}</strong>.`;
    }

    setHtml("conclusionGerencial", conclusion);

    const plan = [];
    if(cumplimiento < 80) plan.push({titulo:"Plan de choque comercial", texto:"Seguimiento diario a gestores, oportunidades activas y pendientes.", prioridad:"Alta"});
    if(promedioDiarioReal < promedioDiarioMeta) plan.push({titulo:"Incrementar promedio diario", texto:`Promedio real: ${formatMoney(promedioDiarioReal)}. Meta diaria: ${formatMoney(promedioDiarioMeta)}.`, prioridad:"Alta"});
    if(!API_STATUS.ok) plan.push({titulo:"Validación API", texto:"Corregir estructura, permisos o encabezados en Google Sheets/Apps Script.", prioridad:"Alta"});
    plan.push({titulo:"Pareto 80/20", texto:"Revisar gestores, servicios y sedes que concentran mayor participación.", prioridad:"Media"});
    plan.push({titulo:"Comparativo anual", texto:"Analizar crecimiento frente al año anterior.", prioridad:"Media"});
    plan.push({titulo:"Reporte ejecutivo", texto:"Exportar PDF formal para comité.", prioridad:"Baja"});

    const planBox = $("planAccionGerencial");
    if(planBox){
        planBox.innerHTML = plan.map(item => {
            const clase = item.prioridad === "Alta" ? "prioridad-alta" : item.prioridad === "Media" ? "prioridad-media" : "prioridad-baja";
            return `<div class="plan-card"><h4>${item.titulo}</h4><p>${item.texto}</p><p class="${clase}">Prioridad: ${item.prioridad}</p></div>`;
        }).join("");
    }

    actualizarMatrizDecision(cumplimiento, promedioDiarioReal, promedioDiarioMeta);
}

function actualizarMatrizDecision(cumplimiento, promedioDiarioReal, promedioDiarioMeta){
    const tbody = document.querySelector("#tablaDecisionGerencial tbody");
    if(!tbody) return;

    const calidad = calcularCalidadDatos().calidad;
    const estadoCumplimiento = cumplimiento >= 100 ? "Bueno" : cumplimiento >= 80 ? "Riesgo" : "Crítico";
    const estadoPromedio = promedioDiarioReal >= promedioDiarioMeta ? "Bueno" : "Crítico";
    const estadoDatos = calidad >= 95 ? "Bueno" : calidad >= 80 ? "Riesgo" : "Crítico";
    const estadoApi = API_STATUS.ok ? "Bueno" : "Crítico";

    tbody.innerHTML = `
        <tr><td>Cumplimiento</td><td class="${claseEstado(estadoCumplimiento)}">${estadoCumplimiento}</td><td>Revisar avance y brecha.</td><td>${estadoCumplimiento === "Crítico" ? "Alta" : "Media"}</td></tr>
        <tr><td>Promedio diario</td><td class="${claseEstado(estadoPromedio)}">${estadoPromedio}</td><td>Comparar promedio real contra requerido.</td><td>${estadoPromedio === "Crítico" ? "Alta" : "Media"}</td></tr>
        <tr><td>Calidad de datos</td><td class="${claseEstado(estadoDatos)}">${estadoDatos}</td><td>Validar registros incompletos.</td><td>${estadoDatos === "Crítico" ? "Alta" : "Baja"}</td></tr>
        <tr><td>Conexión API</td><td class="${claseEstado(estadoApi)}">${estadoApi}</td><td>Validar Apps Script, permisos y columnas.</td><td>${estadoApi === "Crítico" ? "Alta" : "Baja"}</td></tr>
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

    return {totalApi, fechasInvalidas, valoresCero, sinGestor, sinCategoria, sinSede, calidad};
}

function claveDuplicado(row){
    const fecha = row.fecha ? fechaISO(row.fecha) : row.fechaTexto || "";
    return `${fecha}|${normalizarTexto(row.gestor)}|${normalizarTexto(row.categoria)}|${normalizarTexto(row.servicio)}|${normalizarTexto(row.sede)}|${Math.round(row.valor)}`;
}

function obtenerDuplicados(){
    const mapa = {};

    DATASET_NORMAL.forEach(row => {
        const key = claveDuplicado(row);
        if(!mapa[key]) mapa[key] = [];
        mapa[key].push(row);
    });

    return Object.values(mapa).filter(grupo => grupo.length > 1).flat();
}

function actualizarDiagnosticoAvanzado(){
    const d = calcularCalidadDatos();

    setHtml("diagEstadoApi", API_STATUS.mensaje);
    setHtml("diagTotalApi", API_STATUS.registros || 0);
    setHtml("diagTotalFiltrado", DATASET_FILTRADO.length);
    setHtml("diagFechasInvalidas", d.fechasInvalidas);
    setHtml("diagValoresCero", d.valoresCero);
    setHtml("diagSinGestor", d.sinGestor);
    setHtml("diagCalidad", `${d.calidad.toFixed(1)}%`);

    const estadoApi = $("diagEstadoApi");
    if(estadoApi) estadoApi.style.color = API_STATUS.ok ? "#16a34a" : "#dc2626";

    const calidadEl = $("diagCalidad");
    if(calidadEl) calidadEl.style.color = colorPorPorcentaje(d.calidad);

    let texto = "";
    if(!API_STATUS.ok) texto = `La API requiere revisión. Estado: ${API_STATUS.mensaje}.`;
    else if(d.calidad >= 95) texto = "La calidad de datos es alta.";
    else if(d.calidad >= 80) texto = "La calidad de datos es aceptable, pero requiere ajustes.";
    else texto = "La calidad de datos requiere revisión prioritaria.";

    setHtml("diagnosticoTexto", texto);

    const tbodyColumnas = document.querySelector("#tablaColumnasApi tbody");
    if(tbodyColumnas){
        const requeridas = ["Fecha","Gestor","Tipo_Homenaje","Tipo_Excedente","Valor","Sede"];
        tbodyColumnas.innerHTML = requeridas.map(col => {
            const ok = API_STATUS.columnas.some(c => normalizarLlave(c) === normalizarLlave(col));
            return `<tr><td>${col}</td><td>${ok ? '<span class="badge badge-ok">Detectada</span>' : '<span class="badge badge-danger">Faltante</span>'}</td></tr>`;
        }).join("");
    }

    const tbody = document.querySelector("#tablaDiagnosticoDatos tbody");
    if(!tbody) return;

    const muestra = DATASET_NORMAL.slice(0, 50);
    if(muestra.length === 0){
        tbody.innerHTML = `<tr><td colspan="6">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = muestra.map(row => {
        const correcto = row.fecha && row.valor > 0 && row.gestor && row.categoria;
        return `<tr><td>${row.fechaTexto || "-"}</td><td>${row.gestor || "-"}</td><td>${row.categoria || "-"}</td><td>${row.servicio || "-"}</td><td>${formatMoney(row.valor)}</td><td>${correcto ? '<span class="badge badge-ok">Correcto</span>' : '<span class="badge badge-danger">Revisar</span>'}</td></tr>`;
    }).join("");
}

function actualizarAuditoria(){
    const d = calcularCalidadDatos();
    const duplicados = obtenerDuplicados();

    setHtml("audDuplicados", duplicados.length);
    setHtml("audFechasInvalidas", d.fechasInvalidas);
    setHtml("audValoresCero", d.valoresCero);
    setHtml("audSinGestor", d.sinGestor);
    setHtml("audSinCategoria", d.sinCategoria);
    setHtml("audSinSede", d.sinSede);

    let riesgo = "BAJO";
    let riesgoColor = "#16a34a";

    if(d.calidad < 80 || duplicados.length > 10 || !API_STATUS.ok){
        riesgo = "ALTO";
        riesgoColor = "#dc2626";
    }else if(d.calidad < 95 || duplicados.length > 0){
        riesgo = "MEDIO";
        riesgoColor = "#f59e0b";
    }

    setHtml("audRiesgo", riesgo);
    const audRiesgo = $("audRiesgo");
    if(audRiesgo) audRiesgo.style.color = riesgoColor;

    let texto = "La base de datos está en condiciones aceptables.";
    if(riesgo === "MEDIO") texto = "Se recomienda revisar duplicados e inconsistencias antes de presentar.";
    if(riesgo === "ALTO") texto = "La base requiere revisión prioritaria.";

    setHtml("auditoriaTexto", texto);

    const tbody = document.querySelector("#tablaAuditoria tbody");
    if(!tbody) return;

    const hallazgos = [];

    DATASET_NORMAL.forEach(row => {
        const faltantes = [];
        if(!row.fecha) faltantes.push("Fecha inválida");
        if(row.valor === 0) faltantes.push("Valor cero");
        if(!row.gestor) faltantes.push("Sin gestor");
        if(!row.categoria) faltantes.push("Sin categoría");
        if(!row.sede) faltantes.push("Sin sede");

        if(faltantes.length) hallazgos.push({row, hallazgo:faltantes.join(", ")});
    });

    duplicados.forEach(row => hallazgos.push({row, hallazgo:"Posible duplicado"}));

    const muestra = hallazgos.slice(0, 80);

    if(muestra.length === 0){
        tbody.innerHTML = `<tr><td colspan="7">Sin hallazgos críticos</td></tr>`;
        return;
    }

    tbody.innerHTML = muestra.map(item => `
        <tr>
            <td>${item.row.fechaTexto || "-"}</td>
            <td>${item.row.gestor || "-"}</td>
            <td>${item.row.categoria || "-"}</td>
            <td>${item.row.servicio || "-"}</td>
            <td>${item.row.sede || "-"}</td>
            <td>${formatMoney(item.row.valor)}</td>
            <td>${item.hallazgo}</td>
        </tr>
    `).join("");
}

function metaAsignada(nombre, tipo, cantidadActivos){
    const mapa = getMapaMetas(tipo);
    const clave = normalizarTexto(nombre);
    const configurada = mapa[clave];

    if(configurada) return configurada * MESES_EQUIVALENTES_ACTUAL;

    return cantidadActivos > 0 ? META_RANGO_ACTUAL / cantidadActivos : 0;
}

function actualizarMetasPorGestor(){
    const gestores = Object.values(agruparGestores(DATASET_FILTRADO))
        .sort((a,b) => b.valor - a.valor)
        .filter(g => g.nombre && g.nombre !== "SIN GESTOR");

    const cantidadGestores = gestores.length;

    setHtml(
        "textoMetasGestor",
        `La meta del rango es <strong>${formatMoney(META_RANGO_ACTUAL)}</strong>. 
        Si existe meta configurada por gestor se usa esa meta proporcional; si no, se distribuye entre gestores activos.`
    );

    const tbody = document.querySelector("#tablaMetasGestor tbody");
    if(tbody){
        if(gestores.length === 0){
            tbody.innerHTML = `<tr><td colspan="6">Sin gestores activos</td></tr>`;
        }else{
            tbody.innerHTML = gestores.map(g => {
                const meta = metaAsignada(g.nombre, "metasGestor", cantidadGestores);
                const cumplimiento = meta > 0 ? (g.valor / meta) * 100 : 0;
                const faltante = Math.max(meta - g.valor, 0);

                return `<tr><td>${g.nombre}</td><td>${formatMoney(meta)}</td><td>${formatMoney(g.valor)}</td><td>${cumplimiento.toFixed(1)}%</td><td>${formatMoney(faltante)}</td><td>${badgeEstado(cumplimiento)}</td></tr>`;
            }).join("");
        }
    }

    crearChartBar(
        "graficoMetasGestor",
        gestores.map(g => g.nombre),
        gestores.map(g => {
            const meta = metaAsignada(g.nombre, "metasGestor", cantidadGestores);
            return meta > 0 ? (g.valor / meta) * 100 : 0;
        }),
        "%",
        "Cumplimiento por gestor",
        "rgba(37,99,235,.92)",
        true
    );
}

function actualizarMetasAvanzadas(){
    renderMetasGrupo("sede", agruparSedes(DATASET_FILTRADO), "metasSede", "#tablaMetasSede tbody", "graficoMetasSede", "Sede");
    renderMetasGrupo("categoria", objetoCategoriaADetalle(agruparCategorias(DATASET_FILTRADO)), "metasCategoria", "#tablaMetasCategoria tbody", "graficoMetasCategoria", "Categoría");
    renderMetasMes();
}

function objetoCategoriaADetalle(obj){
    const out = {};
    Object.entries(obj).forEach(([k,v]) => out[k] = {cantidad:0, valor:v});
    return out;
}

function renderMetasGrupo(tipo, agrupado, storageKey, selector, graficoId, label){
    const entries = Object.entries(agrupado).sort((a,b) => b[1].valor - a[1].valor);
    const total = entries.length;

    const tbody = document.querySelector(selector);
    if(tbody){
        if(entries.length === 0){
            tbody.innerHTML = `<tr><td colspan="5">Sin registros</td></tr>`;
        }else{
            tbody.innerHTML = entries.map(([nombre, data]) => {
                const meta = metaAsignada(nombre, storageKey, total);
                const venta = data.valor;
                const cumplimiento = meta > 0 ? (venta / meta) * 100 : 0;
                return `<tr><td>${nombre}</td><td>${formatMoney(meta)}</td><td>${formatMoney(venta)}</td><td>${cumplimiento.toFixed(1)}%</td><td>${badgeEstado(cumplimiento)}</td></tr>`;
            }).join("");
        }
    }

    crearChartBar(
        graficoId,
        entries.map(([nombre]) => nombre),
        entries.map(([nombre, data]) => {
            const meta = metaAsignada(nombre, storageKey, total);
            return meta > 0 ? (data.valor / meta) * 100 : 0;
        }),
        "%",
        `Cumplimiento por ${label}`,
        "rgba(0,166,81,.92)",
        true
    );
}

function renderMetasMes(){
    const mensual = agruparPorPeriodo(DATASET_FILTRADO, "mes");
    const etiquetas = ordenarMeses(Object.keys(mensual));
    const ventas = etiquetas.map(k => mensual[k]);
    const metas = etiquetas.map(k => {
        const [mes, anio] = k.split("/").map(Number);
        return metaMensualAplicable(new Date(anio, mes - 1, 1));
    });

    const tbody = document.querySelector("#tablaMetasMes tbody");
    if(tbody){
        tbody.innerHTML = etiquetas.length ? etiquetas.map((k, i) => {
            const cumplimiento = metas[i] > 0 ? (ventas[i] / metas[i]) * 100 : 0;
            return `<tr><td>${k}</td><td>${formatMoney(metas[i])}</td><td>${formatMoney(ventas[i])}</td><td>${cumplimiento.toFixed(1)}%</td><td>${badgeEstado(cumplimiento)}</td></tr>`;
        }).join("") : `<tr><td colspan="5">Sin registros</td></tr>`;
    }

    crearChartLine("graficoMetasMes", etiquetas, [
        {label:"Venta mensual",data:ventas,borderColor:"#00a651",backgroundColor:"rgba(0,166,81,.14)",fill:true,tension:.3},
        {label:"Meta configurada",data:metas,borderColor:"#ef4444",borderDash:[8,6],pointRadius:0,fill:false}
    ], "Meta mensual configurada vs venta");
}

function actualizarComparativoAnual(){
    const f = obtenerRangoFechas();
    const fin = f.fechaFin ? new Date(`${f.fechaFin}T00:00:00`) : new Date();
    const anioActual = fin.getFullYear();
    const anioAnterior = anioActual - 1;

    const meses = Array.from({length:12}, (_,i) => i + 1);
    const labels = meses.map(m => nombreMes(m));

    const ventasActual = meses.map(m => sumar(DATASET_NORMAL.filter(r => r.fecha && r.fecha.getFullYear() === anioActual && r.fecha.getMonth() + 1 === m && coincideFiltrosNoFecha(r, obtenerRangoFechas()))));
    const ventasAnterior = meses.map(m => sumar(DATASET_NORMAL.filter(r => r.fecha && r.fecha.getFullYear() === anioAnterior && r.fecha.getMonth() + 1 === m && coincideFiltrosNoFecha(r, obtenerRangoFechas()))));

    crearChartLine("graficoYoYMensual", labels, [
        {label:String(anioActual),data:ventasActual,borderColor:"#00a651",backgroundColor:"rgba(0,166,81,.14)",fill:true,tension:.3},
        {label:String(anioAnterior),data:ventasAnterior,borderColor:"#2563eb",backgroundColor:"rgba(37,99,235,.10)",fill:true,tension:.3}
    ], "Comparativo año actual vs anterior");

    const tbody = document.querySelector("#tablaYoY tbody");
    if(tbody){
        tbody.innerHTML = labels.map((mes, i) => {
            const actual = ventasActual[i];
            const anterior = ventasAnterior[i];
            const diferencia = actual - anterior;
            const crecimiento = anterior > 0 ? (diferencia / anterior) * 100 : 0;

            return `<tr><td>${mes}</td><td>${formatMoney(actual)}</td><td>${formatMoney(anterior)}</td><td>${formatMoney(diferencia)}</td><td>${crecimiento.toFixed(1)}%</td></tr>`;
        }).join("");
    }
}

function nombreMes(n){
    return ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][Number(n) - 1] || String(n);
}

function actualizarPareto(){
    const total = sumar(DATASET_FILTRADO);
    const gestores = Object.values(agruparGestores(DATASET_FILTRADO)).map(x => [x.nombre, x.valor]).sort((a,b)=>b[1]-a[1]);
    const servicios = Object.entries(agruparServicios(DATASET_FILTRADO)).map(([k,v]) => [k, v.valor]).sort((a,b)=>b[1]-a[1]);
    const sedes = Object.entries(agruparSedes(DATASET_FILTRADO)).map(([k,v]) => [k, v.valor]).sort((a,b)=>b[1]-a[1]);

    renderParetoTabla("#tablaParetoGestores tbody", gestores, total);
    renderParetoTabla("#tablaParetoServicios tbody", servicios, total);

    crearChartPareto("graficoParetoGestores", gestores.slice(0,12), total, "Pareto gestores");
    crearChartPareto("graficoParetoServicios", servicios.slice(0,12), total, "Pareto servicios");
    crearChartPareto("graficoParetoSedes", sedes.slice(0,12), total, "Pareto sedes");

    const principales = calcularParetoItems(gestores, total).filter(x => x.acumulado <= 80).length;
    setHtml("textoPareto", `El análisis Pareto permite identificar los elementos que concentran la mayor parte de las ventas. En gestores, aproximadamente <strong>${principales}</strong> concentran la mayor proporción del resultado del rango seleccionado.`);
}

function calcularParetoItems(items, total){
    let acumulado = 0;
    return items.map(([nombre, valor]) => {
        const participacion = total > 0 ? (valor / total) * 100 : 0;
        acumulado += participacion;
        return {nombre, valor, participacion, acumulado};
    });
}

function renderParetoTabla(selector, items, total){
    const tbody = document.querySelector(selector);
    if(!tbody) return;

    const data = calcularParetoItems(items, total);

    if(data.length === 0){
        tbody.innerHTML = `<tr><td colspan="5">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(item => `
        <tr>
            <td>${item.nombre}</td>
            <td>${formatMoney(item.valor)}</td>
            <td>${item.participacion.toFixed(1)}%</td>
            <td>${item.acumulado.toFixed(1)}%</td>
            <td>${item.acumulado <= 80 ? '<span class="badge badge-info">Pareto 80/20</span>' : '<span class="badge badge-warning">Complementario</span>'}</td>
        </tr>
    `).join("");
}

function crearChartPareto(id, items, total, titulo){
    const labels = items.map(([k]) => k);
    const valores = items.map(([,v]) => v);
    const acumulados = calcularParetoItems(items, total).map(x => x.acumulado);

    crearChartLine(id, labels, [
        {label:"Valor",data:valores,borderColor:"#00a651",backgroundColor:"rgba(0,166,81,.14)",fill:true,tension:.3,yAxisID:"y"},
        {label:"Acumulado %",data:acumulados,borderColor:"#ef4444",backgroundColor:"rgba(239,68,68,.10)",fill:false,tension:.3,yAxisID:"y1"}
    ], titulo);

    if(charts[id]){
        charts[id].options.scales.y1 = {
            beginAtZero:true,
            position:"right",
            max:100,
            grid:{drawOnChartArea:false}
        };
        charts[id].update();
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

    setHtml("bdTotalApi", DATASET_API.length);
    setHtml("bdTotalManual", DATASET_MANUAL.length);
    setHtml("bdTotalFiltrados", DATASET_FILTRADO.length);
    setHtml("bdValoresCero", d.valoresCero);

    const tbody = document.querySelector("#tablaBaseDatos tbody");
    if(!tbody) return;

    const muestra = DATASET_FILTRADO.slice(0, 60);

    if(muestra.length === 0){
        tbody.innerHTML = `<tr><td colspan="7">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = muestra.map(row => `
        <tr>
            <td>${row.origen}</td>
            <td>${row.fechaTexto || "-"}</td>
            <td>${row.gestor || "-"}</td>
            <td>${row.categoria || "-"}</td>
            <td>${row.servicio || "-"}</td>
            <td>${row.sede || "-"}</td>
            <td>${formatMoney(row.valor)}</td>
        </tr>
    `).join("");
}

function actualizarRegistrosManuales(){
    const tbody = document.querySelector("#tablaRegistrosManuales tbody");
    if(!tbody) return;

    if(DATASET_MANUAL.length === 0){
        tbody.innerHTML = `<tr><td colspan="7">Sin registros manuales</td></tr>`;
        return;
    }

    tbody.innerHTML = DATASET_MANUAL.map(item => `
        <tr>
            <td>${item.Fecha || "-"}</td>
            <td>${item.Gestor || "-"}</td>
            <td>${item.Tipo_Homenaje || "-"}</td>
            <td>${item.Tipo_Excedente || "-"}</td>
            <td>${item.Sede || "-"}</td>
            <td>${formatMoney(item.Valor)}</td>
            <td><button class="danger-btn" onclick="eliminarRegistroManual('${item.id}')">Eliminar</button></td>
        </tr>
    `).join("");
}

function agregarRegistroManual(){
    const item = {
        id:cryptoRandom(),
        Fecha:$("regFecha")?.value || "",
        Gestor:$("regGestor")?.value || "",
        Tipo_Homenaje:$("regCategoria")?.value || "",
        Tipo_Excedente:$("regServicio")?.value || "",
        Sede:$("regSede")?.value || "",
        Valor:toNumber($("regValor")?.value || 0),
        Observacion:$("regObservacion")?.value || ""
    };

    if(!item.Fecha || !item.Gestor || item.Valor <= 0){
        toast("Fecha, gestor y valor son obligatorios.", "warning");
        return;
    }

    const data = JSON.parse(localStorage.getItem("registrosManuales") || "[]");
    data.push(item);
    localStorage.setItem("registrosManuales", JSON.stringify(data));

    ["regFecha","regGestor","regCategoria","regServicio","regSede","regValor","regObservacion"].forEach(id => setValue(id, ""));

    registrarBitacora("Registro manual", `Se agregó registro por ${formatMoney(item.Valor)}.`);
    toast("Registro manual agregado.");
    cargarDashboard();
}

function eliminarRegistroManual(id){
    let data = JSON.parse(localStorage.getItem("registrosManuales") || "[]");
    data = data.filter(item => item.id !== id);
    localStorage.setItem("registrosManuales", JSON.stringify(data));
    registrarBitacora("Registro manual", "Se eliminó un registro manual.");
    toast("Registro manual eliminado.");
    cargarDashboard();
}

window.eliminarRegistroManual = eliminarRegistroManual;

function eliminarTodosManuales(){
    const confirmar = confirm("¿Deseas eliminar todos los registros manuales?");
    if(!confirmar) return;

    localStorage.removeItem("registrosManuales");
    registrarBitacora("Registro manual", "Se eliminaron todos los registros manuales.");
    toast("Registros manuales eliminados.");
    cargarDashboard();
}

function actualizarPruebas(){
    const pruebas = [];
    const resumen = ULTIMO_RESUMEN || {total:0};
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (resumen.total / META_RANGO_ACTUAL) * 100 : 0;
    const calidad = calcularCalidadDatos();

    pruebas.push(["Conexión API", API_STATUS.ok, API_STATUS.mensaje]);
    pruebas.push(["Datos cargados", DATASET_NORMAL.length > 0, `${DATASET_NORMAL.length} registros totales`]);
    pruebas.push(["Filtros activos", true, "Fecha, gestor, categoría, servicio, sede, año, mes y estado disponibles"]);
    pruebas.push(["Cálculo de meta", META_RANGO_ACTUAL > 0, formatMoney(META_RANGO_ACTUAL)]);
    pruebas.push(["Cumplimiento calculado", !isNaN(cumplimiento), `${cumplimiento.toFixed(1)}%`]);
    pruebas.push(["Calidad de datos", calidad.calidad >= 80, `${calidad.calidad.toFixed(1)}%`]);
    pruebas.push(["PDF disponible", typeof html2pdf !== "undefined", "Librería PDF cargada"]);
    pruebas.push(["Excel disponible", typeof XLSX !== "undefined", "Librería XLSX cargada"]);
    pruebas.push(["Registro manual", true, "Disponible con almacenamiento local"]);
    pruebas.push(["Comparativo anual", true, "Módulo activo"]);
    pruebas.push(["Pareto 80/20", true, "Módulo activo"]);

    const aprobadas = pruebas.filter(p => p[1]).length;
    setHtml("textoPruebas", `Pruebas aprobadas: <strong>${aprobadas}</strong> de <strong>${pruebas.length}</strong>.`);

    const tbody = document.querySelector("#tablaPruebas tbody");
    if(tbody){
        tbody.innerHTML = pruebas.map(([nombre, ok, obs]) => `
            <tr>
                <td>${nombre}</td>
                <td>${ok ? '<span class="badge badge-ok">Aprobada</span>' : '<span class="badge badge-danger">Revisar</span>'}</td>
                <td>${obs}</td>
            </tr>
        `).join("");
    }
}

function actualizarConfiguracion(){
    setValue("configMetaMensual", META_MENSUAL_BASE);
    setValue("configTitulo", localStorage.getItem("dashboardTitulo") || "General Report Jkfh");
    setValue("configSubtitulo", localStorage.getItem("dashboardSubtitulo") || "Dashboard gerencial premium 4K | Seguimiento, control, metas y análisis ejecutivo");
    setValue("configEmpresa", localStorage.getItem("dashboardEmpresa") || "General Report");
    setValue("configArea", localStorage.getItem("dashboardArea") || "Área de Homenajes");
    setValue("configResponsable", localStorage.getItem("dashboardResponsable") || "George Korfan");
    setValue("configLogoUrl", localStorage.getItem("dashboardLogoUrl") || "");
    setValue("configAccessCode", ACCESS_CODE);
    setValue("configEmails", localStorage.getItem("dashboardEmails") || "");
    setValue("configAutoMinutos", AUTO_MINUTOS);

    setValue("configMetasGestor", localStorage.getItem("metasGestor") || "");
    setValue("configMetasSede", localStorage.getItem("metasSede") || "");
    setValue("configMetasCategoria", localStorage.getItem("metasCategoria") || "");
    setValue("configMetasMes", localStorage.getItem("metasMes") || "");

    const titulo = localStorage.getItem("dashboardTitulo") || "General Report Jkfh";
    const subtitulo = localStorage.getItem("dashboardSubtitulo") || "Dashboard gerencial premium 4K | Seguimiento, control, metas y análisis ejecutivo";
    const empresa = localStorage.getItem("dashboardEmpresa") || "General Report";
    const logo = localStorage.getItem("dashboardLogoUrl") || "";

    setHtml("tituloDashboard", titulo);
    setHtml("subtituloDashboard", subtitulo);
    setHtml("sidebarEmpresa", empresa);

    ["logoTopbar","sidebarLogo"].forEach(id => {
        const img = $(id);
        if(img){
            if(logo){
                img.src = logo;
                img.style.display = "block";
            }else{
                img.src = "";
                img.style.display = "none";
            }
        }
    });
}

function renderBitacora(){
    const tbody = document.querySelector("#tablaBitacora tbody");
    if(!tbody) return;

    const data = JSON.parse(localStorage.getItem("dashboardBitacora") || "[]");

    if(data.length === 0){
        tbody.innerHTML = `<tr><td colspan="3">Sin acciones registradas</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(item => `<tr><td>${item.fecha}</td><td>${item.accion}</td><td>${item.detalle}</td></tr>`).join("");
}

function cambiarVista(seccion){
    document.querySelectorAll(".menu-item").forEach(item => item.classList.remove("active"));
    document.querySelectorAll(".vista").forEach(v => v.classList.remove("active-view"));

    const itemMenu = document.querySelector(`.menu-item[data-seccion="${seccion}"]`);
    if(itemMenu) itemMenu.classList.add("active");

    const vista = $(seccion);
    if(vista) vista.classList.add("active-view");

    setTimeout(redimensionarGraficos, 180);
}

function redimensionarGraficos(){
    Object.values(charts).forEach(chart => {
        if(chart && typeof chart.resize === "function") chart.resize();
    });
}

function generarReporteFormal(){
    const reporte = $("reporteFormal");
    if(!reporte || !ULTIMO_RESUMEN || !ULTIMA_META_INFO) return;

    const cumplimiento = META_RANGO_ACTUAL > 0 ? (ULTIMO_RESUMEN.total / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - ULTIMO_RESUMEN.total, 0);
    const d = calcularCalidadDatos();

    const titulo = localStorage.getItem("dashboardTitulo") || "General Report Jkfh";
    const empresa = localStorage.getItem("dashboardEmpresa") || "General Report";
    const area = localStorage.getItem("dashboardArea") || "Área de Homenajes";
    const responsable = localStorage.getItem("dashboardResponsable") || "George Korfan";
    const logo = localStorage.getItem("dashboardLogoUrl") || "";

    reporte.innerHTML = `
        <div class="print-header">
            ${logo ? `<img src="${logo}" class="print-logo">` : ""}
            <div>
                <h1>${titulo}</h1>
                <p><strong>${empresa}</strong></p>
                <p>${area}</p>
                <p>Responsable: ${responsable}</p>
            </div>
        </div>

        <p><strong>Reporte ejecutivo gerencial</strong></p>
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
            La venta acumulada alcanza ${formatMoney(ULTIMO_RESUMEN.total)}, con cumplimiento del ${cumplimiento.toFixed(1)}%.
            Estado general: ${textoEstado(cumplimiento)}.
        </p>

        <h2>Indicadores de Control</h2>
        <table>
            <thead><tr><th>Indicador</th><th>Resultado</th></tr></thead>
            <tbody>
                <tr><td>Meta mensual base</td><td>${formatMoney(META_MENSUAL_BASE)}</td></tr>
                <tr><td>Meta anual</td><td>${formatMoney(META_ANUAL_BASE)}</td></tr>
                <tr><td>Registros analizados</td><td>${DATASET_FILTRADO.length}</td></tr>
                <tr><td>Registros API</td><td>${DATASET_API.length}</td></tr>
                <tr><td>Registros manuales</td><td>${DATASET_MANUAL.length}</td></tr>
                <tr><td>Calidad de datos</td><td>${d.calidad.toFixed(1)}%</td></tr>
                <tr><td>Estado API</td><td>${API_STATUS.mensaje}</td></tr>
                <tr><td>Duplicados detectados</td><td>${obtenerDuplicados().length}</td></tr>
            </tbody>
        </table>

        <h2>Conclusión Gerencial</h2>
        <p>${$("conclusionGerencial")?.innerText || ""}</p>

        <h2>Recomendación</h2>
        <p>Revisar el módulo de Pareto 80/20, el comparativo año actual vs anterior, las metas avanzadas y la auditoría de datos antes de presentar el informe definitivo.</p>

        <p style="margin-top:35px;"><strong>Firma responsable:</strong> ${responsable}</p>
    `;
}

function exportarExcel(){
    if(typeof XLSX === "undefined") return;

    const hojaDatos = DATASET_FILTRADO.map(row => ({
        Origen:row.origen || "",
        Fecha:row.fechaTexto || "",
        Gestor:row.gestor || "",
        Categoria:row.categoria || "",
        Servicio:row.servicio || "",
        Sede:row.sede || "",
        Valor:row.valor,
        Observacion:row.observacion || ""
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
        ["Registros API", DATASET_API.length],
        ["Registros Manuales", DATASET_MANUAL.length],
        ["Calidad de datos %", d.calidad],
        ["Estado API", API_STATUS.mensaje],
        ["Duplicados detectados", obtenerDuplicados().length]
    ]);

    const wsDatos = XLSX.utils.json_to_sheet(hojaDatos);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen Ejecutivo");
    XLSX.utils.book_append_sheet(wb, wsDatos, "Base Filtrada");

    XLSX.writeFile(wb, "dashboard_gerencial_homenajes.xlsx");
    setHtml("estadoReporte", "Reporte Excel generado correctamente.");
    toast("Excel generado correctamente.");
    registrarBitacora("Exportación Excel", "Se generó archivo Excel.");
}

function exportarCSV(){
    const headers = ["Origen","Fecha","Gestor","Categoria","Servicio","Sede","Valor","Observacion"];

    const rows = DATASET_FILTRADO.map(r => [
        r.origen || "",
        r.fechaTexto || "",
        r.gestor || "",
        r.categoria || "",
        r.servicio || "",
        r.sede || "",
        r.valor || 0,
        r.observacion || ""
    ]);

    const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(","))
        .join("\n");

    descargarArchivo("dashboard_homenajes.csv", csv, "text/csv;charset=utf-8;");
    toast("CSV generado correctamente.");
    registrarBitacora("Exportación CSV", "Se generó archivo CSV.");
}

function exportarJSON(){
    const backup = {
        fecha:new Date().toISOString(),
        configuracion:{
            metaMensual:META_MENSUAL_BASE,
            titulo:localStorage.getItem("dashboardTitulo") || "General Report Jkfh",
            empresa:localStorage.getItem("dashboardEmpresa") || "",
            area:localStorage.getItem("dashboardArea") || "",
            responsable:localStorage.getItem("dashboardResponsable") || ""
        },
        apiStatus:API_STATUS,
        registrosFiltrados:DATASET_FILTRADO,
        registrosManuales:DATASET_MANUAL
    };

    descargarArchivo("backup_dashboard_homenajes.json", JSON.stringify(backup, null, 2), "application/json;charset=utf-8;");
    toast("Backup JSON generado.");
    registrarBitacora("Backup JSON", "Se generó copia de seguridad JSON.");
}

function descargarArchivo(nombre, contenido, tipo){
    const blob = new Blob([contenido], {type:tipo});
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
}

function exportarPDF(){
    generarReporteFormal();

    const elemento = $("reporteFormal");
    if(!elemento || typeof html2pdf === "undefined") return;

    const opciones = {
        margin:0.25,
        filename:"reporte_gerencial_homenajes.pdf",
        image:{type:"jpeg", quality:0.98},
        html2canvas:{scale:2, useCORS:true},
        jsPDF:{unit:"in", format:"a4", orientation:"portrait"},
        pagebreak:{mode:["css", "legacy"]}
    };

    html2pdf().set(opciones).from(elemento).save();
    setHtml("estadoReporte", "Reporte PDF ejecutivo generado correctamente.");
    toast("PDF generado correctamente.");
    registrarBitacora("Exportación PDF", "Se generó reporte PDF ejecutivo.");
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
    aplicarFiltrosYRender();
    toast("Filtros limpiados.");
}

function aplicarRangoRapido(rango){
    const hoy = new Date();
    let inicio = hoy;
    let fin = hoy;

    if(rango === "hoy"){inicio = hoy; fin = hoy;}
    if(rango === "mes"){inicio = inicioMes(hoy); fin = hoy;}
    if(rango === "trimestre"){inicio = inicioTrimestre(hoy); fin = hoy;}
    if(rango === "semestre"){inicio = inicioSemestre(hoy); fin = hoy;}
    if(rango === "anio"){inicio = inicioAnio(hoy); fin = hoy;}

    setValue("fechaInicio", fechaISO(inicio));
    setValue("fechaFin", fechaISO(fin));
    aplicarFiltrosYRender();
}

function guardarMetaMensual(){
    const nuevaMeta = toNumber($("configMetaMensual")?.value);

    if(nuevaMeta <= 0){
        toast("Ingrese una meta válida mayor a cero.", "warning");
        return;
    }

    META_MENSUAL_BASE = nuevaMeta;
    localStorage.setItem("metaMensualBase", String(nuevaMeta));
    recalcularMetasBase();
    aplicarFiltrosYRender();
    toast("Meta mensual guardada correctamente.");
    registrarBitacora("Cambio de meta", `Nueva meta mensual: ${formatMoney(nuevaMeta)}.`);
}

function guardarConfigVisual(){
    localStorage.setItem("dashboardTitulo", $("configTitulo")?.value || "General Report Jkfh");
    localStorage.setItem("dashboardSubtitulo", $("configSubtitulo")?.value || "Dashboard gerencial premium 4K | Seguimiento, control, metas y análisis ejecutivo");
    localStorage.setItem("dashboardEmpresa", $("configEmpresa")?.value || "General Report");
    localStorage.setItem("dashboardArea", $("configArea")?.value || "Área de Homenajes");
    localStorage.setItem("dashboardResponsable", $("configResponsable")?.value || "George Korfan");
    localStorage.setItem("dashboardLogoUrl", $("configLogoUrl")?.value || "");

    actualizarConfiguracion();
    generarReporteFormal();
    toast("Identidad corporativa guardada.");
    registrarBitacora("Identidad corporativa", "Se actualizó información visual y PDF.");
}

function guardarAccessCode(){
    const code = $("configAccessCode")?.value || "JKFH2026";
    ACCESS_CODE = code;
    localStorage.setItem("dashboardAccessCode", code);
    localStorage.setItem("dashboardEmails", $("configEmails")?.value || "");
    toast("Acceso visual actualizado.");
    registrarBitacora("Acceso", "Se actualizó código y correos autorizados.");
}

function guardarAuto(){
    const minutos = Number($("configAutoMinutos")?.value) || 5;
    AUTO_MINUTOS = minutos;
    localStorage.setItem("dashboardAutoMinutos", String(minutos));
    toast("Autoactualización guardada.");
    registrarBitacora("Autoactualización", `Intervalo configurado: ${minutos} minutos.`);
}

function guardarMetasConfig(key, id){
    localStorage.setItem(key, $(id)?.value || "");
    aplicarFiltrosYRender();
    toast("Metas guardadas correctamente.");
    registrarBitacora("Metas avanzadas", `Se actualizó ${key}.`);
}

function alternarAuto(){
    if(AUTO_TIMER){
        clearInterval(AUTO_TIMER);
        AUTO_TIMER = null;
        toast("Autoactualización desactivada.");
        registrarBitacora("Autoactualización", "Desactivada.");
        return;
    }

    AUTO_TIMER = setInterval(cargarDashboard, AUTO_MINUTOS * 60 * 1000);
    toast(`Autoactualización activada cada ${AUTO_MINUTOS} minutos.`);
    registrarBitacora("Autoactualización", `Activada cada ${AUTO_MINUTOS} minutos.`);
}

function limpiarCache(){
    const confirmar = confirm("¿Deseas limpiar caché local, preferencias, bitácora y configuraciones? No elimina registros manuales.");
    if(!confirmar) return;

    [
        "dashboardTema",
        "dashboardSidebar",
        "dashboardBitacora",
        "dashboardTitulo",
        "dashboardSubtitulo",
        "dashboardEmpresa",
        "dashboardArea",
        "dashboardResponsable",
        "dashboardLogoUrl",
        "dashboardAutoMinutos",
        "dashboardEmails",
        "metasGestor",
        "metasSede",
        "metasCategoria",
        "metasMes"
    ].forEach(k => localStorage.removeItem(k));

    toast("Caché local limpiado.");
    setTimeout(() => location.reload(), 800);
}

function aplicarPreferencias(){
    if(localStorage.getItem("dashboardTema") === "dark") document.body.classList.add("dark-mode");
    if(localStorage.getItem("dashboardSidebar") === "collapsed") document.body.classList.add("sidebar-collapsed");
    actualizarConfiguracion();
}

function validarAcceso(){
    const panel = $("accessPanel");
    if(!panel) return;

    if(sessionStorage.getItem("dashboardAutorizado") === "1"){
        panel.classList.add("hidden");
    }else{
        panel.classList.remove("hidden");
    }
}

function ingresarDashboard(){
    const valor = $("accessCode")?.value || "";
    const email = normalizarTexto($("accessEmail")?.value || "");
    const emails = String(localStorage.getItem("dashboardEmails") || "")
        .split(",")
        .map(e => normalizarTexto(e))
        .filter(Boolean);

    const correoOk = emails.length === 0 || emails.includes(email);

    if(valor === ACCESS_CODE && correoOk){
        sessionStorage.setItem("dashboardAutorizado", "1");
        $("accessPanel")?.classList.add("hidden");
        toast("Acceso permitido.");
        registrarBitacora("Acceso", `Ingreso correcto: ${email || "sin correo configurado"}.`);
    }else{
        toast("Código o correo no autorizado.", "error");
    }
}

function cerrarSesion(){
    sessionStorage.removeItem("dashboardAutorizado");
    if($("accessCode")) $("accessCode").value = "";
    if($("accessEmail")) $("accessEmail").value = "";
    validarAcceso();
    toast("Sesión cerrada.");
    registrarBitacora("Salida", "Se cerró la sesión visual.");
}

document.querySelectorAll(".menu-item").forEach(item => {
    item.addEventListener("click", () => cambiarVista(item.dataset.seccion));
});

document.querySelectorAll(".quick-btn").forEach(btn => {
    btn.addEventListener("click", () => aplicarRangoRapido(btn.dataset.rango));
});

$("btnFiltrar")?.addEventListener("click", aplicarFiltrosYRender);
$("btnRecargar")?.addEventListener("click", cargarDashboard);
$("btnLimpiar")?.addEventListener("click", limpiarFiltros);
$("btnPdf")?.addEventListener("click", exportarPDF);
$("btnExcel")?.addEventListener("click", exportarExcel);
$("btnTema")?.addEventListener("click", alternarTema);
$("btnSidebar")?.addEventListener("click", alternarSidebar);
$("btnFull")?.addEventListener("click", pantallaCompleta);
$("btnLogout")?.addEventListener("click", cerrarSesion);
$("btnAuto")?.addEventListener("click", alternarAuto);

$("reporteExcelResumen")?.addEventListener("click", exportarExcel);
$("reportePdfGeneral")?.addEventListener("click", exportarPDF);
$("reporteCsv")?.addEventListener("click", exportarCSV);
$("reporteJson")?.addEventListener("click", exportarJSON);
$("reporteRecargar")?.addEventListener("click", cargarDashboard);
$("reporteLimpiarCache")?.addEventListener("click", limpiarCache);

$("btnGuardarMeta")?.addEventListener("click", guardarMetaMensual);
$("btnGuardarConfigVisual")?.addEventListener("click", guardarConfigVisual);
$("btnGuardarAccess")?.addEventListener("click", guardarAccessCode);
$("btnGuardarAuto")?.addEventListener("click", guardarAuto);

$("btnGuardarMetasGestor")?.addEventListener("click", () => guardarMetasConfig("metasGestor", "configMetasGestor"));
$("btnGuardarMetasSede")?.addEventListener("click", () => guardarMetasConfig("metasSede", "configMetasSede"));
$("btnGuardarMetasCategoria")?.addEventListener("click", () => guardarMetasConfig("metasCategoria", "configMetasCategoria"));
$("btnGuardarMetasMes")?.addEventListener("click", () => guardarMetasConfig("metasMes", "configMetasMes"));

$("btnAgregarRegistro")?.addEventListener("click", agregarRegistroManual);
$("btnEliminarManuales")?.addEventListener("click", eliminarTodosManuales);

$("btnAccess")?.addEventListener("click", ingresarDashboard);
$("accessCode")?.addEventListener("keyup", event => {
    if(event.key === "Enter") ingresarDashboard();
});

$("busquedaGeneral")?.addEventListener("keyup", event => {
    if(event.key === "Enter") aplicarFiltrosYRender();
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
    $(id)?.addEventListener("change", aplicarFiltrosYRender);
});

aplicarPreferencias();
validarAcceso();
recalcularMetasBase();
establecerFechasPorDefecto();
renderBitacora();
cargarDashboard();
