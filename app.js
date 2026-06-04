const API_URL = "https://script.google.com/macros/s/AKfycbxEyu57a5spnJNju9t4654U8SDBrWFWQ0GWLibubGy5ntZsOV3N-TeL73423-a23j6FwA/exec";

const META_GRUPAL = 219133881;

async function cargarDashboard() {

    try {

        const respuesta = await fetch(API_URL);
        const datos = await respuesta.json();

        let ventasTotales = 0;

        datos.forEach(item => {
            ventasTotales += Number(item.Valor || 0);
        });

        const cumplimiento =
            ((ventasTotales / META_GRUPAL) * 100).toFixed(2);

        const faltante =
            META_GRUPAL - ventasTotales;

        const ventas = document.getElementById("ventas");
        const cumplimientoBox = document.getElementById("cumplimiento");
        const faltanteBox = document.getElementById("faltante");
        const proyeccion = document.getElementById("proyeccion");

        if (ventas) ventas.innerHTML = "$" + ventasTotales.toLocaleString();
        if (cumplimientoBox) cumplimientoBox.innerHTML = cumplimiento + "%";
        if (faltanteBox) faltanteBox.innerHTML = "$" + faltante.toLocaleString();
        if (proyeccion) proyeccion.innerHTML = cumplimiento + "%";

    } catch (error) {

        console.error(error);

    }

}

cargarDashboard();
