console.log("APP.JS CARGADO CORRECTAMENTE - VERSION 20260618");

const API_URL = "https://script.google.com/macros/s/AKfycbxEyu57a5spnJNju9t4654U8SDBrWFWQ0GWLibubGy5ntZsOV3N-TeL73423-a23j6FwA/exec";

let ACCESS_CODE = localStorage.getItem("dashboardAccessCode") || "JKFH2026";
let META_MENSUAL_BASE = Number(localStorage.getItem("metaMensualBase")) || 219133881;

let META_RANGO_ACTUAL = 0;
let MESES_EQUIVALENTES_ACTUAL = 0;
let DIAS_RANGO_ACTUAL = 0;

let DATASET_API = [];
let DATASET_MANUAL = [];
let DATASET_NORMAL = [];
let DATASET_FILTRADO = [];

let PARAMETROS = {
    gestor:{},
    categoria:{},
    excedente:{}
};

let API_STATUS = {
    ok:false,
    mensaje:"Sin validar",
    registros:0,
    columnas:[]
};

let charts = {};
let ULTIMO_RESUMEN = null;
let ULTIMA_META_INFO = null;
let AGENDA_CURSOR = new Date();

const $ = id => document.getElementById(id);

function setHtml(id, value){
    const el = $(id);
    if(el) el.innerHTML = value;
}

function setValue(id, value){
    const el = $(id);
    if(el) el.value = value;
}

