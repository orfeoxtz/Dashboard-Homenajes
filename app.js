/* =========================================================
   DASHBOARD GERENCIAL HOMENAJES
   Archivo: app.js
   ========================================================= */

const SHEET_DATOS_URL = "https://docs.google.com/spreadsheets/d/1Q1hyG-SXsMJdrgsLRIPiVlVePZuov4eJSYsb6l4EmyQ/gviz/tq?tqx=out:csv&gid=223294406";

let DATASET_API = [];
let DATASET_FILTRADO = [];
let charts = {};
let AGENDA_CURSOR = new Date();

const PARAMETROS = {
    metaMensual: Number(localStorage.getItem("metaMensualBase") || 219133881),
    gestor: {
        "FERNANDO ARGEL": 25000000,
        "OSVALDO RAMOS": 25000000,
        "CARLOS LOPEZ": 25000000,
        "ALEXIS AYAZO": 25000000,
        "WENDY CORDERO": 7000000
    },
    categoria: {
        "PARTICULAR": 69090369,
        "RED": 127371072,
        "EXCEDENTES": 22672440
    },
    excedente: {
        "CARTELES": 136560,
        "ARREGLOS FLORALES": 4727400,
        "VELACION": 4564800,
        "SERVICIO DE BUS": 510000,
        "TRASLADOS": 1835280,
        "HABITOS": 214800,
        "EXCEDENTES POR COFRES": 9558000,
        "PREPARACIONES": 60000,
        "OTROS SERVICIOS ADICIONALES": 1068600
    }
};

function $(id){
    return document.getElementById(id);
}

function setHtml(id, value){
    const el = $(id);
    if(el) el.innerHTML = value;
}

function setValue(id, value){
    const el = $(id);
    if(el) el.value = value ?? "";
}

function toast(message){
    const el = $("toast");
    if(!el) return;
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2600);
}

function toNumber(value){
    if(typeof value === "number") return value;
    const cleaned = String(value || "")
        .replace(/\$/g, "")
        .replace(/\./g, "")
        .replace(/,/g, ".")
        .replace(/[^\d.-]/g, "");
    return Number(cleaned) || 0;
}

function formatMoney(value){
    return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0
    }).format(toNumber(value));
}

function formatNumber(value){
    return new Intl.NumberFormat("es-CO", {
        maximumFractionDigits: 0
    }).format(toNumber(value));
}

