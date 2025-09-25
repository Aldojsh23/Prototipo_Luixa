import { createBot, createProvider, createFlow, addKeyword } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { MetaProvider as Provider } from '@builderbot/provider-meta'
import { supabase } from './supabase.js'

const PORT = process.env.PORT ?? 3008

// 🚩 Función para obtener el siguiente número de pedido por proveedor
const obtenerSiguienteNumeroPedido = async (idProveedor) => {
    try {
        console.log(`🔢 Obteniendo siguiente número de pedido para proveedor ${idProveedor}`)

        // Buscar el número de pedido más alto para este proveedor
        const { data: ultimoPedido, error } = await supabase
            .from('pedidos')
            .select('numero_pedido_proveedor')
            .eq('id_proveedor', idProveedor)
            .order('numero_pedido_proveedor', { ascending: false })
            .limit(1)
            .single()

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
            console.error('❌ Error obteniendo último pedido:', error)
            return 1 // Si hay error, empezar con 1
        }

        const siguienteNumero = ultimoPedido ? (ultimoPedido.numero_pedido_proveedor + 1) : 1
        console.log(`✅ Siguiente número de pedido: ${siguienteNumero}`)

        return siguienteNumero
    } catch (error) {
        console.error('❌ Error inesperado obteniendo número de pedido:', error)
        return 1
    }
}


// 🚩 Función para generar código corto de 20 caracteres máximo
const generarCodigoSeguimiento = (idProveedor, numeroPedido) => {
    // Extraer solo los últimos 6 caracteres del UUID del proveedor
    const proveedorCorto = idProveedor.slice(-6)
    
    const fecha = new Date()
    const año = fecha.getFullYear().toString().slice(-2)
    const mes = (fecha.getMonth() + 1).toString().padStart(2, '0')
    const dia = fecha.getDate().toString().padStart(2, '0')
    const hora = fecha.getHours().toString().padStart(2, '0')
    
    // Formato: [6_CHARS_UUID][YYMMDDHH][3_NUM]
    // Ejemplo: 805E57241203140001 (18 caracteres)
    return `${proveedorCorto.toUpperCase()}${año}${mes}${dia}${hora}${numeroPedido.toString().padStart(4, '0')}`
}

// 🆕 Función alternativa con separadores para mayor legibilidad
const generarCodigoSeguimientoLegible = (idProveedor, numeroPedido) => {
    // Extraer solo los últimos 4 caracteres del UUID del proveedor
    const proveedorCorto = idProveedor.slice(-4)
    
    const fecha = new Date()
    const año = fecha.getFullYear().toString().slice(-2)
    const mes = (fecha.getMonth() + 1).toString().padStart(2, '0')
    const dia = fecha.getDate().toString().padStart(2, '0')
    
    // Formato: [4_CHARS]-[YYMMDD]-[NUM]
    // Ejemplo: 5E57-241203-001 (15 caracteres)
    return `${proveedorCorto.toUpperCase()}-${año}${mes}${dia}-${numeroPedido.toString().padStart(3, '0')}`
}

// 🆕 Función para verificar unicidad
const verificarCodigoUnico = async (codigoSeguimiento) => {
    try {
        const { data, error } = await supabase
            .from('pedidos')
            .select('id_pedido')
            .eq('codigo_seguimiento', codigoSeguimiento)
            .limit(1)

        if (error && error.code !== 'PGRST116') {
            console.error('❌ Error verificando código:', error)
            return false
        }

        return !data || data.length === 0
    } catch (error) {
        console.error('❌ Error inesperado verificando código:', error)
        return false
    }
}

