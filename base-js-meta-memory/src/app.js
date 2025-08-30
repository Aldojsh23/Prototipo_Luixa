import { createBot, createProvider, createFlow, addKeyword } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { MetaProvider as Provider } from '@builderbot/provider-meta'
import { supabase } from './supabase.js'

const PORT = process.env.PORT ?? 3008

// 🚩 Flujo WELCOME
const welcomeFlow = addKeyword(['Hola', 'Hi', 'Hello'], { start: true })
    .addAnswer(`Holaa, soy Luixa, tu *Chatbot* para los pedidos`)
    .addAnswer(
        [
            'Ingresa tu pedido para que pueda ayudarte a realizarlo',
            'Ingresa la palabra *pedido*',
        ].join('\n')
    )

// 🚩 Función para procesar pedido confirmado - CORREGIDA
const procesarPedidoConfirmado = async (ctx, { flowDynamic, state }) => {
    console.log('🔍 Iniciando procesarPedidoConfirmado...')

    const pedidoTemporal = state.get('pedidoTemporal')
    const totalTemporal = state.get('totalTemporal')
    const idCliente = state.get('idCliente')
    const idProveedor = state.get('idProveedor')
    const nombreCliente = state.get('nombreCliente')
    const nombreProveedor = state.get('nombreProveedor')

    // Validaciones mejoradas
    if (!pedidoTemporal || !Array.isArray(pedidoTemporal) || pedidoTemporal.length === 0) {
        console.log('❌ No hay pedido temporal válido')
        await flowDynamic('❌ No hay pedido para confirmar. Por favor, ingresa tu pedido primero.')
        return
    }

    // Agregar ANTES de la inserción del pedido (línea ~26):
    console.log('🔍 Datos antes de insertar pedido:')
    console.log('idCliente:', idCliente, typeof idCliente)
    console.log('idProveedor:', idProveedor, typeof idProveedor)
    console.log('totalTemporal:', totalTemporal, typeof totalTemporal)
    console.log('pedidoTemporal length:', pedidoTemporal.length)

    if (!idCliente || !idProveedor) {
        console.error('❌ Falta idCliente o idProveedor')
        return await flowDynamic('❌ Error: faltan datos del cliente o proveedor.')
    }

    await flowDynamic('⏳ Procesando tu pedido confirmado...')

    try {
        console.log('💾 Insertando pedido en la base de datos...')

        // Crear nuevo pedido en la base de datos
        const { data: pedidoInserted, error: pedidoError } = await supabase
            .from('pedidos')
            .insert([{
                id_cliente: parseInt(idCliente),
                id_proveedor: idProveedor.toString(),
                estado: 'pendiente',
                total: parseFloat(totalTemporal),
                notas: `Pedido creado via chatbot para cliente ${nombreCliente}`
            }])
            .select('id_pedido')
            .single()

        if (pedidoError) {
            console.error('❌ Error insertando pedido:', pedidoError)
            await flowDynamic(`⚠️ Error al crear tu pedido: ${pedidoError.message}`)
            return
        }

        const id_pedido = pedidoInserted.id_pedido
        console.log(`✅ Pedido creado con ID: ${id_pedido}`)

        // Insertar detalles del pedido
        // Insertar detalles del pedido (CORREGIDO con nueva BD)
        const detallesParaInsertar = pedidoTemporal.map(item => ({
            id_pedido: id_pedido,
            id_producto: parseInt(item.id_producto),
            cantidad: parseInt(item.cantidad),
            precio_unitario: parseFloat(item.precio_unitario),
            talla: item.talla
        }))

        console.log('📋 Insertando detalles:', JSON.stringify(detallesParaInsertar, null, 2))

        const { error: detalleError } = await supabase
            .from('detalle_pedido')
            .insert(detallesParaInsertar)

        if (detalleError) {
            console.error('❌ Error insertando detalles:', detalleError)
            await flowDynamic(`⚠️ Error al guardar los detalles: ${detalleError.message}`)
            return
        }

        console.log('✅ Detalles del pedido insertados correctamente')

        // Actualizar stock de productos
        console.log('📦 Actualizando stock de productos...')
        for (const item of pedidoTemporal) {
            const nuevoStock = parseInt(item.stock_disponible) - parseInt(item.cantidad)

            const { error: stockError } = await supabase
                .from('producto')
                .update({ cantidad_producto: nuevoStock })
                .eq('id_producto', parseInt(item.id_producto))

            if (stockError) {
                console.error(`❌ Error actualizando stock del producto ${item.id_producto}:`, stockError)
            } else {
                console.log(`✅ Stock actualizado para producto ${item.id_producto}: ${item.stock_disponible} -> ${nuevoStock}`)
            }
        }

        // Limpiar estado temporal
        console.log('🧹 Limpiando estado temporal...')
        await state.update({
            pedidoTemporal: null,
            totalTemporal: 0
        })

        // Mensaje de confirmación final
        let detalleProductos = ''
        pedidoTemporal.forEach((item, index) => {
            detalleProductos += `${index + 1}. ${item.nombre_producto} (Talla: ${item.talla}) - Cantidad: ${item.cantidad} - $${item.subtotal}\n`
        })

        await flowDynamic(`🎉 *¡PEDIDO CONFIRMADO EXITOSAMENTE!*\n\n📋 *Detalles del pedido:*\n🆔 ID del pedido: ${id_pedido}\n👤 Cliente: ${nombreCliente}\n🏪 Proveedor: ${nombreProveedor}\n\n🛍️ *Productos:*\n${detalleProductos}\n💰 *Total: $${totalTemporal}*\n\n✅ Tu pedido ha sido procesado y el stock ha sido actualizado.\n\n¡Gracias por tu compra! 🛍️`)

        console.log('🎉 Pedido procesado exitosamente')

    } catch (error) {
        console.error('❌ Error inesperado procesando pedido:', error)
        await flowDynamic(`⚠️ Error inesperado al procesar tu pedido: ${error.message}`)
    }
}

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

            // 🚩 MOSTRAR CATÁLOGO DEL PROVEEDOR ACTUALIZADO
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
                catalogo += `   💲 Precio: $${producto.precio_producto}\n`
                catalogo += `   📦 Stock: ${producto.cantidad_producto || 0} unidades\n\n`
            })

            await flowDynamic(catalogo)
            await flowDynamic('🛍️ Ahora puedes escribir tu pedido basándote en el catálogo actualizado.')
        })