function escapeHtml(value){
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function normalizarTexto(value){
    return String(value || "")
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function normalizarEncabezado(value){
    return normalizarTexto(value)
        .replace(/\s+/g, "_")
        .replace(/[^\w]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

function limpiarTextoDato(value){
    const texto = String(value || "").trim();
    if(!texto || texto === "-" || normalizarTexto(texto) === "N/A") return "SIN REGISTRO";
    return texto;
}

function obtenerCampo(row, posiblesNombres){
    const mapa = {};
    Object.keys(row || {}).forEach(key => {
        mapa[normalizarEncabezado(key)] = row[key];
    });

    for(const nombre of posiblesNombres){
        const key = normalizarEncabezado(nombre);
        if(mapa[key] !== undefined && mapa[key] !== null && String(mapa[key]).trim() !== ""){
            return mapa[key];
        }
    }

    return "";
}

function parseFecha(value){
    if(value instanceof Date && !isNaN(value)) return value;
    if(!value) return null;

    const raw = String(value).trim();

    if(raw.includes("T")){
        const d = new Date(raw);
        if(!isNaN(d)) return d;
    }

    const ymd = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if(ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));

    const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if(dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));

    const d = new Date(raw);
    return isNaN(d) ? null : d;
}

function fechaISO(date){
    if(!date) return "";
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function inicioMes(date){
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function inicioAnio(date){
    return new Date(date.getFullYear(), 0, 1);
}

function inicioTrimestre(date){
    return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
}

function normalizarCategoriaGerencial(value){
    const texto = normalizarTexto(value);

    if(texto.includes("RED")) return "RED";
    if(texto.includes("EXCEDENTE")) return "EXCEDENTES";
    if(texto.includes("PARTICULAR")) return "PARTICULAR";
    if(texto.includes("PLAN")) return "PLAN";

    return texto || "SIN REGISTRO";
}

function categoriaGeneraVenta(categoria){
    return ["PARTICULAR", "RED", "EXCEDENTES"].includes(normalizarCategoriaGerencial(categoria));
}

function nombreGestorCompleto(value){
    const texto = limpiarTextoDato(value);
    const mapa = {
        "FERNANDO A": "Fernando Argel",
        "FERNANDO ARGEL": "Fernando Argel",
        "OSVALDO R": "Osvaldo Ramos",
        "OSVALDO RAMOS": "Osvaldo Ramos",
        "CARLOS L": "Carlos Lopez",
        "CARLOS LOPEZ": "Carlos Lopez",
        "ALEXIS A": "Alexis Ayazo",
        "ALEXIS AYAZO": "Alexis Ayazo",
        "WENDY C": "Wendy Cordero",
        "WENDY CORDERO": "Wendy Cordero"
    };
    return mapa[normalizarTexto(texto)] || texto;
}

function parseCSV(text){
    const rows = [];
    let row = [];
    let current = "";
    let insideQuotes = false;

    for(let i = 0; i < text.length; i++){
        const char = text[i];
        const next = text[i + 1];

        if(char === '"' && insideQuotes && next === '"'){
            current += '"';
            i++;
        }else if(char === '"'){
            insideQuotes = !insideQuotes;
        }else if(char === "," && !insideQuotes){
            row.push(current);
            current = "";
        }else if((char === "\n" || char === "\r") && !insideQuotes){
            if(char === "\r" && next === "\n") i++;
            row.push(current);
            if(row.some(cell => String(cell).trim() !== "")) rows.push(row);
            row = [];
            current = "";
        }else{
            current += char;
        }
    }

    row.push(current);
    if(row.some(cell => String(cell).trim() !== "")) rows.push(row);

    const headers = rows.shift() || [];

    return rows.map(values => {
        const obj = {};
        headers.forEach((header, index) => {
            obj[String(header || "").trim()] = values[index] ?? "";
        });
        return obj;
    });
}

function normalizarRegistroDashboard(row){
    const tipoHomenaje = limpiarTextoDato(obtenerCampo(row, ["TIPO_HOMENAJE", "TIPO HOMENAJE"]));
    const tipoExcedente = limpiarTextoDato(obtenerCampo(row, ["TIPO_EXCEDENTE", "TIPO EXCEDENTE"]));
    const valorServicio = toNumber(obtenerCampo(row, ["VALOR SERVICIO", "VALOR_SERVICIO", "VALOR"]));
    const valorExcedente = toNumber(obtenerCampo(row, ["VALOR EXCEDENTE", "VALOR_EXCEDENTE"]));
    const fechaOriginal = obtenerCampo(row, ["FECHA", "Fecha"]);
    const fecha = parseFecha(fechaOriginal);
    const categoriaGerencial = normalizarCategoriaGerencial(tipoHomenaje);

    return {
        origen: "GOOGLE_SHEET",
        fecha,
        fechaTexto: fecha ? fechaISO(fecha) : String(fechaOriginal || ""),
        ordenServicio: limpiarTextoDato(obtenerCampo(row, ["ORDEN_SERVICIO_FUNERARIO", "ORDEN SERVICIO FUNERARIO"])),
        gestor: nombreGestorCompleto(obtenerCampo(row, ["GESTOR"])),
        sede: limpiarTextoDato(obtenerCampo(row, ["SEDE"])),
        tipoServicio: limpiarTextoDato(obtenerCampo(row, ["TIPO_SERVICIO_TIPOSRV", "TIPO SERVICIO TIPOSRV", "TIPO_SERVICIO"])),
        categoria: tipoHomenaje,
        categoriaGerencial,
        servicio: tipoExcedente,
        tipoExcedente,
        clinica: limpiarTextoDato(obtenerCampo(row, ["CLINICA", "CLÍNICA", "IPS", "ENTIDAD"])),
        municipio: limpiarTextoDato(obtenerCampo(row, ["MUNICIPIO"])),
        tipoMuerte: limpiarTextoDato(obtenerCampo(row, ["TIPO_MUERTE", "TIPO MUERTE"])),
        cementerio: limpiarTextoDato(obtenerCampo(row, ["CEMENTERIO"])),
        destinoFinal: limpiarTextoDato(obtenerCampo(row, ["TIPO_DESTINO_FINAL", "TIPO DESTINO FINAL", "DESTINO_FINAL"])),
        cantidad: toNumber(obtenerCampo(row, ["CANTIDAD"])) || 1,
        valorServicio,
        valorExcedente,
        valorOriginal: valorServicio + valorExcedente,
        valorVenta: categoriaGerencial === "PLAN" ? 0 : valorServicio + valorExcedente,
        generaVenta: categoriaGeneraVenta(categoriaGerencial)
    };
}

function datosEjemplo(){
    return [
        {FECHA:"2026-04-01", GESTOR:"Fernando Argel", SEDE:"Monteria", TIPO_HOMENAJE:"PARTICULAR SOAT", TIPO_EXCEDENTE:"ARREGLOS FLORALES", CLINICA:"Clínica Montería", MUNICIPIO:"Montería", TIPO_MUERTE:"NATURAL", CEMENTERIO:"Jardín Los Olivos", TIPO_DESTINO_FINAL:"INHUMACIÓN", CANTIDAD:1, "VALOR SERVICIO":3200000, "VALOR EXCEDENTE":250000},
        {FECHA:"2026-04-02", GESTOR:"Osvaldo Ramos", SEDE:"Monteria", TIPO_HOMENAJE:"RED", TIPO_EXCEDENTE:"SERVICIO DE BUS", CLINICA:"Hospital San Jerónimo", MUNICIPIO:"Cereté", TIPO_MUERTE:"NATURAL", CEMENTERIO:"Cementerio Central", TIPO_DESTINO_FINAL:"INHUMACIÓN", CANTIDAD:1, "VALOR SERVICIO":2100000, "VALOR EXCEDENTE":180000},
        {FECHA:"2026-04-03", GESTOR:"Carlos Lopez", SEDE:"Monteria", TIPO_HOMENAJE:"PARTICULAR PENSIONADO", TIPO_EXCEDENTE:"EXCEDENTES POR COFRES", CLINICA:"Clínica Zayma", MUNICIPIO:"Montería", TIPO_MUERTE:"NO NATURAL", CEMENTERIO:"Jardín Los Olivos", TIPO_DESTINO_FINAL:"CREMACIÓN", CANTIDAD:1, "VALOR SERVICIO":4500000, "VALOR EXCEDENTE":700000},
        {FECHA:"2026-04-04", GESTOR:"Alexis Ayazo", SEDE:"Monteria", TIPO_HOMENAJE:"EXCEDENTES", TIPO_EXCEDENTE:"TRASLADOS", CLINICA:"Clínica Materno Infantil", MUNICIPIO:"Lorica", TIPO_MUERTE:"NATURAL", CEMENTERIO:"Parque Cementerio", TIPO_DESTINO_FINAL:"TRASLADO", CANTIDAD:1, "VALOR SERVICIO":0, "VALOR EXCEDENTE":950000},
        {FECHA:"2026-04-05", GESTOR:"Wendy Cordero", SEDE:"Monteria", TIPO_HOMENAJE:"PARTICULAR PERSONA", TIPO_EXCEDENTE:"VELACION", CLINICA:"Hospital San Jerónimo", MUNICIPIO:"Montería", TIPO_MUERTE:"NATURAL", CEMENTERIO:"Jardín Los Olivos", TIPO_DESTINO_FINAL:"INHUMACIÓN", CANTIDAD:1, "VALOR SERVICIO":3900000, "VALOR EXCEDENTE":300000}
    ].map(normalizarRegistroDashboard);
}

async function cargarDashboard(){
    try{
        const response = await fetch(SHEET_DATOS_URL, {cache:"no-store"});
        if(!response.ok) throw new Error("No se pudo leer Google Sheet");
        const csv = await response.text();
        const rows = parseCSV(csv);

        DATASET_API = rows
            .map(normalizarRegistroDashboard)
            .filter(item => item.fechaTexto || item.gestor || item.categoria);

        if(DATASET_API.length === 0) throw new Error("Google Sheet sin registros válidos");
        toast("Datos cargados correctamente.");
    }catch(error){
        console.warn(error);
        DATASET_API = datosEjemplo();
        toast("No se pudo leer el Sheet. Se cargaron datos de ejemplo.");
    }

    establecerFechasPorDefecto();
    actualizarFiltros();
    aplicarFiltrosYRender();
    setHtml("ultimaActualizacion", `Última actualización: ${new Date().toLocaleString("es-CO")}`);
}

function establecerFechasPorDefecto(){
    if($("fechaInicio")?.value && $("fechaFin")?.value) return;
    const hoy = new Date();
    setValue("fechaInicio", fechaISO(inicioMes(hoy)));
    setValue("fechaFin", fechaISO(hoy));
}

function llenarSelect(id, valores, placeholder){
    const el = $(id);
    if(!el) return;
    const actual = el.value;
    el.innerHTML = `<option value="">${placeholder}</option>` + valores.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
    if([...el.options].some(o => o.value === actual)) el.value = actual;
}

function actualizarFiltros(){
    llenarSelect("filtroGestor", valoresUnicos(DATASET_API, "gestor"), "Todos");
    llenarSelect("filtroCategoria", valoresUnicos(DATASET_API, "categoriaGerencial"), "Todas");
    llenarSelect("filtroSede", valoresUnicos(DATASET_API, "sede"), "Todas");
}

function valoresUnicos(data, campo){
    return [...new Set(data.map(item => item[campo]).filter(Boolean))]
        .sort((a,b) => String(a).localeCompare(String(b), "es"));
}

function aplicarFiltrosYRender(){
    const inicio = parseFecha($("fechaInicio")?.value);
    const fin = parseFecha($("fechaFin")?.value);
    const gestor = $("filtroGestor")?.value || "";
    const categoria = $("filtroCategoria")?.value || "";
    const sede = $("filtroSede")?.value || "";
    const busqueda = normalizarTexto($("busquedaGeneral")?.value || "");

    DATASET_FILTRADO = DATASET_API.filter(item => {
        if(inicio && item.fecha && item.fecha < inicio) return false;
        if(fin && item.fecha && item.fecha > fin) return false;
        if(gestor && item.gestor !== gestor) return false;
        if(categoria && item.categoriaGerencial !== categoria) return false;
        if(sede && item.sede !== sede) return false;
        if(busqueda){
            const texto = normalizarTexto([
                item.gestor, item.sede, item.categoria, item.servicio, item.clinica,
                item.municipio, item.tipoMuerte, item.cementerio, item.destinoFinal
            ].join(" "));
            if(!texto.includes(busqueda)) return false;
        }
        return true;
    });

    renderGeneral();
    renderMetas();
    renderCumplimiento();
    renderAnalisis();
    renderDatos();
}

function totalVenta(data){
    return data.reduce((sum, item) => sum + toNumber(item.valorVenta), 0);
}

function mesesEquivalentes(){
    const inicio = parseFecha($("fechaInicio")?.value) || inicioMes(new Date());
    const fin = parseFecha($("fechaFin")?.value) || new Date();
    const dias = Math.max(1, Math.round((fin - inicio) / 86400000) + 1);
    return dias / 30;
}

function metaRango(){
    return PARAMETROS.metaMensual * mesesEquivalentes();
}

function agrupar(data, campo, usarCantidad = false){
    const mapa = {};
    data.forEach(item => {
        const key = limpiarTextoDato(item[campo]);
        if(!mapa[key]) mapa[key] = {nombre:key, cantidad:0, valor:0};
        mapa[key].cantidad += toNumber(item.cantidad || 1);
        mapa[key].valor += usarCantidad ? toNumber(item.cantidad || 1) : toNumber(item.valorVenta || 0);
    });
    return Object.values(mapa).sort((a,b) => b.valor - a.valor);
}

function agruparDimension(data, campo){
    const total = data.length || 1;
    return agrupar(data, campo, true)
        .map(item => ({
            ...item,
            porcentaje: (item.cantidad / total) * 100,
            valor: data
                .filter(row => limpiarTextoDato(row[campo]) === item.nombre)
                .reduce((sum, row) => sum + toNumber(row.valorVenta), 0)
        }))
        .sort((a,b) => b.cantidad - a.cantidad);
}

function chart(id, type, labels, datasets, options = {}){
    const ctx = $(id);
    if(!ctx || typeof Chart === "undefined") return;
    if(charts[id]) charts[id].destroy();

    charts[id] = new Chart(ctx, {
        type,
        data: {labels, datasets},
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {labels: {color: getComputedStyle(document.body).getPropertyValue("--text")}},
                tooltip: {
                    callbacks: {
                        label: context => `${context.dataset.label || ""}: ${formatMoney(context.raw)}`
                    }
                }
            },
            scales: type === "doughnut" || type === "pie" ? {} : {
                x: {ticks: {color: getComputedStyle(document.body).getPropertyValue("--text")}},
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: getComputedStyle(document.body).getPropertyValue("--text"),
                        callback: value => formatMoney(value)
                    }
                }
            },
            ...options
        }
    });
}