// 🆕 Función para generar código único de 20 chars máximo
const generarCodigoUnicoCorto = async (idProveedor, numeroPedido, maxIntentos = 5) => {
    for (let intento = 0; intento < maxIntentos; intento++) {
        let codigo
        
        if (intento === 0) {
            // Primer intento: formato legible
            codigo = generarCodigoSeguimientoLegible(idProveedor, numeroPedido)
        } else {
            // Reintentos: agregar sufijo de 1-2 caracteres
            const sufijo = Math.random().toString(36).substr(2, 1).toUpperCase()
            const codigoBase = generarCodigoSeguimientoLegible(idProveedor, numeroPedido)
            codigo = `${codigoBase}${sufijo}`
        }
        
        // Verificar longitud (debe ser <= 20)
        if (codigo.length > 20) {
            // Formato ultra-compacto como fallback
            const proveedorMuyCorto = idProveedor.slice(-3)
            const timestamp = Date.now().toString().slice(-8)
            const random = Math.random().toString(36).substr(2, 3).toUpperCase()
            codigo = `${proveedorMuyCorto}${timestamp}${random}` // ~14 caracteres
        }
        
        console.log(`🔍 Intento ${intento + 1}: Generando código "${codigo}" (${codigo.length} chars)`)
        
        if (codigo.length > 20) {
            console.error(`❌ Código aún muy largo: ${codigo} (${codigo.length} chars)`)
            continue
        }
        
        const esUnico = await verificarCodigoUnico(codigo)
        if (esUnico) {
            console.log(`✅ Código único generado: ${codigo} (${codigo.length} chars)`)
            return codigo
        }
        
        console.log(`⚠️ Código duplicado en intento ${intento + 1}: ${codigo}`)
        await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Código de emergencia: timestamp + random (máximo 16 chars)
    const timestamp = Date.now().toString().slice(-10)
    const random = Math.random().toString(36).substr(2, 6).toUpperCase()
    const codigoEmergencia = `${timestamp}${random}`
    
    console.log(`🚨 Código de emergencia: ${codigoEmergencia} (${codigoEmergencia.length} chars)`)
    return codigoEmergencia
}
// 🚩 Flujo WELCOME - ACTUALIZADO con más opciones
const welcomeFlow = addKeyword(['Hola', 'Hi', 'Hello', 'hola', 'hi', 'hello', 'menu', 'ayuda'], { start: true })
    .addAnswer(`🤖 Holaa, soy *Luixa*, tu asistente virtual para pedidos`)
    .addAnswer(
        [
            '¿En qué puedo ayudarte hoy?',
            '',
            '🛍️ *"nuevo pedido"* - Crear un nuevo pedido',
            '📋 *"consultar estado"* - Ver el estado de tus pedidos',
            '🔍 *"buscar pedido"* - Buscar un pedido específico por código',
            '📊 *"mis estadisticas"* - Ver resumen de tus pedidos',
            '🏪 *"catalogo"* - Ver catálogo de un proveedor',
            '❌ *"cancelar pedido"* - Cancelar un pedido pendiente',
            '📞 *"contacto"* - Información de contacto',
            '',
            '💡 Escribe exactamente una de las opciones anteriores para continuar.',
            '🔄 Escribe *"menu"* en cualquier momento para ver estas opciones.'
        ].join('\n')
    )

// 🚩 Función para procesar pedido confirmado - MEJORADA con numeración por proveedor

// 🚩 Función CORREGIDA para procesar pedido confirmado
const procesarPedidoConfirmado = async (ctx, { flowDynamic, state }) => {
    console.log('🟢 [CONFIRMAR] Iniciando función...')
    
    const pedidoTemporal = state.get('pedidoTemporal')
    const totalTemporal = state.get('totalTemporal')
    const idCliente = state.get('idCliente')
    const idProveedor = state.get('idProveedor')
    const nombreCliente = state.get('nombreCliente')
    const nombreProveedor = state.get('nombreProveedor')

    // Validaciones
    if (!pedidoTemporal || !Array.isArray(pedidoTemporal) || pedidoTemporal.length === 0) {
        await flowDynamic('❌ No hay pedido para confirmar. Por favor, ingresa tu pedido primero.')
        return
    }

    if (!idCliente || !idProveedor) {
        await flowDynamic('❌ Error: faltan datos del cliente o proveedor.')
        return
    }

    await flowDynamic('⏳ Procesando tu pedido confirmado...')

    try {
        // Obtener siguiente número de pedido
        const numeroPedidoProveedor = await obtenerSiguienteNumeroPedido(idProveedor)
        
        // Generar código corto
        const codigoSeguimiento = await generarCodigoUnicoCorto(idProveedor, numeroPedidoProveedor)
        
        // Verificación final de longitud
        if (codigoSeguimiento.length > 20) {
            console.error(`❌ Código demasiado largo: ${codigoSeguimiento} (${codigoSeguimiento.length} chars)`)
            await flowDynamic('❌ Error interno generando código. Reintenta en unos segundos.')
            return
        }
        
        console.log(`💾 Insertando pedido con código: ${codigoSeguimiento} (${codigoSeguimiento.length} chars)`)

        // Crear pedido en BD
        const { data: pedidoInserted, error: pedidoError } = await supabase
            .from('pedidos')
            .insert({
                id_cliente: parseInt(idCliente),
                id_proveedor: idProveedor, 
                estado: 'pendiente',
                total: parseFloat(totalTemporal),
                numero_pedido_proveedor: numeroPedidoProveedor,
                codigo_seguimiento: codigoSeguimiento,
                notas: `Pedido #${numeroPedidoProveedor} creado via chatbot`,
                fecha_estimada_entrega: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            })
            .select('id_pedido, numero_pedido_proveedor, codigo_seguimiento')
            .single()

        if (pedidoError) {
            console.error('❌ Error insertando pedido:', pedidoError)
            await flowDynamic(`⚠️ Error al crear tu pedido: ${pedidoError.message}`)
            return
        }

        const id_pedido = pedidoInserted.id_pedido
        const numeroProveedor = pedidoInserted.numero_pedido_proveedor
        const codigoFinal = pedidoInserted.codigo_seguimiento
        
        console.log(`✅ Pedido creado - ID: ${id_pedido}, Número: ${numeroProveedor}, Código: ${codigoFinal}`)

        // Insertar detalles
        const detallesParaInsertar = pedidoTemporal.map(item => ({
            id_pedido: parseInt(id_pedido),
            id_producto: parseInt(item.id_producto),
            cantidad: parseInt(item.cantidad),
            precio_unitario: parseFloat(item.precio_unitario),
            talla: item.talla
        }))

        const { error: detalleError } = await supabase
            .from('detalle_pedido')
            .insert(detallesParaInsertar)

        if (detalleError) {
            console.error('❌ Error insertando detalles:', detalleError)
            await flowDynamic(`⚠️ Error al guardar los detalles: ${detalleError.message}`)
            return
        }

        // Actualizar stock
        for (const item of pedidoTemporal) {
            const nuevoStock = parseInt(item.stock_disponible) - parseInt(item.cantidad)
            await supabase
                .from('producto')
                .update({ cantidad_producto: nuevoStock })
                .eq('id_producto', parseInt(item.id_producto))
        }

        // Limpiar estado
        await state.update({
            pedidoTemporal: null,
            totalTemporal: 0
        })

        // Mensaje de confirmación
        let detalleProductos = ''
        pedidoTemporal.forEach((item, index) => {
            detalleProductos += `${index + 1}. ${item.nombre_producto} (${item.talla}) - ${item.cantidad}x - $${item.subtotal}\n`
        })

        const fechaEstimada = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES')

        await flowDynamic(`🎉 *¡PEDIDO CONFIRMADO!*

📋 *Detalles:*
🆔 Pedido #${numeroProveedor}
📊 Código: *${codigoFinal}*
👤 ${nombreCliente}
🏪 ${nombreProveedor}

🛍️ *Productos:*
${detalleProductos}
💰 *Total: $${totalTemporal}*
📅 *Entrega: ${fechaEstimada}*

📱 *Guarda tu código:*
*${codigoFinal}*

💡 Usa "buscar pedido" para consultar el estado.`)

        console.log('🎉 Pedido procesado exitosamente')

    } catch (error) {
        console.error('❌ Error inesperado:', error)
        await flowDynamic(`⚠️ Error inesperado: ${error.message}`)
    }
}

// 🆕 Flujo para buscar pedido por código de seguimiento
const buscarPedidoFlow = addKeyword(['buscar pedido', 'buscar', 'codigo seguimiento'])
    .addAnswer('🔍 Para buscar tu pedido necesito el código de seguimiento.')
    .addAnswer('📊 Ingresa tu código de seguimiento (formato: P123-YYMMDD-001):',
        { capture: true },
        async (ctx, { flowDynamic }) => {
            const codigoBusqueda = ctx.body.trim().toUpperCase()

            if (!codigoBusqueda) {
                await flowDynamic('❌ Por favor ingresa un código de seguimiento válido.')
                return
            }

            try {
                const { data: pedido, error } = await supabase
                    .from('pedidos')
                    .select(`
                        id_pedido,
                        numero_pedido_proveedor,
                        codigo_seguimiento,
                        fecha_creacion,
                        fecha_actualizacion,
                        fecha_estimada_entrega,
                        estado,
                        total,
                        notas,
                        clientes(nombre_cliente, telefono_cliente),
                        proveedores(nombre_proveedor, telefono_proveedor)
                    `)
                    .eq('codigo_seguimiento', codigoBusqueda)
                    .single()

                if (error || !pedido) {
                    await flowDynamic(`❌ No se encontró ningún pedido con el código: ${codigoBusqueda}\n\n💡 Verifica que el código esté correcto y vuelve a intentar.`)
                    return
                }

                // Obtener detalles del pedido
                const { data: detalles } = await supabase
                    .from('detalle_pedido')
                    .select(`
                        cantidad,
                        precio_unitario,
                        talla,
                        producto(nombre_producto, categoria_producto)
                    `)
                    .eq('id_pedido', pedido.id_pedido)

                // Formatear respuesta
                const formatearFecha = (fecha) => {
                    return new Date(fecha).toLocaleDateString('es-ES', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    })
                }

                const obtenerEmojiEstado = (estado) => {
                    switch (estado?.toLowerCase()) {
                        case 'pendiente': return '⏳'
                        case 'completado': return '✅'
                        case 'cancelado': return '❌'
                        case 'en_proceso': return '🔄'
                        default: return '📋'
                    }
                }

                let respuesta = `🔍 *INFORMACIÓN DEL PEDIDO*\n\n`
                respuesta += `📊 *Código:* ${pedido.codigo_seguimiento}\n`
                respuesta += `🔢 *Pedido #${pedido.numero_pedido_proveedor}*\n`
                respuesta += `${obtenerEmojiEstado(pedido.estado)} *Estado:* ${pedido.estado?.toUpperCase()}\n`
                respuesta += `👤 *Cliente:* ${pedido.clientes.nombre_cliente}\n`
                respuesta += `🏪 *Proveedor:* ${pedido.proveedores.nombre_proveedor}\n`
                respuesta += `📅 *Creado:* ${formatearFecha(pedido.fecha_creacion)}\n`

                if (pedido.fecha_estimada_entrega) {
                    respuesta += `🚚 *Entrega estimada:* ${formatearFecha(pedido.fecha_estimada_entrega)}\n`
                }

                respuesta += `💰 *Total:* $${pedido.total}\n\n`

                if (detalles && detalles.length > 0) {
                    respuesta += `🛍️ *PRODUCTOS:*\n`
                    detalles.forEach((detalle, index) => {
                        const subtotal = detalle.cantidad * detalle.precio_unitario
                        respuesta += `${index + 1}. ${detalle.producto.nombre_producto}\n`
                        respuesta += `   📏 Talla: ${detalle.talla}\n`
                        respuesta += `   📦 Cantidad: ${detalle.cantidad}\n`
                        respuesta += `   💲 Precio: $${detalle.precio_unitario} c/u\n`
                        respuesta += `   💰 Subtotal: $${subtotal}\n\n`
                    })
                }

                if (pedido.notas) {
                    respuesta += `📝 *Notas:* ${pedido.notas}\n\n`
                }

                respuesta += `📞 *Contacto del proveedor:* ${pedido.proveedores.telefono_proveedor}\n\n`
                respuesta += `💡 *¿Necesitas ayuda?* Escribe "menu" para ver más opciones.`

                await flowDynamic(respuesta)

            } catch (error) {
                console.error('❌ Error buscando pedido:', error)
                await flowDynamic('⚠️ Error al buscar el pedido. Inténtalo nuevamente.')
            }
        })

