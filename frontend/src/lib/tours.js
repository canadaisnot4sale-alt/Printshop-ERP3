// Interactive guided tours (react-joyride). Each tour stays on a single route.
// Targets reference existing data-testid attributes in the app.
export const TOURS = [
  {
    id: "overview",
    route: "/training",
    roles: ["admin", "staff"],
    title_en: "System Overview",
    title_es: "Recorrido General del Sistema",
    desc_en: "A quick guided walk through the main areas of the software.",
    desc_es: "Un paseo guiado rápido por las áreas principales del software.",
    steps: [
      { target: '[data-testid="nav-dashboard"]', title_en: "Dashboard", title_es: "Panel", body_en: "Your home screen: key stats, alerts and shortcuts.", body_es: "Tu pantalla de inicio: cifras clave, alertas y accesos rápidos." },
      { target: '[data-testid="nav-paper"]', title_en: "Estimating Modules", title_es: "Módulos de Cotización", body_en: "Each module (Paper, Booklets, Large Format...) prices a type of job automatically.", body_es: "Cada módulo (Papel, Libretas, Gran Formato...) cotiza un tipo de trabajo automáticamente." },
      { target: '[data-testid="nav-quote-builder"]', title_en: "Quote Builder", title_es: "Quote Builder", body_en: "A cart where you gather several priced pieces into one customer quote.", body_es: "Un carrito donde reúnes varias piezas cotizadas en una sola cotización." },
      { target: '[data-testid="nav-store"]', title_en: "Online Store", title_es: "Tienda en Línea", body_en: "The storefront your clients and resellers use to order online.", body_es: "La tienda que tus clientes y revendedores usan para pedir en línea." },
      { target: '[data-testid="nav-orders"]', title_en: "Orders", title_es: "Órdenes", body_en: "Track every order from pending to in-production to ready.", body_es: "Sigue cada orden de pendiente a en producción a lista." },
      { target: '[data-testid="nav-training"]', title_en: "Training Center", title_es: "Centro de Entrenamiento", body_en: "You are here! Manuals and videos to learn every process.", body_es: "¡Aquí estás! Manuales y videos para aprender cada proceso." },
    ],
  },
  {
    id: "paper_quote",
    route: "/paper",
    roles: ["admin", "staff"],
    title_en: "How to Quote Business Cards / Paper",
    title_es: "Cómo Cotizar Tarjetas / Papel",
    desc_en: "Step by step: create a price for a paper job.",
    desc_es: "Paso a paso: crea un precio para un trabajo en papel.",
    steps: [
      { target: '[data-testid="product-select"]', title_en: "1. Pick a product", title_es: "1. Elige un producto", body_en: "Start by choosing the product you want to quote.", body_es: "Empieza eligiendo el producto que quieres cotizar." },
      { target: '[data-testid="sheet-select"]', title_en: "2. Sheet size", title_es: "2. Tamaño de pliego", body_en: "Select the press sheet. The system computes how many pieces fit per sheet.", body_es: "Selecciona el pliego de impresión. El sistema calcula cuántas piezas caben por pliego." },
      { target: '[data-testid="laminate-switch"]', title_en: "3. Finishing", title_es: "3. Acabados", body_en: "Turn on lamination, hot foil, round corners or double-sided as needed.", body_es: "Activa laminado, hot foil, esquinas redondeadas o doble cara según necesites." },
      { target: '[data-testid="calc-paper-button"]', title_en: "4. Calculate", title_es: "4. Calcular", body_en: "Click to compute material cost, retail price and wholesale price.", body_es: "Haz clic para calcular el costo del material, el precio retail y el precio wholesale." },
    ],
  },
  {
    id: "training_admin",
    route: "/training",
    roles: ["admin"],
    title_en: "Managing Training Content",
    title_es: "Gestionar el Contenido de Entrenamiento",
    desc_en: "How to add manuals and videos for your employees.",
    desc_es: "Cómo agregar manuales y videos para tus empleados.",
    steps: [
      { target: '[data-testid="lang-toggle"]', title_en: "Language", title_es: "Idioma", body_en: "Switch the whole center between Spanish and English.", body_es: "Cambia todo el centro entre español e inglés." },
      { target: '[data-testid="tab-product"]', title_en: "Product videos", title_es: "Videos por producto", body_en: "Attach a how-to video to a specific product (e.g. business cards).", body_es: "Adjunta un video instructivo a un producto específico (ej. tarjetas)." },
      { target: '[data-testid="tab-machine"]', title_en: "Machine videos", title_es: "Videos por máquina", body_en: "Store maintenance videos per machine, e.g. servicing the Roland.", body_es: "Guarda videos de mantenimiento por máquina, ej. servicio de la Roland." },
      { target: '[data-testid="add-section-btn"]', title_en: "Edit the manual", title_es: "Editar el manual", body_en: "Add or edit written manual sections. Just paste a YouTube link to add a video.", body_es: "Agrega o edita secciones del manual. Solo pega un enlace de YouTube para agregar un video." },
    ],
  },
];