const orderFlow = addKeyword(['pedido', 'orden', 'comprar'])
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

            // 🚩 MOSTRAR CATÁLOGO DEL PROVEEDOR
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
                catalogo += `   💲 Precio: $${producto.precio_producto}\n`
                catalogo += `   📦 Stock: ${producto.cantidad_producto || 0} unidades\n\n`
            })

            await flowDynamic(catalogo)
        })
    .addAnswer('🛍️ ¡Perfecto! Ahora escribe tu pedido basándote en el catálogo mostrado. Puedes ingresar varios productos, un producto por línea.\n\n*Formato:* cantidad producto talla talla_producto\n\n*Ejemplo:*\n2 camisetas talla M\n8 pantalones talla 36\n6 calcetines talla unitalla\n\n💡 *Comandos útiles:*\n- Escribe "corregir cliente" para cambiar los datos del cliente\n- Escribe "corregir proveedor" para cambiar los datos del proveedor',
        { capture: true },
        async (ctx, { flowDynamic, state, gotoFlow }) => {
            const message = ctx.body.trim()
            console.log('📥 Mensaje recibido:', message)

            // Verificar comandos especiales
            if (message.toLowerCase().includes('corregir cliente')) {
                console.log('🔄 Redirigiendo a corregir cliente')
                return gotoFlow(corregirClienteFlow)
            }

            if (message.toLowerCase().includes('corregir proveedor')) {
                console.log('🔄 Redirigiendo a corregir proveedor')
                return gotoFlow(corregirProveedorFlow)
            }

            if (message.toLowerCase() === 'confirmar') {
                console.log('✅ Usuario confirmó el pedido, procesando...')
                return await procesarPedidoConfirmado(ctx, { flowDynamic, state })
            }


            const lineas = message.split('\n').map(line => line.trim()).filter(line => line.length > 0)

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

            // 🚩 Validar cada línea SIN guardar en la base de datos
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

                // 🔧 BÚSQUEDA MEJORADA DE PRODUCTOS
                // Primero intentar búsqueda exacta
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

                await flowDynamic(`✅ Producto validado:\n🛍️ ${producto.nombre_producto}\n📏 Talla: ${producto.talla_producto}\n📦 Cantidad: ${cantidad}\n💲 Precio unitario: $${precio_unitario}\n💰 Subtotal: $${subtotal}`)
            }

            if (hayErrores) {
                await flowDynamic(`⚠️ Hay errores en tu pedido. Por favor corrígelos y vuelve a enviar tu pedido completo.\n\n💡 También puedes usar "corregir cliente" o "corregir proveedor" si el problema es con los datos.`)
                return
            }

            if (pedidoTemporal.length === 0) {
                await flowDynamic(`❌ No se pudo procesar ningún producto. Verifica tu pedido y intenta nuevamente.`)
                return
            }

            // Guardar pedido temporal en el estado
            await state.update({
                pedidoTemporal,
                totalTemporal: totalPedido
            })

            console.log('💾 Estado guardado:', {
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
                resumen += `   Cantidad: ${item.cantidad} x $${item.precio_unitario} = $${item.subtotal}\n\n`
            })

            resumen += `💰 *TOTAL: $${totalPedido}*\n\n`
            resumen += `✅ Si todo está correcto, escribe exactamente *"confirmar"* para procesar tu pedido.\n`
            resumen += `✏️ Si necesitas modificar algo, simplemente escribe tu pedido nuevamente.\n`
            resumen += `🔄 O usa "corregir cliente" / "corregir proveedor" para cambiar datos.`

            await flowDynamic(resumen)
        })




const main = async () => {
    // 🚩 REMOVIDO confirmarPedidoFlow del array - YA NO ES NECESARIO
    const adapterFlow = createFlow([
        orderFlow,
        corregirClienteFlow,
        corregirProveedorFlow,
        welcomeFlow,
    ])

    const adapterProvider = createProvider(Provider, {
        jwtToken: 'EAAHgtyyubZAEBPaFuLiRaE0O5XQo99YQ0cmFaLff3cXd8iB8NLiU7SjuLbfhGv10ojjDAsBmja2t7oZAtNzWlN3pnX3Fnt9Qbz6ZCCfGKaPPdgbRZAVftriU24RqBIOlaBl1ZAhqzZA1KBN4ii12u1lftvw1rWdhNdZCcZCdPoGZAuE3BcAdZAZAt8aau9vzHCz1x7ybqAh6H7nuwnxiCUWyjvbum8WCwNrpP4rHslBwC5xvQZDZD',
        numberId: '615071368359931',
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