function renderGeneral(){
    const venta = totalVenta(DATASET_FILTRADO);
    const meta = metaRango();
    const pct = meta > 0 ? (venta / meta) * 100 : 0;

    setHtml("kpiMeta", formatMoney(meta));
    setHtml("kpiMetaDetalle", `Equivalente a ${mesesEquivalentes().toFixed(1)} meses`);
    setHtml("kpiVenta", formatMoney(venta));
    setHtml("kpiVentaPct", `${pct.toFixed(1)}% cumplido`);
    setHtml("kpiFaltante", formatMoney(Math.max(meta - venta, 0)));
    setHtml("kpiServicios", formatNumber(DATASET_FILTRADO.length));

    const categorias = agrupar(DATASET_FILTRADO, "categoriaGerencial");
    chart("graficoCategorias", "bar", categorias.map(x => x.nombre), [{
        label: "Venta",
        data: categorias.map(x => x.valor),
        backgroundColor: "#00a86b"
    }]);

    const gestores = agrupar(DATASET_FILTRADO, "gestor").slice(0, 10);
    chart("graficoGestores", "bar", gestores.map(x => x.nombre), [{
        label: "Venta",
        data: gestores.map(x => x.valor),
        backgroundColor: "#08784e"
    }], {indexAxis:"y"});
}