// 🆕 Flujo para ver estadísticas del cliente
const estadisticasFlow = addKeyword(['mis estadisticas', 'estadisticas', 'resumen'])
    .addAnswer('📊 Para generar tus estadísticas necesito tu número de teléfono.')
    .addAnswer('👤 Ingresa tu número de teléfono (ejemplo: +52 246 123 4567):',
        { capture: true },
        async (ctx, { flowDynamic }) => {
            const numeroCliente = ctx.body.trim()

            try {
                // Buscar cliente
                const { data: cliente, error: clienteError } = await supabase
                    .from('clientes')
                    .select('id_cliente, nombre_cliente')
                    .eq('telefono_cliente', numeroCliente)
                    .single()

                if (clienteError || !cliente) {
                    await flowDynamic(`❌ No encontré un cliente registrado con el número ${numeroCliente}.`)
                    return
                }

                // Obtener estadísticas de pedidos
                const { data: pedidos, error: pedidosError } = await supabase
                    .from('pedidos')
                    .select(`
                        id_pedido,
                        estado,
                        total,
                        fecha_creacion,
                        proveedores(nombre_proveedor)
                    `)
                    .eq('id_cliente', cliente.id_cliente)
                    .order('fecha_creacion', { ascending: false })

                if (pedidosError || !pedidos) {
                    await flowDynamic('⚠️ Error al obtener tus estadísticas.')
                    return
                }

                if (pedidos.length === 0) {
                    await flowDynamic(`📊 *ESTADÍSTICAS DE ${cliente.nombre_cliente.toUpperCase()}*\n\n👋 ¡Aún no tienes pedidos registrados!\n\n💡 Escribe "nuevo pedido" para crear tu primer pedido.`)
                    return
                }

                // Calcular estadísticas
                const totalPedidos = pedidos.length
                const pedidosPendientes = pedidos.filter(p => p.estado === 'pendiente').length
                const pedidosCompletados = pedidos.filter(p => p.estado === 'completado').length
                const pedidosCancelados = pedidos.filter(p => p.estado === 'cancelado').length
                const totalGastado = pedidos.reduce((sum, p) => sum + parseFloat(p.total || 0), 0)
                const promedioGasto = totalGastado / totalPedidos

                // Proveedor más frecuente
                const proveedorCount = {}
                pedidos.forEach(p => {
                    const nombreProv = p.proveedores.nombre_proveedor
                    proveedorCount[nombreProv] = (proveedorCount[nombreProv] || 0) + 1
                })
                const proveedorFavorito = Object.keys(proveedorCount).reduce((a, b) =>
                    proveedorCount[a] > proveedorCount[b] ? a : b,
                    Object.keys(proveedorCount)[0]
                )

                // Mes con más actividad
                const fechaReciente = new Date(pedidos[0].fecha_creacion)
                const fechaAntigua = new Date(pedidos[pedidos.length - 1].fecha_creacion)
                const diasComercio = Math.ceil((fechaReciente - fechaAntigua) / (1000 * 60 * 60 * 24)) || 1

                let respuesta = `📊 *ESTADÍSTICAS DE ${cliente.nombre_cliente.toUpperCase()}*\n\n`
                respuesta += `📈 *RESUMEN GENERAL:*\n`
                respuesta += `🛍️ Total de pedidos: ${totalPedidos}\n`
                respuesta += `⏳ Pendientes: ${pedidosPendientes}\n`
                respuesta += `✅ Completados: ${pedidosCompletados}\n`
                respuesta += `❌ Cancelados: ${pedidosCancelados}\n\n`

                respuesta += `💰 *INFORMACIÓN FINANCIERA:*\n`
                respuesta += `💵 Total gastado: $${totalGastado.toFixed(2)}\n`
                respuesta += `📊 Promedio por pedido: $${promedioGasto.toFixed(2)}\n\n`

                respuesta += `🏪 *PROVEEDOR FAVORITO:*\n`
                respuesta += `⭐ ${proveedorFavorito} (${proveedorCount[proveedorFavorito]} pedidos)\n\n`

                respuesta += `📅 *ACTIVIDAD:*\n`
                respuesta += `🗓️ Cliente desde: ${fechaAntigua.toLocaleDateString('es-ES')}\n`
                respuesta += `📈 Días activo: ${diasComercio}\n`
                respuesta += `🔄 Promedio: ${(totalPedidos / (diasComercio / 30)).toFixed(1)} pedidos/mes\n\n`

                respuesta += `🎯 *ÚLTIMO PEDIDO:*\n`
                respuesta += `📅 ${fechaReciente.toLocaleDateString('es-ES')}\n`
                respuesta += `💰 $${pedidos[0].total}\n`
                respuesta += `🏪 ${pedidos[0].proveedores.nombre_proveedor}\n\n`

                respuesta += `💡 ¿Quieres hacer un nuevo pedido? Escribe "nuevo pedido"`

                await flowDynamic(respuesta)

            } catch (error) {
                console.error('❌ Error generando estadísticas:', error)
                await flowDynamic('⚠️ Error al generar tus estadísticas. Inténtalo nuevamente.')
            }
        })

