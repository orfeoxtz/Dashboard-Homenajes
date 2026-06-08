
canvas{
    max-width:100%;
}

/* Ajustes de continuidad gerencial */
:root{
    --radius:8px;
    --surface-strong:#ffffff;
    --line:#dbe4ef;
    --nav-dark:#073b2a;
    --info:#2563eb;
}

*{
    letter-spacing:0 !important;
}

body{
    background:linear-gradient(180deg, #f8fafc 0%, #eef3f8 100%);
}

body.dark-mode{
    background:linear-gradient(180deg, #0b1220 0%, #111827 100%);
}

.sidebar{
    background:linear-gradient(180deg, #08a857 0%, #078445 54%, var(--nav-dark) 100%);
    border-right:1px solid rgba(255,255,255,.12);
}

.logo{
    border-bottom-color:rgba(255,255,255,.2);
}

.sidebar li{
    border-radius:var(--radius);
    outline:none;
}

.sidebar li:focus-visible{
    box-shadow:0 0 0 3px rgba(255,255,255,.28);
}

.main{
    position:relative;
}

.topbar,
.filtros,
.card,
.grafico-card,
.tabla-cumplimiento,
.tabla-detalle,
.semaforo-card,
.alertas-box,
.card-big,
.admin-card{
    border-radius:var(--radius);
    border-color:var(--line);
}

.topbar{
    box-shadow:0 10px 28px rgba(15,23,42,.07);
}

.filtros{
    gap:16px;
}

.card{
    display:flex;
    flex-direction:column;
    justify-content:space-between;
    min-height:132px;
    background:linear-gradient(180deg, #ffffff 0%, #f9fbfd 100%);
}

.card::before{
    display:none;
}

.card h3{
    min-height:18px;
    line-height:1.25;
}

.card h2{
    font-size:clamp(18px, 1.35vw, 26px);
    line-height:1.12;
    overflow-wrap:anywhere;
    hyphens:auto;
}

.kpis-secundarios .card h2,
#mejorGestor,
#servicioTop,
#cumplimientoVisual{
    font-size:clamp(16px, 1.05vw, 22px);
}