function metaCategoria(nombre){
    return PARAMETROS.categoria[normalizarCategoriaGerencial(nombre)] || 0;
}

function metaGestor(nombre){
    return PARAMETROS.gestor[normalizarTexto(nombre)] || 0;
}

function renderMetas(){
    const produccionCategoria = agrupar(DATASET_FILTRADO, "categoriaGerencial");
    const labelsCat = ["PARTICULAR", "RED", "EXCEDENTES"];
    chart("graficoMetaCategoria", "bar", labelsCat, [
        {
            label: "Producido",
            data: labelsCat.map(cat => (produccionCategoria.find(x => x.nombre === cat)?.valor || 0)),
            backgroundColor: "#00a86b"
        },
        {
            label: "Meta",
            data: labelsCat.map(cat => metaCategoria(cat) * mesesEquivalentes()),
            backgroundColor: "#ffd166"
        }
    ]);

    const labelsGestor = Object.keys(PARAMETROS.gestor).map(nombre => nombreGestorCompleto(nombre));
    const producidoGestor = agrupar(DATASET_FILTRADO, "gestor");
    chart("graficoMetaGestor", "bar", labelsGestor, [
        {
            label: "Producido",
            data: labelsGestor.map(nombre => producidoGestor.find(x => normalizarTexto(x.nombre) === normalizarTexto(nombre))?.valor || 0),
            backgroundColor: "#08784e"
        },
        {
            label: "Meta",
            data: labelsGestor.map(nombre => metaGestor(nombre) * mesesEquivalentes()),
            backgroundColor: "#ffd166"
        }
    ], {indexAxis:"y"});
}

function renderCumplimiento(){
    const venta = totalVenta(DATASET_FILTRADO);
    const meta = metaRango();
    const pct = meta > 0 ? (venta / meta) * 100 : 0;

    setHtml("cumplimientoTotal", `${pct.toFixed(1)}%`);
    setHtml("cumplimientoTotalValor", `${formatMoney(venta)} / ${formatMoney(meta)}`);

    ["PARTICULAR", "RED", "EXCEDENTES"].forEach(cat => {
        const valor = DATASET_FILTRADO
            .filter(item => item.categoriaGerencial === cat)
            .reduce((sum, item) => sum + toNumber(item.valorVenta), 0);
        const metaCat = metaCategoria(cat) * mesesEquivalentes();
        const pctCat = metaCat > 0 ? (valor / metaCat) * 100 : 0;
        const key = cat === "EXCEDENTES" ? "Excedentes" : cat.charAt(0) + cat.slice(1).toLowerCase();
        setHtml(`cumplimiento${key}`, `${pctCat.toFixed(1)}%`);
        setHtml(`cumplimiento${key}Valor`, `${formatMoney(valor)} / ${formatMoney(metaCat)}`);
    });

    chart("graficoCumplimiento", "bar", ["Meta", "Venta", "Faltante"], [{
        label: "Valor",
        data: [meta, venta, Math.max(meta - venta, 0)],
        backgroundColor: ["#ffd166", "#00a86b", "#ef476f"]
    }]);
}