// 🆕 Flujo para ver catálogo de proveedor
const catalogoFlow = addKeyword(['catalogo', 'productos', 'ver catalogo'])
    .addAnswer('📋 Para mostrarte el catálogo necesito el número del proveedor.')
    .addAnswer('🏪 Ingresa el número del proveedor (ejemplo: +52 246 987 6543):',
        { capture: true },
        async (ctx, { flowDynamic }) => {
            const numeroProveedor = ctx.body.trim()

            try {
                // Buscar proveedor
                const { data: proveedor, error: proveedorError } = await supabase
                    .from('proveedores')
                    .select('id_proveedor, nombre_proveedor, email_proveedor')
                    .eq('telefono_proveedor', numeroProveedor)
                    .single()

                if (proveedorError || !proveedor) {
                    await flowDynamic(`❌ No encontré un proveedor registrado con el número ${numeroProveedor}.`)
                    return
                }

                // Obtener productos del proveedor
                const { data: productos, error: productosError } = await supabase
                    .from('producto')
                    .select('*')
                    .eq('id_proveedor', proveedor.id_proveedor)
                    .order('categoria_producto, nombre_producto')

                if (productosError) {
                    await flowDynamic('⚠️ Error al obtener el catálogo.')
                    return
                }

                if (!productos || productos.length === 0) {
                    await flowDynamic(`📋 El proveedor ${proveedor.nombre_proveedor} no tiene productos registrados.`)
                    return
                }

                // Agrupar por categoría
                const categorias = {}
                productos.forEach(producto => {
                    const cat = producto.categoria_producto || 'Sin categoría'
                    if (!categorias[cat]) {
                        categorias[cat] = []
                    }
                    categorias[cat].push(producto)
                })

                let catalogo = `📋 *CATÁLOGO DE ${proveedor.nombre_proveedor.toUpperCase()}*\n\n`
                catalogo += `🏪 *Información del proveedor:*\n`
                catalogo += `📞 Teléfono: ${numeroProveedor}\n`
                if (proveedor.email_proveedor) {
                    catalogo += `📧 Email: ${proveedor.email_proveedor}\n`
                }
                catalogo += `🛍️ Total productos: ${productos.length}\n\n`

                Object.keys(categorias).forEach(categoria => {
                    catalogo += `📂 *${categoria.toUpperCase()}*\n`
                    categorias[categoria].forEach((producto, index) => {
                        const stock = producto.cantidad_producto || 0
                        const disponible = stock > 0 ? '✅' : '❌'

                        catalogo += `${index + 1}. ${disponible} *${producto.nombre_producto}*\n`
                        catalogo += `   📏 Talla: ${producto.talla_producto}\n`
                        catalogo += `   💲 Precio: $${producto.precio_producto}\n`
                        catalogo += `   📦 Stock: ${stock} unidades\n`
                        if (producto.descripcion_producto) {
                            catalogo += `   📝 ${producto.descripcion_producto}\n`
                        }
                        catalogo += `\n`
                    })
                    catalogo += `\n`
                })

                catalogo += `💡 *¿Listo para ordenar?*\n`
                catalogo += `Escribe "nuevo pedido" para crear tu pedido.`

                await flowDynamic(catalogo)

            } catch (error) {
                console.error('❌ Error obteniendo catálogo:', error)
                await flowDynamic('⚠️ Error al obtener el catálogo. Inténtalo nuevamente.')
            }
        })

// 🆕 Flujo para cancelar pedidos
const cancelarPedidoFlow = addKeyword(['cancelar pedido', 'cancelar'])
    .addAnswer('❌ Para cancelar un pedido necesito algunos datos.')
    .addAnswer('📊 Ingresa el código de seguimiento del pedido a cancelar:',
        { capture: true },
        async (ctx, { flowDynamic }) => {
            const codigoCancelacion = ctx.body.trim().toUpperCase()

            try {
                // Buscar el pedido
                const { data: pedido, error } = await supabase
                    .from('pedidos')
                    .select(`
                        id_pedido,
                        numero_pedido_proveedor,
                        codigo_seguimiento,
                        estado,
                        total,
                        clientes(nombre_cliente),
                        proveedores(nombre_proveedor)
                    `)
                    .eq('codigo_seguimiento', codigoCancelacion)
                    .single()

                if (error || !pedido) {
                    await flowDynamic(`❌ No se encontró ningún pedido con el código: ${codigoCancelacion}`)
                    return
                }

                // Verificar si se puede cancelar
                if (pedido.estado === 'completado') {
                    await flowDynamic(`⚠️ No se puede cancelar el pedido ${pedido.codigo_seguimiento} porque ya está completado.`)
                    return
                }

                if (pedido.estado === 'cancelado') {
                    await flowDynamic(`ℹ️ El pedido ${pedido.codigo_seguimiento} ya está cancelado.`)
                    return
                }

                // Obtener detalles para restaurar stock
                const { data: detalles } = await supabase
                    .from('detalle_pedido')
                    .select('id_producto, cantidad')
                    .eq('id_pedido', pedido.id_pedido)

                // Cancelar el pedido
                const { error: cancelError } = await supabase
                    .from('pedidos')
                    .update({
                        estado: 'cancelado',
                        fecha_actualizacion: new Date(),
                        notas: `${pedido.notas || ''} - CANCELADO VÍA CHATBOT`
                    })
                    .eq('id_pedido', pedido.id_pedido)

                if (cancelError) {
                    await flowDynamic(`⚠️ Error al cancelar el pedido: ${cancelError.message}`)
                    return
                }

                // Restaurar stock
                if (detalles && detalles.length > 0) {
                    for (const detalle of detalles) {
                        const { data: producto } = await supabase
                            .from('producto')
                            .select('cantidad_producto')
                            .eq('id_producto', detalle.id_producto)
                            .single()

                        if (producto) {
                            const nuevoStock = (producto.cantidad_producto || 0) + detalle.cantidad

                            await supabase
                                .from('producto')
                                .update({ cantidad_producto: nuevoStock })
                                .eq('id_producto', detalle.id_producto)
                        }
                    }
                }

                await flowDynamic(`✅ *PEDIDO CANCELADO EXITOSAMENTE*\n\n📊 *Código:* ${pedido.codigo_seguimiento}\n🔢 *Pedido #${pedido.numero_pedido_proveedor}*\n👤 *Cliente:* ${pedido.clientes.nombre_cliente}\n🏪 *Proveedor:* ${pedido.proveedores.nombre_proveedor}\n💰 *Total:* ${pedido.total}\n\n📦 El stock de los productos ha sido restaurado.\n\n💡 Si necesitas hacer un nuevo pedido, escribe "nuevo pedido".`)

            } catch (error) {
                console.error('❌ Error cancelando pedido:', error)
                await flowDynamic('⚠️ Error al cancelar el pedido. Inténtalo nuevamente.')
            }
        })

// 🆕 Flujo de información de contacto
const contactoFlow = addKeyword(['contacto', 'ayuda', 'soporte'])
    .addAnswer([
        '📞 *INFORMACIÓN DE CONTACTO*',
        '',
        '🤖 *Chatbot Luixa*',
        'Tu asistente virtual para pedidos',
        '',
        '💡 *Comandos disponibles:*',
        '• "menu" - Ver todas las opciones',
        '• "nuevo pedido" - Crear pedido',
        '• "consultar estado" - Ver tus pedidos',
        '• "buscar pedido" - Buscar por código',
        '• "mis estadisticas" - Ver resumen',
        '• "catalogo" - Ver productos',
        '• "cancelar pedido" - Cancelar pedido',
        '',
        '🔧 *Soporte técnico:*',
        'Si tienes problemas con el chatbot, contacta al administrador del sistema.',
        '',
        '⏰ *Horario de atención:*',
        'El chatbot está disponible 24/7',
        '',
        '💬 Escribe "menu" para regresar al menú principal.'
    ].join('\n'))

