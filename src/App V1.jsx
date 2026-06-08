import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabaseClient'

const menuItems = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'clients', label: 'Clientes' },
  { id: 'products', label: 'Productos' },
  { id: 'requests', label: 'Solicitudes' },
  { id: 'reports', label: 'Reportes' },
  { id: 'import-export', label: 'Importar / Exportar' },
]

const emptyClientForm = {
  company_name: '',
  contact_name: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  country: 'República Dominicana',
  notes: '',
}

const emptyProductForm = {
  name: '',
  internal_code: '',
  manufacturer_code: '',
  category_name: '',
  subcategory_name: '',
  brand: '',
  description: '',
  observations: '',
  main_image_url: '',
}

const emptyRequestForm = {
  client_id: '',
  product_id: '',
  quantity: 1,
  request_date: new Date().toISOString().slice(0, 10),
  status_id: '',
  comments: '',
}

function App() {
  const [session, setSession] = useState(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [loginLoading, setLoginLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [activePage, setActivePage] = useState('dashboard')

  const [stats, setStats] = useState({
    clients: 0,
    products: 0,
    requests: 0,
  })

  const [recentRequests, setRecentRequests] = useState([])
  const [topProducts, setTopProducts] = useState([])
  const [topClients, setTopClients] = useState([])

  const [clients, setClients] = useState([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [showClientForm, setShowClientForm] = useState(false)
  const [editingClient, setEditingClient] = useState(null)
  const [clientForm, setClientForm] = useState(emptyClientForm)

  const [products, setProducts] = useState([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [productForm, setProductForm] = useState(emptyProductForm)
  const [productImageFile, setProductImageFile] = useState(null)
  const [productImagePreview, setProductImagePreview] = useState('')
    const [uploadingImage, setUploadingImage] = useState(false)
  const [selectedImage, setSelectedImage] = useState(null)
  const [selectedImageTitle, setSelectedImageTitle] = useState('')

  const [requests, setRequests] = useState([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [requestSearch, setRequestSearch] = useState('')
  const [requestStatusFilter, setRequestStatusFilter] = useState('')
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [editingRequest, setEditingRequest] = useState(null)
  const [requestForm, setRequestForm] = useState(emptyRequestForm)

  const [statuses, setStatuses] = useState([])

  const showSuccess = (message) => {
    setSuccessMessage(message)

    window.setTimeout(() => {
      setSuccessMessage('')
    }, 3000)
  }

  const clearMessages = () => {
    setErrorMessage('')
    setSuccessMessage('')
  }

  const loadDashboard = useCallback(async () => {
    const [
      clientsResult,
      productsResult,
      requestsResult,
      recentRequestsResult,
      topProductsResult,
      topClientsResult,
    ] = await Promise.all([
      supabase.from('clients').select('*', { count: 'exact', head: true }),
      supabase.from('products').select('*', { count: 'exact', head: true }),
      supabase.from('requests').select('*', { count: 'exact', head: true }),
      supabase
        .from('request_details')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('top_requested_products').select('*').limit(5),
      supabase.from('top_clients').select('*').limit(5),
    ])

    const firstError =
      clientsResult.error ||
      productsResult.error ||
      requestsResult.error ||
      recentRequestsResult.error ||
      topProductsResult.error ||
      topClientsResult.error

    if (firstError) {
      setErrorMessage(firstError.message)
      return
    }

    setStats({
      clients: clientsResult.count || 0,
      products: productsResult.count || 0,
      requests: requestsResult.count || 0,
    })

    setRecentRequests(recentRequestsResult.data || [])
    setTopProducts(topProductsResult.data || [])
    setTopClients(topClientsResult.data || [])
  }, [])

  const loadStatuses = useCallback(async () => {
    const { data, error } = await supabase
      .from('request_statuses')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setStatuses(data || [])
  }, [])

  const loadClients = useCallback(async () => {
    setClientsLoading(true)

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      setClientsLoading(false)
      return
    }

    setClients(data || [])
    setClientsLoading(false)
  }, [])

  const loadProducts = useCallback(async () => {
    setProductsLoading(true)

    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        categories(name),
        subcategories(name)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      setProductsLoading(false)
      return
    }

    setProducts(data || [])
    setProductsLoading(false)
  }, [])

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true)

    const { data, error } = await supabase
      .from('request_details')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      setRequestsLoading(false)
      return
    }

    setRequests(data || [])
    setRequestsLoading(false)
  }, [])

  const loadRequiredData = useCallback(async () => {
    await Promise.all([
      loadDashboard(),
      loadClients(),
      loadProducts(),
      loadRequests(),
      loadStatuses(),
    ])
  }, [loadDashboard, loadClients, loadProducts, loadRequests, loadStatuses])

  useEffect(() => {
    async function initializeSession() {
      const { data } = await supabase.auth.getSession()

      setSession(data.session)

      if (data.session) {
        await loadRequiredData()
      }

      setLoading(false)
    }

    initializeSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      setSession(currentSession)

      if (currentSession) {
        await loadRequiredData()
      }
    })

    return () => subscription.unsubscribe()
  }, [loadRequiredData])

  async function handleLogin(event) {
    event.preventDefault()
    clearMessages()
    setLoginLoading(true)

    const cleanUsername = username.trim().toLowerCase()
    const email = `${cleanUsername}@sistema.local`

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setErrorMessage(error.message)
    }

    setLoginLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()

    setSession(null)
    setUsername('')
    setPassword('')
    setStats({ clients: 0, products: 0, requests: 0 })
    setRecentRequests([])
    setTopProducts([])
    setTopClients([])
    setClients([])
    setProducts([])
    setRequests([])
    setStatuses([])
    setActivePage('dashboard')
    clearMessages()
  }

  function handleChangePage(pageId) {
    setActivePage(pageId)
    clearMessages()

    if (pageId === 'dashboard') {
      loadDashboard()
    }

    if (pageId === 'clients') {
      loadClients()
    }

    if (pageId === 'products') {
      loadProducts()
    }

    if (pageId === 'requests') {
      loadClients()
      loadProducts()
      loadStatuses()
      loadRequests()
    }
  }

  function openNewClientForm() {
    setEditingClient(null)
    setClientForm(emptyClientForm)
    setShowClientForm(true)
    clearMessages()
  }

  function openEditClientForm(client) {
    setEditingClient(client)
    setClientForm({
      company_name: client.company_name || '',
      contact_name: client.contact_name || '',
      phone: client.phone || '',
      email: client.email || '',
      address: client.address || '',
      city: client.city || '',
      country: client.country || 'República Dominicana',
      notes: client.notes || '',
    })
    setShowClientForm(true)
    clearMessages()
  }

  function closeClientForm() {
    setShowClientForm(false)
    setEditingClient(null)
    setClientForm(emptyClientForm)
  }

  function handleClientFormChange(event) {
    const { name, value } = event.target

    setClientForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }))
  }

  async function handleSaveClient(event) {
    event.preventDefault()
    clearMessages()

    if (!clientForm.company_name.trim()) {
      setErrorMessage('El nombre de la empresa es obligatorio.')
      return
    }

    const payload = {
      company_name: clientForm.company_name.trim(),
      contact_name: clientForm.contact_name.trim(),
      phone: clientForm.phone.trim(),
      email: clientForm.email.trim(),
      address: clientForm.address.trim(),
      city: clientForm.city.trim(),
      country: clientForm.country.trim(),
      notes: clientForm.notes.trim(),
    }

    if (editingClient) {
      const { error } = await supabase
        .from('clients')
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingClient.id)

      if (error) {
        setErrorMessage(error.message)
        return
      }

      showSuccess('Cliente actualizado correctamente.')
    } else {
      const { error } = await supabase.from('clients').insert(payload)

      if (error) {
        setErrorMessage(error.message)
        return
      }

      showSuccess('Cliente creado correctamente.')
    }

    closeClientForm()
    await loadClients()
    await loadDashboard()
  }

  async function handleDeleteClient(client) {
    const confirmed = window.confirm(
      `¿Seguro que deseas eliminar el cliente "${client.company_name}"?`
    )

    if (!confirmed) return

    clearMessages()

    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', client.id)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    showSuccess('Cliente eliminado correctamente.')
    await loadClients()
    await loadDashboard()
  }

  async function getOrCreateCategory(categoryName) {
    const cleanName = categoryName.trim()

    if (!cleanName) return null

    const { data: existingCategory, error: searchError } = await supabase
      .from('categories')
      .select('*')
      .ilike('name', cleanName)
      .maybeSingle()

    if (searchError) {
      throw new Error(searchError.message)
    }

    if (existingCategory) return existingCategory.id

    const { data: createdCategory, error: createError } = await supabase
      .from('categories')
      .insert({
        name: cleanName,
      })
      .select()
      .single()

    if (createError) {
      throw new Error(createError.message)
    }

    return createdCategory.id
  }

  async function getOrCreateSubcategory(subcategoryName, categoryId) {
    const cleanName = subcategoryName.trim()

    if (!cleanName) return null

    const { data: existingSubcategory, error: searchError } = await supabase
      .from('subcategories')
      .select('*')
      .ilike('name', cleanName)
      .eq('category_id', categoryId)
      .maybeSingle()

    if (searchError) {
      throw new Error(searchError.message)
    }

    if (existingSubcategory) return existingSubcategory.id

    const { data: createdSubcategory, error: createError } = await supabase
      .from('subcategories')
      .insert({
        name: cleanName,
        category_id: categoryId,
      })
      .select()
      .single()

    if (createError) {
      throw new Error(createError.message)
    }

    return createdSubcategory.id
  }