function renderTablaDimension(idTabla, data){
    const tbody = document.querySelector(`#${idTabla} tbody`);
    if(!tbody) return;

    if(!data.length){
        tbody.innerHTML = `<tr><td colspan="4">Sin información disponible</td></tr>`;
        return;
    }

    tbody.innerHTML = data.slice(0, 12).map(item => `
        <tr>
            <td>${escapeHtml(item.nombre)}</td>
            <td>${formatNumber(item.cantidad)}</td>
            <td>${item.porcentaje.toFixed(1)}%</td>
            <td>${formatMoney(item.valor)}</td>
        </tr>
    `).join("");
}

function renderAnalisis(){
    renderTablaDimension("tablaTipoHomenaje", agruparDimension(DATASET_FILTRADO, "categoria"));
    renderTablaDimension("tablaClinicas", agruparDimension(DATASET_FILTRADO, "clinica"));
    renderTablaDimension("tablaMunicipios", agruparDimension(DATASET_FILTRADO, "municipio"));
    renderTablaDimension("tablaTipoMuerte", agruparDimension(DATASET_FILTRADO, "tipoMuerte"));
    renderTablaDimension("tablaCementerios", agruparDimension(DATASET_FILTRADO, "cementerio"));
    renderTablaDimension("tablaDestinoFinal", agruparDimension(DATASET_FILTRADO, "destinoFinal"));
}

function renderDatos(){
    const tbody = document.querySelector("#tablaDatos tbody");
    if(!tbody) return;

    tbody.innerHTML = DATASET_FILTRADO.slice(0, 200).map(item => `
        <tr>
            <td>${escapeHtml(item.fechaTexto)}</td>
            <td>${escapeHtml(item.gestor)}</td>
            <td>${escapeHtml(item.sede)}</td>
            <td>${escapeHtml(item.categoria)}</td>
            <td>${escapeHtml(item.tipoExcedente)}</td>
            <td>${escapeHtml(item.clinica)}</td>
            <td>${escapeHtml(item.cementerio)}</td>
            <td>${formatMoney(item.valorVenta)}</td>
        </tr>
    `).join("") || `<tr><td colspan="8">Sin datos</td></tr>`;
}

function datosOperacionesIniciales(){
    return [
        {id:"op1", vehiculo:"KIA MHK 965", tipo:"Vencimiento SOAT", fecha:"2026-07-10", responsable:"Coordinación", estado:"PENDIENTE"},
        {id:"op2", vehiculo:"FUS 480", tipo:"Cambio de aceite", fecha:"2026-06-28", responsable:"Mantenimiento", estado:"EN PROCESO"},
        {id:"op3", vehiculo:"KVR 436", tipo:"Vencimiento tecnomecánica", fecha:"2026-07-15", responsable:"Parque automotor", estado:"PENDIENTE"},
        {id:"op4", vehiculo:"Parque Cementerio", tipo:"Mantenimiento de jardinería", fecha:"2026-06-25", responsable:"Servicios generales", estado:"PENDIENTE"},
        {id:"op5", vehiculo:"Infraestructura salas", tipo:"Mantenimiento pintura infraestructura", fecha:"2026-07-05", responsable:"Mantenimiento", estado:"PENDIENTE"},
        {id:"op6", vehiculo:"Cafetería", tipo:"Mantenimiento filtros cafetería", fecha:"2026-06-30", responsable:"Servicios generales", estado:"PENDIENTE"}
    ];
}

function cargarOperaciones(){
    return JSON.parse(localStorage.getItem("operacionesDashboard") || JSON.stringify(datosOperacionesIniciales()));
}

function guardarOperaciones(data){
    localStorage.setItem("operacionesDashboard", JSON.stringify(data));
}

function badgeEstado(estado){
    const e = normalizarTexto(estado);
    if(e === "FINIQUITADA" || e === "CUMPLIDA" || e === "DISFRUTADA") return `<span class="badge badge-ok">${escapeHtml(estado)}</span>`;
    if(e === "EN PROCESO" || e === "PROGRAMADA") return `<span class="badge badge-info">${escapeHtml(estado)}</span>`;
    if(e === "VENCIDA") return `<span class="badge badge-danger">${escapeHtml(estado)}</span>`;
    return `<span class="badge badge-warning">${escapeHtml(estado)}</span>`;
}

function diasHasta(fecha){
    const f = parseFecha(fecha);
    if(!f) return "";
    return Math.ceil((f - new Date()) / 86400000);
}

function renderOperaciones(){
    const tbody = document.querySelector("#tablaOperaciones tbody");
    if(!tbody) return;
    const data = cargarOperaciones();

    tbody.innerHTML = data.map(item => {
        const dias = diasHasta(item.fecha);
        const alerta = dias <= 10 && dias >= 0 ? ` ⚠️ Alerta ${dias} días` : dias < 0 ? "Vencido" : `${dias} días`;
        return `
            <tr>
                <td>${escapeHtml(item.vehiculo)}</td>
                <td>${escapeHtml(item.tipo)}</td>
                <td>${escapeHtml(item.fecha)}</td>
                <td>${alerta}</td>
                <td>${escapeHtml(item.responsable)}</td>
                <td>${badgeEstado(item.estado)}</td>
                <td><button onclick="eliminarOperacion('${item.id}')">Eliminar</button></td>
            </tr>
        `;
    }).join("");
}

function agregarOperacion(){
    const data = cargarOperaciones();
    data.push({
        id: cryptoRandom(),
        vehiculo: $("opVehiculo")?.value || "",
        tipo: $("opTipo")?.value || "",
        fecha: $("opFecha")?.value || "",
        responsable: $("opResponsable")?.value || "",
        estado: $("opEstado")?.value || "PENDIENTE"
    });
    guardarOperaciones(data);
    renderOperaciones();
    toast("Operación agregada.");
}