// 🚩 Flujo para corregir datos del cliente
const corregirClienteFlow = addKeyword(['corregir cliente', 'cambiar cliente'])
    .addAnswer('🔄 Vamos a corregir los datos del cliente.')
    .addAnswer('👤 Por favor, ingresa el nuevo número de teléfono del cliente (ejemplo: +52 246 123 4567)',
        { capture: true },
        async (ctx, { state, flowDynamic }) => {
            const numeroCliente = ctx.body.trim()
            await state.update({ numeroCliente })

            // Buscar cliente por teléfono
            const { data: cliente, error: clienteError } = await supabase
                .from('clientes')
                .select('id_cliente, nombre_cliente')
                .eq('telefono_cliente', numeroCliente)
                .single()

            if (clienteError || !cliente) {
                await flowDynamic(`❌ No encontré un cliente registrado con el número ${numeroCliente}. Por favor verifica que el número esté registrado en el sistema.\n\n¿Quieres intentar con otro número? Escribe "corregir cliente" nuevamente.`)
                return
            }

            await state.update({
                idCliente: cliente.id_cliente,
                nombreCliente: cliente.nombre_cliente
            })
            await flowDynamic(`✅ Cliente actualizado: ${cliente.nombre_cliente}\n\n¿Los datos del proveedor están correctos? Si no, escribe "corregir proveedor". Si están bien, puedes continuar escribiendo tu pedido.`)
        })

// 🚩 Flujo para corregir datos del proveedor
const corregirProveedorFlow = addKeyword(['corregir proveedor', 'cambiar proveedor'])
    .addAnswer('🔄 Vamos a corregir los datos del proveedor.')
    .addAnswer('🏪 Por favor, ingresa el nuevo número del proveedor (ejemplo: +52 246 987 6543)',
        { capture: true },
        async (ctx, { state, flowDynamic }) => {
            const numeroProveedor = ctx.body.trim()
            await state.update({ numeroProveedor })

            // Buscar proveedor por teléfono  
            const { data: proveedor, error: proveedorError } = await supabase
                .from('proveedores')
                .select('id_proveedor, nombre_proveedor')
                .eq('telefono_proveedor', numeroProveedor)
                .single()

            if (proveedorError || !proveedor) {
                await flowDynamic(`❌ No encontré un proveedor registrado con el número ${numeroProveedor}. Por favor verifica que el número esté registrado en el sistema.\n\n¿Quieres intentar con otro número? Escribe "corregir proveedor" nuevamente.`)
                return
            }

            await state.update({
                idProveedor: proveedor.id_proveedor,
                nombreProveedor: proveedor.nombre_proveedor
            })
            await flowDynamic(`✅ Proveedor actualizado: ${proveedor.nombre_proveedor}`)

            // Mostrar catálogo del proveedor actualizado
            const { data: productos, error: productosError } = await supabase
                .from('producto')
                .select('*')
                .eq('id_proveedor', proveedor.id_proveedor)
                .order('nombre_producto')

            if (productosError || !productos || productos.length === 0) {
                await flowDynamic(`⚠️ No se encontraron productos para el proveedor ${proveedor.nombre_proveedor}`)
                return
            }

            // Formatear catálogo
            let catalogo = `📋 *CATÁLOGO ACTUALIZADO DE ${proveedor.nombre_proveedor.toUpperCase()}*\n\n`
            productos.forEach((producto, index) => {
                catalogo += `${index + 1}. 🛍️ *${producto.nombre_producto}*\n`
                catalogo += `   📂 Categoría: ${producto.categoria_producto}\n`
                catalogo += `   📏 Talla: ${producto.talla_producto}\n`
                catalogo += `   💲 Precio: ${producto.precio_producto}\n`
                catalogo += `   📦 Stock: ${producto.cantidad_producto || 0} unidades\n\n`
            })

            await flowDynamic(catalogo)
            await flowDynamic('🛍️ Ahora puedes escribir tu pedido basándote en el catálogo actualizado.')
        })

// 🚩 Flujo SEPARADO para confirmar el pedido
const confirmarPedidoFlow = addKeyword(['confirmar'], { regex: false })
    .addAnswer(
        '⏳ Confirmando tu pedido...',
        null,
        async (ctx, { flowDynamic, state }) => {
            console.log('✅ [CONFIRM] confirmarPedidoFlow activado')

            const pedidoTemporal = state.get('pedidoTemporal')
            const totalTemporal = state.get('totalTemporal')
            const idCliente = state.get('idCliente')
            const idProveedor = state.get('idProveedor')

            console.log('📋 Estado en confirmarPedidoFlow:', {
                pedidoTemporal: pedidoTemporal?.length,
                totalTemporal,
                idCliente,
                idProveedor
            })

            if (!pedidoTemporal || !Array.isArray(pedidoTemporal) || pedidoTemporal.length === 0) {
                await flowDynamic('❌ No hay un pedido para confirmar. Por favor, ingresa tu pedido primero.')
                return
            }

            if (!idCliente || !idProveedor) {
                await flowDynamic('❌ Error: faltan datos del cliente o proveedor.')
                return
            }

            // Llamar a la función de procesamiento
            console.log('🟢 [CONFIRM] Llamando a procesarPedidoConfirmado...')
            await procesarPedidoConfirmado(ctx, { flowDynamic, state })
        }
    )

