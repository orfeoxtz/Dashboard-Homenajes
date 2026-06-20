console.log("APP.JS CARGADO CORRECTAMENTE - VERSION 20260710");

const API_URL = "https://script.google.com/macros/s/AKfycbxEyu57a5spnJNju9t4654U8SDBrWFWQ0GWLibubGy5ntZsOV3N-TeL73423-a23j6FwA/exec";
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1Q1hyG-SXsMJdrgsLRIPiVlVePZuov4eJSYsb6l4EmyQ/export?format=csv&gid=223294406";
const GOOGLE_SHEET_PARAMETROS_CSV_URL = "https://docs.google.com/spreadsheets/d/1Q1hyG-SXsMJdrgsLRIPiVlVePZuov4eJSYsb6l4EmyQ/export?format=csv&gid=1505384889";

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
let AGENDA_DIA_SELECCIONADO = fechaISO(new Date());

const AMBIENTES_DASHBOARD = ["normal","dark","ocean","sunset","emerald","violet","slate"];

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

function formatFechaProfesional(fecha, fallback="-"){
    const f = fecha instanceof Date ? fecha : parseFecha(fecha);
    if(!f || isNaN(f.getTime())) return fallback;

    return f.toLocaleDateString("es-CO", {
        year:"numeric",
        month:"2-digit",
        day:"2-digit"
    });
}

function nombreGestorCorto(nombre){
    const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
    if(partes.length === 0) return "-";
    if(partes.length === 1) return partes[0];

    const primerNombre = partes[0];
    const primerApellido = partes.length >= 3 ? partes[2] : partes[1];
    const inicial = primerApellido ? primerApellido.charAt(0).toUpperCase() + "." : "";

    return `${primerNombre} ${inicial}`.trim();
}

function formatChartValue(valor, tipo="money"){
    if(tipo === "number") return formatNumber(valor);
    if(tipo === "kwh") return `${formatNumber(valor)} kWh`;
    if(tipo === "percent") return `${Number(toNumber(valor)).toFixed(1)}%`;
    if(tipo === "days") return `${formatNumber(valor)} días`;
    return formatMoney(valor);
}