function eliminarOperacion(id){
    guardarOperaciones(cargarOperaciones().filter(item => item.id !== id));
    renderOperaciones();
}

window.eliminarOperacion = eliminarOperacion;

function datosAgendaIniciales(){
    const y = new Date().getFullYear();
    return [
        {id:"a1", fecha:`${y}-06-20`, hora:"06:00", titulo:"Revisión preoperacional vehículos", responsable:"Conductores", estado:"PENDIENTE"},
        {id:"a2", fecha:`${y}-06-20`, hora:"08:00", titulo:"Validar bitácora parque automotor", responsable:"Coordinación", estado:"EN PROCESO"},
        {id:"a3", fecha:`${y}-06-20`, hora:"10:00", titulo:"Seguimiento implementos velación en casa", responsable:"Gestores", estado:"CUMPLIDA"},
        {id:"a4", fecha:`${y}-06-21`, hora:"07:00", titulo:"Control RH1 y limpieza", responsable:"Laboratorio", estado:"PENDIENTE"},
        {id:"a5", fecha:`${y}-07-01`, hora:"14:00", titulo:"Capacitación brigadas de emergencia", responsable:"Talento Humano", estado:"PENDIENTE"},
        {id:"a6", fecha:`${y}-11-10`, hora:"09:00", titulo:"Preparación auditoría interna", responsable:"Mejora continua", estado:"PENDIENTE"}
    ];
}

function cargarAgenda(){
    return JSON.parse(localStorage.getItem("agendaDashboard") || JSON.stringify(datosAgendaIniciales()));
}

function guardarAgenda(data){
    localStorage.setItem("agendaDashboard", JSON.stringify(data));
}

function nombreMes(mes){
    return ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][mes - 1];
}

function renderAgenda(){
    const data = cargarAgenda();
    const anio = AGENDA_CURSOR.getFullYear();
    const mes = AGENDA_CURSOR.getMonth() + 1;
    setHtml("agendaMesTitulo", `${nombreMes(mes)} ${anio}`);
    renderCalendarioAgenda(data, anio, mes);
    renderDiaAgenda(fechaISO(new Date()));
}

function renderCalendarioAgenda(data, anio, mes){
    const contenedor = $("agendaCalendario");
    if(!contenedor) return;
    const primerDia = new Date(anio, mes - 1, 1);
    const ultimoDia = new Date(anio, mes, 0);
    const inicioSemana = (primerDia.getDay() + 6) % 7;
    const totalDias = ultimoDia.getDate();
    const hoy = fechaISO(new Date());
    const celdas = [];

    ["L","M","M","J","V","S","D"].forEach(d => celdas.push(`<div class="agenda-weekday">${d}</div>`));
    for(let i = 0; i < inicioSemana; i++) celdas.push(`<div class="agenda-day empty"></div>`);

    for(let dia = 1; dia <= totalDias; dia++){
        const iso = fechaISO(new Date(anio, mes - 1, dia));
        const eventos = data.filter(x => x.fecha === iso);
        celdas.push(`
            <div class="agenda-day ${iso === hoy ? "today" : ""} ${eventos.length ? "has-events" : ""}" onclick="renderDiaAgenda('${iso}')">
                <strong>${dia}</strong>
                ${eventos.length ? `<br><span>${eventos.length} act.</span>` : ""}
            </div>
        `);
    }
    contenedor.innerHTML = celdas.join("");
}

function renderDiaAgenda(fecha){
    const contenedor = $("agendaDiaDetalle");
    if(!contenedor) return;
    setHtml("agendaDiaTitulo", `Detalle del día: ${fecha}`);
    const eventos = cargarAgenda().filter(item => item.fecha === fecha);
    const horas = [];
    for(let h = 6; h <= 20; h++){
        const hora = `${String(h).padStart(2, "0")}:00`;
        const eventosHora = eventos.filter(e => String(e.hora || "").startsWith(String(h).padStart(2, "0")));
        horas.push(`
            <div class="time-row">
                <strong>${hora}</strong>
                <div>
                    ${eventosHora.length ? eventosHora.map(e => `
                        <div class="time-event">
                            <b>${escapeHtml(e.titulo)}</b><br>
                            ${escapeHtml(e.responsable || "Sin responsable")} · ${badgeEstado(e.estado)}
                        </div>
                    `).join("") : `<span class="mini-text">Sin actividad</span>`}
                </div>
            </div>
        `);
    }
    contenedor.innerHTML = horas.join("");
}

window.renderDiaAgenda = renderDiaAgenda;

function agregarActividad(){
    const data = cargarAgenda();
    data.push({
        id: cryptoRandom(),
        fecha: $("actFecha")?.value || fechaISO(new Date()),
        hora: $("actHora")?.value || "08:00",
        titulo: $("actTitulo")?.value || "Actividad sin título",
        responsable: $("actResponsable")?.value || "",
        estado: $("actEstado")?.value || "PENDIENTE"
    });
    guardarAgenda(data);
    renderAgenda();
    toast("Actividad agregada.");
}

function moverAgenda(meses){
    AGENDA_CURSOR = new Date(AGENDA_CURSOR.getFullYear(), AGENDA_CURSOR.getMonth() + meses, 1);
    renderAgenda();
}

