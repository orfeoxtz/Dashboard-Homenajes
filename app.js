const API_URL =
"https://script.google.com/macros/s/AKfycbxEyu57a5spnJNju9t4654U8SDBrWFWQ0GWLibubGy5ntZsOV3N-TeL73423-a23j6FwA/exec";

let META_GRUPAL = 219133881;
let META_RED = 127371072;
let META_PARTICULAR = 69090369;
let META_EXCEDENTES = 22672440;

async function cargarDashboard() {

    const response = await fetch(API_URL);
    const json = await response.json();

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