// 🚩 Flujo para consultar estado de pedidos - KEYWORDS ÚNICOS
const estadoPedidosFlow = addKeyword(['consultar estado', 'estado de mis pedidos', 'ver mis pedidos'])
    .addAnswer('📋 Para consultar el estado de tus pedidos necesito algunos datos.')
    .addAnswer('👤 ¿Cuál es tu número de teléfono? (ejemplo: +52 246 123 4567)',
        { capture: true },
        async (ctx, { state, flowDynamic }) => {
            const numeroCliente = ctx.body.trim()
            await state.update({ numeroClienteConsulta: numeroCliente })

            // Buscar cliente por teléfono
            const { data: cliente, error: clienteError } = await supabase
                .from('clientes')
                .select('id_cliente, nombre_cliente')
                .eq('telefono_cliente', numeroCliente)
                .single()

            if (clienteError || !cliente) {
                await flowDynamic(`❌ No encontré un cliente registrado con el número ${numeroCliente}. Por favor verifica que el número esté registrado en el sistema.`)
                return
            }

            await state.update({
                idClienteConsulta: cliente.id_cliente,
                nombreClienteConsulta: cliente.nombre_cliente
            })
            await flowDynamic(`✅ Cliente encontrado: ${cliente.nombre_cliente}`)
        })
    .addAnswer('🏪 ¿Cuál es el número del proveedor cuyos pedidos quieres consultar? (ejemplo: +52 246 987 6543)',
        { capture: true },
        async (ctx, { state, flowDynamic }) => {
            const numeroProveedor = ctx.body.trim()
            await state.update({ numeroProveedorConsulta: numeroProveedor })

            // Buscar proveedor por teléfono
            const { data: proveedor, error: proveedorError } = await supabase
                .from('proveedores')
                .select('id_proveedor, nombre_proveedor')
                .eq('telefono_proveedor', numeroProveedor)
                .single()

            if (proveedorError || !proveedor) {
                await flowDynamic(`❌ No encontré un proveedor registrado con el número ${numeroProveedor}. Por favor verifica que el número esté registrado en el sistema.`)
                return
            }

            await state.update({
                idProveedorConsulta: proveedor.id_proveedor,
                nombreProveedorConsulta: proveedor.nombre_proveedor
            })
            await flowDynamic(`✅ Proveedor encontrado: ${proveedor.nombre_proveedor}`)

            // Buscar pedidos del cliente con el proveedor
            const idClienteConsulta = state.get('idClienteConsulta')
            const nombreClienteConsulta = state.get('nombreClienteConsulta')

            console.log('🔍 Buscando pedidos para:', {
                idCliente: idClienteConsulta,
                idProveedor: proveedor.id_proveedor
            })

            const { data: pedidos, error: pedidosError } = await supabase
                .from('pedidos')
                .select(`
                    id_pedido,
                    numero_pedido_proveedor,
                    codigo_seguimiento,
                    fecha_creacion,
                    fecha_actualizacion,
                    fecha_estimada_entrega,
                    estado,
                    total,
                    notas
                `)
                .eq('id_cliente', idClienteConsulta)
                .eq('id_proveedor', proveedor.id_proveedor)
                .order('numero_pedido_proveedor', { ascending: false })

            if (pedidosError) {
                console.error('❌ Error consultando pedidos:', pedidosError)
                await flowDynamic(`⚠️ Error al consultar tus pedidos: ${pedidosError.message}`)
                return
            }

            if (!pedidos || pedidos.length === 0) {
                await flowDynamic(`📋 No se encontraron pedidos entre el cliente ${nombreClienteConsulta} y el proveedor ${proveedor.nombre_proveedor}.`)
                return
            }

            // Obtener detalles de cada pedido
            const pedidosIds = pedidos.map(p => p.id_pedido)

            const { data: detalles } = await supabase
                .from('detalle_pedido')
                .select(`
                    id_pedido,
                    cantidad,
                    precio_unitario,
                    talla,
                    id_producto
                `)
                .in('id_pedido', pedidosIds)

            let productosInfo = {}
            if (detalles && detalles.length > 0) {
                const productosIds = [...new Set(detalles.map(d => d.id_producto))]

                const { data: productos } = await supabase
                    .from('producto')
                    .select('id_producto, nombre_producto, categoria_producto')
                    .in('id_producto', productosIds)

                if (productos) {
                    productos.forEach(producto => {
                        productosInfo[producto.id_producto] = producto
                    })
                }
            }

            // Formatear respuesta
            let respuesta = `📋 *ESTADO DE TUS PEDIDOS*\n\n`
            respuesta += `👤 Cliente: ${nombreClienteConsulta}\n`
            respuesta += `🏪 Proveedor: ${proveedor.nombre_proveedor}\n`
            respuesta += `📊 Total de pedidos: ${pedidos.length}\n\n`

            // Función auxiliar para formatear fecha
            const formatearFecha = (fecha) => {
                const date = new Date(fecha)
                return date.toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })
            }

            // Función auxiliar para obtener emoji del estado
            const obtenerEmojiEstado = (estado) => {
                switch (estado?.toLowerCase()) {
                    case 'pendiente': return '⏳'
                    case 'completado': return '✅'
                    case 'cancelado': return '❌'
                    case 'en_proceso': return '🔄'
                    default: return '📋'
                }
            }

            pedidos.forEach((pedido, index) => {
                const estadoEmoji = obtenerEmojiEstado(pedido.estado)
                const fechaCreacion = formatearFecha(pedido.fecha_creacion)
                const fechaActualizacion = pedido.fecha_actualizacion ?
                    formatearFecha(pedido.fecha_actualizacion) : 'No actualizado'

                respuesta += `${index + 1}. 🆔 *Pedido #${pedido.numero_pedido_proveedor}*\n`
                respuesta += `   📊 Código: ${pedido.codigo_seguimiento}\n`
                respuesta += `   ${estadoEmoji} *Estado:* ${pedido.estado?.toUpperCase() || 'NO DEFINIDO'}\n`
                respuesta += `   📅 *Creado:* ${fechaCreacion}\n`
                respuesta += `   🔄 *Actualizado:* ${fechaActualizacion}\n`

                if (pedido.fecha_estimada_entrega) {
                    respuesta += `   🚚 *Entrega:* ${formatearFecha(pedido.fecha_estimada_entrega)}\n`
                }

                respuesta += `   💰 *Total:* ${pedido.total}\n`

                if (pedido.notas) {
                    respuesta += `   📝 *Notas:* ${pedido.notas}\n`
                }

                // Agregar productos del pedido
                const productosPedido = detalles ? detalles.filter(d => d.id_pedido === pedido.id_pedido) : []
                if (productosPedido.length > 0) {
                    respuesta += `   🛍️ *Productos:*\n`
                    productosPedido.forEach(detalle => {
                        const producto = productosInfo[detalle.id_producto]
                        const nombreProducto = producto ? producto.nombre_producto : 'Producto no encontrado'
                        const subtotal = detalle.cantidad * detalle.precio_unitario

                        respuesta += `      • ${nombreProducto} (Talla: ${detalle.talla})\n`
                        respuesta += `        Cant: ${detalle.cantidad} x ${detalle.precio_unitario} = ${subtotal}\n`
                    })
                }
                respuesta += `\n`
            })

            // Agregar leyenda de estados
            respuesta += `📖 *LEYENDA DE ESTADOS:*\n`
            respuesta += `⏳ *PENDIENTE* - El pedido está esperando confirmación del proveedor\n`
            respuesta += `✅ *COMPLETADO* - El pedido ha sido confirmado y procesado\n`
            respuesta += `❌ *CANCELADO* - El pedido ha sido rechazado o cancelado\n`
            respuesta += `🔄 *EN_PROCESO* - El pedido está siendo preparado\n\n`
            respuesta += `💡 *Tip:* Usa el código de seguimiento para buscar pedidos específicos con "buscar pedido".`

            await flowDynamic(respuesta)
        })