function datosVacacionesIniciales(){
    return [
        {id:"v1", nombre:"Raúl López", cargo:"Conductor Tanatopractor", fechaBase:"2025-04-15", inicio:"", fin:"", dias:15, estado:"PENDIENTE"},
        {id:"v2", nombre:"Javier Mendoza", cargo:"Conductor Tanatopractor", fechaBase:"2025-07-02", inicio:"2026-07-02", fin:"2026-07-21", dias:15, estado:"PROGRAMADA"},
        {id:"v3", nombre:"Wendy Cordero", cargo:"Gestora de Protocolo", fechaBase:"2025-05-20", inicio:"2026-05-05", fin:"2026-05-24", dias:15, estado:"DISFRUTADA"},
        {id:"v4", nombre:"Óscar Tordecilla", cargo:"Conductor Tanatopractor", fechaBase:"2025-03-10", inicio:"", fin:"", dias:15, estado:"VENCIDA"}
    ];
}

function cargarVacaciones(){
    return JSON.parse(localStorage.getItem("vacacionesDashboard") || JSON.stringify(datosVacacionesIniciales()));
}

function guardarVacaciones(data){
    localStorage.setItem("vacacionesDashboard", JSON.stringify(data));
}

function renderVacaciones(){
    const tbody = document.querySelector("#tablaVacaciones tbody");
    if(!tbody) return;
    const data = cargarVacaciones();
    tbody.innerHTML = data.map(item => `
        <tr>
            <td>${escapeHtml(item.nombre)}</td>
            <td>${escapeHtml(item.cargo)}</td>
            <td>${escapeHtml(item.fechaBase)}</td>
            <td>${escapeHtml(item.inicio || "-")}</td>
            <td>${escapeHtml(item.fin || "-")}</td>
            <td>${formatNumber(item.dias)}</td>
            <td>
                <select onchange="cambiarEstadoVacacion('${item.id}', this.value)">
                    ${["PENDIENTE","PROGRAMADA","DISFRUTADA","VENCIDA"].map(e => `<option ${e === item.estado ? "selected" : ""}>${e}</option>`).join("")}
                </select>
            </td>
            <td><button onclick="eliminarVacacion('${item.id}')">Eliminar</button></td>
        </tr>
    `).join("");
}

function agregarVacacion(){
    const data = cargarVacaciones();
    data.push({
        id: cryptoRandom(),
        nombre: $("vacNombre")?.value || "",
        cargo: $("vacCargo")?.value || "",
        fechaBase: $("vacFechaBase")?.value || "",
        inicio: $("vacInicio")?.value || "",
        fin: $("vacFin")?.value || "",
        dias: toNumber($("vacDias")?.value || 0),
        estado: $("vacEstado")?.value || "PENDIENTE"
    });
    guardarVacaciones(data);
    renderVacaciones();
    toast("Vacación agregada.");
}

function cambiarEstadoVacacion(id, estado){
    const data = cargarVacaciones().map(item => item.id === id ? {...item, estado} : item);
    guardarVacaciones(data);
    renderVacaciones();
}

function eliminarVacacion(id){
    guardarVacaciones(cargarVacaciones().filter(item => item.id !== id));
    renderVacaciones();
}

window.cambiarEstadoVacacion = cambiarEstadoVacacion;
window.eliminarVacacion = eliminarVacacion;

function cryptoRandom(){
    return "id_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function aplicarRangoRapido(rango){
    const hoy = new Date();
    let inicio = hoy;
    if(rango === "mes") inicio = inicioMes(hoy);
    if(rango === "trimestre") inicio = inicioTrimestre(hoy);
    if(rango === "anio") inicio = inicioAnio(hoy);
    setValue("fechaInicio", fechaISO(inicio));
    setValue("fechaFin", fechaISO(hoy));
    aplicarFiltrosYRender();
}

function limpiarFiltros(){
    ["filtroGestor", "filtroCategoria", "filtroSede", "busquedaGeneral"].forEach(id => setValue(id, ""));
    setValue("fechaInicio", fechaISO(inicioMes(new Date())));
    setValue("fechaFin", fechaISO(new Date()));
    aplicarFiltrosYRender();
}

function cambiarVista(seccion){
    document.querySelectorAll(".menu-item").forEach(item => item.classList.remove("active"));
    document.querySelectorAll(".vista").forEach(vista => vista.classList.remove("active-view"));
    document.querySelector(`.menu-item[data-seccion="${seccion}"]`)?.classList.add("active");
    $(seccion)?.classList.add("active-view");
    setTimeout(() => Object.values(charts).forEach(c => c?.resize?.()), 180);
}

function guardarConfig(){
    localStorage.setItem("dashboardTitulo", $("configTitulo")?.value || "");
    localStorage.setItem("dashboardSubtitulo", $("configSubtitulo")?.value || "");
    localStorage.setItem("dashboardEmpresa", $("configEmpresa")?.value || "");
    localStorage.setItem("dashboardResponsable", $("configResponsable")?.value || "");
    localStorage.setItem("dashboardLogoUrl", $("configLogoUrl")?.value || "");
    PARAMETROS.metaMensual = toNumber($("configMetaMensual")?.value || PARAMETROS.metaMensual);
    localStorage.setItem("metaMensualBase", String(PARAMETROS.metaMensual));
    actualizarConfiguracion();
    aplicarFiltrosYRender();
    toast("Configuración guardada.");
}