function openNewProductForm() {
  setEditingProduct(null)
  setProductForm(emptyProductForm)
  setProductImageFile(null)
  setProductImagePreview('')
  setShowProductForm(true)
  clearMessages()
}

  function openEditProductForm(product) {
    setEditingProduct(product)
    setProductForm({
      name: product.name || '',
      internal_code: product.internal_code || '',
      manufacturer_code: product.manufacturer_code || '',
      category_name: product.categories?.name || '',
      subcategory_name: product.subcategories?.name || '',
      brand: product.brand || '',
      description: product.description || '',
      observations: product.observations || '',
      main_image_url: product.main_image_url || '',
    })
    setProductImageFile(null)
    setProductImagePreview(product.main_image_url || '')
    setShowProductForm(true)
    clearMessages()
  }

  function closeProductForm() {
  setShowProductForm(false)
  setEditingProduct(null)
  setProductForm(emptyProductForm)
  setProductImageFile(null)
  setProductImagePreview('')
}

  function handleProductFormChange(event) {
    const { name, value } = event.target

    setProductForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }))
  }
  function handleProductImageChange(event) {
    const file = event.target.files?.[0]

    if (!file) return

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Debes seleccionar un archivo de imagen.')
      return
    }

    const maxSizeInMb = 5
    const maxSizeInBytes = maxSizeInMb * 1024 * 1024

    if (file.size > maxSizeInBytes) {
      setErrorMessage(`La imagen no debe pesar más de ${maxSizeInMb} MB.`)
      return
    }

    clearMessages()
    setProductImageFile(file)
    setProductImagePreview(URL.createObjectURL(file))
  }

  async function uploadProductImage(productName) {
    if (!productImageFile) {
      return productForm.main_image_url || ''
    }

    setUploadingImage(true)

    try {
      const originalExtension = productImageFile.name.split('.').pop() || 'jpg'
      const fileExtension = originalExtension.toLowerCase()
      const safeProductName =
        productName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') || 'producto'

      const fileName = `${Date.now()}-${safeProductName}.${fileExtension}`
      const filePath = `products/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, productImageFile, {
          cacheControl: '3600',
          upsert: false,
          contentType: productImageFile.type,
        })

      if (uploadError) {
        throw new Error(uploadError.message)
      }

      const { data } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath)

      return data.publicUrl
    } finally {
      setUploadingImage(false)
    }
  }

  async function handleSaveProduct(event) {
    event.preventDefault()
    clearMessages()

    if (!productForm.name.trim()) {
      setErrorMessage('El nombre del producto es obligatorio.')
      return
    }

    try {
      const categoryId = await getOrCreateCategory(productForm.category_name)
      const subcategoryId =
        categoryId && productForm.subcategory_name.trim()
          ? await getOrCreateSubcategory(productForm.subcategory_name, categoryId)
          : null

      const imageUrl = await uploadProductImage(productForm.name)

      const payload = {
        name: productForm.name.trim(),
        internal_code: productForm.internal_code.trim(),
        manufacturer_code: productForm.manufacturer_code.trim(),
        category_id: categoryId,
        subcategory_id: subcategoryId,
        brand: productForm.brand.trim(),
        description: productForm.description.trim(),
        observations: productForm.observations.trim(),
        main_image_url: imageUrl,
      }

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update({
            ...payload,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingProduct.id)

        if (error) {
          setErrorMessage(error.message)
          return
        }

        showSuccess('Producto actualizado correctamente.')
      } else {
        const { error } = await supabase.from('products').insert(payload)

        if (error) {
          setErrorMessage(error.message)
          return
        }

        showSuccess('Producto creado correctamente.')
      }

      closeProductForm()
      await loadProducts()
      await loadDashboard()
    } catch (error) {
      setErrorMessage(error.message)
    }
  }

  async function handleDeleteProduct(product) {
    const confirmed = window.confirm(
      `¿Seguro que deseas eliminar el producto "${product.name}"?`
    )

    if (!confirmed) return

    clearMessages()

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', product.id)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    showSuccess('Producto eliminado correctamente.')
    await loadProducts()
    await loadDashboard()
  }

  function openImageViewer(imageUrl, title) {
    if (!imageUrl) return

    setSelectedImage(imageUrl)
    setSelectedImageTitle(title || 'Imagen del producto')
  }

  function closeImageViewer() {
    setSelectedImage(null)
    setSelectedImageTitle('')
  }

  function openNewRequestForm() {
    setEditingRequest(null)
    setRequestForm({
      ...emptyRequestForm,
      status_id: statuses[0]?.id || '',
    })
    setShowRequestForm(true)
    clearMessages()
  }

  function openEditRequestForm(request) {
    setEditingRequest(request)
    setRequestForm({
      client_id: request.client_id || '',
      product_id: request.product_id || '',
      quantity: request.quantity || 1,
      request_date: request.request_date || new Date().toISOString().slice(0, 10),
      status_id:
        statuses.find((status) => status.name === request.status_name)?.id || '',
      comments: request.comments || '',
    })
    setShowRequestForm(true)
    clearMessages()
  }

  function closeRequestForm() {
    setShowRequestForm(false)
    setEditingRequest(null)
    setRequestForm(emptyRequestForm)
  }

  function handleRequestFormChange(event) {
    const { name, value } = event.target

    setRequestForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }))
  }

  async function handleSaveRequest(event) {
    event.preventDefault()
    clearMessages()

    if (!requestForm.client_id) {
      setErrorMessage('Debes seleccionar un cliente.')
      return
    }

    if (!requestForm.product_id) {
      setErrorMessage('Debes seleccionar un producto.')
      return
    }

    if (!requestForm.status_id) {
      setErrorMessage('Debes seleccionar un estado.')
      return
    }

    const quantity = Number(requestForm.quantity)

    if (Number.isNaN(quantity) || quantity <= 0) {
      setErrorMessage('La cantidad debe ser mayor que cero.')
      return
    }

    const payload = {
      client_id: requestForm.client_id,
      product_id: requestForm.product_id,
      quantity,
      request_date: requestForm.request_date,
      status_id: requestForm.status_id,
      comments: requestForm.comments.trim(),
    }

    if (editingRequest) {
      const oldStatusId =
        statuses.find((status) => status.name === editingRequest.status_name)?.id ||
        null

      const { error } = await supabase
        .from('requests')
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingRequest.id)

      if (error) {
        setErrorMessage(error.message)
        return
      }

      if (oldStatusId !== requestForm.status_id) {
        await supabase.from('request_status_history').insert({
          request_id: editingRequest.id,
          old_status_id: oldStatusId,
          new_status_id: requestForm.status_id,
          comment: 'Cambio de estado desde el sistema',
        })
      }

      showSuccess('Solicitud actualizada correctamente.')
    } else {
      const { data, error } = await supabase
        .from('requests')
        .insert(payload)
        .select()
        .single()

      if (error) {
        setErrorMessage(error.message)
        return
      }

      await supabase.from('request_status_history').insert({
        request_id: data.id,
        old_status_id: null,
        new_status_id: requestForm.status_id,
        comment: 'Solicitud creada',
      })

      showSuccess('Solicitud creada correctamente.')
    }

    closeRequestForm()
    await loadRequests()
    await loadDashboard()
  }

  async function handleDeleteRequest(request) {
    const confirmed = window.confirm('¿Seguro que deseas eliminar esta solicitud?')

    if (!confirmed) return

    clearMessages()

    const { error } = await supabase
      .from('requests')
      .delete()
      .eq('id', request.id)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    showSuccess('Solicitud eliminada correctamente.')
    await loadRequests()
    await loadDashboard()
  }

  function renderPage() {
    if (activePage === 'dashboard') {
      return (
        <DashboardPage
          stats={stats}
          recentRequests={recentRequests}
          topProducts={topProducts}
          topClients={topClients}
          errorMessage={errorMessage}
          successMessage={successMessage}
        />
      )
    }

    if (activePage === 'clients') {
      return (
        <ClientsPage
          clients={clients}
          clientsLoading={clientsLoading}
          clientSearch={clientSearch}
          setClientSearch={setClientSearch}
          showClientForm={showClientForm}
          editingClient={editingClient}
          clientForm={clientForm}
          openNewClientForm={openNewClientForm}
          openEditClientForm={openEditClientForm}
          closeClientForm={closeClientForm}
          handleClientFormChange={handleClientFormChange}
          handleSaveClient={handleSaveClient}
          handleDeleteClient={handleDeleteClient}
          errorMessage={errorMessage}
          successMessage={successMessage}
        />
      )
    }

    if (activePage === 'products') {
      return (
        <ProductsPage
  products={products}
  productsLoading={productsLoading}
  productSearch={productSearch}
  setProductSearch={setProductSearch}
  showProductForm={showProductForm}
  editingProduct={editingProduct}
  productForm={productForm}
  productImagePreview={productImagePreview}
  uploadingImage={uploadingImage}
  openNewProductForm={openNewProductForm}
  openEditProductForm={openEditProductForm}
  closeProductForm={closeProductForm}
  handleProductFormChange={handleProductFormChange}
  handleProductImageChange={handleProductImageChange}
  handleSaveProduct={handleSaveProduct}
  handleDeleteProduct={handleDeleteProduct}
  openImageViewer={openImageViewer}
  errorMessage={errorMessage}
  successMessage={successMessage}
/>
      )
    }

    if (activePage === 'requests') {
      return (
        <RequestsPage
          requests={requests}
          requestsLoading={requestsLoading}
          requestSearch={requestSearch}
          setRequestSearch={setRequestSearch}
          requestStatusFilter={requestStatusFilter}
          setRequestStatusFilter={setRequestStatusFilter}
          showRequestForm={showRequestForm}
          editingRequest={editingRequest}
          requestForm={requestForm}
          clients={clients}
          products={products}
          statuses={statuses}
          openNewRequestForm={openNewRequestForm}
          openEditRequestForm={openEditRequestForm}
          closeRequestForm={closeRequestForm}
          handleRequestFormChange={handleRequestFormChange}
          handleSaveRequest={handleSaveRequest}
          handleDeleteRequest={handleDeleteRequest}
          errorMessage={errorMessage}
          successMessage={successMessage}
        />
      )
    }

    if (activePage === 'reports') {
      return (
        <PlaceholderPage
          title="Reportes"
          description="Aquí agregaremos reportes por cliente, por producto, solicitudes por mes, rankings, exportación PDF y Excel."
          buttonText="Generar reporte"
        />
      )
    }

    if (activePage === 'import-export') {
      return (
        <PlaceholderPage
          title="Importar / Exportar"
          description="Aquí agregaremos importación desde Excel, validaciones, exportación Excel y exportación PDF."
          buttonText="Importar Excel"
        />
      )
    }

    return null
  }

  if (loading) {
    return <p style={styles.loading}>Cargando sistema...</p>
  }

  if (!session) {
    return (
      <div style={styles.loginPage}>
        <div style={styles.loginCard}>
          <h1 style={styles.loginTitle}>Sistema de Repuestos Industriales</h1>
          <p style={styles.loginSubtitle}>Inicia sesión para continuar</p>

          <form onSubmit={handleLogin} style={styles.form}>
            <label style={styles.label}>Usuario</label>
            <input
              style={styles.input}
              type="text"
              placeholder="Escribe tu usuario"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />

            <label style={styles.label}>Contraseña</label>
            <input
              style={styles.input}
              type="password"
              placeholder="Tu contraseña"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            {errorMessage && <p style={styles.error}>Error: {errorMessage}</p>}

            <button
              style={styles.primaryButton}
              type="submit"
              disabled={loginLoading}
            >
              {loginLoading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.app}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.brandIcon}>SR</div>
          <div>
            <h1 style={styles.brandTitle}>Repuestos</h1>
            <p style={styles.brandSubtitle}>Sistema de solicitudes</p>
          </div>
        </div>

        <nav style={styles.nav}>
          {menuItems.map((item) => (
            <button
              key={item.id}
              style={{
                ...styles.navButton,
                ...(activePage === item.id ? styles.navButtonActive : {}),
              }}
              onClick={() => handleChangePage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div style={styles.mainArea}>
        <header style={styles.topbar}>
          <div>
            <h2 style={styles.pageTitle}>
              {menuItems.find((item) => item.id === activePage)?.label}
            </h2>
            <p style={styles.pageSubtitle}>
              Usuario conectado:{' '}
              {session.user.email.replace('@sistema.local', '')}
            </p>
          </div>

          <button style={styles.logoutButton} onClick={handleLogout}>
            Salir
          </button>
        </header>

        <main style={styles.content}>{renderPage()}</main>
      </div>

      {selectedImage && (
        <ImageModal
          imageUrl={selectedImage}
          title={selectedImageTitle}
          onClose={closeImageViewer}
        />
      )}
    </div>
  )
}

function DashboardPage({
  stats,
  recentRequests,
  topProducts,
  topClients,
  errorMessage,
  successMessage,
}) {
  return (
    <div>
      <Messages errorMessage={errorMessage} successMessage={successMessage} />

      <section style={styles.cardsGrid}>
        <StatCard title="Clientes" value={stats.clients} />
        <StatCard title="Productos" value={stats.products} />
        <StatCard title="Solicitudes" value={stats.requests} />
      </section>

      <section style={styles.dashboardGrid}>
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Solicitudes recientes</h3>

          {recentRequests.length === 0 ? (
            <p style={styles.emptyText}>No hay solicitudes recientes.</p>
          ) : (
            <div style={styles.list}>
              {recentRequests.map((request) => (
                <div key={request.id} style={styles.listItem}>
                  <strong>{request.company_name || 'Cliente sin nombre'}</strong>
                  <span>{request.product_name || 'Producto sin nombre'}</span>
                  <small>
                    {request.status_name || 'Sin estado'} · Cantidad:{' '}
                    {request.quantity}
                  </small>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Productos más solicitados</h3>

          {topProducts.length === 0 ? (
            <p style={styles.emptyText}>No hay productos solicitados todavía.</p>
          ) : (
            <div style={styles.list}>
              {topProducts.map((product) => (
                <div key={product.product_id} style={styles.listItem}>
                  <strong>{product.product_name}</strong>
                  <span>{product.brand || 'Sin marca'}</span>
                  <small>
                    Solicitudes: {product.total_requests} · Cantidad:{' '}
                    {product.total_quantity}
                  </small>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Clientes más activos</h3>

          {topClients.length === 0 ? (
            <p style={styles.emptyText}>No hay clientes activos todavía.</p>
          ) : (
            <div style={styles.list}>
              {topClients.map((client) => (
                <div key={client.client_id} style={styles.listItem}>
                  <strong>{client.company_name}</strong>
                  <span>{client.contact_name || 'Sin contacto'}</span>
                  <small>
                    Solicitudes: {client.total_requests} · Cantidad:{' '}
                    {client.total_quantity}
                  </small>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function ClientsPage({
  clients,
  clientsLoading,
  clientSearch,
  setClientSearch,
  showClientForm,
  editingClient,
  clientForm,
  openNewClientForm,
  openEditClientForm,
  closeClientForm,
  handleClientFormChange,
  handleSaveClient,
  handleDeleteClient,
  errorMessage,
  successMessage,
}) {
  const filteredClients = useMemo(() => {
    const search = clientSearch.toLowerCase()

    return clients.filter((client) => {
      return (
        client.company_name?.toLowerCase().includes(search) ||
        client.contact_name?.toLowerCase().includes(search) ||
        client.phone?.toLowerCase().includes(search) ||
        client.email?.toLowerCase().includes(search) ||
        client.city?.toLowerCase().includes(search)
      )
    })
  }, [clients, clientSearch])

  return (
    <div>
      <Messages errorMessage={errorMessage} successMessage={successMessage} />

      <section style={styles.panel}>
        <div style={styles.sectionHeader}>
          <div>
            <h3 style={styles.panelTitle}>Clientes</h3>
            <p style={styles.emptyText}>
              Administra los clientes y empresas que solicitan productos.
            </p>
          </div>

          <button style={styles.primaryButtonSmall} onClick={openNewClientForm}>
            Nuevo cliente
          </button>
        </div>

        <div style={styles.toolbar}>
          <input
            style={styles.input}
            type="text"
            placeholder="Buscar por empresa, contacto, teléfono, correo o ciudad..."
            value={clientSearch}
            onChange={(event) => setClientSearch(event.target.value)}
          />
        </div>

        {showClientForm && (
          <form onSubmit={handleSaveClient} style={styles.formBox}>
            <h4 style={styles.formTitle}>
              {editingClient ? 'Editar cliente' : 'Nuevo cliente'}
            </h4>

            <div style={styles.formGrid}>
              <FormInput
                label="Empresa *"
                name="company_name"
                value={clientForm.company_name}
                onChange={handleClientFormChange}
                placeholder="Nombre de la empresa"
                required
              />

              <FormInput
                label="Contacto"
                name="contact_name"
                value={clientForm.contact_name}
                onChange={handleClientFormChange}
                placeholder="Nombre del contacto"
              />

              <FormInput
                label="Teléfono"
                name="phone"
                value={clientForm.phone}
                onChange={handleClientFormChange}
                placeholder="809-000-0000"
              />

              <FormInput
                label="Correo"
                name="email"
                type="email"
                value={clientForm.email}
                onChange={handleClientFormChange}
                placeholder="cliente@correo.com"
              />

              <FormInput
                label="Ciudad"
                name="city"
                value={clientForm.city}
                onChange={handleClientFormChange}
                placeholder="Santiago"
              />

              <FormInput
                label="País"
                name="country"
                value={clientForm.country}
                onChange={handleClientFormChange}
                placeholder="República Dominicana"
              />
            </div>

            <FormInput
              label="Dirección"
              name="address"
              value={clientForm.address}
              onChange={handleClientFormChange}
              placeholder="Dirección del cliente"
            />

            <FormTextarea
              label="Notas"
              name="notes"
              value={clientForm.notes}
              onChange={handleClientFormChange}
              placeholder="Notas internas del cliente"
            />

            <div style={styles.formActions}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={closeClientForm}
              >
                Cancelar
              </button>

              <button type="submit" style={styles.primaryButtonSmall}>
                {editingClient ? 'Guardar cambios' : 'Crear cliente'}
              </button>
            </div>
          </form>
        )}

        {clientsLoading ? (
          <p style={styles.emptyText}>Cargando clientes...</p>
        ) : filteredClients.length === 0 ? (
          <p style={styles.emptyText}>No hay clientes registrados.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Empresa</th>
                  <th style={styles.th}>Contacto</th>
                  <th style={styles.th}>Teléfono</th>
                  <th style={styles.th}>Ciudad</th>
                  <th style={styles.th}>País</th>
                  <th style={styles.th}>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {filteredClients.map((client) => (
                  <tr key={client.id}>
                    <td style={styles.td}>
                      <strong>{client.company_name}</strong>
                      {client.email && (
                        <small style={styles.smallText}>{client.email}</small>
                      )}
                    </td>
                    <td style={styles.td}>{client.contact_name || '—'}</td>
                    <td style={styles.td}>{client.phone || '—'}</td>
                    <td style={styles.td}>{client.city || '—'}</td>
                    <td style={styles.td}>{client.country || '—'}</td>
                    <td style={styles.td}>
                      <div style={styles.actionButtons}>
                        <button
                          style={styles.tableButton}
                          onClick={() => openEditClientForm(client)}
                        >
                          Editar
                        </button>

                        <button
                          style={styles.dangerButton}
                          onClick={() => handleDeleteClient(client)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function ProductsPage({
  products,
  productsLoading,
  productSearch,
  setProductSearch,
  showProductForm,
  editingProduct,
  productForm,
  productImagePreview,
  uploadingImage,
  openNewProductForm,
  openEditProductForm,
  closeProductForm,
  handleProductFormChange,
  handleProductImageChange,
  handleSaveProduct,
  handleDeleteProduct,
  openImageViewer,
  errorMessage,
  successMessage,
}) {
  const filteredProducts = useMemo(() => {
    const search = productSearch.toLowerCase()

    return products.filter((product) => {
      return (
        product.name?.toLowerCase().includes(search) ||
        product.internal_code?.toLowerCase().includes(search) ||
        product.manufacturer_code?.toLowerCase().includes(search) ||
        product.brand?.toLowerCase().includes(search) ||
        product.categories?.name?.toLowerCase().includes(search)
      )
    })
  }, [products, productSearch])

  return (
    <div>
      <Messages errorMessage={errorMessage} successMessage={successMessage} />

      <section style={styles.panel}>
        <div style={styles.sectionHeader}>
          <div>
            <h3 style={styles.panelTitle}>Productos</h3>
            <p style={styles.emptyText}>
              Administra el catálogo de repuestos, marcas, códigos y categorías.
            </p>
          </div>

          <button style={styles.primaryButtonSmall} onClick={openNewProductForm}>
            Nuevo producto
          </button>
        </div>

        <div style={styles.toolbar}>
          <input
            style={styles.input}
            type="text"
            placeholder="Buscar por producto, código, marca o categoría..."
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
          />
        </div>

        {showProductForm && (
          <form onSubmit={handleSaveProduct} style={styles.formBox}>
            <h4 style={styles.formTitle}>
              {editingProduct ? 'Editar producto' : 'Nuevo producto'}
            </h4>

            <div style={styles.formGrid}>
              <FormInput
                label="Producto *"
                name="name"
                value={productForm.name}
                onChange={handleProductFormChange}
                placeholder="Nombre del producto"
                required
              />

              <FormInput
                label="Marca"
                name="brand"
                value={productForm.brand}
                onChange={handleProductFormChange}
                placeholder="Marca"
              />

              <FormInput
                label="Código interno"
                name="internal_code"
                value={productForm.internal_code}
                onChange={handleProductFormChange}
                placeholder="REP-001"
              />

              <FormInput
                label="Código fabricante"
                name="manufacturer_code"
                value={productForm.manufacturer_code}
                onChange={handleProductFormChange}
                placeholder="Código original"
              />

              <FormInput
                label="Categoría"
                name="category_name"
                value={productForm.category_name}
                onChange={handleProductFormChange}
                placeholder="Ej: Componentes de cafeteras"
              />

              <FormInput
                label="Subcategoría"
                name="subcategory_name"
                value={productForm.subcategory_name}
                onChange={handleProductFormChange}
                placeholder="Ej: Bombas de agua"
              />
            </div>
            <div>
              <label style={styles.label}>Imagen de referencia</label>
              <input
                style={styles.input}
                type="file"
                accept="image/*"
                onChange={handleProductImageChange}
              />

              {productImagePreview && (
                <div style={styles.imagePreviewBox}>
                  <img
                    src={productImagePreview}
                    alt="Vista previa del producto"
                    style={styles.imagePreview}
                  />
                </div>
              )}

              {uploadingImage && (
                <p style={styles.emptyText}>Subiendo imagen...</p>
              )}
            </div>
            <FormTextarea
              label="Descripción"
              name="description"
              value={productForm.description}
              onChange={handleProductFormChange}
              placeholder="Descripción del producto"
            />

            <FormTextarea
              label="Observaciones"
              name="observations"
              value={productForm.observations}
              onChange={handleProductFormChange}
              placeholder="Notas internas del producto"
            />

            <div style={styles.formActions}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={closeProductForm}
              >
                Cancelar
              </button>

              <button type="submit" style={styles.primaryButtonSmall}>
                {editingProduct ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </form>
        )}

        {productsLoading ? (
          <p style={styles.emptyText}>Cargando productos...</p>
        ) : filteredProducts.length === 0 ? (
          <p style={styles.emptyText}>No hay productos registrados.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Producto</th>
                  <th style={styles.th}>Códigos</th>
                  <th style={styles.th}>Marca</th>
                  <th style={styles.th}>Categoría</th>
                  <th style={styles.th}>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td style={styles.td}>
                      <div style={styles.productCell}>
                        {product.main_image_url ? (
                          <button
                            type="button"
                            style={styles.imageButton}
                            onClick={() =>
                              openImageViewer(product.main_image_url, product.name)
                            }
                            title="Ver imagen en grande"
                          >
                            <img
                              src={product.main_image_url}
                              alt={product.name}
                              style={styles.productThumb}
                            />
                          </button>
                        ) : (
                          <div style={styles.productThumbPlaceholder}>Sin imagen</div>
                        )}

                        <div>
                          <strong>{product.name}</strong>
                          {product.description && (
                            <small style={styles.smallText}>
                              {product.description}
                            </small>
                          )}
                          {product.main_image_url && (
                            <small style={styles.clickHint}>
                              Click en la imagen para ampliar
                            </small>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span>{product.internal_code || '—'}</span>
                      {product.manufacturer_code && (
                        <small style={styles.smallText}>
                          Fab: {product.manufacturer_code}
                        </small>
                      )}
                    </td>
                    <td style={styles.td}>{product.brand || '—'}</td>
                    <td style={styles.td}>
                      {product.categories?.name || '—'}
                      {product.subcategories?.name && (
                        <small style={styles.smallText}>
                          {product.subcategories.name}
                        </small>
                      )}
                    </td>
                    <td style={styles.td}>
                      <div style={styles.actionButtons}>
                        <button
                          style={styles.tableButton}
                          onClick={() => openEditProductForm(product)}
                        >
                          Editar
                        </button>

                        <button
                          style={styles.dangerButton}
                          onClick={() => handleDeleteProduct(product)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function RequestsPage({
  requests,
  requestsLoading,
  requestSearch,
  setRequestSearch,
  requestStatusFilter,
  setRequestStatusFilter,
  showRequestForm,
  editingRequest,
  requestForm,
  clients,
  products,
  statuses,
  openNewRequestForm,
  openEditRequestForm,
  closeRequestForm,
  handleRequestFormChange,
  handleSaveRequest,
  handleDeleteRequest,
  errorMessage,
  successMessage,
}) {
  const filteredRequests = useMemo(() => {
    const search = requestSearch.toLowerCase()

    return requests.filter((request) => {
      const matchesSearch =
        request.company_name?.toLowerCase().includes(search) ||
        request.product_name?.toLowerCase().includes(search) ||
        request.brand?.toLowerCase().includes(search) ||
        request.status_name?.toLowerCase().includes(search)

      const matchesStatus =
        !requestStatusFilter || request.status_name === requestStatusFilter

      return matchesSearch && matchesStatus
    })
  }, [requests, requestSearch, requestStatusFilter])

  return (
    <div>
      <Messages errorMessage={errorMessage} successMessage={successMessage} />

      <section style={styles.panel}>
        <div style={styles.sectionHeader}>
          <div>
            <h3 style={styles.panelTitle}>Solicitudes</h3>
            <p style={styles.emptyText}>
              Registra lo que cada cliente solicita y el estado del proceso.
            </p>
          </div>

          <button style={styles.primaryButtonSmall} onClick={openNewRequestForm}>
            Nueva solicitud
          </button>
        </div>

        <div style={styles.filtersGrid}>
          <input
            style={styles.input}
            type="text"
            placeholder="Buscar por cliente, producto, marca o estado..."
            value={requestSearch}
            onChange={(event) => setRequestSearch(event.target.value)}
          />

          <select
            style={styles.input}
            value={requestStatusFilter}
            onChange={(event) => setRequestStatusFilter(event.target.value)}
          >
            <option value="">Todos los estados</option>
            {statuses.map((status) => (
              <option key={status.id} value={status.name}>
                {status.name}
              </option>
            ))}
          </select>
        </div>

        {showRequestForm && (
          <form onSubmit={handleSaveRequest} style={styles.formBox}>
            <h4 style={styles.formTitle}>
              {editingRequest ? 'Editar solicitud' : 'Nueva solicitud'}
            </h4>

            <div style={styles.formGrid}>
              <div>
                <label style={styles.label}>Cliente *</label>
                <select
                  style={styles.input}
                  name="client_id"
                  value={requestForm.client_id}
                  onChange={handleRequestFormChange}
                  required
                >
                  <option value="">Seleccionar cliente</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.company_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={styles.label}>Producto *</label>
                <select
                  style={styles.input}
                  name="product_id"
                  value={requestForm.product_id}
                  onChange={handleRequestFormChange}
                  required
                >
                  <option value="">Seleccionar producto</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>

              <FormInput
                label="Cantidad *"
                name="quantity"
                type="number"
                min="1"
                step="0.01"
                value={requestForm.quantity}
                onChange={handleRequestFormChange}
                required
              />

              <FormInput
                label="Fecha *"
                name="request_date"
                type="date"
                value={requestForm.request_date}
                onChange={handleRequestFormChange}
                required
              />

              <div>
                <label style={styles.label}>Estado *</label>
                <select
                  style={styles.input}
                  name="status_id"
                  value={requestForm.status_id}
                  onChange={handleRequestFormChange}
                  required
                >
                  <option value="">Seleccionar estado</option>
                  {statuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <FormTextarea
              label="Comentarios"
              name="comments"
              value={requestForm.comments}
              onChange={handleRequestFormChange}
              placeholder="Comentarios de la solicitud"
            />

            <div style={styles.formActions}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={closeRequestForm}
              >
                Cancelar
              </button>

              <button type="submit" style={styles.primaryButtonSmall}>
                {editingRequest ? 'Guardar cambios' : 'Crear solicitud'}
              </button>
            </div>
          </form>
        )}

        {requestsLoading ? (
          <p style={styles.emptyText}>Cargando solicitudes...</p>
        ) : filteredRequests.length === 0 ? (
          <p style={styles.emptyText}>No hay solicitudes registradas.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Cliente</th>
                  <th style={styles.th}>Producto</th>
                  <th style={styles.th}>Cantidad</th>
                  <th style={styles.th}>Fecha</th>
                  <th style={styles.th}>Estado</th>
                  <th style={styles.th}>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {filteredRequests.map((request) => (
                  <tr key={request.id}>
                    <td style={styles.td}>
                      <strong>{request.company_name || '—'}</strong>
                      {request.contact_name && (
                        <small style={styles.smallText}>
                          {request.contact_name}
                        </small>
                      )}
                    </td>
                    <td style={styles.td}>
                      <strong>{request.product_name || '—'}</strong>
                      {request.brand && (
                        <small style={styles.smallText}>{request.brand}</small>
                      )}
                    </td>
                    <td style={styles.td}>{request.quantity}</td>
                    <td style={styles.td}>{request.request_date}</td>
                    <td style={styles.td}>
                      <span style={styles.statusBadge}>
                        {request.status_name || 'Sin estado'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.actionButtons}>
                        <button
                          style={styles.tableButton}
                          onClick={() => openEditRequestForm(request)}
                        >
                          Editar
                        </button>

                        <button
                          style={styles.dangerButton}
                          onClick={() => handleDeleteRequest(request)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Messages({ errorMessage, successMessage }) {
  return (
    <>
      {errorMessage && <p style={styles.error}>Error: {errorMessage}</p>}
      {successMessage && <p style={styles.success}>{successMessage}</p>}
    </>
  )
}

function FormInput({
  label,
  name,
  value,
  onChange,
  placeholder = '',
  type = 'text',
  required = false,
  min,
  step,
}) {
  return (
    <div>
      <label style={styles.label}>{label}</label>
      <input
        style={styles.input}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        min={min}
        step={step}
      />
    </div>
  )
}

function FormTextarea({ label, name, value, onChange, placeholder = '' }) {
  return (
    <div>
      <label style={styles.label}>{label}</label>
      <textarea
        style={styles.textarea}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  )
}

function StatCard({ title, value }) {
  return (
    <div style={styles.statCard}>
      <p style={styles.statTitle}>{title}</p>
      <h3 style={styles.statValue}>{value}</h3>
    </div>
  )
}

function PlaceholderPage({ title, description, buttonText }) {
  return (
    <section style={styles.panel}>
      <div style={styles.placeholderHeader}>
        <div>
          <h3 style={styles.panelTitle}>{title}</h3>
          <p style={styles.emptyText}>{description}</p>
        </div>

        <button style={styles.primaryButtonSmall}>{buttonText}</button>
      </div>
    </section>
  )
}


function ImageModal({ imageUrl, title, onClose }) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        style={styles.modalContent}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>{title}</h3>

          <button type="button" style={styles.modalCloseButton} onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div style={styles.modalImageBox}>
          <img src={imageUrl} alt={title} style={styles.modalImage} />
        </div>
      </div>
    </div>
  )
}


const styles = {
  imagePreviewBox: {
  marginTop: '0.75rem',
  width: '160px',
  height: '120px',
  borderRadius: '12px',
  overflow: 'hidden',
  border: '1px solid #e5e7eb',
  background: '#f9fafb',
},
imagePreview: {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
},
productCell: {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
},
productThumb: {
  width: '54px',
  height: '54px',
  borderRadius: '10px',
  objectFit: 'cover',
  border: '1px solid #e5e7eb',
  background: '#f9fafb',
},
productThumbPlaceholder: {
  width: '54px',
  height: '54px',
  borderRadius: '10px',
  border: '1px solid #e5e7eb',
  background: '#f3f4f6',
  color: '#6b7280',
  fontSize: '0.65rem',
  display: 'grid',
  placeItems: 'center',
  textAlign: 'center',
  padding: '0.25rem',
},
  loading: {
    padding: '2rem',
    color: '#111827',
    fontFamily: 'Arial, sans-serif',
  },
  loginPage: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    background: '#f3f4f6',
    padding: '1rem',
    fontFamily: 'Arial, sans-serif',
  },
  loginCard: {
    width: '100%',
    maxWidth: '430px',
    background: '#ffffff',
    padding: '2rem',
    borderRadius: '18px',
    boxShadow: '0 12px 35px rgba(15, 23, 42, 0.12)',
  },
  loginTitle: {
    margin: 0,
    fontSize: '1.7rem',
    color: '#111827',
    textAlign: 'center',
  },
  loginSubtitle: {
    color: '#6b7280',
    marginTop: '0.3rem',
    marginBottom: '1.8rem',
    textAlign: 'center',
  },
  form: {
    display: 'grid',
    gap: '0.85rem',
  },
  label: {
    fontWeight: '700',
    color: '#374151',
    display: 'block',
    marginBottom: '0.35rem',
  },
  input: {
    width: '100%',
    padding: '0.9rem 1rem',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    fontSize: '1rem',
    background: '#ffffff',
    color: '#111827',
    outline: 'none',
  },
  textarea: {
    width: '100%',
    minHeight: '90px',
    padding: '0.9rem 1rem',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    fontSize: '1rem',
    background: '#ffffff',
    color: '#111827',
    outline: 'none',
    resize: 'vertical',
  },
  primaryButton: {
    marginTop: '1rem',
    padding: '0.9rem',
    borderRadius: '10px',
    border: 'none',
    background: '#2563eb',
    color: '#ffffff',
    fontWeight: '700',
    fontSize: '1rem',
    cursor: 'pointer',
  },
  primaryButtonSmall: {
    padding: '0.75rem 1rem',
    borderRadius: '10px',
    border: 'none',
    background: '#2563eb',
    color: '#ffffff',
    fontWeight: '700',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  secondaryButton: {
    padding: '0.75rem 1rem',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#111827',
    fontWeight: '700',
    cursor: 'pointer',
  },
  error: {
    color: '#991b1b',
    background: '#fee2e2',
    padding: '0.85rem',
    borderRadius: '10px',
    border: '1px solid #fecaca',
  },
  success: {
    color: '#166534',
    background: '#dcfce7',
    padding: '0.85rem',
    borderRadius: '10px',
    border: '1px solid #bbf7d0',
  },
  app: {
    minHeight: '100vh',
    display: 'flex',
    background: '#f3f4f6',
    color: '#111827',
    fontFamily: 'Arial, sans-serif',
  },
  sidebar: {
    width: '260px',
    background: '#111827',
    color: '#ffffff',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.8rem',
  },
  brandIcon: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    background: '#2563eb',
    display: 'grid',
    placeItems: 'center',
    fontWeight: '800',
  },
  brandTitle: {
    margin: 0,
    fontSize: '1.2rem',
  },
  brandSubtitle: {
    margin: '0.2rem 0 0',
    color: '#9ca3af',
    fontSize: '0.85rem',
  },
  nav: {
    display: 'grid',
    gap: '0.5rem',
  },
  navButton: {
    width: '100%',
    textAlign: 'left',
    padding: '0.85rem 1rem',
    borderRadius: '10px',
    border: 'none',
    background: 'transparent',
    color: '#d1d5db',
    fontWeight: '600',
    cursor: 'pointer',
  },
  navButtonActive: {
    background: '#2563eb',
    color: '#ffffff',
  },
  mainArea: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  topbar: {
    height: '82px',
    background: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
    padding: '1rem 1.5rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
  },
  pageTitle: {
    margin: 0,
    color: '#111827',
    fontSize: '1.4rem',
  },
  pageSubtitle: {
    margin: '0.25rem 0 0',
    color: '#6b7280',
  },
  logoutButton: {
    padding: '0.7rem 1rem',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#111827',
    fontWeight: '700',
    cursor: 'pointer',
  },
  content: {
    padding: '1.5rem',
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '1rem',
    marginBottom: '1rem',
  },
  statCard: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '16px',
    padding: '1.3rem',
    boxShadow: '0 8px 20px rgba(15, 23, 42, 0.04)',
  },
  statTitle: {
    margin: 0,
    color: '#6b7280',
    fontWeight: '700',
  },
  statValue: {
    margin: '0.5rem 0 0',
    color: '#111827',
    fontSize: '2rem',
  },
  dashboardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '1rem',
  },
  panel: {
    background: '#ffffff',
    borderRadius: '16px',
    padding: '1.4rem',
    border: '1px solid #e5e7eb',
    boxShadow: '0 8px 20px rgba(15, 23, 42, 0.04)',
  },
  panelTitle: {
    margin: 0,
    color: '#111827',
    fontSize: '1.15rem',
  },
  emptyText: {
    color: '#6b7280',
    lineHeight: 1.5,
  },
  list: {
    display: 'grid',
    gap: '0.75rem',
    marginTop: '1rem',
  },
  listItem: {
    display: 'grid',
    gap: '0.2rem',
    padding: '0.85rem',
    borderRadius: '12px',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
  },
  placeholderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '1rem',
  },
  toolbar: {
    marginBottom: '1rem',
  },
  filtersGrid: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '1rem',
    marginBottom: '1rem',
  },
  formBox: {
    display: 'grid',
    gap: '1rem',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '14px',
    padding: '1rem',
    marginBottom: '1.2rem',
  },
  formTitle: {
    margin: 0,
    color: '#111827',
    fontSize: '1.05rem',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '1rem',
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
  },
  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '850px',
  },
  th: {
    textAlign: 'left',
    padding: '0.85rem',
    borderBottom: '1px solid #e5e7eb',
    color: '#374151',
    fontSize: '0.9rem',
    background: '#f9fafb',
  },
  td: {
    padding: '0.85rem',
    borderBottom: '1px solid #e5e7eb',
    color: '#111827',
    verticalAlign: 'top',
  },
  smallText: {
    display: 'block',
    color: '#6b7280',
    marginTop: '0.2rem',
  },
  actionButtons: {
    display: 'flex',
    gap: '0.5rem',
  },
  tableButton: {
    padding: '0.45rem 0.7rem',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#111827',
    fontWeight: '700',
    cursor: 'pointer',
  },
  dangerButton: {
    padding: '0.45rem 0.7rem',
    borderRadius: '8px',
    border: '1px solid #fecaca',
    background: '#fee2e2',
    color: '#991b1b',
    fontWeight: '700',
    cursor: 'pointer',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '0.35rem 0.65rem',
    borderRadius: '999px',
    background: '#dbeafe',
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: '0.85rem',
  },
  imageButton: {
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
  },
  clickHint: {
    display: 'block',
    color: '#2563eb',
    marginTop: '0.25rem',
    fontSize: '0.75rem',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.75)',
    display: 'grid',
    placeItems: 'center',
    padding: '1rem',
    zIndex: 9999,
  },
  modalContent: {
    width: '100%',
    maxWidth: '850px',
    maxHeight: '90vh',
    background: '#ffffff',
    borderRadius: '18px',
    overflow: 'hidden',
    boxShadow: '0 25px 80px rgba(0, 0, 0, 0.35)',
  },
  modalHeader: {
    padding: '1rem 1.25rem',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
  },
  modalTitle: {
    margin: 0,
    color: '#111827',
    fontSize: '1.1rem',
  },
  modalCloseButton: {
    padding: '0.6rem 0.9rem',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    background: '#ffffff',
    color: '#111827',
    fontWeight: '700',
    cursor: 'pointer',
  },
  modalImageBox: {
    padding: '1rem',
    background: '#f9fafb',
    display: 'grid',
    placeItems: 'center',
  },
  modalImage: {
    maxWidth: '100%',
    maxHeight: '72vh',
    objectFit: 'contain',
    borderRadius: '12px',
  },
}

export default App