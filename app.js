console.log("APP.JS CARGADO CORRECTAMENTE - VERSION 20260803");

const API_URL = "https://script.google.com/macros/s/AKfycbxEyu57a5spnJNju9t4654U8SDBrWFWQ0GWLibubGy5ntZsOV3N-TeL73423-a23j6FwA/exec";
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1Q1hyG-SXsMJdrgsLRIPiVlVePZuov4eJSYsb6l4EmyQ/export?format=csv&gid=223294406";
const GOOGLE_SHEET_PARAMETROS_CSV_URL = "https://docs.google.com/spreadsheets/d/1Q1hyG-SXsMJdrgsLRIPiVlVePZuov4eJSYsb6l4EmyQ/export?format=csv&gid=1505384889";
const GOOGLE_SHEET_FALLECIDOS_PLANES_CSV_URL = "https://docs.google.com/spreadsheets/d/1Q1hyG-SXsMJdrgsLRIPiVlVePZuov4eJSYsb6l4EmyQ/gviz/tq?tqx=out:csv&sheet=FALLECIDOS%20PLANES";

let ACCESS_CODE = localStorage.getItem("dashboardAccessCode") || "JKFH2026";
let META_MENSUAL_BASE = Number(localStorage.getItem("metaMensualBase")) || 219133881;

let META_RANGO_ACTUAL = 0;
let MESES_EQUIVALENTES_ACTUAL = 0;
let DIAS_RANGO_ACTUAL = 0;

let DATASET_API = [];
let DATASET_MANUAL = [];
let DATASET_NORMAL = [];
let DATASET_FILTRADO = [];
let DATASET_FALLECIDOS_PLANES = [];

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
let AGENDA_DIA_SELECCIONADO = fechaISO(new Date());

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

function formatMoneyCompact(valor){
    const numero = Math.round(toNumber(valor));
    const abs = Math.abs(numero);

    if(abs >= 1000000000) return "$" + (numero / 1000000000).toLocaleString("es-CO", {maximumFractionDigits:1}) + "MM";
    if(abs >= 1000000) return "$" + (numero / 1000000).toLocaleString("es-CO", {maximumFractionDigits:1}) + "M";
    if(abs >= 1000) return "$" + (numero / 1000).toLocaleString("es-CO", {maximumFractionDigits:0}) + "K";

    return formatMoney(numero);
}

function formatNumber(valor, decimales=0){
    return Number(toNumber(valor)).toLocaleString("es-CO", {
        minimumFractionDigits:decimales,
        maximumFractionDigits:decimales
    });
}

function primerNombreGestor(nombre){
    const texto = String(nombre || "").trim().toUpperCase();
    if(!texto) return "-";

    const partes = texto.split(/\s+/).filter(Boolean);
    const nombresFrecuentes = [
        "FERNANDO","CARLOS","OSVALDO","ALEXIS","WENDY","SAMIR","MARIO","JESSICA",
        "JULIA","EDER","OSCAR","OCTAVIO","PAOLA","DAVID","ANDRES","JOSE","LUIS"
    ];

    const encontrado = nombresFrecuentes.find(nombreBase => partes.includes(nombreBase));
    if(encontrado) return encontrado;

    if(partes.length >= 4) return partes[2];
    return partes[0] || "-";
}

function estadoMetaGrafica(porcentaje){
    if(porcentaje >= 100) return "Cumplida";
    if(porcentaje >= 80) return "En riesgo";
    return "No cumple";
}

function formatChartValue(valor, tipo="money"){
    if(tipo === "number") return formatNumber(valor);
    if(tipo === "kwh") return `${formatNumber(valor)} kWh`;
    if(tipo === "percent") return `${Number(toNumber(valor)).toFixed(1)}%`;
    if(tipo === "days") return `${formatNumber(valor)} días`;
    return formatMoney(valor);
}

function isDarkChartTheme(){
    return document.body.classList.contains("dark-mode")
        || document.body.classList.contains("theme-dark")
        || document.body.classList.contains("theme-slate");
}

function chartTextColor(){
    return "#f8fafc";
}

function chartGridColor(){
    return "rgba(226,232,240,.22)";
}

function chartValueLabelStyle(){
    return {
        color:"#052e1a",
        backgroundColor:"rgba(255,255,255,.98)",
        borderColor:"rgba(255,255,255,.42)"
    };
}

function esGraficaGestores(titulo="", label=""){
    const texto = normalizarTexto(`${titulo} ${label}`);
    return texto.includes("GESTOR") || texto.includes("GESTORES") || texto.includes("PARETO");
}

function etiquetaGraficaVisible(valor, titulo="", label=""){
    const texto = String(valor || "").trim();
    if(!texto) return "-";

    if(esGraficaGestores(titulo, label)) return primerNombreGestor(texto);

    if(texto.length > 34){
        return texto.slice(0, 31).trim() + "...";
    }

    return texto;
}

function registrarPluginGraficas(){
    if(typeof Chart !== "undefined" && typeof ChartDataLabels !== "undefined" && !Chart.__dashboardDataLabels){
        Chart.register(ChartDataLabels);
        Chart.__dashboardDataLabels = true;
    }
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
    return getCampo(item, ["Valor","VALOR","valor","Valor_Homenaje","Valor Homenaje","Total","TOTAL","Venta","VENTA","Valor Total","VALOR SERVICIO","Valor Servicio","VALOR_SERVICIO","VALOR EXCEDENTE","Valor Excedente","VALOR_EXCEDENTE"]);
}

function getGestorItem(item){
    return getCampo(item, ["Gestor","GESTOR","gestor","Asesor","ASESOR","Vendedor","VENDEDOR","Responsable"]);
}

function getCategoriaItem(item){
    return getCampo(item, ["Tipo_Homenaje","TIPO_HOMENAJE","Tipo Homenaje","Categoria","Categoría","CATEGORIA","Tipo Servicio","Tipo"]);
}

function getServicioItem(item){
    return getCampo(item, ["Tipo_Excedente","TIPO_EXCEDENTE","Tipo Excedente","TIPO_SERVICIO_TIPOSRV","Tipo Servicio TipoSrv","Tipo Servicio","Servicio","SERVICIO","Excedente","EXCEDENTE","Producto"]);
}

function getSedeItem(item){
    return getCampo(item, ["Sede","SEDE","Ciudad","Sucursal","Zona"]);
}

function getObservacionItem(item){
    return getCampo(item, ["Observacion","Observación","OBSERVACION","Nota","Detalle"]);
}

function getOrdenServicioItem(item){
    return getCampo(item, ["ORDEN_SERVICIO_FUNERARIO","Orden Servicio Funerario","Orden Servicio","Orden","OSF"]);
}

function getTipoServicioItem(item){
    return getCampo(item, ["TIPO_SERVICIO_TIPOSRV","Tipo Servicio TipoSrv","Tipo Servicio","TIPO SERVICIO","Servicio"]);
}

function getClinicaItem(item){
    return getCampo(item, ["CLINICA","Clínica","Clinica","IPS","Hospital"]);
}

function getMunicipioItem(item){
    return getCampo(item, ["MUNICIPIO","Municipio","Ciudad"]);
}

function getTipoMuerteItem(item){
    return getCampo(item, ["TIPO_MUERTE","Tipo Muerte","Tipo de Muerte"]);
}

function getCementerioItem(item){
    return getCampo(item, ["CEMENTERIO","Cementerio"]);
}

function getDestinoFinalItem(item){
    return getCampo(item, ["TIPO_DESTINO_FINAL","Tipo Destino Final","Destino Final"]);
}

function getFechaOrdenPlanItem(item){
    return getCampo(item, ["FECHA DE LA ORDEN","Fecha de la orden","FECHA_ORDEN","Fecha Orden"]);
}

function getOrdenPlanItem(item){
    return getCampo(item, ["ORDEN SERVICIO FUNERARIO","ORDEN_SERVICIO_FUNERARIO","Orden Servicio Funerario","Orden Servicio"]);
}

function getPlanFallecidoItem(item){
    return getCampo(item, ["PLAN","Plan"]);
}

function getTiempoAfiliacionPlanItem(item){
    return getCampo(item, ["TIEMPO AFILIACION DEL SER QUERIDO FALLECIDO","TIEMPO AFILIACIÓN DEL SER QUERIDO FALLECIDO","Tiempo Afiliacion","Tiempo Afiliación","TIEMPO_AFILIACION"]);
}

function getEdadPlanItem(item){
    return getCampo(item, ["EDAD","Edad"]);
}

function getTipoAfiliacionPlanItem(item){
    return getCampo(item, ["TIPO DE AFILIACION","TIPO DE AFILIACIÓN","Tipo de afiliacion","Tipo de afiliación","TIPO_AFILIACION"]);
}

function getNumeroContratoPlanItem(item){
    return getCampo(item, ["NUMERO DEL CONTRATO","NÚMERO DEL CONTRATO","Numero del contrato","Número del contrato","NUMERO_CONTRATO"]);
}

function getFallecidoPlanItem(item){
    return getCampo(item, ["FALLECIDO","SER QUERIDO","NOMBRE DEL FALLECIDO","NOMBRE"]);
}

function getValorServicioItem(item){
    return getCampo(item, ["VALOR SERVICIO","Valor Servicio","VALOR_SERVICIO"]);
}

function getValorExcedenteItem(item){
    return getCampo(item, ["VALOR EXCEDENTE","Valor Excedente","VALOR_EXCEDENTE"]);
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

function detectarDelimitador(texto){
    const primeraLinea = String(texto || "").split(/\r?\n/).find(linea => linea.trim()) || "";
    const tabs = (primeraLinea.match(/\t/g) || []).length;
    const commas = (primeraLinea.match(/,/g) || []).length;
    const semis = (primeraLinea.match(/;/g) || []).length;

    if(tabs >= commas && tabs >= semis) return "\t";
    if(semis > commas) return ";";
    return ",";
}

function parseTablaTexto(texto){
    const contenido = String(texto || "").trim();
    if(!contenido) return [];

    const delimitador = detectarDelimitador(contenido);
    const filas = [];
    let fila = [];
    let celda = "";
    let dentroComillas = false;

    for(let i = 0; i < contenido.length; i++){
        const char = contenido[i];
        const siguiente = contenido[i + 1];

        if(char === '"' && dentroComillas && siguiente === '"'){
            celda += '"';
            i++;
            continue;
        }

        if(char === '"'){
            dentroComillas = !dentroComillas;
            continue;
        }

        if(char === delimitador && !dentroComillas){
            fila.push(celda.trim());
            celda = "";
            continue;
        }

        if((char === "\n" || char === "\r") && !dentroComillas){
            if(char === "\r" && siguiente === "\n") i++;
            fila.push(celda.trim());
            if(fila.some(valor => String(valor).trim() !== "")) filas.push(fila);
            fila = [];
            celda = "";
            continue;
        }

        celda += char;
    }

    fila.push(celda.trim());
    if(fila.some(valor => String(valor).trim() !== "")) filas.push(fila);

    return convertirArrayAObjetos(filas);
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


function parametrosBaseDashboard(){
    return [
        {Tipo:"SEDE", Nombre:"Monteria", Valor:219133881},
        {Tipo:"GESTOR", Nombre:"Fernando Argel", Valor:25000000},
        {Tipo:"GESTOR", Nombre:"Osvaldo Ramos", Valor:25000000},
        {Tipo:"GESTOR", Nombre:"Carlos Lopez", Valor:25000000},
        {Tipo:"GESTOR", Nombre:"Alexis Ayazo", Valor:25000000},
        {Tipo:"GESTOR", Nombre:"Wendy Cordero", Valor:7000000},
        {Tipo:"META_CATEGORIA", Nombre:"PARTICULAR", Valor:69090369},
        {Tipo:"META_CATEGORIA", Nombre:"RED", Valor:127371072},
        {Tipo:"META_CATEGORIA", Nombre:"EXCEDENTES", Valor:22672440},
        {Tipo:"META_EXCEDENTE", Nombre:"CARTELES", Valor:136560},
        {Tipo:"META_EXCEDENTE", Nombre:"ARREGLOS FLORALES", Valor:4727400},
        {Tipo:"META_EXCEDENTE", Nombre:"VELACION", Valor:4564800},
        {Tipo:"META_EXCEDENTE", Nombre:"SERVICIO DE BUS", Valor:510000},
        {Tipo:"META_EXCEDENTE", Nombre:"TRASLADOS", Valor:1835280},
        {Tipo:"META_EXCEDENTE", Nombre:"HABITOS", Valor:214800},
        {Tipo:"META_EXCEDENTE", Nombre:"EXCEDENTES POR COFRES", Valor:9558000},
        {Tipo:"META_EXCEDENTE", Nombre:"PREPARACIONES", Valor:60000},
        {Tipo:"META_EXCEDENTE", Nombre:"OTROS SERVICIOS ADICIONALES", Valor:1068600}
    ];
}

function procesarParametros(datos){
    PARAMETROS = {
        gestor:{},
        categoria:{},
        excedente:{}
    };

    const fuenteParametros = [...parametrosBaseDashboard(), ...(Array.isArray(datos) ? datos : [])];

    fuenteParametros.filter(esFilaParametro).forEach(item => {
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

    if(categoria.includes("PLAN") || categoria.includes("PREVISION") || categoria.includes("PREVISIÓN")) return "PLAN";
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
    const valorServicio = toNumber(getValorServicioItem(item));
    const valorExcedente = toNumber(getValorExcedenteItem(item));
    const valorBase = toNumber(getValorItem(item));
    const valorOriginal = (valorServicio + valorExcedente) > 0 ? valorServicio + valorExcedente : valorBase;
    const tipoServicio = String(getTipoServicioItem(item) || "").trim();

    const row = {
        id:item.id || cryptoRandom(),
        origen,
        raw:item,
        fecha,
        fechaTexto:getFechaItem(item),
        valorOriginal,
        valorServicio,
        valorExcedente,
        ordenServicio:String(getOrdenServicioItem(item) || "").trim(),
        gestor:String(getGestorItem(item) || "").trim(),
        categoria:String(getCategoriaItem(item) || "").trim(),
        servicio:String(getServicioItem(item) || tipoServicio || "").trim(),
        tipoServicio,
        sede:String(getSedeItem(item) || "").trim(),
        clinica:String(getClinicaItem(item) || "").trim(),
        municipio:String(getMunicipioItem(item) || "").trim(),
        tipoMuerte:String(getTipoMuerteItem(item) || "").trim(),
        cementerio:String(getCementerioItem(item) || "").trim(),
        destinoFinal:String(getDestinoFinalItem(item) || "").trim(),
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
    const existe = nombres => nombres.some(req => columnas.some(c => normalizarLlave(c) === normalizarLlave(req)));
    const faltantes = [];

    if(!existe(["Fecha","FECHA"])) faltantes.push("FECHA");
    if(!existe(["Gestor","GESTOR"])) faltantes.push("GESTOR");
    if(!existe(["Tipo_Homenaje","TIPO_HOMENAJE"])) faltantes.push("TIPO_HOMENAJE");
    if(!existe(["Tipo_Excedente","TIPO_EXCEDENTE","TIPO_SERVICIO_TIPOSRV"])) faltantes.push("TIPO_EXCEDENTE / TIPO_SERVICIO_TIPOSRV");
    if(!existe(["Valor","VALOR","VALOR SERVICIO","Valor Servicio","VALOR_EXCEDENTE","VALOR EXCEDENTE"])) faltantes.push("VALOR SERVICIO / VALOR EXCEDENTE");
    if(!existe(["Sede","SEDE"])) faltantes.push("SEDE");

    return {
        ok:datos.length > 0 && faltantes.length === 0,
        mensaje:datos.length === 0 ? "Sin registros API" : faltantes.length ? "Columnas incompletas" : "API válida",
        registros:datos.length,
        columnas,
        faltantes
    };
}

function textoTiempoDesdeDias(dias){
    const totalDias = Math.max(Math.round(toNumber(dias)), 0);
    const meses = Math.floor(totalDias / 30.4375);
    const anios = Math.floor(meses / 12);
    const mesesRestantes = meses % 12;
    const diasRestantes = Math.max(Math.round(totalDias - (meses * 30.4375)), 0);

    let texto = "";
    if(anios > 0) texto += `${anios} año${anios === 1 ? "" : "s"}`;
    if(mesesRestantes > 0) texto += `${texto ? ", " : ""}${mesesRestantes} mes${mesesRestantes === 1 ? "" : "es"}`;
    if(!texto) texto = `${totalDias} día${totalDias === 1 ? "" : "s"}`;
    if(texto && anios === 0 && mesesRestantes > 0 && diasRestantes > 0) texto += `, ${diasRestantes} día${diasRestantes === 1 ? "" : "s"}`;
    return texto;
}

function clasificarDiasAfiliado(dias){
    const d = toNumber(dias);
    if(d <= 0) return "REVISAR";
    if(d < 90) return "MENOS DE 3 MESES";
    if(d < 180) return "3 A 6 MESES";
    if(d < 365) return "6 A 12 MESES";
    if(d < 1095) return "1 A 3 AÑOS";
    if(d < 1825) return "3 A 5 AÑOS";
    return "MÁS DE 5 AÑOS";
}

function parseTiempoAfiliacionTexto(valor){
    const original = String(valor || "").trim();
    if(!original) return {valido:false, dias:0, texto:"Sin tiempo", clasificacion:"REVISAR"};

    const texto = normalizarTexto(original).replace(/ANIOS/g,"AÑOS").replace(/ANO/g,"AÑO");
    let dias = 0;
    const numero = patron => {
        const m = texto.match(patron);
        return m ? toNumber(m[1]) : 0;
    };

    dias += numero(/(\d+(?:[\.,]\d+)?)\s*AÑOS?/) * 365;
    dias += numero(/(\d+(?:[\.,]\d+)?)\s*MESES?/) * 30.4375;
    dias += numero(/(\d+(?:[\.,]\d+)?)\s*DIAS?/) || numero(/(\d+(?:[\.,]\d+)?)\s*DÍAS?/);

    if(dias <= 0){
        const soloNumero = texto.match(/(\d+(?:[\.,]\d+)?)/);
        if(soloNumero) dias = toNumber(soloNumero[1]);
    }

    dias = Math.max(Math.round(dias), 0);
    return {
        valido:dias > 0,
        dias,
        meses:Math.floor(dias / 30.4375),
        anios:Math.floor((dias / 30.4375) / 12),
        texto:dias > 0 ? textoTiempoDesdeDias(dias) : original,
        clasificacion:clasificarDiasAfiliado(dias),
        textoOriginal:original
    };
}

function normalizarFallecidoPlan(item, index=0){
    const fechaOrden = parseFecha(getFechaOrdenPlanItem(item));
    const orden = String(getOrdenPlanItem(item) || "").trim();
    const contrato = String(getNumeroContratoPlanItem(item) || "").trim();
    const plan = String(getPlanFallecidoItem(item) || "").trim();
    const fallecido = String(getFallecidoPlanItem(item) || "").trim();
    const tiempoTexto = String(getTiempoAfiliacionPlanItem(item) || "").trim();
    const tiempo = parseTiempoAfiliacionTexto(tiempoTexto);

    return {
        id:`sheet_plan_${normalizarLlave(orden || index)}_${normalizarLlave(contrato || plan || index)}`,
        origen:"FALLECIDOS PLANES",
        fallecido:fallecido || (orden ? `Orden ${orden}` : `Registro ${index + 1}`),
        ordenServicio:orden,
        contrato:contrato || plan || orden,
        numeroContrato:contrato,
        plan,
        sede:"",
        fechaOrden:fechaOrden ? fechaISO(fechaOrden) : String(getFechaOrdenPlanItem(item) || ""),
        fechaAfiliacion:"",
        fechaFallecimiento:fechaOrden ? fechaISO(fechaOrden) : "",
        tiempoAfiliacionTexto:tiempoTexto,
        tiempoAfiliacionDias:tiempo.dias,
        edad:String(getEdadPlanItem(item) || "").trim(),
        tipoAfiliacion:String(getTipoAfiliacionPlanItem(item) || "").trim(),
        observacion:"Cargado desde hoja FALLECIDOS PLANES"
    };
}

async function cargarFallecidosPlanesRemotos(){
    try{
        const response = await fetch(GOOGLE_SHEET_FALLECIDOS_PLANES_CSV_URL, { cache:"no-store" });
        if(!response.ok) throw new Error(`HTTP ${response.status}`);
        const texto = await response.text();
        const datos = parseTablaTexto(texto);
        return datos
            .map((item,index) => normalizarFallecidoPlan(item,index))
            .filter(item => item.ordenServicio || item.numeroContrato || item.tiempoAfiliacionTexto || item.fechaOrden);
    }catch(error){
        console.warn("No se pudo cargar la hoja FALLECIDOS PLANES.", error);
        return [];
    }
}


async function cargarParametrosRemotos(){
    try{
        const response = await fetch(GOOGLE_SHEET_PARAMETROS_CSV_URL, { cache:"no-store" });
        if(!response.ok) throw new Error(`HTTP ${response.status}`);
        const texto = await response.text();
        const datos = parseTablaTexto(texto);
        return Array.isArray(datos) ? datos : [];
    }catch(error){
        console.warn("No se pudieron cargar los parámetros remotos. Se usan parámetros base.", error);
        return [];
    }
}

async function cargarDatosRemotos(){
    const fuentes = [
        {nombre:"Fuente principal", url:API_URL, tipo:"json"},
        {nombre:"Google Sheets CSV", url:GOOGLE_SHEET_CSV_URL, tipo:"csv"}
    ];

    const errores = [];

    for(const fuente of fuentes){
        try{
            const response = await fetch(fuente.url, { cache:"no-store" });
            if(!response.ok) throw new Error(`HTTP ${response.status}`);

            const texto = await response.text();
            const datos = fuente.tipo === "json" ? obtenerDatosDesdeApi(JSON.parse(texto)) : parseTablaTexto(texto);

            if(datos.length > 0){
                return {datos, fuente:fuente.nombre};
            }

            errores.push(`${fuente.nombre}: sin registros`);
        }catch(error){
            errores.push(`${fuente.nombre}: ${error.message}`);
        }
    }

    throw new Error(errores.join(" | "));
}

async function cargarDashboard(){
    setEstadoApi("cargando", "Cargando...");
    showLoading(true);

    try{
        const remoto = await cargarDatosRemotos();
        const datosCompletos = remoto.datos;
        const parametrosRemotos = await cargarParametrosRemotos();
        DATASET_FALLECIDOS_PLANES = await cargarFallecidosPlanesRemotos();

        procesarParametros([...parametrosRemotos, ...datosCompletos]);

        const datosVentas = datosCompletos.filter(item => !esFilaParametro(item));
        DATASET_API = datosVentas;

        const normalApi = datosVentas.map(item => normalizarRegistro(item, "API"));
        const normalManual = cargarManuales();

        DATASET_NORMAL = [...normalApi, ...normalManual];
        API_STATUS = validarEstructuraApi(datosVentas);

        poblarFiltros();
        aplicarFiltrosYRender();

        setEstadoApi("ok", "Datos actualizados");
        toast("Dashboard actualizado correctamente.");

    }catch(error){
        console.error("Error al cargar API:", error);

        procesarParametros([]);
        const normalManual = cargarManuales();

        DATASET_API = [];
        DATASET_FALLECIDOS_PLANES = await cargarFallecidosPlanesRemotos();
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
        const texto = normalizarTexto(`${row.gestor} ${row.categoriaGerencial} ${row.categoria} ${row.servicio} ${row.sede} ${row.observacion} ${row.ordenServicio} ${row.clinica} ${row.municipio} ${row.tipoMuerte} ${row.cementerio} ${row.destinoFinal}`);
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

function anioReferenciaFiltros(){
    const f = obtenerFiltros();

    if(f.anio) return Number(f.anio);

    const fechaFin = f.fechaFin ? new Date(`${f.fechaFin}T00:00:00`) : null;
    if(fechaFin && !isNaN(fechaFin.getTime())) return fechaFin.getFullYear();

    const fechaInicio = f.fechaInicio ? new Date(`${f.fechaInicio}T00:00:00`) : null;
    if(fechaInicio && !isNaN(fechaInicio.getTime())) return fechaInicio.getFullYear();

    return new Date().getFullYear();
}

function subcategoriaParticular(row){
    if(normalizarTexto(row.categoriaGerencial) !== "PARTICULAR") return "";

    const texto = normalizarTexto(`${row.tipoServicio || ""} ${row.servicio || ""} ${row.categoria || ""}`);

    if(texto.includes("SOAT")) return "PARTICULAR SOAT";
    if(texto.includes("PENSION")) return "PARTICULAR PENSIONADO";
    if(texto.includes("EMPRESA")) return "PARTICULAR EMPRESA";
    if(texto.includes("PERSONA")) return "PARTICULAR PERSONA";

    const limpio = normalizarTexto(row.tipoServicio || row.servicio || row.categoria)
        .replace(/^PARTICULAR(ES)?\s*/,"")
        .replace(/^PARTICULAR\s*/,"")
        .trim();

    return limpio ? `PARTICULAR ${limpio}` : "PARTICULAR OTROS";
}

function agruparParticularesDetalle(rows){
    const obj = {
        "PARTICULAR SOAT":{nombre:"PARTICULAR SOAT", cantidad:0, valor:0},
        "PARTICULAR PENSIONADO":{nombre:"PARTICULAR PENSIONADO", cantidad:0, valor:0},
        "PARTICULAR PERSONA":{nombre:"PARTICULAR PERSONA", cantidad:0, valor:0},
        "PARTICULAR EMPRESA":{nombre:"PARTICULAR EMPRESA", cantidad:0, valor:0}
    };

    rows.forEach(row => {
        const nombre = subcategoriaParticular(row);
        if(!nombre) return;

        if(!obj[nombre]){
            obj[nombre] = {nombre, cantidad:0, valor:0};
        }

        obj[nombre].cantidad += 1;
        obj[nombre].valor += toNumber(row.valorVenta);
    });

    return obj;
}

function agruparClinicas(rows){
    const obj = {};

    rows.forEach(row => {
        const nombre = normalizarTexto(row.clinica) || "";
        if(!nombre) return;

        if(!obj[nombre]){
            obj[nombre] = {nombre, cantidad:0, valor:0};
        }

        obj[nombre].cantidad += 1;
        obj[nombre].valor += toNumber(row.valorVenta);
    });

    return obj;
}

function agruparDimension(rows, campo){
    const obj = {};

    rows.forEach(row => {
        const nombre = normalizarTexto(row[campo]) || "SIN REGISTRO";

        if(!obj[nombre]){
            obj[nombre] = {nombre, cantidad:0, valor:0};
        }

        obj[nombre].cantidad += toNumber(row.cantidadAtendida) || 1;
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
    setHtml("mejorGestor", mejorGestor ? primerNombreGestor(mejorGestor.nombre) : "-");
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

function crearChartBar(idCanvas, labels, data, label, titulo, horizontal=false, tipoValor="money", opciones={}){
    const canvas = $(idCanvas);
    if(!canvas || typeof Chart === "undefined") return;

    registrarPluginGraficas();
    destruirChart(idCanvas);

    opciones = opciones || {};
    const etiquetas = Array.isArray(labels) ? labels : [];
    const etiquetasVisibles = etiquetas.map(etiqueta => etiquetaGraficaVisible(etiqueta, titulo, label));
    const valores = Array.isArray(data) ? data.map(v => toNumber(v)) : [];
    const metas = Array.isArray(opciones.metas) ? opciones.metas.map(v => toNumber(v)) : [];
    const totalReferencia = toNumber(opciones.total) || valores.reduce((acc,v) => acc + Math.abs(toNumber(v)), 0);

    const maxDato = Math.max(...valores.map(v => Math.abs(toNumber(v))), 0);
    const maxMeta = Math.max(...metas.map(v => Math.abs(toNumber(v))), 0);
    const maxValue = Math.max(maxDato, maxMeta, 0);
    const cantidad = etiquetas.length;
    const alto = horizontal ? Math.min(Math.max(430, cantidad * 56 + 165), 1180) : 420;
    const barraGruesa = horizontal ? Math.min(46, Math.max(34, Math.floor((alto - 160) / Math.max(cantidad,1) * .82))) : 54;
    const labelStyle = chartValueLabelStyle();
    const contenedor = canvas.parentElement;

    canvas.setAttribute("height", String(alto));
    canvas.style.setProperty("height", `${alto}px`, "important");
    contenedor?.style.setProperty("min-height", `${alto + 96}px`);
    contenedor?.style.setProperty("height", "auto", "important");
    contenedor?.classList.add("chart-card-enhanced", "chart-card-readable");

    const formatearEtiquetaBarra = (value, ctx) => {
        const i = ctx.dataIndex;
        const valor = toNumber(value);
        const meta = toNumber(metas[i]);
        const valorTexto = formatChartValue(valor, tipoValor);

        if(meta > 0){
            const pct = (valor / meta) * 100;
            const estado = estadoMetaGrafica(pct);
            return horizontal
                ? `${valorTexto} | ${pct.toFixed(1)}% | ${estado}`
                : [valorTexto, `${pct.toFixed(1)}%`, estado];
        }

        if(totalReferencia > 0 && opciones.mostrarParticipacion !== false){
            const pct = (Math.abs(valor) / totalReferencia) * 100;
            const estado = opciones.estadoSinMeta || "Sin meta";
            return horizontal
                ? `${valorTexto} | ${pct.toFixed(1)}% part. | ${estado}`
                : [valorTexto, `${pct.toFixed(1)}% part.`, estado];
        }

        return horizontal ? `${valorTexto} | Sin meta` : [valorTexto, "Sin meta"];
    };

    charts[idCanvas] = new Chart(canvas, {
        type:"bar",
        data:{
            labels:etiquetasVisibles,
            datasets:[{
                label:opciones.legendLabel || label,
                data:valores,
                backgroundColor:"rgba(20, 184, 105, .96)",
                borderColor:"rgba(187,247,208,.95)",
                borderWidth:1.2,
                borderRadius:horizontal ? 11 : 13,
                barThickness:barraGruesa,
                maxBarThickness:horizontal ? 50 : 62,
                minBarLength:horizontal ? 22 : 9,
                barPercentage:.96,
                categoryPercentage:.90
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            resizeDelay:0,
            indexAxis:horizontal ? "y" : "x",
            interaction:{mode:"nearest", axis:horizontal ? "y" : "x", intersect:false},
            hover:{mode:"nearest", intersect:false},
            layout:{padding:horizontal ? {left:8,right:310,top:16,bottom:18} : {left:10,right:42,top:36,bottom:14}},
            plugins:{
                title:{display:true,text:titulo,color:chartTextColor(),font:{weight:"900",size:isDarkChartTheme()?16:15},padding:{bottom:20}},
                legend:{display:true,position:"top",labels:{color:chartTextColor(),boxWidth:13,font:{weight:"900",size:isDarkChartTheme()?12:11}}},
                tooltip:{
                    callbacks:{
                        title:items => items?.[0]?.label || "-",
                        label:ctx => {
                            const valor = toNumber(ctx.parsed[horizontal ? "x" : "y"]);
                            const meta = toNumber(metas[ctx.dataIndex]);
                            const lineas = [`${ctx.dataset.label}: ${formatChartValue(valor, tipoValor)}`];
                            if(meta > 0){
                                const pct = (valor / meta) * 100;
                                lineas.push(`Meta: ${formatChartValue(meta, tipoValor)}`);
                                lineas.push(`Cumplimiento: ${pct.toFixed(1)}%`);
                                lineas.push(`Estado: ${estadoMetaGrafica(pct)}`);
                            }else if(totalReferencia > 0){
                                lineas.push(`Participación: ${((Math.abs(valor)/totalReferencia)*100).toFixed(1)}%`);
                                lineas.push(`Estado: ${opciones.estadoSinMeta || "Sin meta configurada"}`);
                            }
                            return lineas;
                        }
                    }
                },
                datalabels:{
                    display:ctx => Math.abs(toNumber(ctx.dataset.data[ctx.dataIndex])) > 0,
                    anchor:"end",
                    align:horizontal ? "right" : "top",
                    offset:horizontal ? 12 : 8,
                    clamp:false,
                    clip:false,
                    color:labelStyle.color,
                    backgroundColor:labelStyle.backgroundColor,
                    borderColor:labelStyle.borderColor,
                    borderWidth:1,
                    borderRadius:8,
                    padding:{top:4,right:8,bottom:4,left:8},
                    font:{size:horizontal ? 11 : 10,weight:"900"},
                    formatter:formatearEtiquetaBarra
                }
            },
            scales:horizontal ? {
                y:{
                    ticks:{color:chartTextColor(),font:{size:isDarkChartTheme()?12:11,weight:"900"},autoSkip:false,padding:9},
                    grid:{color:chartGridColor()}
                },
                x:{
                    beginAtZero:true,
                    suggestedMax:maxValue>0?maxValue*1.34:undefined,
                    grid:{display:true,color:chartGridColor()},
                    ticks:{color:chartTextColor(),font:{size:isDarkChartTheme()?11:10,weight:"850"},callback:value => tipoValor === "money" ? formatNumber(value) : formatChartValue(value, tipoValor)}
                }
            } : {
                y:{
                    beginAtZero:true,
                    suggestedMax:maxValue>0?maxValue*1.22:undefined,
                    ticks:{color:chartTextColor(),font:{size:isDarkChartTheme()?11:10,weight:"850"},callback:value => tipoValor === "money" ? formatNumber(value) : formatChartValue(value, tipoValor)},
                    grid:{color:chartGridColor()}
                },
                x:{
                    ticks:{color:chartTextColor(),font:{size:isDarkChartTheme()?11:10,weight:"850"},autoSkip:false,maxRotation:22,minRotation:0},
                    grid:{display:false}
                }
            }
        }
    });

    requestAnimationFrame(() => {
        charts[idCanvas]?.resize();
        charts[idCanvas]?.update("none");
    });
}

function crearChartLine(idCanvas, labels, datasets, titulo, tipoValor="money"){
    const canvas = $(idCanvas);
    if(!canvas || typeof Chart === "undefined") return;

    registrarPluginGraficas();
    destruirChart(idCanvas);

    charts[idCanvas] = new Chart(canvas, {
        type:"line",
        data:{labels,datasets},
        options:{
            responsive:true,
            maintainAspectRatio:false,
            plugins:{
                title:{display:true,text:titulo,color:chartTextColor(),font:{weight:"900",size:isDarkChartTheme()?15:14}},
                legend:{display:true,position:"top",labels:{color:chartTextColor(),boxWidth:12,font:{weight:"800",size:isDarkChartTheme()?12:11}}},
                tooltip:{callbacks:{label:ctx => `${ctx.dataset.label}: ${formatChartValue(ctx.parsed.y, tipoValor)}`}},
                datalabels:{display:false}
            },
            scales:{
                y:{beginAtZero:true,ticks:{color:chartTextColor(),font:{size:isDarkChartTheme()?11:10,weight:"800"}},grid:{color:chartGridColor()}},
                x:{grid:{display:false},ticks:{color:chartTextColor(),font:{size:isDarkChartTheme()?11:10,weight:"800"},maxRotation:0}}
            }
        }
    });
}

function crearChartDoughnut(idCanvas, labels, data, titulo, tipoValor="money"){
    const canvas = $(idCanvas);
    if(!canvas || typeof Chart === "undefined") return;

    registrarPluginGraficas();
    destruirChart(idCanvas);

    const labelStyle = chartValueLabelStyle();
    charts[idCanvas] = new Chart(canvas, {
        type:"doughnut",
        data:{
            labels,
            datasets:[{
                data,
                backgroundColor:["rgba(37,99,235,.95)","rgba(0,166,81,.95)","rgba(245,158,11,.95)","rgba(100,116,139,.95)"],
                borderColor:isDarkChartTheme()?"rgba(15,23,42,.92)":"#ffffff",
                borderWidth:2
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            plugins:{
                title:{display:true,text:titulo,color:chartTextColor(),font:{weight:"900",size:isDarkChartTheme()?15:14}},
                legend:{display:true,position:"top",labels:{color:chartTextColor(),boxWidth:12,font:{weight:"800",size:isDarkChartTheme()?12:11}}},
                tooltip:{callbacks:{
                    label:ctx => {
                        const total = (ctx.dataset.data || []).reduce((acc,v) => acc + toNumber(v), 0);
                        const pct = total > 0 ? (toNumber(ctx.parsed) / total) * 100 : 0;
                        return [`${ctx.label}: ${formatChartValue(ctx.parsed, tipoValor)}`, `Participación: ${pct.toFixed(1)}%`];
                    }
                }},
                datalabels:{
                    display:ctx => Math.abs(toNumber(ctx.dataset.data[ctx.dataIndex])) > 0,
                    color:labelStyle.color,
                    backgroundColor:labelStyle.backgroundColor,
                    borderColor:labelStyle.borderColor,
                    borderWidth:1,
                    borderRadius:7,
                    padding:{top:2,right:5,bottom:2,left:5},
                    textStrokeColor:"transparent",
                    textStrokeWidth:0,
                    font:{size:9,weight:"900"},
                    formatter:(value, ctx) => {
                        const total = (ctx.dataset.data || []).reduce((acc,v) => acc + toNumber(v), 0);
                        const pct = total > 0 ? (toNumber(value) / total) * 100 : 0;
                        return [formatChartValue(value, tipoValor), `${pct.toFixed(1)}%`];
                    }
                }
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
        "Meta vs Venta Real",
        false,
        "money",
        {metas:[META_RANGO_ACTUAL, META_RANGO_ACTUAL], legendLabel:"Valor | % cumplimiento | Estado", mostrarParticipacion:false}
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
        {label:"Venta mensual", data:ventas, borderColor:"#bbf7d0", backgroundColor:"rgba(187,247,208,.16)", fill:true, tension:.3},
        {label:"Meta mensual", data:metas, borderColor:"#fbbf24", borderDash:[8,6], fill:false, pointRadius:0}
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

    const particulares = Object.values(agruparParticularesDetalle(DATASET_FILTRADO)).sort((a,b) => b.valor - a.valor || b.cantidad - a.cantidad);
    const totalParticulares = particulares.reduce((acc,item) => acc + item.valor, 0);
    const tbodyParticulares = document.querySelector("#tablaParticularesDetalle tbody");

    if(tbodyParticulares){
        tbodyParticulares.innerHTML = particulares.length ? particulares.map(item => {
            const participacion = totalParticulares > 0 ? (item.valor / totalParticulares) * 100 : 0;

            return `
                <tr>
                    <td><strong>${escapeHtml(item.nombre)}</strong></td>
                    <td>${formatNumber(item.cantidad)}</td>
                    <td>${formatMoney(item.valor)}</td>
                    <td>${participacion.toFixed(1)}%</td>
                </tr>
            `;
        }).join("") : `<tr><td colspan="4">Sin particulares registrados</td></tr>`;
    }

    crearChartBar(
        "graficoParticularesDetalle",
        particulares.slice(0,12).map(item => item.nombre),
        particulares.slice(0,12).map(item => item.valor),
        "Venta",
        "Particulares por tipo de servicio",
        true,
        "money",
        {total:totalParticulares, legendLabel:"Venta | % participación"}
    );

    const clinicas = Object.values(agruparClinicas(DATASET_FILTRADO)).sort((a,b) => b.cantidad - a.cantidad || b.valor - a.valor);
    const totalClinicas = clinicas.reduce((acc,item) => acc + item.cantidad, 0);
    const tbodyClinicas = document.querySelector("#tablaClinicas tbody");

    if(tbodyClinicas){
        tbodyClinicas.innerHTML = clinicas.length ? clinicas.slice(0,30).map(item => {
            const participacion = totalClinicas > 0 ? (item.cantidad / totalClinicas) * 100 : 0;

            return `
                <tr>
                    <td><strong>${escapeHtml(item.nombre)}</strong></td>
                    <td>${formatNumber(item.cantidad)}</td>
                    <td>${formatMoney(item.valor)}</td>
                    <td>${participacion.toFixed(1)}%</td>
                </tr>
            `;
        }).join("") : `<tr><td colspan="4">Sin clínicas registradas</td></tr>`;
    }

    crearChartBar(
        "graficoClinicas",
        clinicas.slice(0,15).map(item => item.nombre),
        clinicas.slice(0,15).map(item => item.cantidad),
        "Reportes",
        "Clínicas que más reportan homenajes",
        true,
        "number",
        {total:totalClinicas, legendLabel:"Reportes | % participación"}
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
                        <td title="${escapeHtml(g.nombre)}"><strong>${primerNombreGestor(g.nombre)}</strong></td>
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

    const gestoresTop = gestores.slice(0,15);
    const metasGestoresGrafico = gestoresTop.map(g => {
        const metaConfig = metaGestorMensual(g.nombre);
        return metaConfig > 0 ? metaConfig * MESES_EQUIVALENTES_ACTUAL : (cantidadGestores > 0 ? META_RANGO_ACTUAL / cantidadGestores : 0);
    });

    crearChartBar(
        "graficoGestores",
        gestoresTop.map(g => primerNombreGestor(g.nombre)),
        gestoresTop.map(g => g.valor),
        "Ventas",
        "Ranking de gestores",
        true,
        "money",
        {metas:metasGestoresGrafico, total:gestoresTop.reduce((acc,g)=>acc+toNumber(g.valor),0), legendLabel:"Venta | % cumplimiento | Estado"}
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

    const excedentesTop = excedentes.slice(0,15);
    crearChartBar(
        "graficoExcedentes",
        excedentesTop.map(x => x.nombre),
        excedentesTop.map(x => x.valor),
        "Ventas",
        "Excedentes por valor",
        true,
        "money",
        {metas:excedentesTop.map(x => metaExcedenteMensual(x.nombre) * MESES_EQUIVALENTES_ACTUAL), total:totalExcedentes, legendLabel:"Venta | % cumplimiento | Estado"}
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

    const f = obtenerFiltros();
    const anio = anioReferenciaFiltros();
    const meses = Array.from({length:12}, (_,i) => i + 1);
    const labels = meses.map(m => nombreMes(m).slice(0,3));
    const ventasMensuales = meses.map(m => sumar(DATASET_NORMAL.filter(row =>
        row.fecha &&
        row.fecha.getFullYear() === anio &&
        row.fecha.getMonth() + 1 === m &&
        coincideFiltrosNoFecha(row, f)
    )));
    const ventasAcumuladas = [];
    const metas = [];
    let acumuladoVenta = 0;

    ventasMensuales.forEach((venta, index) => {
        acumuladoVenta += venta;
        ventasAcumuladas.push(acumuladoVenta);
        metas.push(metaMensualTotal() * (index + 1));
    });

    crearChartLine("graficoMetas", labels, [
        {label:"Producción acumulada", data:ventasAcumuladas, borderColor:"#006b3f", backgroundColor:"rgba(0,107,63,.14)", fill:true, tension:.25},
        {label:"Meta acumulada", data:metas, borderColor:"#fbbf24", borderDash:[8,6], fill:false, pointRadius:3, tension:.25}
    ], `Producción vs meta acumulada ${anio}`);
}

function renderCumplimientoMensual(){
    const f = obtenerFiltros();
    const anio = anioReferenciaFiltros();
    const meses = Array.from({length:12}, (_,i) => i + 1);
    const labels = meses.map(m => `${nombreMes(m)} ${anio}`);
    const ventas = meses.map(m => sumar(DATASET_NORMAL.filter(row =>
        row.fecha &&
        row.fecha.getFullYear() === anio &&
        row.fecha.getMonth() + 1 === m &&
        coincideFiltrosNoFecha(row, f)
    )));
    const metas = labels.map(() => metaMensualTotal());

    crearChartLine("graficoCumplimientoMensual", labels, [
        {label:"Venta", data:ventas, borderColor:"#bbf7d0", backgroundColor:"rgba(187,247,208,.16)", fill:true, tension:.3},
        {label:"Meta", data:metas, borderColor:"#fbbf24", borderDash:[8,6], fill:false, pointRadius:0}
    ], `Cumplimiento mensual ${anio}`);

    const tbody = document.querySelector("#tablaCumplimientoMensual tbody");
    if(tbody){
        tbody.innerHTML = labels.map((k, i) => {
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
        }).join("");
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
        {label:String(anioActual), data:ventasActual, borderColor:"#bbf7d0", backgroundColor:"rgba(187,247,208,.16)", fill:true, tension:.3},
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

    const paretoTop = data.slice(0,15);
    const metasParetoGrafico = paretoTop.map(item => {
        const metaConfig = metaGestorMensual(item.nombre);
        return metaConfig > 0 ? metaConfig * MESES_EQUIVALENTES_ACTUAL : (gestores.length > 0 ? META_RANGO_ACTUAL / gestores.length : 0);
    });

    crearChartBar(
        "graficoParetoGestores",
        paretoTop.map(x => primerNombreGestor(x.nombre)),
        paretoTop.map(x => x.valor),
        "Venta",
        "Pareto por gestor",
        true,
        "money",
        {metas:metasParetoGrafico, total, legendLabel:"Venta | % cumplimiento | Estado"}
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
        {label:String(anioActual), data:kwhActual, borderColor:"#bbf7d0", backgroundColor:"rgba(187,247,208,.16)", fill:true, tension:.3},
        {label:String(anioAnterior), data:kwhAnterior, borderColor:"#2563eb", backgroundColor:"rgba(37,99,235,.10)", fill:true, tension:.3}
    ], "Consumo kWh año actual vs anterior", "kwh");

    crearChartBar("graficoEnergiaCosto", labels, costoActual, "Costo", `Costo mensual ${anioActual}`, false, "money", {total:costoTotal, legendLabel:"Costo | % participación"});

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

function opcionesEstadoVacacion(actual){
    const estados = ["VENCIDA","PENDIENTE","PROGRAMADA","DISFRUTADA"];
    return estados.map(estado => `<option value="${estado}" ${estado === actual ? "selected" : ""}>${estado}</option>`).join("");
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
        "Estado vacaciones",
        "number"
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
                    <td>
                        ${badgeVacacion(estado)}
                        <select class="inline-select" onchange="actualizarEstadoVacacion('${escapeHtml(item.id)}', this.value)">
                            ${opcionesEstadoVacacion(estado)}
                        </select>
                    </td>
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

function actualizarEstadoVacacion(id, estado){
    const data = cargarVacaciones().map(item => item.id === id ? {...item, estado:normalizarTexto(estado)} : item);
    guardarColeccionLocal("vacacionesPersonal", data);
    renderVacaciones();
    toast("Estado de vacaciones actualizado.");
}

window.eliminarVacacion = eliminarVacacion;
window.actualizarEstadoVacacion = actualizarEstadoVacacion;

function limpiarVacaciones(){
    if(!confirm("¿Deseas eliminar todos los registros de vacaciones?")) return;
    guardarColeccionLocal("vacacionesPersonal", []);
    renderVacaciones();
    toast("Vacaciones eliminadas.");
}

function datosAgendaIniciales(){
    const anio = new Date().getFullYear();
    return [
        {id:"act_preoperacional", fecha:`${anio}-01-02`, hora:"06:00", titulo:"Verificar reporte preoperacional de vehículos", frecuencia:"DIARIA", estado:"PENDIENTE", responsable:"Coordinación Homenajes", detalle:"Control diario antes de entregar turno."},
        {id:"act_bitacora", fecha:`${anio}-01-02`, hora:"07:00", titulo:"Revisar bitácora de parque automotor", frecuencia:"DIARIA", estado:"EN PROCESO", responsable:"Coordinación Homenajes", detalle:"Confirmar novedades y entrega de llaves."},
        {id:"act_implementos", fecha:`${anio}-06-20`, hora:"09:00", titulo:"Seguimiento implementos de velación en casa", frecuencia:"MENSUAL", estado:"PENDIENTE", responsable:"Gestores", detalle:"Validar elementos vigentes, por recoger y recogidos."},
        {id:"act_residuos", fecha:`${anio}-07-01`, hora:"10:00", titulo:"Capacitación residuos y desinfección", frecuencia:"ANUAL", estado:"CUMPLIDA", responsable:"Talento Humano / Homenajes", detalle:"Refuerzo obligatorio para el equipo operativo."},
        {id:"act_auditoria", fecha:`${anio}-11-10`, hora:"08:00", titulo:"Preparación auditoría interna", frecuencia:"ANUAL", estado:"PENDIENTE", responsable:"Coordinación Homenajes", detalle:"Revisar R-15, R-56, RH1 y soportes operativos."}
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
    const valor = normalizarTexto(estado);

    if(valor === "FINIQUITADA") return `<span class="badge badge-ok">Finiquitada</span>`;
    if(valor === "CUMPLIDA") return `<span class="badge badge-ok">Cumplida</span>`;
    if(valor === "EN PROCESO") return `<span class="badge badge-info">En proceso</span>`;

    return `<span class="badge badge-warning">Pendiente</span>`;
}

function opcionesEstadoActividad(actual){
    const estadoActual = normalizarTexto(actual) || "PENDIENTE";
    return ["PENDIENTE","EN PROCESO","CUMPLIDA","FINIQUITADA"]
        .map(estado => `<option value="${estado}" ${estado === estadoActual ? "selected" : ""}>${estado}</option>`)
        .join("");
}

function horaActividad(item){
    return String(item.hora || "08:00").slice(0,5);
}

function formatoHoraAgenda(hora){
    const [h,m] = String(hora || "08:00").split(":").map(Number);
    const periodo = h >= 12 ? "PM" : "AM";
    const hora12 = h % 12 || 12;
    return `${hora12}:${String(m || 0).padStart(2,"0")} ${periodo}`;
}

function renderAgenda(){
    const data = cargarAgenda().sort((a,b) => String(a.fecha).localeCompare(String(b.fecha)));
    const anio = AGENDA_CURSOR.getFullYear();
    const mes = AGENDA_CURSOR.getMonth() + 1;
    const actividadesMes = data.filter(item => actividadEnMes(item, anio, mes));
    const pendientes = data.filter(item => normalizarTexto(item.estado) === "PENDIENTE").length;
    const enProceso = data.filter(item => normalizarTexto(item.estado) === "EN PROCESO").length;
    const cumplidas = data.filter(item => normalizarTexto(item.estado) === "CUMPLIDA").length;
    const finiquitadas = data.filter(item => normalizarTexto(item.estado) === "FINIQUITADA").length;
    const hoy = data.filter(actividadEsHoy).length;

    setHtml("kpiAgendaPendientes", pendientes);
    setHtml("kpiAgendaFiniquitadas", finiquitadas);
    setHtml("kpiAgendaHoy", hoy);
    setHtml("kpiAgendaMes", actividadesMes.length);
    setHtml("textoAgenda", `
        Agenda activa con <strong>${pendientes}</strong> pendientes, <strong>${enProceso}</strong> en proceso,
        <strong>${cumplidas}</strong> cumplidas y <strong>${finiquitadas}</strong> finiquitadas.
        Para <strong>${nombreMes(mes)} ${anio}</strong> hay <strong>${actividadesMes.length}</strong> actividades programadas.
    `);
    setHtml("agendaMesTitulo", `${nombreMes(mes)} ${anio}`);

    renderCalendarioAgenda(data, anio, mes);
    renderListaAgenda(actividadesMes);
    renderDiaAgenda(data);
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
        if(iso === AGENDA_DIA_SELECCIONADO) clases.push("selected");
        if(actividadesDia.length) clases.push("has-events");

        celdas.push(`
            <div class="${clases.join(" ")}" onclick="seleccionarDiaAgenda('${iso}')">
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
                <p>${escapeHtml(item.fecha)} · ${formatoHoraAgenda(horaActividad(item))} · ${escapeHtml(item.frecuencia)} · ${escapeHtml(item.responsable || "Sin responsable")}</p>
            </div>
            ${badgeActividad(item.estado)}
        </div>
    `).join("");
}

function renderDiaAgenda(data){
    const contenedor = $("agendaDiaHoras");
    if(!contenedor) return;

    const fecha = AGENDA_DIA_SELECCIONADO || fechaISO(new Date());
    const actividadesDia = data
        .filter(item => item.fecha === fecha)
        .sort((a,b) => horaActividad(a).localeCompare(horaActividad(b)));

    setHtml("agendaDiaTitulo", `Agenda diaria · ${fecha}`);

    const filas = [];

    for(let hora = 6; hora <= 19; hora++){
        const horaTexto = `${String(hora).padStart(2,"0")}:00`;
        const actividadesHora = actividadesDia.filter(item => Number(horaActividad(item).split(":")[0]) === hora);

        filas.push(`
            <div class="agenda-hour-row">
                <div class="agenda-hour-label">${formatoHoraAgenda(horaTexto)}</div>
                <div class="agenda-hour-content">
                    ${actividadesHora.length ? actividadesHora.map(item => `
                        <div class="agenda-hour-activity">
                            <div>
                                <strong>${escapeHtml(item.titulo)}</strong>
                                <p>${escapeHtml(item.responsable || "Sin responsable")} · ${escapeHtml(item.frecuencia || "ÚNICA")} · ${escapeHtml(item.detalle || "")}</p>
                            </div>
                            <select class="inline-select" onchange="actualizarEstadoActividad('${escapeHtml(item.id)}', this.value)">
                                ${opcionesEstadoActividad(item.estado)}
                            </select>
                        </div>
                    `).join("") : `<span class="mini-text">Sin actividad programada</span>`}
                </div>
            </div>
        `);
    }

    contenedor.innerHTML = filas.join("");
}

function renderTablaAgenda(data){
    const tbody = document.querySelector("#tablaAgenda tbody");
    if(!tbody) return;

    tbody.innerHTML = data.length ? data.map(item => `
        <tr>
            <td>${escapeHtml(item.fecha || "-")}</td>
            <td>${formatoHoraAgenda(horaActividad(item))}</td>
            <td>${escapeHtml(item.titulo || "-")}</td>
            <td>${escapeHtml(item.frecuencia || "-")}</td>
            <td>${escapeHtml(item.responsable || "-")}</td>
            <td>
                ${badgeActividad(item.estado)}
                <select class="inline-select" onchange="actualizarEstadoActividad('${escapeHtml(item.id)}', this.value)">
                    ${opcionesEstadoActividad(item.estado)}
                </select>
            </td>
            <td>${escapeHtml(item.detalle || "-")}</td>
            <td>
                <button class="action-btn" onclick="alternarEstadoActividad('${escapeHtml(item.id)}')">Cambiar</button>
                <button class="danger-btn" onclick="eliminarActividad('${escapeHtml(item.id)}')">Eliminar</button>
            </td>
        </tr>
    `).join("") : `<tr><td colspan="8">Sin actividades registradas</td></tr>`;
}

function agregarActividad(){
    const item = {
        id:cryptoRandom(),
        fecha:$("actFecha")?.value || "",
        hora:$("actHora")?.value || "08:00",
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

    AGENDA_DIA_SELECCIONADO = item.fecha;
    AGENDA_CURSOR = parseFecha(item.fecha) || AGENDA_CURSOR;

    ["actFecha","actTitulo","actFrecuencia","actEstado","actResponsable","actDetalle"].forEach(id => setValue(id, ""));
    setValue("actHora", "08:00");
    setValue("actEstado", "PENDIENTE");
    renderAgenda();
    toast("Actividad agregada.");
}

function alternarEstadoActividad(id){
    const ciclo = ["PENDIENTE","EN PROCESO","CUMPLIDA","FINIQUITADA"];
    const data = cargarAgenda().map(item => {
        if(item.id !== id) return item;
        const actual = normalizarTexto(item.estado) || "PENDIENTE";
        const siguiente = ciclo[(ciclo.indexOf(actual) + 1) % ciclo.length] || "PENDIENTE";
        return {...item, estado:siguiente};
    });
    guardarColeccionLocal("agendaHomenajes", data);
    renderAgenda();
}

function actualizarEstadoActividad(id, estado){
    const data = cargarAgenda().map(item => item.id === id ? {...item, estado:normalizarTexto(estado)} : item);
    guardarColeccionLocal("agendaHomenajes", data);
    renderAgenda();
    toast("Estado de actividad actualizado.");
}

function eliminarActividad(id){
    const data = cargarAgenda().filter(item => item.id !== id);
    guardarColeccionLocal("agendaHomenajes", data);
    renderAgenda();
    toast("Actividad eliminada.");
}

window.alternarEstadoActividad = alternarEstadoActividad;
window.actualizarEstadoActividad = actualizarEstadoActividad;
window.eliminarActividad = eliminarActividad;

function seleccionarDiaAgenda(fecha){
    AGENDA_DIA_SELECCIONADO = fecha;
    const seleccion = parseFecha(fecha);

    if(seleccion){
        AGENDA_CURSOR = new Date(seleccion.getFullYear(), seleccion.getMonth(), 1);
        setValue("actFecha", fecha);
    }

    renderAgenda();
}

window.seleccionarDiaAgenda = seleccionarDiaAgenda;

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
    const locales = cargarColeccionLocal("tiempoAfiliadoFallecidos", datosTiempoAfiliadoIniciales())
        .map(item => ({...item, origen:item.origen || "LOCAL"}));
    const remotos = (DATASET_FALLECIDOS_PLANES || []).map(item => ({...item, origen:"FALLECIDOS PLANES"}));
    const vistos = new Set();

    return [...remotos, ...locales].filter(item => {
        const key = String(item.id || `${item.ordenServicio || ""}_${item.contrato || ""}_${item.fallecido || ""}`);
        if(vistos.has(key)) return false;
        vistos.add(key);
        return true;
    });
}

function calcularTiempoAfiliado(item){
    if(item.tiempoAfiliacionDias || item.tiempoAfiliacionTexto){
        const tiempo = item.tiempoAfiliacionDias
            ? parseTiempoAfiliacionTexto(`${item.tiempoAfiliacionDias} días`)
            : parseTiempoAfiliacionTexto(item.tiempoAfiliacionTexto);

        if(tiempo.valido){
            return {
                valido:true,
                dias:tiempo.dias,
                meses:tiempo.meses,
                anios:tiempo.anios,
                texto:tiempo.textoOriginal || tiempo.texto,
                clasificacion:tiempo.clasificacion
            };
        }
    }

    const inicio = parseFecha(item.fechaAfiliacion);
    const fin = parseFecha(item.fechaFallecimiento || item.fechaOrden);

    if(!inicio || !fin || fin < inicio){
        return {valido:false,dias:0,meses:0,anios:0,texto:"Fecha inválida",clasificacion:"REVISAR"};
    }

    const dias = diasEntre(inicio, fin);
    const meses = Math.floor(dias / 30.4375);
    const anios = Math.floor(meses / 12);

    return {
        valido:true,
        dias,
        meses,
        anios,
        texto:textoTiempoDesdeDias(dias),
        clasificacion:clasificarDiasAfiliado(dias)
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

    const origenSheet = resumen.enriquecidos.filter(item => item.origen === "FALLECIDOS PLANES").length;
    setHtml("textoTiempoAfiliado", `
        Se registran <strong>${resumen.enriquecidos.length}</strong> casos, de los cuales <strong>${origenSheet}</strong> provienen de la hoja <strong>FALLECIDOS PLANES</strong>.
        El promedio de permanencia vivo estando afiliado es de <strong>${formatNumber(resumen.promedioDias)} días</strong>.
        ${resumen.mayor ? `El mayor tiempo registrado corresponde a <strong>${escapeHtml(resumen.mayor.fallecido)}</strong> con <strong>${escapeHtml(resumen.mayor.tiempo.texto)}</strong>.` : ""}
    `);

    const labels = Object.keys(resumen.rangos);
    const data = labels.map(label => resumen.rangos[label]);
    crearChartBar("graficoTiempoAfiliado", labels, data, "Casos", "Casos por rango de permanencia", true, "number", {total:data.reduce((acc,v)=>acc+toNumber(v),0), legendLabel:"Casos | % participación"});

    const tbody = document.querySelector("#tablaTiempoAfiliado tbody");
    if(tbody){
        tbody.innerHTML = resumen.enriquecidos.length ? resumen.enriquecidos
            .sort((a,b) => b.tiempo.dias - a.tiempo.dias)
            .map(item => `
                <tr>
                    <td>${escapeHtml(item.ordenServicio || "-")}</td>
                    <td>${escapeHtml(item.contrato || item.numeroContrato || "-")}</td>
                    <td>${escapeHtml(item.plan || item.sede || "-")}</td>
                    <td>${escapeHtml(item.tipoAfiliacion || "-")}</td>
                    <td>${escapeHtml(item.edad || "-")}</td>
                    <td>${escapeHtml(item.fechaOrden || item.fechaFallecimiento || item.fechaAfiliacion || "-")}</td>
                    <td>${escapeHtml(item.tiempo.texto)}</td>
                    <td>${badgeTiempoAfiliado(item.tiempo.clasificacion)}</td>
                    <td>${item.origen === "FALLECIDOS PLANES" ? '<span class="badge badge-info">Google Sheet</span>' : `<button class="danger-btn" onclick="eliminarTiempoAfiliado('${escapeHtml(item.id)}')">Eliminar</button>`}</td>
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
    const agendaPendiente = agenda.filter(item => !["CUMPLIDA","FINIQUITADA"].includes(normalizarTexto(item.estado))).length;
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


function valorReporteFila(item, keys=["valor","venta","cantidad"]){
    for(const key of keys){
        if(item && item[key] !== undefined) return toNumber(item[key]);
    }
    return 0;
}

function renderPrintBarChart(titulo, rows, opciones={}){
    const datos = (Array.isArray(rows) ? rows : [])
        .map(item => ({
            nombre:String(item.nombre || item.categoria || item.label || "SIN REGISTRO"),
            valor:valorReporteFila(item, opciones.keys || ["valor","venta","cantidad"]),
            cantidad:toNumber(item.cantidad || item.registros || 0)
        }))
        .filter(item => item.valor > 0 || item.cantidad > 0)
        .sort((a,b) => b.valor - a.valor)
        .slice(0, opciones.limite || 10);

    if(!datos.length){
        return `
            <div class="print-chart">
                <h3>${escapeHtml(titulo)}</h3>
                <p>Sin información disponible para graficar.</p>
            </div>
        `;
    }

    const maximo = Math.max(...datos.map(item => item.valor), 1);
    const tipo = opciones.tipo || "money";
    const total = datos.reduce((acc,item) => acc + item.valor, 0) || 1;

    return `
        <div class="print-chart">
            <h3>${escapeHtml(titulo)}</h3>
            ${datos.map(item => {
                const pctBarra = Math.max((item.valor / maximo) * 100, 3);
                const pctTotal = (item.valor / total) * 100;
                const valorTexto = tipo === "number" ? formatNumber(item.valor) : formatMoney(item.valor);
                return `
                    <div class="print-chart-row">
                        <div class="print-chart-label">${escapeHtml(item.nombre)}</div>
                        <div class="print-chart-track">
                            <div class="print-chart-bar" style="width:${pctBarra.toFixed(2)}%"></div>
                        </div>
                        <div class="print-chart-value">
                            <strong>${valorTexto}</strong>
                            <span>${pctTotal.toFixed(1)}%</span>
                        </div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

function construirGraficasReporteEjecutivo(){
    const categorias = Object.values(agruparCategorias(DATASET_FILTRADO))
        .filter(item => categoriaGeneraVenta(item.categoria))
        .map(item => ({nombre:item.categoria, valor:item.valor, cantidad:item.cantidad}));

    const gestores = Object.values(agruparGestores(DATASET_FILTRADO))
        .map(item => ({nombre:item.nombre, valor:item.valor, cantidad:item.cantidad}));

    const excedentes = Object.values(agruparExcedentes(DATASET_FILTRADO))
        .map(item => ({nombre:item.nombre, valor:item.valor, cantidad:item.cantidad}));

    const clinicas = Object.values(agruparDimension(DATASET_FILTRADO, "clinica"))
        .map(item => ({nombre:item.nombre, valor:item.cantidad, cantidad:item.cantidad}));

    return `
        <h2>Gráficas ejecutivas</h2>
        ${renderPrintBarChart("Ventas por categoría", categorias, {limite:6, tipo:"money"})}
        ${renderPrintBarChart("Ranking de gestores por venta", gestores, {limite:10, tipo:"money"})}
        ${renderPrintBarChart("Excedentes por valor vendido", excedentes, {limite:10, tipo:"money"})}
        ${renderPrintBarChart("Clínicas con mayor reporte", clinicas, {limite:10, tipo:"number", keys:["valor","cantidad"]})}
    `;
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

        ${construirGraficasReporteEjecutivo()}

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
                    <th>Hora</th>
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
                        <td>${formatoHoraAgenda(horaActividad(item))}</td>
                        <td>${escapeHtml(item.titulo || "-")}</td>
                        <td>${escapeHtml(item.frecuencia || "-")}</td>
                        <td>${escapeHtml(item.responsable || "-")}</td>
                        <td>${escapeHtml(item.estado || "-")}</td>
                    </tr>
                `).join("") : `<tr><td colspan="6">Sin actividades registradas</td></tr>`}
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


function datosBaseReporte(){
    const filtrados = Array.isArray(DATASET_FILTRADO) ? DATASET_FILTRADO : [];
    const normales = Array.isArray(DATASET_NORMAL) ? DATASET_NORMAL : [];
    return filtrados.length ? filtrados : normales;
}

function nombreSeguroReporte(valor){
    const texto = String(valor || "").trim();
    return texto ? texto : "SIN REGISTRO";
}

function truncarPdf(texto, max=42){
    const t = String(texto || "");
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function agrupacionReporte(rows, campo, tipo="valor"){
    const mapa = {};
    rows.forEach(row => {
        const nombre = nombreSeguroReporte(typeof campo === "function" ? campo(row) : row[campo]);
        if(!mapa[nombre]) mapa[nombre] = {nombre, cantidad:0, valor:0};
        mapa[nombre].cantidad += toNumber(row.cantidadAtendida) || 1;
        mapa[nombre].valor += toNumber(row.valorVenta || 0);
    });

    const totalValor = Object.values(mapa).reduce((acc,item) => acc + item.valor, 0);
    const totalCantidad = Object.values(mapa).reduce((acc,item) => acc + item.cantidad, 0);

    return Object.values(mapa).map(item => ({
        ...item,
        porcentaje: tipo === "cantidad"
            ? (totalCantidad > 0 ? (item.cantidad / totalCantidad) * 100 : 0)
            : (totalValor > 0 ? (item.valor / totalValor) * 100 : 0)
    })).sort((a,b) => tipo === "cantidad" ? (b.cantidad - a.cantidad || b.valor - a.valor) : (b.valor - a.valor || b.cantidad - a.cantidad));
}

function agrupacionHomenajeExcedenteReporte(rows){
    return agrupacionReporte(rows, row => `${nombreSeguroReporte(row.categoriaGerencial || row.categoria)} - ${nombreSeguroReporte(row.servicio || row.tipoServicio)}`);
}

function filasCategoriasReporte(rows){
    const categorias = agruparCategorias(rows);
    return ["PARTICULAR","RED","EXCEDENTES","PLAN"].map(cat => {
        const data = categorias[cat] || {cantidad:0, valor:0};
        const genera = categoriaGeneraVenta(cat);
        const meta = genera ? metaCategoriaMensual(cat) * MESES_EQUIVALENTES_ACTUAL : 0;
        const pct = genera && meta > 0 ? (data.valor / meta) * 100 : 0;
        return {
            Categoria:cat,
            Cantidad:data.cantidad,
            Venta:genera ? data.valor : 0,
            Meta:meta,
            Cumplimiento:pct,
            Estado:genera ? textoEstado(pct) : "Solo cantidad"
        };
    });
}

function filasGestoresReporte(rows){
    const gestores = Object.values(agruparGestores(rows)).sort((a,b) => b.valor - a.valor);
    const cantidadGestores = gestores.filter(g => g.nombre !== "SIN GESTOR").length || 1;
    return gestores.map(g => {
        const metaConfig = metaGestorMensual(g.nombre);
        const meta = metaConfig > 0 ? metaConfig * MESES_EQUIVALENTES_ACTUAL : (META_RANGO_ACTUAL / cantidadGestores);
        const pct = meta > 0 ? (g.valor / meta) * 100 : 0;
        return {
            Gestor:g.nombre,
            Cantidad:g.cantidad,
            Venta:g.valor,
            Meta:meta,
            Cumplimiento:pct,
            Faltante:Math.max(meta - g.valor, 0),
            Estado:textoEstado(pct)
        };
    });
}

function filasExcedentesReporte(rows){
    return Object.values(agruparExcedentes(rows)).sort((a,b) => b.valor - a.valor).map(item => {
        const meta = metaExcedenteMensual(item.nombre) * MESES_EQUIVALENTES_ACTUAL;
        const pct = meta > 0 ? (item.valor / meta) * 100 : 0;
        return {
            Excedente:item.nombre,
            Cantidad:item.cantidad,
            Venta:item.valor,
            Meta:meta,
            Cumplimiento:pct,
            Estado:textoEstado(pct)
        };
    });
}

function dimensionesReporte(rows){
    return {
        categorias:filasCategoriasReporte(rows),
        gestores:filasGestoresReporte(rows),
        excedentes:filasExcedentesReporte(rows),
        homenaje:agrupacionHomenajeExcedenteReporte(rows),
        clinicas:agrupacionReporte(rows, "clinica", "cantidad"),
        municipios:agrupacionReporte(rows, "municipio", "cantidad"),
        tipoMuerte:agrupacionReporte(rows, "tipoMuerte", "cantidad"),
        cementerios:agrupacionReporte(rows, "cementerio", "cantidad"),
        destinoFinal:agrupacionReporte(rows, "destinoFinal", "cantidad")
    };
}

function prepararDatosReporte(){
    if(!ULTIMO_RESUMEN || !ULTIMA_META_INFO){
        aplicarFiltrosYRender();
    }

    const rows = datosBaseReporte();
    const resumen = ULTIMO_RESUMEN || calcularResumen(rows);
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (resumen.total / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - resumen.total, 0);
    const operativo = obtenerResumenOperativoReporte();
    const dims = dimensionesReporte(rows);

    return {rows, resumen, cumplimiento, faltante, operativo, dims};
}

function agregarCabeceraPdf(doc, titulo, subtitulo){
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(0, 79, 42);
    doc.rect(0, 0, pageWidth, 18, "F");
    doc.setTextColor(255,255,255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(titulo, 12, 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(subtitulo, pageWidth - 12, 11, {align:"right"});
    doc.setTextColor(15,23,42);
}

function verificarPaginaPdf(doc, y, requerido=34){
    const h = doc.internal.pageSize.getHeight();
    if(y + requerido <= h - 12) return y;
    doc.addPage();
    agregarCabeceraPdf(doc, "Reporte Gerencial de Homenajes", `Página ${doc.internal.getNumberOfPages()}`);
    return 27;
}

function cardPdf(doc, x, y, w, h, titulo, valor, detalle=""){
    doc.setDrawColor(219,229,239);
    doc.setFillColor(248,250,252);
    doc.roundedRect(x, y, w, h, 3, 3, "FD");
    doc.setTextColor(100,116,139);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(String(titulo), x + 4, y + 6);
    doc.setTextColor(15,23,42);
    doc.setFontSize(13);
    doc.text(String(valor), x + 4, y + 15);
    if(detalle){
        doc.setTextColor(100,116,139);
        doc.setFontSize(6.8);
        doc.text(String(detalle), x + 4, y + h - 4);
    }
}

function tablaPdf(doc, titulo, columnas, filas, y, opciones={}){
    y = verificarPaginaPdf(doc, y, 38);
    doc.setTextColor(0,79,42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(titulo, 12, y);
    y += 4;

    const body = filas.map(row => columnas.map(col => {
        const value = typeof col.value === "function" ? col.value(row) : row[col.key];
        return String(value ?? "-");
    }));
    const head = [columnas.map(col => col.label)];

    if(typeof doc.autoTable === "function"){
        doc.autoTable({
            startY:y,
            head,
            body:body.length ? body : [[`Sin información para ${titulo}`]],
            theme:"grid",
            styles:{font:"helvetica",fontSize:7,cellPadding:1.7,overflow:"linebreak",lineColor:[226,232,240],lineWidth:.1,textColor:[15,23,42]},
            headStyles:{fillColor:[0,127,63],textColor:[255,255,255],fontStyle:"bold"},
            alternateRowStyles:{fillColor:[248,250,252]},
            margin:{left:12,right:12},
            tableWidth:"auto",
            didDrawPage:() => agregarCabeceraPdf(doc, "Reporte Gerencial de Homenajes", `Página ${doc.internal.getNumberOfPages()}`),
            ...opciones
        });
        return doc.lastAutoTable.finalY + 8;
    }

    const pageWidth = doc.internal.pageSize.getWidth();
    const x0 = 12;
    const tableW = pageWidth - 24;
    const colW = tableW / columnas.length;
    doc.setFontSize(6.8);
    doc.setFillColor(0,127,63);
    doc.setTextColor(255,255,255);
    doc.rect(x0, y, tableW, 7, "F");
    columnas.forEach((col,i) => doc.text(col.label, x0 + i * colW + 1.5, y + 4.6, {maxWidth:colW-2}));
    y += 7;
    doc.setTextColor(15,23,42);
    const rowsToDraw = body.length ? body : [[`Sin información para ${titulo}`]];
    rowsToDraw.slice(0,26).forEach(row => {
        y = verificarPaginaPdf(doc, y, 7);
        columnas.forEach((_,i) => doc.text(String(row[i] || "-"), x0 + i * colW + 1.5, y + 4.4, {maxWidth:colW-2}));
        doc.setDrawColor(226,232,240);
        doc.line(x0, y + 6, x0 + tableW, y + 6);
        y += 6;
    });
    return y + 8;
}

function graficoBarrasPdf(doc, titulo, data, y, tipo="money", limite=10){
    const pageWidth = doc.internal.pageSize.getWidth();
    y = verificarPaginaPdf(doc, y, 58);
    const x = 12;
    const w = pageWidth - 24;
    const rows = data.slice(0, limite);
    const max = Math.max(...rows.map(r => tipo === "cantidad" ? toNumber(r.cantidad) : toNumber(r.valor)), 1);
    const chartH = 12 + rows.length * 6.5;

    doc.setFillColor(247,251,249);
    doc.setDrawColor(219,229,239);
    doc.roundedRect(x, y, w, chartH, 3, 3, "FD");
    doc.setTextColor(0,79,42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(titulo, x + 4, y + 6);

    let yy = y + 12;
    rows.forEach(item => {
        const valor = tipo === "cantidad" ? toNumber(item.cantidad) : toNumber(item.valor);
        const barW = Math.max(2, (valor / max) * (w - 94));
        doc.setTextColor(15,23,42);
        doc.setFontSize(6.7);
        doc.text(truncarPdf(item.nombre || item.Categoria || item.Gestor || item.Excedente, 35), x + 4, yy + 3.7, {maxWidth:52});
        doc.setFillColor(230,244,237);
        doc.roundedRect(x + 60, yy, w - 98, 4.4, 2, 2, "F");
        doc.setFillColor(0,143,70);
        doc.roundedRect(x + 60, yy, barW, 4.4, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.7);
        doc.text(tipo === "cantidad" ? formatNumber(valor) : formatMoney(valor), x + 64 + barW, yy + 3.5, {maxWidth:32});
        doc.setFont("helvetica", "normal");
        yy += 6.5;
    });

    return y + chartH + 8;
}


/* =========================================================
   EXPORTACIONES ROBUSTAS 20260716
   PDF / EXCEL / CSV / JSON / PNG con descarga segura
   ========================================================= */

const EXPORT_CDN = {
    jspdf:[
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
        "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"
    ],
    autotable:[
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js",
        "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js"
    ],
    xlsx:[
        "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
        "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
    ],
    html2canvas:[
        "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
        "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"
    ]
};

function setEstadoExportacion(mensaje, tipo=""){
    setHtml("estadoReporte", mensaje);
    const estado = $("estadoReporte");
    if(estado){
        estado.classList.remove("estado-exportacion-ok", "estado-exportacion-error");
        if(tipo === "ok") estado.classList.add("estado-exportacion-ok");
        if(tipo === "error") estado.classList.add("estado-exportacion-error");
    }
}

function cargarScriptUnaVez(id, urls){
    return new Promise((resolve, reject) => {
        const existente = document.getElementById(id);
        if(existente){
            if(existente.dataset.loaded === "true"){
                resolve(true);
                return;
            }
            existente.addEventListener("load", () => resolve(true), {once:true});
            existente.addEventListener("error", () => reject(new Error(`No cargó ${id}`)), {once:true});
            return;
        }

        const lista = Array.isArray(urls) ? urls.slice() : [urls];
        const intentar = () => {
            const src = lista.shift();
            if(!src){
                reject(new Error(`No se pudo cargar la librería ${id}`));
                return;
            }

            const script = document.createElement("script");
            script.id = id;
            script.src = src;
            script.async = true;
            script.onload = () => {
                script.dataset.loaded = "true";
                resolve(true);
            };
            script.onerror = () => {
                script.remove();
                intentar();
            };
            document.head.appendChild(script);
        };
        intentar();
    });
}

async function garantizarJsPDF(){
    if(!(window.jspdf?.jsPDF || window.jsPDF)){
        await cargarScriptUnaVez("lib-jspdf-dashboard", EXPORT_CDN.jspdf);
    }
    const jsPDFCtor = window.jspdf?.jsPDF || window.jsPDF;
    if(!jsPDFCtor) throw new Error("jsPDF no está disponible");

    const prueba = new jsPDFCtor({orientation:"landscape", unit:"mm", format:"a4"});
    if(typeof prueba.autoTable !== "function"){
        await cargarScriptUnaVez("lib-jspdf-autotable-dashboard", EXPORT_CDN.autotable);
    }
    return window.jspdf?.jsPDF || window.jsPDF;
}

async function garantizarXLSX(){
    if(typeof XLSX === "undefined"){
        await cargarScriptUnaVez("lib-xlsx-dashboard", EXPORT_CDN.xlsx);
    }
    if(typeof XLSX === "undefined") throw new Error("XLSX no está disponible");
    return XLSX;
}

async function garantizarHtml2Canvas(){
    if(typeof html2canvas === "undefined"){
        await cargarScriptUnaVez("lib-html2canvas-dashboard", EXPORT_CDN.html2canvas);
    }
    if(typeof html2canvas === "undefined") throw new Error("html2canvas no está disponible");
    return html2canvas;
}

function descargarBlobSeguro(nombre, blob){
    if(!blob || !(blob instanceof Blob)) throw new Error("Archivo inválido para descarga");

    if(window.navigator && typeof window.navigator.msSaveOrOpenBlob === "function"){
        window.navigator.msSaveOrOpenBlob(blob, nombre);
        return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.rel = "noopener";
    a.target = "_self";
    a.style.position = "fixed";
    a.style.left = "-9999px";
    a.style.top = "-9999px";
    document.body.appendChild(a);
    a.dispatchEvent(new MouseEvent("click", {bubbles:true, cancelable:true, view:window}));

    setTimeout(() => {
        try{ a.remove(); }catch(_e){}
        try{ URL.revokeObjectURL(url); }catch(_e){}
    }, 2500);
}

function fechaArchivoReporte(){
    const f = new Date();
    return `${f.getFullYear()}${String(f.getMonth()+1).padStart(2,"0")}${String(f.getDate()).padStart(2,"0")}_${String(f.getHours()).padStart(2,"0")}${String(f.getMinutes()).padStart(2,"0")}`;
}

function htmlReporteFallback(){
    const {rows, resumen, cumplimiento, faltante, dims} = prepararDatosReporte();
    const titulo = localStorage.getItem("dashboardTitulo") || "REPORTE GERENCIAL DE HOMENAJES";
    const rango = ULTIMA_META_INFO ? `${formatFechaProfesional(ULTIMA_META_INFO.inicio)} a ${formatFechaProfesional(ULTIMA_META_INFO.fin)}` : "Rango seleccionado";
    const filas = dims.categorias.map(r => `<tr><td>${escapeHtml(r.Categoria)}</td><td>${formatNumber(r.Cantidad)}</td><td>${formatMoney(r.Venta)}</td><td>${formatMoney(r.Meta)}</td><td>${toNumber(r.Cumplimiento).toFixed(1)}%</td></tr>`).join("");
    const gestores = dims.gestores.slice(0,12).map(r => `<tr><td>${escapeHtml(r.Gestor)}</td><td>${formatNumber(r.Cantidad)}</td><td>${formatMoney(r.Venta)}</td><td>${toNumber(r.Cumplimiento).toFixed(1)}%</td></tr>`).join("");

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${escapeHtml(titulo)}</title>
    <style>
        body{font-family:Arial,sans-serif;color:#0f172a;margin:28px;background:#fff;}
        h1{color:#004f2a;margin-bottom:4px;} h2{color:#004f2a;margin-top:26px;}
        .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0;}
        .card{border:1px solid #dbe5ef;border-radius:12px;padding:14px;background:#f8fafc;}
        .card small{display:block;color:#64748b;font-weight:bold;margin-bottom:5px}.card strong{font-size:20px;}
        table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px;} th{background:#008f46;color:#fff;text-align:left;} th,td{border:1px solid #dbe5ef;padding:7px;}
        .nota{background:#f0fdf4;border-left:5px solid #008f46;padding:12px;border-radius:10px;margin:15px 0;}
    </style></head><body>
    <h1>${escapeHtml(titulo)}</h1><p><strong>Rango:</strong> ${escapeHtml(rango)} | <strong>Generado:</strong> ${new Date().toLocaleString("es-CO")}</p>
    <div class="nota">Venta real ${formatMoney(resumen.total)}, cumplimiento ${cumplimiento.toFixed(1)}%, faltante ${formatMoney(faltante)}. Registros analizados: ${formatNumber(rows.length)}.</div>
    <div class="kpis"><div class="card"><small>Meta</small><strong>${formatMoney(META_RANGO_ACTUAL)}</strong></div><div class="card"><small>Venta</small><strong>${formatMoney(resumen.total)}</strong></div><div class="card"><small>Cumplimiento</small><strong>${cumplimiento.toFixed(1)}%</strong></div><div class="card"><small>Faltante</small><strong>${formatMoney(faltante)}</strong></div></div>
    <h2>Categorías</h2><table><thead><tr><th>Categoría</th><th>Cantidad</th><th>Venta</th><th>Meta</th><th>%</th></tr></thead><tbody>${filas || "<tr><td colspan='5'>Sin datos</td></tr>"}</tbody></table>
    <h2>Gestores</h2><table><thead><tr><th>Gestor</th><th>Cantidad</th><th>Venta</th><th>%</th></tr></thead><tbody>${gestores || "<tr><td colspan='4'>Sin datos</td></tr>"}</tbody></table>
    <p style="margin-top:30px;color:#64748b;font-size:11px;">Archivo HTML de respaldo generado por el dashboard cuando el navegador no permitió crear PDF nativo.</p>
    </body></html>`;
}

function descargarHtmlRespaldoReporte(){
    const html = htmlReporteFallback();
    descargarBlobSeguro(`reporte_gerencial_homenajes_${fechaArchivoReporte()}.html`, new Blob([html], {type:"text/html;charset=utf-8"}));
}

async function exportarPDF(){
    showLoading(true);
    setEstadoExportacion("Generando PDF ejecutivo...", "");

    try{
        const jsPDFCtor = await garantizarJsPDF();
        const {rows, resumen, cumplimiento, faltante, operativo, dims} = prepararDatosReporte();
        const titulo = localStorage.getItem("dashboardTitulo") || "REPORT JORGE KORF4N";
        const subtitulo = "Informe gerencial de homenajes, metas, operación y análisis";
        const responsable = localStorage.getItem("dashboardResponsable") || "George Korfan";
        const rango = ULTIMA_META_INFO ? `${formatFechaProfesional(ULTIMA_META_INFO.inicio)} a ${formatFechaProfesional(ULTIMA_META_INFO.fin)}` : "Rango seleccionado";

        const doc = new jsPDFCtor({orientation:"landscape", unit:"mm", format:"a4"});
        agregarCabeceraPdf(doc, titulo, subtitulo);

        doc.setTextColor(15,23,42);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.text("Reporte ejecutivo gerencial", 12, 30);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.text(`Generado: ${new Date().toLocaleString("es-CO")}   |   Rango: ${rango}   |   Responsable: ${responsable}`, 12, 36);

        const cardY = 43;
        cardPdf(doc, 12, cardY, 52, 24, "Meta del rango", formatMoney(META_RANGO_ACTUAL), `${formatNumber(MESES_EQUIVALENTES_ACTUAL,2)} meses equiv.`);
        cardPdf(doc, 68, cardY, 52, 24, "Venta real", formatMoney(resumen.total), `${cumplimiento.toFixed(1)}% de cumplimiento`);
        cardPdf(doc, 124, cardY, 52, 24, "Faltante", formatMoney(faltante), textoEstado(cumplimiento));
        cardPdf(doc, 180, cardY, 45, 24, "Registros", formatNumber(rows.length), "base analizada");
        cardPdf(doc, 229, cardY, 56, 24, "Plan", formatNumber(resumen.planCantidad || 0), "cantidad, no suma ventas");

        let y = 76;
        doc.setFillColor(240,253,244);
        doc.setDrawColor(187,247,208);
        doc.roundedRect(12, y, 273, 20, 3, 3, "FD");
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0,79,42);
        doc.setFontSize(10);
        doc.text("Lectura ejecutiva", 16, y + 6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(15,23,42);
        doc.setFontSize(8);
        doc.text(`La venta real del periodo es ${formatMoney(resumen.total)}, equivalente al ${cumplimiento.toFixed(1)}% de la meta. El faltante para cumplir es ${formatMoney(faltante)}.`, 16, y + 12, {maxWidth:260});
        doc.text(`Categoría líder: ${dims.categorias.slice().sort((a,b)=>b.Venta-a.Venta)[0]?.Categoria || "-"}. Gestor líder: ${dims.gestores[0]?.Gestor || "-"}. Clínica con mayor reporte: ${dims.clinicas[0]?.nombre || "-"}.`, 16, y + 17, {maxWidth:260});
        y += 30;

        y = graficoBarrasPdf(doc, "Ventas por categoría", dims.categorias.map(x => ({nombre:x.Categoria, valor:x.Venta, cantidad:x.Cantidad})), y, "money", 4);
        y = tablaPdf(doc, "Detalle por categoría", [
            {label:"Categoría", key:"Categoria"},
            {label:"Cantidad", value:r => formatNumber(r.Cantidad)},
            {label:"Venta", value:r => formatMoney(r.Venta)},
            {label:"Meta", value:r => formatMoney(r.Meta)},
            {label:"%", value:r => `${toNumber(r.Cumplimiento).toFixed(1)}%`},
            {label:"Estado", key:"Estado"}
        ], dims.categorias, y);

        doc.addPage();
        agregarCabeceraPdf(doc, titulo, "Análisis comercial");
        y = 28;
        y = graficoBarrasPdf(doc, "Ranking de gestores por venta", dims.gestores.map(x => ({nombre:x.Gestor, valor:x.Venta, cantidad:x.Cantidad})), y, "money", 10);
        y = tablaPdf(doc, "Top gestores", [
            {label:"Gestor", key:"Gestor"},
            {label:"Cant.", value:r => formatNumber(r.Cantidad)},
            {label:"Venta", value:r => formatMoney(r.Venta)},
            {label:"Meta", value:r => formatMoney(r.Meta)},
            {label:"%", value:r => `${toNumber(r.Cumplimiento).toFixed(1)}%`},
            {label:"Estado", key:"Estado"}
        ], dims.gestores.slice(0,12), y);

        doc.addPage();
        agregarCabeceraPdf(doc, titulo, "Análisis operativo y mercado");
        y = 28;
        y = graficoBarrasPdf(doc, "Tipo de homenaje / excedente", dims.homenaje, y, "money", 10);
        y = graficoBarrasPdf(doc, "Clínicas que más reportan", dims.clinicas, y, "cantidad", 10);
        y = tablaPdf(doc, "Clínicas principales", [
            {label:"Clínica", key:"nombre"},
            {label:"Reportes", value:r => formatNumber(r.cantidad)},
            {label:"Venta asociada", value:r => formatMoney(r.valor)},
            {label:"%", value:r => `${toNumber(r.porcentaje).toFixed(1)}%`}
        ], dims.clinicas.slice(0,12), y);

        doc.addPage();
        agregarCabeceraPdf(doc, titulo, "Municipios, muerte, cementerios y destino final");
        y = 28;
        y = tablaPdf(doc, "Municipios de atención", [
            {label:"Municipio", key:"nombre"},
            {label:"Atenciones", value:r => formatNumber(r.cantidad)},
            {label:"Promedio diario", value:r => formatNumber(r.cantidad / Math.max(DIAS_RANGO_ACTUAL,1),2)},
            {label:"Venta", value:r => formatMoney(r.valor)},
            {label:"%", value:r => `${toNumber(r.porcentaje).toFixed(1)}%`}
        ], dims.municipios.slice(0,14), y);
        y = tablaPdf(doc, "Tipo de muerte", [
            {label:"Tipo", key:"nombre"},
            {label:"Cantidad", value:r => formatNumber(r.cantidad)},
            {label:"Promedio diario", value:r => formatNumber(r.cantidad / Math.max(DIAS_RANGO_ACTUAL,1),2)},
            {label:"%", value:r => `${toNumber(r.porcentaje).toFixed(1)}%`}
        ], dims.tipoMuerte.slice(0,10), y);
        y = tablaPdf(doc, "Cementerios principales", [
            {label:"Cementerio", value:r => r.nombre},
            {label:"Servicios", value:r => formatNumber(r.cantidad)},
            {label:"Promedio mensual", value:r => formatNumber(r.cantidad / Math.max(MESES_EQUIVALENTES_ACTUAL,1),2)},
            {label:"Venta", value:r => formatMoney(r.valor)}
        ], dims.cementerios.slice(0,12), y);
        y = tablaPdf(doc, "Destino final", [
            {label:"Destino", value:r => r.nombre},
            {label:"Servicios", value:r => formatNumber(r.cantidad)},
            {label:"Promedio mensual", value:r => formatNumber(r.cantidad / Math.max(MESES_EQUIVALENTES_ACTUAL,1),2)},
            {label:"Venta", value:r => formatMoney(r.valor)}
        ], dims.destinoFinal.slice(0,12), y);

        doc.addPage();
        agregarCabeceraPdf(doc, titulo, "Operación interna");
        y = 28;
        y = tablaPdf(doc, "Control de energía", [
            {label:"Año", key:"anio"},
            {label:"Mes", value:r => nombreMes(r.mes)},
            {label:"kWh", value:r => formatNumber(r.kwh)},
            {label:"Costo", value:r => formatMoney(r.costo)},
            {label:"Observación", value:r => r.observacion || "-"}
        ], operativo.energiaActual.slice(0,12), y);
        y = tablaPdf(doc, "Vacaciones", [
            {label:"Colaborador", value:r => r.nombre || "-"},
            {label:"Cargo", value:r => r.cargo || "-"},
            {label:"Inicio", value:r => r.inicio || "-"},
            {label:"Fin", value:r => r.fin || "-"},
            {label:"Días", value:r => formatNumber(r.dias || 0)},
            {label:"Estado", value:r => estadoVacacion(r)}
        ], operativo.vacaciones.slice(0,16), y);
        y = tablaPdf(doc, "Tiempo afiliado", [
            {label:"Ser querido / referencia", value:r => r.fallecido || "-"},
            {label:"Orden", value:r => r.ordenServicio || "-"},
            {label:"Plan", value:r => r.plan || "-"},
            {label:"Tiempo", value:r => r.tiempo?.texto || "-"},
            {label:"Días", value:r => formatNumber(r.tiempo?.dias || 0)},
            {label:"Fuente", value:r => r.origen || "LOCAL"}
        ], operativo.tiempoAfiliado.enriquecidos.slice(0,16), y);

        const totalPages = doc.internal.getNumberOfPages();
        for(let i = 1; i <= totalPages; i++){
            doc.setPage(i);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.setTextColor(100,116,139);
            doc.text(`Página ${i} de ${totalPages}`, doc.internal.pageSize.getWidth() - 12, doc.internal.pageSize.getHeight() - 7, {align:"right"});
        }

        const blob = doc.output("blob");
        descargarBlobSeguro(`reporte_gerencial_homenajes_${fechaArchivoReporte()}.pdf`, blob);
        setEstadoExportacion("PDF generado correctamente. Revisa la carpeta de descargas del navegador.", "ok");
        toast("PDF generado correctamente.");
    }catch(error){
        console.error("Error generando PDF:", error);
        try{
            descargarHtmlRespaldoReporte();
            setEstadoExportacion("No se pudo crear PDF nativo. Se descargó un reporte HTML de respaldo.", "error");
            toast("Se descargó reporte HTML de respaldo.", "warning");
        }catch(errorFallback){
            console.error("Error generando respaldo HTML:", errorFallback);
            setEstadoExportacion("No se pudo generar el reporte. Revisa permisos de descarga del navegador.", "error");
            toast("No se pudo generar el reporte.", "error");
        }
    }finally{
        showLoading(false);
    }
}

function ajustarHojaExcel(ws, filas){
    const data = Array.isArray(filas) ? filas : [];
    const headers = data.length && !Array.isArray(data[0]) ? Object.keys(data[0]) : (Array.isArray(data[0]) ? data[0].map((_,i)=>`Col${i+1}`) : []);
    const widths = headers.map((h, i) => {
        let max = String(h).length;
        data.slice(0,200).forEach(row => {
            const value = Array.isArray(row) ? row[i] : row[h];
            max = Math.max(max, String(value ?? "").length);
        });
        return {wch:Math.min(Math.max(max + 2, 12), 42)};
    });
    ws["!cols"] = widths;
    if(ws["!ref"]) ws["!autofilter"] = {ref:ws["!ref"]};
}

function agregarHojaJson(wb, nombre, filas){
    const data = filas && filas.length ? filas : [{Mensaje:"Sin información disponible"}];
    const ws = XLSX.utils.json_to_sheet(data);
    ajustarHojaExcel(ws, data);
    XLSX.utils.book_append_sheet(wb, ws, nombre.substring(0,31));
}

function agregarHojaAoa(wb, nombre, filas){
    const ws = XLSX.utils.aoa_to_sheet(filas);
    ajustarHojaExcel(ws, filas);
    XLSX.utils.book_append_sheet(wb, ws, nombre.substring(0,31));
}

async function exportarExcel(){
    showLoading(true);
    setEstadoExportacion("Generando Excel organizado...", "");

    try{
        await garantizarXLSX();
        const {rows, resumen, cumplimiento, faltante, operativo, dims} = prepararDatosReporte();
        const wb = XLSX.utils.book_new();
        wb.Props = {
            Title:"Reporte gerencial de homenajes",
            Subject:"Dashboard Homenajes",
            Author:localStorage.getItem("dashboardResponsable") || "George Korfan",
            CreatedDate:new Date()
        };

        agregarHojaAoa(wb, "Resumen Ejecutivo", [
            ["REPORTE GERENCIAL DE HOMENAJES"],
            ["Generado", new Date().toLocaleString("es-CO")],
            ["Rango", ULTIMA_META_INFO ? `${formatFechaProfesional(ULTIMA_META_INFO.inicio)} a ${formatFechaProfesional(ULTIMA_META_INFO.fin)}` : "-"],
            [],
            ["Indicador", "Valor"],
            ["Meta del rango", META_RANGO_ACTUAL],
            ["Venta real", resumen.total],
            ["Cumplimiento", `${cumplimiento.toFixed(1)}%`],
            ["Faltante", faltante],
            ["Particular", resumen.particular],
            ["Red", resumen.red],
            ["Excedentes", resumen.excedentes],
            ["Plan cantidad", resumen.planCantidad || 0],
            ["Registros analizados", rows.length],
            ["Clínica líder", dims.clinicas[0]?.nombre || "-"],
            ["Municipio líder", dims.municipios[0]?.nombre || "-"],
            ["Cementerio líder", dims.cementerios[0]?.nombre || "-"],
            ["Destino final líder", dims.destinoFinal[0]?.nombre || "-"],
            ["Tipo muerte líder", dims.tipoMuerte[0]?.nombre || "-"]
        ]);

        agregarHojaJson(wb, "Categorias", dims.categorias.map(r => ({...r, Venta:Math.round(r.Venta), Meta:Math.round(r.Meta), Cumplimiento:`${toNumber(r.Cumplimiento).toFixed(1)}%`})));
        agregarHojaJson(wb, "Gestores", dims.gestores.map(r => ({...r, Venta:Math.round(r.Venta), Meta:Math.round(r.Meta), Faltante:Math.round(r.Faltante), Cumplimiento:`${toNumber(r.Cumplimiento).toFixed(1)}%`})));
        agregarHojaJson(wb, "Excedentes", dims.excedentes.map(r => ({...r, Venta:Math.round(r.Venta), Meta:Math.round(r.Meta), Cumplimiento:`${toNumber(r.Cumplimiento).toFixed(1)}%`})));
        agregarHojaJson(wb, "Homenaje Excedente", dims.homenaje.map(r => ({Tipo:r.nombre, Cantidad:r.cantidad, Venta:Math.round(r.valor), Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})));
        agregarHojaJson(wb, "Clinicas", dims.clinicas.map(r => ({Clinica:r.nombre, Reportes:r.cantidad, Venta_Asociada:Math.round(r.valor), Promedio_Diario:r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1), Promedio_Mensual:r.cantidad/Math.max(MESES_EQUIVALENTES_ACTUAL,1), Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})));
        agregarHojaJson(wb, "Municipios", dims.municipios.map(r => ({Municipio:r.nombre, Atenciones:r.cantidad, Venta_Asociada:Math.round(r.valor), Promedio_Diario:r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1), Promedio_Mensual:r.cantidad/Math.max(MESES_EQUIVALENTES_ACTUAL,1), Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})));
        agregarHojaJson(wb, "Tipo Muerte", dims.tipoMuerte.map(r => ({Tipo_Muerte:r.nombre, Cantidad:r.cantidad, Promedio_Diario:r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1), Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})));
        agregarHojaJson(wb, "Cementerios", dims.cementerios.map(r => ({Cementerio:r.nombre, Servicios:r.cantidad, Venta_Asociada:Math.round(r.valor), Promedio_Diario:r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1), Promedio_Mensual:r.cantidad/Math.max(MESES_EQUIVALENTES_ACTUAL,1), Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})));
        agregarHojaJson(wb, "Destino Final", dims.destinoFinal.map(r => ({Destino_Final:r.nombre, Servicios:r.cantidad, Venta_Asociada:Math.round(r.valor), Promedio_Diario:r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1), Promedio_Mensual:r.cantidad/Math.max(MESES_EQUIVALENTES_ACTUAL,1), Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})));

        agregarHojaJson(wb, "Datos Filtrados", rows.map(row => ({
            Origen:row.origen,
            Fecha:formatFechaProfesional(row.fecha, row.fechaTexto || ""),
            Orden_Servicio:row.ordenServicio,
            Gestor:row.gestor,
            Sede:row.sede,
            Categoria_Original:row.categoria,
            Categoria_Gerencial:row.categoriaGerencial,
            Tipo_Servicio:row.tipoServicio,
            Tipo_Excedente:row.servicio,
            Clinica:row.clinica,
            Municipio:row.municipio,
            Tipo_Muerte:row.tipoMuerte,
            Cementerio:row.cementerio,
            Destino_Final:row.destinoFinal,
            Cantidad:row.cantidadAtendida,
            Valor_Servicio:row.valorServicio,
            Valor_Excedente:row.valorExcedente,
            Valor_Venta:row.valorVenta,
            Genera_Venta:row.generaVenta ? "SI" : "NO"
        })));

        agregarHojaJson(wb, "Energia", operativo.energia.map(item => ({Año:item.anio, Mes:nombreMes(item.mes), Numero_Mes:Number(item.mes), kWh:toNumber(item.kwh), Costo:toNumber(item.costo), Observacion:item.observacion || ""})));
        agregarHojaJson(wb, "Vacaciones", operativo.vacaciones.map(item => ({Colaborador:item.nombre || "", Cargo:item.cargo || "", Fecha_Base:item.fechaBase || "", Inicio:item.inicio || "", Fin:item.fin || "", Dias:toNumber(item.dias || 0), Estado:estadoVacacion(item)})));
        agregarHojaJson(wb, "Agenda", operativo.agenda.map(item => ({Fecha:item.fecha || "", Hora:horaActividad(item), Actividad:item.titulo || "", Frecuencia:item.frecuencia || "", Responsable:item.responsable || "", Estado:item.estado || "", Detalle:item.detalle || ""})));
        agregarHojaJson(wb, "Tiempo Afiliado", operativo.tiempoAfiliado.enriquecidos.map(item => ({Fallecido:item.fallecido || "", Orden_Servicio:item.ordenServicio || "", Contrato:item.contrato || item.numeroContrato || "", Plan:item.plan || "", Tipo_Afiliacion:item.tipoAfiliacion || "", Edad:item.edad || "", Fecha_Orden:item.fechaOrden || "", Fecha_Afiliacion:item.fechaAfiliacion || "", Fecha_Fallecimiento:item.fechaFallecimiento || "", Tiempo_Texto:item.tiempo.texto, Dias:item.tiempo.dias, Clasificacion:item.tiempo.clasificacion, Fuente:item.origen || "LOCAL"})));

        const arrayBuffer = XLSX.write(wb, {bookType:"xlsx", type:"array"});
        const blob = new Blob([arrayBuffer], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
        descargarBlobSeguro(`dashboard_gerencial_homenajes_${fechaArchivoReporte()}.xlsx`, blob);
        setEstadoExportacion("Excel generado correctamente. Revisa la carpeta de descargas del navegador.", "ok");
        toast("Excel generado correctamente.");
    }catch(error){
        console.error("Error generando Excel:", error);
        try{
            exportarCSV();
            setEstadoExportacion("No se pudo crear Excel nativo. Se descargó CSV de respaldo.", "error");
            toast("Se descargó CSV de respaldo.", "warning");
        }catch(errorFallback){
            console.error("Error generando CSV de respaldo:", errorFallback);
            setEstadoExportacion("No se pudo generar Excel ni CSV. Revisa permisos del navegador.", "error");
            toast("No se pudo generar Excel.", "error");
        }
    }finally{
        showLoading(false);
    }
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
    const necesitaBom = String(tipo || "").includes("csv") || String(tipo || "").includes("text");
    const cuerpo = necesitaBom ? "\ufeff" + String(contenido ?? "") : String(contenido ?? "");
    const blob = new Blob([cuerpo], {type:tipo || "application/octet-stream"});
    descargarBlobSeguro(nombre, blob);
}


async function exportarImagenPNG(){
    showLoading(true);
    setEstadoExportacion("Generando imagen PNG del dashboard...", "");

    try{
        await garantizarHtml2Canvas();
        const vista = document.querySelector(".vista.active-view") || $("dashboard") || $("panelExportar");
        if(!vista) throw new Error("No se encontró vista activa para exportar imagen");

        document.body.classList.add("exporting-report");
        await new Promise(resolve => setTimeout(resolve, 180));
        redimensionarGraficos();
        await new Promise(resolve => setTimeout(resolve, 280));

        const fondoOscuro = document.body.classList.contains("theme-dark") || document.body.classList.contains("theme-slate") || document.body.classList.contains("dark-mode");
        const canvas = await html2canvas(vista, {
            backgroundColor: fondoOscuro ? "#020617" : "#ffffff",
            scale: Math.min(window.devicePixelRatio || 1.5, 2),
            useCORS:true,
            allowTaint:true,
            logging:false,
            scrollX:0,
            scrollY:0
        });

        await new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if(!blob){
                    reject(new Error("El navegador no generó la imagen"));
                    return;
                }
                descargarBlobSeguro(`dashboard_gerencial_${fechaArchivoReporte()}.png`, blob);
                resolve();
            }, "image/png", 0.95);
        });

        setEstadoExportacion("Imagen PNG generada correctamente. Revisa la carpeta de descargas.", "ok");
        toast("Imagen PNG generada correctamente.");
    }catch(error){
        console.error("Error generando imagen:", error);
        setEstadoExportacion("No se pudo generar la imagen. Prueba en Chrome/Edge y permite descargas.", "error");
        toast("No se pudo generar la imagen.", "error");
    }finally{
        document.body.classList.remove("exporting-report");
        showLoading(false);
    }
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

    if(seccion === "cumplimiento" && typeof renderCumplimientoMensual === "function"){
        setTimeout(renderCumplimientoMensual, 80);
    }
    if(seccion === "tiempoAfiliado" && typeof renderTiempoAfiliado === "function"){
        setTimeout(renderTiempoAfiliado, 80);
    }
    if(typeof prepararTablasOrdenables === "function"){
        setTimeout(prepararTablasOrdenables, 120);
    }

    setTimeout(redimensionarGraficos, 180);
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
    setTimeout(() => {
        aplicarFiltrosYRender();
        Object.values(charts).forEach(chart => chart?.resize?.());
    }, 120);
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
$("btnImagen")?.addEventListener("click", exportarImagenPNG);
$("btnTema")?.addEventListener("click", alternarTema);
$("btnSidebar")?.addEventListener("click", alternarSidebar);
$("btnFull")?.addEventListener("click", pantallaCompleta);
$("btnLogout")?.addEventListener("click", cerrarSesion);

$("reporteExcelResumen")?.addEventListener("click", exportarExcel);
$("reportePdfGeneral")?.addEventListener("click", exportarPDF);
$("reporteCsv")?.addEventListener("click", exportarCSV);
$("reporteJson")?.addEventListener("click", exportarJSON);
$("reporteImagen")?.addEventListener("click", exportarImagenPNG);
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


/* =========================================================
   EXPORTACIONES BLINDADAS 20260717
   No dependen de captura HTML ni CDN. Evitan PDF blanco.
   ========================================================= */

function limpiarTextoExportacion(valor){
    return String(valor ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
        .trim();
}

function escapePdfTexto(valor){
    return limpiarTextoExportacion(valor).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
}

function descargarBlobBlindado(nombre, blob){
    if(!blob || !(blob instanceof Blob)) throw new Error("No se pudo construir el archivo de descarga.");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        try{ a.remove(); }catch(_e){}
        try{ URL.revokeObjectURL(url); }catch(_e){}
    }, 4000);
}

function obtenerDatosReporteBlindado(){
    try{
        if(!ULTIMO_RESUMEN || !ULTIMA_META_INFO) aplicarFiltrosYRender();
        return prepararDatosReporte();
    }catch(error){
        console.error("No se pudo preparar reporte principal, se usa respaldo.", error);
        const rows = Array.isArray(DATASET_FILTRADO) && DATASET_FILTRADO.length ? DATASET_FILTRADO : (DATASET_NORMAL || []);
        const resumen = calcularResumen(rows || []);
        const cumplimiento = META_RANGO_ACTUAL > 0 ? (resumen.total / META_RANGO_ACTUAL) * 100 : 0;
        const faltante = Math.max((META_RANGO_ACTUAL || 0) - resumen.total, 0);
        const operativo = obtenerResumenOperativoReporte();
        const dims = dimensionesReporte(rows || []);
        return {rows, resumen, cumplimiento, faltante, operativo, dims};
    }
}

function crearPdfSimpleBlindado(datos){
    const {rows, resumen, cumplimiento, faltante, dims, operativo} = datos;
    const pageW = 842;
    const pageH = 595;
    const margin = 34;
    const contentW = pageW - margin * 2;
    let pages = [];
    let ops = [];
    let y = 0;

    function cmd(s){ ops.push(s); }
    function color(r,g,b){ cmd(`${(r/255).toFixed(3)} ${(g/255).toFixed(3)} ${(b/255).toFixed(3)} rg`); }
    function strokeColor(r,g,b){ cmd(`${(r/255).toFixed(3)} ${(g/255).toFixed(3)} ${(b/255).toFixed(3)} RG`); }
    function rect(x, top, w, h, fill=true){ cmd(`${x.toFixed(2)} ${(pageH-top-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${fill ? "f" : "S"}`); }
    function textPdf(x, top, texto, size=9, bold=false){
        const safe = escapePdfTexto(texto);
        cmd(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${(pageH-top).toFixed(2)} Td (${safe}) Tj ET`);
    }
    function line(x1, top1, x2, top2){ cmd(`${x1.toFixed(2)} ${(pageH-top1).toFixed(2)} m ${x2.toFixed(2)} ${(pageH-top2).toFixed(2)} l S`); }
    function wrapWords(texto, maxChars){
        const words = limpiarTextoExportacion(texto).split(/\s+/).filter(Boolean);
        const lines = [];
        let cur = "";
        words.forEach(w => {
            if((cur + " " + w).trim().length > maxChars){
                if(cur) lines.push(cur);
                cur = w;
            }else cur = (cur + " " + w).trim();
        });
        if(cur) lines.push(cur);
        return lines.length ? lines : [""];
    }
    function pushPage(){
        if(ops.length) pages.push(ops.join("\n"));
        ops = [];
    }
    function newPage(subtitle=""){
        pushPage();
        y = 0;
        color(0,79,42); rect(0,0,pageW,32,true);
        color(255,255,255); textPdf(margin,20,"REPORTE GERENCIAL DE HOMENAJES",15,true);
        textPdf(pageW - margin - 210,20,subtitle || new Date().toLocaleDateString("es-CO"),8,false);
        color(15,23,42);
        y = 48;
    }
    function ensure(h){
        if(y + h > pageH - 40) newPage(`Pagina ${pages.length + 1}`);
    }
    function section(title){
        ensure(22);
        color(0,79,42); textPdf(margin,y,title,12,true);
        y += 16;
        color(15,23,42);
    }
    function paragraph(texto){
        const lines = wrapWords(texto, 132);
        ensure(lines.length * 10 + 8);
        lines.forEach(l => { color(15,23,42); textPdf(margin,y,l,8,false); y += 10; });
        y += 4;
    }
    function kpi(x, top, w, title, value, detail){
        color(248,250,252); rect(x,top,w,48,true);
        strokeColor(219,229,239); rect(x,top,w,48,false);
        color(100,116,139); textPdf(x+8,top+14,title,7,true);
        color(15,23,42); textPdf(x+8,top+31,value,14,true);
        if(detail){ color(100,116,139); textPdf(x+8,top+42,detail,6.5,false); }
    }
    function table(title, columns, data, limit=18){
        section(title);
        const cols = columns;
        const rowH = 15;
        ensure(rowH * Math.min((data || []).length + 2, limit + 2) + 20);
        color(0,127,63); rect(margin,y,contentW,rowH,true);
        let x = margin;
        cols.forEach(c => { color(255,255,255); textPdf(x+3,y+10,c.label,7,true); x += c.w; });
        y += rowH;
        const filas = (data && data.length ? data : [{Mensaje:"Sin informacion disponible"}]).slice(0, limit);
        filas.forEach((r, idx) => {
            ensure(rowH + 2);
            color(idx % 2 ? 255 : 248, idx % 2 ? 255 : 250, idx % 2 ? 255 : 252); rect(margin,y,contentW,rowH,true);
            strokeColor(226,232,240); line(margin,y+rowH,margin+contentW,y+rowH);
            x = margin;
            cols.forEach(c => {
                let v = typeof c.value === "function" ? c.value(r) : r[c.key];
                v = limpiarTextoExportacion(v);
                if(v.length > (c.max || 32)) v = v.slice(0, (c.max || 32) - 1) + ".";
                color(15,23,42); textPdf(x+3,y+10,v,6.8,false);
                x += c.w;
            });
            y += rowH;
        });
        y += 10;
    }
    function barChart(title, data, getLabel, getValue, limit=10, formatter=formatMoney){
        const rowsChart = (data || []).slice(0, limit).filter(Boolean);
        section(title);
        const h = 24 + rowsChart.length * 18;
        ensure(h + 5);
        color(247,251,249); rect(margin,y,contentW,h,true);
        strokeColor(219,229,239); rect(margin,y,contentW,h,false);
        const max = Math.max(...rowsChart.map(getValue), 1);
        let yy = y + 18;
        rowsChart.forEach(item => {
            const label = limpiarTextoExportacion(getLabel(item));
            const val = Number(getValue(item) || 0);
            const barX = margin + 178;
            const barW = Math.max(2, (val / max) * (contentW - 260));
            color(15,23,42); textPdf(margin+8, yy+8, label.length > 38 ? label.slice(0,37)+"." : label, 7, false);
            color(230,244,237); rect(barX,yy,contentW-260,9,true);
            color(0,143,70); rect(barX,yy,barW,9,true);
            color(15,23,42); textPdf(barX + barW + 8, yy+8, formatter(val), 7, true);
            yy += 18;
        });
        y += h + 12;
    }

    newPage("Resumen ejecutivo");
    const rango = ULTIMA_META_INFO ? `${formatFechaProfesional(ULTIMA_META_INFO.inicio)} a ${formatFechaProfesional(ULTIMA_META_INFO.fin)}` : "Rango seleccionado";
    color(15,23,42); textPdf(margin,y,"Resumen ejecutivo",18,true); y += 16;
    color(100,116,139); textPdf(margin,y,`Generado: ${new Date().toLocaleString("es-CO")} | Rango: ${rango}`,8,false); y += 18;
    kpi(margin,y,148,"Meta del rango",formatMoney(META_RANGO_ACTUAL),`${formatNumber(MESES_EQUIVALENTES_ACTUAL,2)} meses equiv.`);
    kpi(margin+158,y,148,"Venta real",formatMoney(resumen.total),`${cumplimiento.toFixed(1)}% cumplimiento`);
    kpi(margin+316,y,148,"Faltante",formatMoney(faltante),textoEstado(cumplimiento));
    kpi(margin+474,y,120,"Registros",formatNumber(rows.length),"base analizada");
    kpi(margin+604,y,120,"Plan",formatNumber(resumen.planCantidad || 0),"cantidad");
    y += 66;
    paragraph(`Venta real del periodo ${formatMoney(resumen.total)}, equivalente al ${cumplimiento.toFixed(1)}% de la meta. El faltante para cumplir la meta es ${formatMoney(faltante)}.`);
    paragraph(`Categoria lider: ${dims.categorias.slice().sort((a,b)=>b.Venta-a.Venta)[0]?.Categoria || "-"}. Gestor lider: ${dims.gestores[0]?.Gestor || "-"}. Clinica con mayor reporte: ${dims.clinicas[0]?.nombre || "-"}.`);
    barChart("Ventas por categoria", dims.categorias, x => x.Categoria, x => x.Venta, 4, formatMoney);
    table("Detalle por categoria", [
        {label:"Categoria", key:"Categoria", w:120},
        {label:"Cantidad", value:r=>formatNumber(r.Cantidad), w:85},
        {label:"Venta", value:r=>formatMoney(r.Venta), w:125},
        {label:"Meta", value:r=>formatMoney(r.Meta), w:125},
        {label:"%", value:r=>`${toNumber(r.Cumplimiento).toFixed(1)}%`, w:65},
        {label:"Estado", key:"Estado", w:contentW-520}
    ], dims.categorias, 8);

    newPage("Analisis comercial");
    barChart("Ranking de gestores", dims.gestores, x => x.Gestor, x => x.Venta, 12, formatMoney);
    table("Top gestores", [
        {label:"Gestor", key:"Gestor", w:190, max:34},
        {label:"Cant.", value:r=>formatNumber(r.Cantidad), w:60},
        {label:"Venta", value:r=>formatMoney(r.Venta), w:115},
        {label:"Meta", value:r=>formatMoney(r.Meta), w:115},
        {label:"%", value:r=>`${toNumber(r.Cumplimiento).toFixed(1)}%`, w:65},
        {label:"Estado", key:"Estado", w:contentW-545}
    ], dims.gestores, 16);

    newPage("Mercado y operacion");
    barChart("Homenaje / Excedente", dims.homenaje, x => x.nombre, x => x.valor, 12, formatMoney);
    barChart("Clinicas que mas reportan", dims.clinicas, x => x.nombre, x => x.cantidad, 10, formatNumber);
    table("Clinicas principales", [
        {label:"Clinica", key:"nombre", w:270, max:45},
        {label:"Reportes", value:r=>formatNumber(r.cantidad), w:75},
        {label:"Venta", value:r=>formatMoney(r.valor), w:130},
        {label:"%", value:r=>`${toNumber(r.porcentaje).toFixed(1)}%`, w:70},
        {label:"Prom. diario", value:r=>formatNumber(r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1),2), w:contentW-545}
    ], dims.clinicas, 14);

    newPage("Analisis territorial");
    table("Municipios", [
        {label:"Municipio", key:"nombre", w:190, max:34},
        {label:"Atenciones", value:r=>formatNumber(r.cantidad), w:90},
        {label:"Prom. diario", value:r=>formatNumber(r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1),2), w:95},
        {label:"Venta", value:r=>formatMoney(r.valor), w:120},
        {label:"%", value:r=>`${toNumber(r.porcentaje).toFixed(1)}%`, w:contentW-495}
    ], dims.municipios, 16);
    table("Tipo de muerte", [
        {label:"Tipo", key:"nombre", w:180},
        {label:"Cantidad", value:r=>formatNumber(r.cantidad), w:90},
        {label:"Prom. diario", value:r=>formatNumber(r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1),2), w:110},
        {label:"%", value:r=>`${toNumber(r.porcentaje).toFixed(1)}%`, w:80}
    ], dims.tipoMuerte, 8);
    table("Cementerios", [
        {label:"Cementerio", key:"nombre", w:260, max:44},
        {label:"Servicios", value:r=>formatNumber(r.cantidad), w:80},
        {label:"Prom. mensual", value:r=>formatNumber(r.cantidad/Math.max(MESES_EQUIVALENTES_ACTUAL,1),2), w:105},
        {label:"Venta", value:r=>formatMoney(r.valor), w:130}
    ], dims.cementerios, 14);

    newPage("Operacion interna");
    table("Destino final", [
        {label:"Destino", key:"nombre", w:210},
        {label:"Servicios", value:r=>formatNumber(r.cantidad), w:90},
        {label:"Prom. mensual", value:r=>formatNumber(r.cantidad/Math.max(MESES_EQUIVALENTES_ACTUAL,1),2), w:110},
        {label:"Venta", value:r=>formatMoney(r.valor), w:130}
    ], dims.destinoFinal, 12);
    table("Vacaciones", [
        {label:"Colaborador", value:r=>r.nombre || "-", w:180, max:32},
        {label:"Cargo", value:r=>r.cargo || "-", w:115, max:24},
        {label:"Inicio", value:r=>r.inicio || "-", w:75},
        {label:"Fin", value:r=>r.fin || "-", w:75},
        {label:"Dias", value:r=>formatNumber(r.dias || 0), w:55},
        {label:"Estado", value:r=>estadoVacacion(r), w:contentW-500}
    ], operativo.vacaciones, 14);
    table("Tiempo afiliado", [
        {label:"Referencia", value:r=>r.fallecido || "-", w:170, max:31},
        {label:"Orden", value:r=>r.ordenServicio || "-", w:65},
        {label:"Contrato", value:r=>r.contrato || r.numeroContrato || "-", w:95},
        {label:"Plan", value:r=>r.plan || "-", w:100, max:18},
        {label:"Tiempo", value:r=>r.tiempo?.texto || "-", w:130, max:22},
        {label:"Fuente", value:r=>r.origen || "LOCAL", w:contentW-560}
    ], operativo.tiempoAfiliado.enriquecidos, 14);

    pushPage();

    const objects = [];
    function addObj(content){ objects.push(content); return objects.length; }
    const fontNormal = addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    const fontBold = addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    const pageObjs = [];
    const contentObjs = [];
    pages.forEach((stream, idx) => {
        const footer = `\nBT /F1 7 Tf ${pageW - 100} 18 Td (Pagina ${idx + 1} de ${pages.length}) Tj ET`;
        const fullStream = stream + footer;
        const contentObj = addObj(`<< /Length ${fullStream.length} >>\nstream\n${fullStream}\nendstream`);
        contentObjs.push(contentObj);
        const pageObj = addObj(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${fontNormal} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentObj} 0 R >>`);
        pageObjs.push(pageObj);
    });
    const pagesObj = addObj(`<< /Type /Pages /Kids [${pageObjs.map(n=>`${n} 0 R`).join(" ")}] /Count ${pageObjs.length} >>`);
    pageObjs.forEach(n => { objects[n-1] = objects[n-1].replace("/Parent 0 0 R", `/Parent ${pagesObj} 0 R`); });
    const catalogObj = addObj(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);
    let pdf = "%PDF-1.4\n% dashboard-gerencial-ascii\n";
    const offsets = [0];
    objects.forEach((obj, i) => {
        offsets.push(pdf.length);
        pdf += `${i+1} 0 obj\n${obj}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for(let i=1; i<offsets.length; i++) pdf += `${String(offsets[i]).padStart(10,"0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObj} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([pdf], {type:"application/pdf"});
}

function exportarPDFBlindado(){
    showLoading(true);
    setEstadoExportacion("Generando PDF blindado sin captura visual...", "");
    try{
        const datos = obtenerDatosReporteBlindado();
        const blob = crearPdfSimpleBlindado(datos);
        descargarBlobBlindado(`reporte_gerencial_homenajes_${fechaArchivoReporte()}.pdf`, blob);
        setEstadoExportacion("PDF generado correctamente con motor blindado. Revise Descargas.", "ok");
        toast("PDF generado correctamente.");
    }catch(error){
        console.error("Error PDF blindado:", error);
        setEstadoExportacion(`Error PDF: ${error.message}`, "error");
        toast("No se pudo generar PDF.", "error");
    }finally{
        showLoading(false);
    }
}

function tablaHtmlExcel(nombre, filas){
    const data = filas && filas.length ? filas : [{Mensaje:"Sin información disponible"}];
    const headers = Object.keys(data[0] || {});
    return `<h2>${escapeHtml(nombre)}</h2><table border="1"><thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${data.map(row=>`<tr>${headers.map(h=>`<td>${escapeHtml(row[h])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function exportarExcelBlindado(){
    showLoading(true);
    setEstadoExportacion("Generando Excel compatible blindado...", "");
    try{
        const {rows, resumen, cumplimiento, faltante, operativo, dims} = obtenerDatosReporteBlindado();
        const resumenRows = [
            {Indicador:"Fecha generación", Valor:new Date().toLocaleString("es-CO")},
            {Indicador:"Meta del rango", Valor:Math.round(META_RANGO_ACTUAL)},
            {Indicador:"Venta real", Valor:Math.round(resumen.total)},
            {Indicador:"Cumplimiento", Valor:`${cumplimiento.toFixed(1)}%`},
            {Indicador:"Faltante", Valor:Math.round(faltante)},
            {Indicador:"Particular", Valor:Math.round(resumen.particular)},
            {Indicador:"Red", Valor:Math.round(resumen.red)},
            {Indicador:"Excedentes", Valor:Math.round(resumen.excedentes)},
            {Indicador:"Plan cantidad", Valor:resumen.planCantidad || 0},
            {Indicador:"Registros analizados", Valor:rows.length}
        ];
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
            body{font-family:Arial,sans-serif;} h1{color:#004f2a;} h2{color:#004f2a;margin-top:22px;} table{border-collapse:collapse;margin-bottom:20px;} th{background:#008f46;color:#fff;} th,td{padding:6px;border:1px solid #cbd5e1;font-size:12px;} .money{mso-number-format:'\\$#,##0';}
        </style></head><body>
        <h1>REPORTE GERENCIAL DE HOMENAJES</h1>
        ${tablaHtmlExcel("Resumen Ejecutivo", resumenRows)}
        ${tablaHtmlExcel("Categorias", dims.categorias.map(r=>({Categoria:r.Categoria, Cantidad:r.Cantidad, Venta:Math.round(r.Venta), Meta:Math.round(r.Meta), Cumplimiento:`${toNumber(r.Cumplimiento).toFixed(1)}%`, Estado:r.Estado})))}
        ${tablaHtmlExcel("Gestores", dims.gestores.map(r=>({Gestor:r.Gestor, Cantidad:r.Cantidad, Venta:Math.round(r.Venta), Meta:Math.round(r.Meta), Cumplimiento:`${toNumber(r.Cumplimiento).toFixed(1)}%`, Estado:r.Estado})))}
        ${tablaHtmlExcel("Excedentes", dims.excedentes.map(r=>({Excedente:r.Excedente, Cantidad:r.Cantidad, Venta:Math.round(r.Venta), Meta:Math.round(r.Meta), Cumplimiento:`${toNumber(r.Cumplimiento).toFixed(1)}%`, Estado:r.Estado})))}
        ${tablaHtmlExcel("Clinicas", dims.clinicas.map(r=>({Clinica:r.nombre, Reportes:r.cantidad, Venta:Math.round(r.valor), Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})))}
        ${tablaHtmlExcel("Municipios", dims.municipios.map(r=>({Municipio:r.nombre, Atenciones:r.cantidad, Venta:Math.round(r.valor), Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})))}
        ${tablaHtmlExcel("Tipo Muerte", dims.tipoMuerte.map(r=>({Tipo:r.nombre, Cantidad:r.cantidad, Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})))}
        ${tablaHtmlExcel("Cementerios", dims.cementerios.map(r=>({Cementerio:r.nombre, Servicios:r.cantidad, Venta:Math.round(r.valor), Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})))}
        ${tablaHtmlExcel("Destino Final", dims.destinoFinal.map(r=>({Destino:r.nombre, Servicios:r.cantidad, Venta:Math.round(r.valor), Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})))}
        ${tablaHtmlExcel("Datos Filtrados", rows.map(row=>({Fecha:formatFechaProfesional(row.fecha,row.fechaTexto||""), Orden:row.ordenServicio, Gestor:row.gestor, Sede:row.sede, Categoria:row.categoriaGerencial, Servicio:row.servicio, Clinica:row.clinica, Municipio:row.municipio, Tipo_Muerte:row.tipoMuerte, Cementerio:row.cementerio, Destino_Final:row.destinoFinal, Cantidad:row.cantidadAtendida, Valor_Venta:Math.round(row.valorVenta)})))}
        ${tablaHtmlExcel("Vacaciones", operativo.vacaciones.map(item=>({Colaborador:item.nombre||"", Cargo:item.cargo||"", Inicio:item.inicio||"", Fin:item.fin||"", Dias:item.dias||0, Estado:estadoVacacion(item)})))}
        ${tablaHtmlExcel("Agenda", operativo.agenda.map(item=>({Fecha:item.fecha||"", Hora:horaActividad(item), Actividad:item.titulo||"", Responsable:item.responsable||"", Estado:item.estado||"", Detalle:item.detalle||""})))}
        ${tablaHtmlExcel("Tiempo Afiliado", operativo.tiempoAfiliado.enriquecidos.map(item=>({Orden:item.ordenServicio||"", Numero_Contrato:item.contrato||item.numeroContrato||"", Plan:item.plan||"", Tipo_Afiliacion:item.tipoAfiliacion||"", Edad:item.edad||"", Fecha_Orden:item.fechaOrden||"", Tiempo_Transcurrido:item.tiempo?.texto||"", Clasificacion:item.tiempo?.clasificacion||"", Fuente:item.origen||"LOCAL"})))}
        </body></html>`;
        const blob = new Blob(["\ufeff" + html], {type:"application/vnd.ms-excel;charset=utf-8"});
        descargarBlobBlindado(`dashboard_gerencial_homenajes_${fechaArchivoReporte()}.xls`, blob);
        setEstadoExportacion("Excel compatible generado correctamente. Revise Descargas.", "ok");
        toast("Excel generado correctamente.");
    }catch(error){
        console.error("Error Excel blindado:", error);
        setEstadoExportacion(`Error Excel: ${error.message}`, "error");
        toast("No se pudo generar Excel.", "error");
    }finally{
        showLoading(false);
    }
}

function exportarImagenBlindada(){
    showLoading(true);
    setEstadoExportacion("Generando imagen ejecutiva blindada...", "");
    try{
        const {rows, resumen, cumplimiento, faltante, dims} = obtenerDatosReporteBlindado();
        const canvas = document.createElement("canvas");
        canvas.width = 1600;
        canvas.height = 2200;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = "#004f2a";
        ctx.fillRect(0,0,canvas.width,110);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 42px Arial";
        ctx.fillText("REPORTE GERENCIAL DE HOMENAJES", 60, 68);
        ctx.font = "22px Arial";
        ctx.fillText(`Generado: ${new Date().toLocaleString("es-CO")}`, 60, 98);
        let y = 155;
        function card(x, title, value, detail){
            ctx.fillStyle = "#f8fafc"; ctx.fillRect(x,y,330,115);
            ctx.strokeStyle = "#dbe5ef"; ctx.strokeRect(x,y,330,115);
            ctx.fillStyle = "#64748b"; ctx.font = "bold 19px Arial"; ctx.fillText(title,x+22,y+32);
            ctx.fillStyle = "#0f172a"; ctx.font = "bold 32px Arial"; ctx.fillText(value,x+22,y+73);
            ctx.fillStyle = "#64748b"; ctx.font = "17px Arial"; ctx.fillText(detail,x+22,y+100);
        }
        card(60,"Meta",formatMoney(META_RANGO_ACTUAL),"Rango seleccionado");
        card(420,"Venta real",formatMoney(resumen.total),`${cumplimiento.toFixed(1)}% cumplimiento`);
        card(780,"Faltante",formatMoney(faltante),textoEstado(cumplimiento));
        card(1140,"Registros",formatNumber(rows.length),"base analizada");
        y += 170;
        ctx.fillStyle="#004f2a"; ctx.font="bold 28px Arial"; ctx.fillText("Ventas por categoria",60,y); y += 34;
        function bars(data, labelKey, valueKey, formatter, maxRows){
            const arr = data.slice(0,maxRows);
            const max = Math.max(...arr.map(x=>Number(typeof valueKey==="function"?valueKey(x):x[valueKey])||0),1);
            arr.forEach(item=>{
                const label = limpiarTextoExportacion(typeof labelKey==="function"?labelKey(item):item[labelKey]).slice(0,42);
                const val = Number(typeof valueKey==="function"?valueKey(item):item[valueKey])||0;
                ctx.fillStyle="#0f172a"; ctx.font="bold 19px Arial"; ctx.fillText(label,80,y+22);
                ctx.fillStyle="#e6f4ed"; ctx.fillRect(470,y,820,22);
                ctx.fillStyle="#008f46"; ctx.fillRect(470,y,Math.max(4,(val/max)*820),22);
                ctx.fillStyle="#0f172a"; ctx.font="bold 18px Arial"; ctx.fillText(formatter(val),1310,y+20);
                y += 44;
            });
            y += 30;
        }
        bars(dims.categorias, "Categoria", "Venta", formatMoney, 4);
        ctx.fillStyle="#004f2a"; ctx.font="bold 28px Arial"; ctx.fillText("Ranking de gestores",60,y); y += 34;
        bars(dims.gestores, "Gestor", "Venta", formatMoney, 10);
        ctx.fillStyle="#004f2a"; ctx.font="bold 28px Arial"; ctx.fillText("Clinicas que mas reportan",60,y); y += 34;
        bars(dims.clinicas, "nombre", "cantidad", formatNumber, 10);
        canvas.toBlob(blob => {
            if(!blob){
                setEstadoExportacion("No se pudo crear la imagen.", "error");
                showLoading(false);
                return;
            }
            descargarBlobBlindado(`dashboard_gerencial_${fechaArchivoReporte()}.png`, blob);
            setEstadoExportacion("Imagen generada correctamente. Revise Descargas.", "ok");
            toast("Imagen generada correctamente.");
            showLoading(false);
        }, "image/png", 0.95);
    }catch(error){
        console.error("Error imagen blindada:", error);
        setEstadoExportacion(`Error Imagen: ${error.message}`, "error");
        toast("No se pudo generar imagen.", "error");
        showLoading(false);
    }
}

function vincularBotonExportacionBlindado(id, handler){
    const original = $(id);
    if(!original) return;
    const nuevo = original.cloneNode(true);
    original.parentNode.replaceChild(nuevo, original);
    nuevo.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        handler();
    });
}

function instalarExportacionesBlindadas(){
    vincularBotonExportacionBlindado("btnPdf", exportarPDFBlindado);
    vincularBotonExportacionBlindado("btnExcel", exportarExcelBlindado);
    vincularBotonExportacionBlindado("btnImagen", exportarImagenBlindada);
    vincularBotonExportacionBlindado("reportePdfGeneral", exportarPDFBlindado);
    vincularBotonExportacionBlindado("reporteExcelResumen", exportarExcelBlindado);
    vincularBotonExportacionBlindado("reporteImagen", exportarImagenBlindada);
    setEstadoExportacion("Motor de descargas blindado activo. PDF, Excel e Imagen no dependen de captura visual.", "ok");
    console.log("EXPORTACIONES BLINDADAS ACTIVAS - VERSION 20260719");
}

instalarExportacionesBlindadas();

/* Excel multihoja sin librerías externas - 20260717 */
function xmlSeguroExportacion(valor){
    return String(valor ?? "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&apos;");
}

function filaXmlExcel(valores, encabezado=false){
    return `<Row>${valores.map(v => `<Cell ss:StyleID="${encabezado ? "Header" : "Normal"}"><Data ss:Type="String">${xmlSeguroExportacion(v)}</Data></Cell>`).join("")}</Row>`;
}

function hojaXmlExcel(nombre, filas){
    const data = Array.isArray(filas) && filas.length ? filas : [{Mensaje:"Sin información disponible"}];
    const headers = Object.keys(data[0] || {Mensaje:"Sin información disponible"});
    const body = [filaXmlExcel(headers, true), ...data.map(row => filaXmlExcel(headers.map(h => row[h] ?? "")))].join("\n");
    return `<Worksheet ss:Name="${xmlSeguroExportacion(String(nombre).slice(0,31))}"><Table>${body}</Table></Worksheet>`;
}

function crearExcelXmlMultiHoja(datos){
    const {rows, resumen, cumplimiento, faltante, operativo, dims} = datos;
    const hojas = [];
    hojas.push(hojaXmlExcel("Resumen Ejecutivo", [
        {Indicador:"Fecha generación", Valor:new Date().toLocaleString("es-CO")},
        {Indicador:"Meta del rango", Valor:Math.round(META_RANGO_ACTUAL)},
        {Indicador:"Venta real", Valor:Math.round(resumen.total)},
        {Indicador:"Cumplimiento", Valor:`${cumplimiento.toFixed(1)}%`},
        {Indicador:"Faltante", Valor:Math.round(faltante)},
        {Indicador:"Particular", Valor:Math.round(resumen.particular)},
        {Indicador:"Red", Valor:Math.round(resumen.red)},
        {Indicador:"Excedentes", Valor:Math.round(resumen.excedentes)},
        {Indicador:"Plan cantidad", Valor:resumen.planCantidad || 0},
        {Indicador:"Registros analizados", Valor:rows.length}
    ]));
    hojas.push(hojaXmlExcel("Categorias", dims.categorias.map(r=>({Categoria:r.Categoria, Cantidad:r.Cantidad, Venta:Math.round(r.Venta), Meta:Math.round(r.Meta), Cumplimiento:`${toNumber(r.Cumplimiento).toFixed(1)}%`, Estado:r.Estado}))));
    hojas.push(hojaXmlExcel("Gestores", dims.gestores.map(r=>({Gestor:r.Gestor, Cantidad:r.Cantidad, Venta:Math.round(r.Venta), Meta:Math.round(r.Meta), Cumplimiento:`${toNumber(r.Cumplimiento).toFixed(1)}%`, Estado:r.Estado}))));
    hojas.push(hojaXmlExcel("Excedentes", dims.excedentes.map(r=>({Excedente:r.Excedente, Cantidad:r.Cantidad, Venta:Math.round(r.Venta), Meta:Math.round(r.Meta), Cumplimiento:`${toNumber(r.Cumplimiento).toFixed(1)}%`, Estado:r.Estado}))));
    hojas.push(hojaXmlExcel("Homenaje Excedente", dims.homenaje.map(r=>({Tipo:r.nombre, Cantidad:r.cantidad, Venta:Math.round(r.valor), Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`}))));
    hojas.push(hojaXmlExcel("Clinicas", dims.clinicas.map(r=>({Clinica:r.nombre, Reportes:r.cantidad, Venta:Math.round(r.valor), Promedio_Diario:formatNumber(r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1),2), Promedio_Mensual:formatNumber(r.cantidad/Math.max(MESES_EQUIVALENTES_ACTUAL,1),2), Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`}))));
    hojas.push(hojaXmlExcel("Municipios", dims.municipios.map(r=>({Municipio:r.nombre, Atenciones:r.cantidad, Venta:Math.round(r.valor), Promedio_Diario:formatNumber(r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1),2), Promedio_Mensual:formatNumber(r.cantidad/Math.max(MESES_EQUIVALENTES_ACTUAL,1),2), Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`}))));
    hojas.push(hojaXmlExcel("Tipo Muerte", dims.tipoMuerte.map(r=>({Tipo:r.nombre, Cantidad:r.cantidad, Promedio_Diario:formatNumber(r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1),2), Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`}))));
    hojas.push(hojaXmlExcel("Cementerios", dims.cementerios.map(r=>({Cementerio:r.nombre, Servicios:r.cantidad, Venta:Math.round(r.valor), Promedio_Diario:formatNumber(r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1),2), Promedio_Mensual:formatNumber(r.cantidad/Math.max(MESES_EQUIVALENTES_ACTUAL,1),2), Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`}))));
    hojas.push(hojaXmlExcel("Destino Final", dims.destinoFinal.map(r=>({Destino:r.nombre, Servicios:r.cantidad, Venta:Math.round(r.valor), Promedio_Diario:formatNumber(r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1),2), Promedio_Mensual:formatNumber(r.cantidad/Math.max(MESES_EQUIVALENTES_ACTUAL,1),2), Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`}))));
    hojas.push(hojaXmlExcel("Datos Filtrados", rows.map(row=>({Fecha:formatFechaProfesional(row.fecha,row.fechaTexto||""), Orden:row.ordenServicio, Gestor:row.gestor, Sede:row.sede, Categoria:row.categoriaGerencial, Servicio:row.servicio, Clinica:row.clinica, Municipio:row.municipio, Tipo_Muerte:row.tipoMuerte, Cementerio:row.cementerio, Destino_Final:row.destinoFinal, Cantidad:row.cantidadAtendida, Valor_Venta:Math.round(row.valorVenta)}))));
    hojas.push(hojaXmlExcel("Energia", operativo.energia.map(item=>({Año:item.anio, Mes:nombreMes(item.mes), kWh:toNumber(item.kwh), Costo:toNumber(item.costo), Observacion:item.observacion||""}))));
    hojas.push(hojaXmlExcel("Vacaciones", operativo.vacaciones.map(item=>({Colaborador:item.nombre||"", Cargo:item.cargo||"", Inicio:item.inicio||"", Fin:item.fin||"", Dias:item.dias||0, Estado:estadoVacacion(item)}))));
    hojas.push(hojaXmlExcel("Agenda", operativo.agenda.map(item=>({Fecha:item.fecha||"", Hora:horaActividad(item), Actividad:item.titulo||"", Responsable:item.responsable||"", Estado:item.estado||"", Detalle:item.detalle||""}))));
    hojas.push(hojaXmlExcel("Tiempo Afiliado", operativo.tiempoAfiliado.enriquecidos.map(item=>({Orden:item.ordenServicio||"", Numero_Contrato:item.contrato||item.numeroContrato||"", Plan:item.plan||"", Tipo_Afiliacion:item.tipoAfiliacion||"", Edad:item.edad||"", Fecha_Orden:item.fechaOrden||"", Tiempo_Transcurrido:item.tiempo?.texto||"", Clasificacion:item.tiempo?.clasificacion||"", Fuente:item.origen||"LOCAL"}))));

    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#008F46" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
  <Style ss:ID="Normal"><Font ss:Color="#0F172A"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DBE5EF"/></Borders></Style>
 </Styles>
 ${hojas.join("\n")}
</Workbook>`;
}

function exportarExcelBlindado(){
    showLoading(true);
    setEstadoExportacion("Generando Excel multihoja blindado...", "");
    try{
        const datos = obtenerDatosReporteBlindado();
        const xml = crearExcelXmlMultiHoja(datos);
        descargarBlobBlindado(`dashboard_gerencial_homenajes_${fechaArchivoReporte()}.xls`, new Blob([xml], {type:"application/vnd.ms-excel;charset=utf-8"}));
        setEstadoExportacion("Excel multihoja generado correctamente. Revise Descargas.", "ok");
        toast("Excel generado correctamente.");
    }catch(error){
        console.error("Error Excel multihoja:", error);
        setEstadoExportacion(`Error Excel: ${error.message}`, "error");
        toast("No se pudo generar Excel.", "error");
    }finally{
        showLoading(false);
    }
}

/* =========================================================
   EXPORTACIONES DEFINITIVAS 20260718
   PDF / EXCEL / IMAGEN sin captura HTML oculta
   ========================================================= */
console.log("EXPORTACIONES DEFINITIVAS ACTIVAS - VERSION 20260719");

function reporteFechaNombre20260718(){
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}_${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}`;
}

function textoSeguro20260718(valor){
    return String(valor ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
        .trim();
}

function datosReporteSeguro20260718(){
    try{
        if(!ULTIMO_RESUMEN || !ULTIMA_META_INFO) aplicarFiltrosYRender();
        const datos = typeof obtenerDatosReporteBlindado === "function" ? obtenerDatosReporteBlindado() : prepararDatosReporte();
        if(datos && datos.resumen && datos.dims) return datos;
    }catch(error){
        console.warn("No se pudo usar obtenerDatosReporteBlindado. Se crea respaldo.", error);
    }

    const rows = Array.isArray(DATASET_FILTRADO) && DATASET_FILTRADO.length ? DATASET_FILTRADO : (DATASET_NORMAL || []);
    const resumen = calcularResumen(rows || []);
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (resumen.total / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max((META_RANGO_ACTUAL || 0) - resumen.total, 0);
    const operativo = typeof obtenerResumenOperativoReporte === "function" ? obtenerResumenOperativoReporte() : {energia:[], vacaciones:[], agenda:[], tiempoAfiliado:{enriquecidos:[]}};
    const dims = dimensionesReporte(rows || []);
    return {rows, resumen, cumplimiento, faltante, operativo, dims};
}

function garantizarJsPDFFinal20260718(){
    return new Promise((resolve, reject) => {
        const ctor = window.jspdf?.jsPDF || window.jsPDF;
        if(ctor){ resolve(ctor); return; }

        if(typeof cargarScriptUnaVez === "function"){
            cargarScriptUnaVez("lib-jspdf-final-20260718", [
                "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
                "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"
            ]).then(() => {
                const finalCtor = window.jspdf?.jsPDF || window.jsPDF;
                if(finalCtor) resolve(finalCtor);
                else reject(new Error("jsPDF no quedo disponible despues de cargar la libreria."));
            }).catch(reject);
            return;
        }

        reject(new Error("jsPDF no esta disponible."));
    });
}

function descargarTextoHtmlRespaldo20260718(datos){
    const {rows, resumen, cumplimiento, faltante, dims} = datos;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Reporte Gerencial</title>
    <style>body{font-family:Arial,sans-serif;margin:32px;color:#0f172a}h1{color:#004f2a}h2{color:#004f2a;margin-top:24px}table{border-collapse:collapse;width:100%;margin:10px 0 22px}th{background:#008f46;color:white}th,td{border:1px solid #cbd5e1;padding:7px;font-size:12px}.kpi{display:inline-block;border:1px solid #cbd5e1;border-radius:10px;padding:12px;margin:6px;min-width:170px}.kpi b{display:block;font-size:20px}</style></head><body>
    <h1>Reporte Gerencial de Homenajes</h1><p>Use Ctrl + P y Guardar como PDF si el navegador bloqueo la descarga PDF.</p>
    <div class="kpi">Meta<b>${formatMoney(META_RANGO_ACTUAL)}</b></div><div class="kpi">Venta<b>${formatMoney(resumen.total)}</b></div><div class="kpi">Cumplimiento<b>${cumplimiento.toFixed(1)}%</b></div><div class="kpi">Faltante<b>${formatMoney(faltante)}</b></div>
    ${tablaHtmlExcel("Categorias", dims.categorias.map(r=>({Categoria:r.Categoria,Cantidad:r.Cantidad,Venta:formatMoney(r.Venta),Meta:formatMoney(r.Meta),Cumplimiento:`${toNumber(r.Cumplimiento).toFixed(1)}%`,Estado:r.Estado})))}
    ${tablaHtmlExcel("Gestores", dims.gestores.slice(0,20).map(r=>({Gestor:r.Gestor,Cantidad:r.Cantidad,Venta:formatMoney(r.Venta),Meta:formatMoney(r.Meta),Cumplimiento:`${toNumber(r.Cumplimiento).toFixed(1)}%`,Estado:r.Estado})))}
    ${tablaHtmlExcel("Clinicas", dims.clinicas.slice(0,20).map(r=>({Clinica:r.nombre,Reportes:r.cantidad,Venta:formatMoney(r.valor),Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})))}
    ${tablaHtmlExcel("Datos filtrados", rows.slice(0,200).map(r=>({Fecha:formatFechaProfesional(r.fecha,r.fechaTexto||""),Orden:r.ordenServicio,Gestor:r.gestor,Categoria:r.categoriaGerencial,Servicio:r.servicio,Clinica:r.clinica,Municipio:r.municipio,Cementerio:r.cementerio,Venta:formatMoney(r.valorVenta)})))}
    </body></html>`;
    descargarBlobBlindado(`reporte_gerencial_respaldo_${reporteFechaNombre20260718()}.html`, new Blob([html], {type:"text/html;charset=utf-8"}));
}

async function exportarPDFDefinitivo20260718(){
    showLoading(true);
    setEstadoExportacion("Generando PDF definitivo con jsPDF...", "");
    try{
        const datos = datosReporteSeguro20260718();
        const {rows, resumen, cumplimiento, faltante, dims, operativo} = datos;
        const jsPDFCtor = await garantizarJsPDFFinal20260718();
        const doc = new jsPDFCtor({orientation:"landscape", unit:"mm", format:"a4", compress:true});
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 10;
        let y = 12;

        function header(titulo="Reporte Gerencial de Homenajes"){
            doc.setFillColor(0,79,42);
            doc.rect(0,0,pageW,17,"F");
            doc.setTextColor(255,255,255);
            doc.setFont("helvetica","bold");
            doc.setFontSize(13);
            doc.text(textoSeguro20260718(titulo), margin, 10.5);
            doc.setFont("helvetica","normal");
            doc.setFontSize(7);
            doc.text(textoSeguro20260718(new Date().toLocaleString("es-CO")), pageW - margin, 10.5, {align:"right"});
            doc.setTextColor(15,23,42);
            y = 25;
        }

        function pageCheck(needed=25){
            if(y + needed <= pageH - 12) return;
            doc.addPage();
            header();
        }

        function section(titulo){
            pageCheck(12);
            doc.setTextColor(0,79,42);
            doc.setFont("helvetica","bold");
            doc.setFontSize(10.5);
            doc.text(textoSeguro20260718(titulo), margin, y);
            y += 6;
            doc.setTextColor(15,23,42);
        }

        function paragraph(txt){
            const lines = doc.splitTextToSize(textoSeguro20260718(txt), pageW - margin * 2);
            pageCheck(lines.length * 5 + 3);
            doc.setFont("helvetica","normal");
            doc.setFontSize(8);
            doc.setTextColor(15,23,42);
            doc.text(lines, margin, y);
            y += lines.length * 4.7 + 4;
        }

        function card(x, top, w, title, value, detail=""){
            doc.setDrawColor(219,229,239);
            doc.setFillColor(248,250,252);
            doc.roundedRect(x, top, w, 24, 2, 2, "FD");
            doc.setFont("helvetica","bold");
            doc.setTextColor(100,116,139);
            doc.setFontSize(6.8);
            doc.text(textoSeguro20260718(title), x+3, top+6);
            doc.setTextColor(15,23,42);
            doc.setFontSize(11.5);
            doc.text(textoSeguro20260718(value), x+3, top+15);
            if(detail){
                doc.setTextColor(100,116,139);
                doc.setFontSize(6.2);
                doc.text(textoSeguro20260718(detail), x+3, top+21);
            }
        }

        function table(titulo, columnas, data, limite=16){
            section(titulo);
            const filas = (Array.isArray(data) && data.length ? data : [{Mensaje:"Sin informacion disponible"}]).slice(0, limite);
            const usableW = pageW - margin * 2;
            const colW = columnas.map(c => c.w || (usableW / columnas.length));
            const rowH = 7.2;
            pageCheck(12 + rowH * (filas.length + 1));
            let x = margin;
            doc.setFillColor(0,127,63);
            doc.rect(margin, y, usableW, rowH, "F");
            doc.setTextColor(255,255,255);
            doc.setFont("helvetica","bold");
            doc.setFontSize(6.7);
            columnas.forEach((c,i) => { doc.text(textoSeguro20260718(c.label), x + 1.5, y + 4.8, {maxWidth:colW[i]-3}); x += colW[i]; });
            y += rowH;
            filas.forEach((r, idx) => {
                pageCheck(rowH + 2);
                doc.setFillColor(idx % 2 ? 255 : 248, idx % 2 ? 255 : 250, idx % 2 ? 255 : 252);
                doc.rect(margin, y, usableW, rowH, "F");
                doc.setDrawColor(226,232,240);
                doc.line(margin, y + rowH, margin + usableW, y + rowH);
                x = margin;
                doc.setFont("helvetica","normal");
                doc.setFontSize(6.4);
                doc.setTextColor(15,23,42);
                columnas.forEach((c,i) => {
                    let value = typeof c.value === "function" ? c.value(r) : r[c.key];
                    value = textoSeguro20260718(value);
                    if(c.max && value.length > c.max) value = value.slice(0,c.max-1) + ".";
                    doc.text(value || "-", x + 1.5, y + 4.8, {maxWidth:colW[i]-3});
                    x += colW[i];
                });
                y += rowH;
            });
            y += 7;
        }

        function bars(titulo, data, getLabel, getValue, limite=10, formatter=formatMoney){
            section(titulo);
            const arr = (Array.isArray(data) ? data : []).slice(0, limite);
            const chartH = Math.max(18, 11 + arr.length * 8.2);
            pageCheck(chartH + 8);
            const x0 = margin;
            const w = pageW - margin * 2;
            doc.setFillColor(247,251,249);
            doc.setDrawColor(219,229,239);
            doc.roundedRect(x0, y, w, chartH, 2, 2, "FD");
            const max = Math.max(...arr.map(x => Number(getValue(x) || 0)), 1);
            let yy = y + 9;
            arr.forEach(item => {
                const label = textoSeguro20260718(getLabel(item));
                const value = Number(getValue(item) || 0);
                const barX = x0 + 74;
                const barW = Math.max(1.5, (value / max) * (w - 122));
                doc.setTextColor(15,23,42);
                doc.setFont("helvetica","normal");
                doc.setFontSize(6.4);
                doc.text(label.length > 28 ? label.slice(0,27) + "." : label, x0 + 3, yy + 3.4, {maxWidth:68});
                doc.setFillColor(230,244,237);
                doc.roundedRect(barX, yy, w - 124, 4.6, 1.8, 1.8, "F");
                doc.setFillColor(0,143,70);
                doc.roundedRect(barX, yy, barW, 4.6, 1.8, 1.8, "F");
                doc.setFont("helvetica","bold");
                doc.setFontSize(6.3);
                doc.text(textoSeguro20260718(formatter(value)), Math.min(barX + barW + 3, pageW - 38), yy + 3.6);
                yy += 8.2;
            });
            y += chartH + 8;
        }

        header();
        doc.setFont("helvetica","bold");
        doc.setTextColor(0,79,42);
        doc.setFontSize(16);
        doc.text("Resumen ejecutivo", margin, y); y += 8;
        doc.setFont("helvetica","normal");
        doc.setTextColor(100,116,139);
        doc.setFontSize(7);
        const rango = ULTIMA_META_INFO ? `${formatFechaProfesional(ULTIMA_META_INFO.inicio)} a ${formatFechaProfesional(ULTIMA_META_INFO.fin)}` : "Rango seleccionado";
        doc.text(textoSeguro20260718(`Rango: ${rango} | Registros: ${formatNumber(rows.length)}`), margin, y); y += 7;

        const cw = 52;
        card(margin, y, cw, "Meta", formatMoney(META_RANGO_ACTUAL), `${formatNumber(MESES_EQUIVALENTES_ACTUAL,2)} meses`);
        card(margin+cw+4, y, cw, "Venta real", formatMoney(resumen.total), `${cumplimiento.toFixed(1)}%`);
        card(margin+(cw+4)*2, y, cw, "Faltante", formatMoney(faltante), textoEstado(cumplimiento));
        card(margin+(cw+4)*3, y, cw, "Particular", formatMoney(resumen.particular), "ventas");
        card(margin+(cw+4)*4, y, cw, "Red", formatMoney(resumen.red), "ventas");
        y += 32;
        paragraph(`La venta real del periodo es ${formatMoney(resumen.total)}, equivalente al ${cumplimiento.toFixed(1)}% de la meta. El faltante calculado es ${formatMoney(faltante)}.`);
        paragraph(`Categoria lider: ${dims.categorias.slice().sort((a,b)=>toNumber(b.Venta)-toNumber(a.Venta))[0]?.Categoria || "-"}. Gestor lider: ${dims.gestores[0]?.Gestor || "-"}. Clinica con mayor reporte: ${dims.clinicas[0]?.nombre || "-"}.`);
        bars("Ventas por categoria", dims.categorias, r=>r.Categoria, r=>r.Venta, 4, formatMoney);
        table("Detalle por categoria", [
            {label:"Categoria", key:"Categoria", w:38},
            {label:"Cant.", value:r=>formatNumber(r.Cantidad), w:22},
            {label:"Venta", value:r=>formatMoney(r.Venta), w:42},
            {label:"Meta", value:r=>formatMoney(r.Meta), w:42},
            {label:"%", value:r=>`${toNumber(r.Cumplimiento).toFixed(1)}%`, w:22},
            {label:"Estado", key:"Estado", w:pageW - margin*2 - 166, max:30}
        ], dims.categorias, 8);

        doc.addPage(); header("Analisis comercial");
        bars("Ranking de gestores", dims.gestores, r=>r.Gestor, r=>r.Venta, 12, formatMoney);
        table("Top gestores", [
            {label:"Gestor", key:"Gestor", w:72, max:30},
            {label:"Cant.", value:r=>formatNumber(r.Cantidad), w:20},
            {label:"Venta", value:r=>formatMoney(r.Venta), w:39},
            {label:"Meta", value:r=>formatMoney(r.Meta), w:39},
            {label:"%", value:r=>`${toNumber(r.Cumplimiento).toFixed(1)}%`, w:20},
            {label:"Estado", key:"Estado", w:pageW - margin*2 - 190, max:28}
        ], dims.gestores, 18);

        doc.addPage(); header("Analisis por origen y destino");
        bars("Homenaje / Excedente", dims.homenaje, r=>r.nombre, r=>r.valor, 12, formatMoney);
        bars("Clinicas que mas reportan", dims.clinicas, r=>r.nombre, r=>r.cantidad, 12, formatNumber);
        table("Clinicas principales", [
            {label:"Clinica", key:"nombre", w:92, max:38},
            {label:"Reportes", value:r=>formatNumber(r.cantidad), w:24},
            {label:"Venta", value:r=>formatMoney(r.valor), w:40},
            {label:"%", value:r=>`${toNumber(r.porcentaje).toFixed(1)}%`, w:20},
            {label:"Prom. diario", value:r=>formatNumber(r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1),2), w:35}
        ], dims.clinicas, 16);

        doc.addPage(); header("Analisis territorial");
        table("Municipios", [
            {label:"Municipio", key:"nombre", w:70, max:30},
            {label:"Atenc.", value:r=>formatNumber(r.cantidad), w:23},
            {label:"Prom. diario", value:r=>formatNumber(r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1),2), w:34},
            {label:"Venta", value:r=>formatMoney(r.valor), w:41},
            {label:"%", value:r=>`${toNumber(r.porcentaje).toFixed(1)}%`, w:21}
        ], dims.municipios, 18);
        table("Cementerios", [
            {label:"Cementerio", key:"nombre", w:96, max:40},
            {label:"Servicios", value:r=>formatNumber(r.cantidad), w:26},
            {label:"Prom. mensual", value:r=>formatNumber(r.cantidad/Math.max(MESES_EQUIVALENTES_ACTUAL,1),2), w:34},
            {label:"Venta", value:r=>formatMoney(r.valor), w:43}
        ], dims.cementerios, 16);

        doc.addPage(); header("Operacion y control");
        table("Destino final", [
            {label:"Destino", key:"nombre", w:76, max:34},
            {label:"Servicios", value:r=>formatNumber(r.cantidad), w:28},
            {label:"Prom. mensual", value:r=>formatNumber(r.cantidad/Math.max(MESES_EQUIVALENTES_ACTUAL,1),2), w:35},
            {label:"Venta", value:r=>formatMoney(r.valor), w:42}
        ], dims.destinoFinal, 14);
        table("Tipo de muerte", [
            {label:"Tipo", key:"nombre", w:72},
            {label:"Cantidad", value:r=>formatNumber(r.cantidad), w:30},
            {label:"Prom. diario", value:r=>formatNumber(r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1),2), w:38},
            {label:"%", value:r=>`${toNumber(r.porcentaje).toFixed(1)}%`, w:26}
        ], dims.tipoMuerte, 8);
        table("Tiempo afiliado", [
            {label:"Referencia", value:r=>r.fallecido || "-", w:72, max:30},
            {label:"Orden", value:r=>r.ordenServicio || "-", w:24},
            {label:"Contrato", value:r=>r.contrato || r.numeroContrato || "-", w:38},
            {label:"Plan", value:r=>r.plan || "-", w:45, max:18},
            {label:"Tiempo", value:r=>r.tiempo?.texto || "-", w:46, max:22},
            {label:"Fuente", value:r=>r.origen || "LOCAL", w:28}
        ], operativo?.tiempoAfiliado?.enriquecidos || [], 14);

        const totalPages = doc.internal.getNumberOfPages();
        for(let i=1; i<=totalPages; i++){
            doc.setPage(i);
            doc.setTextColor(100,116,139);
            doc.setFontSize(7);
            doc.text(`Pagina ${i} de ${totalPages}`, pageW - margin, pageH - 6, {align:"right"});
        }

        doc.save(`reporte_gerencial_homenajes_${reporteFechaNombre20260718()}.pdf`);
        setEstadoExportacion("PDF generado correctamente. Revise la carpeta Descargas.", "ok");
        toast("PDF generado correctamente.");
    }catch(error){
        console.error("Error PDF definitivo 20260718:", error);
        try{
            descargarTextoHtmlRespaldo20260718(datosReporteSeguro20260718());
            setEstadoExportacion("El navegador bloqueo el PDF. Se descargó un HTML imprimible como respaldo.", "error");
        }catch(_e){
            setEstadoExportacion(`Error PDF: ${error.message}`, "error");
        }
        toast("No se pudo generar PDF directo. Revise el respaldo.", "error");
    }finally{
        showLoading(false);
    }
}

function filasExcel20260718(datos){
    const {rows, resumen, cumplimiento, faltante, operativo, dims} = datos;
    return {
        "Resumen Ejecutivo":[
            {Indicador:"Fecha generación", Valor:new Date().toLocaleString("es-CO")},
            {Indicador:"Meta del rango", Valor:Math.round(META_RANGO_ACTUAL || 0)},
            {Indicador:"Venta real", Valor:Math.round(resumen.total || 0)},
            {Indicador:"Cumplimiento", Valor:`${cumplimiento.toFixed(1)}%`},
            {Indicador:"Faltante", Valor:Math.round(faltante || 0)},
            {Indicador:"Particular", Valor:Math.round(resumen.particular || 0)},
            {Indicador:"Red", Valor:Math.round(resumen.red || 0)},
            {Indicador:"Excedentes", Valor:Math.round(resumen.excedentes || 0)},
            {Indicador:"Plan cantidad", Valor:resumen.planCantidad || 0},
            {Indicador:"Registros analizados", Valor:rows.length}
        ],
        "Categorias":dims.categorias.map(r=>({Categoria:r.Categoria,Cantidad:r.Cantidad,Venta:Math.round(r.Venta),Meta:Math.round(r.Meta),Cumplimiento:`${toNumber(r.Cumplimiento).toFixed(1)}%`,Estado:r.Estado})),
        "Gestores":dims.gestores.map(r=>({Gestor:r.Gestor,Cantidad:r.Cantidad,Venta:Math.round(r.Venta),Meta:Math.round(r.Meta),Cumplimiento:`${toNumber(r.Cumplimiento).toFixed(1)}%`,Estado:r.Estado})),
        "Excedentes":dims.excedentes.map(r=>({Excedente:r.Excedente,Cantidad:r.Cantidad,Venta:Math.round(r.Venta),Meta:Math.round(r.Meta),Cumplimiento:`${toNumber(r.Cumplimiento).toFixed(1)}%`,Estado:r.Estado})),
        "Homenaje Excedente":dims.homenaje.map(r=>({Tipo:r.nombre,Cantidad:r.cantidad,Venta:Math.round(r.valor),Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})),
        "Clinicas":dims.clinicas.map(r=>({Clinica:r.nombre,Reportes:r.cantidad,Venta:Math.round(r.valor),Promedio_Diario:formatNumber(r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1),2),Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})),
        "Municipios":dims.municipios.map(r=>({Municipio:r.nombre,Atenciones:r.cantidad,Venta:Math.round(r.valor),Promedio_Diario:formatNumber(r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1),2),Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})),
        "Tipo Muerte":dims.tipoMuerte.map(r=>({Tipo:r.nombre,Cantidad:r.cantidad,Promedio_Diario:formatNumber(r.cantidad/Math.max(DIAS_RANGO_ACTUAL,1),2),Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})),
        "Cementerios":dims.cementerios.map(r=>({Cementerio:r.nombre,Servicios:r.cantidad,Venta:Math.round(r.valor),Promedio_Mensual:formatNumber(r.cantidad/Math.max(MESES_EQUIVALENTES_ACTUAL,1),2),Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})),
        "Destino Final":dims.destinoFinal.map(r=>({Destino:r.nombre,Servicios:r.cantidad,Venta:Math.round(r.valor),Promedio_Mensual:formatNumber(r.cantidad/Math.max(MESES_EQUIVALENTES_ACTUAL,1),2),Participacion:`${toNumber(r.porcentaje).toFixed(1)}%`})),
        "Datos Filtrados":rows.map(row=>({Fecha:formatFechaProfesional(row.fecha,row.fechaTexto||""),Orden:row.ordenServicio,Gestor:row.gestor,Sede:row.sede,Categoria:row.categoriaGerencial,Servicio:row.servicio,Clinica:row.clinica,Municipio:row.municipio,Tipo_Muerte:row.tipoMuerte,Cementerio:row.cementerio,Destino_Final:row.destinoFinal,Cantidad:row.cantidadAtendida,Valor_Venta:Math.round(row.valorVenta)})),
        "Energia":(operativo.energia||[]).map(item=>({Año:item.anio,Mes:nombreMes(item.mes),kWh:toNumber(item.kwh),Costo:toNumber(item.costo),Observacion:item.observacion||""})),
        "Vacaciones":(operativo.vacaciones||[]).map(item=>({Colaborador:item.nombre||"",Cargo:item.cargo||"",Inicio:item.inicio||"",Fin:item.fin||"",Dias:item.dias||0,Estado:estadoVacacion(item)})),
        "Agenda":(operativo.agenda||[]).map(item=>({Fecha:item.fecha||"",Hora:horaActividad(item),Actividad:item.titulo||"",Responsable:item.responsable||"",Estado:item.estado||"",Detalle:item.detalle||""})),
        "Tiempo Afiliado":(operativo.tiempoAfiliado?.enriquecidos||[]).map(item=>({Orden:item.ordenServicio||"",Numero_Contrato:item.contrato||item.numeroContrato||"",Plan:item.plan||"",Tipo_Afiliacion:item.tipoAfiliacion||"",Edad:item.edad||"",Fecha_Orden:item.fechaOrden||"",Tiempo_Transcurrido:item.tiempo?.texto||"",Clasificacion:item.tiempo?.clasificacion||"",Fuente:item.origen||"LOCAL"}))
    };
}

function exportarExcelDefinitivo20260718(){
    showLoading(true);
    setEstadoExportacion("Generando Excel definitivo...", "");
    try{
        const datos = datosReporteSeguro20260718();
        const hojas = filasExcel20260718(datos);
        if(window.XLSX){
            const wb = XLSX.utils.book_new();
            Object.entries(hojas).forEach(([nombre, filas]) => {
                const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{Mensaje:"Sin información disponible"}]);
                ws["!cols"] = Object.keys(filas[0] || {Mensaje:""}).map(k => ({wch:Math.min(Math.max(String(k).length + 6, 12), 35)}));
                XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0,31));
            });
            XLSX.writeFile(wb, `dashboard_gerencial_homenajes_${reporteFechaNombre20260718()}.xlsx`);
        }else{
            const xml = crearExcelXmlMultiHoja(datos);
            descargarBlobBlindado(`dashboard_gerencial_homenajes_${reporteFechaNombre20260718()}.xls`, new Blob([xml], {type:"application/vnd.ms-excel;charset=utf-8"}));
        }
        setEstadoExportacion("Excel generado correctamente. Revise la carpeta Descargas.", "ok");
        toast("Excel generado correctamente.");
    }catch(error){
        console.error("Error Excel definitivo 20260718:", error);
        setEstadoExportacion(`Error Excel: ${error.message}`, "error");
        toast("No se pudo generar Excel.", "error");
    }finally{
        showLoading(false);
    }
}

function exportarImagenDefinitiva20260718(){
    showLoading(true);
    setEstadoExportacion("Generando imagen PNG definitiva...", "");
    try{
        const datos = datosReporteSeguro20260718();
        const {rows, resumen, cumplimiento, faltante, dims} = datos;
        const canvas = document.createElement("canvas");
        canvas.width = 1600;
        canvas.height = 2100;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = "#004f2a"; ctx.fillRect(0,0,canvas.width,118);
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 42px Arial"; ctx.fillText("REPORTE GERENCIAL DE HOMENAJES", 55, 68);
        ctx.font = "22px Arial"; ctx.fillText(`Generado: ${new Date().toLocaleString("es-CO")}`, 55, 102);
        let y = 155;
        function card(x,title,value,detail){
            ctx.fillStyle="#f8fafc"; ctx.fillRect(x,y,335,118); ctx.strokeStyle="#dbe5ef"; ctx.strokeRect(x,y,335,118);
            ctx.fillStyle="#64748b"; ctx.font="bold 19px Arial"; ctx.fillText(title,x+24,y+34);
            ctx.fillStyle="#0f172a"; ctx.font="bold 34px Arial"; ctx.fillText(value,x+24,y+76);
            ctx.fillStyle="#64748b"; ctx.font="17px Arial"; ctx.fillText(detail,x+24,y+103);
        }
        card(55,"Meta",formatMoney(META_RANGO_ACTUAL),"Rango seleccionado");
        card(420,"Venta real",formatMoney(resumen.total),`${cumplimiento.toFixed(1)}% cumplimiento`);
        card(785,"Faltante",formatMoney(faltante),textoEstado(cumplimiento));
        card(1150,"Registros",formatNumber(rows.length),"base analizada");
        y += 175;
        function bars(title,data,labelFn,valueFn,formatter,maxRows){
            ctx.fillStyle="#004f2a"; ctx.font="bold 29px Arial"; ctx.fillText(title,55,y); y += 38;
            const arr=(data||[]).slice(0,maxRows); const max=Math.max(...arr.map(valueFn),1);
            arr.forEach(item=>{
                const val=Number(valueFn(item)||0); const label=textoSeguro20260718(labelFn(item)).slice(0,44);
                ctx.fillStyle="#0f172a"; ctx.font="bold 20px Arial"; ctx.fillText(label,75,y+24);
                ctx.fillStyle="#e6f4ed"; ctx.fillRect(500,y,800,24);
                ctx.fillStyle="#008f46"; ctx.fillRect(500,y,Math.max(4,(val/max)*800),24);
                ctx.fillStyle="#0f172a"; ctx.font="bold 19px Arial"; ctx.fillText(formatter(val),1325,y+22);
                y += 48;
            });
            y += 28;
        }
        bars("Ventas por categoria", dims.categorias, r=>r.Categoria, r=>r.Venta, formatMoney, 4);
        bars("Ranking de gestores", dims.gestores, r=>r.Gestor, r=>r.Venta, formatMoney, 10);
        bars("Clinicas que mas reportan", dims.clinicas, r=>r.nombre, r=>r.cantidad, formatNumber, 10);
        canvas.toBlob(blob => {
            if(blob) descargarBlobBlindado(`dashboard_gerencial_${reporteFechaNombre20260718()}.png`, blob);
            setEstadoExportacion(blob ? "Imagen generada correctamente. Revise Descargas." : "No se pudo crear la imagen.", blob ? "ok" : "error");
            toast(blob ? "Imagen generada correctamente." : "No se pudo generar imagen.", blob ? "ok" : "error");
            showLoading(false);
        }, "image/png", .95);
    }catch(error){
        console.error("Error Imagen definitiva 20260718:", error);
        setEstadoExportacion(`Error Imagen: ${error.message}`, "error");
        toast("No se pudo generar imagen.", "error");
        showLoading(false);
    }
}

function vincularExportacionFinal20260718(id, handler){
    const btn = $(id);
    if(!btn) return;
    const nuevo = btn.cloneNode(true);
    btn.parentNode.replaceChild(nuevo, btn);
    nuevo.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        handler();
    });
}

function instalarExportacionesFinales20260718(){
    vincularExportacionFinal20260718("btnPdf", exportarPDFDefinitivo20260718);
    vincularExportacionFinal20260718("btnExcel", exportarExcelDefinitivo20260718);
    vincularExportacionFinal20260718("btnImagen", exportarImagenDefinitiva20260718);
    vincularExportacionFinal20260718("reportePdfGeneral", exportarPDFDefinitivo20260718);
    vincularExportacionFinal20260718("reporteExcelResumen", exportarExcelDefinitivo20260718);
    vincularExportacionFinal20260718("reporteImagen", exportarImagenDefinitiva20260718);
    setEstadoExportacion("Motor definitivo activo: PDF con jsPDF, Excel multihoja e Imagen PNG.", "ok");
}

instalarExportacionesFinales20260718();


/* =========================================================
   EXPORTACION FINAL FORZADA 20260719
   Este bloque queda al final y reemplaza cualquier evento viejo.
   ========================================================= */
console.log("EXPORTACION FINAL FORZADA ACTIVA - VERSION 20260719");

async function asegurarJsPDF20260719(){
    if(window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if(window.jsPDF) return window.jsPDF;
    await new Promise((resolve, reject) => {
        const viejo = document.getElementById("jspdf-forzado-20260719");
        if(viejo){ viejo.addEventListener("load", resolve, {once:true}); viejo.addEventListener("error", reject, {once:true}); return; }
        const script = document.createElement("script");
        script.id = "jspdf-forzado-20260719";
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("No se pudo cargar jsPDF."));
        document.head.appendChild(script);
    });
    if(window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
    if(window.jsPDF) return window.jsPDF;
    throw new Error("jsPDF no esta disponible despues de cargar la libreria.");
}

function textoPlanoPDF20260719(valor){
    return String(valor ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
        .trim();
}

function datosMinimosReporte20260719(){
    try{
        if(typeof aplicarFiltrosYRender === "function" && (!ULTIMO_RESUMEN || !ULTIMA_META_INFO)) aplicarFiltrosYRender();
    }catch(e){ console.warn("No se pudo refrescar filtros antes del reporte.", e); }

    const rows = Array.isArray(DATASET_FILTRADO) && DATASET_FILTRADO.length ? DATASET_FILTRADO : (Array.isArray(DATASET_NORMAL) ? DATASET_NORMAL : []);
    let resumen = ULTIMO_RESUMEN;
    try{ resumen = resumen || calcularResumen(rows); }catch(e){ resumen = {total:0, particular:0, red:0, excedentes:0, planCantidad:0}; }
    const meta = Number(META_RANGO_ACTUAL || 0);
    const cumplimiento = meta > 0 ? ((Number(resumen.total || 0) / meta) * 100) : 0;
    const faltante = Math.max(meta - Number(resumen.total || 0), 0);
    return {rows, resumen, meta, cumplimiento, faltante};
}

function agruparSimpleReporte20260719(rows, campo, valorCampo="valorVenta", limite=12){
    const mapa = new Map();
    (rows || []).forEach(row => {
        const nombre = textoPlanoPDF20260719(row?.[campo] || "SIN REGISTRO") || "SIN REGISTRO";
        const actual = mapa.get(nombre) || {nombre, cantidad:0, valor:0};
        actual.cantidad += Number(row?.cantidadAtendida || 1);
        actual.valor += Number(row?.[valorCampo] || 0);
        mapa.set(nombre, actual);
    });
    return Array.from(mapa.values()).sort((a,b) => b.valor - a.valor || b.cantidad - a.cantidad).slice(0, limite);
}

async function exportarPDFForzado20260719(){
    console.log("Iniciando PDF forzado 20260719");
    if(typeof showLoading === "function") showLoading(true);
    try{
        const jsPDF = await asegurarJsPDF20260719();
        const {rows, resumen, meta, cumplimiento, faltante} = datosMinimosReporte20260719();
        const doc = new jsPDF({orientation:"landscape", unit:"mm", format:"a4"});
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        let y = 14;
        const margin = 12;

        const money = v => "$" + Math.round(Number(v || 0)).toLocaleString("es-CO");
        const num = v => Math.round(Number(v || 0)).toLocaleString("es-CO");

        function header(titulo){
            doc.setFillColor(0, 79, 42);
            doc.rect(0, 0, pageW, 22, "F");
            doc.setTextColor(255,255,255);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(16);
            doc.text(textoPlanoPDF20260719(titulo), margin, 13);
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.text(textoPlanoPDF20260719(new Date().toLocaleString("es-CO")), pageW - margin, 13, {align:"right"});
            doc.setTextColor(15,23,42);
            y = 32;
        }
        function newPage(titulo="Reporte Gerencial de Homenajes"){
            doc.addPage();
            header(titulo);
        }
        function section(t){
            if(y > pageH - 28) newPage();
            doc.setTextColor(0,79,42);
            doc.setFont("helvetica","bold");
            doc.setFontSize(12);
            doc.text(textoPlanoPDF20260719(t), margin, y);
            y += 7;
            doc.setTextColor(15,23,42);
        }
        function card(x, title, value, detail){
            doc.setDrawColor(210,220,230);
            doc.setFillColor(248,250,252);
            doc.roundedRect(x, y, 62, 25, 3, 3, "FD");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7.5);
            doc.setTextColor(100,116,139);
            doc.text(textoPlanoPDF20260719(title), x+4, y+7);
            doc.setTextColor(15,23,42);
            doc.setFontSize(12.5);
            doc.text(textoPlanoPDF20260719(value), x+4, y+16);
            doc.setFontSize(6.5);
            doc.setTextColor(100,116,139);
            doc.text(textoPlanoPDF20260719(detail || ""), x+4, y+22);
        }
        function table(title, columns, data, maxRows=18){
            section(title);
            const rowsTable = (data && data.length ? data : [{nombre:"SIN INFORMACION", cantidad:0, valor:0}]).slice(0,maxRows);
            const rowH = 7;
            const usable = pageW - margin*2;
            const widths = columns.map(c => c.w || (usable / columns.length));
            if(y + rowH * (rowsTable.length + 1) > pageH - 10) newPage(title);
            let x = margin;
            doc.setFillColor(0,127,63);
            doc.rect(margin,y,usable,rowH,"F");
            doc.setTextColor(255,255,255);
            doc.setFont("helvetica","bold");
            doc.setFontSize(7);
            columns.forEach((c,i)=>{ doc.text(textoPlanoPDF20260719(c.h), x+2, y+4.7, {maxWidth:widths[i]-4}); x += widths[i]; });
            y += rowH;
            rowsTable.forEach((r,idx)=>{
                if(y + rowH > pageH - 10) newPage(title);
                x = margin;
                doc.setFillColor(idx % 2 ? 255 : 248, idx % 2 ? 255 : 250, idx % 2 ? 255 : 252);
                doc.rect(margin,y,usable,rowH,"F");
                doc.setTextColor(15,23,42);
                doc.setFont("helvetica","normal");
                doc.setFontSize(6.6);
                columns.forEach((c,i)=>{
                    let v = typeof c.v === "function" ? c.v(r) : r[c.k];
                    v = textoPlanoPDF20260719(v);
                    if(c.max && v.length > c.max) v = v.slice(0,c.max-1) + ".";
                    doc.text(v || "-", x+2, y+4.7, {maxWidth:widths[i]-4});
                    x += widths[i];
                });
                y += rowH;
            });
            y += 8;
        }

        header("Reporte Gerencial de Homenajes");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(0,79,42);
        doc.text("Resumen ejecutivo", margin, y);
        y += 9;
        card(margin, "Meta", money(meta), "Rango seleccionado");
        card(margin+67, "Venta real", money(resumen.total), `${cumplimiento.toFixed(1)}% cumplimiento`);
        card(margin+134, "Faltante", money(faltante), "Valor pendiente");
        card(margin+201, "Registros", num(rows.length), "Base filtrada");
        y += 36;
        doc.setFont("helvetica","normal");
        doc.setFontSize(9);
        doc.setTextColor(15,23,42);
        const intro = doc.splitTextToSize(textoPlanoPDF20260719(`Este reporte consolida la informacion filtrada del dashboard. Venta real: ${money(resumen.total)}. Cumplimiento: ${cumplimiento.toFixed(1)}%. Faltante: ${money(faltante)}.`), pageW - margin*2);
        doc.text(intro, margin, y); y += intro.length*5 + 6;

        const categorias = [
            {nombre:"PARTICULAR", cantidad: rows.filter(r=>r.categoriaGerencial==="PARTICULAR").length, valor:Number(resumen.particular||0)},
            {nombre:"RED", cantidad: rows.filter(r=>r.categoriaGerencial==="RED").length, valor:Number(resumen.red||0)},
            {nombre:"EXCEDENTES", cantidad: rows.filter(r=>r.categoriaGerencial==="EXCEDENTES").length, valor:Number(resumen.excedentes||0)},
            {nombre:"PLAN", cantidad: Number(resumen.planCantidad||0), valor:0}
        ];
        table("Ventas por categoria", [
            {h:"Categoria", k:"nombre", w:80},
            {h:"Cantidad", v:r=>num(r.cantidad), w:35},
            {h:"Venta", v:r=>money(r.valor), w:55},
            {h:"Participacion", v:r=> resumen.total ? `${((Number(r.valor||0)/Number(resumen.total||1))*100).toFixed(1)}%` : "0%", w:45}
        ], categorias, 10);

        table("Ranking de gestores", [
            {h:"Gestor", k:"nombre", w:95, max:38},
            {h:"Servicios", v:r=>num(r.cantidad), w:30},
            {h:"Venta", v:r=>money(r.valor), w:55}
        ], agruparSimpleReporte20260719(rows,"gestor"), 16);

        table("Clinicas principales", [
            {h:"Clinica", k:"nombre", w:110, max:45},
            {h:"Reportes", v:r=>num(r.cantidad), w:30},
            {h:"Venta", v:r=>money(r.valor), w:50}
        ], agruparSimpleReporte20260719(rows,"clinica"), 16);

        table("Municipios", [
            {h:"Municipio", k:"nombre", w:90, max:38},
            {h:"Atenciones", v:r=>num(r.cantidad), w:35},
            {h:"Venta", v:r=>money(r.valor), w:55}
        ], agruparSimpleReporte20260719(rows,"municipio"), 16);

        newPage("Destino final y control");
        table("Cementerios", [
            {h:"Cementerio", k:"nombre", w:110, max:45},
            {h:"Servicios", v:r=>num(r.cantidad), w:30},
            {h:"Venta", v:r=>money(r.valor), w:50}
        ], agruparSimpleReporte20260719(rows,"cementerio"), 18);
        table("Destino final", [
            {h:"Destino", k:"nombre", w:80},
            {h:"Servicios", v:r=>num(r.cantidad), w:35},
            {h:"Venta", v:r=>money(r.valor), w:55}
        ], agruparSimpleReporte20260719(rows,"destinoFinal"), 12);
        table("Tipo de muerte", [
            {h:"Tipo", k:"nombre", w:80},
            {h:"Cantidad", v:r=>num(r.cantidad), w:35},
            {h:"Venta", v:r=>money(r.valor), w:55}
        ], agruparSimpleReporte20260719(rows,"tipoMuerte"), 10);

        const totalPages = doc.internal.getNumberOfPages();
        for(let p=1; p<=totalPages; p++){
            doc.setPage(p);
            doc.setFontSize(7);
            doc.setTextColor(100,116,139);
            doc.text(`Pagina ${p} de ${totalPages}`, pageW - margin, pageH - 6, {align:"right"});
        }
        doc.save(`reporte_gerencial_homenajes_${new Date().toISOString().slice(0,10)}.pdf`);
        if(typeof setEstadoExportacion === "function") setEstadoExportacion("PDF generado correctamente con motor forzado 20260719.", "ok");
        if(typeof toast === "function") toast("PDF generado correctamente.");
    }catch(error){
        console.error("Error PDF forzado 20260719:", error);
        alert("No se pudo generar el PDF. Revise la consola. Error: " + error.message);
    }finally{
        if(typeof showLoading === "function") showLoading(false);
    }
}

function generarExcelBasico20260719(){
    const {rows, resumen, meta, cumplimiento, faltante} = datosMinimosReporte20260719();
    const hoja = [
        ["REPORTE GERENCIAL DE HOMENAJES"],
        ["Fecha generacion", new Date().toLocaleString("es-CO")],
        [],
        ["Indicador", "Valor"],
        ["Meta", meta],
        ["Venta real", resumen.total || 0],
        ["Cumplimiento", `${cumplimiento.toFixed(1)}%`],
        ["Faltante", faltante],
        ["Registros", rows.length],
        [],
        ["Fecha", "Orden", "Gestor", "Sede", "Categoria", "Servicio", "Clinica", "Municipio", "Tipo muerte", "Cementerio", "Destino final", "Cantidad", "Venta"]
    ];
    rows.forEach(r => hoja.push([
        typeof formatFechaProfesional === "function" ? formatFechaProfesional(r.fecha, r.fechaTexto || "") : (r.fechaTexto || ""),
        r.ordenServicio || "", r.gestor || "", r.sede || "", r.categoriaGerencial || "", r.servicio || "",
        r.clinica || "", r.municipio || "", r.tipoMuerte || "", r.cementerio || "", r.destinoFinal || "",
        r.cantidadAtendida || 1, Math.round(Number(r.valorVenta || 0))
    ]));
    const csv = hoja.map(row => row.map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], {type:"text/csv;charset=utf-8"});
    if(typeof descargarBlobBlindado === "function") descargarBlobBlindado(`dashboard_gerencial_homenajes_${new Date().toISOString().slice(0,10)}.csv`, blob);
    else {
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `dashboard_gerencial_homenajes_${new Date().toISOString().slice(0,10)}.csv`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500);
    }
}

function instalarExportacionForzada20260719(){
    [["btnPdf", exportarPDFForzado20260719], ["reportePdfGeneral", exportarPDFForzado20260719], ["btnExcel", generarExcelBasico20260719], ["reporteExcelResumen", generarExcelBasico20260719]].forEach(([id, fn]) => {
        const old = document.getElementById(id);
        if(!old) return;
        const nuevo = old.cloneNode(true);
        old.parentNode.replaceChild(nuevo, old);
        nuevo.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); fn(); });
    });
}

instalarExportacionForzada20260719();


/* =========================================================
   EXPORTACION FINAL ESTABLE 20260722
   PDF e Imagen descargan como Blob directo. Reemplaza eventos anteriores.
   ========================================================= */
console.log("EXPORTACION FINAL ESTABLE ACTIVA - VERSION 20260725");

function descargarArchivo20260722(nombre, blob){
    if(!blob || !(blob instanceof Blob)){
        throw new Error("No se pudo construir el archivo de descarga.");
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.rel = "noopener noreferrer";
    a.style.position = "fixed";
    a.style.left = "-10000px";
    a.style.top = "-10000px";
    a.style.width = "1px";
    a.style.height = "1px";
    document.body.appendChild(a);

    a.click();

    setTimeout(() => {
        try{ a.remove(); }catch(_e){}
        try{ URL.revokeObjectURL(url); }catch(_e){}
    }, 6000);
}

function fechaArchivo20260722(){
    return new Date().toISOString().slice(0,10);
}

function money20260722(valor){
    return "$" + Math.round(Number(valor || 0)).toLocaleString("es-CO");
}

function number20260722(valor){
    return Math.round(Number(valor || 0)).toLocaleString("es-CO");
}

function limpiar20260722(valor){
    return String(valor ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
        .trim();
}

function obtenerReporteBase20260722(){
    try{
        if(typeof aplicarFiltrosYRender === "function") aplicarFiltrosYRender();
    }catch(error){
        console.warn("No se pudo refrescar el dashboard antes de exportar.", error);
    }

    const rows = Array.isArray(DATASET_FILTRADO) && DATASET_FILTRADO.length
        ? DATASET_FILTRADO
        : (Array.isArray(DATASET_NORMAL) ? DATASET_NORMAL : []);

    let resumen = ULTIMO_RESUMEN;
    if(!resumen && typeof calcularResumen === "function"){
        try{ resumen = calcularResumen(rows); }catch(_e){}
    }
    resumen = resumen || {total:0, particular:0, red:0, excedentes:0, planCantidad:0};

    const meta = Number(META_RANGO_ACTUAL || 0);
    const cumplimiento = meta > 0 ? (Number(resumen.total || 0) / meta) * 100 : 0;
    const faltante = Math.max(meta - Number(resumen.total || 0), 0);

    return {rows, resumen, meta, cumplimiento, faltante};
}

function agruparReporte20260722(rows, campo, limite=12){
    const mapa = new Map();
    (rows || []).forEach(row => {
        const nombre = limpiar20260722(row?.[campo] || "SIN REGISTRO") || "SIN REGISTRO";
        const actual = mapa.get(nombre) || {nombre, cantidad:0, valor:0};
        actual.cantidad += Number(row?.cantidadAtendida || 1);
        actual.valor += Number(row?.valorVenta || 0);
        mapa.set(nombre, actual);
    });
    return Array.from(mapa.values())
        .sort((a,b) => b.valor - a.valor || b.cantidad - a.cantidad)
        .slice(0, limite);
}

function crearHtmlReporte20260722(){
    const {rows, resumen, meta, cumplimiento, faltante} = obtenerReporteBase20260722();
    const categoria = [
        {nombre:"PARTICULAR", cantidad:rows.filter(r => r.categoriaGerencial === "PARTICULAR").length, valor:resumen.particular || 0},
        {nombre:"RED", cantidad:rows.filter(r => r.categoriaGerencial === "RED").length, valor:resumen.red || 0},
        {nombre:"EXCEDENTES", cantidad:rows.filter(r => r.categoriaGerencial === "EXCEDENTES").length, valor:resumen.excedentes || 0},
        {nombre:"PLAN", cantidad:resumen.planCantidad || 0, valor:0}
    ];

    const tabla = (titulo, data) => `
        <h2>${titulo}</h2>
        <table>
            <thead><tr><th>Concepto</th><th>Cantidad</th><th>Valor</th></tr></thead>
            <tbody>${(data || []).map(x => `<tr><td>${limpiar20260722(x.nombre)}</td><td>${number20260722(x.cantidad)}</td><td>${money20260722(x.valor)}</td></tr>`).join("")}</tbody>
        </table>`;

    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte Gerencial</title>
    <style>
        body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#0f172a;background:#fff;}
        .header{background:#004f2a;color:#fff;padding:18px 22px;border-radius:14px;margin-bottom:16px;}
        h1{margin:0;font-size:24px;} h2{color:#004f2a;margin:24px 0 8px;font-size:17px;}
        .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0;}
        .kpi{border:1px solid #d8e3dc;border-radius:12px;padding:12px;background:#f7fbf8;}
        .kpi small{display:block;color:#64748b;font-weight:bold;} .kpi strong{font-size:21px;display:block;margin-top:6px;}
        table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px;} th{background:#008f46;color:#fff;} th,td{border:1px solid #dbe5df;padding:7px;text-align:left;} tr:nth-child(even){background:#f8fafc;}
        .nota{font-size:12px;line-height:1.5;margin:12px 0 18px;}
        @media print{body{margin:12mm}.header{border-radius:0}.kpis{grid-template-columns:repeat(2,1fr)}}
    </style></head><body>
        <div class="header"><h1>Reporte Gerencial de Homenajes</h1><p>Generado: ${new Date().toLocaleString("es-CO")}</p></div>
        <div class="nota">Venta real: <strong>${money20260722(resumen.total)}</strong>. Cumplimiento: <strong>${cumplimiento.toFixed(1)}%</strong>. Faltante: <strong>${money20260722(faltante)}</strong>.</div>
        <div class="kpis">
            <div class="kpi"><small>Meta</small><strong>${money20260722(meta)}</strong></div>
            <div class="kpi"><small>Venta real</small><strong>${money20260722(resumen.total)}</strong></div>
            <div class="kpi"><small>Cumplimiento</small><strong>${cumplimiento.toFixed(1)}%</strong></div>
            <div class="kpi"><small>Registros</small><strong>${number20260722(rows.length)}</strong></div>
        </div>
        ${tabla("Ventas por categoria", categoria)}
        ${tabla("Ranking de gestores", agruparReporte20260722(rows,"gestor",15))}
        ${tabla("Clinicas principales", agruparReporte20260722(rows,"clinica",15))}
        ${tabla("Municipios", agruparReporte20260722(rows,"municipio",15))}
        ${tabla("Cementerios", agruparReporte20260722(rows,"cementerio",15))}
        ${tabla("Destino final", agruparReporte20260722(rows,"destinoFinal",12))}
        ${tabla("Tipo de muerte", agruparReporte20260722(rows,"tipoMuerte",10))}
    </body></html>`;
}

function abrirReporteImprimible20260722(){
    const html = crearHtmlReporte20260722();
    const blob = new Blob([html], {type:"text/html;charset=utf-8"});
    descargarArchivo20260722(`reporte_gerencial_imprimible_${fechaArchivo20260722()}.html`, blob);
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if(win){
        setTimeout(() => { try{ win.focus(); }catch(_e){} }, 300);
        setTimeout(() => { try{ URL.revokeObjectURL(url); }catch(_e){} }, 15000);
    }
}

async function obtenerJsPDF20260722(){
    if(window.jspdf?.jsPDF) return window.jspdf.jsPDF;
    if(window.jsPDF) return window.jsPDF;

    await new Promise((resolve, reject) => {
        const id = "jspdf-estable-20260722";
        const existente = document.getElementById(id);
        if(existente){
            existente.addEventListener("load", resolve, {once:true});
            existente.addEventListener("error", reject, {once:true});
            return;
        }
        const script = document.createElement("script");
        script.id = id;
        script.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("No se pudo cargar jsPDF desde CDN."));
        document.head.appendChild(script);
    });

    if(window.jspdf?.jsPDF) return window.jspdf.jsPDF;
    if(window.jsPDF) return window.jsPDF;
    throw new Error("jsPDF no quedó disponible.");
}

async function exportarPDFEstable20260722(){
    console.log("CLICK PDF - EXPORTACION ESTABLE 20260722");
    if(typeof showLoading === "function") showLoading(true);
    try{
        const jsPDF = await obtenerJsPDF20260722();
        const {rows, resumen, meta, cumplimiento, faltante} = obtenerReporteBase20260722();
        const doc = new jsPDF({orientation:"landscape", unit:"mm", format:"a4", compress:true});
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 12;
        let y = 14;

        function header(titulo){
            doc.setFillColor(0,79,42);
            doc.rect(0,0,pageW,22,"F");
            doc.setTextColor(255,255,255);
            doc.setFont("helvetica","bold");
            doc.setFontSize(16);
            doc.text(limpiar20260722(titulo), margin, 13);
            doc.setFontSize(8);
            doc.setFont("helvetica","normal");
            doc.text(limpiar20260722(new Date().toLocaleString("es-CO")), pageW-margin, 13, {align:"right"});
            doc.setTextColor(15,23,42);
            y = 32;
        }
        function nuevaPagina(titulo="Reporte Gerencial de Homenajes"){
            doc.addPage();
            header(titulo);
        }
        function seccion(titulo){
            if(y > pageH - 25) nuevaPagina();
            doc.setFont("helvetica","bold");
            doc.setFontSize(12);
            doc.setTextColor(0,79,42);
            doc.text(limpiar20260722(titulo), margin, y);
            y += 7;
            doc.setTextColor(15,23,42);
        }
        function tarjeta(x, titulo, valor, detalle){
            doc.setDrawColor(210,220,230);
            doc.setFillColor(248,250,252);
            doc.roundedRect(x,y,62,25,3,3,"FD");
            doc.setFont("helvetica","bold");
            doc.setFontSize(7.5);
            doc.setTextColor(100,116,139);
            doc.text(limpiar20260722(titulo),x+4,y+7);
            doc.setTextColor(15,23,42);
            doc.setFontSize(12.5);
            doc.text(limpiar20260722(valor),x+4,y+16);
            doc.setFontSize(6.5);
            doc.setTextColor(100,116,139);
            doc.text(limpiar20260722(detalle || ""),x+4,y+22);
        }
        function tabla(titulo, columnas, data, maxRows=15){
            seccion(titulo);
            const body = (data && data.length ? data : [{nombre:"SIN INFORMACION", cantidad:0, valor:0}]).slice(0,maxRows);
            const rowH = 7;
            const usable = pageW - margin*2;
            const widths = columnas.map(c => c.w || usable / columnas.length);
            if(y + rowH*(body.length+1) > pageH-10) nuevaPagina(titulo);
            let x = margin;
            doc.setFillColor(0,143,70);
            doc.rect(margin,y,usable,rowH,"F");
            doc.setTextColor(255,255,255);
            doc.setFont("helvetica","bold");
            doc.setFontSize(7);
            columnas.forEach((c,i)=>{ doc.text(limpiar20260722(c.h),x+2,y+4.8,{maxWidth:widths[i]-4}); x += widths[i]; });
            y += rowH;
            body.forEach((r,idx)=>{
                if(y + rowH > pageH-10) nuevaPagina(titulo);
                x = margin;
                doc.setFillColor(idx % 2 ? 255 : 248, idx % 2 ? 255 : 250, idx % 2 ? 255 : 252);
                doc.rect(margin,y,usable,rowH,"F");
                doc.setTextColor(15,23,42);
                doc.setFont("helvetica","normal");
                doc.setFontSize(6.6);
                columnas.forEach((c,i)=>{
                    let v = typeof c.v === "function" ? c.v(r) : r[c.k];
                    v = limpiar20260722(v);
                    if(c.max && v.length > c.max) v = v.slice(0,c.max-1) + ".";
                    doc.text(v || "-",x+2,y+4.8,{maxWidth:widths[i]-4});
                    x += widths[i];
                });
                y += rowH;
            });
            y += 8;
        }

        header("Reporte Gerencial de Homenajes");
        tarjeta(margin,"Meta",money20260722(meta),"Rango seleccionado");
        tarjeta(margin+67,"Venta real",money20260722(resumen.total),`${cumplimiento.toFixed(1)}% cumplimiento`);
        tarjeta(margin+134,"Faltante",money20260722(faltante),"Valor pendiente");
        tarjeta(margin+201,"Registros",number20260722(rows.length),"Base filtrada");
        y += 35;
        doc.setFont("helvetica","normal");
        doc.setFontSize(9);
        doc.setTextColor(15,23,42);
        const intro = doc.splitTextToSize(limpiar20260722(`Este reporte consolida la informacion filtrada del dashboard. Venta real: ${money20260722(resumen.total)}. Cumplimiento: ${cumplimiento.toFixed(1)}%. Faltante: ${money20260722(faltante)}.`), pageW - margin*2);
        doc.text(intro, margin, y);
        y += intro.length * 5 + 7;

        const categorias = [
            {nombre:"PARTICULAR", cantidad:rows.filter(r => r.categoriaGerencial === "PARTICULAR").length, valor:resumen.particular || 0},
            {nombre:"RED", cantidad:rows.filter(r => r.categoriaGerencial === "RED").length, valor:resumen.red || 0},
            {nombre:"EXCEDENTES", cantidad:rows.filter(r => r.categoriaGerencial === "EXCEDENTES").length, valor:resumen.excedentes || 0},
            {nombre:"PLAN", cantidad:resumen.planCantidad || 0, valor:0}
        ];

        tabla("Ventas por categoria",[
            {h:"Categoria",k:"nombre",w:80},{h:"Cantidad",v:r=>number20260722(r.cantidad),w:35},{h:"Venta",v:r=>money20260722(r.valor),w:55},{h:"%",v:r=>resumen.total?`${((Number(r.valor||0)/Number(resumen.total||1))*100).toFixed(1)}%`:"0%",w:30}
        ],categorias,8);
        tabla("Ranking de gestores",[
            {h:"Gestor",k:"nombre",w:100,max:42},{h:"Servicios",v:r=>number20260722(r.cantidad),w:30},{h:"Venta",v:r=>money20260722(r.valor),w:55}
        ],agruparReporte20260722(rows,"gestor",15),15);
        tabla("Clinicas principales",[
            {h:"Clinica",k:"nombre",w:115,max:48},{h:"Reportes",v:r=>number20260722(r.cantidad),w:30},{h:"Venta",v:r=>money20260722(r.valor),w:55}
        ],agruparReporte20260722(rows,"clinica",15),15);
        tabla("Municipios",[
            {h:"Municipio",k:"nombre",w:90,max:38},{h:"Atenciones",v:r=>number20260722(r.cantidad),w:35},{h:"Venta",v:r=>money20260722(r.valor),w:55}
        ],agruparReporte20260722(rows,"municipio",15),15);
        nuevaPagina("Destino final y control");
        tabla("Cementerios",[
            {h:"Cementerio",k:"nombre",w:115,max:48},{h:"Servicios",v:r=>number20260722(r.cantidad),w:30},{h:"Venta",v:r=>money20260722(r.valor),w:55}
        ],agruparReporte20260722(rows,"cementerio",15),15);
        tabla("Destino final",[
            {h:"Destino",k:"nombre",w:85},{h:"Servicios",v:r=>number20260722(r.cantidad),w:35},{h:"Venta",v:r=>money20260722(r.valor),w:55}
        ],agruparReporte20260722(rows,"destinoFinal",12),12);
        tabla("Tipo de muerte",[
            {h:"Tipo",k:"nombre",w:85},{h:"Cantidad",v:r=>number20260722(r.cantidad),w:35},{h:"Venta",v:r=>money20260722(r.valor),w:55}
        ],agruparReporte20260722(rows,"tipoMuerte",10),10);

        const totalPages = doc.internal.getNumberOfPages();
        for(let p=1; p<=totalPages; p++){
            doc.setPage(p);
            doc.setFontSize(7);
            doc.setTextColor(100,116,139);
            doc.text(`Pagina ${p} de ${totalPages}`, pageW-margin, pageH-6, {align:"right"});
        }

        const blob = doc.output("blob");
        descargarArchivo20260722(`reporte_gerencial_homenajes_${fechaArchivo20260722()}.pdf`, blob);
        if(typeof setEstadoExportacion === "function") setEstadoExportacion("PDF descargado correctamente con motor estable 20260722.", "ok");
        if(typeof toast === "function") toast("PDF descargado correctamente.");
    }catch(error){
        console.error("Error PDF estable 20260722:", error);
        try{
            abrirReporteImprimible20260722();
            if(typeof setEstadoExportacion === "function") setEstadoExportacion("No se pudo descargar PDF directo. Se descargó y abrió reporte HTML imprimible.", "error");
        }catch(fallbackError){
            alert("No se pudo generar PDF ni respaldo. Error: " + fallbackError.message);
        }
    }finally{
        if(typeof showLoading === "function") showLoading(false);
    }
}

function exportarImagenEstable20260722(){
    console.log("CLICK IMAGEN - EXPORTACION ESTABLE 20260722");
    try{
        const {rows, resumen, meta, cumplimiento, faltante} = obtenerReporteBase20260722();
        const canvas = document.createElement("canvas");
        canvas.width = 1600;
        canvas.height = 1100;
        const ctx = canvas.getContext("2d");
        if(!ctx) throw new Error("Canvas no disponible.");

        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = "#004f2a";
        ctx.fillRect(0,0,canvas.width,120);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 42px Arial";
        ctx.fillText("Reporte Gerencial de Homenajes",50,58);
        ctx.font = "22px Arial";
        ctx.fillText(new Date().toLocaleString("es-CO"),50,94);

        const card = (x,y,t,v,d) => {
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "#dbe5df";
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.roundRect(x,y,350,115,18); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#64748b"; ctx.font = "bold 20px Arial"; ctx.fillText(t,x+24,y+34);
            ctx.fillStyle = "#0f172a"; ctx.font = "bold 34px Arial"; ctx.fillText(v,x+24,y+75);
            ctx.fillStyle = "#64748b"; ctx.font = "18px Arial"; ctx.fillText(d,x+24,y+102);
        };
        card(50,155,"Meta",money20260722(meta),"Rango seleccionado");
        card(425,155,"Venta real",money20260722(resumen.total),`${cumplimiento.toFixed(1)}% cumplimiento`);
        card(800,155,"Faltante",money20260722(faltante),"Valor pendiente");
        card(1175,155,"Registros",number20260722(rows.length),"Base filtrada");

        ctx.fillStyle = "#004f2a";
        ctx.font = "bold 28px Arial";
        ctx.fillText("Resumen ejecutivo",50,330);
        ctx.fillStyle = "#0f172a";
        ctx.font = "21px Arial";
        ctx.fillText(`Venta real: ${money20260722(resumen.total)} | Cumplimiento: ${cumplimiento.toFixed(1)}% | Faltante: ${money20260722(faltante)}`,50,365);

        const dibujarRanking = (titulo, data, x, y) => {
            ctx.fillStyle = "#004f2a"; ctx.font = "bold 25px Arial"; ctx.fillText(titulo,x,y);
            y += 22;
            const max = Math.max(...data.map(d => Number(d.valor || d.cantidad || 0)),1);
            data.slice(0,8).forEach((d,i) => {
                const valor = Number(d.valor || d.cantidad || 0);
                const ancho = Math.max(8,(valor/max)*520);
                const yy = y + i*46;
                ctx.fillStyle = "#0f172a"; ctx.font = "17px Arial"; ctx.fillText((d.nombre || "-").slice(0,42),x,yy+18);
                ctx.fillStyle = "#00984f"; ctx.fillRect(x+360,yy,ancho,24);
                ctx.fillStyle = "#0f172a"; ctx.font = "bold 16px Arial"; ctx.fillText(d.valor ? money20260722(d.valor) : number20260722(d.cantidad),x+370+ancho,yy+18);
            });
        };
        dibujarRanking("Gestores",agruparReporte20260722(rows,"gestor",8),50,430);
        dibujarRanking("Clinicas",agruparReporte20260722(rows,"clinica",8),50,830);

        canvas.toBlob(blob => {
            if(!blob){ alert("No se pudo crear la imagen PNG."); return; }
            descargarArchivo20260722(`dashboard_gerencial_${fechaArchivo20260722()}.png`, blob);
            if(typeof setEstadoExportacion === "function") setEstadoExportacion("Imagen PNG descargada correctamente con motor estable 20260722.", "ok");
            if(typeof toast === "function") toast("Imagen PNG descargada correctamente.");
        }, "image/png", 0.95);
    }catch(error){
        console.error("Error imagen estable 20260722:", error);
        alert("No se pudo generar la imagen. Error: " + error.message);
    }
}

function generarExcelEstable20260722(){
    console.log("CLICK EXCEL - EXPORTACION ESTABLE 20260722");
    if(typeof generarExcelBasico20260719 === "function") return generarExcelBasico20260719();
    const html = crearHtmlReporte20260722();
    descargarArchivo20260722(`dashboard_gerencial_homenajes_${fechaArchivo20260722()}.html`, new Blob([html], {type:"text/html;charset=utf-8"}));
}

function instalarExportacionesEstables20260722(){
    const pares = [
        ["btnPdf", exportarPDFEstable20260722],
        ["reportePdfGeneral", exportarPDFEstable20260722],
        ["btnExcel", generarExcelEstable20260722],
        ["reporteExcelResumen", generarExcelEstable20260722],
        ["btnImagen", exportarImagenEstable20260722],
        ["reporteImagen", exportarImagenEstable20260722]
    ];

    pares.forEach(([id, fn]) => {
        const old = document.getElementById(id);
        if(!old) return;
        const nuevo = old.cloneNode(true);
        old.parentNode.replaceChild(nuevo, old);
        nuevo.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            fn();
        }, {capture:true});
    });

    if(typeof setEstadoExportacion === "function"){
        setEstadoExportacion("Motor estable 20260722 activo: PDF por Blob, Excel e Imagen PNG.", "ok");
    }
}

instalarExportacionesEstables20260722();
setTimeout(instalarExportacionesEstables20260722, 800);
setTimeout(instalarExportacionesEstables20260722, 2500);


console.log("MEJORAS VISUALES DE GRAFICAS ACTIVAS - VERSION 20260725");


/* =========================================================
   MOTOR PROFESIONAL DE GRÁFICAS 20260723
   Barras legibles, área clara y nombres ejecutivos.
   ========================================================= */
(function(){
    const VERSION_GRAFICAS_PRO = "20260725";

    window.primerNombreGestor = function(nombre){
        const texto = String(nombre || "").trim().toUpperCase();
        if(!texto) return "-";
        const partes = texto.split(/\s+/).filter(Boolean);
        const nombres = [
            "FERNANDO","CARLOS","OSVALDO","ALEXIS","WENDY","SAMIR","MARIO","JESSICA",
            "JULIA","EDER","OSCAR","OCTAVIO","PAOLA","DAVID","ANDRES","JOSE","LUIS",
            "RAUL","JAVIER","MANUEL","SALOMON","HAZAEL","WILLIAM"
        ];
        const encontrado = nombres.find(n => partes.includes(n));
        if(encontrado) return encontrado;
        if(partes.length >= 4) return partes[2] || partes[0];
        return partes[0] || "-";
    };

    window.chartTextColor = function(){ return "#0f172a"; };
    window.chartGridColor = function(){ return "rgba(15,23,42,.105)"; };
    window.chartValueLabelStyle = function(){
        return {
            color:"#052e1a",
            backgroundColor:"rgba(255,255,255,.98)",
            borderColor:"rgba(0,79,42,.18)"
        };
    };

    window.etiquetaGraficaVisible = function(valor, titulo="", label=""){
        const texto = String(valor || "").trim();
        if(!texto) return "-";
        const contexto = normalizarTexto(`${titulo} ${label}`);
        if(contexto.includes("GESTOR") || contexto.includes("GESTORES") || contexto.includes("PARETO")){
            return window.primerNombreGestor(texto);
        }
        if(texto.length > 32) return texto.slice(0,29).trim() + "...";
        return texto;
    };

    window.estadoMetaGrafica = function(porcentaje){
        if(porcentaje >= 100) return "Cumplida";
        if(porcentaje >= 80) return "En riesgo";
        return "No cumple";
    };

    window.crearChartBar = function(idCanvas, labels, data, label, titulo, horizontal=false, tipoValor="money", opciones={}){
        const canvas = $(idCanvas);
        if(!canvas || typeof Chart === "undefined") return;

        registrarPluginGraficas();
        destruirChart(idCanvas);

        opciones = opciones || {};
        const etiquetasOriginales = Array.isArray(labels) ? labels : [];
        const etiquetas = etiquetasOriginales.map(etiqueta => window.etiquetaGraficaVisible(etiqueta, titulo, label));
        const valores = Array.isArray(data) ? data.map(v => toNumber(v)) : [];
        const metas = Array.isArray(opciones.metas) ? opciones.metas.map(v => toNumber(v)) : [];
        const totalReferencia = toNumber(opciones.total) || valores.reduce((acc,v) => acc + Math.abs(toNumber(v)), 0);
        const maxDato = Math.max(...valores.map(v => Math.abs(toNumber(v))), 0);
        const maxMeta = Math.max(...metas.map(v => Math.abs(toNumber(v))), 0);
        const maxValue = Math.max(maxDato, maxMeta, 0);
        const cantidad = Math.max(etiquetas.length, 1);

        const alto = horizontal
            ? Math.min(Math.max(335, cantidad * 43 + 132), 860)
            : 390;
        const barraGruesa = horizontal
            ? Math.min(34, Math.max(25, Math.floor((alto - 130) / cantidad * .72)))
            : 46;

        const labelStyle = window.chartValueLabelStyle();
        const contenedor = canvas.parentElement;
        canvas.setAttribute("height", String(alto));
        canvas.style.setProperty("height", `${alto}px`, "important");
        contenedor?.style.setProperty("min-height", `${alto + 74}px`, "important");
        contenedor?.style.setProperty("height", "auto", "important");
        contenedor?.classList.add("chart-card-enhanced", "chart-card-readable");

        const formatoEtiqueta = (value, ctx) => {
            const i = ctx.dataIndex;
            const valor = toNumber(value);
            const meta = toNumber(metas[i]);
            const valorTexto = formatChartValue(valor, tipoValor);

            if(meta > 0){
                const pct = (valor / meta) * 100;
                const estado = window.estadoMetaGrafica(pct);
                return horizontal
                    ? `${valorTexto} · ${pct.toFixed(1)}% · ${estado}`
                    : [valorTexto, `${pct.toFixed(1)}%`, estado];
            }

            if(totalReferencia > 0 && opciones.mostrarParticipacion !== false){
                const pct = (Math.abs(valor) / totalReferencia) * 100;
                return horizontal
                    ? `${valorTexto} · ${pct.toFixed(1)}% · Part.`
                    : [valorTexto, `${pct.toFixed(1)}%`, "Part."];
            }

            return horizontal ? `${valorTexto} · Sin meta` : [valorTexto, "Sin meta"];
        };

        const barColor = context => {
            const chart = context.chart;
            const {ctx, chartArea} = chart;
            if(!chartArea) return "#008f46";
            const grad = horizontal
                ? ctx.createLinearGradient(chartArea.left,0,chartArea.right,0)
                : ctx.createLinearGradient(0,chartArea.bottom,0,chartArea.top);
            grad.addColorStop(0,"#006b3f");
            grad.addColorStop(.55,"#008f46");
            grad.addColorStop(1,"#22c55e");
            return grad;
        };

        charts[idCanvas] = new Chart(canvas, {
            type:"bar",
            data:{
                labels:etiquetas,
                datasets:[{
                    label:opciones.legendLabel || label,
                    data:valores,
                    backgroundColor:barColor,
                    borderColor:"rgba(0,79,42,.62)",
                    borderWidth:1.4,
                    borderRadius:horizontal ? 10 : 12,
                    barThickness:barraGruesa,
                    maxBarThickness:horizontal ? 36 : 54,
                    minBarLength:horizontal ? 18 : 8,
                    barPercentage:.98,
                    categoryPercentage:.90
                }]
            },
            options:{
                responsive:true,
                maintainAspectRatio:false,
                resizeDelay:0,
                indexAxis:horizontal ? "y" : "x",
                interaction:{mode:"nearest", axis:horizontal ? "y" : "x", intersect:false},
                hover:{mode:"nearest", intersect:false},
                layout:{padding:horizontal ? {left:12,right:335,top:14,bottom:14} : {left:10,right:56,top:30,bottom:12}},
                plugins:{
                    title:{display:true,text:titulo,color:"#052e1a",font:{weight:"900",size:15},padding:{bottom:16}},
                    legend:{display:true,position:"top",labels:{color:"#0f172a",boxWidth:13,font:{weight:"900",size:11}}},
                    tooltip:{
                        backgroundColor:"rgba(15,23,42,.96)",
                        titleColor:"#ffffff",
                        bodyColor:"#ffffff",
                        borderColor:"rgba(34,197,94,.45)",
                        borderWidth:1,
                        callbacks:{
                            title:items => etiquetasOriginales[items?.[0]?.dataIndex] || items?.[0]?.label || "-",
                            label:ctx => {
                                const valor = toNumber(ctx.parsed[horizontal ? "x" : "y"]);
                                const meta = toNumber(metas[ctx.dataIndex]);
                                const lineas = [`${ctx.dataset.label}: ${formatChartValue(valor, tipoValor)}`];
                                if(meta > 0){
                                    const pct = (valor / meta) * 100;
                                    lineas.push(`Meta: ${formatChartValue(meta, tipoValor)}`);
                                    lineas.push(`Cumplimiento: ${pct.toFixed(1)}%`);
                                    lineas.push(`Estado: ${window.estadoMetaGrafica(pct)}`);
                                }else if(totalReferencia > 0){
                                    lineas.push(`Participación: ${((Math.abs(valor)/totalReferencia)*100).toFixed(1)}%`);
                                }
                                return lineas;
                            }
                        }
                    },
                    datalabels:{
                        display:ctx => Math.abs(toNumber(ctx.dataset.data[ctx.dataIndex])) > 0,
                        anchor:"end",
                        align:horizontal ? "right" : "top",
                        offset:horizontal ? 11 : 8,
                        clamp:false,
                        clip:false,
                        color:labelStyle.color,
                        backgroundColor:labelStyle.backgroundColor,
                        borderColor:labelStyle.borderColor,
                        borderWidth:1,
                        borderRadius:999,
                        padding:{top:4,right:9,bottom:4,left:9},
                        font:{size:horizontal ? 11.5 : 10.5,weight:"900"},
                        formatter:formatoEtiqueta
                    }
                },
                scales:horizontal ? {
                    y:{
                        ticks:{color:"#0f172a",font:{size:12,weight:"900"},autoSkip:false,padding:10},
                        grid:{color:"rgba(15,23,42,.08)"},
                        border:{color:"rgba(15,23,42,.16)"}
                    },
                    x:{
                        beginAtZero:true,
                        suggestedMax:maxValue>0?maxValue*1.35:undefined,
                        grid:{display:true,color:"rgba(15,23,42,.095)"},
                        border:{color:"rgba(15,23,42,.16)"},
                        ticks:{color:"#0f172a",font:{size:10.5,weight:"850"},callback:value => tipoValor === "money" ? formatNumber(value) : formatChartValue(value, tipoValor)}
                    }
                } : {
                    y:{
                        beginAtZero:true,
                        suggestedMax:maxValue>0?maxValue*1.25:undefined,
                        ticks:{color:"#0f172a",font:{size:10.5,weight:"850"},callback:value => tipoValor === "money" ? formatNumber(value) : formatChartValue(value, tipoValor)},
                        grid:{color:"rgba(15,23,42,.095)"},
                        border:{color:"rgba(15,23,42,.16)"}
                    },
                    x:{
                        ticks:{color:"#0f172a",font:{size:10.5,weight:"850"},autoSkip:false,maxRotation:18,minRotation:0},
                        grid:{display:false},
                        border:{color:"rgba(15,23,42,.16)"}
                    }
                }
            }
        });

        requestAnimationFrame(() => {
            charts[idCanvas]?.resize();
            charts[idCanvas]?.update("none");
        });
    };

    window.crearChartLine = function(idCanvas, labels, datasets, titulo, tipoValor="money"){
        const canvas = $(idCanvas);
        if(!canvas || typeof Chart === "undefined") return;
        registrarPluginGraficas();
        destruirChart(idCanvas);
        canvas.parentElement?.classList.add("chart-card-enhanced", "chart-card-readable");
        canvas.style.setProperty("height","360px","important");
        const datasetFinal = (datasets || []).map((ds, i) => ({
            ...ds,
            borderColor:i === 0 ? "#008f46" : "#f59e0b",
            backgroundColor:i === 0 ? "rgba(0,143,70,.12)" : "rgba(245,158,11,.08)",
            pointBackgroundColor:i === 0 ? "#008f46" : "#f59e0b",
            pointBorderColor:"#ffffff",
            pointRadius:ds.pointRadius ?? 3,
            borderWidth:3,
            tension:ds.tension ?? .32
        }));
        charts[idCanvas] = new Chart(canvas, {
            type:"line",
            data:{labels,datasets:datasetFinal},
            options:{
                responsive:true,
                maintainAspectRatio:false,
                plugins:{
                    title:{display:true,text:titulo,color:"#052e1a",font:{weight:"900",size:15}},
                    legend:{display:true,position:"top",labels:{color:"#0f172a",boxWidth:12,font:{weight:"900",size:11}}},
                    tooltip:{backgroundColor:"rgba(15,23,42,.96)",titleColor:"#fff",bodyColor:"#fff",callbacks:{label:ctx => `${ctx.dataset.label}: ${formatChartValue(ctx.parsed.y, tipoValor)}`}},
                    datalabels:{display:false}
                },
                scales:{
                    y:{beginAtZero:true,ticks:{color:"#0f172a",font:{size:10.5,weight:"850"}},grid:{color:"rgba(15,23,42,.095)"}},
                    x:{grid:{display:false},ticks:{color:"#0f172a",font:{size:10.5,weight:"850"},maxRotation:0}}
                }
            }
        });
    };

    window.crearChartDoughnut = function(idCanvas, labels, data, titulo, tipoValor="money"){
        const canvas = $(idCanvas);
        if(!canvas || typeof Chart === "undefined") return;
        registrarPluginGraficas();
        destruirChart(idCanvas);
        canvas.parentElement?.classList.add("chart-card-enhanced", "chart-card-readable");
        canvas.style.setProperty("height","360px","important");
        const total = (data || []).reduce((a,b)=>a+toNumber(b),0);
        charts[idCanvas] = new Chart(canvas, {
            type:"doughnut",
            data:{
                labels,
                datasets:[{
                    data,
                    backgroundColor:["#006b3f","#008f46","#22c55e","#f59e0b","#2563eb","#7c3aed"],
                    borderColor:"#ffffff",
                    borderWidth:3,
                    hoverOffset:8
                }]
            },
            options:{
                responsive:true,
                maintainAspectRatio:false,
                cutout:"58%",
                plugins:{
                    title:{display:true,text:titulo,color:"#052e1a",font:{weight:"900",size:15}},
                    legend:{display:true,position:"top",labels:{color:"#0f172a",boxWidth:12,font:{weight:"900",size:11}}},
                    tooltip:{backgroundColor:"rgba(15,23,42,.96)",titleColor:"#fff",bodyColor:"#fff",callbacks:{label:ctx => `${ctx.label}: ${formatChartValue(ctx.parsed, tipoValor)} (${total>0?((toNumber(ctx.parsed)/total)*100).toFixed(1):"0.0"}%)`}},
                    datalabels:{
                        display:ctx => Math.abs(toNumber(ctx.dataset.data[ctx.dataIndex])) > 0,
                        color:"#ffffff",
                        textStrokeColor:"rgba(0,0,0,.42)",
                        textStrokeWidth:2,
                        font:{size:10,weight:"900"},
                        formatter:value => total>0 ? `${formatChartValue(value,tipoValor)}\n${((toNumber(value)/total)*100).toFixed(1)}%` : formatChartValue(value,tipoValor)
                    }
                }
            }
        });
    };

    function refrescarGraficasProfesionales(){
        try{
            if(typeof aplicarFiltrosYRender === "function") aplicarFiltrosYRender();
            if(typeof redimensionarGraficos === "function") redimensionarGraficos();
        }catch(error){
            console.warn("No se pudieron refrescar las gráficas profesionales:", error);
        }
    }

    setTimeout(refrescarGraficasProfesionales, 700);
    setTimeout(refrescarGraficasProfesionales, 1800);

    console.log("GRAFICAS PROFESIONALES POWERBI ACTIVAS - VERSION " + VERSION_GRAFICAS_PRO);
})();


/* =========================================================
   GRAFICAS EJECUTIVAS POWER BI PRO - VERSION 20260725
   Corrección definitiva de lectura, contraste y proporción
   ========================================================= */
(function(){
    const VERSION_GRAFICAS_POWERBI_PRO = "20260725";

    window.chartTextColor = function(){ return "#111827"; };
    window.chartGridColor = function(){ return "rgba(17,24,39,.105)"; };
    window.chartValueLabelStyle = function(){
        return {
            color:"#0b1f16",
            backgroundColor:"rgba(255,255,255,.98)",
            borderColor:"rgba(0,79,42,.18)"
        };
    };

    function getChartCanvas(idCanvas){
        const canvas = $(idCanvas);
        if(!canvas || typeof Chart === "undefined") return null;
        return canvas;
    }

    function prepararTarjetaGrafica(canvas, alto){
        const contenedor = canvas.parentElement;
        canvas.setAttribute("height", String(alto));
        canvas.style.setProperty("height", `${alto}px`, "important");
        canvas.style.setProperty("min-height", `${alto}px`, "important");
        canvas.style.setProperty("width", "100%", "important");

        if(contenedor){
            contenedor.classList.remove("chart-card-readable");
            contenedor.classList.add("chart-card-enhanced", "powerbi-pro-card");
            contenedor.style.setProperty("min-height", `${alto + 86}px`, "important");
            contenedor.style.setProperty("height", `${alto + 86}px`, "important");
            contenedor.style.setProperty("overflow", "visible", "important");
        }
    }

    function pluginAreaLectura(){
        return {
            id:"powerbiAreaLectura20260724",
            beforeDraw(chart){
                const {ctx, chartArea} = chart;
                if(!chartArea) return;
                ctx.save();
                const x = chartArea.left - 10;
                const y = chartArea.top - 8;
                const w = chartArea.right - chartArea.left + 20;
                const h = chartArea.bottom - chartArea.top + 16;
                const r = 14;
                ctx.fillStyle = "#ffffff";
                ctx.strokeStyle = "rgba(0,79,42,.12)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x + r, y);
                ctx.lineTo(x + w - r, y);
                ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                ctx.lineTo(x + w, y + h - r);
                ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                ctx.lineTo(x + r, y + h);
                ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                ctx.lineTo(x, y + r);
                ctx.quadraticCurveTo(x, y, x + r, y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }
        };
    }

    function gradienteBarra(context, horizontal){
        const chart = context.chart;
        const {ctx, chartArea} = chart;
        if(!chartArea) return "#00994d";
        const grad = horizontal
            ? ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0)
            : ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
        grad.addColorStop(0, "#006b3f");
        grad.addColorStop(.50, "#00994d");
        grad.addColorStop(1, "#23c970");
        return grad;
    }

    function estadoCortoGrafica(pct){
        if(pct >= 100) return "Cumplida";
        if(pct >= 80) return "En riesgo";
        return "No cumple";
    }

    function etiquetaValorPowerBI(value, ctx, metas, totalReferencia, tipoValor, opciones, horizontal){
        const i = ctx.dataIndex;
        const valor = toNumber(value);
        const meta = toNumber(metas[i]);
        const valorTexto = formatChartValue(valor, tipoValor);

        if(meta > 0){
            const pct = meta > 0 ? (valor / meta) * 100 : 0;
            const estado = estadoCortoGrafica(pct);
            return horizontal
                ? `${valorTexto} | ${pct.toFixed(1)}% | ${estado}`
                : [valorTexto, `${pct.toFixed(1)}%`, estado];
        }

        if(totalReferencia > 0 && opciones.mostrarParticipacion !== false){
            const pct = (Math.abs(valor) / totalReferencia) * 100;
            return horizontal
                ? `${valorTexto} | ${pct.toFixed(1)}%`
                : [valorTexto, `${pct.toFixed(1)}%`];
        }

        return horizontal ? `${valorTexto}` : [valorTexto];
    }

    window.crearChartBar = function(idCanvas, labels, data, label, titulo, horizontal=false, tipoValor="money", opciones={}){
        const canvas = getChartCanvas(idCanvas);
        if(!canvas) return;

        registrarPluginGraficas();
        destruirChart(idCanvas);

        opciones = opciones || {};
        const etiquetasOriginales = Array.isArray(labels) ? labels : [];
        const etiquetas = etiquetasOriginales.map(etiqueta => window.etiquetaGraficaVisible(etiqueta, titulo, label));
        const valores = Array.isArray(data) ? data.map(v => toNumber(v)) : [];
        const metas = Array.isArray(opciones.metas) ? opciones.metas.map(v => toNumber(v)) : [];
        const totalReferencia = toNumber(opciones.total) || valores.reduce((acc,v) => acc + Math.abs(toNumber(v)), 0);
        const cantidad = Math.max(etiquetas.length, 1);
        const maxDato = Math.max(...valores.map(v => Math.abs(toNumber(v))), 0);

        const alto = horizontal
            ? Math.min(Math.max(300, cantidad * 39 + 118), 740)
            : 360;
        const barraGruesa = horizontal
            ? Math.min(32, Math.max(24, Math.floor((alto - 118) / cantidad * .78)))
            : 44;

        prepararTarjetaGrafica(canvas, alto);

        const labelStyle = window.chartValueLabelStyle();
        const maxEscala = maxDato > 0 ? maxDato * (horizontal ? 1.26 : 1.18) : undefined;

        charts[idCanvas] = new Chart(canvas, {
            type:"bar",
            plugins:[pluginAreaLectura()],
            data:{
                labels:etiquetas,
                datasets:[{
                    label:opciones.legendLabel || label,
                    data:valores,
                    backgroundColor:ctx => gradienteBarra(ctx, horizontal),
                    borderColor:"rgba(0,79,42,.58)",
                    borderWidth:1,
                    borderRadius:horizontal ? 9 : 12,
                    barThickness:barraGruesa,
                    maxBarThickness:horizontal ? 34 : 52,
                    minBarLength:horizontal ? 18 : 8,
                    barPercentage:.96,
                    categoryPercentage:.82
                }]
            },
            options:{
                responsive:true,
                maintainAspectRatio:false,
                resizeDelay:0,
                indexAxis:horizontal ? "y" : "x",
                interaction:{mode:"nearest", axis:horizontal ? "y" : "x", intersect:false},
                hover:{mode:"nearest", intersect:false},
                layout:{
                    padding:horizontal
                        ? {left:12,right:285,top:10,bottom:12}
                        : {left:12,right:44,top:18,bottom:10}
                },
                plugins:{
                    title:{display:false},
                    legend:{
                        display:true,
                        position:"top",
                        align:"center",
                        labels:{
                            color:"#111827",
                            boxWidth:13,
                            boxHeight:8,
                            padding:12,
                            font:{family:"Inter, Segoe UI, Arial", weight:"900", size:12}
                        }
                    },
                    tooltip:{
                        backgroundColor:"rgba(15,23,42,.96)",
                        titleColor:"#ffffff",
                        bodyColor:"#ffffff",
                        borderColor:"rgba(34,197,94,.45)",
                        borderWidth:1,
                        padding:11,
                        callbacks:{
                            title:items => etiquetasOriginales[items?.[0]?.dataIndex] || items?.[0]?.label || "-",
                            label:ctx => {
                                const valor = toNumber(ctx.parsed[horizontal ? "x" : "y"]);
                                const meta = toNumber(metas[ctx.dataIndex]);
                                const lineas = [`${ctx.dataset.label}: ${formatChartValue(valor, tipoValor)}`];
                                if(meta > 0){
                                    const pct = (valor / meta) * 100;
                                    lineas.push(`Meta: ${formatChartValue(meta, tipoValor)}`);
                                    lineas.push(`Cumplimiento: ${pct.toFixed(1)}%`);
                                    lineas.push(`Estado: ${estadoCortoGrafica(pct)}`);
                                }else if(totalReferencia > 0){
                                    lineas.push(`Participación: ${((Math.abs(valor)/totalReferencia)*100).toFixed(1)}%`);
                                }
                                return lineas;
                            }
                        }
                    },
                    datalabels:{
                        display:ctx => Math.abs(toNumber(ctx.dataset.data[ctx.dataIndex])) > 0,
                        anchor:"end",
                        align:horizontal ? "right" : "top",
                        offset:horizontal ? 10 : 7,
                        clamp:false,
                        clip:false,
                        color:labelStyle.color,
                        backgroundColor:labelStyle.backgroundColor,
                        borderColor:labelStyle.borderColor,
                        borderWidth:1,
                        borderRadius:999,
                        padding:{top:4,right:9,bottom:4,left:9},
                        font:{family:"Inter, Segoe UI, Arial", size:horizontal ? 12 : 11, weight:"900"},
                        formatter:(value, ctx) => etiquetaValorPowerBI(value, ctx, metas, totalReferencia, tipoValor, opciones, horizontal)
                    }
                },
                scales:horizontal ? {
                    y:{
                        ticks:{
                            color:"#111827",
                            font:{family:"Inter, Segoe UI, Arial", size:12.5, weight:"900"},
                            autoSkip:false,
                            padding:10
                        },
                        grid:{display:false},
                        border:{display:false}
                    },
                    x:{
                        beginAtZero:true,
                        suggestedMax:maxEscala,
                        grid:{display:true,color:"rgba(17,24,39,.085)",drawBorder:false},
                        border:{color:"rgba(17,24,39,.14)"},
                        ticks:{
                            color:"#334155",
                            font:{family:"Inter, Segoe UI, Arial", size:10.5, weight:"800"},
                            maxTicksLimit:6,
                            callback:value => tipoValor === "money" ? formatNumber(value) : formatChartValue(value, tipoValor)
                        }
                    }
                } : {
                    y:{
                        beginAtZero:true,
                        suggestedMax:maxEscala,
                        ticks:{
                            color:"#334155",
                            font:{family:"Inter, Segoe UI, Arial", size:10.5, weight:"800"},
                            maxTicksLimit:6,
                            callback:value => tipoValor === "money" ? formatNumber(value) : formatChartValue(value, tipoValor)
                        },
                        grid:{color:"rgba(17,24,39,.085)",drawBorder:false},
                        border:{color:"rgba(17,24,39,.14)"}
                    },
                    x:{
                        ticks:{
                            color:"#111827",
                            font:{family:"Inter, Segoe UI, Arial", size:10.5, weight:"850"},
                            autoSkip:false,
                            maxRotation:0,
                            minRotation:0
                        },
                        grid:{display:false},
                        border:{display:false}
                    }
                }
            }
        });

        requestAnimationFrame(() => {
            charts[idCanvas]?.resize();
            charts[idCanvas]?.update("none");
        });
    };

    window.crearChartLine = function(idCanvas, labels, datasets, titulo, tipoValor="money"){
        const canvas = getChartCanvas(idCanvas);
        if(!canvas) return;
        registrarPluginGraficas();
        destruirChart(idCanvas);
        prepararTarjetaGrafica(canvas, 350);
        const datasetFinal = (datasets || []).map((ds, i) => ({
            ...ds,
            borderColor:i === 0 ? "#008f46" : "#f59e0b",
            backgroundColor:i === 0 ? "rgba(0,143,70,.13)" : "rgba(245,158,11,.10)",
            pointBackgroundColor:i === 0 ? "#008f46" : "#f59e0b",
            pointBorderColor:"#ffffff",
            pointRadius:3,
            borderWidth:3,
            tension:ds.tension ?? .32,
            fill:ds.fill ?? true
        }));
        charts[idCanvas] = new Chart(canvas, {
            type:"line",
            plugins:[pluginAreaLectura()],
            data:{labels,datasets:datasetFinal},
            options:{
                responsive:true,
                maintainAspectRatio:false,
                plugins:{
                    title:{display:false},
                    legend:{display:true,position:"top",labels:{color:"#111827",boxWidth:12,font:{weight:"900",size:12}}},
                    tooltip:{backgroundColor:"rgba(15,23,42,.96)",titleColor:"#fff",bodyColor:"#fff",callbacks:{label:ctx => `${ctx.dataset.label}: ${formatChartValue(ctx.parsed.y, tipoValor)}`}},
                    datalabels:{display:false}
                },
                scales:{
                    y:{beginAtZero:true,ticks:{color:"#334155",font:{size:10.5,weight:"800"},maxTicksLimit:6},grid:{color:"rgba(17,24,39,.085)"},border:{color:"rgba(17,24,39,.14)"}},
                    x:{grid:{display:false},ticks:{color:"#111827",font:{size:10.5,weight:"850"},maxRotation:0},border:{display:false}}
                }
            }
        });
    };

    window.crearChartDoughnut = function(idCanvas, labels, data, titulo, tipoValor="money"){
        const canvas = getChartCanvas(idCanvas);
        if(!canvas) return;
        registrarPluginGraficas();
        destruirChart(idCanvas);
        prepararTarjetaGrafica(canvas, 350);
        const total = (data || []).reduce((a,b)=>a+toNumber(b),0);
        charts[idCanvas] = new Chart(canvas, {
            type:"doughnut",
            plugins:[pluginAreaLectura()],
            data:{
                labels,
                datasets:[{
                    data,
                    backgroundColor:["#006b3f","#00994d","#23c970","#f59e0b","#2563eb","#7c3aed"],
                    borderColor:"#ffffff",
                    borderWidth:3,
                    hoverOffset:8
                }]
            },
            options:{
                responsive:true,
                maintainAspectRatio:false,
                cutout:"58%",
                plugins:{
                    title:{display:false},
                    legend:{display:true,position:"top",labels:{color:"#111827",boxWidth:12,font:{weight:"900",size:12}}},
                    tooltip:{backgroundColor:"rgba(15,23,42,.96)",titleColor:"#fff",bodyColor:"#fff",callbacks:{label:ctx => `${ctx.label}: ${formatChartValue(ctx.parsed, tipoValor)} (${total>0?((toNumber(ctx.parsed)/total)*100).toFixed(1):"0.0"}%)`}},
                    datalabels:{
                        display:ctx => Math.abs(toNumber(ctx.dataset.data[ctx.dataIndex])) > 0,
                        color:"#ffffff",
                        textStrokeColor:"rgba(0,0,0,.42)",
                        textStrokeWidth:2,
                        font:{size:10,weight:"900"},
                        formatter:value => total>0 ? `${formatChartValue(value,tipoValor)}\n${((toNumber(value)/total)*100).toFixed(1)}%` : formatChartValue(value,tipoValor)
                    }
                }
            }
        });
    };

    function refrescarPowerBIPro(){
        try{
            if(typeof aplicarFiltrosYRender === "function") aplicarFiltrosYRender();
            if(typeof redimensionarGraficos === "function") redimensionarGraficos();
        }catch(error){
            console.warn("No se pudieron refrescar las gráficas Power BI Pro:", error);
        }
    }

    setTimeout(refrescarPowerBIPro, 500);
    setTimeout(refrescarPowerBIPro, 1600);
    console.log("GRAFICAS POWER BI PRO DEFINITIVAS ACTIVAS - VERSION " + VERSION_GRAFICAS_POWERBI_PRO);
})();


/* =========================================================
   AJUSTES FINALES 20260725
   Tablas ordenables, cumplimiento robusto y tiempo afiliado depurado.
   ========================================================= */
(function(){
    const VERSION_AJUSTES_FINALES = "20260725";

    function normalizarNumeroOrdenable(texto){
        const limpio = String(texto || "")
            .replace(/\$/g, "")
            .replace(/%/g, "")
            .replace(/días?/gi, "")
            .replace(/años?/gi, "")
            .replace(/meses?/gi, "")
            .replace(/\s/g, "")
            .replace(/\./g, "")
            .replace(/,/g, ".")
            .replace(/[^0-9.\-]/g, "");
        const numero = Number(limpio);
        return Number.isFinite(numero) ? numero : null;
    }

    function normalizarFechaOrdenable(texto){
        const valor = String(texto || "").trim();
        const ymd = valor.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if(ymd){
            const [,y,m,d] = ymd;
            return new Date(Number(y), Number(m)-1, Number(d)).getTime();
        }
        const dmy = valor.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if(dmy){
            const [,d,m,y] = dmy;
            return new Date(Number(y), Number(m)-1, Number(d)).getTime();
        }
        return null;
    }

    function valorCeldaOrdenable(celda){
        const texto = String(celda?.innerText || celda?.textContent || "").trim();
        const fecha = normalizarFechaOrdenable(texto);
        if(fecha !== null && Number.isFinite(fecha)) return {tipo:"numero", valor:fecha};
        const numero = normalizarNumeroOrdenable(texto);
        if(numero !== null) return {tipo:"numero", valor:numero};
        return {tipo:"texto", valor:normalizarTexto(texto)};
    }

    window.ordenarTablaDashboard = function(tabla, indice){
        if(!tabla || !tabla.tBodies || !tabla.tBodies[0]) return;
        const tbody = tabla.tBodies[0];
        const filas = Array.from(tbody.rows).filter(row => row.cells.length > 1 && !row.cells[0].hasAttribute("colspan"));
        if(filas.length <= 1) return;

        const muestra = filas.map(row => valorCeldaOrdenable(row.cells[indice]).tipo);
        const esNumerica = muestra.filter(tipo => tipo === "numero").length >= Math.ceil(muestra.length / 2);
        const columnaActual = tabla.dataset.sortColumn;
        let direccion;
        if(columnaActual !== String(indice)){
            direccion = esNumerica ? "desc" : "asc";
        }else{
            direccion = tabla.dataset.sortDirection === "asc" ? "desc" : "asc";
        }

        filas.sort((a,b) => {
            const va = valorCeldaOrdenable(a.cells[indice]);
            const vb = valorCeldaOrdenable(b.cells[indice]);
            let resultado;
            if(esNumerica){
                const na = va.tipo === "numero" ? va.valor : -Infinity;
                const nb = vb.tipo === "numero" ? vb.valor : -Infinity;
                resultado = na - nb;
            }else{
                resultado = String(va.valor).localeCompare(String(vb.valor), "es", {numeric:true, sensitivity:"base"});
            }
            return direccion === "asc" ? resultado : -resultado;
        });

        filas.forEach(row => tbody.appendChild(row));
        tabla.dataset.sortColumn = String(indice);
        tabla.dataset.sortDirection = direccion;

        tabla.querySelectorAll("thead th").forEach((th,i) => {
            th.classList.remove("sort-asc","sort-desc");
            if(i === indice) th.classList.add(direccion === "asc" ? "sort-asc" : "sort-desc");
        });
    };

    window.prepararTablasOrdenables = function(){
        document.querySelectorAll("table").forEach(tabla => {
            tabla.classList.add("sortable-table");
            tabla.querySelectorAll("thead th").forEach(th => {
                th.setAttribute("title", "Clic para ordenar ascendente / descendente");
                th.setAttribute("tabindex", "0");
            });
        });
    };

    document.addEventListener("click", event => {
        const th = event.target.closest("table.sortable-table thead th, table thead th");
        if(!th) return;
        const tabla = th.closest("table");
        if(!tabla) return;
        window.ordenarTablaDashboard(tabla, th.cellIndex);
    });

    document.addEventListener("keydown", event => {
        if(event.key !== "Enter" && event.key !== " ") return;
        const th = event.target.closest("table.sortable-table thead th");
        if(!th) return;
        event.preventDefault();
        window.ordenarTablaDashboard(th.closest("table"), th.cellIndex);
    });

    const renderCumplimientoMensualBase = window.renderCumplimientoMensual || (typeof renderCumplimientoMensual === "function" ? renderCumplimientoMensual : null);

    window.renderCumplimientoMensual = function(){
        const f = obtenerFiltros();
        const anio = anioReferenciaFiltros();
        const meses = Array.from({length:12}, (_,i) => i + 1);
        const labels = meses.map(m => `${nombreMes(m)} ${anio}`);
        const ventas = meses.map(m => sumar(DATASET_NORMAL.filter(row =>
            row.fecha &&
            row.fecha.getFullYear() === anio &&
            row.fecha.getMonth() + 1 === m &&
            coincideFiltrosNoFecha(row, f)
        )));
        const metas = labels.map(() => metaMensualTotal());
        const totalVentaAnio = ventas.reduce((a,b) => a + toNumber(b), 0);
        const totalMetaAnio = metas.reduce((a,b) => a + toNumber(b), 0);
        const ventaRango = sumar(DATASET_FILTRADO || []);
        const metaRango = META_RANGO_ACTUAL || 0;
        const pctRango = metaRango > 0 ? (ventaRango / metaRango) * 100 : 0;
        const faltanteRango = Math.max(metaRango - ventaRango, 0);
        const mesesConVenta = ventas.filter(v => toNumber(v) > 0).length;
        const mejorIdx = ventas.reduce((best, v, i) => toNumber(v) > toNumber(ventas[best] || 0) ? i : best, 0);
        const mejorMes = ventas.some(v => toNumber(v) > 0) ? `${nombreMes(mejorIdx + 1)} ${formatMoney(ventas[mejorIdx])}` : "Sin venta";

        setHtml("cumplimientoMetaVista", formatMoney(metaRango || totalMetaAnio));
        setHtml("cumplimientoVentaVista", formatMoney(ventaRango || totalVentaAnio));
        setHtml("cumplimientoPctVista", `${(metaRango > 0 ? pctRango : (totalMetaAnio > 0 ? (totalVentaAnio / totalMetaAnio) * 100 : 0)).toFixed(1)}%`);
        setHtml("cumplimientoFaltanteVista", formatMoney(metaRango > 0 ? faltanteRango : Math.max(totalMetaAnio - totalVentaAnio, 0)));
        setHtml("cumplimientoMejorMesVista", mejorMes);
        setHtml("cumplimientoMesesVentaVista", mesesConVenta);
        setHtml("textoCumplimientoVista", `La meta del periodo seleccionado es <strong>${formatMoney(metaRango)}</strong> y la venta real es <strong>${formatMoney(ventaRango)}</strong>, con cumplimiento de <strong>${pctRango.toFixed(1)}%</strong>. ${faltanteRango > 0 ? `El faltante para cumplir es <strong>${formatMoney(faltanteRango)}</strong>.` : "La meta del periodo se encuentra cumplida o superada."}`);

        crearChartLine("graficoCumplimientoMensual", labels, [
            {label:"Venta", data:ventas, borderColor:"#008f46", backgroundColor:"rgba(0,143,70,.13)", fill:true, tension:.3},
            {label:"Meta", data:metas, borderColor:"#f59e0b", borderDash:[8,6], fill:false, pointRadius:0}
        ], `Cumplimiento mensual ${anio}`);

        const tbody = document.querySelector("#tablaCumplimientoMensual tbody");
        if(tbody){
            tbody.innerHTML = labels.map((k, i) => {
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
            }).join("");
        }
        window.prepararTablasOrdenables();
    };

    const renderTiempoAfiliadoBase = window.renderTiempoAfiliado || (typeof renderTiempoAfiliado === "function" ? renderTiempoAfiliado : null);
    window.renderTiempoAfiliado = function(){
        if(renderTiempoAfiliadoBase) renderTiempoAfiliadoBase();
        const tabla = document.querySelector("#tablaTiempoAfiliado");
        if(tabla){
            const ths = tabla.querySelectorAll("thead th");
            const nombres = ["Orden","Contrato","Plan","Tipo afiliación","Edad","Fecha orden","Tiempo transcurrido entre la afiliación y fallecimiento","Clasificación","Fuente / acción"];
            if(ths.length !== nombres.length){
                const thead = tabla.querySelector("thead tr");
                if(thead) thead.innerHTML = nombres.map(n => `<th>${n}</th>`).join("");
            }
        }
        window.prepararTablasOrdenables();
    };

    const renderTodoBase = window.renderTodo || (typeof renderTodo === "function" ? renderTodo : null);
    if(renderTodoBase){
        window.renderTodo = function(resumen, metaInfo){
            renderTodoBase(resumen, metaInfo);
            window.prepararTablasOrdenables();
        };
    }

    setTimeout(() => {
        window.prepararTablasOrdenables();
        if(typeof window.renderCumplimientoMensual === "function") window.renderCumplimientoMensual();
    }, 900);

    console.log("AJUSTES FINALES DE TABLAS Y CUMPLIMIENTO ACTIVOS - VERSION " + VERSION_AJUSTES_FINALES);
})();


/* =========================================================
   CORRECCIÓN DEFINITIVA TABLA TIEMPO AFILIADO 20260726
   Elimina columna de referencia y columna días, alinea datos reales.
   ========================================================= */
(function(){
    const VERSION_TABLA_TIEMPO_AFILIADO = "20260726";

    function limpiarOrdenServicio(valor){
        const texto = String(valor || "").trim();
        return texto.replace(/^ORDEN\s+/i, "").trim() || "-";
    }

    function fuenteAccionTiempoAfiliado(item){
        if(item.origen === "FALLECIDOS PLANES") return '<span class="badge badge-info">Google Sheet</span>';
        return `<button class="danger-btn" onclick="eliminarTiempoAfiliado('${escapeHtml(item.id || "")}')">Eliminar</button>`;
    }

    function encabezadoTiempoAfiliado(){
        return `
            <tr>
                <th>Orden servicio funerario</th>
                <th>Número contrato</th>
                <th>Plan</th>
                <th>Tipo afiliación</th>
                <th>Edad</th>
                <th>Fecha orden</th>
                <th>Tiempo transcurrido entre la afiliación y fallecimiento</th>
                <th>Clasificación</th>
                <th>Fuente / acción</th>
            </tr>
        `;
    }

    window.renderTiempoAfiliado = function(){
        const resumen = resumenTiempoAfiliado();

        setHtml("kpiAfiliadoCasos", resumen.enriquecidos.length);
        setHtml("kpiAfiliadoPromedio", resumen.validos.length ? `${formatNumber(resumen.promedioDias)} días` : "0 días");
        setHtml("kpiAfiliadoMenor", resumen.menor ? resumen.menor.tiempo.texto : "-");
        setHtml("kpiAfiliadoMayor", resumen.mayor ? resumen.mayor.tiempo.texto : "-");

        const origenSheet = resumen.enriquecidos.filter(item => item.origen === "FALLECIDOS PLANES").length;
        setHtml("textoTiempoAfiliado", `
            Se registran <strong>${resumen.enriquecidos.length}</strong> casos, de los cuales <strong>${origenSheet}</strong> provienen de la hoja <strong>FALLECIDOS PLANES</strong>.
            El promedio de permanencia vivo estando afiliado es de <strong>${formatNumber(resumen.promedioDias)} días</strong>.
            ${resumen.mayor ? `El mayor tiempo registrado corresponde a la orden <strong>${escapeHtml(limpiarOrdenServicio(resumen.mayor.ordenServicio))}</strong> con <strong>${escapeHtml(resumen.mayor.tiempo.texto)}</strong>.` : ""}
        `);

        const labels = Object.keys(resumen.rangos);
        const data = labels.map(label => resumen.rangos[label]);
        crearChartBar(
            "graficoTiempoAfiliado",
            labels,
            data,
            "Casos",
            "Casos por rango de permanencia",
            true,
            "number",
            {total:data.reduce((acc,v)=>acc+toNumber(v),0), legendLabel:"Casos | % participación"}
        );

        const tabla = document.querySelector("#tablaTiempoAfiliado");
        const thead = tabla?.querySelector("thead");
        const tbody = tabla?.querySelector("tbody");
        if(!tabla || !thead || !tbody) return;

        thead.innerHTML = encabezadoTiempoAfiliado();

        const registros = resumen.enriquecidos.slice().sort((a,b) => b.tiempo.dias - a.tiempo.dias);
        tbody.innerHTML = registros.length ? registros.map(item => `
            <tr>
                <td>${escapeHtml(limpiarOrdenServicio(item.ordenServicio))}</td>
                <td>${escapeHtml(item.numeroContrato || item.contrato || "-")}</td>
                <td>${escapeHtml(item.plan || item.sede || "-")}</td>
                <td>${escapeHtml(item.tipoAfiliacion || "-")}</td>
                <td>${escapeHtml(item.edad || "-")}</td>
                <td>${escapeHtml(item.fechaOrden || item.fechaFallecimiento || item.fechaAfiliacion || "-")}</td>
                <td>${escapeHtml(item.tiempo.texto)}</td>
                <td>${badgeTiempoAfiliado(item.tiempo.clasificacion)}</td>
                <td>${fuenteAccionTiempoAfiliado(item)}</td>
            </tr>
        `).join("") : `<tr><td colspan="9">Sin casos registrados</td></tr>`;

        if(typeof window.prepararTablasOrdenables === "function") window.prepararTablasOrdenables();
    };

    try{ renderTiempoAfiliado = window.renderTiempoAfiliado; }catch(error){}

    setTimeout(() => {
        if(document.querySelector("#tiempoAfiliado.active-view") && typeof window.renderTiempoAfiliado === "function"){
            window.renderTiempoAfiliado();
        }
    }, 700);

    console.log("TABLA TIEMPO AFILIADO DEPURADA - VERSION " + VERSION_TABLA_TIEMPO_AFILIADO);
})();


/* =========================================================
   REPORTE GERENCIAL COMPLETO 20260727
   PDF multi-pagina, Imagen completa vertical y Excel multihoja.
   No depende de capturar el dashboard visible.
   ========================================================= */
(function(){
    const VERSION_REPORTE_COMPLETO = "20260727";

    function rpText(value){
        return String(value ?? "")
            .replace(/[\u0000-\u001F\u007F]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function rpMoney(value){
        if(typeof formatMoney === "function") return formatMoney(value);
        const n = Math.round(Number(value || 0));
        return "$" + n.toLocaleString("es-CO");
    }

    function rpNumber(value, dec=0){
        if(typeof formatNumber === "function") return formatNumber(value, dec);
        return Number(value || 0).toLocaleString("es-CO", {minimumFractionDigits:dec, maximumFractionDigits:dec});
    }

    function rpPct(value){
        const n = Number(value || 0);
        return `${n.toFixed(1)}%`;
    }

    function rpFechaArchivo(){
        const d = new Date();
        const p = n => String(n).padStart(2,"0");
        return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
    }

    function rpDescargar(nombre, blob){
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nombre;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            a.remove();
        }, 1200);
    }

    function rpPrimerNombreGestor(nombre){
        if(typeof window.primerNombreGestor === "function") return window.primerNombreGestor(nombre);
        if(typeof primerNombreGestor === "function") return primerNombreGestor(nombre);
        const partes = String(nombre || "").trim().toUpperCase().split(/\s+/).filter(Boolean);
        const frecuentes = ["FERNANDO","CARLOS","OSVALDO","ALEXIS","WENDY","SAMIR","MARIO","JESSICA","JULIA","OSCAR","EDER","OCTAVIO"];
        return frecuentes.find(n => partes.includes(n)) || partes[0] || "-";
    }

    function rpEstadoMeta(pct){
        const n = Number(pct || 0);
        if(n >= 100) return "Cumplida";
        if(n >= 80) return "En riesgo";
        return "No cumple";
    }

    function rpMetaGestorFlexible(nombre){
        try{
            const exacta = typeof metaGestorMensual === "function" ? metaGestorMensual(nombre) : 0;
            if(exacta > 0) return exacta;
            const corto = rpPrimerNombreGestor(nombre);
            const parametros = (typeof PARAMETROS !== "undefined" && PARAMETROS.gestor) ? PARAMETROS.gestor : {};
            for(const key of Object.keys(parametros)){
                if(rpPrimerNombreGestor(key) === corto) return Number(parametros[key] || 0);
            }
        }catch(error){}
        return 0;
    }

    function rpBase(){
        const rowsFiltradas = (typeof DATASET_FILTRADO !== "undefined" && Array.isArray(DATASET_FILTRADO)) ? DATASET_FILTRADO : [];
        const rowsNormales = (typeof DATASET_NORMAL !== "undefined" && Array.isArray(DATASET_NORMAL)) ? DATASET_NORMAL : [];
        const rows = rowsFiltradas.length ? rowsFiltradas : rowsNormales;
        const resumen = (typeof calcularResumen === "function") ? calcularResumen(rows) : (typeof ULTIMO_RESUMEN !== "undefined" && ULTIMO_RESUMEN ? ULTIMO_RESUMEN : {particular:0, red:0, excedentes:0, planCantidad:0, total:0});
        const meta = Number((typeof META_RANGO_ACTUAL !== "undefined" && META_RANGO_ACTUAL) ? META_RANGO_ACTUAL : 0);
        const cumplimiento = meta > 0 ? (Number(resumen.total || 0) / meta) * 100 : 0;
        const faltante = Math.max(meta - Number(resumen.total || 0), 0);
        const factorMes = Number((typeof MESES_EQUIVALENTES_ACTUAL !== "undefined" && MESES_EQUIVALENTES_ACTUAL) ? MESES_EQUIVALENTES_ACTUAL : 1) || 1;
        return {rows, resumen, meta, cumplimiento, faltante, factorMes};
    }

    function rpGroup(rows, campo, opciones={}){
        const mapa = new Map();
        (rows || []).forEach(row => {
            let nombre = rpText(row?.[campo] || "SIN REGISTRO") || "SIN REGISTRO";
            let llave = nombre;
            let display = nombre;
            if(opciones.gestor){
                display = rpPrimerNombreGestor(nombre);
                llave = display;
            }
            if(opciones.compuesto){
                nombre = opciones.compuesto(row);
                llave = nombre;
                display = nombre;
            }
            const actual = mapa.get(llave) || {label:display, nombre:display, full:nombre, cantidad:0, valor:0, meta:0, type:opciones.type || "money"};
            actual.cantidad += Number(row?.cantidadAtendida || 1);
            actual.valor += Number(row?.valorVenta || 0);
            mapa.set(llave, actual);
        });
        let lista = Array.from(mapa.values());
        if(opciones.meta){
            lista.forEach(item => item.meta = Number(opciones.meta(item) || 0));
        }
        const ordenarPor = opciones.sortBy || (opciones.type === "number" ? "cantidad" : "valor");
        lista.sort((a,b) => Number(b[ordenarPor] || 0) - Number(a[ordenarPor] || 0));
        return lista.slice(0, opciones.limite || 12);
    }

    function rpCategorias(base){
        const rows = base.rows || [];
        const total = Number(base.resumen.total || 0) || 1;
        const factor = base.factorMes || 1;
        const cats = [
            {label:"PARTICULAR", valor:Number(base.resumen.particular || 0), cantidad:rows.filter(r => r.categoriaGerencial === "PARTICULAR").length, meta:((typeof metaCategoriaMensual === "function" ? metaCategoriaMensual("PARTICULAR") : 0) || 0) * factor, type:"money"},
            {label:"RED", valor:Number(base.resumen.red || 0), cantidad:rows.filter(r => r.categoriaGerencial === "RED").length, meta:((typeof metaCategoriaMensual === "function" ? metaCategoriaMensual("RED") : 0) || 0) * factor, type:"money"},
            {label:"EXCEDENTES", valor:Number(base.resumen.excedentes || 0), cantidad:rows.filter(r => r.categoriaGerencial === "EXCEDENTES").length, meta:((typeof metaCategoriaMensual === "function" ? metaCategoriaMensual("EXCEDENTES") : 0) || 0) * factor, type:"money"},
            {label:"PLAN", valor:0, cantidad:Number(base.resumen.planCantidad || 0), meta:0, type:"number", note:"No suma ventas"}
        ];
        cats.forEach(c => c.participacion = c.valor > 0 ? (c.valor / total) * 100 : 0);
        return cats;
    }

    function rpExcedentes(base){
        const factor = base.factorMes || 1;
        return rpGroup(base.rows.filter(r => r.categoriaGerencial === "EXCEDENTES"), "servicio", {
            limite:14,
            type:"money",
            meta:item => ((typeof metaExcedenteMensual === "function" ? metaExcedenteMensual(item.full || item.label) : 0) || 0) * factor
        });
    }

    function rpHomenajeExcedente(base){
        return rpGroup(base.rows, "servicio", {
            limite:14,
            type:"money",
            compuesto: row => `${rpText(row.categoriaGerencial || row.categoria || "SIN CATEGORIA")} - ${rpText(row.servicio || "SERVICIO FUNERARIO")}`
        });
    }

    function rpGestores(base){
        const factor = base.factorMes || 1;
        return rpGroup(base.rows, "gestor", {
            limite:14,
            gestor:true,
            type:"money",
            meta:item => rpMetaGestorFlexible(item.full || item.label) * factor
        });
    }

    function rpTiempoAfiliadoRows(){
        try{
            if(typeof resumenTiempoAfiliado !== "function") return [];
            const resumen = resumenTiempoAfiliado();
            return (resumen.enriquecidos || [])
                .slice()
                .sort((a,b) => Number(b.tiempo?.dias || 0) - Number(a.tiempo?.dias || 0))
                .slice(0, 12)
                .map(item => ({
                    label: rpText(`${item.ordenServicio || item.orden || "-"} - ${item.plan || "SIN PLAN"}`),
                    valor: Number(item.tiempo?.dias || 0),
                    cantidad: Number(item.tiempo?.dias || 0),
                    type:"days",
                    extra: rpText(`${item.tiempo?.texto || "-"} | ${item.tiempo?.clasificacion || "-"} | Edad ${item.edad || "-"}`),
                    meta:0
                }));
        }catch(error){
            console.warn("No se pudo preparar tiempo afiliado para reporte", error);
            return [];
        }
    }

    function rpOperativo(){
        try{
            return (typeof obtenerResumenOperativoReporte === "function") ? obtenerResumenOperativoReporte() : null;
        }catch(error){
            return null;
        }
    }

    function rpEnergiaRows(operativo){
        const data = operativo?.energiaActual || [];
        return data.slice(0,12).map(item => ({
            label:`${item.mes || item.nombre || "Mes"} ${item.anio || operativo?.anio || ""}`,
            valor:Number(item.kwh || 0),
            cantidad:Number(item.kwh || 0),
            type:"kwh",
            extra:`Costo ${rpMoney(item.costo || 0)}`
        }));
    }

    function rpVacacionesRows(operativo){
        const data = operativo?.vacaciones || [];
        return data.slice(0,12).map(item => ({
            label:rpText(item.nombre || item.colaborador || "SIN NOMBRE"),
            valor:Number(item.dias || 0),
            cantidad:Number(item.dias || 0),
            type:"number",
            extra:rpText(`${item.inicio || "-"} a ${item.fin || "-"} | ${typeof estadoVacacion === "function" ? estadoVacacion(item) : (item.estado || "-")}`)
        }));
    }

    function rpAgendaRows(operativo){
        const data = operativo?.agenda || [];
        return data.slice(0,12).map(item => ({
            label:rpText(item.titulo || item.actividad || "Actividad"),
            valor:1,
            cantidad:1,
            type:"number",
            extra:rpText(`${item.fecha || "-"} ${item.hora || ""} | ${item.estado || "-"}`)
        }));
    }

    function rpAlertas(base){
        const alertas = [];
        if(typeof API_STATUS !== "undefined" && API_STATUS && !API_STATUS.ok) alertas.push(`Revisar conexion o estructura API: ${API_STATUS.mensaje || "Sin validar"}.`);
        if(!base.rows.length) alertas.push("No hay registros para el rango seleccionado.");
        if(base.cumplimiento < 80) alertas.push(`Cumplimiento bajo: ${base.cumplimiento.toFixed(1)}%. Requiere plan de accion.`);
        else if(base.cumplimiento < 100) alertas.push(`Cumplimiento en riesgo: ${base.cumplimiento.toFixed(1)}%.`);
        else alertas.push(`Meta cumplida o superada: ${base.cumplimiento.toFixed(1)}%.`);
        try{
            if((PARAMETROS.categoria["PARTICULAR"] || 0) === 0) alertas.push("No se detecto META_CATEGORIA para PARTICULAR.");
            if((PARAMETROS.categoria["RED"] || 0) === 0) alertas.push("No se detecto META_CATEGORIA para RED.");
            if((PARAMETROS.categoria["EXCEDENTES"] || 0) === 0) alertas.push("No se detecto META_CATEGORIA para EXCEDENTES.");
        }catch(error){}
        return alertas;
    }

    function rpSecciones(){
        const base = rpBase();
        const operativo = rpOperativo();
        const rows = base.rows || [];
        const dim = (campo, type="number", limite=12, sortBy="cantidad") => rpGroup(rows, campo, {limite, type, sortBy});
        return {
            base,
            operativo,
            secciones:[
                {titulo:"Ventas por categoria", rows:rpCategorias(base), tipoPrincipal:"money"},
                {titulo:"Ranking de gestores", rows:rpGestores(base), tipoPrincipal:"money"},
                {titulo:"Excedentes por valor vendido", rows:rpExcedentes(base), tipoPrincipal:"money"},
                {titulo:"Tipo de homenaje / excedente", rows:rpHomenajeExcedente(base), tipoPrincipal:"money"},
                {titulo:"Clinicas que mas reportan", rows:dim("clinica", "number", 12, "cantidad"), tipoPrincipal:"number", detalleValor:"valor"},
                {titulo:"Municipios de atencion", rows:dim("municipio", "number", 12, "cantidad"), tipoPrincipal:"number", detalleValor:"valor"},
                {titulo:"Tipo de muerte", rows:dim("tipoMuerte", "number", 8, "cantidad"), tipoPrincipal:"number", detalleValor:"valor"},
                {titulo:"Cementerios", rows:dim("cementerio", "number", 12, "cantidad"), tipoPrincipal:"number", detalleValor:"valor"},
                {titulo:"Destino final", rows:dim("destinoFinal", "number", 8, "cantidad"), tipoPrincipal:"number", detalleValor:"valor"},
                {titulo:"Tiempo afiliado", rows:rpTiempoAfiliadoRows(), tipoPrincipal:"days"},
                {titulo:"Consumo energia electrica", rows:rpEnergiaRows(operativo), tipoPrincipal:"kwh"},
                {titulo:"Vacaciones del personal", rows:rpVacacionesRows(operativo), tipoPrincipal:"number"},
                {titulo:"Agenda anual", rows:rpAgendaRows(operativo), tipoPrincipal:"number"}
            ].filter(s => Array.isArray(s.rows) && s.rows.length)
        };
    }

    function rpValue(row, tipo){
        if(tipo === "number") return Number(row.cantidad ?? row.valor ?? 0);
        if(tipo === "days") return Number(row.valor ?? row.cantidad ?? 0);
        if(tipo === "kwh") return Number(row.valor ?? row.kwh ?? row.cantidad ?? 0);
        return Number(row.valor ?? 0);
    }

    function rpValueText(value, tipo){
        if(tipo === "number") return rpNumber(value);
        if(tipo === "days") return `${rpNumber(value)} dias`;
        if(tipo === "kwh") return `${rpNumber(value)} kWh`;
        return rpMoney(value);
    }

    function rpLabelReporte(row, value, total, tipo, detalleValor){
        const meta = Number(row.meta || 0);
        if(meta > 0){
            const pct = (Number(value || 0) / meta) * 100;
            return `${rpValueText(value, tipo)} | ${rpPct(pct)} | ${rpEstadoMeta(pct)}`;
        }
        const pct = total > 0 ? (Number(value || 0) / total) * 100 : 0;
        let texto = `${rpValueText(value, tipo)} | ${rpPct(pct)} partic.`;
        if(detalleValor && row.valor){
            texto += ` | Venta ${rpMoney(row.valor)}`;
        }
        if(row.extra) texto += ` | ${rpText(row.extra)}`;
        if(row.note) texto += ` | ${rpText(row.note)}`;
        return texto;
    }

    async function rpJsPDF(){
        if(window.jspdf?.jsPDF) return window.jspdf.jsPDF;
        if(window.jsPDF) return window.jsPDF;
        await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
            script.onload = resolve;
            script.onerror = () => reject(new Error("No se pudo cargar jsPDF."));
            document.head.appendChild(script);
        });
        if(window.jspdf?.jsPDF) return window.jspdf.jsPDF;
        if(window.jsPDF) return window.jsPDF;
        throw new Error("jsPDF no esta disponible.");
    }

    async function exportarPDFCompleto20260727(){
        console.log("CLICK PDF - REPORTE COMPLETO 20260727");
        if(typeof showLoading === "function") showLoading(true);
        try{
            const jsPDF = await rpJsPDF();
            const {base, secciones, operativo} = rpSecciones();
            const doc = new jsPDF({orientation:"landscape", unit:"mm", format:"a4", compress:true});
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const margin = 11;
            let y = 0;

            function header(titulo="Reporte Gerencial de Homenajes"){
                doc.setFillColor(0,79,42);
                doc.rect(0,0,pageW,21,"F");
                doc.setTextColor(255,255,255);
                doc.setFont("helvetica","bold");
                doc.setFontSize(14);
                doc.text(rpText(titulo), margin, 12);
                doc.setFontSize(7);
                doc.setFont("helvetica","normal");
                doc.text(rpText(new Date().toLocaleString("es-CO")), pageW - margin, 12, {align:"right"});
                doc.setTextColor(15,23,42);
                y = 30;
            }

            function footer(){
                const total = doc.internal.getNumberOfPages();
                for(let p=1; p<=total; p++){
                    doc.setPage(p);
                    doc.setFont("helvetica","normal");
                    doc.setFontSize(7);
                    doc.setTextColor(100,116,139);
                    doc.text(`Pagina ${p} de ${total}`, pageW - margin, pageH - 6, {align:"right"});
                    doc.text("General Report Jkfh - Dashboard Gerencial", margin, pageH - 6);
                }
            }

            function nuevaPagina(titulo="Reporte Gerencial de Homenajes"){
                doc.addPage();
                header(titulo);
            }

            function asegurar(altura, titulo){
                if(y + altura > pageH - 12) nuevaPagina(titulo || "Reporte Gerencial de Homenajes");
            }

            function card(x, title, value, detail){
                doc.setDrawColor(211,225,218);
                doc.setFillColor(248,250,252);
                doc.roundedRect(x,y,63,24,3,3,"FD");
                doc.setFont("helvetica","bold");
                doc.setFontSize(7.2);
                doc.setTextColor(100,116,139);
                doc.text(rpText(title), x+4, y+6.5);
                doc.setFontSize(12);
                doc.setTextColor(15,23,42);
                doc.text(rpText(value), x+4, y+15.5, {maxWidth:55});
                doc.setFontSize(6.3);
                doc.setTextColor(100,116,139);
                doc.text(rpText(detail || ""), x+4, y+21, {maxWidth:55});
            }

            function textoSeccion(titulo){
                asegurar(12, titulo);
                doc.setFont("helvetica","bold");
                doc.setFontSize(10.5);
                doc.setTextColor(0,79,42);
                doc.text(rpText(titulo), margin, y);
                y += 6;
                doc.setTextColor(15,23,42);
            }

            function drawBarSection(titulo, rows, tipo="money", detalleValor){
                const datos = (rows || []).slice(0, 12);
                if(!datos.length) return;
                const rowH = 7.3;
                const alto = 13 + (datos.length * rowH) + 9;
                asegurar(alto, titulo);
                textoSeccion(titulo);
                const cardX = margin;
                const cardY = y;
                const cardW = pageW - margin*2;
                const cardH = 7 + datos.length * rowH + 7;
                doc.setFillColor(255,255,255);
                doc.setDrawColor(215,226,220);
                doc.roundedRect(cardX,cardY,cardW,cardH,3,3,"FD");
                const labelW = 59;
                const barX = cardX + labelW + 4;
                const barW = cardW - labelW - 69;
                const valueX = cardX + cardW - 62;
                const total = datos.reduce((acc,row) => acc + rpValue(row,tipo), 0) || 1;
                const max = Math.max(...datos.map(row => rpValue(row,tipo)),1);
                let yy = y + 6;
                datos.forEach((row, i) => {
                    const val = rpValue(row,tipo);
                    const barLen = Math.max((val / max) * barW, val > 0 ? 2 : 0);
                    doc.setFillColor(i % 2 ? 252 : 247, i % 2 ? 254 : 251, i % 2 ? 253 : 248);
                    doc.rect(cardX+2, yy-4.7, cardW-4, rowH, "F");
                    doc.setFont("helvetica","bold");
                    doc.setFontSize(6.5);
                    doc.setTextColor(15,23,42);
                    doc.text(rpText(row.label || row.nombre || "SIN REGISTRO"), cardX+4, yy, {maxWidth:labelW-7});
                    doc.setFillColor(0,154,81);
                    doc.roundedRect(barX, yy-4.4, barLen, 4.1, 1.7, 1.7, "F");
                    doc.setFont("helvetica","bold");
                    doc.setFontSize(6.2);
                    doc.setTextColor(15,23,42);
                    const label = rpLabelReporte(row, val, total, tipo, detalleValor);
                    doc.text(rpText(label), Math.min(barX + barLen + 3, valueX), yy, {maxWidth:62});
                    yy += rowH;
                });
                y += cardH + 8;
            }

            function drawTable(titulo, columns, rows, maxRows=12){
                const data = (rows || []).slice(0, maxRows);
                if(!data.length) return;
                const rowH = 7.1;
                asegurar(14 + (data.length+1)*rowH, titulo);
                textoSeccion(titulo);
                const usable = pageW - margin*2;
                const widths = columns.map(c => c.w || usable / columns.length);
                let x = margin;
                doc.setFillColor(0,111,63);
                doc.rect(margin,y,usable,rowH,"F");
                doc.setTextColor(255,255,255);
                doc.setFont("helvetica","bold");
                doc.setFontSize(6.6);
                columns.forEach((c,i) => { doc.text(rpText(c.h), x+2, y+4.7, {maxWidth:widths[i]-3}); x += widths[i]; });
                y += rowH;
                data.forEach((r,idx) => {
                    if(y + rowH > pageH - 12) nuevaPagina(titulo);
                    x = margin;
                    doc.setFillColor(idx % 2 ? 255 : 248, idx % 2 ? 255 : 250, idx % 2 ? 255 : 252);
                    doc.rect(margin,y,usable,rowH,"F");
                    doc.setFont("helvetica","normal");
                    doc.setFontSize(6.2);
                    doc.setTextColor(15,23,42);
                    columns.forEach((c,i) => {
                        let v = typeof c.v === "function" ? c.v(r) : r[c.k];
                        v = rpText(v || "-");
                        doc.text(v, x+2, y+4.7, {maxWidth:widths[i]-3});
                        x += widths[i];
                    });
                    y += rowH;
                });
                y += 8;
            }

            header("Reporte Gerencial de Homenajes");
            card(margin,"Meta del periodo",rpMoney(base.meta),"Rango seleccionado");
            card(margin+68,"Venta real",rpMoney(base.resumen.total),`${base.cumplimiento.toFixed(1)}% cumplimiento`);
            card(margin+136,"Faltante",rpMoney(base.faltante),"Brecha por cerrar");
            card(margin+204,"Registros",rpNumber(base.rows.length),"Base filtrada");
            y += 33;

            textoSeccion("Resumen ejecutivo");
            doc.setFont("helvetica","normal");
            doc.setFontSize(8.2);
            doc.setTextColor(15,23,42);
            const resumenTexto = `Venta real ${rpMoney(base.resumen.total)} frente a una meta de ${rpMoney(base.meta)}. Cumplimiento ${base.cumplimiento.toFixed(1)}%. Faltante ${rpMoney(base.faltante)}. PLAN registra ${rpNumber(base.resumen.planCantidad || 0)} atenciones y no suma ventas.`;
            const lineas = doc.splitTextToSize(rpText(resumenTexto), pageW - margin*2);
            doc.text(lineas, margin, y);
            y += lineas.length * 4.2 + 7;

            textoSeccion("Alertas gerenciales");
            doc.setFont("helvetica","normal");
            doc.setFontSize(7.8);
            rpAlertas(base).slice(0,7).forEach(a => {
                asegurar(5,"Alertas gerenciales");
                doc.text(`- ${rpText(a)}`, margin+2, y, {maxWidth:pageW-margin*2-4});
                y += 4.6;
            });
            y += 4;

            secciones.forEach(sec => drawBarSection(sec.titulo, sec.rows, sec.tipoPrincipal, sec.detalleValor));

            const tiempo = rpTiempoAfiliadoRows();
            if(tiempo.length){
                drawTable("Detalle tiempo afiliado", [
                    {h:"Orden / plan", v:r=>r.label, w:92},
                    {h:"Tiempo", v:r=>r.extra || rpValueText(r.valor,"days"), w:70},
                    {h:"Dias", v:r=>rpNumber(r.valor), w:25},
                    {h:"Clasificacion", v:r=>String(r.extra || "").split("|")[1] || "-", w:45}
                ], tiempo, 12);
            }

            if(operativo?.vacaciones?.length){
                drawTable("Control de vacaciones", [
                    {h:"Colaborador", v:r=>r.nombre || r.colaborador || "-", w:75},
                    {h:"Inicio", v:r=>r.inicio || "-", w:28},
                    {h:"Fin", v:r=>r.fin || "-", w:28},
                    {h:"Dias", v:r=>rpNumber(r.dias || 0), w:20},
                    {h:"Estado", v:r=>typeof estadoVacacion === "function" ? estadoVacacion(r) : (r.estado || "-"), w:35}
                ], operativo.vacaciones, 15);
            }

            if(operativo?.agenda?.length){
                drawTable("Agenda anual", [
                    {h:"Actividad", v:r=>r.titulo || r.actividad || "-", w:95},
                    {h:"Fecha", v:r=>r.fecha || "-", w:30},
                    {h:"Hora", v:r=>r.hora || "-", w:24},
                    {h:"Estado", v:r=>r.estado || "-", w:40}
                ], operativo.agenda, 15);
            }

            // Hoja tecnica final con conteo de secciones incluidas
            nuevaPagina("Indice del reporte exportado");
            textoSeccion("Contenido incluido");
            doc.setFont("helvetica","normal");
            doc.setFontSize(8);
            const contenido = [
                "KPIs principales y resumen ejecutivo",
                "Alertas gerenciales",
                ...secciones.map(s => s.titulo),
                "Detalle de tiempo afiliado",
                "Control de vacaciones",
                "Agenda anual"
            ];
            contenido.forEach((item, idx) => {
                if(y > pageH - 15) nuevaPagina("Indice del reporte exportado");
                doc.text(`${idx+1}. ${rpText(item)}`, margin+2, y);
                y += 5;
            });

            footer();
            rpDescargar(`reporte_gerencial_completo_${rpFechaArchivo()}.pdf`, doc.output("blob"));
            if(typeof setEstadoExportacion === "function") setEstadoExportacion("PDF completo generado: KPIs, alertas, graficas, tablas, operacion y tiempo afiliado.", "ok");
            if(typeof toast === "function") toast("PDF completo generado correctamente.");
        }catch(error){
            console.error("Error PDF completo 20260727:", error);
            if(typeof setEstadoExportacion === "function") setEstadoExportacion(`Error PDF: ${error.message}`, "error");
            alert("No se pudo generar el PDF completo. Error: " + error.message);
        }finally{
            if(typeof showLoading === "function") showLoading(false);
        }
    }

    function roundRect(ctx, x, y, w, h, r){
        r = Math.min(r, w/2, h/2);
        ctx.beginPath();
        ctx.moveTo(x+r,y);
        ctx.arcTo(x+w,y,x+w,y+h,r);
        ctx.arcTo(x+w,y+h,x,y+h,r);
        ctx.arcTo(x,y+h,x,y,r);
        ctx.arcTo(x,y,x+w,y,r);
        ctx.closePath();
    }

    function drawCanvasText(ctx, text, x, y, maxWidth, lineHeight){
        const words = rpText(text).split(" ");
        let line = "";
        let yy = y;
        words.forEach(word => {
            const test = line ? `${line} ${word}` : word;
            if(ctx.measureText(test).width > maxWidth && line){
                ctx.fillText(line, x, yy);
                line = word;
                yy += lineHeight;
            }else{
                line = test;
            }
        });
        if(line) ctx.fillText(line, x, yy);
        return yy + lineHeight;
    }

    function exportarImagenCompleta20260727(){
        console.log("CLICK IMAGEN - REPORTE COMPLETO 20260727");
        try{
            const {base, secciones, operativo} = rpSecciones();
            const sectionHeights = secciones.map(s => 90 + Math.min(s.rows.length, 10) * 44);
            let height = 330 + sectionHeights.reduce((a,b)=>a+b,0) + 520;
            if(operativo?.vacaciones?.length) height += 360;
            if(operativo?.agenda?.length) height += 360;
            height = Math.min(Math.max(height, 1800), 12000);

            const canvas = document.createElement("canvas");
            canvas.width = 1600;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if(!ctx) throw new Error("Canvas no disponible.");

            const W = canvas.width;
            let y = 0;
            ctx.fillStyle = "#f4f8f6";
            ctx.fillRect(0,0,W,height);
            ctx.fillStyle = "#004f2a";
            ctx.fillRect(0,0,W,120);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 44px Arial";
            ctx.fillText("Reporte Gerencial de Homenajes", 55, 55);
            ctx.font = "22px Arial";
            ctx.fillText(new Date().toLocaleString("es-CO"), 55, 91);
            y = 150;

            const card = (x,t,v,d) => {
                ctx.fillStyle = "#ffffff";
                ctx.strokeStyle = "#d6e3dc";
                ctx.lineWidth = 2;
                roundRect(ctx,x,y,350,110,18); ctx.fill(); ctx.stroke();
                ctx.fillStyle = "#64748b"; ctx.font = "bold 20px Arial"; ctx.fillText(rpText(t),x+24,y+34);
                ctx.fillStyle = "#0f172a"; ctx.font = "bold 34px Arial"; ctx.fillText(rpText(v),x+24,y+73);
                ctx.fillStyle = "#64748b"; ctx.font = "18px Arial"; ctx.fillText(rpText(d),x+24,y+99);
            };
            card(55,"Meta",rpMoney(base.meta),"Rango seleccionado");
            card(430,"Venta real",rpMoney(base.resumen.total),`${base.cumplimiento.toFixed(1)}% cumplimiento`);
            card(805,"Faltante",rpMoney(base.faltante),"Brecha por cerrar");
            card(1180,"Registros",rpNumber(base.rows.length),"Base filtrada");
            y += 150;

            ctx.fillStyle = "#004f2a";
            ctx.font = "bold 28px Arial";
            ctx.fillText("Resumen ejecutivo",55,y);
            y += 35;
            ctx.fillStyle = "#0f172a";
            ctx.font = "22px Arial";
            y = drawCanvasText(ctx, `Venta real ${rpMoney(base.resumen.total)} frente a meta ${rpMoney(base.meta)}. Cumplimiento ${base.cumplimiento.toFixed(1)}%. Faltante ${rpMoney(base.faltante)}. PLAN registra ${rpNumber(base.resumen.planCantidad || 0)} atenciones y no suma ventas.`, 55, y, 1490, 28) + 20;

            function drawSection(sec){
                const rows = sec.rows.slice(0,10);
                if(!rows.length) return;
                const cardH = 70 + rows.length * 44;
                ctx.fillStyle = "#ffffff";
                ctx.strokeStyle = "#d6e3dc";
                ctx.lineWidth = 2;
                roundRect(ctx, 55, y, 1490, cardH, 22); ctx.fill(); ctx.stroke();
                ctx.fillStyle = "#004f2a";
                ctx.font = "bold 26px Arial";
                ctx.fillText(rpText(sec.titulo), 85, y + 38);
                const chartY = y + 70;
                const labelX = 85;
                const barX = 445;
                const barMax = 700;
                const valueX = 1170;
                const tipo = sec.tipoPrincipal || "money";
                const total = rows.reduce((acc,row) => acc + rpValue(row,tipo), 0) || 1;
                const max = Math.max(...rows.map(row => rpValue(row,tipo)), 1);
                rows.forEach((row, i) => {
                    const yy = chartY + i*44;
                    const val = rpValue(row,tipo);
                    const barLen = Math.max((val/max)*barMax, val > 0 ? 10 : 0);
                    ctx.fillStyle = i % 2 ? "#ffffff" : "#f8fbf9";
                    ctx.fillRect(75, yy-22, 1450, 36);
                    ctx.fillStyle = "#0f172a";
                    ctx.font = "bold 18px Arial";
                    drawCanvasText(ctx, row.label || row.nombre || "SIN REGISTRO", labelX, yy, 330, 18);
                    ctx.fillStyle = "#00a651";
                    roundRect(ctx, barX, yy-16, barLen, 22, 11); ctx.fill();
                    ctx.fillStyle = "#0f172a";
                    ctx.font = "bold 17px Arial";
                    drawCanvasText(ctx, rpLabelReporte(row, val, total, tipo, sec.detalleValor), valueX, yy, 340, 18);
                });
                y += cardH + 28;
            }

            secciones.forEach(drawSection);

            const alertas = rpAlertas(base);
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "#d6e3dc";
            roundRect(ctx,55,y,1490,110 + alertas.length*24,22); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#004f2a"; ctx.font = "bold 26px Arial"; ctx.fillText("Alertas y cierre gerencial",85,y+38);
            ctx.fillStyle = "#0f172a"; ctx.font = "20px Arial";
            let yy = y + 72;
            alertas.forEach(a => { ctx.fillText(`- ${rpText(a)}`, 85, yy); yy += 26; });
            y = yy + 35;

            ctx.fillStyle = "#64748b";
            ctx.font = "18px Arial";
            ctx.fillText("Imagen completa generada desde el motor ejecutivo 20260727. Incluye indicadores, graficas y controles principales.",55, Math.min(y, height-45));

            canvas.toBlob(blob => {
                if(!blob){ alert("No se pudo crear la imagen completa."); return; }
                rpDescargar(`reporte_gerencial_completo_${rpFechaArchivo()}.png`, blob);
                if(typeof setEstadoExportacion === "function") setEstadoExportacion("Imagen completa generada. Incluye todas las secciones principales del reporte.", "ok");
                if(typeof toast === "function") toast("Imagen completa generada correctamente.");
            }, "image/png", 0.95);
        }catch(error){
            console.error("Error imagen completa 20260727:", error);
            if(typeof setEstadoExportacion === "function") setEstadoExportacion(`Error Imagen: ${error.message}`, "error");
            alert("No se pudo generar la imagen completa. Error: " + error.message);
        }
    }

    function sectionToRows(section){
        const tipo = section.tipoPrincipal || "money";
        const total = section.rows.reduce((acc,row) => acc + rpValue(row,tipo), 0) || 1;
        return section.rows.map(row => {
            const value = rpValue(row,tipo);
            const meta = Number(row.meta || 0);
            const pct = meta > 0 ? (value/meta)*100 : (value/total)*100;
            return {
                Nombre: row.label || row.nombre || "SIN REGISTRO",
                Valor: tipo === "money" ? Math.round(Number(row.valor || 0)) : value,
                Cantidad: Number(row.cantidad || 0),
                Meta: meta || "",
                Porcentaje: `${pct.toFixed(1)}%`,
                Estado: meta > 0 ? rpEstadoMeta(pct) : "Participacion",
                Detalle: row.extra || row.note || ""
            };
        });
    }

    function exportarExcelCompleto20260727(){
        console.log("CLICK EXCEL - REPORTE COMPLETO 20260727");
        try{
            const {base, secciones, operativo} = rpSecciones();
            if(!window.XLSX) throw new Error("XLSX no disponible");
            const wb = XLSX.utils.book_new();
            const resumen = [
                {Indicador:"Meta", Valor:Math.round(base.meta)},
                {Indicador:"Venta real", Valor:Math.round(base.resumen.total || 0)},
                {Indicador:"Cumplimiento", Valor:`${base.cumplimiento.toFixed(1)}%`},
                {Indicador:"Faltante", Valor:Math.round(base.faltante)},
                {Indicador:"Registros", Valor:base.rows.length},
                {Indicador:"Plan atenciones", Valor:base.resumen.planCantidad || 0}
            ];
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen");
            secciones.forEach(sec => {
                let name = rpText(sec.titulo).replace(/[\\/?*\[\]:]/g, "").slice(0,31) || "Seccion";
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sectionToRows(sec)), name);
            });
            if(operativo?.vacaciones?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(operativo.vacaciones), "Vacaciones");
            if(operativo?.agenda?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(operativo.agenda), "Agenda");
            const datos = (base.rows || []).map(row => ({
                Fecha: row.fecha ? (typeof formatFechaProfesional === "function" ? formatFechaProfesional(row.fecha) : row.fechaTexto) : row.fechaTexto,
                Orden: row.ordenServicio || "",
                Gestor: row.gestor || "",
                Sede: row.sede || "",
                Categoria: row.categoriaGerencial || row.categoria || "",
                Servicio: row.servicio || "",
                Clinica: row.clinica || "",
                Municipio: row.municipio || "",
                Tipo_Muerte: row.tipoMuerte || "",
                Cementerio: row.cementerio || "",
                Destino_Final: row.destinoFinal || "",
                Cantidad: row.cantidadAtendida || 1,
                Valor: Math.round(Number(row.valorVenta || 0))
            }));
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), "Datos Filtrados");
            XLSX.writeFile(wb, `reporte_gerencial_completo_${rpFechaArchivo()}.xlsx`);
            if(typeof setEstadoExportacion === "function") setEstadoExportacion("Excel completo generado con todas las secciones principales.", "ok");
            if(typeof toast === "function") toast("Excel completo generado correctamente.");
        }catch(error){
            console.error("Error Excel completo 20260727:", error);
            if(typeof setEstadoExportacion === "function") setEstadoExportacion(`Error Excel: ${error.message}`, "error");
            alert("No se pudo generar el Excel completo. Error: " + error.message);
        }
    }

    function vincularReporteCompleto(id, fn){
        const boton = document.getElementById(id);
        if(!boton) return;
        const nuevo = boton.cloneNode(true);
        boton.parentNode.replaceChild(nuevo, boton);
        nuevo.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            fn();
        });
    }

    function instalarReporteCompleto20260727(){
        vincularReporteCompleto("btnPdf", exportarPDFCompleto20260727);
        vincularReporteCompleto("reportePdfGeneral", exportarPDFCompleto20260727);
        vincularReporteCompleto("btnImagen", exportarImagenCompleta20260727);
        vincularReporteCompleto("reporteImagen", exportarImagenCompleta20260727);
        vincularReporteCompleto("btnExcel", exportarExcelCompleto20260727);
        vincularReporteCompleto("reporteExcelResumen", exportarExcelCompleto20260727);
        if(typeof setEstadoExportacion === "function") setEstadoExportacion("Exportaciones completas activas: PDF multi-pagina, imagen completa y Excel multihoja.", "ok");
    }

    window.exportarPDFCompleto20260727 = exportarPDFCompleto20260727;
    window.exportarImagenCompleta20260727 = exportarImagenCompleta20260727;
    window.exportarExcelCompleto20260727 = exportarExcelCompleto20260727;

    instalarReporteCompleto20260727();
    setTimeout(instalarReporteCompleto20260727, 800);
    setTimeout(instalarReporteCompleto20260727, 2500);

    console.log("EXPORTACIONES COMPLETAS ACTIVAS - VERSION " + VERSION_REPORTE_COMPLETO);
})();


/* =========================================================
   RECUPERACIÓN SEGURA 20260729
   Recupera tablas y gráficas, corrige meta/venta real,
   colores de dona y excedentes por valor excedente.
   ========================================================= */
(function(){
    const VERSION_RECUPERACION_SEGURA = "20260729";

    try{ window.charts = charts; }catch(e){}

    function temaActualGrafica(){
        const oscuro = document.body.classList.contains('theme-dark') ||
            document.body.classList.contains('theme-slate') ||
            document.body.classList.contains('dark-mode');
        return {
            oscuro,
            texto: oscuro ? '#f8fafc' : '#0f172a',
            textoSuave: oscuro ? '#cbd5e1' : '#475569',
            grid: oscuro ? 'rgba(255,255,255,.13)' : 'rgba(15,23,42,.10)',
            area: oscuro ? 'rgba(8,26,44,.92)' : 'rgba(255,255,255,.98)',
            etiquetaFondo: 'rgba(255,255,255,.96)',
            etiquetaTexto: '#0f172a',
            etiquetaBorde: oscuro ? 'rgba(255,255,255,.24)' : 'rgba(0,105,55,.20)'
        };
    }

    function destruirGraficoSeguro(id){
        try{
            if(charts && charts[id]){
                charts[id].destroy();
                charts[id] = null;
            }
        }catch(e){ console.warn('No se pudo destruir gráfico', id, e); }
    }

    function prepararCanvasSeguro(canvas, alto){
        if(!canvas) return;
        canvas.style.height = alto + 'px';
        canvas.height = alto;
        const card = canvas.closest('.grafico-card') || canvas.parentElement;
        if(card){
            card.style.minHeight = (alto + 90) + 'px';
        }
        if(canvas.parentElement){
            canvas.parentElement.style.minHeight = (alto + 30) + 'px';
        }
    }

    function pluginFondoGrafica(){
        return {
            id:'fondoGraficaRecuperacion20260729',
            beforeDraw(chart){
                const area = chart.chartArea;
                if(!area) return;
                const t = temaActualGrafica();
                const ctx = chart.ctx;
                ctx.save();
                ctx.fillStyle = t.area;
                ctx.fillRect(area.left, area.top, area.right - area.left, area.bottom - area.top);
                ctx.restore();
            }
        };
    }

    function numeroPlano(valor){
        return Number(toNumber(valor)).toLocaleString('es-CO');
    }

    function estadoGrafica(pct){
        if(pct >= 100) return 'Cumplida';
        if(pct >= 80) return 'En riesgo';
        return 'No cumple';
    }

    function valorGrafica(valor, tipo){
        if(tipo === 'money') return formatMoney(valor);
        if(tipo === 'percent') return `${toNumber(valor).toFixed(1)}%`;
        return numeroPlano(valor);
    }

    function etiquetaGraficaBarra(value, ctx, horizontal, tipoValor, opciones){
        const valor = toNumber(value);
        const meta = Array.isArray(opciones.metas) ? toNumber(opciones.metas[ctx.dataIndex]) : 0;
        const total = toNumber(opciones.total);
        const textoValor = valorGrafica(valor, tipoValor);

        if(typeof opciones.formatterEtiqueta === 'function'){
            return opciones.formatterEtiqueta({valor, meta, total, index:ctx.dataIndex, horizontal});
        }

        if(meta > 0){
            const pct = (valor / meta) * 100;
            return horizontal ? `${textoValor} | ${pct.toFixed(1)}% | ${estadoGrafica(pct)}` : [textoValor, `${pct.toFixed(1)}%`, estadoGrafica(pct)];
        }

        if(total > 0 && opciones.mostrarParticipacion !== false){
            const pct = (Math.abs(valor) / total) * 100;
            return horizontal ? `${textoValor} | ${pct.toFixed(1)}%` : [textoValor, `${pct.toFixed(1)}%`];
        }

        return horizontal ? textoValor : [textoValor];
    }

    window.crearChartBar = function(idCanvas, labels, data, label, titulo, horizontal=false, tipoValor='money', opciones={}){
        try{
            const canvas = document.getElementById(idCanvas);
            if(!canvas || typeof Chart === 'undefined') return;

            registrarPluginGraficas?.();
            destruirGraficoSeguro(idCanvas);

            const t = temaActualGrafica();
            const valores = (Array.isArray(data) ? data : []).map(v => toNumber(v));
            const originales = Array.isArray(labels) ? labels : [];
            const etiquetas = originales.map(x => {
                const txt = String(x || 'SIN REGISTRO').toUpperCase();
                return horizontal && txt.length > 30 ? txt.slice(0, 30) + '…' : txt;
            });
            const cantidad = Math.max(etiquetas.length, 1);
            const alto = horizontal ? Math.min(Math.max(330, 125 + cantidad * 40), 820) : 385;
            const maxValor = Math.max(...valores.map(v => Math.abs(v)), 0);
            const total = toNumber(opciones.total) || valores.reduce((a,b)=>a + Math.abs(b), 0);
            const barThickness = horizontal ? Math.max(22, Math.min(34, Math.floor((alto - 135) / cantidad * .72))) : 48;

            prepararCanvasSeguro(canvas, alto);

            charts[idCanvas] = new Chart(canvas, {
                type:'bar',
                plugins:[pluginFondoGrafica()],
                data:{
                    labels:etiquetas,
                    datasets:[{
                        label:opciones.legendLabel || label,
                        data:valores,
                        backgroundColor:opciones.backgroundColor || '#0ea85f',
                        borderColor:opciones.borderColor || '#047857',
                        borderWidth:1.2,
                        borderRadius:horizontal ? 9 : 12,
                        borderSkipped:false,
                        barThickness,
                        maxBarThickness:horizontal ? 36 : 56,
                        minBarLength:horizontal ? 16 : 8,
                        categoryPercentage:.86,
                        barPercentage:.92
                    }]
                },
                options:{
                    responsive:true,
                    maintainAspectRatio:false,
                    animation:false,
                    indexAxis:horizontal ? 'y' : 'x',
                    interaction:{mode:'nearest', axis:horizontal ? 'y' : 'x', intersect:false},
                    layout:{padding:horizontal ? {left:10,right:300,top:12,bottom:12} : {left:12,right:34,top:18,bottom:12}},
                    plugins:{
                        title:{display:false},
                        legend:{display:true, position:'top', labels:{color:t.texto, boxWidth:13, boxHeight:8, padding:12, font:{family:'Inter, Segoe UI, Arial', size:12, weight:'900'}}},
                        tooltip:{
                            backgroundColor:'rgba(15,23,42,.96)', titleColor:'#fff', bodyColor:'#fff', borderColor:'rgba(34,197,94,.35)', borderWidth:1,
                            callbacks:{
                                title:items => originales[items?.[0]?.dataIndex] || items?.[0]?.label || '-',
                                label:ctx => {
                                    const valor = toNumber(ctx.parsed[horizontal ? 'x' : 'y']);
                                    const meta = Array.isArray(opciones.metas) ? toNumber(opciones.metas[ctx.dataIndex]) : 0;
                                    if(typeof opciones.tooltipLineas === 'function') return opciones.tooltipLineas({valor, meta, index:ctx.dataIndex, total});
                                    const lineas = [`${ctx.dataset.label}: ${valorGrafica(valor,tipoValor)}`];
                                    if(meta > 0){
                                        const pct = (valor/meta)*100;
                                        lineas.push(`Meta: ${valorGrafica(meta,tipoValor)}`);
                                        lineas.push(`Cumplimiento: ${pct.toFixed(1)}%`);
                                        lineas.push(`Estado: ${estadoGrafica(pct)}`);
                                    }else if(total > 0 && opciones.mostrarParticipacion !== false){
                                        lineas.push(`Participación: ${((Math.abs(valor)/total)*100).toFixed(1)}%`);
                                    }
                                    return lineas;
                                }
                            }
                        },
                        datalabels:{
                            display:ctx => Math.abs(toNumber(ctx.dataset.data[ctx.dataIndex])) > 0,
                            anchor:'end', align:horizontal ? 'right' : 'top', offset:horizontal ? 8 : 5,
                            clamp:false, clip:false,
                            color:t.etiquetaTexto,
                            backgroundColor:t.etiquetaFondo,
                            borderColor:t.etiquetaBorde,
                            borderWidth:1,
                            borderRadius:999,
                            padding:{top:4,right:9,bottom:4,left:9},
                            font:{family:'Inter, Segoe UI, Arial', size:horizontal ? 11 : 10.5, weight:'900'},
                            formatter:(value, ctx) => etiquetaGraficaBarra(value, ctx, horizontal, tipoValor, {...opciones, total})
                        }
                    },
                    scales:horizontal ? {
                        y:{ticks:{color:t.texto, font:{family:'Inter, Segoe UI, Arial', size:12, weight:'900'}, autoSkip:false, padding:8}, grid:{display:false}, border:{display:false}},
                        x:{beginAtZero:true, suggestedMax:maxValor > 0 ? maxValor * 1.24 : 1, ticks:{color:t.textoSuave, font:{family:'Inter, Segoe UI, Arial', size:10.5, weight:'800'}, maxTicksLimit:6, callback:value => tipoValor === 'money' ? numeroPlano(value) : valorGrafica(value,tipoValor)}, grid:{color:t.grid}, border:{color:t.grid}}
                    } : {
                        y:{beginAtZero:true, suggestedMax:maxValor > 0 ? maxValor * 1.18 : 1, ticks:{color:t.textoSuave, font:{family:'Inter, Segoe UI, Arial', size:10.5, weight:'800'}, maxTicksLimit:6, callback:value => tipoValor === 'money' ? numeroPlano(value) : valorGrafica(value,tipoValor)}, grid:{color:t.grid}, border:{color:t.grid}},
                        x:{ticks:{color:t.texto, font:{family:'Inter, Segoe UI, Arial', size:11, weight:'900'}, autoSkip:false, maxRotation:0, minRotation:0}, grid:{display:false}, border:{display:false}}
                    }
                }
            });
        }catch(error){
            console.error('Error seguro creando gráfica ' + idCanvas, error);
        }
    };

    window.crearChartDoughnut = function(idCanvas, labels, data, titulo, tipoValor='money'){
        try{
            const canvas = document.getElementById(idCanvas);
            if(!canvas || typeof Chart === 'undefined') return;
            const t = temaActualGrafica();
            const valores = (Array.isArray(data) ? data : []).map(v => toNumber(v));
            const total = valores.reduce((a,b)=>a+b,0);
            prepararCanvasSeguro(canvas, 365);
            destruirGraficoSeguro(idCanvas);

            charts[idCanvas] = new Chart(canvas, {
                type:'doughnut',
                plugins:[pluginFondoGrafica()],
                data:{
                    labels:labels || [],
                    datasets:[{
                        data:valores,
                        backgroundColor:['#16a34a','#2563eb','#f59e0b','#a855f7','#ef4444','#06b6d4'],
                        borderColor:t.oscuro ? '#0f172a' : '#ffffff',
                        borderWidth:3,
                        hoverOffset:6
                    }]
                },
                options:{
                    responsive:true,
                    maintainAspectRatio:false,
                    animation:false,
                    cutout:'56%',
                    plugins:{
                        title:{display:false},
                        legend:{display:true, position:'top', labels:{color:t.texto, boxWidth:13, font:{family:'Inter, Segoe UI, Arial', size:12, weight:'900'}}},
                        tooltip:{backgroundColor:'rgba(15,23,42,.96)', titleColor:'#fff', bodyColor:'#fff', callbacks:{label:ctx => `${ctx.label}: ${valorGrafica(ctx.parsed,tipoValor)} (${total > 0 ? ((toNumber(ctx.parsed)/total)*100).toFixed(1) : '0.0'}%)`}},
                        datalabels:{display:ctx => Math.abs(toNumber(ctx.dataset.data[ctx.dataIndex])) > 0, color:'#ffffff', textStrokeColor:'rgba(0,0,0,.40)', textStrokeWidth:2, font:{family:'Inter, Segoe UI, Arial', size:11, weight:'900'}, formatter:value => total > 0 ? `${valorGrafica(value,tipoValor)}\n${((toNumber(value)/total)*100).toFixed(1)}%` : valorGrafica(value,tipoValor)}
                    }
                }
            });
        }catch(error){
            console.error('Error seguro creando dona ' + idCanvas, error);
        }
    };

    const renderGraficosDashboardOriginal = typeof renderGraficosDashboard === 'function' ? renderGraficosDashboard : null;
    renderGraficosDashboard = window.renderGraficosDashboard = function(resumen){
        try{
            resumen = resumen || calcularResumen(DATASET_FILTRADO || []);
            crearChartBar(
                'graficoMetaReal',
                ['Meta','Venta Real'],
                [META_RANGO_ACTUAL, resumen.total],
                'Valor',
                'Meta del Rango vs Venta Real',
                false,
                'money',
                {
                    metas:[0, META_RANGO_ACTUAL],
                    legendLabel:'Valor',
                    mostrarParticipacion:false,
                    formatterEtiqueta:({valor,index,meta}) => {
                        if(index === 0) return [formatMoney(valor), 'Valor objetivo'];
                        const pct = meta > 0 ? (valor/meta)*100 : 0;
                        return [formatMoney(valor), `${pct.toFixed(1)}%`, estadoGrafica(pct)];
                    },
                    tooltipLineas:({valor,meta,index}) => {
                        if(index === 0) return ['Meta del rango: ' + formatMoney(valor), 'Valor objetivo del periodo'];
                        const pct = meta > 0 ? (valor/meta)*100 : 0;
                        return ['Venta Real: ' + formatMoney(valor), 'Meta: ' + formatMoney(meta), 'Cumplimiento: ' + pct.toFixed(1) + '%', 'Estado: ' + estadoGrafica(pct)];
                    }
                }
            );

            crearChartDoughnut(
                'graficoCategoriasDashboard',
                ['PARTICULAR','RED','EXCEDENTES'],
                [resumen.particular, resumen.red, resumen.excedentes],
                'Participación por Categoría',
                'money'
            );
        }catch(error){
            console.error('Error renderGraficosDashboard seguro:', error);
            if(renderGraficosDashboardOriginal) try{ renderGraficosDashboardOriginal(resumen); }catch(e){}
        }
    };

    function agruparExcedentesSeguro(rows){
        const obj = {};
        Object.keys(PARAMETROS.excedente || {}).forEach(nombre => {
            obj[nombre] = {nombre, cantidad:0, valor:0};
        });

        (rows || []).forEach(row => {
            const servicio = normalizarTexto(row.servicio || row.tipoServicio || 'EXCEDENTES');
            const esExcedente = normalizarTexto(row.categoriaGerencial) === 'EXCEDENTES' || toNumber(row.valorExcedente) > 0 || esServicioExcedente(servicio) || !!PARAMETROS.excedente[servicio];
            if(!esExcedente) return;
            if(servicio.includes('SERVICIO FUNERARIO') && toNumber(row.valorExcedente) <= 0 && normalizarTexto(row.categoriaGerencial) !== 'EXCEDENTES') return;
            const valor = normalizarTexto(row.categoriaGerencial) === 'EXCEDENTES' ? Math.max(toNumber(row.valorVenta), toNumber(row.valorExcedente)) : toNumber(row.valorExcedente);
            if(valor <= 0) return;
            const nombre = servicio || 'EXCEDENTES';
            if(!obj[nombre]) obj[nombre] = {nombre, cantidad:0, valor:0};
            obj[nombre].cantidad += toNumber(row.cantidadAtendida) || 1;
            obj[nombre].valor += valor;
        });
        return obj;
    }

    const renderExcedentesOriginal = typeof renderExcedentes === 'function' ? renderExcedentes : null;
    renderExcedentes = window.renderExcedentes = function(){
        try{
            const excedentes = Object.values(agruparExcedentesSeguro(DATASET_FILTRADO || []))
                .filter(x => toNumber(x.valor) > 0 || toNumber(x.cantidad) > 0)
                .sort((a,b)=>toNumber(b.valor)-toNumber(a.valor));
            const totalExcedentes = excedentes.reduce((acc,x)=>acc + toNumber(x.valor),0);
            const cantidad = excedentes.reduce((acc,x)=>acc + toNumber(x.cantidad),0);
            const metaExcedentes = metaCategoriaMensual('EXCEDENTES') * MESES_EQUIVALENTES_ACTUAL;
            const cumplimiento = metaExcedentes > 0 ? (totalExcedentes/metaExcedentes)*100 : 0;

            setHtml('vistaExcedentesValor', formatMoney(totalExcedentes));
            setHtml('vistaExcedentesCantidad', numeroPlano(cantidad));
            setHtml('vistaExcedentesMeta', formatMoney(metaExcedentes));
            setHtml('vistaExcedentesCumplimiento', cumplimiento.toFixed(1) + '%');

            const tbody = document.querySelector('#tablaExcedentesVista tbody');
            if(tbody){
                if(!excedentes.length){
                    tbody.innerHTML = `<tr><td colspan="6">Sin excedentes registrados</td></tr>`;
                }else{
                    tbody.innerHTML = excedentes.map(item => {
                        const meta = metaExcedenteMensual(item.nombre) * MESES_EQUIVALENTES_ACTUAL;
                        const pct = meta > 0 ? (toNumber(item.valor)/meta)*100 : 0;
                        return `<tr>
                            <td>${escapeHtml(item.nombre)}</td>
                            <td>${formatMoney(meta)}</td>
                            <td>${numeroPlano(item.cantidad)}</td>
                            <td>${formatMoney(item.valor)}</td>
                            <td>${pct.toFixed(1)}%</td>
                            <td>${badgeEstado(pct)}</td>
                        </tr>`;
                    }).join('');
                }
            }

            const top = excedentes.slice(0,15);
            crearChartBar(
                'graficoExcedentes',
                top.map(x => x.nombre),
                top.map(x => x.valor),
                'Venta',
                'Excedentes por valor vendido',
                true,
                'money',
                {metas:top.map(x => metaExcedenteMensual(x.nombre) * MESES_EQUIVALENTES_ACTUAL), total:totalExcedentes, legendLabel:'Venta | % cumplimiento | Estado', backgroundColor:'#0ea85f', borderColor:'#047857'}
            );
        }catch(error){
            console.error('Error renderExcedentes seguro:', error);
            if(renderExcedentesOriginal) try{ renderExcedentesOriginal(); }catch(e){}
        }
    };

    function reinstalarExportacionImagenSegura(){
        if(typeof exportarImagenCompleta20260727 !== 'function') return;
        ['btnImagen','reporteImagen'].forEach(id => {
            const btn = document.getElementById(id);
            if(!btn) return;
            const nuevo = btn.cloneNode(true);
            btn.parentNode.replaceChild(nuevo, btn);
            nuevo.addEventListener('click', ev => {
                ev.preventDefault();
                ev.stopPropagation();
                exportarImagenCompleta20260727();
            });
        });
    }

    function refrescarSeguro(){
        try{
            if(typeof aplicarFiltrosYRender === 'function') aplicarFiltrosYRender();
            if(typeof hacerTablasOrdenables === 'function') hacerTablasOrdenables();
        }catch(error){
            console.error('Error refrescando recuperación segura:', error);
        }
    }

    reinstalarExportacionImagenSegura();
    setTimeout(reinstalarExportacionImagenSegura, 900);
    setTimeout(refrescarSeguro, 1200);
    setTimeout(refrescarSeguro, 2800);
    console.log('RECUPERACIÓN SEGURA DE GRAFICAS Y TABLAS ACTIVA - VERSION ' + VERSION_RECUPERACION_SEGURA);
})();


/* =========================================================
   RECUPERACIÓN DE DATOS GOOGLE SHEET 20260730
   Fuente remota robusta, validación de CSV/JSON, cache local
   y render protegido por secciones.
   ========================================================= */
(function(){
    const VERSION_DATOS_GOOGLE_20260730 = "20260730";
    const SHEET_ID_20260730 = "1Q1hyG-SXsMJdrgsLRIPiVlVePZuov4eJSYsb6l4EmyQ";
    const GID_DATOS_20260730 = "223294406";
    const GID_PARAMETROS_20260730 = "1505384889";
    const CACHE_REMOTO_KEY_20260730 = "dashboardRemoteCache20260730";

    function urlNoCache(url){
        const sep = String(url).includes("?") ? "&" : "?";
        return `${url}${sep}_=${Date.now()}`;
    }

    function esRespuestaHtml(texto){
        const t = String(texto || "").slice(0, 800).toLowerCase();
        return t.includes("<!doctype") || t.includes("<html") || t.includes("service login") || t.includes("accounts.google") || t.includes("drive.google");
    }

    function urlsDatosGoogle20260730(){
        return [
            {nombre:"Apps Script", tipo:"json", url:API_URL},
            {nombre:"Google Sheets CSV export", tipo:"csv", url:`https://docs.google.com/spreadsheets/d/${SHEET_ID_20260730}/export?format=csv&gid=${GID_DATOS_20260730}`},
            {nombre:"Google Sheets GViz CSV", tipo:"csv", url:`https://docs.google.com/spreadsheets/d/${SHEET_ID_20260730}/gviz/tq?tqx=out:csv&gid=${GID_DATOS_20260730}`}
        ];
    }

    function urlsParametrosGoogle20260730(){
        return [
            {nombre:"Parámetros CSV export", tipo:"csv", url:`https://docs.google.com/spreadsheets/d/${SHEET_ID_20260730}/export?format=csv&gid=${GID_PARAMETROS_20260730}`},
            {nombre:"Parámetros GViz CSV", tipo:"csv", url:`https://docs.google.com/spreadsheets/d/${SHEET_ID_20260730}/gviz/tq?tqx=out:csv&gid=${GID_PARAMETROS_20260730}`}
        ];
    }

    function obtenerDatosJsonRobusto(json){
        if(!json) return [];
        if(Array.isArray(json)) return convertirArrayAObjetos(json);
        if(Array.isArray(json.homenajes)) return convertirArrayAObjetos(json.homenajes);
        if(Array.isArray(json.datos)) return convertirArrayAObjetos(json.datos);
        if(Array.isArray(json.data)) return convertirArrayAObjetos(json.data);
        if(Array.isArray(json.registros)) return convertirArrayAObjetos(json.registros);
        if(Array.isArray(json.result)) return convertirArrayAObjetos(json.result);
        if(json.values && Array.isArray(json.values)) return convertirArrayAObjetos(json.values);
        if(json.resultado && Array.isArray(json.resultado)) return convertirArrayAObjetos(json.resultado);
        return obtenerDatosDesdeApi(json);
    }

    function validarFilasGoogle20260730(datos){
        if(!Array.isArray(datos) || datos.length === 0){
            return {ok:false, motivo:"sin registros"};
        }

        const columnas = Object.keys(datos[0] || {});
        const columnasNorm = columnas.map(c => normalizarLlave(c));
        const tieneColumna = nombres => nombres.some(n => columnasNorm.includes(normalizarLlave(n)));

        const tieneFecha = tieneColumna(["FECHA","Fecha","FECHA DE LA ORDEN"]);
        const tieneOrden = tieneColumna(["ORDEN_SERVICIO_FUNERARIO","ORDEN SERVICIO FUNERARIO","ORDEN"]);
        const tieneCategoria = tieneColumna(["TIPO_HOMENAJE","TIPO HOMENAJE","TIPO_SERVICIO_TIPOSRV","TIPO_EXCEDENTE"]);
        const tieneGestor = tieneColumna(["GESTOR","Gestor"]);
        const tieneValor = tieneColumna(["VALOR SERVICIO","VALOR_EXCEDENTE","VALOR EXCEDENTE","VALOR","Valor"]);

        if(!tieneFecha && !tieneOrden){
            return {ok:false, motivo:`encabezados no válidos: ${columnas.slice(0,8).join(" | ")}`};
        }

        if(!(tieneCategoria || tieneGestor || tieneValor)){
            return {ok:false, motivo:`estructura incompleta: ${columnas.slice(0,8).join(" | ")}`};
        }

        const filasConDatos = datos.filter(item => {
            return String(getFechaItem(item) || getOrdenServicioItem(item) || getGestorItem(item) || getCategoriaItem(item) || getValorItem(item) || "").trim() !== "";
        }).length;

        if(filasConDatos === 0){
            return {ok:false, motivo:"filas sin datos operativos"};
        }

        return {ok:true, motivo:"estructura válida", filasConDatos};
    }

    async function fetchTextoRobusto(url){
        const response = await fetch(urlNoCache(url), {
            method:"GET",
            cache:"no-store",
            redirect:"follow",
            credentials:"omit"
        });
        if(!response.ok) throw new Error(`HTTP ${response.status}`);
        const texto = await response.text();
        if(esRespuestaHtml(texto)) throw new Error("la respuesta fue HTML/login, no datos CSV/JSON");
        return texto;
    }

    async function cargarFuenteRobusta(fuente){
        const texto = await fetchTextoRobusto(fuente.url);
        let datos = [];
        if(fuente.tipo === "json"){
            const json = JSON.parse(texto);
            datos = obtenerDatosJsonRobusto(json);
        }else{
            datos = parseTablaTexto(texto);
        }
        const validacion = validarFilasGoogle20260730(datos);
        if(!validacion.ok) throw new Error(validacion.motivo);
        return {datos, validacion};
    }

    async function cargarDatosRemotosRobusto20260730(){
        const errores = [];
        for(const fuente of urlsDatosGoogle20260730()){
            try{
                const resultado = await cargarFuenteRobusta(fuente);
                console.info(`[Dashboard] Fuente OK: ${fuente.nombre}`, resultado.validacion);
                return {datos:resultado.datos, fuente:fuente.nombre};
            }catch(error){
                const msg = `${fuente.nombre}: ${error.message}`;
                errores.push(msg);
                console.warn(`[Dashboard] Fuente fallida: ${msg}`);
            }
        }
        throw new Error(errores.join(" | "));
    }

    async function cargarParametrosRemotosRobusto20260730(){
        const errores = [];
        for(const fuente of urlsParametrosGoogle20260730()){
            try{
                const texto = await fetchTextoRobusto(fuente.url);
                const datos = parseTablaTexto(texto);
                const utiles = datos.filter(item => esFilaParametro(item) || normalizarTexto(getCampo(item,["Tipo","TIPO"])) === "SEDE");
                if(utiles.length){
                    console.info(`[Dashboard] Parámetros OK: ${fuente.nombre}`, utiles.length);
                    return utiles;
                }
                errores.push(`${fuente.nombre}: sin parámetros útiles`);
            }catch(error){
                errores.push(`${fuente.nombre}: ${error.message}`);
                console.warn(`[Dashboard] Parámetros fallidos: ${fuente.nombre}`, error);
            }
        }
        console.warn("[Dashboard] Se usarán parámetros base.", errores.join(" | "));
        return parametrosBaseDashboard();
    }

    async function cargarFallecidosPlanesRobusto20260730(){
        const urls = [
            `https://docs.google.com/spreadsheets/d/${SHEET_ID_20260730}/gviz/tq?tqx=out:csv&sheet=FALLECIDOS%20PLANES`,
            GOOGLE_SHEET_FALLECIDOS_PLANES_CSV_URL
        ];
        for(const url of urls){
            try{
                const texto = await fetchTextoRobusto(url);
                const datos = parseTablaTexto(texto);
                const normalizados = datos
                    .map((item,index) => normalizarFallecidoPlan(item,index))
                    .filter(item => item.ordenServicio || item.numeroContrato || item.tiempoAfiliacionTexto || item.fechaOrden);
                if(normalizados.length){
                    console.info("[Dashboard] FALLECIDOS PLANES OK", normalizados.length);
                    return normalizados;
                }
            }catch(error){
                console.warn("[Dashboard] No se pudo cargar FALLECIDOS PLANES desde una fuente.", error);
            }
        }
        return [];
    }

    function guardarCacheRemoto20260730(payload){
        try{
            localStorage.setItem(CACHE_REMOTO_KEY_20260730, JSON.stringify({
                ...payload,
                guardado:new Date().toISOString()
            }));
        }catch(error){
            console.warn("[Dashboard] No se pudo guardar cache remoto.", error);
        }
    }

    function leerCacheRemoto20260730(){
        try{
            const cache = JSON.parse(localStorage.getItem(CACHE_REMOTO_KEY_20260730) || "null");
            if(cache && Array.isArray(cache.datosVentas) && cache.datosVentas.length){
                return cache;
            }
        }catch(error){
            console.warn("[Dashboard] Cache remoto inválido.", error);
        }
        return null;
    }

    function renderSeccionSegura(nombre, fn){
        try{ fn(); }
        catch(error){ console.error(`[Dashboard] Error renderizando ${nombre}:`, error); }
    }

    renderTodo = window.renderTodo = function(resumen, metaInfo){
        renderSeccionSegura("KPIs", () => actualizarKPIs(resumen, metaInfo));
        renderSeccionSegura("Resumen ejecutivo", () => crearResumenEjecutivo(resumen, metaInfo));
        renderSeccionSegura("Gráficos dashboard", () => renderGraficosDashboard(resumen));
        renderSeccionSegura("Categorías", () => renderCategorias());
        renderSeccionSegura("Gestores", () => renderGestores());
        renderSeccionSegura("Excedentes", () => renderExcedentes());
        renderSeccionSegura("Metas", () => renderMetas());
        renderSeccionSegura("Cumplimiento", () => renderCumplimientoMensual());
        renderSeccionSegura("Comparativo", () => renderComparativoAnual());
        renderSeccionSegura("Pareto", () => renderPareto());
        renderSeccionSegura("Datos", () => renderDatos());
        renderSeccionSegura("Alertas", () => renderAlertas(resumen));
        renderSeccionSegura("Energía", () => renderEnergia());
        renderSeccionSegura("Vacaciones", () => renderVacaciones());
        renderSeccionSegura("Agenda", () => renderAgenda());
        renderSeccionSegura("Tiempo afiliado", () => renderTiempoAfiliado());
        renderSeccionSegura("Registros manuales", () => renderRegistrosManuales());
        renderSeccionSegura("Reporte formal", () => renderReporteFormal());
        renderSeccionSegura("Configuración", () => actualizarConfiguracion());
    };

    aplicarFiltrosYRender = window.aplicarFiltrosYRender = function(){
        try{
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
            console.info(`[Dashboard] Render OK: ${DATASET_FILTRADO.length} registros filtrados de ${DATASET_NORMAL.length}.`);
        }catch(error){
            console.error("[Dashboard] Error crítico aplicando filtros/render:", error);
            setEstadoApi("error", "Error render");
            toast("Error renderizando el dashboard. Revisa consola.", "error");
        }
    };

    cargarDashboard = window.cargarDashboard = async function(){
        setEstadoApi("cargando", "Cargando Google Sheet...");
        showLoading(true);

        try{
            const remoto = await cargarDatosRemotosRobusto20260730();
            const parametrosRemotos = await cargarParametrosRemotosRobusto20260730();
            const fallecidosPlanes = await cargarFallecidosPlanesRobusto20260730();

            const datosVentas = remoto.datos.filter(item => !esFilaParametro(item));
            const normalApi = datosVentas
                .map(item => normalizarRegistro(item, "GOOGLE_SHEET"))
                .filter(row => row.fecha || row.ordenServicio || row.gestor || row.categoria || row.servicio);

            if(!normalApi.length){
                throw new Error("La fuente respondió, pero no produjo registros normalizados de ventas.");
            }

            DATASET_API = datosVentas;
            DATASET_FALLECIDOS_PLANES = fallecidosPlanes;
            procesarParametros([...(parametrosRemotos || parametrosBaseDashboard()), ...remoto.datos]);

            const normalManual = cargarManuales();
            DATASET_NORMAL = [...normalApi, ...normalManual];
            API_STATUS = validarEstructuraApi(datosVentas);
            API_STATUS.ok = true;
            API_STATUS.mensaje = `Conectado · ${remoto.fuente}`;
            API_STATUS.registros = datosVentas.length;

            guardarCacheRemoto20260730({
                fuente:remoto.fuente,
                datosVentas,
                parametros:parametrosRemotos,
                fallecidosPlanes
            });

            poblarFiltros();
            aplicarFiltrosYRender();
            setEstadoApi("ok", "Datos actualizados");
            toast(`Datos cargados desde ${remoto.fuente}: ${datosVentas.length} registros.`);
        }catch(error){
            console.error("[Dashboard] No fue posible cargar Google Sheet/API:", error);

            const cache = leerCacheRemoto20260730();
            if(cache){
                try{
                    DATASET_API = cache.datosVentas;
                    DATASET_FALLECIDOS_PLANES = Array.isArray(cache.fallecidosPlanes) ? cache.fallecidosPlanes : [];
                    procesarParametros([...(cache.parametros || parametrosBaseDashboard()), ...cache.datosVentas]);
                    DATASET_NORMAL = [
                        ...cache.datosVentas.map(item => normalizarRegistro(item, "CACHE_GOOGLE_SHEET")),
                        ...cargarManuales()
                    ];
                    API_STATUS = validarEstructuraApi(cache.datosVentas);
                    API_STATUS.ok = false;
                    API_STATUS.mensaje = `Cache local · ${cache.fuente || "Google Sheet"}`;
                    API_STATUS.registros = cache.datosVentas.length;
                    poblarFiltros();
                    aplicarFiltrosYRender();
                    setEstadoApi("cargando", `Cache local · ${cache.datosVentas.length}`);
                    toast("No respondió Google Sheet. Se usa la última copia local guardada.", "warning");
                    return;
                }catch(cacheError){
                    console.error("[Dashboard] También falló el cache local:", cacheError);
                }
            }

            procesarParametros(parametrosBaseDashboard());
            DATASET_API = [];
            DATASET_FALLECIDOS_PLANES = await cargarFallecidosPlanesRobusto20260730();
            DATASET_NORMAL = [...cargarManuales()];
            API_STATUS = {ok:false, mensaje:error.message, registros:0, columnas:[]};
            poblarFiltros();
            aplicarFiltrosYRender();
            setEstadoApi("error", "Sin Google Sheet");
            toast("No se pudo cargar Google Sheet. Revisa permisos/publicación del archivo o consola.", "error");
        }finally{
            showLoading(false);
        }
    };

    window.probarFuentesDashboard = async function(){
        const resultados = [];
        for(const fuente of urlsDatosGoogle20260730()){
            try{
                const resultado = await cargarFuenteRobusta(fuente);
                resultados.push({fuente:fuente.nombre, ok:true, registros:resultado.datos.length, detalle:resultado.validacion.motivo});
            }catch(error){
                resultados.push({fuente:fuente.nombre, ok:false, registros:0, detalle:error.message});
            }
        }
        console.table(resultados);
        return resultados;
    };

    function vincularBotonRecarga20260730(){
        ["btnRecargar","reporteRecargar"].forEach(id => {
            const btn = document.getElementById(id);
            if(!btn) return;
            const nuevo = btn.cloneNode(true);
            btn.parentNode.replaceChild(nuevo, btn);
            nuevo.addEventListener("click", ev => {
                ev.preventDefault();
                ev.stopPropagation();
                cargarDashboard();
            });
        });
    }

    vincularBotonRecarga20260730();
    setTimeout(vincularBotonRecarga20260730, 800);
    setTimeout(() => cargarDashboard(), 350);

    console.log("RECUPERACIÓN GOOGLE SHEET ACTIVA - VERSION " + VERSION_DATOS_GOOGLE_20260730);
})();


/* =========================================================
   CIERRE FINAL 20260731
   Modo presentación, cumplimiento robusto y validación final.
   ========================================================= */
(function(){
    const VERSION_CIERRE_FINAL = "20260731";

    function safeNumber(valor){
        try{return toNumber(valor);}catch(e){return Number(valor)||0;}
    }

    function dinero(valor){
        try{return formatMoney(valor);}catch(e){return '$' + Math.round(safeNumber(valor)).toLocaleString('es-CO');}
    }

    function badgeFinal(pct){
        try{return badgeEstado(pct);}catch(e){
            const estado = pct >= 100 ? 'Cumplida' : (pct >= 80 ? 'En riesgo' : 'No cumple');
            return `<span class="badge">${estado}</span>`;
        }
    }

    function mesesBase(anio){
        const nombres = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        return nombres.map((nombre,i)=>({mes:i+1,nombre:`${nombre} ${anio}`}));
    }

    function getAnioFinal(){
        try{return anioReferenciaFiltros();}catch(e){return new Date().getFullYear();}
    }

    function getFiltrosFinal(){
        try{return obtenerFiltros();}catch(e){return {};}
    }

    function coincideNoFechaFinal(row, filtros){
        try{return coincideFiltrosNoFecha(row, filtros);}catch(e){return true;}
    }

    function ventaFilaFinal(row){
        return safeNumber(row?.valorVenta || row?.valorServicio || row?.valorExcedente || 0);
    }

    function ventaMensualFinal(rows, anio, mes, filtros){
        return (rows || []).filter(row => {
            const fecha = row.fecha instanceof Date ? row.fecha : (row.fecha ? new Date(row.fecha) : null);
            return fecha && !isNaN(fecha.getTime()) && fecha.getFullYear() === anio && fecha.getMonth()+1 === mes && coincideNoFechaFinal(row, filtros);
        }).reduce((acc,row)=>acc + ventaFilaFinal(row),0);
    }

    function metaMensualFinal(){
        try{
            const meta = metaMensualTotal();
            return safeNumber(meta) > 0 ? safeNumber(meta) : safeNumber(META_MENSUAL_BASE || 219133881);
        }catch(e){
            return safeNumber(window.META_MENSUAL_BASE || 219133881);
        }
    }

    function renderCumplimientoFinal(){
        const rowsBase = Array.isArray(DATASET_NORMAL) ? DATASET_NORMAL : [];
        const rowsFiltrados = Array.isArray(DATASET_FILTRADO) ? DATASET_FILTRADO : [];
        const filtros = getFiltrosFinal();
        const anio = getAnioFinal();
        const meses = mesesBase(anio);
        const ventas = meses.map(m => ventaMensualFinal(rowsBase, anio, m.mes, filtros));
        const metaMensual = metaMensualFinal();
        const metas = meses.map(()=>metaMensual);
        const ventaRango = rowsFiltrados.reduce((a,row)=>a + ventaFilaFinal(row),0);
        const metaRango = safeNumber(typeof META_RANGO_ACTUAL !== 'undefined' ? META_RANGO_ACTUAL : 0) || metaMensual;
        const pctRango = metaRango > 0 ? (ventaRango / metaRango) * 100 : 0;
        const faltanteRango = Math.max(metaRango - ventaRango, 0);
        const totalMetaAnual = metas.reduce((a,b)=>a+b,0);
        const totalVentaAnual = ventas.reduce((a,b)=>a+b,0);
        const mejorIdx = ventas.reduce((best,v,i)=>safeNumber(v)>safeNumber(ventas[best]||0)?i:best,0);
        const mesesConVenta = ventas.filter(v=>safeNumber(v)>0).length;

        setHtml('cumplimientoMetaVista', dinero(metaRango));
        setHtml('cumplimientoVentaVista', dinero(ventaRango));
        setHtml('cumplimientoPctVista', `${pctRango.toFixed(1)}%`);
        setHtml('cumplimientoFaltanteVista', dinero(faltanteRango));
        setHtml('cumplimientoMejorMesVista', ventas.some(v=>safeNumber(v)>0) ? `${meses[mejorIdx].nombre.split(' ')[0]} ${dinero(ventas[mejorIdx])}` : 'Sin venta');
        setHtml('cumplimientoMesesVentaVista', mesesConVenta);
        setHtml('textoCumplimientoVista', `La meta del periodo seleccionado es <strong>${dinero(metaRango)}</strong>. La venta real filtrada es <strong>${dinero(ventaRango)}</strong>, con cumplimiento de <strong>${pctRango.toFixed(1)}%</strong>. ${faltanteRango > 0 ? `Faltante pendiente: <strong>${dinero(faltanteRango)}</strong>.` : 'La meta se encuentra cumplida o superada.'}`);

        const tbody = document.querySelector('#tablaCumplimientoMensual tbody');
        if(tbody){
            tbody.innerHTML = meses.map((m,i)=>{
                const venta = ventas[i];
                const meta = metas[i];
                const pct = meta > 0 ? (venta/meta)*100 : 0;
                const faltante = Math.max(meta-venta,0);
                return `<tr>
                    <td>${m.nombre}</td>
                    <td>${dinero(meta)}</td>
                    <td>${dinero(venta)}</td>
                    <td>${pct.toFixed(1)}%</td>
                    <td>${dinero(faltante)}</td>
                    <td>${badgeFinal(pct)}</td>
                </tr>`;
            }).join('');
            if(typeof window.activarTablasOrdenablesDashboard === 'function') window.activarTablasOrdenablesDashboard();
        }

        try{
            if(typeof crearChartLine === 'function'){
                crearChartLine('graficoCumplimientoMensual', meses.map(m=>m.nombre), [
                    {label:'Venta real', data:ventas, borderColor:'#008f46', backgroundColor:'rgba(0,143,70,.14)', fill:true, tension:.3},
                    {label:'Meta mensual', data:metas, borderColor:'#f59e0b', borderDash:[8,6], fill:false, pointRadius:0}
                ], `Ventas Mensuales vs Meta Mensual ${anio}`);
            }
        }catch(error){
            console.error('[Cierre final] No se pudo pintar gráfica de cumplimiento:', error);
        }

        return {anio, registros:rowsBase.length, filtrados:rowsFiltrados.length, metaRango, ventaRango, pctRango, totalMetaAnual, totalVentaAnual};
    }

    window.renderCumplimientoMensual = renderCumplimientoFinal;

    function insertarBadgeVersion(){
        if(document.getElementById('versionFinalBadge')) return;
        const div = document.createElement('div');
        div.id = 'versionFinalBadge';
        div.className = 'version-final-badge';
        div.textContent = 'v' + VERSION_CIERRE_FINAL;
        document.body.appendChild(div);
    }

    function activarSeccionDashboard(){
        try{
            document.querySelectorAll('.vista').forEach(v=>v.classList.remove('active-view'));
            document.getElementById('dashboard')?.classList.add('active-view');
            document.querySelectorAll('.menu-item').forEach(i=>i.classList.remove('active'));
            document.querySelector('.menu-item[data-seccion="dashboard"]')?.classList.add('active');
        }catch(e){}
    }

    function alternarPresentacion(){
        document.body.classList.toggle('modo-presentacion');
        const activo = document.body.classList.contains('modo-presentacion');
        const btn = document.getElementById('btnPresentacion');
        if(btn){
            btn.title = activo ? 'Salir de presentación' : 'Modo presentación';
            btn.innerHTML = activo ? '<i class="fas fa-xmark"></i>' : '<i class="fas fa-display"></i>';
        }
        if(activo) activarSeccionDashboard();
        setTimeout(()=>{
            try{ if(typeof redimensionarGraficos === 'function') redimensionarGraficos(); }catch(e){}
        },250);
    }

    function asegurarBotonPresentacion(){
        if(document.getElementById('btnPresentacion')) return;
        const ref = document.getElementById('btnRecargar');
        if(!ref || !ref.parentNode) return;
        const btn = document.createElement('button');
        btn.id = 'btnPresentacion';
        btn.className = 'icon-btn';
        btn.title = 'Modo presentación';
        btn.innerHTML = '<i class="fas fa-display"></i>';
        ref.parentNode.insertBefore(btn, ref);
    }

    function vincularPresentacion(){
        asegurarBotonPresentacion();
        const btn = document.getElementById('btnPresentacion');
        if(!btn || btn.dataset.cierreVinculado === '1') return;
        btn.dataset.cierreVinculado = '1';
        btn.addEventListener('click', ev=>{
            ev.preventDefault();
            ev.stopPropagation();
            alternarPresentacion();
        });
    }

    function insertarDiagnostico(){
        const resumen = document.querySelector('#dashboard .resumen-ejecutivo');
        if(!resumen || document.getElementById('panelDiagnosticoCierre')) return;
        const panel = document.createElement('div');
        panel.id = 'panelDiagnosticoCierre';
        panel.className = 'cierre-panel-diagnostico';
        panel.innerHTML = 'Diagnóstico: <strong>cargando datos...</strong>';
        resumen.insertAdjacentElement('afterend', panel);
    }

    function actualizarDiagnostico(){
        const panel = document.getElementById('panelDiagnosticoCierre');
        if(!panel) return;
        const api = typeof API_STATUS !== 'undefined' ? API_STATUS : {};
        const normal = Array.isArray(DATASET_NORMAL) ? DATASET_NORMAL.length : 0;
        const filtrado = Array.isArray(DATASET_FILTRADO) ? DATASET_FILTRADO.length : 0;
        const fuente = api?.mensaje || 'Sin validar';
        panel.innerHTML = `Diagnóstico: <strong>${fuente}</strong> | Registros base: <strong>${normal}</strong> | Filtrados: <strong>${filtrado}</strong> | Última versión: <strong>${VERSION_CIERRE_FINAL}</strong>`;
    }

    window.validacionFinalDashboard = function(){
        const resumen = {
            version:VERSION_CIERRE_FINAL,
            registrosApi:Array.isArray(DATASET_API)?DATASET_API.length:0,
            registrosNormal:Array.isArray(DATASET_NORMAL)?DATASET_NORMAL.length:0,
            registrosFiltrados:Array.isArray(DATASET_FILTRADO)?DATASET_FILTRADO.length:0,
            fallecidosPlanes:Array.isArray(DATASET_FALLECIDOS_PLANES)?DATASET_FALLECIDOS_PLANES.length:0,
            api:typeof API_STATUS !== 'undefined' ? API_STATUS.mensaje : 'Sin estado',
            metaPeriodo:typeof META_RANGO_ACTUAL !== 'undefined' ? META_RANGO_ACTUAL : 0
        };
        console.table([resumen]);
        actualizarDiagnostico();
        return resumen;
    };

    document.addEventListener('click', ev=>{
        const item = ev.target.closest('[data-seccion="cumplimiento"]');
        if(item) setTimeout(()=>{try{renderCumplimientoFinal();}catch(e){console.error(e);}},150);
    });

    function cierreInit(){
        vincularPresentacion();
        insertarBadgeVersion();
        insertarDiagnostico();
        actualizarDiagnostico();
        const tbody = document.querySelector('#tablaCumplimientoMensual tbody');
        if(tbody && !tbody.children.length){
            try{renderCumplimientoFinal();}catch(e){console.warn('[Cierre final] Cumplimiento aún no disponible:', e.message);}
        }
        try{ if(typeof activarTablasOrdenablesDashboard === 'function') activarTablasOrdenablesDashboard(); }catch(e){}
    }

    cierreInit();
    setTimeout(cierreInit, 900);
    setTimeout(cierreInit, 2200);
    setInterval(actualizarDiagnostico, 10000);

    console.log('CIERRE FINAL GERENCIAL ACTIVO - VERSION ' + VERSION_CIERRE_FINAL);
})();


/* =========================================================
   AJUSTE UI GERENCIAL 20260801
   Oculta estado técnico, mueve actualización al lateral y activa modo presentación.
   ========================================================= */
(function(){
    const VERSION_UI_GERENCIAL = "20260802";

    function byId(id){ return document.getElementById(id); }

    function asegurarBotonPresentacionFinal(){
        let btn = byId('btnPresentacion');
        if(btn) return btn;
        const ref = byId('btnRecargar');
        if(!ref || !ref.parentNode) return null;
        btn = document.createElement('button');
        btn.id = 'btnPresentacion';
        btn.className = 'icon-btn';
        btn.title = 'Modo presentación';
        btn.innerHTML = '<i class="fas fa-display"></i>';
        ref.parentNode.insertBefore(btn, ref);
        return btn;
    }

    function asegurarActualizacionLateral(){
        const sidebar = document.querySelector('.sidebar');
        if(!sidebar) return;

        let footer = byId('sidebarActualizacion');
        if(!footer){
            footer = document.createElement('div');
            footer.id = 'sidebarActualizacion';
            footer.className = 'sidebar-footer-info';
            footer.innerHTML = '<span>Última actualización</span><strong id="ultimaActualizacion">-</strong>';
            sidebar.appendChild(footer);
        }

        const valor = byId('ultimaActualizacion');
        if(valor && (!valor.textContent || valor.textContent.trim() === '-')){
            valor.textContent = new Date().toLocaleString('es-CO');
        }
    }

    function limpiarCabeceraTecnica(){
        const estado = byId('estadoApi');
        if(estado){
            estado.innerHTML = '';
            estado.setAttribute('aria-hidden', 'true');
            estado.style.display = 'none';
        }
        document.querySelectorAll('.topbar .ultima-act').forEach(el => el.remove());
    }

    function activarVistaDashboardPresentacion(){
        try{
            document.querySelectorAll('.vista').forEach(v => v.classList.remove('active-view'));
            byId('dashboard')?.classList.add('active-view');
            document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
            document.querySelector('.menu-item[data-seccion="dashboard"]')?.classList.add('active');
        }catch(error){
            console.warn('No fue posible activar vista dashboard en presentación:', error);
        }
    }

    function pintarBotonPresentacion(activo){
        const btn = asegurarBotonPresentacionFinal();
        if(!btn) return;
        btn.classList.toggle('presentacion-activa', activo);
        btn.title = activo ? 'Salir de presentación' : 'Modo presentación';
        btn.innerHTML = activo ? '<i class="fas fa-xmark"></i>' : '<i class="fas fa-display"></i>';
    }

    function setModoPresentacionFinal(activo){
        document.body.classList.toggle('modo-presentacion', activo);
        localStorage.setItem('dashboardModoPresentacion', activo ? '1' : '0');
        pintarBotonPresentacion(activo);
        if(activo) activarVistaDashboardPresentacion();
        setTimeout(() => {
            try{ if(typeof aplicarFiltrosYRender === 'function') aplicarFiltrosYRender(); }catch(error){ console.warn(error); }
            try{ if(typeof redimensionarGraficos === 'function') redimensionarGraficos(); }catch(error){ console.warn(error); }
        }, 180);
    }

    function alternarModoPresentacionFinal(){
        setModoPresentacionFinal(!document.body.classList.contains('modo-presentacion'));
    }

    function vincularBotonPresentacionFinal(){
        const btnBase = asegurarBotonPresentacionFinal();
        if(!btnBase || !btnBase.parentNode) return null;

        // Clonar el botón elimina eventos antiguos que venían de versiones anteriores.
        const btn = btnBase.dataset.presentacionFinal20260802 === '1'
            ? btnBase
            : btnBase.cloneNode(true);

        if(btn !== btnBase){
            btnBase.parentNode.replaceChild(btn, btnBase);
        }

        btn.dataset.presentacionFinal20260802 = '1';
        btn.setAttribute('type', 'button');
        btn.setAttribute('aria-label', 'Modo presentación');

        btn.onclick = function(event){
            event.preventDefault();
            event.stopPropagation();
            alternarModoPresentacionFinal();
            return false;
        };

        btn.onkeydown = function(event){
            if(event.key === 'Enter' || event.key === ' '){
                event.preventDefault();
                alternarModoPresentacionFinal();
            }
        };

        return btn;
    }

    function initUiGerencialFinal(){
        limpiarCabeceraTecnica();
        asegurarActualizacionLateral();
        vincularBotonPresentacionFinal();
        const activoGuardado = localStorage.getItem('dashboardModoPresentacion') === '1';
        if(activoGuardado) setModoPresentacionFinal(true);
        else pintarBotonPresentacion(false);
    }

    window.activarModoPresentacionDashboard = () => setModoPresentacionFinal(true);
    window.salirModoPresentacionDashboard = () => setModoPresentacionFinal(false);
    window.alternarModoPresentacionDashboard = alternarModoPresentacionFinal;

    initUiGerencialFinal();
    setTimeout(initUiGerencialFinal, 700);
    setTimeout(initUiGerencialFinal, 1800);

    console.log('AJUSTE UI GERENCIAL ACTIVO - VERSION ' + VERSION_UI_GERENCIAL);
})();


/* =========================================================
   CATEGORIAS META REAL VS VENTA REAL 20260803
   Agrega comparativo individual para PARTICULAR, RED y EXCEDENTES.
   ========================================================= */
(function(){
    const VERSION_CATEGORIAS_META_REAL = "20260803";

    function q(id){ return document.getElementById(id); }

    function estadoTextoCategoria(pct){
        const n = Number(pct) || 0;
        if(n >= 100) return "Cumplida";
        if(n >= 80) return "En riesgo";
        return "No cumple";
    }

    function cssEstadoCategoria(pct){
        const n = Number(pct) || 0;
        if(n >= 100) return "estado-cumplida";
        if(n >= 80) return "estado-riesgo";
        return "estado-no-cumple";
    }

    function nombreSeguroCategoria(cat){
        const c = String(cat || "").toUpperCase();
        if(c === "PARTICULAR") return "Particular";
        if(c === "RED") return "Red";
        if(c === "EXCEDENTES") return "Excedentes";
        return c;
    }

    function sufijoCategoria(cat){
        const c = String(cat || "").toUpperCase();
        if(c === "PARTICULAR") return "Particular";
        if(c === "RED") return "Red";
        return "Excedentes";
    }

    function datosCategoriaMetaReal(cat){
        const categorias = typeof agruparCategorias === "function" ? agruparCategorias(DATASET_FILTRADO || []) : {};
        const data = categorias[cat] || {cantidad:0, valor:0};
        const venta = toNumber(data.valor);
        const metaMensual = typeof metaCategoriaMensual === "function" ? toNumber(metaCategoriaMensual(cat)) : 0;
        const factor = toNumber(typeof MESES_EQUIVALENTES_ACTUAL !== "undefined" ? MESES_EQUIVALENTES_ACTUAL : 1) || 1;
        const meta = metaMensual * factor;
        const cumplimiento = meta > 0 ? (venta / meta) * 100 : 0;
        const faltante = Math.max(meta - venta, 0);
        return {cat, nombre:nombreSeguroCategoria(cat), cantidad:toNumber(data.cantidad), venta, meta, cumplimiento, faltante, estado:estadoTextoCategoria(cumplimiento)};
    }

    function asegurarPanelCategoriasMetaReal(){
        let panel = q("panelCategoriasMetaReal");
        if(panel) return panel;

        const categoriaVista = q("categorias");
        if(!categoriaVista) return null;

        panel = document.createElement("section");
        panel.id = "panelCategoriasMetaReal";
        panel.className = "categoria-meta-real-panel";
        panel.innerHTML = ["PARTICULAR","RED","EXCEDENTES"].map(cat => {
            const suf = sufijoCategoria(cat);
            return `
                <div class="categoria-meta-card" data-cat-card="${cat}">
                    <div class="categoria-meta-head"><span>${nombreSeguroCategoria(cat)}</span><strong id="estadoMeta${suf}">-</strong></div>
                    <div class="categoria-meta-kpis">
                        <div><small>Meta real</small><b id="metaReal${suf}">$0</b></div>
                        <div><small>Venta real</small><b id="ventaReal${suf}">$0</b></div>
                        <div><small>Cumplimiento</small><b id="cumplimiento${suf}">0.0%</b></div>
                        <div><small>Faltante</small><b id="faltante${suf}">$0</b></div>
                    </div>
                    <div class="categoria-meta-chart"><canvas id="graficoMeta${suf}"></canvas></div>
                </div>`;
        }).join("");

        const resumen = categoriaVista.querySelector(".resumen-ejecutivo");
        if(resumen && resumen.parentNode) resumen.parentNode.insertBefore(panel, resumen.nextSibling);
        else categoriaVista.prepend(panel);
        return panel;
    }

    function actualizarCardCategoria(dato){
        const suf = sufijoCategoria(dato.cat);
        const estado = q(`estadoMeta${suf}`);
        if(estado){
            estado.textContent = dato.estado;
            estado.className = cssEstadoCategoria(dato.cumplimiento);
        }
        if(q(`metaReal${suf}`)) q(`metaReal${suf}`).textContent = formatMoney(dato.meta);
        if(q(`ventaReal${suf}`)) q(`ventaReal${suf}`).textContent = formatMoney(dato.venta);
        if(q(`cumplimiento${suf}`)) q(`cumplimiento${suf}`).textContent = dato.cumplimiento.toFixed(1) + "%";
        if(q(`faltante${suf}`)) q(`faltante${suf}`).textContent = formatMoney(dato.faltante);
    }

    function pintarGraficaCategoria(dato){
        const suf = sufijoCategoria(dato.cat);
        const id = `graficoMeta${suf}`;
        const canvas = q(id);
        if(!canvas || typeof crearChartBar !== "function") return;

        crearChartBar(
            id,
            ["Meta real", "Venta real"],
            [dato.meta, dato.venta],
            "Valor",
            `${dato.nombre}: meta real vs venta real`,
            false,
            "money",
            {
                metas:[0, dato.meta],
                mostrarParticipacion:false,
                legendLabel:"Valor | % cumplimiento | Estado"
            }
        );
    }

    function renderCategoriasMetaReal(){
        try{
            asegurarPanelCategoriasMetaReal();
            ["PARTICULAR","RED","EXCEDENTES"].forEach(cat => {
                const dato = datosCategoriaMetaReal(cat);
                actualizarCardCategoria(dato);
                pintarGraficaCategoria(dato);
            });
        }catch(error){
            console.error("Error renderizando categoría meta real vs venta real:", error);
        }
    }

    function actualizarTablaCategoriasConEstado(){
        const tbody = document.querySelector("#tablaCategoriasVista tbody");
        const theadRow = document.querySelector("#tablaCategoriasVista thead tr");
        if(!tbody || !theadRow) return;

        theadRow.innerHTML = `
            <th>Categoría</th>
            <th>Tipo</th>
            <th>Cantidad atendida</th>
            <th>Venta real</th>
            <th>Participación</th>
            <th>Meta real</th>
            <th>Cumplimiento</th>
            <th>Faltante</th>
            <th>Estado</th>`;

        const categorias = typeof agruparCategorias === "function" ? agruparCategorias(DATASET_FILTRADO || []) : {};
        const total = typeof sumar === "function" ? sumar(DATASET_FILTRADO || []) : 0;
        const orden = ["PARTICULAR","RED","EXCEDENTES","PLAN"];

        tbody.innerHTML = orden.map(cat => {
            const data = categorias[cat] || {cantidad:0, valor:0};
            const generaVenta = typeof categoriaGeneraVenta === "function" ? categoriaGeneraVenta(cat) : cat !== "PLAN";
            const meta = generaVenta ? (toNumber(metaCategoriaMensual(cat)) * (toNumber(MESES_EQUIVALENTES_ACTUAL) || 1)) : 0;
            const venta = toNumber(data.valor);
            const participacion = generaVenta && total > 0 ? (venta / total) * 100 : 0;
            const cumplimiento = generaVenta && meta > 0 ? (venta / meta) * 100 : 0;
            const faltante = Math.max(meta - venta, 0);

            return `
                <tr>
                    <td><strong>${cat}</strong></td>
                    <td>${generaVenta ? '<span class="badge badge-ok">Genera ventas</span>' : '<span class="badge badge-info">Solo cantidad</span>'}</td>
                    <td>${formatNumber(toNumber(data.cantidad))}</td>
                    <td>${generaVenta ? formatMoney(venta) : "-"}</td>
                    <td>${generaVenta ? participacion.toFixed(1) + "%" : "-"}</td>
                    <td>${generaVenta ? formatMoney(meta) : "-"}</td>
                    <td>${generaVenta ? cumplimiento.toFixed(1) + "%" : "-"}</td>
                    <td>${generaVenta ? formatMoney(faltante) : "-"}</td>
                    <td>${generaVenta ? badgeEstado(cumplimiento) : '<span class="badge badge-info">No aplica</span>'}</td>
                </tr>`;
        }).join("");

        try{ if(typeof activarTablasOrdenablesDashboard === "function") activarTablasOrdenablesDashboard(); }catch(e){}
    }

    const renderCategoriasAnterior = (typeof window.renderCategorias === "function")
        ? window.renderCategorias
        : (typeof renderCategorias === "function" ? renderCategorias : null);

    window.renderCategorias = function(){
        if(renderCategoriasAnterior){
            try{ renderCategoriasAnterior(); }catch(error){ console.error("Error en renderCategorias base:", error); }
        }
        actualizarTablaCategoriasConEstado();
        renderCategoriasMetaReal();
    };

    try{ renderCategorias = window.renderCategorias; }catch(error){}

    function initCategoriasMetaReal(){
        if(document.readyState === "loading") return;
        renderCategoriasMetaReal();
        actualizarTablaCategoriasConEstado();
    }

    document.addEventListener("click", event => {
        if(event.target.closest('[data-seccion="categorias"]')){
            setTimeout(() => {
                try{ window.renderCategorias(); }catch(error){ console.error(error); }
            }, 180);
        }
    });

    setTimeout(initCategoriasMetaReal, 800);
    setTimeout(initCategoriasMetaReal, 2200);

    console.log("CATEGORIAS META REAL VS VENTA REAL ACTIVAS - VERSION " + VERSION_CATEGORIAS_META_REAL);
})();
