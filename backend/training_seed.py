"""Initial bilingual (EN/ES) content for the Training Center system manual.
Admins can edit, add or delete these sections from the UI after seeding."""

MANUAL_SECTIONS = [
    {
        "group": "getting_started", "icon": "rocket", "order": 10,
        "title_en": "Welcome to Print and Save ERP",
        "title_es": "Bienvenido al ERP de Print and Save",
        "body_en": (
            "This system runs the whole print shop: quoting, materials, production costs, "
            "the online store and business analytics.\n\n"
            "- Use the left sidebar to move between modules.\n"
            "- Quoting modules (Paper, Booklets, Large Format, etc.) calculate prices automatically.\n"
            "- The Business and Administration groups (admin only) manage costs, machines and settings.\n"
            "- Your work in a quote module is kept while you switch tabs; it only resets on a full page refresh."
        ),
        "body_es": (
            "Este sistema opera todo el taller de impresión: cotización, materiales, costos de producción, "
            "la tienda en línea y las analíticas del negocio.\n\n"
            "- Usa la barra lateral izquierda para moverte entre módulos.\n"
            "- Los módulos de cotización (Papel, Libretas, Gran Formato, etc.) calculan los precios automáticamente.\n"
            "- Los grupos Business y Administration (solo admin) manejan costos, máquinas y configuración.\n"
            "- Lo que trabajas en un módulo de cotización se conserva al cambiar de pestaña; solo se borra al recargar la página."
        ),
    },
    {
        "group": "getting_started", "icon": "users", "order": 20,
        "title_en": "Roles and Access",
        "title_es": "Roles y Accesos",
        "body_en": (
            "There are four roles:\n\n"
            "- Administrator: full access, sees costs and can edit everything.\n"
            "- Staff (Training): employees who only access this Training Center to learn processes.\n"
            "- Client (Retail): customers who see retail prices in the online store.\n"
            "- Reseller (Wholesale): customers who see wholesale prices.\n\n"
            "Admins can change any user's role from Administration > Users."
        ),
        "body_es": (
            "Existen cuatro roles:\n\n"
            "- Administrador: acceso total, ve costos y puede editar todo.\n"
            "- Empleado (Staff): empleados que solo acceden a este Centro de Entrenamiento para aprender los procesos.\n"
            "- Cliente (Retail): clientes que ven precios de menudeo en la tienda en línea.\n"
            "- Revendedor (Wholesale): clientes que ven precios de mayoreo.\n\n"
            "El administrador puede cambiar el rol de cualquier usuario en Administration > Users."
        ),
    },
    {
        "group": "getting_started", "icon": "shapes", "order": 30,
        "title_en": "Icons and Symbols Legend",
        "title_es": "Leyenda de Íconos y Símbolos",
        "body_en": (
            "Common symbols across the app:\n\n"
            "- Cart badge (number): items currently in the Quote Builder.\n"
            "- Amber banner 'Viewing as...': you are an admin previewing the store as a customer.\n"
            "- 'Published' toggle on a product: makes it visible in the online store.\n"
            "- Reorder / truck icon: material stock is at or below its reorder point.\n"
            "- Dynamic pricing tag: price is computed live from the material Bill of Materials (BoM)."
        ),
        "body_es": (
            "Símbolos comunes en la aplicación:\n\n"
            "- Insignia del carrito (número): artículos actualmente en el Quote Builder.\n"
            "- Banner ámbar 'Viewing as...': eres admin viendo la tienda como cliente.\n"
            "- Interruptor 'Published' en un producto: lo hace visible en la tienda en línea.\n"
            "- Ícono de recompra / camión: el material está en o por debajo de su punto de recompra.\n"
            "- Etiqueta de precio dinámico: el precio se calcula en vivo desde la lista de materiales (BoM)."
        ),
    },
    {
        "group": "estimating", "icon": "calculator", "order": 40,
        "title_en": "How Quoting Works",
        "title_es": "Cómo Funciona la Cotización",
        "body_en": (
            "Each quoting module follows the same idea:\n\n"
            "1. Pick a product or configuration and enter size/quantity.\n"
            "2. Choose the material (paper, vinyl, garment, etc.) from the central Materials database.\n"
            "3. Add finishing options (lamination, foil, round corners, rush, double-sided).\n"
            "4. The system returns material cost, printing cost, retail price and wholesale price.\n"
            "5. Send the result to the Quote Builder to group several pieces into one quote."
        ),
        "body_es": (
            "Cada módulo de cotización sigue la misma idea:\n\n"
            "1. Elige un producto o configuración e ingresa tamaño/cantidad.\n"
            "2. Elige el material (papel, vinil, prenda, etc.) desde la base central de Materiales.\n"
            "3. Agrega acabados (laminado, foil, esquinas redondeadas, urgencia, doble cara).\n"
            "4. El sistema devuelve costo de material, costo de impresión, precio retail y precio wholesale.\n"
            "5. Envía el resultado al Quote Builder para agrupar varias piezas en una sola cotización."
        ),
    },
    {
        "group": "estimating", "icon": "file-text", "order": 50,
        "title_en": "Paper Printing Module",
        "title_es": "Módulo de Impresión en Papel",
        "body_en": (
            "For business cards, flyers and general paper jobs:\n\n"
            "- Select the sheet size (e.g. 13x19) and the paper stock.\n"
            "- Choose quantity; the system computes how many pieces fit per sheet and the waste.\n"
            "- Optional add-ons: lamination (by side), hot foil, round corners, custom size, 4/4 double-sided.\n"
            "- Rush pricing adds a percentage based on the turnaround selected."
        ),
        "body_es": (
            "Para tarjetas de presentación, volantes y trabajos generales en papel:\n\n"
            "- Selecciona el tamaño de pliego (ej. 13x19) y el papel.\n"
            "- Elige la cantidad; el sistema calcula cuántas piezas caben por pliego y el desperdicio.\n"
            "- Acabados opcionales: laminado (por cara), hot foil, esquinas redondeadas, tamaño personalizado, doble cara 4/4.\n"
            "- El precio de urgencia agrega un porcentaje según el tiempo de entrega elegido."
        ),
    },
    {
        "group": "estimating", "icon": "shopping-cart", "order": 60,
        "title_en": "Quote Builder and My Quotes",
        "title_es": "Quote Builder y My Quotes",
        "body_en": (
            "- Quote Builder: a cart where you gather several priced pieces into a single customer quote.\n"
            "- My Quotes: saved quotes you can reopen, edit and re-price when material costs change.\n"
            "- From a quote you can publish a configurable 'Grab-n-Go' product to the online store."
        ),
        "body_es": (
            "- Quote Builder: un carrito donde reúnes varias piezas cotizadas en una sola cotización para el cliente.\n"
            "- My Quotes: cotizaciones guardadas que puedes reabrir, editar y recotizar cuando cambian los costos.\n"
            "- Desde una cotización puedes publicar un producto configurable 'Grab-n-Go' a la tienda en línea."
        ),
    },
    {
        "group": "business", "icon": "boxes", "order": 70,
        "title_en": "Materials (Central Database)",
        "title_es": "Materiales (Base Central)",
        "body_en": (
            "All modules read from one Materials database, so a cost change updates every quote.\n\n"
            "- Each material has a category, unit cost, stock quantity and reorder point.\n"
            "- Laminate and hot foil are tracked by roll with linear-foot calculations.\n"
            "- Adjust stock manually or let purchases update it. Low stock appears in the Reorder Center."
        ),
        "body_es": (
            "Todos los módulos leen de una sola base de Materiales, así un cambio de costo actualiza cada cotización.\n\n"
            "- Cada material tiene categoría, costo unitario, cantidad en stock y punto de recompra.\n"
            "- El laminado y el hot foil se controlan por rollo con cálculos de pies lineales.\n"
            "- Ajusta el stock manualmente o deja que las compras lo actualicen. El stock bajo aparece en el Reorder Center."
        ),
    },
    {
        "group": "business", "icon": "cpu", "order": 80,
        "title_en": "Machinery and Maintenance",
        "title_es": "Maquinaria y Mantenimiento",
        "body_en": (
            "Register each machine (e.g. your Roland) with its costs and maintenance schedule.\n\n"
            "- Maintenance schedules trigger alerts (e.g. service every 6 months).\n"
            "- Attach training videos to a machine in the Training Center > Machines tab so any employee "
            "can learn how to service it even when you are not there."
        ),
        "body_es": (
            "Registra cada máquina (ej. tu Roland) con sus costos y su calendario de mantenimiento.\n\n"
            "- Los calendarios de mantenimiento generan alertas (ej. servicio cada 6 meses).\n"
            "- Adjunta videos de entrenamiento a una máquina en Centro de Entrenamiento > pestaña Máquinas para que "
            "cualquier empleado aprenda a darle servicio aunque tú no estés."
        ),
    },
    {
        "group": "business", "icon": "package", "order": 90,
        "title_en": "Products, Catalog and Online Store",
        "title_es": "Productos, Catálogo y Tienda en Línea",
        "body_en": (
            "- Products: define what you sell, prices, images and AI-generated marketing text.\n"
            "- Publish a product to make it appear in the online Store for clients and resellers.\n"
            "- Clients see retail prices, resellers see wholesale prices; both can upload their files and pay online."
        ),
        "body_es": (
            "- Products: define lo que vendes, precios, imágenes y texto de marketing generado por IA.\n"
            "- Publica un producto para que aparezca en la tienda en línea para clientes y revendedores.\n"
            "- Los clientes ven precios retail, los revendedores ven wholesale; ambos pueden subir sus archivos y pagar en línea."
        ),
    },
    {
        "group": "business", "icon": "line-chart", "order": 100,
        "title_en": "Financials, Profit and Purchases",
        "title_es": "Finanzas, Ganancias y Compras",
        "body_en": (
            "- Financials & Profit and Loss: revenue, costs, margins and profitability per job.\n"
            "- Purchases: log supplier invoices (the trainable PDF parser can read them) to update material costs and stock.\n"
            "- Fixed Costs: monthly overhead used for break-even analysis."
        ),
        "body_es": (
            "- Financials y Profit and Loss: ingresos, costos, márgenes y rentabilidad por trabajo.\n"
            "- Purchases: registra facturas de proveedores (el lector de PDF entrenable puede leerlas) para actualizar costos y stock.\n"
            "- Fixed Costs: gastos fijos mensuales usados para el análisis de punto de equilibrio."
        ),
    },
    {
        "group": "admin", "icon": "settings", "order": 110,
        "title_en": "Users and Settings",
        "title_es": "Usuarios y Configuración",
        "body_en": (
            "- Users: create employees, change roles, remove access.\n"
            "- Settings: global markups (retail/wholesale), taxes, turnaround times and store configuration.\n"
            "- Tip: create a Staff account for each new employee so they only get the Training Center at first."
        ),
        "body_es": (
            "- Users: crea empleados, cambia roles, quita accesos.\n"
            "- Settings: márgenes globales (retail/wholesale), impuestos, tiempos de entrega y configuración de la tienda.\n"
            "- Consejo: crea una cuenta Staff para cada empleado nuevo para que al inicio solo tenga el Centro de Entrenamiento."
        ),
    },
]
