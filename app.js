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
excedentesConfig.forEach(fila => {

    if (fila[0] === "META_EXCEDENTE") {

        METAS_EXCEDENTES[fila[1]] = Number(fila[2]);

    }

});
parametros.forEach(fila => {

    if (fila[0] === "SEDE") {
        META_GRUPAL = Number(fila[2]) || 0;
    }

    if (fila[0] === "META_CATEGORIA" && fila[1] === "RED") {
        META_RED = Number(fila[2]) || 0;
    }

    if (fila[0] === "META_CATEGORIA" && fila[1] === "PARTICULAR") {
        META_PARTICULAR = Number(fila[2]) || 0;
    }

    if (fila[0] === "META_CATEGORIA" && fila[1] === "EXCEDENTES") {
        META_EXCEDENTES = Number(fila[2]) || 0;
    }

});

    const homenajes = json.homenajes || [];

    let ventaTotal = 0;
    let ventaRed = 0;
    let ventaParticular = 0;
    let ventaExcedentes = 0;

    homenajes.forEach(item => {

        const valor = Number(item.Valor || 0);

        ventaTotal += valor;

        const tipo = String(item.Tipo_Homenaje || "")
            .toUpperCase()
            .trim();

        if (tipo === "RED") {
            ventaRed += valor;
        }

        if (tipo === "PARTICULAR") {
            ventaParticular += valor;
        }

        const excedente = String(item.Tipo_Excedente || "")
            .toUpperCase()
            .trim();

        if (
            excedente &&
            excedente !== "PENSIONADO" &&
            excedente !== "SOAT"
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
cargarDashboard();
}

function actualizarKPIs(
    ventaTotal,
    ventaRed,
    ventaParticular,
    ventaExcedentes
) {

    const cumplimientoGeneral =
        ((ventaTotal / META_GRUPAL) * 100).toFixed(1);

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

cargarDashboard();
function crearTablaCumplimiento(
    ventaRed,
    ventaParticular,
    ventaExcedentes
){

const tbody =
document.querySelector("#tablaCumplimiento tbody");

if(!tbody) return;

tbody.innerHTML="";

const datos=[

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
((item.real/item.meta)*100).toFixed(1);

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

function crearTablaExcedentes(homenajes){

const tbody =
document.querySelector("#tablaExcedentes tbody");

if(!tbody) return;

tbody.innerHTML = "";

let reales = {};

homenajes.forEach(item=>{

const excedente =
String(item.Tipo_Excedente || "")
.toUpperCase()
.trim();

if(
!excedente ||
excedente==="SOAT" ||
excedente==="PENSIONADO"
){
return;
}

const valor =
Number(item.Valor || 0);

reales[excedente] =
(reales[excedente] || 0) + valor;

});

Object.keys(METAS_EXCEDENTES).forEach(nombre=>{

const meta =
Number(METAS_EXCEDENTES[nombre] || 0);

const real =
Number(reales[nombre] || 0);

const porcentaje =
meta > 0
? ((real/meta)*100).toFixed(1)
: 0;

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

cargarDashboard();