function actualizarConfiguracion(){
    const titulo = localStorage.getItem("dashboardTitulo") || "Dashboard Gerencial Homenajes";
    const subtitulo = localStorage.getItem("dashboardSubtitulo") || "Ventas, cumplimiento, operación y análisis estratégico";
    const empresa = localStorage.getItem("dashboardEmpresa") || "Los Olivos";
    const logo = localStorage.getItem("dashboardLogoUrl") || "";

    setHtml("tituloDashboard", titulo);
    setHtml("subtituloDashboard", subtitulo);
    setHtml("sidebarEmpresa", empresa);
    setValue("configTitulo", titulo);
    setValue("configSubtitulo", subtitulo);
    setValue("configEmpresa", empresa);
    setValue("configResponsable", localStorage.getItem("dashboardResponsable") || "Jorge Korfan");
    setValue("configLogoUrl", logo);
    setValue("configMetaMensual", PARAMETROS.metaMensual);

    ["sidebarLogo", "logoTopbar"].forEach(id => {
        const img = $(id);
        if(!img) return;
        if(logo){
            img.src = logo;
            img.style.display = "block";
        }else{
            img.style.display = "none";
        }
    });
}

function exportarCSV(){
    const headers = ["Fecha","Gestor","Sede","Tipo_Homenaje","Tipo_Excedente","Clinica","Municipio","Tipo_Muerte","Cementerio","Destino_Final","Valor"];
    const rows = DATASET_FILTRADO.map(item => [item.fechaTexto,item.gestor,item.sede,item.categoria,item.tipoExcedente,item.clinica,item.municipio,item.tipoMuerte,item.cementerio,item.destinoFinal,item.valorVenta]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    descargarArchivo("dashboard_homenajes.csv", csv, "text/csv;charset=utf-8;");
}

function exportarJSON(){
    descargarArchivo("backup_dashboard_homenajes.json", JSON.stringify({
        fecha: new Date().toISOString(),
        datos: DATASET_FILTRADO,
        operaciones: cargarOperaciones(),
        agenda: cargarAgenda(),
        vacaciones: cargarVacaciones()
    }, null, 2), "application/json;charset=utf-8;");
}

function exportarExcel(){
    if(typeof XLSX === "undefined"){
        toast("No está disponible la librería Excel.");
        return;
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DATASET_FILTRADO), "Datos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cargarOperaciones()), "Operaciones");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cargarAgenda()), "Agenda");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cargarVacaciones()), "Vacaciones");
    XLSX.writeFile(wb, "dashboard_homenajes.xlsx");
}

function descargarArchivo(nombre, contenido, tipo){
    const blob = new Blob([contenido], {type: tipo});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function activarDestelloGlobalDashboard(){
    if(window.__DESTELLO_GLOBAL_DASHBOARD_ACTIVO__) return;
    window.__DESTELLO_GLOBAL_DASHBOARD_ACTIVO__ = true;

    document.addEventListener("click", event => {
        if(event.target.closest(".dashboard-star-click-effect, .no-star-effect")) return;

        const estrella = document.createElement("span");
        estrella.className = "dashboard-star-click-effect";
        estrella.style.left = `${event.clientX}px`;
        estrella.style.top = `${event.clientY}px`;
        document.body.appendChild(estrella);
        setTimeout(() => estrella.remove(), 1000);

        const brillo = event.target.closest(".menu-item, button, .kpi-card, .chart-card, .table-card, .form-card, .calendar-card, .day-card");
        if(brillo){
            brillo.classList.remove("dashboard-click-glow");
            void brillo.offsetWidth;
            brillo.classList.add("dashboard-click-glow");
            setTimeout(() => brillo.classList.remove("dashboard-click-glow"), 820);
        }
    }, true);
}

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", () => cambiarVista(item.dataset.seccion));
    });

    document.querySelectorAll(".quick-btn").forEach(btn => {
        btn.addEventListener("click", () => aplicarRangoRapido(btn.dataset.rango));
    });

    $("btnFiltrar")?.addEventListener("click", aplicarFiltrosYRender);
    $("btnLimpiar")?.addEventListener("click", limpiarFiltros);
    $("btnRecargar")?.addEventListener("click", cargarDashboard);
    $("btnSidebar")?.addEventListener("click", () => document.body.classList.toggle("sidebar-collapsed"));
    $("btnTemaAgua")?.addEventListener("click", () => document.body.className = document.body.className.replace(/theme-sunset|theme-dark/g, ""));
    $("btnTemaAtardecer")?.addEventListener("click", () => {
        document.body.classList.remove("theme-dark");
        document.body.classList.add("theme-sunset");
    });
    $("btnTemaOscuro")?.addEventListener("click", () => {
        document.body.classList.remove("theme-sunset");
        document.body.classList.add("theme-dark");
    });

    $("btnAgregarOperacion")?.addEventListener("click", agregarOperacion);
    $("btnAgregarActividad")?.addEventListener("click", agregarActividad);
    $("btnAgendaAnterior")?.addEventListener("click", () => moverAgenda(-1));
    $("btnAgendaSiguiente")?.addEventListener("click", () => moverAgenda(1));
    $("btnAgregarVacacion")?.addEventListener("click", agregarVacacion);
    $("btnGuardarConfig")?.addEventListener("click", guardarConfig);
    $("btnCSV")?.addEventListener("click", exportarCSV);
    $("btnJSON")?.addEventListener("click", exportarJSON);
    $("btnExcel")?.addEventListener("click", exportarExcel);

    ["filtroGestor", "filtroCategoria", "filtroSede"].forEach(id => {
        $(id)?.addEventListener("change", aplicarFiltrosYRender);
    });

    $("busquedaGeneral")?.addEventListener("keyup", event => {
        if(event.key === "Enter") aplicarFiltrosYRender();
    });

    activarDestelloGlobalDashboard();
    actualizarConfiguracion();
    renderOperaciones();
    renderAgenda();
    renderVacaciones();
    cargarDashboard();
});
