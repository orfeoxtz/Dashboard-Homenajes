const API_URL =
"https://script.google.com/macros/s/AKfycbxEyu57a5spnJNju9t4654U8SDBrWFWQ0GWLibubGy5ntZsOV3N-TeL73423-a23j6FwA/exec";

let META_GRUPAL = 0;
let META_RED = 0;
let META_PARTICULAR = 0;
let META_EXCEDENTES = 0;

let METAS_EXCEDENTES = {};

async function cargarDashboard() {

    const response = await fetch(API_URL);
    const json = await response.json();

    const parametros = json.parametros || [];
    const excedentesConfig = json.excedentes || [];
    const homenajes = json.homenajes || [];
    let homenajesFiltrados = [...homenajes];

const fechaInicio =
document.getElementById("fechaInicio")?.value;

const fechaFin =
document.getElementById("fechaFin")?.value;

if(fechaInicio && fechaFin){

    homenajesFiltrados =
    homenajes.filter(item=>{

        const fecha =
        new Date(item.Fecha);

        return fecha >= new Date(fechaInicio)
        && fecha <= new Date(fechaFin);

    });

}

METAS_EXCEDENTES = {};

excedentesConfig.forEach((fila,index) => {

    if(index === 0) return;

    const nombre =
    String(fila[0] || "")
    .trim()
    .toUpperCase();

    const meta =
    Number(fila[1]) || 0;

    if(nombre){
        METAS_EXCEDENTES[nombre] = meta;
    }

});

console.log("METAS_EXCEDENTES:", METAS_EXCEDENTES);

parametros.forEach(fila => {

    if (fila[0] === "SEDE") {
        META_GRUPAL = Number(fila[2]) || 0;
    }

    if (
        fila[0] === "META_CATEGORIA" &&
        String(fila[1]).toUpperCase() === "RED"
    ) {
        META_RED = Number(fila[2]) || 0;
    }

    if (
        fila[0] === "META_CATEGORIA" &&
        String(fila[1]).toUpperCase() === "PARTICULAR"
    ) {
        META_PARTICULAR = Number(fila[2]) || 0;
    }

    if (
        fila[0] === "META_CATEGORIA" &&
        String(fila[1]).toUpperCase() === "EXCEDENTES"
    ) {
        META_EXCEDENTES = Number(fila[2]) || 0;
    }

});

    let ventaTotal = 0;
    let ventaRed = 0;
    let ventaParticular = 0;
    let ventaExcedentes = 0;

    homenajes.forEach(item => {

        const valor = Number(item.Valor || 0);

        ventaTotal += valor;

        const tipo =
            String(item.Tipo_Homenaje || "")
            .toUpperCase()
            .trim();

        const excedente =
            String(item.Tipo_Excedente || "")
            .toUpperCase()
            .trim();

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
    homenajes
);

llenarParticulares(
    homenajes
);
crearGraficoIngresos(
    ventaRed,
    ventaParticular,
    ventaExcedentes
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
        : 0;

    const faltante =
        META_GRUPAL - ventaTotal;

    document.getElementById("ventas").innerHTML =
        "$" + ventaTotal.toLocaleString("es-CO");

    document.getElementById("cumplimiento").innerHTML =
        cumplimientoGeneral + "%";

    document.getElementById("faltante").innerHTML =
        "$" + faltante.toLocaleString("es-CO");

    document.getElementById("proyeccion").innerHTML =
        cumplimientoGeneral + "%";

    document.getElementById("ultimaActualizacion").innerHTML =
        new Date().toLocaleString("es-CO");

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

    const canvas =
        document.getElementById("ventasCategoria");

    if (!canvas) return;

    new Chart(canvas, {

        type: "bar",

        data: {

            labels: [
                "RED",
                "PARTICULAR",
                "EXCEDENTES"
            ],

            datasets: [

                {
                    label: "Meta",
                    data: [
                        META_RED,
                        META_PARTICULAR,
                        META_EXCEDENTES
                    ]
                },

                {
                    label: "Real",
                    data: [
                        ventaRed,
                        ventaParticular,
                        ventaExcedentes
                    ]
                }

            ]

        },

        options: {

            responsive: true,

            plugins: {

                title: {
                    display: true,
                    text: "Meta vs Real"
                }

            }

        }

    });

}

function crearTablaExcedentes(homenajes) {

    const tbody =
    document.querySelector("#tablaExcedentes tbody");

    if (!tbody) {
        console.log("No existe tablaExcedentes");
        return;
    }

    tbody.innerHTML = "";

    let reales = {};

    homenajes.forEach(item => {

        const excedente =
        String(item.Tipo_Excedente || "")
        .toUpperCase()
        .trim();

        if (
            excedente === "" ||
            excedente === "SOAT" ||
            excedente === "PENSIONADO"
        ) {
            return;
        }

        const valor =
        Number(item.Valor || 0);

        reales[excedente] =
        (reales[excedente] || 0) + valor;

    });

    console.log("METAS_EXCEDENTES:", METAS_EXCEDENTES);
    console.log("REALES:", reales);

    for (const nombre in METAS_EXCEDENTES) {

        const meta =
        Number(METAS_EXCEDENTES[nombre]) || 0;

        const real =
        Number(reales[nombre]) || 0;

        const porcentaje =
        meta > 0
        ? ((real / meta) * 100).toFixed(1)
        : "0.0";

        const fila = `
        <tr>
            <td>${nombre}</td>
            <td>$${meta.toLocaleString("es-CO")}</td>
            <td>$${real.toLocaleString("es-CO")}</td>
            <td>${porcentaje}%</td>
        </tr>
        `;

        tbody.innerHTML += fila;
    }

}  
function crearTablaCumplimiento(
    ventaRed,
    ventaParticular,
    ventaExcedentes
){

const tbody =
document.querySelector("#tablaCumplimiento tbody");

if(!tbody) return;

tbody.innerHTML = "";

const datos = [

{
nombre:"RED",
meta:META_RED,
real:ventaRed
},

{
nombre:"PARTICULAR",
meta:META_PARTICULAR,
real:ventaParticular
},

{
nombre:"EXCEDENTES",
meta:META_EXCEDENTES,
real:ventaExcedentes
}

];

datos.forEach(item=>{

const porcentaje =
item.meta > 0
? ((item.real/item.meta)*100).toFixed(1)
: 0;

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

function llenarParticulares(homenajes){

const tbody =
document.querySelector("#tablaParticulares tbody");

if(!tbody) return;

tbody.innerHTML = "";

let soat = 0;
let pensionado = 0;
let planes = 0;

homenajes.forEach(item=>{

const tipo =
String(item.Tipo_Homenaje || "")
.toUpperCase()
.trim();

const excedente =
String(item.Tipo_Excedente || "")
.toUpperCase()
.trim();

const cantidad =
Number(item.Cantidad || 1);

if(tipo === "PLAN"){
planes += cantidad;
}

if(excedente === "SOAT"){
soat += cantidad;
}

if(excedente === "PENSIONADO"){
pensionado += cantidad;
}

});

const total =
soat + pensionado + planes;

[
["SOAT", soat],
["PENSIONADO", pensionado],
["PLANES", planes]
].forEach(item=>{

const porcentaje =
total > 0
? ((item[1]/total)*100).toFixed(1)
: 0;

tbody.innerHTML += `
<tr>
<td>${item[0]}</td>
<td>${item[1]}</td>
<td>${porcentaje}%</td>
</tr>
`;

});

} // ← termina llenarParticulares


function crearGraficoIngresos(
    ventaRed,
    ventaParticular,
    ventaExcedentes
){

const canvas =
document.getElementById("composicionIngresos");

if(!canvas) return;

new Chart(canvas,{

type:"pie",

data:{

labels:[
"RED",
"PARTICULAR",
"EXCEDENTES"
],

datasets:[{
data:[
ventaRed,
ventaParticular,
ventaExcedentes
]
}]

},

options:{
responsive:true,
plugins:{
title:{
display:true,
text:"Composición de Ingresos"
}
}
}

});

} // ← termina crearGraficoIngresos


cargarDashboard();