function escapeHtml(value){
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function toast(message, type="ok"){
    const contenedor = $("toastContainer");
    if(!contenedor) return;

    const div = document.createElement("div");
    div.className = `toast ${type}`;
    div.textContent = message;
    contenedor.appendChild(div);

    setTimeout(() => div.remove(), 3800);
}

function showLoading(show){
    $("loadingOverlay")?.classList.toggle("show", show);
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

function formatNumber(valor, decimales=0){
    return Number(toNumber(valor)).toLocaleString("es-CO", {
        minimumFractionDigits:decimales,
        maximumFractionDigits:decimales
    });
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
    return getCampo(item, ["Fecha","FECHA","fecha","Fecha_Homenaje","Fecha Homenaje","Fecha Servicio","FECHA SERVICIO"]);
}

function getValorItem(item){
    return getCampo(item, ["Valor","VALOR","valor","Valor_Homenaje","Valor Homenaje","Total","TOTAL","Venta","VENTA","Valor Total"]);
}

function getGestorItem(item){
    return getCampo(item, ["Gestor","GESTOR","gestor","Asesor","ASESOR","Vendedor","VENDEDOR","Responsable"]);
}

function getCategoriaItem(item){
    return getCampo(item, ["Tipo_Homenaje","TIPO_HOMENAJE","Tipo Homenaje","Categoria","Categoría","CATEGORIA","Tipo Servicio","Tipo"]);
}

function getServicioItem(item){
    return getCampo(item, ["Tipo_Excedente","TIPO_EXCEDENTE","Tipo Excedente","Servicio","SERVICIO","Excedente","EXCEDENTE","Producto"]);
}

function getSedeItem(item){
    return getCampo(item, ["Sede","SEDE","Ciudad","Sucursal","Zona"]);
}

function getObservacionItem(item){
    return getCampo(item, ["Observacion","Observación","OBSERVACION","Nota","Detalle"]);
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

function obtenerDatosDesdeApi(json){
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

    const fecha = new Date(texto);
    return isNaN(fecha.getTime()) ? null : fecha;
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

function inicioTrimestre(fecha){
    const mes = Math.floor(fecha.getMonth() / 3) * 3;
    return new Date(fecha.getFullYear(), mes, 1);
}

function inicioSemestre(fecha){
    return new Date(fecha.getFullYear(), fecha.getMonth() < 6 ? 0 : 6, 1);
}

function inicioAnio(fecha){
    return new Date(fecha.getFullYear(), 0, 1);
}

function diasDelMes(fecha){
    return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
}

function diasEntre(fechaInicio, fechaFin){
    const inicio = inicioDia(fechaInicio);
    const fin = inicioDia(fechaFin);
    return Math.max(Math.floor((fin - inicio) / 86400000) + 1, 1);
}

function nombreMes(numero){
    return ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][Number(numero) - 1] || String(numero);
}

function mesKey(fecha){
    return `${String(fecha.getMonth() + 1).padStart(2,"0")}/${fecha.getFullYear()}`;
}

function ordenarMeses(keys){
    return keys.sort((a,b) => {
        const [ma, ya] = a.split("/").map(Number);
        const [mb, yb] = b.split("/").map(Number);
        return ya - yb || ma - mb;
    });
}

function cryptoRandom(){
    return "id_" + Date.now() + "_" + Math.random().toString(16).slice(2);
}

function esFilaParametro(item){
    const tipo = normalizarTexto(getCampo(item, ["Tipo","TIPO","tipo"]));
    const nombre = getCampo(item, ["Nombre","NOMBRE","nombre"]);
    const valor = getCampo(item, ["Valor","VALOR","valor"]);

    return (
        ["GESTOR","META_CATEGORIA","META_EXCEDENTE"].includes(tipo) &&
        String(nombre || "").trim() !== "" &&
        String(valor || "").trim() !== ""
    );
}

function procesarParametros(datos){
    PARAMETROS = {
        gestor:{},
        categoria:{},
        excedente:{}
    };

    datos.filter(esFilaParametro).forEach(item => {
        const tipo = normalizarTexto(getCampo(item, ["Tipo","TIPO","tipo"]));
        const nombre = normalizarTexto(getCampo(item, ["Nombre","NOMBRE","nombre"]));
        const valor = toNumber(getCampo(item, ["Valor","VALOR","valor"]));

        if(!nombre || valor <= 0) return;

        if(tipo === "GESTOR") PARAMETROS.gestor[nombre] = valor;
        if(tipo === "META_CATEGORIA") PARAMETROS.categoria[nombre] = valor;
        if(tipo === "META_EXCEDENTE") PARAMETROS.excedente[nombre] = valor;
    });

    procesarParametrosManuales();

    const totalCategoria =
        (PARAMETROS.categoria["PARTICULAR"] || 0) +
        (PARAMETROS.categoria["RED"] || 0) +
        (PARAMETROS.categoria["EXCEDENTES"] || 0);

    if(totalCategoria > 0){
        META_MENSUAL_BASE = totalCategoria;
    }
}

function procesarParametrosManuales(){
    const texto = localStorage.getItem("parametrosManual") || "";

    texto.split(/\n/).forEach(linea => {
        const clean = linea.trim();
        if(!clean) return;

        const partes = clean.split("|").map(x => x.trim());
        if(partes.length < 3) return;

        const tipo = normalizarTexto(partes[0]);
        const nombre = normalizarTexto(partes[1]);
        const valor = toNumber(partes[2]);

        if(!nombre || valor <= 0) return;

        if(tipo === "GESTOR") PARAMETROS.gestor[nombre] = valor;
        if(tipo === "META_CATEGORIA") PARAMETROS.categoria[nombre] = valor;
        if(tipo === "META_EXCEDENTE") PARAMETROS.excedente[nombre] = valor;
    });
}

function metaCategoriaMensual(categoria){
    const cat = normalizarTexto(categoria);
    return PARAMETROS.categoria[cat] || 0;
}

function metaExcedenteMensual(nombre){
    const key = normalizarTexto(nombre);
    return PARAMETROS.excedente[key] || 0;
}

function metaGestorMensual(nombre){
    const key = normalizarTexto(nombre);
    return PARAMETROS.gestor[key] || 0;
}

function metaMensualTotal(){
    const total =
        (PARAMETROS.categoria["PARTICULAR"] || 0) +
        (PARAMETROS.categoria["RED"] || 0) +
        (PARAMETROS.categoria["EXCEDENTES"] || 0);

    return total || META_MENSUAL_BASE;
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

        meta += metaMensualTotal() * factorMes;
        mesesEquivalentes += factorMes;

        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    return {
        inicio,
        fin,
        meta,
        mesesEquivalentes,
        diasRango:diasEntre(inicio, fin)
    };
}

function esServicioExcedente(servicio){
    const s = normalizarTexto(servicio);

    if(!s) return false;

    const noExcedentes = [
        "SOAT",
        "PENSIONADO",
        "PLAN",
        "NO APLICA",
        "N/A",
        "NA",
        "-",
        "SIN SERVICIO",
        "SIN EXCEDENTE"
    ];

    if(noExcedentes.includes(s)) return false;

    if(PARAMETROS.excedente[s]) return true;

    return true;
}

function obtenerCategoriaGerencial(row){
    const categoria = normalizarTexto(row.categoria);
    const servicio = normalizarTexto(row.servicio);

    if(categoria.includes("PLAN")) return "PLAN";
    if(categoria.includes("PARTICULAR")) return "PARTICULAR";
    if(categoria.includes("RED")) return "RED";
    if(categoria.includes("EXCEDENTE")) return "EXCEDENTES";

    if(PARAMETROS.excedente[servicio]) return "EXCEDENTES";
    if(esServicioExcedente(servicio)) return "EXCEDENTES";

    return categoria || "SIN CATEGORÍA";
}

function categoriaGeneraVenta(categoria){
    return ["PARTICULAR","RED","EXCEDENTES"].includes(normalizarTexto(categoria));
}

function normalizarRegistro(item, origen="API"){
    const fecha = parseFecha(getFechaItem(item));
    const valorOriginal = toNumber(getValorItem(item));

    const row = {
        id:item.id || cryptoRandom(),
        origen,
        raw:item,
        fecha,
        fechaTexto:getFechaItem(item),
        valorOriginal,
        gestor:String(getGestorItem(item) || "").trim(),
        categoria:String(getCategoriaItem(item) || "").trim(),
        servicio:String(getServicioItem(item) || "").trim(),
        sede:String(getSedeItem(item) || "").trim(),
        observacion:String(getObservacionItem(item) || "").trim()
    };

    row.categoriaGerencial = obtenerCategoriaGerencial(row);
    row.generaVenta = categoriaGeneraVenta(row.categoriaGerencial);
    row.valorVenta = row.generaVenta ? valorOriginal : 0;
    row.cantidadAtendida = 1;

    return row;
}

function cargarManuales(){
    DATASET_MANUAL = JSON.parse(localStorage.getItem("registrosManuales") || "[]");
    return DATASET_MANUAL.map(item => normalizarRegistro(item, "MANUAL"));
}

function validarEstructuraApi(datos){
    const columnas = datos.length ? Object.keys(datos[0]) : [];
    const requeridas = ["Fecha","Gestor","Tipo_Homenaje","Tipo_Excedente","Valor","Sede"];
    const faltantes = requeridas.filter(req => !columnas.some(c => normalizarLlave(c) === normalizarLlave(req)));

    return {
        ok:datos.length > 0 && faltantes.length === 0,
        mensaje:datos.length === 0 ? "Sin registros API" : faltantes.length ? "Columnas incompletas" : "API válida",
        registros:datos.length,
        columnas,
        faltantes
    };
}

async function cargarDashboard(){
    setEstadoApi("cargando", "Cargando...");
    showLoading(true);

    try{
        const response = await fetch(API_URL, { cache:"no-store" });
        if(!response.ok) throw new Error(`Error HTTP ${response.status}`);

        const json = await response.json();
        const datosCompletos = obtenerDatosDesdeApi(json);

        procesarParametros(datosCompletos);

        const datosVentas = datosCompletos.filter(item => !esFilaParametro(item));
        DATASET_API = datosVentas;

        const normalApi = datosVentas.map(item => normalizarRegistro(item, "API"));
        const normalManual = cargarManuales();

        DATASET_NORMAL = [...normalApi, ...normalManual];
        API_STATUS = validarEstructuraApi(datosVentas);

        poblarFiltros();
        aplicarFiltrosYRender();

        setEstadoApi("ok", "Conectado");
        toast("Dashboard actualizado correctamente.");

    }catch(error){
        console.error("Error al cargar API:", error);

        procesarParametros([]);
        const normalManual = cargarManuales();

        DATASET_API = [];
        DATASET_NORMAL = [...normalManual];

        API_STATUS = {
            ok:false,
            mensaje:"Error API",
            registros:0,
            columnas:[]
        };

        poblarFiltros();
        aplicarFiltrosYRender();

        setEstadoApi("error", "Error API");
        toast("No fue posible cargar la API. Se muestran registros manuales si existen.", "error");
    }finally{
        showLoading(false);
    }
}

function setEstadoApi(tipo, texto){
    const estado = $("estadoApi");
    if(!estado) return;

    estado.className = `estado-api ${tipo}`;
    estado.innerHTML = `<i class="fas fa-circle"></i> ${texto}`;
}

function establecerFechasPorDefecto(){
    if(!$("fechaInicio") || !$("fechaFin")) return;

    if(!$("fechaInicio").value && !$("fechaFin").value){
        const hoy = new Date();
        $("fechaInicio").value = fechaISO(inicioAnio(hoy));
        $("fechaFin").value = fechaISO(hoy);
    }
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

function obtenerFiltros(){
    return {
        fechaInicio:$("fechaInicio")?.value || "",
        fechaFin:$("fechaFin")?.value || "",
        gestor:$("filtroGestor")?.value || "",
        categoria:$("filtroCategoria")?.value || "",
        servicio:$("filtroServicio")?.value || "",
        sede:$("filtroSede")?.value || "",
        anio:$("filtroAnio")?.value || "",
        mes:$("filtroMes")?.value || "",
        busqueda:normalizarTexto($("busquedaGeneral")?.value || "")
    };
}

function coincideFiltrosNoFecha(row, f){
    if(f.gestor && row.gestor !== f.gestor) return false;
    if(f.categoria && row.categoriaGerencial !== f.categoria) return false;
    if(f.servicio && row.servicio !== f.servicio) return false;
    if(f.sede && row.sede !== f.sede) return false;

    if(f.busqueda){
        const texto = normalizarTexto(`${row.gestor} ${row.categoriaGerencial} ${row.categoria} ${row.servicio} ${row.sede} ${row.observacion}`);
        if(!texto.includes(f.busqueda)) return false;
    }

    return true;
}

function filtrarDataset(){
    const f = obtenerFiltros();

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

function aplicarFiltrosYRender(){
    DATASET_FILTRADO = filtrarDataset();

    const f = obtenerFiltros();
    const metaInfo = calcularMetaPorRango(f.fechaInicio, f.fechaFin);
    const resumen = calcularResumen(DATASET_FILTRADO);

    META_RANGO_ACTUAL = metaInfo.meta;
    MESES_EQUIVALENTES_ACTUAL = metaInfo.mesesEquivalentes;
    DIAS_RANGO_ACTUAL = metaInfo.diasRango;

    ULTIMO_RESUMEN = resumen;
    ULTIMA_META_INFO = metaInfo;

    renderTodo(resumen, metaInfo);
}

function sumar(rows){
    return rows.reduce((acc, row) => acc + toNumber(row.valorVenta), 0);
}

function calcularResumen(rows){
    const categorias = agruparCategorias(rows);

    const particular = categorias["PARTICULAR"] || {cantidad:0, valor:0};
    const red = categorias["RED"] || {cantidad:0, valor:0};
    const excedentes = categorias["EXCEDENTES"] || {cantidad:0, valor:0};
    const plan = categorias["PLAN"] || {cantidad:0, valor:0};

    return {
        particular:particular.valor,
        red:red.valor,
        excedentes:excedentes.valor,
        planCantidad:plan.cantidad,
        total:particular.valor + red.valor + excedentes.valor
    };
}

function agruparCategorias(rows){
    const obj = {
        PARTICULAR:{categoria:"PARTICULAR", cantidad:0, valor:0, generaVenta:true},
        RED:{categoria:"RED", cantidad:0, valor:0, generaVenta:true},
        EXCEDENTES:{categoria:"EXCEDENTES", cantidad:0, valor:0, generaVenta:true},
        PLAN:{categoria:"PLAN", cantidad:0, valor:0, generaVenta:false}
    };

    rows.forEach(row => {
        const cat = row.categoriaGerencial || "SIN CATEGORÍA";

        if(!obj[cat]){
            obj[cat] = {
                categoria:cat,
                cantidad:0,
                valor:0,
                generaVenta:categoriaGeneraVenta(cat)
            };
        }

        obj[cat].cantidad += 1;
        obj[cat].valor += categoriaGeneraVenta(cat) ? toNumber(row.valorVenta) : 0;
    });

    return obj;
}

function agruparGestores(rows){
    const obj = {};

    rows.forEach(row => {
        const nombre = row.gestor || "SIN GESTOR";

        if(!obj[nombre]){
            obj[nombre] = {nombre, cantidad:0, valor:0};
        }

        obj[nombre].cantidad += 1;
        obj[nombre].valor += toNumber(row.valorVenta);
    });

    return obj;
}

function agruparSedes(rows){
    const obj = {};

    rows.forEach(row => {
        const nombre = row.sede || "SIN SEDE";

        if(!obj[nombre]){
            obj[nombre] = {nombre, cantidad:0, valor:0};
        }

        obj[nombre].cantidad += 1;
        obj[nombre].valor += toNumber(row.valorVenta);
    });

    return obj;
}

function agruparExcedentes(rows){
    const obj = {};

    Object.keys(PARAMETROS.excedente || {}).forEach(nombre => {
        obj[nombre] = {nombre, cantidad:0, valor:0};
    });

    rows.forEach(row => {
        if(row.categoriaGerencial !== "EXCEDENTES") return;

        const nombre = normalizarTexto(row.servicio) || "EXCEDENTES";

        if(!obj[nombre]){
            obj[nombre] = {nombre, cantidad:0, valor:0};
        }

        obj[nombre].cantidad += 1;
        obj[nombre].valor += toNumber(row.valorVenta);
    });

    return obj;
}

function agruparMensual(rows){
    const obj = {};

    rows.forEach(row => {
        if(!row.fecha) return;

        const key = mesKey(row.fecha);

        if(!obj[key]){
            obj[key] = {venta:0, cantidad:0};
        }

        obj[key].venta += toNumber(row.valorVenta);
        obj[key].cantidad += 1;
    });

    return obj;
}

function renderTodo(resumen, metaInfo){
    actualizarKPIs(resumen, metaInfo);
    crearResumenEjecutivo(resumen, metaInfo);
    renderGraficosDashboard(resumen);
    renderCategorias();
    renderGestores();
    renderExcedentes();
    renderMetas();
    renderCumplimientoMensual();
    renderComparativoAnual();
    renderPareto();
    renderDatos();
    renderAlertas(resumen);
    renderEnergia();
    renderVacaciones();
    renderAgenda();
    renderTiempoAfiliado();
    renderRegistrosManuales();
    renderReporteFormal();
    actualizarConfiguracion();
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

    const categorias = agruparCategorias(DATASET_FILTRADO);
    const particular = categorias["PARTICULAR"];
    const red = categorias["RED"];
    const excedentes = categorias["EXCEDENTES"];
    const plan = categorias["PLAN"];

    const pParticular = ventaTotal > 0 ? (particular.valor / ventaTotal) * 100 : 0;
    const pRed = ventaTotal > 0 ? (red.valor / ventaTotal) * 100 : 0;
    const pExcedentes = ventaTotal > 0 ? (excedentes.valor / ventaTotal) * 100 : 0;

    const gestores = Object.values(agruparGestores(DATASET_FILTRADO)).sort((a,b) => b.valor - a.valor);
    const mejorGestor = gestores[0];

    setHtml("metaGrupal", formatMoney(META_RANGO_ACTUAL));
    setHtml("ventas", formatMoney(ventaTotal));
    setHtml("cumplimiento", `${cumplimientoGeneral.toFixed(1)}%`);
    setHtml("faltante", formatMoney(faltante));
    setHtml("proyeccion", formatMoney(proyeccion));
    setHtml("estadoCumplimientoTexto", textoEstado(cumplimientoGeneral));

    setHtml("metaMensual", formatMoney(metaMensualTotal()));
    setHtml("metaAnual", formatMoney(metaMensualTotal() * 12));
    setHtml("mesesEquivalentes", MESES_EQUIVALENTES_ACTUAL.toFixed(2));
    setHtml("promedioDiarioReal", formatMoney(promedioDiarioReal));
    setHtml("mejorGestor", mejorGestor ? mejorGestor.nombre : "-");
    setHtml("totalRegistros", DATASET_FILTRADO.length);
    setHtml("kpiCalidadDatos", calcularCalidadDatos().calidad.toFixed(1) + "%");

    setHtml("kpiParticularValor", formatMoney(particular.valor));
    setHtml("kpiParticularCantidad", `${particular.cantidad} homenajes atendidos | ${pParticular.toFixed(1)}%`);

    setHtml("kpiRedValor", formatMoney(red.valor));
    setHtml("kpiRedCantidad", `${red.cantidad} homenajes atendidos | ${pRed.toFixed(1)}%`);

    setHtml("kpiExcedentesValor", formatMoney(excedentes.valor));
    setHtml("kpiExcedentesCantidad", `${excedentes.cantidad} unidades | ${pExcedentes.toFixed(1)}%`);

    setHtml("kpiPlanCantidad", plan.cantidad);
    setHtml("metaRangoDetalle", `${fechaISO(metaInfo.inicio)} a ${fechaISO(metaInfo.fin)}`);
    setHtml("ultimaActualizacion", new Date().toLocaleString("es-CO"));

    const cumplimientoEl = $("cumplimiento");
    if(cumplimientoEl) cumplimientoEl.style.color = colorPorPorcentaje(cumplimientoGeneral);
}

function crearResumenEjecutivo(resumen, metaInfo){
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (resumen.total / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - resumen.total, 0);

    setHtml("resumenEjecutivoTexto", `
        El rango seleccionado comprende <strong>${MESES_EQUIVALENTES_ACTUAL.toFixed(2)} meses equivalentes</strong>.
        La meta calculada es <strong>${formatMoney(META_RANGO_ACTUAL)}</strong>.
        La venta real generada por <strong>PARTICULAR + RED + EXCEDENTES</strong> es
        <strong>${formatMoney(resumen.total)}</strong>, con cumplimiento del
        <strong>${cumplimiento.toFixed(1)}%</strong>. 
        El faltante para cumplir la meta es <strong>${formatMoney(faltante)}</strong>.
        PLAN registra <strong>${resumen.planCantidad}</strong> atenciones, pero no suma ventas.
    `);
}

function destruirChart(id){
    if(charts[id]){
        charts[id].destroy();
        charts[id] = null;
    }
}

function crearChartBar(idCanvas, labels, data, label, titulo, horizontal=false){
    const canvas = $(idCanvas);
    if(!canvas || typeof Chart === "undefined") return;

    destruirChart(idCanvas);

    charts[idCanvas] = new Chart(canvas, {
        type:"bar",
        data:{
            labels,
            datasets:[{
                label,
                data,
                backgroundColor:"rgba(0,166,81,.90)",
                borderRadius:10
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            indexAxis:horizontal ? "y" : "x",
            plugins:{
                title:{display:true,text:titulo},
                legend:{display:true,position:"top"}
            },
            scales:{
                y:{beginAtZero:true},
                x:{grid:{display:false}}
            }
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
        options:{
            responsive:true,
            maintainAspectRatio:false,
            plugins:{
                title:{display:true,text:titulo},
                legend:{display:true,position:"top"}
            },
            scales:{
                y:{beginAtZero:true},
                x:{grid:{display:false}}
            }
        }
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
                    "rgba(37,99,235,.95)",
                    "rgba(0,166,81,.95)",
                    "rgba(245,158,11,.95)",
                    "rgba(100,116,139,.95)"
                ],
                borderColor:"#ffffff",
                borderWidth:2
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            plugins:{
                title:{display:true,text:titulo},
                legend:{display:true,position:"top"}
            }
        }
    });
}

function renderGraficosDashboard(resumen){
    crearChartBar(
        "graficoMetaReal",
        ["Meta", "Venta Real"],
        [META_RANGO_ACTUAL, resumen.total],
        "Valor",
        "Meta vs Venta Real"
    );

    crearChartDoughnut(
        "graficoCategoriasDashboard",
        ["PARTICULAR", "RED", "EXCEDENTES"],
        [resumen.particular, resumen.red, resumen.excedentes],
        "Participación por categoría"
    );

    const mensual = agruparMensual(DATASET_FILTRADO);
    const labels = ordenarMeses(Object.keys(mensual));
    const ventas = labels.map(k => mensual[k].venta);
    const metas = labels.map(() => metaMensualTotal());

    crearChartLine("graficoMensual", labels, [
        {label:"Venta mensual", data:ventas, borderColor:"#00a651", backgroundColor:"rgba(0,166,81,.12)", fill:true, tension:.3},
        {label:"Meta mensual", data:metas, borderColor:"#ef4444", borderDash:[8,6], fill:false, pointRadius:0}
    ], "Ventas mensuales vs meta mensual");

    const tbody = document.querySelector("#tablaConsolidada tbody");
    if(tbody){
        const cumplimiento = META_RANGO_ACTUAL > 0 ? (resumen.total / META_RANGO_ACTUAL) * 100 : 0;
        tbody.innerHTML = `
            <tr>
                <td>Rango seleccionado</td>
                <td>${formatMoney(META_RANGO_ACTUAL)}</td>
                <td>${formatMoney(resumen.total)}</td>
                <td>${cumplimiento.toFixed(1)}%</td>
                <td>${formatMoney(Math.max(META_RANGO_ACTUAL - resumen.total, 0))}</td>
                <td>${badgeEstado(cumplimiento)}</td>
            </tr>
            <tr>
                <td>Mensual base</td>
                <td>${formatMoney(metaMensualTotal())}</td>
                <td>${formatMoney(resumen.total)}</td>
                <td>${(metaMensualTotal() > 0 ? (resumen.total / metaMensualTotal()) * 100 : 0).toFixed(1)}%</td>
                <td>${formatMoney(Math.max(metaMensualTotal() - resumen.total, 0))}</td>
                <td>${badgeEstado(metaMensualTotal() > 0 ? (resumen.total / metaMensualTotal()) * 100 : 0)}</td>
            </tr>
            <tr>
                <td>Anual</td>
                <td>${formatMoney(metaMensualTotal() * 12)}</td>
                <td>${formatMoney(resumen.total)}</td>
                <td>${(metaMensualTotal() * 12 > 0 ? (resumen.total / (metaMensualTotal() * 12)) * 100 : 0).toFixed(1)}%</td>
                <td>${formatMoney(Math.max((metaMensualTotal() * 12) - resumen.total, 0))}</td>
                <td>${badgeEstado(metaMensualTotal() * 12 > 0 ? (resumen.total / (metaMensualTotal() * 12)) * 100 : 0)}</td>
            </tr>
        `;
    }
}

function renderCategorias(){
    const categorias = agruparCategorias(DATASET_FILTRADO);
    const total = sumar(DATASET_FILTRADO);
    const orden = ["PARTICULAR","RED","EXCEDENTES","PLAN"];

    const tbody = document.querySelector("#tablaCategoriasVista tbody");
    if(tbody){
        tbody.innerHTML = orden.map(cat => {
            const data = categorias[cat] || {cantidad:0, valor:0};
            const generaVenta = categoriaGeneraVenta(cat);
            const meta = generaVenta ? metaCategoriaMensual(cat) * MESES_EQUIVALENTES_ACTUAL : 0;
            const participacion = generaVenta && total > 0 ? (data.valor / total) * 100 : 0;
            const cumplimiento = generaVenta && meta > 0 ? (data.valor / meta) * 100 : 0;

            return `
                <tr>
                    <td><strong>${cat}</strong></td>
                    <td>${generaVenta ? '<span class="badge badge-ok">Genera ventas</span>' : '<span class="badge badge-info">Solo cantidad</span>'}</td>
                    <td>${data.cantidad}</td>
                    <td>${generaVenta ? formatMoney(data.valor) : "-"}</td>
                    <td>${generaVenta ? participacion.toFixed(1) + "%" : "-"}</td>
                    <td>${generaVenta ? formatMoney(meta) : "-"}</td>
                    <td>${generaVenta ? cumplimiento.toFixed(1) + "%" : "-"}</td>
                </tr>
            `;
        }).join("");
    }

    crearChartDoughnut(
        "graficoCategoriasVista",
        ["PARTICULAR","RED","EXCEDENTES"],
        [
            categorias.PARTICULAR?.valor || 0,
            categorias.RED?.valor || 0,
            categorias.EXCEDENTES?.valor || 0
        ],
        "Ventas por categoría gerencial"
    );
}

function renderGestores(){
    const gestores = Object.values(agruparGestores(DATASET_FILTRADO)).sort((a,b) => b.valor - a.valor);
    const cantidadGestores = gestores.filter(g => g.nombre !== "SIN GESTOR").length;

    const tbody = document.querySelector("#tablaGestoresVista tbody");
    if(tbody){
        if(gestores.length === 0){
            tbody.innerHTML = `<tr><td colspan="7">Sin registros</td></tr>`;
        }else{
            tbody.innerHTML = gestores.map(g => {
                const metaConfig = metaGestorMensual(g.nombre);
                const meta = metaConfig > 0 ? metaConfig * MESES_EQUIVALENTES_ACTUAL : (cantidadGestores > 0 ? META_RANGO_ACTUAL / cantidadGestores : 0);
                const cumplimiento = meta > 0 ? (g.valor / meta) * 100 : 0;
                const faltante = Math.max(meta - g.valor, 0);

                return `
                    <tr>
                        <td>${g.nombre}</td>
                        <td>${formatMoney(meta)}</td>
                        <td>${g.cantidad}</td>
                        <td>${formatMoney(g.valor)}</td>
                        <td>${cumplimiento.toFixed(1)}%</td>
                        <td>${formatMoney(faltante)}</td>
                        <td>${badgeEstado(cumplimiento)}</td>
                    </tr>
                `;
            }).join("");
        }
    }

    crearChartBar(
        "graficoGestores",
        gestores.slice(0,15).map(g => g.nombre),
        gestores.slice(0,15).map(g => g.valor),
        "Ventas",
        "Ranking de gestores",
        true
    );
}

function renderExcedentes(){
    const excedentes = Object.values(agruparExcedentes(DATASET_FILTRADO)).sort((a,b) => b.valor - a.valor);
    const totalExcedentes = excedentes.reduce((acc,x) => acc + x.valor, 0);
    const cantidad = excedentes.reduce((acc,x) => acc + x.cantidad, 0);
    const metaExcedentes = metaCategoriaMensual("EXCEDENTES") * MESES_EQUIVALENTES_ACTUAL;
    const cumplimiento = metaExcedentes > 0 ? (totalExcedentes / metaExcedentes) * 100 : 0;

    setHtml("vistaExcedentesValor", formatMoney(totalExcedentes));
    setHtml("vistaExcedentesCantidad", cantidad);
    setHtml("vistaExcedentesMeta", formatMoney(metaExcedentes));
    setHtml("vistaExcedentesCumplimiento", cumplimiento.toFixed(1) + "%");

    const tbody = document.querySelector("#tablaExcedentesVista tbody");
    if(tbody){
        if(excedentes.length === 0){
            tbody.innerHTML = `<tr><td colspan="6">Sin excedentes registrados</td></tr>`;
        }else{
            tbody.innerHTML = excedentes.map(item => {
                const meta = metaExcedenteMensual(item.nombre) * MESES_EQUIVALENTES_ACTUAL;
                const pct = meta > 0 ? (item.valor / meta) * 100 : 0;

                return `
                    <tr>
                        <td>${item.nombre}</td>
                        <td>${formatMoney(meta)}</td>
                        <td>${item.cantidad}</td>
                        <td>${formatMoney(item.valor)}</td>
                        <td>${pct.toFixed(1)}%</td>
                        <td>${badgeEstado(pct)}</td>
                    </tr>
                `;
            }).join("");
        }
    }

    crearChartBar(
        "graficoExcedentes",
        excedentes.slice(0,15).map(x => x.nombre),
        excedentes.slice(0,15).map(x => x.valor),
        "Ventas",
        "Excedentes por valor",
        true
    );
}

function renderMetas(){
    setHtml("metaParticularVista", formatMoney(metaCategoriaMensual("PARTICULAR")));
    setHtml("metaRedVista", formatMoney(metaCategoriaMensual("RED")));
    setHtml("metaExcedentesVista", formatMoney(metaCategoriaMensual("EXCEDENTES")));
    setHtml("metaMensualVista", formatMoney(metaMensualTotal()));

    const categorias = agruparCategorias(DATASET_FILTRADO);
    const tbody = document.querySelector("#tablaMetasCategoria tbody");

    if(tbody){
        tbody.innerHTML = ["PARTICULAR","RED","EXCEDENTES"].map(cat => {
            const venta = categorias[cat]?.valor || 0;
            const meta = metaCategoriaMensual(cat) * MESES_EQUIVALENTES_ACTUAL;
            const pct = meta > 0 ? (venta / meta) * 100 : 0;

            return `
                <tr>
                    <td>${cat}</td>
                    <td>${formatMoney(meta)}</td>
                    <td>${formatMoney(venta)}</td>
                    <td>${pct.toFixed(1)}%</td>
                    <td>${badgeEstado(pct)}</td>
                </tr>
            `;
        }).join("");
    }

    const labels = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const metas = labels.map((_, index) => metaMensualTotal() * (index + 1));

    crearChartLine("graficoMetas", labels, [
        {label:"Meta acumulada", data:metas, borderColor:"#00a651", backgroundColor:"rgba(0,166,81,.12)", fill:true, tension:.25}
    ], "Meta acumulada anual");
}

function renderCumplimientoMensual(){
    const mensual = agruparMensual(DATASET_FILTRADO);
    const labels = ordenarMeses(Object.keys(mensual));

    const ventas = labels.map(k => mensual[k].venta);
    const metas = labels.map(() => metaMensualTotal());

    crearChartLine("graficoCumplimientoMensual", labels, [
        {label:"Venta", data:ventas, borderColor:"#00a651", backgroundColor:"rgba(0,166,81,.12)", fill:true, tension:.3},
        {label:"Meta", data:metas, borderColor:"#ef4444", borderDash:[8,6], fill:false, pointRadius:0}
    ], "Cumplimiento mensual");

    const tbody = document.querySelector("#tablaCumplimientoMensual tbody");
    if(tbody){
        tbody.innerHTML = labels.length ? labels.map((k, i) => {
            const venta = ventas[i];
            const meta = metas[i];
            const pct = meta > 0 ? (venta / meta) * 100 : 0;
            const faltante = Math.max(meta - venta, 0);

            return `
                <tr>
                    <td>${k}</td>
                    <td>${formatMoney(meta)}</td>
                    <td>${formatMoney(venta)}</td>
                    <td>${pct.toFixed(1)}%</td>
                    <td>${formatMoney(faltante)}</td>
                    <td>${badgeEstado(pct)}</td>
                </tr>
            `;
        }).join("") : `<tr><td colspan="6">Sin registros</td></tr>`;
    }
}

function renderComparativoAnual(){
    const f = obtenerFiltros();
    const fin = f.fechaFin ? new Date(`${f.fechaFin}T00:00:00`) : new Date();
    const anioActual = fin.getFullYear();
    const anioAnterior = anioActual - 1;

    const meses = Array.from({length:12}, (_,i) => i + 1);
    const labels = meses.map(m => nombreMes(m));

    const ventasActual = meses.map(m => sumar(DATASET_NORMAL.filter(r => r.fecha && r.fecha.getFullYear() === anioActual && r.fecha.getMonth() + 1 === m && coincideFiltrosNoFecha(r, f))));
    const ventasAnterior = meses.map(m => sumar(DATASET_NORMAL.filter(r => r.fecha && r.fecha.getFullYear() === anioAnterior && r.fecha.getMonth() + 1 === m && coincideFiltrosNoFecha(r, f))));

    crearChartLine("graficoComparativoAnual", labels, [
        {label:String(anioActual), data:ventasActual, borderColor:"#00a651", backgroundColor:"rgba(0,166,81,.12)", fill:true, tension:.3},
        {label:String(anioAnterior), data:ventasAnterior, borderColor:"#2563eb", backgroundColor:"rgba(37,99,235,.10)", fill:true, tension:.3}
    ], "Año actual vs año anterior");

    const tbody = document.querySelector("#tablaComparativoAnual tbody");
    if(tbody){
        tbody.innerHTML = labels.map((mes, i) => {
            const actual = ventasActual[i];
            const anterior = ventasAnterior[i];
            const diferencia = actual - anterior;
            const crecimiento = anterior > 0 ? (diferencia / anterior) * 100 : 0;

            return `
                <tr>
                    <td>${mes}</td>
                    <td>${formatMoney(actual)}</td>
                    <td>${formatMoney(anterior)}</td>
                    <td>${formatMoney(diferencia)}</td>
                    <td>${crecimiento.toFixed(1)}%</td>
                </tr>
            `;
        }).join("");
    }
}

function renderPareto(){
    const gestores = Object.values(agruparGestores(DATASET_FILTRADO)).sort((a,b) => b.valor - a.valor);
    const total = gestores.reduce((acc,g) => acc + g.valor, 0);

    let acumulado = 0;
    const data = gestores.map(g => {
        const participacion = total > 0 ? (g.valor / total) * 100 : 0;
        acumulado += participacion;

        return {
            nombre:g.nombre,
            valor:g.valor,
            participacion,
            acumulado
        };
    });

    const principales = data.filter(x => x.acumulado <= 80).length;
    setHtml("textoPareto", `El análisis Pareto identifica qué gestores concentran mayor parte de las ventas. En el rango actual, aproximadamente <strong>${principales}</strong> gestores concentran el resultado principal.`);

    const tbody = document.querySelector("#tablaParetoGestores tbody");
    if(tbody){
        tbody.innerHTML = data.length ? data.map(item => `
            <tr>
                <td>${item.nombre}</td>
                <td>${formatMoney(item.valor)}</td>
                <td>${item.participacion.toFixed(1)}%</td>
                <td>${item.acumulado.toFixed(1)}%</td>
                <td>${item.acumulado <= 80 ? '<span class="badge badge-info">Pareto 80/20</span>' : '<span class="badge badge-warning">Complementario</span>'}</td>
            </tr>
        `).join("") : `<tr><td colspan="5">Sin registros</td></tr>`;
    }

    crearChartBar(
        "graficoParetoGestores",
        data.slice(0,15).map(x => x.nombre),
        data.slice(0,15).map(x => x.valor),
        "Venta",
        "Pareto por gestor",
        true
    );
}

function calcularCalidadDatos(){
    const total = DATASET_NORMAL.length;
    const fechasInvalidas = DATASET_NORMAL.filter(r => !r.fecha).length;
    const valoresCero = DATASET_NORMAL.filter(r => r.generaVenta && r.valorVenta === 0).length;
    const sinGestor = DATASET_NORMAL.filter(r => !r.gestor).length;
    const sinCategoria = DATASET_NORMAL.filter(r => !r.categoriaGerencial).length;

    const errores = fechasInvalidas + valoresCero + sinGestor + sinCategoria;
    const calidad = total > 0 ? Math.max(100 - ((errores / (total * 4)) * 100), 0) : 0;

    return {
        total,
        fechasInvalidas,
        valoresCero,
        sinGestor,
        sinCategoria,
        calidad
    };
}

function renderDatos(){
    const calidad = calcularCalidadDatos();

    setHtml("diagEstadoApi", API_STATUS.mensaje);
    setHtml("diagTotalApi", DATASET_API.length);
    setHtml("diagManual", DATASET_MANUAL.length);
    setHtml("diagFiltrados", DATASET_FILTRADO.length);
    setHtml("diagFechasInvalidas", calidad.fechasInvalidas);
    setHtml("diagValoresCero", calidad.valoresCero);
    setHtml("diagCalidad", calidad.calidad.toFixed(1) + "%");

    const estadoApi = $("diagEstadoApi");
    if(estadoApi) estadoApi.style.color = API_STATUS.ok ? "#16a34a" : "#dc2626";

    const tbodyParams = document.querySelector("#tablaParametros tbody");
    if(tbodyParams){
        const rows = [];

        Object.entries(PARAMETROS.gestor).forEach(([k,v]) => rows.push(["GESTOR", k, v]));
        Object.entries(PARAMETROS.categoria).forEach(([k,v]) => rows.push(["META_CATEGORIA", k, v]));
        Object.entries(PARAMETROS.excedente).forEach(([k,v]) => rows.push(["META_EXCEDENTE", k, v]));

        tbodyParams.innerHTML = rows.length ? rows.map(r => `
            <tr>
                <td>${r[0]}</td>
                <td>${r[1]}</td>
                <td>${formatMoney(r[2])}</td>
            </tr>
        `).join("") : `<tr><td colspan="3">No se detectaron parámetros</td></tr>`;
    }

    const tbody = document.querySelector("#tablaBaseDatos tbody");
    if(tbody){
        const muestra = DATASET_FILTRADO.slice(0, 70);

        tbody.innerHTML = muestra.length ? muestra.map(row => `
            <tr>
                <td>${row.origen}</td>
                <td>${row.fechaTexto || "-"}</td>
                <td>${row.gestor || "-"}</td>
                <td>${row.categoriaGerencial || "-"}</td>
                <td>${row.servicio || "-"}</td>
                <td>${row.sede || "-"}</td>
                <td>${formatMoney(row.valorVenta)}</td>
            </tr>
        `).join("") : `<tr><td colspan="7">Sin registros</td></tr>`;
    }
}

function renderAlertas(resumen){
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (resumen.total / META_RANGO_ACTUAL) * 100 : 0;
    const alertas = [];

    if(!API_STATUS.ok){
        alertas.push(`Revisar conexión o estructura API: ${API_STATUS.mensaje}.`);
    }

    if(DATASET_FILTRADO.length === 0){
        alertas.push("No hay registros para el rango seleccionado.");
    }

    if(cumplimiento < 80){
        alertas.push(`Cumplimiento bajo: ${cumplimiento.toFixed(1)}%. Requiere plan de acción.`);
    }else if(cumplimiento < 100){
        alertas.push(`Cumplimiento en riesgo controlado: ${cumplimiento.toFixed(1)}%.`);
    }else{
        alertas.push(`Meta cumplida: ${cumplimiento.toFixed(1)}%.`);
    }

    if((PARAMETROS.categoria["PARTICULAR"] || 0) === 0) alertas.push("No se detectó META_CATEGORIA para PARTICULAR.");
    if((PARAMETROS.categoria["RED"] || 0) === 0) alertas.push("No se detectó META_CATEGORIA para RED.");
    if((PARAMETROS.categoria["EXCEDENTES"] || 0) === 0) alertas.push("No se detectó META_CATEGORIA para EXCEDENTES.");

    const html = alertas.map(a => `
        <div class="alerta-item">
            <i class="fas fa-circle-exclamation"></i>
            <span>${a}</span>
        </div>
    `).join("");

    setHtml("alertasGerencialesVista", html || "<p>Sin alertas por el momento.</p>");
}

function cargarColeccionLocal(clave, datosIniciales=[]){
    const guardado = localStorage.getItem(clave);
    if(guardado){
        try{
            const data = JSON.parse(guardado);
            return Array.isArray(data) ? data : [];
        }catch(error){
            console.warn(`No se pudo leer ${clave}`, error);
        }
    }

    localStorage.setItem(clave, JSON.stringify(datosIniciales));
    return datosIniciales;
}

function guardarColeccionLocal(clave, data){
    localStorage.setItem(clave, JSON.stringify(data));
}

function anioOperativoActual(){
    const f = obtenerFiltros();
    const fecha = f.fechaFin ? new Date(`${f.fechaFin}T00:00:00`) : new Date();
    return fecha && !isNaN(fecha.getTime()) ? fecha.getFullYear() : new Date().getFullYear();
}

function datosEnergiaIniciales(){
    return [
        {id:"energia_2025_1", anio:2025, mes:1, kwh:1840, costo:1612000, observacion:"Base histórica"},
        {id:"energia_2025_2", anio:2025, mes:2, kwh:1765, costo:1549000, observacion:"Base histórica"},
        {id:"energia_2025_3", anio:2025, mes:3, kwh:1910, costo:1719000, observacion:"Base histórica"},
        {id:"energia_2025_4", anio:2025, mes:4, kwh:1888, costo:1687000, observacion:"Base histórica"},
        {id:"energia_2025_5", anio:2025, mes:5, kwh:1965, costo:1785000, observacion:"Base histórica"},
        {id:"energia_2025_6", anio:2025, mes:6, kwh:2015, costo:1850000, observacion:"Base histórica"},
        {id:"energia_2026_1", anio:2026, mes:1, kwh:1795, costo:1650000, observacion:"Registro inicial"},
        {id:"energia_2026_2", anio:2026, mes:2, kwh:1820, costo:1692000, observacion:"Registro inicial"},
        {id:"energia_2026_3", anio:2026, mes:3, kwh:1875, costo:1756000, observacion:"Registro inicial"},
        {id:"energia_2026_4", anio:2026, mes:4, kwh:1932, costo:1815000, observacion:"Registro inicial"},
        {id:"energia_2026_5", anio:2026, mes:5, kwh:1988, costo:1897000, observacion:"Registro inicial"},
        {id:"energia_2026_6", anio:2026, mes:6, kwh:2040, costo:1975000, observacion:"Registro inicial"}
    ];
}

function cargarEnergia(){
    return cargarColeccionLocal("energiaHomenajes", datosEnergiaIniciales());
}

function valorEnergia(data, anio, mes, campo){
    const item = data.find(x => Number(x.anio) === Number(anio) && Number(x.mes) === Number(mes));
    return item ? toNumber(item[campo]) : 0;
}

function renderEnergia(){
    const data = cargarEnergia().sort((a,b) => Number(a.anio) - Number(b.anio) || Number(a.mes) - Number(b.mes));
    const anioActual = anioOperativoActual();
    const anioAnterior = anioActual - 1;
    const meses = Array.from({length:12}, (_,i) => i + 1);
    const labels = meses.map(m => nombreMes(m).slice(0,3));

    const kwhActual = meses.map(m => valorEnergia(data, anioActual, m, "kwh"));
    const kwhAnterior = meses.map(m => valorEnergia(data, anioAnterior, m, "kwh"));
    const costoActual = meses.map(m => valorEnergia(data, anioActual, m, "costo"));

    const totalActual = kwhActual.reduce((a,b) => a + b, 0);
    const totalAnterior = kwhAnterior.reduce((a,b) => a + b, 0);
    const costoTotal = costoActual.reduce((a,b) => a + b, 0);
    const mesesConDato = kwhActual.filter(v => v > 0).length || 1;
    const variacion = totalAnterior > 0 ? ((totalActual - totalAnterior) / totalAnterior) * 100 : 0;

    setHtml("kpiEnergiaKwh", `${formatNumber(totalActual)} kWh`);
    setHtml("kpiEnergiaCosto", formatMoney(costoTotal));
    setHtml("kpiEnergiaPromedio", `${formatNumber(totalActual / mesesConDato)} kWh`);
    setHtml("kpiEnergiaVariacion", `${variacion.toFixed(1)}%`);
    setHtml("textoEnergia", `
        Comparativo del consumo eléctrico de homenajes para <strong>${anioActual}</strong> frente a <strong>${anioAnterior}</strong>.
        El acumulado actual es <strong>${formatNumber(totalActual)} kWh</strong>, con costo de <strong>${formatMoney(costoTotal)}</strong>
        y variación de <strong>${variacion.toFixed(1)}%</strong>.
    `);

    const variacionEl = $("kpiEnergiaVariacion");
    if(variacionEl) variacionEl.style.color = variacion <= 0 ? "#16a34a" : "#dc2626";

    crearChartLine("graficoEnergiaComparativo", labels, [
        {label:String(anioActual), data:kwhActual, borderColor:"#00a651", backgroundColor:"rgba(0,166,81,.12)", fill:true, tension:.3},
        {label:String(anioAnterior), data:kwhAnterior, borderColor:"#2563eb", backgroundColor:"rgba(37,99,235,.10)", fill:true, tension:.3}
    ], "Consumo kWh año actual vs anterior");

    crearChartBar("graficoEnergiaCosto", labels, costoActual, "Costo", `Costo mensual ${anioActual}`);

    const tbody = document.querySelector("#tablaEnergia tbody");
    if(tbody){
        tbody.innerHTML = data.length ? [...data].sort((a,b) => Number(b.anio) - Number(a.anio) || Number(b.mes) - Number(a.mes)).map(item => {
            const costoKwh = toNumber(item.kwh) > 0 ? toNumber(item.costo) / toNumber(item.kwh) : 0;
            return `
                <tr>
                    <td>${escapeHtml(item.anio)}</td>
                    <td>${nombreMes(item.mes)}</td>
                    <td>${formatNumber(item.kwh)} kWh</td>
                    <td>${formatMoney(item.costo)}</td>
                    <td>${formatMoney(costoKwh)}</td>
                    <td>${escapeHtml(item.observacion || "-")}</td>
                    <td><button class="danger-btn" onclick="eliminarEnergia('${escapeHtml(item.id)}')">Eliminar</button></td>
                </tr>
            `;
        }).join("") : `<tr><td colspan="7">Sin registros de energía</td></tr>`;
    }
}

function agregarEnergia(){
    const item = {
        id:cryptoRandom(),
        anio:Number($("energiaAnio")?.value || 0),
        mes:Number($("energiaMes")?.value || 0),
        kwh:toNumber($("energiaKwh")?.value || 0),
        costo:toNumber($("energiaCosto")?.value || 0),
        observacion:$("energiaObservacion")?.value || ""
    };

    if(!item.anio || !item.mes || item.kwh <= 0){
        toast("Año, mes y consumo kWh son obligatorios.", "warning");
        return;
    }

    let data = cargarEnergia().filter(x => !(Number(x.anio) === item.anio && Number(x.mes) === item.mes));
    data.push(item);
    guardarColeccionLocal("energiaHomenajes", data);

    ["energiaAnio","energiaMes","energiaKwh","energiaCosto","energiaObservacion"].forEach(id => setValue(id, ""));
    renderEnergia();
    toast("Consumo de energía guardado.");
}

function eliminarEnergia(id){
    const data = cargarEnergia().filter(item => item.id !== id);
    guardarColeccionLocal("energiaHomenajes", data);
    renderEnergia();
    toast("Registro de energía eliminado.");
}

window.eliminarEnergia = eliminarEnergia;

function limpiarEnergia(){
    if(!confirm("¿Deseas eliminar todos los registros de energía?")) return;
    guardarColeccionLocal("energiaHomenajes", []);
    renderEnergia();
    toast("Registros de energía eliminados.");
}

function datosVacacionesIniciales(){
    return [
        {id:"vac_javier", nombre:"Javier Mendoza Galván", cargo:"Conductor Tanatopractor", fechaBase:"2025-07-01", inicio:"2026-07-02", fin:"2026-07-21", dias:15, estado:"PROGRAMADA"},
        {id:"vac_raul", nombre:"Raúl López", cargo:"Conductor Tanatopractor", fechaBase:"2024-12-01", inicio:"", fin:"", dias:0, estado:"VENCIDA"},
        {id:"vac_hazael", nombre:"Hazael Galván", cargo:"Conductor Tanatopractor", fechaBase:"2025-08-15", inicio:"", fin:"", dias:0, estado:"PENDIENTE"},
        {id:"vac_wendy", nombre:"Wendy Paola Cordero", cargo:"Gestora de Protocolo", fechaBase:"2025-05-20", inicio:"2026-05-05", fin:"2026-05-24", dias:15, estado:"DISFRUTADA"}
    ];
}

function cargarVacaciones(){
    return cargarColeccionLocal("vacacionesPersonal", datosVacacionesIniciales());
}

function estadoVacacion(item){
    const estado = normalizarTexto(item.estado);
    if(["VENCIDA","PENDIENTE","PROGRAMADA","DISFRUTADA"].includes(estado)) return estado;

    const base = parseFecha(item.fechaBase);
    if(!base) return "PENDIENTE";

    const dias = diasEntre(base, new Date());
    return dias >= 365 ? "VENCIDA" : "PENDIENTE";
}

function badgeVacacion(estado){
    if(estado === "DISFRUTADA") return `<span class="badge badge-ok">Disfrutada</span>`;
    if(estado === "PROGRAMADA") return `<span class="badge badge-info">Programada</span>`;
    if(estado === "VENCIDA") return `<span class="badge badge-danger">Vencida</span>`;
    return `<span class="badge badge-warning">Pendiente</span>`;
}

function renderVacaciones(){
    const data = cargarVacaciones();
    const conteo = {VENCIDA:0, PROGRAMADA:0, DISFRUTADA:0, PENDIENTE:0};

    data.forEach(item => conteo[estadoVacacion(item)] = (conteo[estadoVacacion(item)] || 0) + 1);

    setHtml("kpiVacacionesVencidas", conteo.VENCIDA);
    setHtml("kpiVacacionesProgramadas", conteo.PROGRAMADA);
    setHtml("kpiVacacionesDisfrutadas", conteo.DISFRUTADA);
    setHtml("kpiVacacionesPendientes", conteo.PENDIENTE);
    setHtml("textoVacaciones", `
        Control actual: <strong>${conteo.VENCIDA}</strong> vencidas, <strong>${conteo.PROGRAMADA}</strong> programadas,
        <strong>${conteo.DISFRUTADA}</strong> disfrutadas y <strong>${conteo.PENDIENTE}</strong> pendientes.
    `);

    crearChartDoughnut(
        "graficoVacacionesEstado",
        ["VENCIDA","PROGRAMADA","DISFRUTADA","PENDIENTE"],
        [conteo.VENCIDA, conteo.PROGRAMADA, conteo.DISFRUTADA, conteo.PENDIENTE],
        "Estado vacaciones"
    );

    const tbody = document.querySelector("#tablaVacaciones tbody");
    if(tbody){
        tbody.innerHTML = data.length ? data.map(item => {
            const estado = estadoVacacion(item);
            return `
                <tr>
                    <td>${escapeHtml(item.nombre)}</td>
                    <td>${escapeHtml(item.cargo || "-")}</td>
                    <td>${escapeHtml(item.fechaBase || "-")}</td>
                    <td>${escapeHtml(item.inicio || "-")}</td>
                    <td>${escapeHtml(item.fin || "-")}</td>
                    <td>${formatNumber(item.dias || 0)}</td>
                    <td>${badgeVacacion(estado)}</td>
                    <td><button class="danger-btn" onclick="eliminarVacacion('${escapeHtml(item.id)}')">Eliminar</button></td>
                </tr>
            `;
        }).join("") : `<tr><td colspan="8">Sin registros de vacaciones</td></tr>`;
    }
}

function agregarVacacion(){
    const nombre = $("vacNombre")?.value || "";
    const item = {
        id:cryptoRandom(),
        nombre:nombre.trim(),
        cargo:$("vacCargo")?.value || "",
        fechaBase:$("vacFechaBase")?.value || "",
        estado:$("vacEstado")?.value || "PENDIENTE",
        inicio:$("vacInicio")?.value || "",
        fin:$("vacFin")?.value || "",
        dias:toNumber($("vacDias")?.value || 0)
    };

    if(!item.nombre){
        toast("El nombre del colaborador es obligatorio.", "warning");
        return;
    }

    let data = cargarVacaciones().filter(x => normalizarLlave(x.nombre) !== normalizarLlave(item.nombre));
    data.push(item);
    guardarColeccionLocal("vacacionesPersonal", data);

    ["vacNombre","vacCargo","vacFechaBase","vacEstado","vacInicio","vacFin","vacDias"].forEach(id => setValue(id, ""));
    renderVacaciones();
    toast("Registro de vacaciones guardado.");
}

function eliminarVacacion(id){
    const data = cargarVacaciones().filter(item => item.id !== id);
    guardarColeccionLocal("vacacionesPersonal", data);
    renderVacaciones();
    toast("Registro de vacaciones eliminado.");
}

window.eliminarVacacion = eliminarVacacion;

function limpiarVacaciones(){
    if(!confirm("¿Deseas eliminar todos los registros de vacaciones?")) return;
    guardarColeccionLocal("vacacionesPersonal", []);
    renderVacaciones();
    toast("Vacaciones eliminadas.");
}

function datosAgendaIniciales(){
    const anio = new Date().getFullYear();
    return [
        {id:"act_preoperacional", fecha:`${anio}-01-02`, titulo:"Verificar reporte preoperacional de vehículos", frecuencia:"DIARIA", estado:"PENDIENTE", responsable:"Coordinación Homenajes", detalle:"Control diario antes de entregar turno."},
        {id:"act_bitacora", fecha:`${anio}-01-02`, titulo:"Revisar bitácora de parque automotor", frecuencia:"DIARIA", estado:"PENDIENTE", responsable:"Coordinación Homenajes", detalle:"Confirmar novedades y entrega de llaves."},
        {id:"act_implementos", fecha:`${anio}-06-20`, titulo:"Seguimiento implementos de velación en casa", frecuencia:"MENSUAL", estado:"PENDIENTE", responsable:"Gestores", detalle:"Validar elementos vigentes, por recoger y recogidos."},
        {id:"act_residuos", fecha:`${anio}-07-01`, titulo:"Capacitación residuos y desinfección", frecuencia:"ANUAL", estado:"PENDIENTE", responsable:"Talento Humano / Homenajes", detalle:"Refuerzo obligatorio para el equipo operativo."},
        {id:"act_auditoria", fecha:`${anio}-11-10`, titulo:"Preparación auditoría interna", frecuencia:"ANUAL", estado:"PENDIENTE", responsable:"Coordinación Homenajes", detalle:"Revisar R-15, R-56, RH1 y soportes operativos."}
    ];
}

function cargarAgenda(){
    return cargarColeccionLocal("agendaHomenajes", datosAgendaIniciales());
}

function actividadEnMes(item, anio, mes){
    const fecha = parseFecha(item.fecha);
    return fecha && fecha.getFullYear() === anio && fecha.getMonth() + 1 === mes;
}

function actividadEsHoy(item){
    const fecha = parseFecha(item.fecha);
    return fecha && fechaISO(fecha) === fechaISO(new Date());
}

function badgeActividad(estado){
    return normalizarTexto(estado) === "FINIQUITADA"
        ? `<span class="badge badge-ok">Finiquitada</span>`
        : `<span class="badge badge-warning">Pendiente</span>`;
}

function renderAgenda(){
    const data = cargarAgenda().sort((a,b) => String(a.fecha).localeCompare(String(b.fecha)));
    const anio = AGENDA_CURSOR.getFullYear();
    const mes = AGENDA_CURSOR.getMonth() + 1;
    const actividadesMes = data.filter(item => actividadEnMes(item, anio, mes));
    const pendientes = data.filter(item => normalizarTexto(item.estado) !== "FINIQUITADA").length;
    const finiquitadas = data.filter(item => normalizarTexto(item.estado) === "FINIQUITADA").length;
    const hoy = data.filter(actividadEsHoy).length;

    setHtml("kpiAgendaPendientes", pendientes);
    setHtml("kpiAgendaFiniquitadas", finiquitadas);
    setHtml("kpiAgendaHoy", hoy);
    setHtml("kpiAgendaMes", actividadesMes.length);
    setHtml("textoAgenda", `
        Agenda activa con <strong>${pendientes}</strong> actividades pendientes y <strong>${finiquitadas}</strong> finiquitadas.
        Para <strong>${nombreMes(mes)} ${anio}</strong> hay <strong>${actividadesMes.length}</strong> actividades programadas.
    `);
    setHtml("agendaMesTitulo", `${nombreMes(mes)} ${anio}`);

    renderCalendarioAgenda(data, anio, mes);
    renderListaAgenda(actividadesMes);
    renderTablaAgenda(data);
}

function renderCalendarioAgenda(data, anio, mes){
    const contenedor = $("agendaCalendario");
    if(!contenedor) return;

    const primerDia = new Date(anio, mes - 1, 1);
    const ultimoDia = new Date(anio, mes, 0);
    const inicioSemana = (primerDia.getDay() + 6) % 7;
    const totalDias = ultimoDia.getDate();
    const hoy = fechaISO(new Date());
    const diasSemana = ["L","M","M","J","V","S","D"];
    const celdas = [];

    diasSemana.forEach(dia => celdas.push(`<div class="agenda-weekday">${dia}</div>`));
    for(let i = 0; i < inicioSemana; i++) celdas.push(`<div class="agenda-day empty"></div>`);

    for(let dia = 1; dia <= totalDias; dia++){
        const fecha = new Date(anio, mes - 1, dia);
        const iso = fechaISO(fecha);
        const actividadesDia = data.filter(item => item.fecha === iso);
        const clases = ["agenda-day"];
        if(iso === hoy) clases.push("today");
        if(actividadesDia.length) clases.push("has-events");

        celdas.push(`
            <div class="${clases.join(" ")}">
                <strong>${dia}</strong>
                ${actividadesDia.length ? `<span>${actividadesDia.length} act.</span>` : ""}
            </div>
        `);
    }

    contenedor.innerHTML = celdas.join("");
}

function renderListaAgenda(actividades){
    const contenedor = $("agendaLista");
    if(!contenedor) return;

    if(!actividades.length){
        contenedor.innerHTML = `<p class="mini-text">Sin actividades programadas para este mes.</p>`;
        return;
    }

    contenedor.innerHTML = actividades.map(item => `
        <div class="agenda-item">
            <div>
                <strong>${escapeHtml(item.titulo)}</strong>
                <p>${escapeHtml(item.fecha)} · ${escapeHtml(item.frecuencia)} · ${escapeHtml(item.responsable || "Sin responsable")}</p>
            </div>
            ${badgeActividad(item.estado)}
        </div>
    `).join("");
}

function renderTablaAgenda(data){
    const tbody = document.querySelector("#tablaAgenda tbody");
    if(!tbody) return;

    tbody.innerHTML = data.length ? data.map(item => `
        <tr>
            <td>${escapeHtml(item.fecha || "-")}</td>
            <td>${escapeHtml(item.titulo || "-")}</td>
            <td>${escapeHtml(item.frecuencia || "-")}</td>
            <td>${escapeHtml(item.responsable || "-")}</td>
            <td>${badgeActividad(item.estado)}</td>
            <td>${escapeHtml(item.detalle || "-")}</td>
            <td>
                <button class="action-btn" onclick="alternarEstadoActividad('${escapeHtml(item.id)}')">Cambiar</button>
                <button class="danger-btn" onclick="eliminarActividad('${escapeHtml(item.id)}')">Eliminar</button>
            </td>
        </tr>
    `).join("") : `<tr><td colspan="7">Sin actividades registradas</td></tr>`;
}

function agregarActividad(){
    const item = {
        id:cryptoRandom(),
        fecha:$("actFecha")?.value || "",
        titulo:($("actTitulo")?.value || "").trim(),
        frecuencia:$("actFrecuencia")?.value || "UNICA",
        estado:$("actEstado")?.value || "PENDIENTE",
        responsable:$("actResponsable")?.value || "",
        detalle:$("actDetalle")?.value || ""
    };

    if(!item.fecha || !item.titulo){
        toast("Fecha y actividad son obligatorias.", "warning");
        return;
    }

    const data = cargarAgenda();
    data.push(item);
    guardarColeccionLocal("agendaHomenajes", data);

    ["actFecha","actTitulo","actFrecuencia","actEstado","actResponsable","actDetalle"].forEach(id => setValue(id, ""));
    setValue("actEstado", "PENDIENTE");
    renderAgenda();
    toast("Actividad agregada.");
}

function alternarEstadoActividad(id){
    const data = cargarAgenda().map(item => {
        if(item.id !== id) return item;
        return {...item, estado:normalizarTexto(item.estado) === "FINIQUITADA" ? "PENDIENTE" : "FINIQUITADA"};
    });
    guardarColeccionLocal("agendaHomenajes", data);
    renderAgenda();
}

function eliminarActividad(id){
    const data = cargarAgenda().filter(item => item.id !== id);
    guardarColeccionLocal("agendaHomenajes", data);
    renderAgenda();
    toast("Actividad eliminada.");
}

window.alternarEstadoActividad = alternarEstadoActividad;
window.eliminarActividad = eliminarActividad;

function moverAgenda(meses){
    AGENDA_CURSOR = new Date(AGENDA_CURSOR.getFullYear(), AGENDA_CURSOR.getMonth() + meses, 1);
    renderAgenda();
}

function limpiarAgenda(){
    if(!confirm("¿Deseas eliminar toda la agenda interna?")) return;
    guardarColeccionLocal("agendaHomenajes", []);
    renderAgenda();
    toast("Agenda eliminada.");
}

function datosTiempoAfiliadoIniciales(){
    return [
        {
            id:"afi_demo_1",
            fallecido:"Ejemplo permanencia larga",
            contrato:"Contrato ejemplo",
            sede:"Montería",
            fechaAfiliacion:"2018-03-15",
            fechaFallecimiento:"2026-02-20",
            observacion:"Registro de ejemplo"
        },
        {
            id:"afi_demo_2",
            fallecido:"Ejemplo permanencia corta",
            contrato:"Plan ejemplo",
            sede:"Cereté",
            fechaAfiliacion:"2025-11-10",
            fechaFallecimiento:"2026-03-05",
            observacion:"Registro de ejemplo"
        }
    ];
}

function cargarTiempoAfiliado(){
    return cargarColeccionLocal("tiempoAfiliadoFallecidos", datosTiempoAfiliadoIniciales());
}

function calcularTiempoAfiliado(item){
    const inicio = parseFecha(item.fechaAfiliacion);
    const fin = parseFecha(item.fechaFallecimiento);

    if(!inicio || !fin || fin < inicio){
        return {
            valido:false,
            dias:0,
            meses:0,
            anios:0,
            texto:"Fecha inválida",
            clasificacion:"REVISAR"
        };
    }

    const dias = diasEntre(inicio, fin);
    const meses = Math.floor(dias / 30.4375);
    const anios = Math.floor(meses / 12);
    const mesesRestantes = meses % 12;
    const diasRestantes = Math.max(Math.round(dias - (meses * 30.4375)), 0);

    let texto = "";
    if(anios > 0) texto += `${anios} año${anios === 1 ? "" : "s"}`;
    if(mesesRestantes > 0) texto += `${texto ? ", " : ""}${mesesRestantes} mes${mesesRestantes === 1 ? "" : "es"}`;
    if(!texto) texto = `${dias} día${dias === 1 ? "" : "s"}`;
    if(texto && anios === 0 && mesesRestantes > 0 && diasRestantes > 0) texto += `, ${diasRestantes} día${diasRestantes === 1 ? "" : "s"}`;

    let clasificacion = "MÁS DE 5 AÑOS";
    if(dias < 90) clasificacion = "MENOS DE 3 MESES";
    else if(dias < 180) clasificacion = "3 A 6 MESES";
    else if(dias < 365) clasificacion = "6 A 12 MESES";
    else if(dias < 1095) clasificacion = "1 A 3 AÑOS";
    else if(dias < 1825) clasificacion = "3 A 5 AÑOS";

    return {
        valido:true,
        dias,
        meses,
        anios,
        texto,
        clasificacion
    };
}

function badgeTiempoAfiliado(clasificacion){
    const c = normalizarTexto(clasificacion);
    if(c.includes("MENOS") || c.includes("3 A 6")) return `<span class="badge badge-danger">${escapeHtml(clasificacion)}</span>`;
    if(c.includes("6 A 12") || c.includes("1 A 3")) return `<span class="badge badge-warning">${escapeHtml(clasificacion)}</span>`;
    if(c === "REVISAR") return `<span class="badge badge-info">Revisar</span>`;
    return `<span class="badge badge-ok">${escapeHtml(clasificacion)}</span>`;
}

function resumenTiempoAfiliado(){
    const data = cargarTiempoAfiliado();
    const enriquecidos = data.map(item => ({...item, tiempo:calcularTiempoAfiliado(item)}));
    const validos = enriquecidos.filter(item => item.tiempo.valido);
    const totalDias = validos.reduce((acc,item) => acc + item.tiempo.dias, 0);
    const promedioDias = validos.length ? totalDias / validos.length : 0;
    const menor = validos.slice().sort((a,b) => a.tiempo.dias - b.tiempo.dias)[0] || null;
    const mayor = validos.slice().sort((a,b) => b.tiempo.dias - a.tiempo.dias)[0] || null;

    const rangos = {
        "MENOS DE 3 MESES":0,
        "3 A 6 MESES":0,
        "6 A 12 MESES":0,
        "1 A 3 AÑOS":0,
        "3 A 5 AÑOS":0,
        "MÁS DE 5 AÑOS":0,
        "REVISAR":0
    };

    enriquecidos.forEach(item => {
        rangos[item.tiempo.clasificacion] = (rangos[item.tiempo.clasificacion] || 0) + 1;
    });

    return {
        data,
        enriquecidos,
        validos,
        promedioDias,
        menor,
        mayor,
        rangos
    };
}

function renderTiempoAfiliado(){
    const resumen = resumenTiempoAfiliado();

    setHtml("kpiAfiliadoCasos", resumen.enriquecidos.length);
    setHtml("kpiAfiliadoPromedio", resumen.validos.length ? `${formatNumber(resumen.promedioDias)} días` : "0 días");
    setHtml("kpiAfiliadoMenor", resumen.menor ? resumen.menor.tiempo.texto : "-");
    setHtml("kpiAfiliadoMayor", resumen.mayor ? resumen.mayor.tiempo.texto : "-");

    setHtml("textoTiempoAfiliado", `
        Se registran <strong>${resumen.enriquecidos.length}</strong> casos.
        El promedio de permanencia vivo estando afiliado es de <strong>${formatNumber(resumen.promedioDias)} días</strong>.
        ${resumen.mayor ? `El mayor tiempo registrado corresponde a <strong>${escapeHtml(resumen.mayor.fallecido)}</strong> con <strong>${resumen.mayor.tiempo.texto}</strong>.` : ""}
    `);

    const labels = Object.keys(resumen.rangos);
    const data = labels.map(label => resumen.rangos[label]);
    crearChartBar("graficoTiempoAfiliado", labels, data, "Casos", "Casos por rango de permanencia", true);

    const tbody = document.querySelector("#tablaTiempoAfiliado tbody");
    if(tbody){
        tbody.innerHTML = resumen.enriquecidos.length ? resumen.enriquecidos
            .sort((a,b) => b.tiempo.dias - a.tiempo.dias)
            .map(item => `
                <tr>
                    <td>${escapeHtml(item.fallecido || "-")}</td>
                    <td>${escapeHtml(item.contrato || "-")}</td>
                    <td>${escapeHtml(item.sede || "-")}</td>
                    <td>${escapeHtml(item.fechaAfiliacion || "-")}</td>
                    <td>${escapeHtml(item.fechaFallecimiento || "-")}</td>
                    <td>${escapeHtml(item.tiempo.texto)}</td>
                    <td>${formatNumber(item.tiempo.dias)}</td>
                    <td>${badgeTiempoAfiliado(item.tiempo.clasificacion)}</td>
                    <td><button class="danger-btn" onclick="eliminarTiempoAfiliado('${escapeHtml(item.id)}')">Eliminar</button></td>
                </tr>
            `).join("") : `<tr><td colspan="9">Sin casos registrados</td></tr>`;
    }
}

function agregarTiempoAfiliado(){
    const item = {
        id:cryptoRandom(),
        fallecido:($("afiFallecido")?.value || "").trim(),
        contrato:$("afiContrato")?.value || "",
        sede:$("afiSede")?.value || "",
        fechaAfiliacion:$("afiFechaAfiliacion")?.value || "",
        fechaFallecimiento:$("afiFechaFallecimiento")?.value || "",
        observacion:$("afiObservacion")?.value || ""
    };

    if(!item.fallecido || !item.fechaAfiliacion || !item.fechaFallecimiento){
        toast("Nombre, fecha de afiliación y fecha de fallecimiento son obligatorios.", "warning");
        return;
    }

    const tiempo = calcularTiempoAfiliado(item);
    if(!tiempo.valido){
        toast("La fecha de fallecimiento debe ser igual o posterior a la fecha de afiliación.", "warning");
        return;
    }

    const data = cargarTiempoAfiliado();
    data.push(item);
    guardarColeccionLocal("tiempoAfiliadoFallecidos", data);

    ["afiFallecido","afiContrato","afiSede","afiFechaAfiliacion","afiFechaFallecimiento","afiObservacion"].forEach(id => setValue(id, ""));
    renderTiempoAfiliado();
    toast("Caso de tiempo afiliado agregado.");
}

function eliminarTiempoAfiliado(id){
    const data = cargarTiempoAfiliado().filter(item => item.id !== id);
    guardarColeccionLocal("tiempoAfiliadoFallecidos", data);
    renderTiempoAfiliado();
    toast("Caso eliminado.");
}

window.eliminarTiempoAfiliado = eliminarTiempoAfiliado;

function limpiarTiempoAfiliado(){
    if(!confirm("¿Deseas eliminar todos los casos registrados de tiempo afiliado?")) return;
    guardarColeccionLocal("tiempoAfiliadoFallecidos", []);
    renderTiempoAfiliado();
    toast("Casos de tiempo afiliado eliminados.");
}

function renderRegistrosManuales(){
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

    if(!item.Fecha || !item.Gestor || !item.Tipo_Homenaje){
        toast("Fecha, gestor y categoría son obligatorios.", "warning");
        return;
    }

    if(item.Tipo_Homenaje !== "PLAN" && item.Valor <= 0){
        toast("Para Particular, Red o Excedentes el valor debe ser mayor a cero.", "warning");
        return;
    }

    const data = JSON.parse(localStorage.getItem("registrosManuales") || "[]");
    data.push(item);
    localStorage.setItem("registrosManuales", JSON.stringify(data));

    ["regFecha","regGestor","regServicio","regSede","regValor","regObservacion"].forEach(id => setValue(id, ""));
    setValue("regCategoria", "");

    toast("Registro manual agregado.");
    cargarDashboard();
}

function eliminarRegistroManual(id){
    let data = JSON.parse(localStorage.getItem("registrosManuales") || "[]");
    data = data.filter(item => item.id !== id);
    localStorage.setItem("registrosManuales", JSON.stringify(data));

    toast("Registro manual eliminado.");
    cargarDashboard();
}

window.eliminarRegistroManual = eliminarRegistroManual;

function eliminarTodosManuales(){
    const confirmar = confirm("¿Deseas eliminar todos los registros manuales?");
    if(!confirmar) return;

    localStorage.removeItem("registrosManuales");
    toast("Registros manuales eliminados.");
    cargarDashboard();
}

function obtenerResumenOperativoReporte(){
    const anio = anioOperativoActual();
    const energia = cargarEnergia();
    const energiaActual = energia.filter(item => Number(item.anio) === anio);
    const energiaAnterior = energia.filter(item => Number(item.anio) === anio - 1);

    const totalKwh = energiaActual.reduce((acc,item) => acc + toNumber(item.kwh), 0);
    const totalCosto = energiaActual.reduce((acc,item) => acc + toNumber(item.costo), 0);
    const totalKwhAnterior = energiaAnterior.reduce((acc,item) => acc + toNumber(item.kwh), 0);
    const variacionKwh = totalKwhAnterior > 0 ? ((totalKwh - totalKwhAnterior) / totalKwhAnterior) * 100 : 0;

    const vacaciones = cargarVacaciones();
    const vacacionesConteo = {VENCIDA:0, PROGRAMADA:0, DISFRUTADA:0, PENDIENTE:0};
    vacaciones.forEach(item => {
        const estado = estadoVacacion(item);
        vacacionesConteo[estado] = (vacacionesConteo[estado] || 0) + 1;
    });

    const agenda = cargarAgenda();
    const agendaPendiente = agenda.filter(item => normalizarTexto(item.estado) !== "FINIQUITADA").length;
    const agendaFiniquitada = agenda.filter(item => normalizarTexto(item.estado) === "FINIQUITADA").length;
    const agendaHoy = agenda.filter(actividadEsHoy).length;
    const tiempoAfiliado = resumenTiempoAfiliado();

    return {
        anio,
        energia,
        energiaActual,
        totalKwh,
        totalCosto,
        totalKwhAnterior,
        variacionKwh,
        vacaciones,
        vacacionesConteo,
        agenda,
        agendaPendiente,
        agendaFiniquitada,
        agendaHoy,
        tiempoAfiliado
    };
}

function renderReporteFormal(){
    const reporte = $("reporteFormal");
    if(!reporte || !ULTIMO_RESUMEN || !ULTIMA_META_INFO) return;

    const titulo = localStorage.getItem("dashboardTitulo") || "General Report Jkfh";
    const empresa = localStorage.getItem("dashboardEmpresa") || "General Report";
    const area = localStorage.getItem("dashboardArea") || "Área de Homenajes";
    const responsable = localStorage.getItem("dashboardResponsable") || "George Korfan";
    const logo = localStorage.getItem("dashboardLogoUrl") || "";

    const cumplimiento = META_RANGO_ACTUAL > 0 ? (ULTIMO_RESUMEN.total / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - ULTIMO_RESUMEN.total, 0);
    const operativo = obtenerResumenOperativoReporte();

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
            <div class="print-kpi"><span>Meta</span><strong>${formatMoney(META_RANGO_ACTUAL)}</strong></div>
            <div class="print-kpi"><span>Venta Real</span><strong>${formatMoney(ULTIMO_RESUMEN.total)}</strong></div>
            <div class="print-kpi"><span>Cumplimiento</span><strong>${cumplimiento.toFixed(1)}%</strong></div>
            <div class="print-kpi"><span>Faltante</span><strong>${formatMoney(faltante)}</strong></div>
            <div class="print-kpi"><span>Energía ${operativo.anio}</span><strong>${formatNumber(operativo.totalKwh)} kWh</strong></div>
            <div class="print-kpi"><span>Costo energía</span><strong>${formatMoney(operativo.totalCosto)}</strong></div>
            <div class="print-kpi"><span>Vacaciones vencidas</span><strong>${operativo.vacacionesConteo.VENCIDA || 0}</strong></div>
            <div class="print-kpi"><span>Agenda pendiente</span><strong>${operativo.agendaPendiente}</strong></div>
            <div class="print-kpi"><span>Casos afiliación</span><strong>${operativo.tiempoAfiliado.enriquecidos.length}</strong></div>
            <div class="print-kpi"><span>Promedio afiliado</span><strong>${formatNumber(operativo.tiempoAfiliado.promedioDias)} días</strong></div>
            <div class="print-kpi"><span>Menor permanencia</span><strong>${operativo.tiempoAfiliado.menor ? operativo.tiempoAfiliado.menor.tiempo.texto : "-"}</strong></div>
            <div class="print-kpi"><span>Mayor permanencia</span><strong>${operativo.tiempoAfiliado.mayor ? operativo.tiempoAfiliado.mayor.tiempo.texto : "-"}</strong></div>
        </div>

        <h2>Resumen ejecutivo</h2>
        <p>
            Las ventas consideradas para cumplimiento corresponden a PARTICULAR, RED y EXCEDENTES.
            PLAN solo se considera como cantidad atendida y no suma venta ni cumplimiento de meta.
        </p>

        <h2>Detalle por categoría</h2>
        <table>
            <thead>
                <tr>
                    <th>Categoría</th>
                    <th>Cantidad</th>
                    <th>Venta</th>
                    <th>Meta</th>
                    <th>Cumplimiento</th>
                </tr>
            </thead>
            <tbody>
                ${["PARTICULAR","RED","EXCEDENTES","PLAN"].map(cat => {
                    const data = agruparCategorias(DATASET_FILTRADO)[cat] || {cantidad:0, valor:0};
                    const generaVenta = categoriaGeneraVenta(cat);
                    const meta = generaVenta ? metaCategoriaMensual(cat) * MESES_EQUIVALENTES_ACTUAL : 0;
                    const pct = generaVenta && meta > 0 ? (data.valor / meta) * 100 : 0;

                    return `
                        <tr>
                            <td>${cat}</td>
                            <td>${data.cantidad}</td>
                            <td>${generaVenta ? formatMoney(data.valor) : "-"}</td>
                            <td>${generaVenta ? formatMoney(meta) : "-"}</td>
                            <td>${generaVenta ? pct.toFixed(1) + "%" : "-"}</td>
                        </tr>
                    `;
                }).join("")}
            </tbody>
        </table>

        <h2>Control de energía eléctrica</h2>
        <p>
            En ${operativo.anio}, el consumo registrado es <strong>${formatNumber(operativo.totalKwh)} kWh</strong>,
            con costo acumulado de <strong>${formatMoney(operativo.totalCosto)}</strong> y variación frente al año anterior de
            <strong>${operativo.variacionKwh.toFixed(1)}%</strong>.
        </p>
        <table>
            <thead>
                <tr>
                    <th>Mes</th>
                    <th>kWh</th>
                    <th>Costo</th>
                    <th>Costo/kWh</th>
                    <th>Observación</th>
                </tr>
            </thead>
            <tbody>
                ${operativo.energiaActual.length ? operativo.energiaActual.sort((a,b) => Number(a.mes) - Number(b.mes)).map(item => {
                    const costoKwh = toNumber(item.kwh) > 0 ? toNumber(item.costo) / toNumber(item.kwh) : 0;
                    return `
                        <tr>
                            <td>${nombreMes(item.mes)}</td>
                            <td>${formatNumber(item.kwh)}</td>
                            <td>${formatMoney(item.costo)}</td>
                            <td>${formatMoney(costoKwh)}</td>
                            <td>${escapeHtml(item.observacion || "-")}</td>
                        </tr>
                    `;
                }).join("") : `<tr><td colspan="5">Sin registros de energía para el año seleccionado</td></tr>`}
            </tbody>
        </table>

        <h2>Control de vacaciones</h2>
        <p>
            Estado del personal: <strong>${operativo.vacacionesConteo.VENCIDA || 0}</strong> vencidas,
            <strong>${operativo.vacacionesConteo.PROGRAMADA || 0}</strong> programadas,
            <strong>${operativo.vacacionesConteo.DISFRUTADA || 0}</strong> disfrutadas y
            <strong>${operativo.vacacionesConteo.PENDIENTE || 0}</strong> pendientes.
        </p>
        <table>
            <thead>
                <tr>
                    <th>Colaborador</th>
                    <th>Cargo</th>
                    <th>Inicio</th>
                    <th>Fin</th>
                    <th>Días</th>
                    <th>Estado</th>
                </tr>
            </thead>
            <tbody>
                ${operativo.vacaciones.length ? operativo.vacaciones.map(item => `
                    <tr>
                        <td>${escapeHtml(item.nombre || "-")}</td>
                        <td>${escapeHtml(item.cargo || "-")}</td>
                        <td>${escapeHtml(item.inicio || "-")}</td>
                        <td>${escapeHtml(item.fin || "-")}</td>
                        <td>${formatNumber(item.dias || 0)}</td>
                        <td>${estadoVacacion(item)}</td>
                    </tr>
                `).join("") : `<tr><td colspan="6">Sin registros de vacaciones</td></tr>`}
            </tbody>
        </table>

        <h2>Agenda anual interna</h2>
        <p>
            Actividades registradas: <strong>${operativo.agenda.length}</strong>.
            Pendientes: <strong>${operativo.agendaPendiente}</strong>.
            Finiquitadas: <strong>${operativo.agendaFiniquitada}</strong>.
            Actividades para hoy: <strong>${operativo.agendaHoy}</strong>.
        </p>
        <table>
            <thead>
                <tr>
                    <th>Fecha</th>
                    <th>Actividad</th>
                    <th>Frecuencia</th>
                    <th>Responsable</th>
                    <th>Estado</th>
                </tr>
            </thead>
            <tbody>
                ${operativo.agenda.length ? operativo.agenda.slice().sort((a,b) => String(a.fecha).localeCompare(String(b.fecha))).slice(0,20).map(item => `
                    <tr>
                        <td>${escapeHtml(item.fecha || "-")}</td>
                        <td>${escapeHtml(item.titulo || "-")}</td>
                        <td>${escapeHtml(item.frecuencia || "-")}</td>
                        <td>${escapeHtml(item.responsable || "-")}</td>
                        <td>${escapeHtml(item.estado || "-")}</td>
                    </tr>
                `).join("") : `<tr><td colspan="5">Sin actividades registradas</td></tr>`}
            </tbody>
        </table>

        <h2>Tiempo vivo estando afiliado</h2>
        <p>
            Casos registrados: <strong>${operativo.tiempoAfiliado.enriquecidos.length}</strong>.
            Promedio de permanencia: <strong>${formatNumber(operativo.tiempoAfiliado.promedioDias)} días</strong>.
            ${operativo.tiempoAfiliado.mayor ? `Mayor permanencia: <strong>${escapeHtml(operativo.tiempoAfiliado.mayor.fallecido)}</strong> con <strong>${operativo.tiempoAfiliado.mayor.tiempo.texto}</strong>.` : ""}
        </p>
        <table>
            <thead>
                <tr>
                    <th>Ser querido</th>
                    <th>Afiliación</th>
                    <th>Fallecimiento</th>
                    <th>Tiempo</th>
                    <th>Días</th>
                    <th>Clasificación</th>
                </tr>
            </thead>
            <tbody>
                ${operativo.tiempoAfiliado.enriquecidos.length ? operativo.tiempoAfiliado.enriquecidos.slice().sort((a,b) => b.tiempo.dias - a.tiempo.dias).map(item => `
                    <tr>
                        <td>${escapeHtml(item.fallecido || "-")}</td>
                        <td>${escapeHtml(item.fechaAfiliacion || "-")}</td>
                        <td>${escapeHtml(item.fechaFallecimiento || "-")}</td>
                        <td>${escapeHtml(item.tiempo.texto)}</td>
                        <td>${formatNumber(item.tiempo.dias)}</td>
                        <td>${escapeHtml(item.tiempo.clasificacion)}</td>
                    </tr>
                `).join("") : `<tr><td colspan="6">Sin registros de tiempo afiliado</td></tr>`}
            </tbody>
        </table>

        <p style="margin-top:35px;"><strong>Firma responsable:</strong> ${responsable}</p>
    `;
}

function exportarPDF(){
    renderReporteFormal();

    const elemento = $("reporteFormal");
    if(!elemento || typeof html2pdf === "undefined"){
        toast("No se pudo generar PDF. Verifica conexión a la librería.", "error");
        return;
    }

    const opciones = {
        margin:0.25,
        filename:"reporte_gerencial_homenajes.pdf",
        image:{type:"jpeg", quality:0.98},
        html2canvas:{scale:2, useCORS:true},
        jsPDF:{unit:"in", format:"a4", orientation:"portrait"}
    };

    html2pdf().set(opciones).from(elemento).save();
    setHtml("estadoReporte", "PDF generado correctamente.");
    toast("PDF generado correctamente.");
}

function exportarExcel(){
    if(typeof XLSX === "undefined"){
        toast("No se pudo generar Excel. Verifica conexión a la librería.", "error");
        return;
    }

    const operativo = obtenerResumenOperativoReporte();

    const datos = DATASET_FILTRADO.map(row => ({
        Origen:row.origen,
        Fecha:row.fechaTexto,
        Gestor:row.gestor,
        Categoria_Original:row.categoria,
        Categoria_Gerencial:row.categoriaGerencial,
        Servicio:row.servicio,
        Sede:row.sede,
        Valor_Original:row.valorOriginal,
        Valor_Venta:row.valorVenta,
        Genera_Venta:row.generaVenta ? "SI" : "NO"
    }));

    const resumen = [
        ["Indicador", "Valor"],
        ["Meta mensual", metaMensualTotal()],
        ["Meta rango", META_RANGO_ACTUAL],
        ["Venta rango", ULTIMO_RESUMEN?.total || 0],
        ["Cumplimiento", META_RANGO_ACTUAL > 0 ? ((ULTIMO_RESUMEN?.total || 0) / META_RANGO_ACTUAL) * 100 : 0],
        ["Registros API", DATASET_API.length],
        ["Registros Manuales", DATASET_MANUAL.length],
        ["Estado API", API_STATUS.mensaje],
        ["Energía kWh año", operativo.totalKwh],
        ["Costo energía año", operativo.totalCosto],
        ["Variación kWh vs año anterior", operativo.variacionKwh],
        ["Vacaciones vencidas", operativo.vacacionesConteo.VENCIDA || 0],
        ["Vacaciones programadas", operativo.vacacionesConteo.PROGRAMADA || 0],
        ["Vacaciones disfrutadas", operativo.vacacionesConteo.DISFRUTADA || 0],
        ["Vacaciones pendientes", operativo.vacacionesConteo.PENDIENTE || 0],
        ["Agenda pendiente", operativo.agendaPendiente],
        ["Agenda finiquitada", operativo.agendaFiniquitada],
        ["Casos tiempo afiliado", operativo.tiempoAfiliado.enriquecidos.length],
        ["Promedio días afiliado antes de fallecer", operativo.tiempoAfiliado.promedioDias],
        ["Menor tiempo afiliado", operativo.tiempoAfiliado.menor ? operativo.tiempoAfiliado.menor.tiempo.dias : 0],
        ["Mayor tiempo afiliado", operativo.tiempoAfiliado.mayor ? operativo.tiempoAfiliado.mayor.tiempo.dias : 0]
    ];

    const parametros = [];
    Object.entries(PARAMETROS.gestor).forEach(([k,v]) => parametros.push({Tipo:"GESTOR", Nombre:k, Valor:v}));
    Object.entries(PARAMETROS.categoria).forEach(([k,v]) => parametros.push({Tipo:"META_CATEGORIA", Nombre:k, Valor:v}));
    Object.entries(PARAMETROS.excedente).forEach(([k,v]) => parametros.push({Tipo:"META_EXCEDENTE", Nombre:k, Valor:v}));

    const energia = operativo.energia.map(item => ({
        Anio:item.anio,
        Mes:nombreMes(item.mes),
        Numero_Mes:Number(item.mes),
        kWh:toNumber(item.kwh),
        Costo:toNumber(item.costo),
        Costo_kWh:toNumber(item.kwh) > 0 ? toNumber(item.costo) / toNumber(item.kwh) : 0,
        Observacion:item.observacion || ""
    })).sort((a,b) => Number(a.Anio) - Number(b.Anio) || Number(a.Numero_Mes) - Number(b.Numero_Mes));

    const vacaciones = operativo.vacaciones.map(item => ({
        Colaborador:item.nombre || "",
        Cargo:item.cargo || "",
        Fecha_Base:item.fechaBase || "",
        Inicio:item.inicio || "",
        Fin:item.fin || "",
        Dias:toNumber(item.dias || 0),
        Estado:estadoVacacion(item)
    }));

    const agenda = operativo.agenda.map(item => ({
        Fecha:item.fecha || "",
        Actividad:item.titulo || "",
        Frecuencia:item.frecuencia || "",
        Responsable:item.responsable || "",
        Estado:item.estado || "",
        Detalle:item.detalle || ""
    })).sort((a,b) => String(a.Fecha).localeCompare(String(b.Fecha)));

    const tiempoAfiliado = operativo.tiempoAfiliado.enriquecidos.map(item => ({
        Fallecido:item.fallecido || "",
        Contrato_Plan:item.contrato || "",
        Sede:item.sede || "",
        Fecha_Afiliacion:item.fechaAfiliacion || "",
        Fecha_Fallecimiento:item.fechaFallecimiento || "",
        Tiempo_Texto:item.tiempo.texto,
        Dias:item.tiempo.dias,
        Meses_Aproximados:item.tiempo.meses,
        Anios_Aproximados:item.tiempo.anios,
        Clasificacion:item.tiempo.clasificacion,
        Observacion:item.observacion || ""
    })).sort((a,b) => Number(b.Dias) - Number(a.Dias));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), "Resumen");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), "Datos Filtrados");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(parametros), "Parametros");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(energia), "Energia");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vacaciones), "Vacaciones");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agenda), "Agenda");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tiempoAfiliado), "Tiempo Afiliado");

    XLSX.writeFile(wb, "dashboard_gerencial_homenajes.xlsx");

    setHtml("estadoReporte", "Excel generado correctamente.");
    toast("Excel generado correctamente.");
}

function exportarCSV(){
    const headers = ["Origen","Fecha","Gestor","Categoria_Gerencial","Servicio","Sede","Valor_Venta"];
    const rows = DATASET_FILTRADO.map(r => [r.origen, r.fechaTexto, r.gestor, r.categoriaGerencial, r.servicio, r.sede, r.valorVenta]);

    const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g,'""')}"`).join(","))
        .join("\n");

    descargarArchivo("dashboard_homenajes.csv", csv, "text/csv;charset=utf-8;");
    setHtml("estadoReporte", "CSV generado correctamente.");
    toast("CSV generado correctamente.");
}

function exportarJSON(){
    const operativo = obtenerResumenOperativoReporte();

    const backup = {
        fecha:new Date().toISOString(),
        parametros:PARAMETROS,
        apiStatus:API_STATUS,
        registrosFiltrados:DATASET_FILTRADO,
        registrosManuales:DATASET_MANUAL,
        energia:operativo.energia,
        vacaciones:operativo.vacaciones,
        agenda:operativo.agenda,
        tiempoAfiliado:operativo.tiempoAfiliado.enriquecidos,
        resumenOperativo:{
            anio:operativo.anio,
            totalKwh:operativo.totalKwh,
            totalCostoEnergia:operativo.totalCosto,
            variacionKwh:operativo.variacionKwh,
            vacaciones:operativo.vacacionesConteo,
            agendaPendiente:operativo.agendaPendiente,
            agendaFiniquitada:operativo.agendaFiniquitada,
            agendaHoy:operativo.agendaHoy,
            tiempoAfiliado:{
                casos:operativo.tiempoAfiliado.enriquecidos.length,
                promedioDias:operativo.tiempoAfiliado.promedioDias,
                rangos:operativo.tiempoAfiliado.rangos
            }
        }
    };

    descargarArchivo("backup_dashboard_gerencial_homenajes.json", JSON.stringify(backup, null, 2), "application/json;charset=utf-8;");
    setHtml("estadoReporte", "Backup JSON generado correctamente.");
    toast("Backup JSON generado correctamente.");
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

function limpiarCache(){
    const confirmar = confirm("¿Deseas limpiar configuraciones locales? No elimina los registros manuales.");
    if(!confirmar) return;

    [
        "dashboardTema",
        "dashboardSidebar",
        "dashboardTitulo",
        "dashboardSubtitulo",
        "dashboardEmpresa",
        "dashboardArea",
        "dashboardResponsable",
        "dashboardLogoUrl",
        "parametrosManual"
    ].forEach(k => localStorage.removeItem(k));

    toast("Caché limpiado.");
    setTimeout(() => location.reload(), 800);
}

function aplicarRangoRapido(rango){
    const hoy = new Date();
    let inicio = hoy;
    let fin = hoy;

    if(rango === "hoy"){
        inicio = hoy;
        fin = hoy;
    }

    if(rango === "mes"){
        inicio = inicioMes(hoy);
        fin = hoy;
    }

    if(rango === "trimestre"){
        inicio = inicioTrimestre(hoy);
        fin = hoy;
    }

    if(rango === "semestre"){
        inicio = inicioSemestre(hoy);
        fin = hoy;
    }

    if(rango === "anio"){
        inicio = inicioAnio(hoy);
        fin = hoy;
    }

    setValue("fechaInicio", fechaISO(inicio));
    setValue("fechaFin", fechaISO(fin));
    aplicarFiltrosYRender();
}

function limpiarFiltros(){
    ["filtroGestor","filtroServicio","filtroSede","filtroAnio","filtroMes"].forEach(id => setValue(id, ""));
    setValue("filtroCategoria", "");
    setValue("busquedaGeneral", "");
    setValue("fechaInicio", "");
    setValue("fechaFin", "");
    establecerFechasPorDefecto();
    aplicarFiltrosYRender();
    toast("Filtros limpiados.");
}

function cambiarVista(seccion){
    document.querySelectorAll(".menu-item").forEach(item => item.classList.remove("active"));
    document.querySelectorAll(".vista").forEach(vista => vista.classList.remove("active-view"));

    const itemMenu = document.querySelector(`.menu-item[data-seccion="${seccion}"]`);
    if(itemMenu) itemMenu.classList.add("active");

    const vista = $(seccion);
    if(vista) vista.classList.add("active-view");

    setTimeout(redimensionarGraficos, 150);
}

function redimensionarGraficos(){
    Object.values(charts).forEach(chart => {
        if(chart && typeof chart.resize === "function") chart.resize();
    });
}

function alternarSidebar(){
    document.body.classList.toggle("sidebar-collapsed");
    localStorage.setItem("dashboardSidebar", document.body.classList.contains("sidebar-collapsed") ? "collapsed" : "expanded");
    setTimeout(redimensionarGraficos, 200);
}

function alternarTema(){
    document.body.classList.toggle("dark-mode");
    localStorage.setItem("dashboardTema", document.body.classList.contains("dark-mode") ? "dark" : "light");
}

function pantallaCompleta(){
    if(!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
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
    }else{
        toast("Código o correo no autorizado.", "error");
    }
}

function cerrarSesion(){
    sessionStorage.removeItem("dashboardAutorizado");
    setValue("accessEmail", "");
    setValue("accessCode", "");
    validarAcceso();
}

function guardarMeta(){
    const nuevaMeta = toNumber($("configMetaMensual")?.value);

    if(nuevaMeta <= 0){
        toast("Ingrese una meta válida.", "warning");
        return;
    }

    META_MENSUAL_BASE = nuevaMeta;
    localStorage.setItem("metaMensualBase", String(nuevaMeta));

    procesarParametrosManuales();
    aplicarFiltrosYRender();

    toast("Meta guardada.");
}

function guardarIdentidad(){
    localStorage.setItem("dashboardTitulo", $("configTitulo")?.value || "General Report Jkfh");
    localStorage.setItem("dashboardSubtitulo", $("configSubtitulo")?.value || "Dashboard gerencial de homenajes, metas, categorías y excedentes");
    localStorage.setItem("dashboardEmpresa", $("configEmpresa")?.value || "General Report");
    localStorage.setItem("dashboardArea", $("configArea")?.value || "Área de Homenajes");
    localStorage.setItem("dashboardResponsable", $("configResponsable")?.value || "George Korfan");
    localStorage.setItem("dashboardLogoUrl", $("configLogoUrl")?.value || "");

    actualizarConfiguracion();
    renderReporteFormal();
    toast("Identidad guardada.");
}

function guardarAcceso(){
    ACCESS_CODE = $("configAccessCode")?.value || "JKFH2026";
    localStorage.setItem("dashboardAccessCode", ACCESS_CODE);
    localStorage.setItem("dashboardEmails", $("configEmails")?.value || "");

    toast("Acceso guardado.");
}

function guardarParametrosManual(){
    localStorage.setItem("parametrosManual", $("configMetasManual")?.value || "");
    procesarParametros([]);
    aplicarFiltrosYRender();

    toast("Parámetros guardados.");
}

function actualizarConfiguracion(){
    setValue("configMetaMensual", META_MENSUAL_BASE);
    setValue("configTitulo", localStorage.getItem("dashboardTitulo") || "General Report Jkfh");
    setValue("configSubtitulo", localStorage.getItem("dashboardSubtitulo") || "Dashboard gerencial de homenajes, metas, categorías y excedentes");
    setValue("configEmpresa", localStorage.getItem("dashboardEmpresa") || "General Report");
    setValue("configArea", localStorage.getItem("dashboardArea") || "Área de Homenajes");
    setValue("configResponsable", localStorage.getItem("dashboardResponsable") || "George Korfan");
    setValue("configLogoUrl", localStorage.getItem("dashboardLogoUrl") || "");
    setValue("configAccessCode", ACCESS_CODE);
    setValue("configEmails", localStorage.getItem("dashboardEmails") || "");
    setValue("configMetasManual", localStorage.getItem("parametrosManual") || "");

    const titulo = localStorage.getItem("dashboardTitulo") || "General Report Jkfh";
    const subtitulo = localStorage.getItem("dashboardSubtitulo") || "Dashboard gerencial de homenajes, metas, categorías y excedentes";
    const empresa = localStorage.getItem("dashboardEmpresa") || "General Report";
    const logo = localStorage.getItem("dashboardLogoUrl") || "";

    setHtml("tituloDashboard", titulo);
    setHtml("subtituloDashboard", subtitulo);
    setHtml("sidebarEmpresa", empresa);

    ["logoTopbar","sidebarLogo"].forEach(id => {
        const img = $(id);
        if(!img) return;

        if(logo){
            img.src = logo;
            img.style.display = "block";
        }else{
            img.src = "";
            img.style.display = "none";
        }
    });
}

function aplicarPreferencias(){
    if(localStorage.getItem("dashboardTema") === "dark") document.body.classList.add("dark-mode");
    if(localStorage.getItem("dashboardSidebar") === "collapsed") document.body.classList.add("sidebar-collapsed");
}

function obtenerItemsDeGrupoSidebar(titulo){
    const items = [];
    let actual = titulo.nextElementSibling;

    while(actual && !actual.classList.contains("sidebar-section-title")){
        if(actual.classList.contains("menu-item")) items.push(actual);
        actual = actual.nextElementSibling;
    }

    return items;
}

function aplicarEstadoGrupoSidebar(titulo, colapsado){
    titulo.classList.toggle("section-collapsed", colapsado);
    obtenerItemsDeGrupoSidebar(titulo).forEach(item => {
        item.classList.toggle("menu-hidden", colapsado);
    });
}

function inicializarSidebarAcordeon(){
    document.querySelectorAll(".sidebar-section-title").forEach(titulo => {
        const key = "sidebarGroup_" + normalizarLlave(titulo.textContent);
        const colapsado = localStorage.getItem(key) === "collapsed";

        aplicarEstadoGrupoSidebar(titulo, colapsado);
        titulo.setAttribute("title", "Contraer / expandir sección");

        titulo.addEventListener("click", () => {
            if(document.body.classList.contains("sidebar-collapsed")) return;

            const nuevoEstado = !titulo.classList.contains("section-collapsed");
            aplicarEstadoGrupoSidebar(titulo, nuevoEstado);
            localStorage.setItem(key, nuevoEstado ? "collapsed" : "expanded");
            setTimeout(redimensionarGraficos, 160);
        });
    });
}

document.querySelectorAll(".menu-item").forEach(item => {
    item.addEventListener("click", () => cambiarVista(item.dataset.seccion));
});

document.querySelectorAll(".quick-btn").forEach(btn => {
    btn.addEventListener("click", () => aplicarRangoRapido(btn.dataset.rango));
});

$("btnFiltrar")?.addEventListener("click", aplicarFiltrosYRender);
$("btnLimpiar")?.addEventListener("click", limpiarFiltros);
$("btnRecargar")?.addEventListener("click", cargarDashboard);
$("btnPdf")?.addEventListener("click", exportarPDF);
$("btnExcel")?.addEventListener("click", exportarExcel);
$("btnTema")?.addEventListener("click", alternarTema);
$("btnSidebar")?.addEventListener("click", alternarSidebar);
$("btnFull")?.addEventListener("click", pantallaCompleta);
$("btnLogout")?.addEventListener("click", cerrarSesion);

$("reporteExcelResumen")?.addEventListener("click", exportarExcel);
$("reportePdfGeneral")?.addEventListener("click", exportarPDF);
$("reporteCsv")?.addEventListener("click", exportarCSV);
$("reporteJson")?.addEventListener("click", exportarJSON);
$("reporteRecargar")?.addEventListener("click", cargarDashboard);
$("reporteLimpiarCache")?.addEventListener("click", limpiarCache);

$("btnAgregarRegistro")?.addEventListener("click", agregarRegistroManual);
$("btnEliminarManuales")?.addEventListener("click", eliminarTodosManuales);

$("btnAgregarEnergia")?.addEventListener("click", agregarEnergia);
$("btnLimpiarEnergia")?.addEventListener("click", limpiarEnergia);

$("btnAgregarVacacion")?.addEventListener("click", agregarVacacion);
$("btnLimpiarVacaciones")?.addEventListener("click", limpiarVacaciones);

$("btnAgregarActividad")?.addEventListener("click", agregarActividad);
$("btnLimpiarAgenda")?.addEventListener("click", limpiarAgenda);
$("btnAgendaAnterior")?.addEventListener("click", () => moverAgenda(-1));
$("btnAgendaSiguiente")?.addEventListener("click", () => moverAgenda(1));

$("btnAgregarAfiliado")?.addEventListener("click", agregarTiempoAfiliado);
$("btnLimpiarAfiliados")?.addEventListener("click", limpiarTiempoAfiliado);

$("btnGuardarMeta")?.addEventListener("click", guardarMeta);
$("btnGuardarConfigVisual")?.addEventListener("click", guardarIdentidad);
$("btnGuardarAccess")?.addEventListener("click", guardarAcceso);
$("btnGuardarParametrosManual")?.addEventListener("click", guardarParametrosManual);

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
    "filtroMes"
].forEach(id => {
    $(id)?.addEventListener("change", aplicarFiltrosYRender);
});

aplicarPreferencias();
inicializarSidebarAcordeon();
actualizarConfiguracion();
validarAcceso();
establecerFechasPorDefecto();
cargarDashboard();