// 🚩 Flujo principal de pedidos - KEYWORDS ÚNICOS
const orderFlow = addKeyword(['nuevo pedido', 'hacer pedido', 'crear pedido'])
    .addAnswer('📋 Para procesar tu pedido necesito algunos datos primero.')
    .addAnswer('👤 ¿Cuál es tu número de teléfono? (ejemplo: +52 246 123 4567)',
        { capture: true },
        async (ctx, { state, flowDynamic }) => {
            const numeroCliente = ctx.body.trim()
            await state.update({ numeroCliente })

            // Buscar cliente por teléfono
            const { data: cliente, error: clienteError } = await supabase
                .from('clientes')
                .select('id_cliente, nombre_cliente')
                .eq('telefono_cliente', numeroCliente)
                .single()

            if (clienteError || !cliente) {
                await flowDynamic(`❌ No encontré un cliente registrado con el número ${numeroCliente}. Por favor verifica que el número esté registrado en el sistema.`)
                return
            }

            await state.update({
                idCliente: cliente.id_cliente,
                nombreCliente: cliente.nombre_cliente
            })
            await flowDynamic(`✅ Cliente encontrado: ${cliente.nombre_cliente}`)
        })
    .addAnswer('🏪 ¿Cuál es el número del proveedor? (ejemplo: +52 246 987 6543)',
        { capture: true },
        async (ctx, { state, flowDynamic }) => {
            const numeroProveedor = ctx.body.trim()
            await state.update({ numeroProveedor })

            // Buscar proveedor por teléfono
            const { data: proveedor, error: proveedorError } = await supabase
                .from('proveedores')
                .select('id_proveedor, nombre_proveedor')
                .eq('telefono_proveedor', numeroProveedor)
                .single()

            if (proveedorError || !proveedor) {
                await flowDynamic(`❌ No encontré un proveedor registrado con el número ${numeroProveedor}. Por favor verifica que el número esté registrado en el sistema.`)
                return
            }

            await state.update({
                idProveedor: proveedor.id_proveedor,
                nombreProveedor: proveedor.nombre_proveedor
            })
            await flowDynamic(`✅ Proveedor encontrado: ${proveedor.nombre_proveedor}`)

            // Mostrar catálogo del proveedor
            const { data: productos, error: productosError } = await supabase
                .from('producto')
                .select('*')
                .eq('id_proveedor', proveedor.id_proveedor)
                .order('nombre_producto')

            if (productosError || !productos || productos.length === 0) {
                await flowDynamic(`⚠️ No se encontraron productos para el proveedor ${proveedor.nombre_proveedor}`)
                return
            }

            // Formatear catálogo
            let catalogo = `📋 *CATÁLOGO DE ${proveedor.nombre_proveedor.toUpperCase()}*\n\n`
            productos.forEach((producto, index) => {
                catalogo += `${index + 1}. 🛍️ *${producto.nombre_producto}*\n`
                catalogo += `   📂 Categoría: ${producto.categoria_producto}\n`
                catalogo += `   📏 Talla: ${producto.talla_producto}\n`
                catalogo += `   💲 Precio: ${producto.precio_producto}\n`
                catalogo += `   📦 Stock: ${producto.cantidad_producto || 0} unidades\n\n`
            })

            await flowDynamic(catalogo)
        })
    .addAnswer('🛍️ ¡Perfecto! Ahora escribe tu pedido basándote en el catálogo mostrado. Puedes ingresar varios productos, un producto por línea.\n\n*Formato:* cantidad producto talla talla_producto\n\n*Ejemplo:*\n2 camisetas talla M\n8 pantalones talla 36\n6 calcetines talla unitalla\n\n💡 *Comandos útiles:*\n- Escribe "corregir cliente" para cambiar los datos del cliente\n- Escribe "corregir proveedor" para cambiar los datos del proveedor',
        { capture: true },
        async (ctx, { flowDynamic, state, gotoFlow }) => {
            const message = ctx.body.trim()
            const messageLower = message.toLowerCase()

            console.log('📥 [PEDIDO] Mensaje recibido:', JSON.stringify(message))
            console.log('📊 [PEDIDO] Estado actual:')
            console.log('   idCliente:', state.get('idCliente'))
            console.log('   idProveedor:', state.get('idProveedor'))
            console.log('   pedidoTemporal length:', state.get('pedidoTemporal')?.length)

            // Verificar comandos especiales
            if (messageLower.includes('corregir cliente')) {
                console.log('🔄 Redirigiendo a corregir cliente')
                return gotoFlow(corregirClienteFlow)
            }

            if (messageLower.includes('corregir proveedor')) {
                console.log('🔄 Redirigiendo a corregir proveedor')
                return gotoFlow(corregirProveedorFlow)
            }

            // Procesar como pedido normal
            const lineas = message.split('\n').map(l => l.trim()).filter(l => l.length > 0)

            if (lineas.length === 0) {
                await flowDynamic('❌ No entendí tu mensaje. Por favor escribe cada producto en una línea con el formato: "cantidad producto talla talla_producto".\n\n💡 O usa "corregir cliente" / "corregir proveedor" si necesitas cambiar datos.')
                return
            }

            // Obtener datos del estado
            const idCliente = state.get('idCliente')
            const idProveedor = state.get('idProveedor')
            const nombreCliente = state.get('nombreCliente')
            const nombreProveedor = state.get('nombreProveedor')

            if (!idCliente || !idProveedor) {
                await flowDynamic('❌ Error: Faltan datos del cliente o proveedor. Por favor usa "corregir cliente" o "corregir proveedor" para actualizar los datos.')
                return
            }

            await flowDynamic(`📋 Procesando pedido para:\n👤 Cliente: ${nombreCliente}\n🏪 Proveedor: ${nombreProveedor}`)

            let pedidoTemporal = []
            let totalPedido = 0
            let hayErrores = false

            // Validar cada línea
            for (const linea of lineas) {
                const match = linea.match(/(\d+)\s+([a-záéíóúñ\s]+)\s+talla\s+(\w+)/i)

                if (!match) {
                    await flowDynamic(`⚠️ La línea: "${linea}" no tiene el formato esperado. Debe ser: "cantidad producto talla talla_producto".`)
                    hayErrores = true
                    continue
                }

                const cantidad = parseInt(match[1])
                const nombre_producto = match[2].trim()
                const talla = match[3].trim()

                console.log(`🔍 Validando línea: cantidad=${cantidad}, producto="${nombre_producto}", talla="${talla}"`)

                // Búsqueda de productos
                let { data: productos, error } = await supabase
                    .from('producto')
                    .select('id_producto, precio_producto, nombre_producto, cantidad_producto, talla_producto')
                    .eq('nombre_producto', nombre_producto)
                    .eq('talla_producto', talla)
                    .eq('id_proveedor', idProveedor)

                // Si no encuentra nada, intentar búsqueda con ilike
                if (!productos || productos.length === 0) {
                    console.log(`🔍 Búsqueda exacta falló, intentando con ilike...`)
                    const resultado = await supabase
                        .from('producto')
                        .select('id_producto, precio_producto, nombre_producto, cantidad_producto, talla_producto')
                        .ilike('nombre_producto', `%${nombre_producto}%`)
                        .eq('talla_producto', talla)
                        .eq('id_proveedor', idProveedor)

                    productos = resultado.data
                    error = resultado.error
                }

                // Si aún no encuentra, intentar búsqueda más flexible con talla
                if (!productos || productos.length === 0) {
                    console.log(`🔍 Búsqueda con ilike falló, intentando talla flexible...`)
                    const resultado = await supabase
                        .from('producto')
                        .select('id_producto, precio_producto, nombre_producto, cantidad_producto, talla_producto')
                        .ilike('nombre_producto', `%${nombre_producto}%`)
                        .ilike('talla_producto', `%${talla}%`)
                        .eq('id_proveedor', idProveedor)

                    productos = resultado.data
                    error = resultado.error
                }

                console.log(`📊 Productos encontrados:`, productos?.length || 0)

                if (error) {
                    console.error('❌ Error buscando producto:', error)
                    await flowDynamic(`⚠️ Error al buscar el producto "${nombre_producto}" talla "${talla}".`)
                    hayErrores = true
                    continue
                }

                if (!productos || productos.length === 0) {
                    // Mostrar productos disponibles del proveedor para ayudar al usuario
                    const { data: productosDisponibles } = await supabase
                        .from('producto')
                        .select('nombre_producto, talla_producto')
                        .eq('id_proveedor', idProveedor)
                        .limit(5)

                    let sugerencias = ''
                    if (productosDisponibles && productosDisponibles.length > 0) {
                        sugerencias = '\n\n📋 *Productos disponibles del proveedor:*\n'
                        productosDisponibles.forEach((p, index) => {
                            sugerencias += `${index + 1}. ${p.nombre_producto} (Talla: ${p.talla_producto})\n`
                        })
                    }

                    await flowDynamic(`❌ No encontré el producto "${nombre_producto}" en talla "${talla}" del proveedor ${nombreProveedor}.${sugerencias}`)
                    hayErrores = true
                    continue
                }

                const producto = productos[0]

                // Validar stock disponible
                const stockDisponible = producto.cantidad_producto || 0
                if (cantidad > stockDisponible) {
                    await flowDynamic(`❌ Stock insuficiente para "${producto.nombre_producto}" talla "${producto.talla_producto}". Stock disponible: ${stockDisponible}, solicitado: ${cantidad}`)
                    hayErrores = true
                    continue
                }

                const precio_unitario = producto.precio_producto
                const subtotal = cantidad * precio_unitario
                totalPedido += subtotal

                // Agregar al pedido temporal
                pedidoTemporal.push({
                    id_producto: producto.id_producto,
                    nombre_producto: producto.nombre_producto,
                    talla: producto.talla_producto,
                    cantidad: cantidad,
                    precio_unitario: precio_unitario,
                    subtotal: subtotal,
                    stock_disponible: stockDisponible
                })

                await flowDynamic(`✅ Producto validado:\n🛍️ ${producto.nombre_producto}\n📏 Talla: ${producto.talla_producto}\n📦 Cantidad: ${cantidad}\n💲 Precio unitario: ${precio_unitario}\n💰 Subtotal: ${subtotal}`)
            }

            if (hayErrores) {
                await flowDynamic(`⚠️ Hay errores en tu pedido. Por favor corrígelos y vuelve a enviar tu pedido completo.\n\n💡 También puedes usar "corregir cliente" o "corregir proveedor" si el problema es con los datos.`)
                return
            }

            if (pedidoTemporal.length === 0) {
                await flowDynamic(`❌ No se pudo procesar ningún producto. Verifica tu pedido y intenta nuevamente.`)
                return
            }

            // ✅ GUARDAR PEDIDO TEMPORAL EN EL ESTADO
            await state.update({
                pedidoTemporal,
                totalTemporal: totalPedido
            })

            console.log('💾 Estado guardado correctamente:', {
                pedidoTemporalLength: pedidoTemporal.length,
                totalTemporal: totalPedido,
                productos: pedidoTemporal.map(p => p.nombre_producto)
            })

            // Mostrar resumen del pedido
            let resumen = `📋 *RESUMEN DE TU PEDIDO*\n\n`
            resumen += `👤 Cliente: ${nombreCliente}\n`
            resumen += `🏪 Proveedor: ${nombreProveedor}\n\n`
            resumen += `🛍️ *PRODUCTOS:*\n`

            pedidoTemporal.forEach((item, index) => {
                resumen += `${index + 1}. ${item.nombre_producto} (Talla: ${item.talla})\n`
                resumen += `   Cantidad: ${item.cantidad} x ${item.precio_unitario} = ${item.subtotal}\n\n`
            })

            resumen += `💰 *TOTAL: ${totalPedido}*\n\n`
            resumen += `✅ Si todo está correcto, escribe exactamente *"confirmar"* para procesar tu pedido.\n`
            resumen += `✏️ Si necesitas modificar algo, simplemente escribe tu pedido nuevamente.\n`
            resumen += `🔄 O usa "corregir cliente" / "corregir proveedor" para cambiar datos.`

            await flowDynamic(resumen)
        })