function chartTextColor(){
    return document.body.classList.contains("dark-mode") || document.body.classList.contains("theme-dark") ? "#f8fafc" : "#0f172a";
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

function getValorServicioItem(item){
    return getCampo(item, ["VALOR SERVICIO","Valor Servicio","VALOR_SERVICIO"]);
}

function getValorExcedenteItem(item){
    return getCampo(item, ["VALOR EXCEDENTE","Valor Excedente","VALOR_EXCEDENTE"]);
}

function getCantidadItem(item){
    return getCampo(item, ["CANTIDAD","Cantidad","cantidad"]);
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
        ["SEDE","GESTOR","META_CATEGORIA","META_EXCEDENTE"].includes(tipo) &&
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

    const fuente = [...parametrosBaseDashboard(), ...(Array.isArray(datos) ? datos : [])];

    fuente.filter(esFilaParametro).forEach(item => {
        const tipo = normalizarTexto(getCampo(item, ["Tipo","TIPO","tipo"]));
        const nombre = normalizarTexto(getCampo(item, ["Nombre","NOMBRE","nombre"]));
        const valor = toNumber(getCampo(item, ["Valor","VALOR","valor"]));

        if(!nombre || valor <= 0) return;

        if(tipo === "GESTOR") PARAMETROS.gestor[nombre] = valor;
        if(tipo === "META_CATEGORIA") PARAMETROS.categoria[nombre] = valor;
        if(tipo === "META_EXCEDENTE") PARAMETROS.excedente[nombre] = valor;
        if(tipo === "SEDE" && valor > 0) META_MENSUAL_BASE = valor;
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
        fechaTexto:fecha ? formatFechaProfesional(fecha) : String(getFechaItem(item) || ""),
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
    row.cantidadAtendida = Math.max(toNumber(getCantidadItem(item)) || 1, 1);

    if(valorExcedente > 0){
        row.categoriaGerencial = "EXCEDENTES";
        row.valorVenta = valorExcedente;
        row.generaVenta = true;
    }else{
        row.generaVenta = categoriaGeneraVenta(row.categoriaGerencial);
        row.valorVenta = row.generaVenta ? (valorServicio > 0 ? valorServicio : valorBase) : 0;
    }

    return row;
}

function normalizarRegistroExpandido(item, origen="API"){
    const base = normalizarRegistro(item, origen);
    const valorServicio = toNumber(getValorServicioItem(item));
    const valorExcedente = toNumber(getValorExcedenteItem(item));
    const valorBase = toNumber(getValorItem(item));
    const categoriaOriginal = obtenerCategoriaGerencial({
        categoria:String(getCategoriaItem(item) || "").trim(),
        servicio:String(getServicioItem(item) || getTipoServicioItem(item) || "").trim()
    });
    const servicioOriginal = String(getServicioItem(item) || getTipoServicioItem(item) || base.servicio || "").trim();
    const filas = [];

    if(valorServicio > 0 && categoriaGeneraVenta(categoriaOriginal)){
        filas.push({
            ...base,
            id:`${base.id}_servicio`,
            categoriaGerencial:categoriaOriginal,
            servicio:servicioOriginal || base.servicio,
            valorOriginal:valorServicio,
            valorServicio,
            valorExcedente:0,
            valorVenta:valorServicio,
            generaVenta:true,
            lineaValor:"SERVICIO"
        });
    }

    if(valorExcedente > 0){
        filas.push({
            ...base,
            id:`${base.id}_excedente`,
            categoriaGerencial:"EXCEDENTES",
            servicio:servicioOriginal || "EXCEDENTES",
            valorOriginal:valorExcedente,
            valorServicio:0,
            valorExcedente,
            valorVenta:valorExcedente,
            generaVenta:true,
            lineaValor:"EXCEDENTE"
        });
    }

    if(filas.length) return filas;

    return [{
        ...base,
        valorOriginal:valorBase || base.valorOriginal,
        lineaValor:base.categoriaGerencial === "EXCEDENTES" ? "EXCEDENTE" : "SERVICIO"
    }];
}

function cargarManuales(){
    DATASET_MANUAL = JSON.parse(localStorage.getItem("registrosManuales") || "[]");
    return DATASET_MANUAL.flatMap(item => normalizarRegistroExpandido(item, "MANUAL"));
}

function validarEstructuraApi(datos){
    const columnas = datos.length ? Object.keys(datos[0]) : [];
    const existe = nombres => nombres.some(req => columnas.some(c => normalizarLlave(c) === normalizarLlave(req)));
    const requeridas = [
        "FECHA",
        "ORDEN_SERVICIO_FUNERARIO",
        "GESTOR",
        "SEDE",
        "TIPO_SERVICIO_TIPOSRV",
        "TIPO_HOMENAJE",
        "TIPO_EXCEDENTE",
        "CLINICA",
        "MUNICIPIO",
        "TIPO_MUERTE",
        "CEMENTERIO",
        "TIPO_DESTINO_FINAL",
        "CANTIDAD",
        "VALOR SERVICIO",
        "VALOR EXCEDENTE"
    ];
    const faltantes = requeridas.filter(nombre => !existe([nombre]));

    return {
        ok:datos.length > 0 && faltantes.length === 0,
        mensaje:datos.length === 0 ? "Sin registros API" : faltantes.length ? "Columnas incompletas" : "API válida",
        registros:datos.length,
        columnas,
        faltantes
    };
}

async function cargarDatosRemotos(){
    const fuentes = [
        {nombre:"Apps Script", url:API_URL, tipo:"json"},
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

async function cargarParametrosRemotos(){
    try{
        const response = await fetch(GOOGLE_SHEET_PARAMETROS_CSV_URL, { cache:"no-store" });
        if(!response.ok) throw new Error(`HTTP ${response.status}`);
        const texto = await response.text();
        const data = parseTablaTexto(texto);
        return data.length ? data : [];
    }catch(error){
        console.warn("No se pudieron cargar parámetros remotos. Se usan parámetros base.", error);
        return [];
    }
}

async function cargarDashboard(){
    setEstadoApi("cargando", "Cargando...");
    showLoading(true);

    try{
        const remoto = await cargarDatosRemotos();
        const parametrosRemotos = await cargarParametrosRemotos();
        const datosCompletos = remoto.datos;

        procesarParametros([...parametrosRemotos, ...datosCompletos]);

        const datosVentas = datosCompletos.filter(item => !esFilaParametro(item));
        DATASET_API = datosVentas;

        const normalApi = datosVentas.flatMap(item => normalizarRegistroExpandido(item, "API"));
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
        const texto = normalizarTexto(`
            ${row.ordenServicio}
            ${row.gestor}
            ${row.categoriaGerencial}
            ${row.categoria}
            ${row.servicio}
            ${row.tipoServicio}
            ${row.sede}
            ${row.clinica}
            ${row.municipio}
            ${row.tipoMuerte}
            ${row.cementerio}
            ${row.destinoFinal}
            ${row.observacion}
        `);
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

function filasMesComparativo(fechaReferencia, offsetMes=0){
    const referencia = new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth() + offsetMes, 1);
    const inicio = inicioMes(referencia);
    const fin = finMes(referencia);
    const filtros = obtenerFiltros();

    const rows = DATASET_NORMAL.filter(row => {
        if(!row.fecha) return false;
        if(row.fecha < inicio || row.fecha > fin) return false;
        return coincideFiltrosNoFecha(row, filtros);
    });

    return {rows, inicio, fin};
}

function renderComparativoMensual(metaInfo){
    const fechaReferencia = metaInfo?.fin && !isNaN(metaInfo.fin.getTime()) ? metaInfo.fin : new Date();
    const actual = filasMesComparativo(fechaReferencia, 0);
    const anterior = filasMesComparativo(fechaReferencia, -1);
    const resumenActual = calcularResumen(actual.rows);
    const resumenAnterior = calcularResumen(anterior.rows);
    const ventaActual = resumenActual.total;
    const ventaAnterior = resumenAnterior.total;
    const variacion = ventaAnterior > 0 ? ((ventaActual - ventaAnterior) / ventaAnterior) * 100 : (ventaActual > 0 ? 100 : 0);
    const diferencia = ventaActual - ventaAnterior;

    const estado = variacion >= 10
        ? "Crecimiento"
        : variacion >= 0
            ? "Estable"
            : variacion <= -15
                ? "Caída crítica"
                : "Caída moderada";

    const alerta = variacion >= 10
        ? "Tendencia positiva"
        : variacion >= 0
            ? "Mantener ritmo"
            : variacion <= -15
                ? "Reacción inmediata"
                : "Revisar gestión";

    setHtml("compMesActual", formatMoney(ventaActual));
    setHtml("compMesActualTexto", `${nombreMes(actual.inicio.getMonth() + 1)} ${actual.inicio.getFullYear()} · ${formatNumber(contarOrdenesUnicas(actual.rows))} servicios`);
    setHtml("compMesAnterior", formatMoney(ventaAnterior));
    setHtml("compMesAnteriorTexto", `${nombreMes(anterior.inicio.getMonth() + 1)} ${anterior.inicio.getFullYear()} · ${formatNumber(contarOrdenesUnicas(anterior.rows))} servicios`);
    setHtml("compVariacion", `${variacion >= 0 ? "+" : ""}${variacion.toFixed(1)}%`);
    setHtml("compVariacionTexto", `${diferencia >= 0 ? "Aumento" : "Disminución"} de ${formatMoney(Math.abs(diferencia))}`);
    setHtml("compAlerta", alerta);
    setHtml("compAlertaTexto", estado);

    const board = document.querySelector(".month-compare-board");
    if(board){
        board.classList.remove("ok","warning","danger");
        board.classList.add(variacion >= 0 ? "ok" : variacion <= -15 ? "danger" : "warning");
    }
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

        obj[cat].cantidad += toNumber(row.cantidadAtendida) || 1;
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

        obj[nombre].cantidad += toNumber(row.cantidadAtendida) || 1;
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

        obj[nombre].cantidad += toNumber(row.cantidadAtendida) || 1;
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

        obj[nombre].cantidad += toNumber(row.cantidadAtendida) || 1;
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

        obj[nombre].cantidad += toNumber(row.cantidadAtendida) || 1;
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
        obj[key].cantidad += toNumber(row.cantidadAtendida) || 1;
    });

    return obj;
}

function renderTodo(resumen, metaInfo){
    actualizarKPIs(resumen, metaInfo);
    crearResumenEjecutivo(resumen, metaInfo);
    renderGraficosDashboard(resumen);
    renderCategorias();
    renderAnalisisAvanzados();
    renderGestores();
    renderExcedentes();
    renderMetas();
    renderCumplimientoMensual();
    renderComparativoAnual();
    renderPareto();
    renderDatos();
    renderAlertas(resumen);
    renderEnergia();
    renderMantenimientos();
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
    const faltantePct = META_RANGO_ACTUAL > 0 ? (faltante / META_RANGO_ACTUAL) * 100 : 0;

    const diasAnalizados = Math.max(Math.min(DIAS_RANGO_ACTUAL, diasEntre(metaInfo.inicio, new Date())), 1);
    const promedioDiarioReal = ventaTotal / diasAnalizados;

    const categorias = agruparCategorias(DATASET_FILTRADO);
    const particular = categorias["PARTICULAR"];
    const red = categorias["RED"];
    const excedentes = categorias["EXCEDENTES"];
    const plan = categorias["PLAN"];

    const metaParticular = metaCategoriaMensual("PARTICULAR") * MESES_EQUIVALENTES_ACTUAL;
    const metaRed = metaCategoriaMensual("RED") * MESES_EQUIVALENTES_ACTUAL;
    const metaExcedentes = metaCategoriaMensual("EXCEDENTES") * MESES_EQUIVALENTES_ACTUAL;

    const cParticular = metaParticular > 0 ? (particular.valor / metaParticular) * 100 : 0;
    const cRed = metaRed > 0 ? (red.valor / metaRed) * 100 : 0;
    const cExcedentes = metaExcedentes > 0 ? (excedentes.valor / metaExcedentes) * 100 : 0;

    const gestores = Object.values(agruparGestores(DATASET_FILTRADO)).sort((a,b) => b.valor - a.valor);
    const mejorGestor = gestores[0];

    setHtml("metaGrupal", formatMoney(META_RANGO_ACTUAL));
    setHtml("ventas", formatMoney(ventaTotal));
    setHtml("cumplimiento", `${cumplimientoGeneral.toFixed(1)}%`);
    setHtml("faltante", formatMoney(faltante));
    setHtml("estadoCumplimientoTexto", textoEstado(cumplimientoGeneral));
    setHtml("ventasCumplimientoPill", `${cumplimientoGeneral.toFixed(1)}%`);
    setHtml("estadoCumplimientoPill", textoEstado(cumplimientoGeneral));
    setHtml("faltantePctPill", `${faltantePct.toFixed(1)}%`);

    setHtml("metaMensual", formatMoney(metaMensualTotal()));
    setHtml("metaAnual", formatMoney(metaMensualTotal() * 12));
    setHtml("mesesEquivalentes", MESES_EQUIVALENTES_ACTUAL.toFixed(2));
    setHtml("promedioDiarioReal", formatMoney(promedioDiarioReal));
    setHtml("mejorGestor", mejorGestor ? mejorGestor.nombre : "-");
    setHtml("totalRegistros", contarOrdenesUnicas(DATASET_FILTRADO));

    setHtml("kpiParticularValor", formatMoney(particular.valor));
    setHtml("kpiParticularCumplimiento", `${cParticular.toFixed(1)}%`);
    setHtml("kpiParticularCantidad", `${particular.cantidad} homenajes | Meta ${formatMoney(metaParticular)}`);

    setHtml("kpiRedValor", formatMoney(red.valor));
    setHtml("kpiRedCumplimiento", `${cRed.toFixed(1)}%`);
    setHtml("kpiRedCantidad", `${red.cantidad} homenajes | Meta ${formatMoney(metaRed)}`);

    setHtml("kpiExcedentesValor", formatMoney(excedentes.valor));
    setHtml("kpiExcedentesCumplimiento", `${cExcedentes.toFixed(1)}%`);
    setHtml("kpiExcedentesCantidad", `${excedentes.cantidad} unidades | Meta ${formatMoney(metaExcedentes)}`);

    setHtml("kpiPlanCantidad", plan.cantidad);
    setHtml("metaRangoDetalle", `${fechaISO(metaInfo.inicio)} a ${fechaISO(metaInfo.fin)}`);
    setHtml("ultimaActualizacion", new Date().toLocaleString("es-CO"));

    const cumplimientoEl = $("cumplimiento");
    if(cumplimientoEl) cumplimientoEl.style.color = colorPorPorcentaje(cumplimientoGeneral);

    [
        ["ventasCumplimientoPill", cumplimientoGeneral],
        ["estadoCumplimientoPill", cumplimientoGeneral],
        ["kpiParticularCumplimiento", cParticular],
        ["kpiRedCumplimiento", cRed],
        ["kpiExcedentesCumplimiento", cExcedentes]
    ].forEach(([id, pct]) => {
        const el = $(id);
        if(!el) return;
        el.classList.remove("ok","warning","danger");
        el.classList.add(pct >= 100 ? "ok" : pct >= 80 ? "warning" : "danger");
    });
}

function crearResumenEjecutivo(resumen, metaInfo){
    const cumplimiento = META_RANGO_ACTUAL > 0 ? (resumen.total / META_RANGO_ACTUAL) * 100 : 0;
    const faltante = Math.max(META_RANGO_ACTUAL - resumen.total, 0);
    const categorias = Object.values(agruparCategorias(DATASET_FILTRADO))
        .filter(item => categoriaGeneraVenta(item.categoria))
        .sort((a,b) => b.valor - a.valor);
    const gestores = Object.values(agruparGestores(DATASET_FILTRADO)).sort((a,b) => b.valor - a.valor);
    const clinicas = Object.values(agruparClinicas(DATASET_FILTRADO)).sort((a,b) => b.cantidad - a.cantidad || b.valor - a.valor);
    const destinos = agruparAnalisis(DATASET_FILTRADO.filter(row => row.destinoFinal), row => row.destinoFinal);
    const categoriaMayor = categorias[0];
    const gestorMayor = gestores[0];
    const clinicaMayor = clinicas[0];
    const destinoMayor = destinos[0];
    const estadoGerencial = textoEstado(cumplimiento);
    const nivelGerencial = cumplimiento >= 100 ? "ok" : cumplimiento >= 80 ? "warning" : "danger";
    const diasRestantes = Math.max(diasEntre(new Date(), metaInfo.fin), 1);
    const ritmoRequerido = faltante > 0 ? faltante / diasRestantes : 0;
    const brechasCategoria = ["PARTICULAR","RED","EXCEDENTES"].map(categoria => {
        const data = agruparCategorias(DATASET_FILTRADO)[categoria] || {valor:0, cantidad:0, categoria};
        const meta = metaCategoriaMensual(categoria) * MESES_EQUIVALENTES_ACTUAL;
        return {
            categoria,
            valor:data.valor,
            meta,
            brecha:Math.max(meta - data.valor, 0),
            cumplimiento:meta > 0 ? (data.valor / meta) * 100 : 0
        };
    }).sort((a,b) => b.brecha - a.brecha);
    const categoriaFoco = brechasCategoria[0];
    const recomendacion = cumplimiento >= 100
        ? "Se recomienda sostener la estrategia comercial actual y documentar las prácticas que generaron el cumplimiento."
        : cumplimiento >= 80
            ? "Se recomienda reforzar seguimiento diario a gestores y priorizar categorías con mayor brecha frente a la meta."
            : "Se recomienda activar plan de choque comercial, seguimiento por gestor y revisión de oportunidades en particulares, red y excedentes.";

    setHtml("resumenEjecutivoTexto", `
        El rango seleccionado comprende <strong>${MESES_EQUIVALENTES_ACTUAL.toFixed(2)} meses equivalentes</strong>.
        La meta calculada es <strong>${formatMoney(META_RANGO_ACTUAL)}</strong>.
        La venta real generada por <strong>PARTICULAR + RED + EXCEDENTES</strong> es
        <strong>${formatMoney(resumen.total)}</strong>, con cumplimiento del
        <strong>${cumplimiento.toFixed(1)}%</strong>. 
        El faltante para cumplir la meta es <strong>${formatMoney(faltante)}</strong>.
        PLAN registra <strong>${resumen.planCantidad}</strong> atenciones, pero no suma ventas.
        <br><br><strong>Lectura gerencial:</strong> ${recomendacion}
    `);

    const semaforo = $("semaforoGerencial");
    if(semaforo){
        semaforo.classList.remove("ok","warning","danger");
        semaforo.classList.add(nivelGerencial);
    }

    setHtml("semaforoGerencialPct", `${cumplimiento.toFixed(1)}%`);
    setHtml("semaforoGerencialEstado", estadoGerencial);
    setHtml("semaforoGerencialDetalle", faltante > 0
        ? `Faltan ${formatMoney(faltante)}. Ritmo sugerido: ${formatMoney(ritmoRequerido)} diarios hasta el cierre del rango.`
        : `La meta del rango está cubierta. Mantener seguimiento para sostener el resultado.`);

    setHtml("accionGerencial1", cumplimiento >= 100
        ? `Sostener estrategia actual y documentar qué gestores/categorías generaron el cumplimiento.`
        : `Activar seguimiento diario hasta recuperar ${formatMoney(faltante)} frente a la meta del rango.`);
    setHtml("accionGerencial2", categoriaFoco && categoriaFoco.brecha > 0
        ? `Foco comercial: ${categoriaFoco.categoria}, brecha ${formatMoney(categoriaFoco.brecha)} y cumplimiento ${categoriaFoco.cumplimiento.toFixed(1)}%.`
        : `Las categorías principales no presentan brecha crítica en el rango seleccionado.`);
    setHtml("accionGerencial3", gestorMayor
        ? `Replicar prácticas del gestor líder: ${escapeHtml(gestorMayor.nombre)} con ${formatMoney(gestorMayor.valor)}.`
        : `Sin gestor líder identificado para el rango seleccionado.`);
    setHtml("accionGerencial4", clinicaMayor
        ? `Monitorear fuente de reportes: ${escapeHtml(clinicaMayor.nombre)} concentra ${formatNumber(clinicaMayor.cantidad)} reportes.`
        : `Sin clínica principal identificada para el rango seleccionado.`);

    setHtml("insightCategoria", categoriaMayor ? categoriaMayor.categoria : "-");
    setHtml("insightCategoriaDetalle", categoriaMayor ? `${formatMoney(categoriaMayor.valor)} · ${formatNumber(categoriaMayor.cantidad)} registros` : "Sin datos");
    setHtml("insightGestor", gestorMayor ? gestorMayor.nombre : "-");
    setHtml("insightGestorDetalle", gestorMayor ? `${formatMoney(gestorMayor.valor)} · ${formatNumber(gestorMayor.cantidad)} servicios` : "Sin datos");
    setHtml("insightClinica", clinicaMayor ? clinicaMayor.nombre : "-");
    setHtml("insightClinicaDetalle", clinicaMayor ? `${formatNumber(clinicaMayor.cantidad)} reportes · ${formatMoney(clinicaMayor.valor)}` : "Sin datos");
    setHtml("insightDestino", destinoMayor ? destinoMayor.nombre : "-");
    setHtml("insightDestinoDetalle", destinoMayor ? `${formatNumber(destinoMayor.cantidad)} servicios · ${formatMoney(destinoMayor.valor)}` : "Sin datos");

    renderComparativoMensual(metaInfo);
}

function destruirChart(id){
    if(charts[id]){
        charts[id].destroy();
        charts[id] = null;
    }
}

function crearChartBar(idCanvas, labels, data, label, titulo, horizontal=false, tipoValor="money"){
    const canvas = $(idCanvas);
    if(!canvas || typeof Chart === "undefined") return;

    registrarPluginGraficas();
    destruirChart(idCanvas);

    const maxValue = Math.max(...data.map(v => Math.abs(toNumber(v))), 0);
    const chartHeight = horizontal
        ? Math.max(330, Math.min(760, (labels.length * 30) + 128))
        : Math.max(300, Math.min(540, (labels.length * 18) + 230));

    const labelBg = chartTextColor() === "#f8fafc" ? "rgba(15,23,42,.92)" : "rgba(255,255,255,.92)";
    const labelBorder = chartTextColor() === "#f8fafc" ? "rgba(248,250,252,.22)" : "rgba(0,79,42,.16)";
    const chartBox = canvas.parentElement;

    canvas.setAttribute("height", String(chartHeight));
    canvas.style.setProperty("height", `${chartHeight}px`, "important");
    canvas.style.setProperty("display", "block");
    canvas.style.setProperty("width", "100%", "important");
    chartBox?.style.setProperty("min-height", `${chartHeight + 78}px`);
    chartBox?.style.setProperty("height", `${chartHeight + 78}px`, "important");
    chartBox?.classList.add("chart-card-enhanced");

    charts[idCanvas] = new Chart(canvas, {
        type:"bar",
        data:{
            labels,
            datasets:[{
                label,
                data,
                backgroundColor:"rgba(0,143,70,.92)",
                borderColor:"rgba(0,79,42,.95)",
                borderWidth:1,
                borderRadius:horizontal ? 9 : 12,
                barThickness:horizontal ? 24 : 42,
                maxBarThickness:horizontal ? 30 : 54,
                minBarLength:horizontal ? 10 : 6,
                barPercentage:.92,
                categoryPercentage:.86
            }]
        },
        options:{
            responsive:true,
            maintainAspectRatio:false,
            resizeDelay:0,
            interaction:{
                mode:"nearest",
                axis:horizontal ? "y" : "x",
                intersect:false
            },
            hover:{
                mode:"nearest",
                intersect:false
            },
            layout:{
                padding:horizontal
                    ? {left:4, right:170, top:10, bottom:10}
                    : {left:8, right:24, top:28, bottom:8}
            },
            indexAxis:horizontal ? "y" : "x",
            plugins:{
                title:{display:true,text:titulo,color:chartTextColor(),font:{weight:"900",size:15},padding:{bottom:18}},
                legend:{display:true,position:"top",labels:{color:chartTextColor(),boxWidth:12,font:{weight:"800"}}},
                tooltip:{
                    callbacks:{
                        label:ctx => `${ctx.dataset.label}: ${formatChartValue(ctx.parsed[horizontal ? "x" : "y"], tipoValor)}`
                    }
                },
                datalabels:{
                    display:ctx => Math.abs(toNumber(ctx.dataset.data[ctx.dataIndex])) > 0,
                    anchor:"end",
                    align:horizontal ? "right" : "top",
                    offset:horizontal ? 10 : 7,
                    clamp:true,
                    clip:false,
                    color:chartTextColor(),
                    backgroundColor:labelBg,
                    borderColor:labelBorder,
                    borderWidth:1,
                    borderRadius:6,
                    padding:{top:3,right:6,bottom:3,left:6},
                    font:{size:horizontal ? 11 : 10,weight:"900"},
                    formatter:value => formatChartValue(value, tipoValor)
                }
            },
            scales:horizontal ? {
                y:{
                    ticks:{
                        color:chartTextColor(),
                        font:{size:11,weight:"800"},
                        autoSkip:false
                    },
                    grid:{color:"rgba(148,163,184,.10)"}
                },
                x:{
                    beginAtZero:true,
                    suggestedMax:maxValue > 0 ? maxValue * 1.18 : undefined,
                    grid:{display:true, color:"rgba(148,163,184,.13)"},
                    ticks:{
                        color:chartTextColor(),
                        font:{size:10,weight:"800"},
                        callback:value => tipoValor === "money" ? formatNumber(value) : formatChartValue(value, tipoValor)
                    }
                }
            } : {
                y:{
                    beginAtZero:true,
                    suggestedMax:maxValue > 0 ? maxValue * 1.14 : undefined,
                    ticks:{
                        color:chartTextColor(),
                        font:{size:10,weight:"800"},
                        callback:value => tipoValor === "money" ? formatNumber(value) : formatChartValue(value, tipoValor)
                    },
                    grid:{color:"rgba(148,163,184,.16)"}
                },
                x:{
                    ticks:{
                        color:chartTextColor(),
                        font:{size:10,weight:"800"},
                        autoSkip:false,
                        maxRotation:25,
                        minRotation:0
                    },
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
                title:{display:true,text:titulo,color:chartTextColor(),font:{weight:"900",size:13}},
                legend:{display:true,position:"top",labels:{color:chartTextColor(),boxWidth:12,font:{weight:"800"}}},
                tooltip:{
                    callbacks:{
                        label:ctx => `${ctx.dataset.label}: ${formatChartValue(ctx.parsed.y, tipoValor)}`
                    }
                },
                datalabels:{
                    display:false
                }
            },
            scales:{
                y:{beginAtZero:true,ticks:{color:chartTextColor(),font:{size:10,weight:"700"}},grid:{color:"rgba(148,163,184,.16)"}},
                x:{grid:{display:false},ticks:{color:chartTextColor(),font:{size:10,weight:"700"},maxRotation:0}}
            }
        }
    });
}

function crearChartDoughnut(idCanvas, labels, data, titulo, tipoValor="money"){
    const canvas = $(idCanvas);
    if(!canvas || typeof Chart === "undefined") return;

    registrarPluginGraficas();
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
                title:{display:true,text:titulo,color:chartTextColor(),font:{weight:"900",size:13}},
                legend:{display:true,position:"top",labels:{color:chartTextColor(),boxWidth:12,font:{weight:"800"}}},
                tooltip:{
                    callbacks:{
                        label:ctx => `${ctx.label}: ${formatChartValue(ctx.parsed, tipoValor)}`
                    }
                },
                datalabels:{
                    display:ctx => Math.abs(toNumber(ctx.dataset.data[ctx.dataIndex])) > 0,
                    color:"#ffffff",
                    textStrokeColor:"rgba(15,23,42,.45)",
                    textStrokeWidth:2,
                    font:{size:8,weight:"900"},
                    formatter:value => formatChartValue(value, tipoValor)
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
        true
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
        "number"
    );
}

function filasAnalisisActual(){
    return DATASET_FILTRADO.length ? DATASET_FILTRADO : DATASET_NORMAL;
}

function diasAnalisisActual(rows=filasAnalisisActual()){
    if(DIAS_RANGO_ACTUAL > 0) return DIAS_RANGO_ACTUAL;

    const fechas = rows.map(r => r.fecha).filter(Boolean).sort((a,b) => a - b);
    if(fechas.length < 2) return Math.max(fechas.length, 1);

    return diasEntre(fechas[0], fechas[fechas.length - 1]);
}

function mesesAnalisisActual(rows=filasAnalisisActual()){
    if(MESES_EQUIVALENTES_ACTUAL > 0) return MESES_EQUIVALENTES_ACTUAL;
    return Math.max(diasAnalisisActual(rows) / 30, 1);
}

function llaveOrdenAnalisis(row){
    return row.ordenServicio || row.raw?.ORDEN_SERVICIO_FUNERARIO || row.id || cryptoRandom();
}

function contarOrdenesUnicas(rows){
    return new Set(rows.map(row => llaveOrdenAnalisis(row)).filter(Boolean)).size;
}

function agruparAnalisis(rows, obtenerNombre){
    const obj = {};

    rows.forEach(row => {
        const nombre = normalizarTexto(obtenerNombre(row)) || "SIN DATO";

        if(!obj[nombre]){
            obj[nombre] = {nombre, ordenes:new Set(), valor:0, cantidad:0};
        }

        obj[nombre].ordenes.add(llaveOrdenAnalisis(row));
        obj[nombre].valor += toNumber(row.valorVenta);
        obj[nombre].cantidad = obj[nombre].ordenes.size;
    });

    return Object.values(obj).sort((a,b) => b.cantidad - a.cantidad || b.valor - a.valor);
}

function totalCantidadAnalisis(data){
    return data.reduce((acc,item) => acc + item.cantidad, 0);
}

function renderTablaAnalisisCantidad(selector, data, dias, meses, incluirVenta=true){
    const tbody = document.querySelector(`${selector} tbody`);
    if(!tbody) return;

    const total = totalCantidadAnalisis(data);
    tbody.innerHTML = data.length ? data.map(item => {
        const pct = total > 0 ? (item.cantidad / total) * 100 : 0;
        return `
            <tr>
                <td>${escapeHtml(item.nombre)}</td>
                <td>${formatNumber(item.cantidad)}</td>
                <td>${pct.toFixed(1)}%</td>
                <td>${formatNumber(item.cantidad / dias, 2)}</td>
                <td>${formatNumber(item.cantidad / meses, 2)}</td>
                ${incluirVenta ? `<td>${formatMoney(item.valor)}</td>` : ""}
            </tr>
        `;
    }).join("") : `<tr><td colspan="${incluirVenta ? 6 : 5}">Sin registros</td></tr>`;
}

function renderAnalisisHomenajeExcedente(){
    const rows = filasAnalisisActual();
    const dias = diasAnalisisActual(rows);
    const totalVenta = sumar(rows);
    const data = agruparAnalisis(rows, row => `${row.categoria || row.categoriaGerencial || "SIN HOMENAJE"} · ${row.servicio || "SIN EXCEDENTE"}`);
    const mayor = data[0];

    setHtml("kpiHomenajeVenta", formatMoney(totalVenta));
    setHtml("kpiHomenajeRegistros", formatNumber(totalCantidadAnalisis(data)));
    setHtml("kpiHomenajeMayor", mayor ? mayor.nombre.split("·")[0].trim() : "-");
    setHtml("kpiHomenajePromedio", formatMoney(totalVenta / dias));
    setHtml("textoAnalisisHomenaje", `Discriminación por <strong>TIPO_HOMENAJE</strong> y <strong>TIPO_EXCEDENTE</strong>. Venta total analizada: <strong>${formatMoney(totalVenta)}</strong>.`);

    crearChartBar("graficoHomenajeExcedente", data.slice(0,15).map(x => x.nombre), data.slice(0,15).map(x => x.valor), "Venta", "Venta por tipo de homenaje / excedente", true);

    const tbody = document.querySelector("#tablaHomenajeExcedente tbody");
    if(tbody){
        tbody.innerHTML = data.length ? data.map(item => {
            const [homenaje, excedente] = item.nombre.split("·").map(x => x.trim());
            const pct = totalVenta > 0 ? (item.valor / totalVenta) * 100 : 0;
            return `
                <tr>
                    <td>${escapeHtml(homenaje || "-")}</td>
                    <td>${escapeHtml(excedente || "-")}</td>
                    <td>${formatNumber(item.cantidad)}</td>
                    <td>${formatMoney(item.valor)}</td>
                    <td>${pct.toFixed(1)}%</td>
                    <td>${formatMoney(item.valor / dias)}</td>
                </tr>
            `;
        }).join("") : `<tr><td colspan="6">Sin registros</td></tr>`;
    }
}

function renderAnalisisClinicas(){
    const rows = filasAnalisisActual().filter(row => row.clinica);
    const dias = diasAnalisisActual(rows);
    const meses = mesesAnalisisActual(rows);
    const data = agruparAnalisis(rows, row => row.clinica);
    const total = totalCantidadAnalisis(data);
    const mayor = data[0];

    setHtml("kpiClinicasTotal", data.length);
    setHtml("kpiClinicasReportes", formatNumber(total));
    setHtml("kpiClinicasMayor", mayor ? mayor.nombre : "-");
    setHtml("kpiClinicasPromedio", formatNumber(total / dias, 2));
    setHtml("textoAnalisisClinicas", `Clínicas que más reportan fallecidos. Mayor reporte: <strong>${escapeHtml(mayor?.nombre || "-")}</strong> con <strong>${formatNumber(mayor?.cantidad || 0)}</strong> reportes.`);

    crearChartBar("graficoClinicasReporte", data.slice(0,15).map(x => x.nombre), data.slice(0,15).map(x => x.cantidad), "Reportes", "Ranking de clínicas", true, "number");
    renderTablaAnalisisCantidad("#tablaClinicasReporte", data, dias, meses);
}

function renderAnalisisMunicipios(){
    const rows = filasAnalisisActual().filter(row => row.municipio);
    const dias = diasAnalisisActual(rows);
    const meses = mesesAnalisisActual(rows);
    const data = agruparAnalisis(rows, row => row.municipio);
    const total = totalCantidadAnalisis(data);
    const mayor = data[0];

    setHtml("kpiMunicipiosTotal", data.length);
    setHtml("kpiMunicipiosReportes", formatNumber(total));
    setHtml("kpiMunicipiosMayor", mayor ? mayor.nombre : "-");
    setHtml("kpiMunicipiosPromedio", formatNumber(total / dias, 2));
    setHtml("textoAnalisisMunicipios", `Atención de seres queridos fallecidos por municipio. Municipio con mayor registro: <strong>${escapeHtml(mayor?.nombre || "-")}</strong>.`);

    crearChartBar("graficoMunicipios", data.slice(0,15).map(x => x.nombre), data.slice(0,15).map(x => x.cantidad), "Atenciones", "Atenciones por municipio", true, "number");
    renderTablaAnalisisCantidad("#tablaMunicipios", data, dias, meses);
}

function renderAnalisisMuerte(){
    const rows = filasAnalisisActual().filter(row => row.tipoMuerte);
    const dias = diasAnalisisActual(rows);
    const data = agruparAnalisis(rows, row => row.tipoMuerte);
    const total = totalCantidadAnalisis(data);
    const natural = data.find(x => x.nombre.includes("NATURAL") && !x.nombre.includes("NO"))?.cantidad || 0;
    const noNatural = data.find(x => x.nombre.includes("NO NATURAL"))?.cantidad || 0;

    setHtml("kpiMuerteNatural", `${(total > 0 ? (natural / total) * 100 : 0).toFixed(1)}%`);
    setHtml("kpiMuerteNoNatural", `${(total > 0 ? (noNatural / total) * 100 : 0).toFixed(1)}%`);
    setHtml("kpiMuerteTotal", formatNumber(total));
    setHtml("kpiMuertePromedio", formatNumber(total / dias, 2));
    setHtml("textoAnalisisMuerte", `Representación por tipo de muerte. Natural: <strong>${formatNumber(natural)}</strong>; no natural: <strong>${formatNumber(noNatural)}</strong>.`);

    crearChartDoughnut("graficoTipoMuerte", data.map(x => x.nombre), data.map(x => x.cantidad), "Tipo de muerte", "number");
    renderTablaAnalisisCantidad("#tablaTipoMuerte", data, dias, mesesAnalisisActual(rows));
}

function renderAnalisisCementerios(){
    const rows = filasAnalisisActual().filter(row => row.cementerio);
    const dias = diasAnalisisActual(rows);
    const meses = mesesAnalisisActual(rows);
    const data = agruparAnalisis(rows, row => row.cementerio);
    const total = totalCantidadAnalisis(data);
    const mayor = data[0];

    setHtml("kpiCementeriosTotal", data.length);
    setHtml("kpiCementeriosServicios", formatNumber(total));
    setHtml("kpiCementeriosMayor", mayor ? mayor.nombre : "-");
    setHtml("kpiCementeriosMensual", formatNumber(total / meses, 2));
    setHtml("textoAnalisisCementerios", `Cementerios con mayor destino de seres queridos. Mayor registro: <strong>${escapeHtml(mayor?.nombre || "-")}</strong>.`);

    crearChartBar("graficoCementerios", data.slice(0,15).map(x => x.nombre), data.slice(0,15).map(x => x.cantidad), "Servicios", "Servicios por cementerio", true, "number");
    renderTablaAnalisisCantidad("#tablaCementerios", data, dias, meses);
}

function renderAnalisisDestino(){
    const rows = filasAnalisisActual().filter(row => row.destinoFinal);
    const dias = diasAnalisisActual(rows);
    const meses = mesesAnalisisActual(rows);
    const data = agruparAnalisis(rows, row => row.destinoFinal);
    const total = totalCantidadAnalisis(data);
    const mayor = data[0];

    setHtml("kpiDestinoTotal", data.length);
    setHtml("kpiDestinoServicios", formatNumber(total));
    setHtml("kpiDestinoMayor", mayor ? mayor.nombre : "-");
    setHtml("kpiDestinoMensual", formatNumber(total / meses, 2));
    setHtml("textoAnalisisDestino", `Promedio diario y mensual según <strong>TIPO_DESTINO_FINAL</strong>. Mayor destino: <strong>${escapeHtml(mayor?.nombre || "-")}</strong>.`);

    crearChartBar("graficoDestinoFinal", data.slice(0,15).map(x => x.nombre), data.slice(0,15).map(x => x.cantidad), "Servicios", "Servicios por destino final", true, "number");
    renderTablaAnalisisCantidad("#tablaDestinoFinal", data, dias, meses);
}

function renderAnalisisAvanzados(){
    renderAnalisisHomenajeExcedente();
    renderAnalisisClinicas();
    renderAnalisisMunicipios();
    renderAnalisisMuerte();
    renderAnalisisCementerios();
    renderAnalisisDestino();
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
        {label:"Meta acumulada", data:metas, borderColor:"#ef4444", borderDash:[8,6], fill:false, pointRadius:3, tension:.25}
    ], `Producción vs meta acumulada ${anio}`);
}

function asegurarVistaCumplimiento(forzar=false){
    const vista = $("vistaCumplimiento");
    if(!vista || (!forzar && $("cumplimientoMetaVista"))) return;

    vista.innerHTML = `
        <h1 class="vista-titulo">Cumplimiento</h1>
        <section class="resumen-ejecutivo">
            <h2>Lectura de cumplimiento</h2>
            <p id="textoCumplimientoVista">Cargando cumplimiento desde Google Sheet...</p>
        </section>
        <section class="kpis-secundarios kpis-cumplimiento-vista">
            <div class="card kpi-mini"><h3>🎯 Meta del periodo</h3><h2 id="cumplimientoMetaVista">$0</h2></div>
            <div class="card kpi-mini"><h3>💰 Venta real</h3><h2 id="cumplimientoVentaVista">$0</h2></div>
            <div class="card kpi-mini"><h3>📈 Cumplimiento</h3><h2 id="cumplimientoPctVista">0%</h2></div>
            <div class="card kpi-mini"><h3>⚠️ Faltante</h3><h2 id="cumplimientoFaltanteVista">$0</h2></div>
            <div class="card kpi-mini"><h3>🏆 Mejor mes</h3><h2 id="cumplimientoMejorMesVista">-</h2></div>
            <div class="card kpi-mini"><h3>📅 Meses con venta</h3><h2 id="cumplimientoMesesVentaVista">0</h2></div>
        </section>
        <div class="grafico-card grafico-full">
            <h3>Cumplimiento mensual</h3>
            <canvas id="graficoCumplimientoMensual"></canvas>
        </div>
        <div class="tabla-cumplimiento">
            <h2>Detalle mensual</h2>
            <table id="tablaCumplimientoMensual">
                <thead>
                    <tr>
                        <th>Mes</th>
                        <th>Meta</th>
                        <th>Venta</th>
                        <th>%</th>
                        <th>Faltante</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
    `;
}

function renderCumplimientoMensual(){
    asegurarVistaCumplimiento();
    const f = obtenerFiltros();
    const anio = anioReferenciaFiltros();
    const meses = Array.from({length:12}, (_,i) => i + 1);
    const labels = meses.map(m => `${nombreMes(m)} ${anio}`);
    const rowsBase = DATASET_FILTRADO.length ? DATASET_FILTRADO : DATASET_NORMAL.filter(row =>
        row.fecha &&
        row.fecha.getFullYear() === anio &&
        coincideFiltrosNoFecha(row, f)
    );
    const metaFallback = calcularMetaPorRango(f.fechaInicio, f.fechaFin);
    const metaPeriodo = META_RANGO_ACTUAL || metaFallback.meta || metaMensualTotal();
    const ventas = meses.map(m => sumar(rowsBase.filter(row =>
        row.fecha &&
        row.fecha.getFullYear() === anio &&
        row.fecha.getMonth() + 1 === m
    )));
    const metas = labels.map(() => metaMensualTotal());
    const ventaPeriodo = sumar(rowsBase);
    const cumplimientoPeriodo = metaPeriodo > 0 ? (ventaPeriodo / metaPeriodo) * 100 : 0;
    const faltantePeriodo = Math.max(metaPeriodo - ventaPeriodo, 0);
    const mesesConVenta = ventas.filter(v => v > 0).length;
    const mejorIndex = ventas.reduce((best, value, index) => value > ventas[best] ? index : best, 0);
    const mejorMes = ventas[mejorIndex] > 0 ? `${nombreMes(meses[mejorIndex])} · ${formatMoney(ventas[mejorIndex])}` : "-";

    setHtml("cumplimientoMetaVista", formatMoney(metaPeriodo));
    setHtml("cumplimientoVentaVista", formatMoney(ventaPeriodo));
    setHtml("cumplimientoPctVista", `${cumplimientoPeriodo.toFixed(1)}%`);
    setHtml("cumplimientoFaltanteVista", formatMoney(faltantePeriodo));
    setHtml("cumplimientoMejorMesVista", mejorMes);
    setHtml("cumplimientoMesesVentaVista", mesesConVenta);
    setHtml("textoCumplimientoVista", `
        Datos tomados de Google Sheet${DATASET_FILTRADO.length ? " para el rango filtrado" : " para el año seleccionado"}.
        La venta real es
        <strong>${formatMoney(ventaPeriodo)}</strong> frente a una meta de
        <strong>${formatMoney(metaPeriodo)}</strong>, con cumplimiento de
        <strong>${cumplimientoPeriodo.toFixed(1)}%</strong> y faltante de
        <strong>${formatMoney(faltantePeriodo)}</strong>.
    `);

    const pctVista = $("cumplimientoPctVista");
    if(pctVista) pctVista.style.color = colorPorPorcentaje(cumplimientoPeriodo);

    crearChartLine("graficoCumplimientoMensual", labels, [
        {label:"Venta", data:ventas, borderColor:"#00a651", backgroundColor:"rgba(0,166,81,.12)", fill:true, tension:.3},
        {label:"Meta", data:metas, borderColor:"#ef4444", borderDash:[8,6], fill:false, pointRadius:0}
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
                    <td>${formatFechaProfesional(row.fecha, row.fechaTexto || "-")}</td>
                    <td>${escapeHtml(row.ordenServicio || "-")}</td>
                    <td title="${escapeHtml(row.gestor || "-")}">${escapeHtml(nombreGestorCorto(row.gestor))}</td>
                    <td>${escapeHtml(row.sede || "-")}</td>
                    <td>${escapeHtml(row.tipoServicio || "-")}</td>
                    <td>${escapeHtml(row.categoria || "-")}</td>
                    <td>${escapeHtml(row.servicio || "-")}</td>
                    <td>${escapeHtml(row.clinica || "-")}</td>
                    <td>${escapeHtml(row.municipio || "-")}</td>
                    <td>${escapeHtml(row.tipoMuerte || "-")}</td>
                    <td>${escapeHtml(row.cementerio || "-")}</td>
                    <td>${escapeHtml(row.destinoFinal || "-")}</td>
                    <td>${formatNumber(row.cantidadAtendida || 1)}</td>
                    <td>${formatMoney(row.valorServicio)}</td>
                    <td>${formatMoney(row.valorExcedente)}</td>
            </tr>
        `).join("") : `<tr><td colspan="15">Sin registros</td></tr>`;
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

    cargarMantenimientos().forEach(item => {
        const info = estadoMantenimiento(item);
        if(["VENCIDO","ALERTA 5 DÍAS","ALERTA 10 DÍAS"].includes(info.estado)){
            alertas.push(`${info.estado}: ${item.tipo} de ${item.activo} con fecha ${formatFechaProfesional(item.fecha)}.`);
        }
    });

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

function cargarColeccionLocalConEjemplos(clave, datosIniciales=[], versionClave=""){
    const data = cargarColeccionLocal(clave, datosIniciales);
    if(!versionClave || localStorage.getItem(versionClave) === "20260701") return data;

    const ids = new Set(data.map(item => item.id).filter(Boolean));
    let actualizado = false;

    datosIniciales.forEach(item => {
        if(item.id && !ids.has(item.id)){
            data.push(item);
            actualizado = true;
        }
    });

    if(actualizado) guardarColeccionLocal(clave, data);
    localStorage.setItem(versionClave, "20260701");

    return data;
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
    ], "Consumo kWh año actual vs anterior", "kwh");

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

function datosMantenimientosIniciales(){
    const anio = new Date().getFullYear();
    return [
        {id:"mant_soat_carroza_1", tipo:"SOAT", activo:"Carroza Toyota placa HJM-421", fecha:`${anio}-07-10`, responsable:"Coordinación Homenajes", observacion:"Vencimiento SOAT"},
        {id:"mant_tecno_carroza_1", tipo:"TECNOMECANICA", activo:"Carroza Toyota placa HJM-421", fecha:`${anio}-07-15`, responsable:"Coordinación Homenajes", observacion:"Revisión técnico mecánica"},
        {id:"mant_seguro_carroza_1", tipo:"SEGURO VEHICULAR", activo:"Carroza Toyota placa HJM-421", fecha:`${anio}-08-05`, responsable:"Administración", observacion:"Renovación póliza todo riesgo"},
        {id:"mant_aceite_carroza_1", tipo:"CAMBIO ACEITE", activo:"Carroza Toyota placa HJM-421", fecha:`${anio}-06-30`, responsable:"Conductores", observacion:"Cambio por kilometraje"},
        {id:"mant_soat_van_1", tipo:"SOAT", activo:"Van operativa placa KOR-214", fecha:`${anio}-09-12`, responsable:"Coordinación Homenajes", observacion:"Control documental"},
        {id:"mant_tecno_van_1", tipo:"TECNOMECANICA", activo:"Van operativa placa KOR-214", fecha:`${anio}-09-20`, responsable:"Coordinación Homenajes", observacion:"Revisión preventiva"},
        {id:"mant_aceite_van_1", tipo:"CAMBIO ACEITE", activo:"Van operativa placa KOR-214", fecha:`${anio}-07-03`, responsable:"Conductores", observacion:"Aceite y filtros"},
        {id:"mant_autos_frenos", tipo:"MANTENIMIENTO AUTOS", activo:"Vehículos operativos", fecha:`${anio}-07-18`, responsable:"Taller autorizado", observacion:"Revisión frenos, luces y llantas"},
        {id:"mant_jardin_sede", tipo:"JARDINERIA", activo:"Jardines sede principal", fecha:`${anio}-07-05`, responsable:"Servicios Generales", observacion:"Poda, limpieza y riego"},
        {id:"mant_pintura_capilla", tipo:"PINTURA INFRAESTRUCTURA", activo:"Capilla y zonas comunes", fecha:`${anio}-08-14`, responsable:"Mantenimiento", observacion:"Retoques de pintura institucional"},
        {id:"mant_filtros_cafeteria", tipo:"FILTROS CAFETERIA", activo:"Cafetería sede principal", fecha:`${anio}-07-22`, responsable:"Servicios Generales", observacion:"Cambio filtros de agua y limpieza"},
        {id:"mant_lavado_autos", tipo:"MANTENIMIENTO AUTOS", activo:"Flota operativa", fecha:`${anio}-06-24`, responsable:"Conductores", observacion:"Lavado, desinfección y revisión diaria"}
    ];
}

function cargarMantenimientos(){
    return cargarColeccionLocalConEjemplos("mantenimientosOperacion", datosMantenimientosIniciales(), "mantenimientosSeedVersion");
}

function estadoMantenimiento(item){
    const fecha = parseFecha(item.fecha);
    if(!fecha) return {estado:"SIN FECHA", dias:null, clase:"warning"};

    const hoy = inicioDia(new Date());
    const vencimiento = inicioDia(fecha);
    const dias = Math.ceil((vencimiento - hoy) / 86400000);

    if(dias < 0) return {estado:"VENCIDO", dias, clase:"danger"};
    if(dias <= 5) return {estado:"ALERTA 5 DÍAS", dias, clase:"danger"};
    if(dias <= 10) return {estado:"ALERTA 10 DÍAS", dias, clase:"warning"};
    return {estado:"AL DÍA", dias, clase:"ok"};
}

function badgeMantenimiento(info){
    if(info.clase === "ok") return `<span class="badge badge-ok">${info.estado}</span>`;
    if(info.clase === "danger") return `<span class="badge badge-danger">${info.estado}</span>`;
    return `<span class="badge badge-warning">${info.estado}</span>`;
}

function actualizarAlertasMantenimientoDashboard(alertas, conteo){
    const totalAlertas = alertas.length;
    const top = $("alertaMantenimientoTop");
    const topTexto = $("alertaMantenimientoTopTexto");
    const strip = $("alertaDashboardPrincipal");

    if(top && topTexto){
        top.classList.remove("hidden", "danger", "warning", "ok");

        if(totalAlertas === 0){
            top.classList.add("ok");
            topTexto.textContent = "Sin alertas";
        }else if((conteo.vencidos || 0) > 0 || (conteo.cinco || 0) > 0){
            top.classList.add("danger");
            topTexto.textContent = `${totalAlertas} alerta${totalAlertas === 1 ? "" : "s"} crítica${totalAlertas === 1 ? "" : "s"}`;
        }else{
            top.classList.add("warning");
            topTexto.textContent = `${totalAlertas} alerta${totalAlertas === 1 ? "" : "s"} próxima${totalAlertas === 1 ? "" : "s"}`;
        }
    }

    if(strip){
        if(totalAlertas === 0){
            strip.classList.add("hidden");
            strip.innerHTML = "";
        }else{
            const primera = alertas[0];
            const detalle = primera
                ? `${escapeHtml(primera.item.tipo)} · ${escapeHtml(primera.item.activo)} · ${primera.info.dias < 0 ? `${Math.abs(primera.info.dias)} días vencido` : `faltan ${primera.info.dias} días`}`
                : "";

            strip.classList.remove("hidden", "danger", "warning");
            strip.classList.add((conteo.vencidos || 0) > 0 || (conteo.cinco || 0) > 0 ? "danger" : "warning");
            strip.innerHTML = `
                <div>
                    <strong><i class="fas fa-triangle-exclamation"></i> Alertas de mantenimiento activas</strong>
                    <span>${formatNumber(totalAlertas)} control${totalAlertas === 1 ? "" : "es"} requiere${totalAlertas === 1 ? "" : "n"} seguimiento. ${detalle}</span>
                </div>
                <button class="action-btn" onclick="cambiarVista('mantenimientos')">Ver mantenimientos</button>
            `;
        }
    }
}

function renderMantenimientos(){
    const data = cargarMantenimientos().sort((a,b) => String(a.fecha || "").localeCompare(String(b.fecha || "")));
    const conteo = {vencidos:0, cinco:0, diez:0, ok:0};
    const alertas = [];

    data.forEach(item => {
        const info = estadoMantenimiento(item);
        if(info.estado === "VENCIDO") conteo.vencidos++;
        else if(info.estado === "ALERTA 5 DÍAS") conteo.cinco++;
        else if(info.estado === "ALERTA 10 DÍAS") conteo.diez++;
        else if(info.estado === "AL DÍA") conteo.ok++;

        if(["VENCIDO","ALERTA 5 DÍAS","ALERTA 10 DÍAS"].includes(info.estado)){
            alertas.push({item, info});
        }
    });

    setHtml("kpiMantVencidos", conteo.vencidos);
    setHtml("kpiMantCinco", conteo.cinco);
    setHtml("kpiMantDiez", conteo.diez);
    setHtml("kpiMantOk", conteo.ok);
    setHtml("textoMantenimientos", `
        Control operativo con <strong>${conteo.vencidos}</strong> vencidos,
        <strong>${conteo.cinco}</strong> alertas a 5 días,
        <strong>${conteo.diez}</strong> alertas a 10 días y
        <strong>${conteo.ok}</strong> controles al día.
    `);

    actualizarAlertasMantenimientoDashboard(alertas, conteo);

    const alertasBox = $("alertasMantenimiento");
    if(alertasBox){
        alertasBox.innerHTML = alertas.length ? alertas.map(({item, info}) => `
            <div class="alerta-item">
                <i class="fas fa-triangle-exclamation"></i>
                <span>
                    <strong>${escapeHtml(item.tipo)}</strong> · ${escapeHtml(item.activo)}
                    vence el <strong>${formatFechaProfesional(item.fecha)}</strong>
                    (${info.dias < 0 ? `${Math.abs(info.dias)} días vencido` : `faltan ${info.dias} días`}).
                </span>
            </div>
        `).join("") : `<p>Sin alertas de mantenimiento por el momento.</p>`;
    }

    const tbody = document.querySelector("#tablaMantenimientos tbody");
    if(tbody){
        tbody.innerHTML = data.length ? data.map(item => {
            const info = estadoMantenimiento(item);

            return `
                <tr>
                    <td>${escapeHtml(item.tipo || "-")}</td>
                    <td>${escapeHtml(item.activo || "-")}</td>
                    <td>${formatFechaProfesional(item.fecha)}</td>
                    <td>${info.dias === null ? "-" : info.dias}</td>
                    <td>${escapeHtml(item.responsable || "-")}</td>
                    <td>${badgeMantenimiento(info)}</td>
                    <td>${escapeHtml(item.observacion || "-")}</td>
                    <td><button class="danger-btn" onclick="eliminarMantenimiento('${escapeHtml(item.id)}')">Eliminar</button></td>
                </tr>
            `;
        }).join("") : `<tr><td colspan="8">Sin controles de mantenimiento</td></tr>`;
    }
}

function agregarMantenimiento(){
    const item = {
        id:cryptoRandom(),
        tipo:$("mantTipo")?.value || "",
        activo:($("mantActivo")?.value || "").trim(),
        fecha:$("mantFecha")?.value || "",
        responsable:$("mantResponsable")?.value || "",
        observacion:$("mantObservacion")?.value || ""
    };

    if(!item.tipo || !item.activo || !item.fecha){
        toast("Tipo, activo y fecha son obligatorios.", "warning");
        return;
    }

    const data = cargarMantenimientos();
    data.push(item);
    guardarColeccionLocal("mantenimientosOperacion", data);

    ["mantTipo","mantActivo","mantFecha","mantResponsable","mantObservacion"].forEach(id => setValue(id, ""));
    renderMantenimientos();
    toast("Control de mantenimiento agregado.");
}

function eliminarMantenimiento(id){
    const data = cargarMantenimientos().filter(item => item.id !== id);
    guardarColeccionLocal("mantenimientosOperacion", data);
    renderMantenimientos();
    toast("Control de mantenimiento eliminado.");
}

window.eliminarMantenimiento = eliminarMantenimiento;

function limpiarMantenimientos(){
    if(!confirm("¿Deseas eliminar todos los mantenimientos?")) return;
    guardarColeccionLocal("mantenimientosOperacion", []);
    renderMantenimientos();
    toast("Mantenimientos eliminados.");
}

function datosVacacionesIniciales(){
    return [
        {id:"vac_javier", nombre:"Javier Mendoza Galván", cargo:"Conductor Tanatopractor", fechaBase:"2025-07-01", inicio:"2026-07-02", fin:"2026-07-21", dias:15, estado:"PROGRAMADA"},
        {id:"vac_raul", nombre:"Raúl López", cargo:"Conductor Tanatopractor", fechaBase:"2024-12-01", inicio:"", fin:"", dias:0, estado:"VENCIDA"},
        {id:"vac_hazael", nombre:"Hazael Galván", cargo:"Conductor Tanatopractor", fechaBase:"2025-08-15", inicio:"", fin:"", dias:0, estado:"PENDIENTE"},
        {id:"vac_wendy", nombre:"Wendy Paola Cordero", cargo:"Gestora de Protocolo", fechaBase:"2025-05-20", inicio:"2026-05-05", fin:"2026-05-24", dias:15, estado:"DISFRUTADA"},
        {id:"vac_fernando", nombre:"Fernando Argel Martínez", cargo:"Gestor de Homenajes", fechaBase:"2025-02-10", inicio:"2026-02-12", fin:"2026-03-03", dias:15, estado:"DISFRUTADA"},
        {id:"vac_carlos", nombre:"Carlos López Pérez", cargo:"Gestor de Homenajes", fechaBase:"2025-04-03", inicio:"2026-07-15", fin:"2026-08-03", dias:15, estado:"PROGRAMADA"},
        {id:"vac_osvaldo", nombre:"Osvaldo Ramos Ruiz", cargo:"Gestor de Homenajes", fechaBase:"2025-09-22", inicio:"", fin:"", dias:0, estado:"PENDIENTE"},
        {id:"vac_alexis", nombre:"Alexis Ayazo Alvarez", cargo:"Gestor de Homenajes", fechaBase:"2024-11-18", inicio:"", fin:"", dias:0, estado:"VENCIDA"},
        {id:"vac_jessica", nombre:"Jessica Avila de Hoyos", cargo:"Auxiliar Administrativo", fechaBase:"2025-06-12", inicio:"2026-06-15", fin:"2026-07-04", dias:15, estado:"PROGRAMADA"},
        {id:"vac_samir", nombre:"Samir Chadid Corena", cargo:"Apoyo Operativo", fechaBase:"2025-10-01", inicio:"", fin:"", dias:0, estado:"PENDIENTE"}
    ];
}

function cargarVacaciones(){
    return cargarColeccionLocalConEjemplos("vacacionesPersonal", datosVacacionesIniciales(), "vacacionesSeedVersion");
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
        {id:"act_limpieza_autos", fecha:`${anio}-01-02`, hora:"08:00", titulo:"Limpieza y desinfección de vehículos", frecuencia:"DIARIA", estado:"CUMPLIDA", responsable:"Conductores", detalle:"Interior, camilla, cabina y elementos de bioseguridad."},
        {id:"act_documentos_autos", fecha:`${anio}-01-02`, hora:"09:00", titulo:"Validar documentos de vehículos", frecuencia:"DIARIA", estado:"PENDIENTE", responsable:"Coordinación Homenajes", detalle:"SOAT, tecnomecánica, seguros y tarjetas."},
        {id:"act_check_funerario", fecha:`${anio}-01-03`, hora:"06:00", titulo:"Checklist de elementos para servicio", frecuencia:"DIARIA", estado:"PENDIENTE", responsable:"Equipo operativo", detalle:"Confirmar cofres, implementos y soportes del servicio."},
        {id:"act_reporte_clinicas", fecha:`${anio}-01-03`, hora:"11:00", titulo:"Seguimiento reportes de clínicas", frecuencia:"DIARIA", estado:"EN PROCESO", responsable:"Gestores", detalle:"Actualizar novedades por clínica y municipio."},
        {id:"act_implementos", fecha:`${anio}-06-20`, hora:"09:00", titulo:"Seguimiento implementos de velación en casa", frecuencia:"MENSUAL", estado:"PENDIENTE", responsable:"Gestores", detalle:"Validar elementos vigentes, por recoger y recogidos."},
        {id:"act_inventario", fecha:`${anio}-06-22`, hora:"10:00", titulo:"Inventario mensual de implementos", frecuencia:"MENSUAL", estado:"PENDIENTE", responsable:"Bodega / Homenajes", detalle:"Sillas, carpas, atriles, avisos y elementos de velación."},
        {id:"act_soat", fecha:`${anio}-07-10`, hora:"08:00", titulo:"Revisión vencimientos SOAT", frecuencia:"MENSUAL", estado:"PENDIENTE", responsable:"Coordinación Homenajes", detalle:"Validar alertas a 10 y 5 días."},
        {id:"act_tecnomecanica", fecha:`${anio}-07-15`, hora:"09:00", titulo:"Revisión tecnomecánica flota", frecuencia:"MENSUAL", estado:"PENDIENTE", responsable:"Coordinación Homenajes", detalle:"Programar taller si aplica."},
        {id:"act_jardineria", fecha:`${anio}-07-05`, hora:"07:00", titulo:"Mantenimiento jardinería", frecuencia:"MENSUAL", estado:"CUMPLIDA", responsable:"Servicios Generales", detalle:"Poda, limpieza y estado visual sede."},
        {id:"act_cafeteria", fecha:`${anio}-07-22`, hora:"10:00", titulo:"Cambio filtros cafetería", frecuencia:"MENSUAL", estado:"PENDIENTE", responsable:"Servicios Generales", detalle:"Filtros de agua y limpieza preventiva."},
        {id:"act_residuos", fecha:`${anio}-07-01`, hora:"10:00", titulo:"Capacitación residuos y desinfección", frecuencia:"ANUAL", estado:"CUMPLIDA", responsable:"Talento Humano / Homenajes", detalle:"Refuerzo obligatorio para el equipo operativo."},
        {id:"act_auditoria", fecha:`${anio}-11-10`, hora:"08:00", titulo:"Preparación auditoría interna", frecuencia:"ANUAL", estado:"PENDIENTE", responsable:"Coordinación Homenajes", detalle:"Revisar R-15, R-56, RH1 y soportes operativos."},
        {id:"act_pintura", fecha:`${anio}-08-14`, hora:"14:00", titulo:"Mantenimiento pintura infraestructura", frecuencia:"ANUAL", estado:"PENDIENTE", responsable:"Mantenimiento", detalle:"Capillas, recepción, pasillos y zonas comunes."},
        {id:"act_plan_fin_anio", fecha:`${anio}-12-05`, hora:"15:00", titulo:"Cierre operativo anual", frecuencia:"ANUAL", estado:"PENDIENTE", responsable:"Dirección / Homenajes", detalle:"Revisión de indicadores, metas, pendientes y plan del siguiente año."}
    ];
}

function cargarAgenda(){
    return cargarColeccionLocalConEjemplos("agendaHomenajes", datosAgendaIniciales(), "agendaSeedVersion");
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

        if(iso === AGENDA_DIA_SELECCIONADO){
            celdas.push(htmlDiaAgendaExpandido(data, iso));
        }
    }

    contenedor.innerHTML = celdas.join("");
}

function htmlDiaAgendaExpandido(data, fecha){
    const actividadesDia = data
        .filter(item => item.fecha === fecha)
        .sort((a,b) => horaActividad(a).localeCompare(horaActividad(b)));

    const filas = [];

    for(let hora = 6; hora <= 19; hora++){
        const horaTexto = `${String(hora).padStart(2,"0")}:00`;
        const actividadesHora = actividadesDia.filter(item => Number(horaActividad(item).split(":")[0]) === hora);

        filas.push(`
            <div class="agenda-inline-hour">
                <span>${formatoHoraAgenda(horaTexto)}</span>
                <div>
                    ${actividadesHora.length ? actividadesHora.map(item => `
                        <article>
                            <strong>${escapeHtml(item.titulo)}</strong>
                            <small>${escapeHtml(item.responsable || "Sin responsable")} · ${escapeHtml(item.frecuencia || "ÚNICA")}</small>
                            <select class="inline-select" onchange="actualizarEstadoActividad('${escapeHtml(item.id)}', this.value)">
                                ${opcionesEstadoActividad(item.estado)}
                            </select>
                        </article>
                    `).join("") : `<small>Sin actividad</small>`}
                </div>
            </div>
        `);
    }

    return `
        <div class="agenda-day-expanded">
            <div class="agenda-expanded-title">
                <strong>Agenda del día · ${fecha}</strong>
                <button class="btn-secundario" onclick="event.stopPropagation(); setValue('actFecha','${fecha}')">Agregar en este día</button>
            </div>
            ${filas.join("")}
        </div>
    `;
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
    crearChartBar("graficoTiempoAfiliado", labels, data, "Casos", "Casos por rango de permanencia", true, "number");

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
        Linea_Valor:row.lineaValor || "",
        Fecha:row.fechaTexto,
        Orden_Servicio:row.ordenServicio,
        Gestor:row.gestor,
        Categoria_Original:row.categoria,
        Categoria_Gerencial:row.categoriaGerencial,
        Tipo_Servicio:row.tipoServicio,
        Servicio:row.servicio,
        Clinica:row.clinica,
        Municipio:row.municipio,
        Tipo_Muerte:row.tipoMuerte,
        Cementerio:row.cementerio,
        Destino_Final:row.destinoFinal,
        Sede:row.sede,
        Cantidad:row.cantidadAtendida,
        Valor_Servicio:row.valorServicio,
        Valor_Excedente:row.valorExcedente,
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
        Hora:horaActividad(item),
        Actividad:item.titulo || "",
        Frecuencia:item.frecuencia || "",
        Responsable:item.responsable || "",
        Estado:item.estado || "",
        Detalle:item.detalle || ""
    })).sort((a,b) => String(a.Fecha + a.Hora).localeCompare(String(b.Fecha + b.Hora)));

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
    const headers = [
        "Origen",
        "Linea_Valor",
        "Fecha",
        "Orden_Servicio",
        "Gestor",
        "Sede",
        "Categoria_Original",
        "Categoria_Gerencial",
        "Tipo_Servicio",
        "Tipo_Excedente",
        "Clinica",
        "Municipio",
        "Tipo_Muerte",
        "Cementerio",
        "Destino_Final",
        "Cantidad",
        "Valor_Servicio",
        "Valor_Excedente",
        "Valor_Venta"
    ];
    const rows = DATASET_FILTRADO.map(r => [
        r.origen,
        r.lineaValor || "",
        r.fechaTexto,
        r.ordenServicio,
        r.gestor,
        r.sede,
        r.categoria,
        r.categoriaGerencial,
        r.tipoServicio,
        r.servicio,
        r.clinica,
        r.municipio,
        r.tipoMuerte,
        r.cementerio,
        r.destinoFinal,
        r.cantidadAtendida,
        r.valorServicio,
        r.valorExcedente,
        r.valorVenta
    ]);

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
            "dashboardAmbiente",
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
    if(itemMenu){
        itemMenu.classList.add("active","selection-check");
        setTimeout(() => itemMenu.classList.remove("selection-check"), 650);
    }

    const vista = $(seccion);
    if(vista) vista.classList.add("active-view");

    setTimeout(() => {
        if(seccion === "vistaCumplimiento"){
            asegurarVistaCumplimiento(true);
            renderCumplimientoMensual();
        }
        if(seccion === "metas") renderMetas();
        if(seccion === "comparativo") renderComparativoAnual();
        if(seccion === "mantenimientos") renderMantenimientos();
        if(["analisisHomenaje","analisisClinicas","analisisMunicipios","analisisMuerte","analisisCementerios","analisisDestino"].includes(seccion)){
            renderAnalisisAvanzados();
        }
        redimensionarGraficos();
    }, 180);
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

function aplicarModoPresentacion(activo){
    document.body.classList.toggle("presentation-mode", activo);
    localStorage.setItem("dashboardPresentacion", activo ? "1" : "0");

    const btn = $("btnPresentacion");
    if(btn){
        btn.classList.toggle("active", activo);
        btn.title = activo ? "Salir de modo presentación" : "Modo presentación gerencial";
        btn.innerHTML = activo ? `<i class="fas fa-table-columns"></i>` : `<i class="fas fa-display"></i>`;
    }

    setTimeout(redimensionarGraficos, 240);
}

function alternarModoPresentacion(){
    aplicarModoPresentacion(!document.body.classList.contains("presentation-mode"));
}

function ambienteDashboardActual(){
    const guardado = localStorage.getItem("dashboardAmbiente") || "normal";
    return AMBIENTES_DASHBOARD.includes(guardado) ? guardado : "normal";
}

function aplicarAmbienteDashboard(ambiente){
    const valor = AMBIENTES_DASHBOARD.includes(ambiente) ? ambiente : "normal";
    document.body.classList.remove("theme-ocean","theme-sunset","theme-dark","theme-emerald","theme-violet","theme-slate","dark-mode");

    if(valor === "ocean") document.body.classList.add("theme-ocean");
    if(valor === "sunset") document.body.classList.add("theme-sunset");
    if(valor === "dark") document.body.classList.add("theme-dark");
    if(valor === "emerald") document.body.classList.add("theme-emerald");
    if(valor === "violet") document.body.classList.add("theme-violet");
    if(valor === "slate") document.body.classList.add("theme-slate");

    localStorage.setItem("dashboardAmbiente", valor);

    const botones = [$("btnTema"), $("btnAmbiente")].filter(Boolean);

    botones.forEach(boton => {
        const icono = boton.querySelector("i");
        boton.classList.toggle("ambient-active", valor !== "normal");

        if(valor === "ocean"){
            boton.title = "Ambiente visual: mar";
            if(icono) icono.className = "fas fa-water";
            if(boton.id === "btnAmbiente") boton.innerHTML = `<i class="fas fa-water"></i> Mar`;
        }else if(valor === "sunset"){
            boton.title = "Ambiente visual: atardecer";
            if(icono) icono.className = "fas fa-sun";
            if(boton.id === "btnAmbiente") boton.innerHTML = `<i class="fas fa-sun"></i> Atardecer`;
        }else if(valor === "dark"){
            boton.title = "Ambiente visual: oscuro";
            if(icono) icono.className = "fas fa-moon";
            if(boton.id === "btnAmbiente") boton.innerHTML = `<i class="fas fa-moon"></i> Oscuro`;
        }else{
            boton.title = "Ambiente visual: normal";
            if(icono) icono.className = "fas fa-circle-half-stroke";
            if(boton.id === "btnAmbiente") boton.innerHTML = `<i class="fas fa-water"></i> Ambiente`;
        }
    });

    document.querySelectorAll(".theme-dot").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.theme === valor);
    });

    setTimeout(redimensionarGraficos, 180);
}

function alternarTema(){
    const actual = ambienteDashboardActual();
    const indice = AMBIENTES_DASHBOARD.indexOf(actual);
    const siguiente = AMBIENTES_DASHBOARD[(indice + 1) % AMBIENTES_DASHBOARD.length];
    aplicarAmbienteDashboard(siguiente);

    const nombres = {
        normal:"normal",
        dark:"oscuro",
        ocean:"agua de mar",
        sunset:"atardecer suave",
        emerald:"verde ejecutivo",
        violet:"violeta",
        slate:"grafito"
    };

    toast(`Ambiente aplicado: ${nombres[siguiente]}.`);
}

function pantallaCompleta(){
    if(!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
}

function mostrarChuloFijoClick(event){
    if(event.target.closest(".click-check-pin")) return;

    let pin = $("clickCheckPin");
    if(!pin){
        pin = document.createElement("span");
        pin.id = "clickCheckPin";
        pin.className = "click-check-pin";
        document.body.appendChild(pin);
    }

    pin.style.left = `${event.clientX}px`;
    pin.style.top = `${event.clientY}px`;
    pin.classList.remove("click-check-pin");
    void pin.offsetWidth;
    pin.classList.add("click-check-pin");
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
    aplicarAmbienteDashboard(ambienteDashboardActual());
    if(localStorage.getItem("dashboardSidebar") === "collapsed") document.body.classList.add("sidebar-collapsed");
    aplicarModoPresentacion(localStorage.getItem("dashboardPresentacion") === "1");
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

document.querySelectorAll("[data-seccion]:not(.menu-item)").forEach(item => {
    item.addEventListener("click", () => cambiarVista(item.dataset.seccion));
});

document.querySelectorAll(".quick-btn").forEach(btn => {
    btn.addEventListener("click", () => aplicarRangoRapido(btn.dataset.rango));
});

document.querySelectorAll(".theme-dot").forEach(btn => {
    btn.addEventListener("click", () => {
        aplicarAmbienteDashboard(btn.dataset.theme || "normal");
    });
});

document.addEventListener("click", mostrarChuloFijoClick, true);

$("btnFiltrar")?.addEventListener("click", aplicarFiltrosYRender);
$("btnLimpiar")?.addEventListener("click", limpiarFiltros);
$("btnRecargar")?.addEventListener("click", cargarDashboard);
$("btnPdf")?.addEventListener("click", exportarPDF);
$("btnExcel")?.addEventListener("click", exportarExcel);
$("btnTema")?.addEventListener("click", alternarTema);
$("btnAmbiente")?.addEventListener("click", alternarTema);
$("btnSidebar")?.addEventListener("click", alternarSidebar);
$("btnFull")?.addEventListener("click", pantallaCompleta);
$("btnPresentacion")?.addEventListener("click", alternarModoPresentacion);
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

$("btnAgregarMantenimiento")?.addEventListener("click", agregarMantenimiento);
$("btnLimpiarMantenimientos")?.addEventListener("click", limpiarMantenimientos);

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