const main = async () => {
    // ✅ FLUJOS CON KEYWORDS ÚNICOS Y SIN CONFLICTOS
    const adapterFlow = createFlow([
        orderFlow,              // Keywords: ['nuevo pedido', 'hacer pedido', 'crear pedido']
        estadoPedidosFlow,      // Keywords: ['consultar estado', 'estado de mis pedidos', 'ver mis pedidos']
        confirmarPedidoFlow,    // Keywords: ['confirmar']
        corregirClienteFlow,    // Keywords: ['corregir cliente', 'cambiar cliente']
        corregirProveedorFlow,  // Keywords: ['corregir proveedor', 'cambiar proveedor']
        buscarPedidoFlow,       // Keywords: ['buscar pedido', 'buscar', 'codigo seguimiento'] 🆕
        estadisticasFlow,       // Keywords: ['mis estadisticas', 'estadisticas', 'resumen'] 🆕
        catalogoFlow,           // Keywords: ['catalogo', 'productos', 'ver catalogo'] 🆕
        cancelarPedidoFlow,     // Keywords: ['cancelar pedido', 'cancelar'] 🆕
        contactoFlow,           // Keywords: ['contacto', 'ayuda', 'soporte'] 🆕
        welcomeFlow,            // Keywords: ['Hola', 'Hi', 'Hello', 'hola', 'hi', 'hello', 'menu', 'ayuda']
    ])

    const adapterProvider = createProvider(Provider, {
        jwtToken: 'EAAHgtyyubZAEBPSFiQiaYoL49rRfw2R5a0Fxlj3uDnUMJvZBDNDVcRdbpNuziZCqs8i0OtxP9q35Yz0NOVaDSPTvwxLkRZBcKxJ2DWXxFRqcpqNci3mGo5u4LTm4xmkb0P8FEhhTkBxKdIjTQHdvZBQUvwIAtnRkjeo1VL3RMZC0ZC8s0bcWHvrWizVD1meZCB5c3DZCOEMWzuR7hL2V1xbu9APXf5U3awCC6sZCc3cgot1QZDZD',
        numberId: '750097284860511',
        verifyToken: 'Luixa_chatbot',
        version: 'v22.0'
    })
    const adapterDB = new Database()

    const { handleCtx, httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    adapterProvider.server.post(
        '/v1/messages',
        handleCtx(async (bot, req, res) => {
            const { number, message, urlMedia } = req.body
            await bot.sendMessage(number, message, { media: urlMedia ?? null })
            return res.end('sended')
        })
    )

    adapterProvider.server.post(
        '/v1/register',
        handleCtx(async (bot, req, res) => {
            const { number, name } = req.body
            await bot.dispatch('REGISTER_FLOW', { from: number, name })
            return res.end('trigger')
        })
    )

    adapterProvider.server.post(
        '/v1/samples',
        handleCtx(async (bot, req, res) => {
            const { number, name } = req.body
            await bot.dispatch('SAMPLES', { from: number, name })
            return res.end('trigger')
        })
    )

    adapterProvider.server.post(
        '/v1/blacklist',
        handleCtx(async (bot, req, res) => {
            const { number, intent } = req.body
            if (intent === 'remove') bot.blacklist.remove(number)
            if (intent === 'add') bot.blacklist.add(number)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', number, intent }))
        })
    )

    httpServer(+PORT)
}

main()