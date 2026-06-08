import { useCallback, useEffect, useMemo, useState } from 'react'
import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 768
  })

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 768)
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isMobile
}


function formatDate(value) {
  if (!value) return '—'

  return new Date(value).toLocaleDateString('es-DO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function normalizeText(value) {
  return String(value || '').trim() || '—'
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function getCurrentDateFileName() {
  return new Date().toISOString().slice(0, 10)
}

function buildReportSummary({ clients, products, requests }) {
  const productMap = new Map()
  const clientMap = new Map()
  const statusMap = new Map()
  const monthlyMap = new Map()

  requests.forEach((request) => {
    const quantity = Number(request.quantity || 0)

    if (request.product_id) {
      const currentProduct = productMap.get(request.product_id) || {
        name: request.product_name || 'Producto sin nombre',
        brand: request.brand || '',
        totalRequests: 0,
        totalQuantity: 0,
      }

      currentProduct.totalRequests += 1
      currentProduct.totalQuantity += quantity
      productMap.set(request.product_id, currentProduct)
    }

    if (request.client_id) {
      const currentClient = clientMap.get(request.client_id) || {
        name: request.company_name || 'Cliente sin nombre',
        contact: request.contact_name || '',
        totalRequests: 0,
        totalQuantity: 0,
      }

      currentClient.totalRequests += 1
      currentClient.totalQuantity += quantity
      clientMap.set(request.client_id, currentClient)
    }

    const status = request.status_name || 'Sin estado'
    statusMap.set(status, (statusMap.get(status) || 0) + 1)

    if (request.request_date) {
      const month = request.request_date.slice(0, 7)
      monthlyMap.set(month, (monthlyMap.get(month) || 0) + 1)
    }
  })

  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.totalRequests - a.totalRequests)
    .slice(0, 10)

  const topClients = Array.from(clientMap.values())
    .sort((a, b) => b.totalRequests - a.totalRequests)
    .slice(0, 10)

  const statusSummary = Array.from(statusMap.entries()).map(([status, total]) => ({
    status,
    total,
  }))

  const monthlySummary = Array.from(monthlyMap.entries())
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => a.month.localeCompare(b.month))

  return {
    totalClients: clients.length,
    totalProducts: products.length,
    totalRequests: requests.length,
    topProducts,
    topClients,
    statusSummary,
    monthlySummary,
  }
}

async function addWorksheetWithRows(workbook, sheetName, columns, rows) {
  const worksheet = workbook.addWorksheet(sheetName)
  worksheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width || 20,
  }))

  rows.forEach((row) => worksheet.addRow(row))

  worksheet.getRow(1).font = { bold: true }
  worksheet.getRow(1).alignment = { vertical: 'middle' }

  worksheet.columns.forEach((column) => {
    column.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      }
    })
  })

  return worksheet
}


function cleanHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function cleanCell(value) {
  if (value === null || value === undefined) return ''

  if (typeof value === 'object') {
    if (value.text) return String(value.text).trim()
    if (value.result) return String(value.result).trim()
    if (value.richText) {
      return value.richText.map((item) => item.text || '').join('').trim()
    }
  }

  return String(value).trim()
}

const importHeaderAliases = {
  empresa: 'company_name',
  nombre_empresa: 'company_name',
  cliente: 'company_name',
  company_name: 'company_name',
  contacto: 'contact_name',
  nombre_contacto: 'contact_name',
  contact_name: 'contact_name',
  telefono: 'phone',
  tel: 'phone',
  phone: 'phone',
  correo: 'email',
  email: 'email',
  direccion: 'address',
  address: 'address',
  ciudad: 'city',
  city: 'city',
  pais: 'country',
  country: 'country',
  notas: 'notes',
  nota: 'notes',
  notes: 'notes',
  referencia: 'reference',
  referencia_temporal: 'reference',
  producto: 'name',
  nombre_producto: 'name',
  name: 'name',
  codigo_interno: 'internal_code',
  internal_code: 'internal_code',
  codigo_fabricante: 'manufacturer_code',
  codigo_del_fabricante: 'manufacturer_code',
  manufacturer_code: 'manufacturer_code',
  categoria: 'category_name',
  category: 'category_name',
  category_name: 'category_name',
  subcategoria: 'subcategory_name',
  subcategory: 'subcategory_name',
  subcategory_name: 'subcategory_name',
  marca: 'brand',
  brand: 'brand',
  descripcion: 'description',
  description: 'description',
  observaciones: 'observations',
  observations: 'observations',
}

function normalizeImportedRow(rawRow) {
  const normalized = {}

  Object.entries(rawRow).forEach(([key, value]) => {
    const normalizedKey = importHeaderAliases[cleanHeader(key)] || cleanHeader(key)
    normalized[normalizedKey] = cleanCell(value)
  })

  return normalized
}

function getWorksheetByImportType(workbook, importType) {
  const sheetNames = {
    clients: ['Clientes', 'clients'],
    products: ['Productos', 'products'],
  }

  const possibleNames = sheetNames[importType] || []

  for (const name of possibleNames) {
    const worksheet = workbook.getWorksheet(name)
    if (worksheet) return worksheet
  }

  return workbook.worksheets[0]
}

function readWorksheetRows(worksheet) {
  if (!worksheet || worksheet.rowCount < 2) return []

  const headerRow = worksheet.getRow(1)
  const headers = []

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = cleanCell(cell.value)
  })

  const rows = []

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return

    const rawRow = {}
    let hasValue = false

    headers.forEach((header, colNumber) => {
      if (!header) return

      const value = cleanCell(row.getCell(colNumber).value)
      rawRow[header] = value

      if (value) hasValue = true
    })

    if (hasValue) {
      rows.push({
        rowNumber,
        data: normalizeImportedRow(rawRow),
      })
    }
  })

  return rows
}

function buildClientImportCandidate(row) {
  const data = row.data
  const warnings = []
  const errors = []
  const hasIdentifier = Boolean(
    data.company_name || data.contact_name || data.phone || data.email || data.reference
  )

  if (!hasIdentifier) {
    errors.push('La fila no tiene ningún dato identificable del cliente.')
  }

  if (!data.company_name) {
    warnings.push('Cliente sin nombre de empresa; se creará con nombre temporal.')
  }

  if (!data.contact_name) warnings.push('Cliente sin contacto.')
  if (!data.phone && !data.email) warnings.push('Cliente sin teléfono ni correo.')
  if (!data.city) warnings.push('Cliente sin ciudad.')

  const temporaryName =
    data.company_name ||
    `Cliente pendiente ${data.reference || data.phone || data.email || `fila ${row.rowNumber}`}`

  return {
    rowNumber: row.rowNumber,
    type: 'client',
    valid: errors.length === 0,
    warnings,
    errors,
    payload: {
      company_name: temporaryName,
      contact_name: data.contact_name || '',
      phone: data.phone || '',
      email: data.email || '',
      address: data.address || '',
      city: data.city || '',
      country: data.country || 'República Dominicana',
      notes: [data.notes, data.reference ? `Referencia temporal: ${data.reference}` : '']
        .filter(Boolean)
        .join(' | '),
    },
    preview: {
      main: temporaryName,
      secondary: data.contact_name || data.phone || data.email || 'Sin contacto',
    },
  }
}

function buildProductImportCandidate(row) {
  const data = row.data
  const warnings = []
  const errors = []
  const hasIdentifier = Boolean(data.name || data.description || data.reference || data.manufacturer_code)

  if (!hasIdentifier) {
    errors.push('La fila no tiene producto, descripción, código o referencia.')
  }

  if (!data.name) warnings.push('Producto sin nombre exacto; se creará con nombre temporal.')
  if (!data.brand) warnings.push('Producto sin marca.')
  if (!data.internal_code && !data.manufacturer_code) warnings.push('Producto sin código interno ni código de fabricante.')
  if (!data.category_name) warnings.push('Producto sin categoría.')
  if (!data.description) warnings.push('Producto sin descripción.')

  const temporaryName = data.name || `Producto pendiente ${data.reference || data.manufacturer_code || `fila ${row.rowNumber}`}`

  return {
    rowNumber: row.rowNumber,
    type: 'product',
    valid: errors.length === 0,
    warnings,
    errors,
    payload: {
      name: temporaryName,
      internal_code: data.internal_code || '',
      manufacturer_code: data.manufacturer_code || '',
      category_name: data.category_name || '',
      subcategory_name: data.subcategory_name || '',
      brand: data.brand || '',
      description: data.description || '',
      observations: [data.observations, data.reference ? `Referencia temporal: ${data.reference}` : '']
        .filter(Boolean)
        .join(' | '),
    },
    preview: {
      main: temporaryName,
      secondary: data.brand || data.category_name || data.manufacturer_code || 'Sin marca/categoría',
    },
  }
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
  const isMobile = useIsMobile()

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
  const [importType, setImportType] = useState('clients')
  const [importFileName, setImportFileName] = useState('')
  const [importPreviewRows, setImportPreviewRows] = useState([])
  const [importLoading, setImportLoading] = useState(false)

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

    if (pageId === 'reports' || pageId === 'import-export') {
      loadDashboard()
      loadClients()
      loadProducts()
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


  async function exportGeneralExcel() {
    clearMessages()

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Sistema de Repuestos Industriales'
    workbook.created = new Date()

    const summary = buildReportSummary({ clients, products, requests })

    await addWorksheetWithRows(
      workbook,
      'Resumen',
      [
        { header: 'Métrica', key: 'metric', width: 30 },
        { header: 'Valor', key: 'value', width: 20 },
      ],
      [
        { metric: 'Total de clientes', value: summary.totalClients },
        { metric: 'Total de productos', value: summary.totalProducts },
        { metric: 'Total de solicitudes', value: summary.totalRequests },
      ]
    )

    await addWorksheetWithRows(
      workbook,
      'Clientes',
      [
        { header: 'Empresa', key: 'company_name', width: 35 },
        { header: 'Contacto', key: 'contact_name', width: 30 },
        { header: 'Teléfono', key: 'phone', width: 18 },
        { header: 'Correo', key: 'email', width: 30 },
        { header: 'Ciudad', key: 'city', width: 20 },
        { header: 'País', key: 'country', width: 22 },
        { header: 'Notas', key: 'notes', width: 40 },
      ],
      clients
    )

    await addWorksheetWithRows(
      workbook,
      'Productos',
      [
        { header: 'Producto', key: 'name', width: 35 },
        { header: 'Código interno', key: 'internal_code', width: 20 },
        { header: 'Código fabricante', key: 'manufacturer_code', width: 22 },
        { header: 'Marca', key: 'brand', width: 20 },
        { header: 'Categoría', key: 'category_name', width: 28 },
        { header: 'Subcategoría', key: 'subcategory_name', width: 28 },
        { header: 'Descripción', key: 'description', width: 45 },
      ],
      products.map((product) => ({
        ...product,
        category_name: product.categories?.name || '',
        subcategory_name: product.subcategories?.name || '',
      }))
    )

    await addWorksheetWithRows(
      workbook,
      'Solicitudes',
      [
        { header: 'Fecha', key: 'request_date', width: 16 },
        { header: 'Cliente', key: 'company_name', width: 35 },
        { header: 'Contacto', key: 'contact_name', width: 30 },
        { header: 'Producto', key: 'product_name', width: 35 },
        { header: 'Marca', key: 'brand', width: 20 },
        { header: 'Categoría', key: 'category_name', width: 25 },
        { header: 'Cantidad', key: 'quantity', width: 14 },
        { header: 'Estado', key: 'status_name', width: 18 },
        { header: 'Comentarios', key: 'comments', width: 45 },
      ],
      requests
    )

    await addWorksheetWithRows(
      workbook,
      'Top productos',
      [
        { header: 'Producto', key: 'name', width: 35 },
        { header: 'Marca', key: 'brand', width: 20 },
        { header: 'Solicitudes', key: 'totalRequests', width: 16 },
        { header: 'Cantidad total', key: 'totalQuantity', width: 18 },
      ],
      summary.topProducts
    )

    await addWorksheetWithRows(
      workbook,
      'Top clientes',
      [
        { header: 'Cliente', key: 'name', width: 35 },
        { header: 'Contacto', key: 'contact', width: 30 },
        { header: 'Solicitudes', key: 'totalRequests', width: 16 },
        { header: 'Cantidad total', key: 'totalQuantity', width: 18 },
      ],
      summary.topClients
    )

    const buffer = await workbook.xlsx.writeBuffer()
    downloadBlob(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `reporte-general-${getCurrentDateFileName()}.xlsx`
    )

    showSuccess('Reporte Excel generado correctamente.')
  }

  function exportGeneralPdf() {
    clearMessages()

    const summary = buildReportSummary({ clients, products, requests })
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })

    doc.setFontSize(18)
    doc.text('Sistema de Repuestos Industriales', 40, 45)
    doc.setFontSize(12)
    doc.text(`Reporte general - ${formatDate(new Date().toISOString())}`, 40, 65)

    autoTable(doc, {
      startY: 90,
      head: [['Métrica', 'Valor']],
      body: [
        ['Total de clientes', summary.totalClients],
        ['Total de productos', summary.totalProducts],
        ['Total de solicitudes', summary.totalRequests],
      ],
      styles: { fontSize: 10 },
      headStyles: { fillColor: [37, 99, 235] },
    })

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 25,
      head: [['Producto', 'Marca', 'Solicitudes', 'Cantidad total']],
      body: summary.topProducts.map((product) => [
        normalizeText(product.name),
        normalizeText(product.brand),
        product.totalRequests,
        product.totalQuantity,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [17, 24, 39] },
    })

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 25,
      head: [['Cliente', 'Contacto', 'Solicitudes', 'Cantidad total']],
      body: summary.topClients.map((client) => [
        normalizeText(client.name),
        normalizeText(client.contact),
        client.totalRequests,
        client.totalQuantity,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [17, 24, 39] },
    })

    doc.save(`reporte-general-${getCurrentDateFileName()}.pdf`)
    showSuccess('Reporte PDF generado correctamente.')
  }

  async function exportClientsExcel() {
    clearMessages()

    const workbook = new ExcelJS.Workbook()
    await addWorksheetWithRows(
      workbook,
      'Clientes',
      [
        { header: 'Empresa', key: 'company_name', width: 35 },
        { header: 'Contacto', key: 'contact_name', width: 30 },
        { header: 'Teléfono', key: 'phone', width: 18 },
        { header: 'Correo', key: 'email', width: 30 },
        { header: 'Dirección', key: 'address', width: 40 },
        { header: 'Ciudad', key: 'city', width: 20 },
        { header: 'País', key: 'country', width: 22 },
        { header: 'Notas', key: 'notes', width: 40 },
      ],
      clients
    )

    const buffer = await workbook.xlsx.writeBuffer()
    downloadBlob(new Blob([buffer]), `clientes-${getCurrentDateFileName()}.xlsx`)
    showSuccess('Clientes exportados correctamente.')
  }

  async function exportProductsExcel() {
    clearMessages()

    const workbook = new ExcelJS.Workbook()
    await addWorksheetWithRows(
      workbook,
      'Productos',
      [
        { header: 'Producto', key: 'name', width: 35 },
        { header: 'Código interno', key: 'internal_code', width: 20 },
        { header: 'Código fabricante', key: 'manufacturer_code', width: 22 },
        { header: 'Marca', key: 'brand', width: 20 },
        { header: 'Categoría', key: 'category_name', width: 28 },
        { header: 'Subcategoría', key: 'subcategory_name', width: 28 },
        { header: 'Descripción', key: 'description', width: 45 },
        { header: 'Observaciones', key: 'observations', width: 45 },
        { header: 'Imagen', key: 'main_image_url', width: 55 },
      ],
      products.map((product) => ({
        ...product,
        category_name: product.categories?.name || '',
        subcategory_name: product.subcategories?.name || '',
      }))
    )

    const buffer = await workbook.xlsx.writeBuffer()
    downloadBlob(new Blob([buffer]), `productos-${getCurrentDateFileName()}.xlsx`)
    showSuccess('Productos exportados correctamente.')
  }

  async function exportRequestsExcel() {
    clearMessages()

    const workbook = new ExcelJS.Workbook()
    await addWorksheetWithRows(
      workbook,
      'Solicitudes',
      [
        { header: 'Fecha', key: 'request_date', width: 16 },
        { header: 'Cliente', key: 'company_name', width: 35 },
        { header: 'Contacto', key: 'contact_name', width: 30 },
        { header: 'Producto', key: 'product_name', width: 35 },
        { header: 'Marca', key: 'brand', width: 20 },
        { header: 'Categoría', key: 'category_name', width: 25 },
        { header: 'Cantidad', key: 'quantity', width: 14 },
        { header: 'Estado', key: 'status_name', width: 18 },
        { header: 'Comentarios', key: 'comments', width: 45 },
      ],
      requests
    )

    const buffer = await workbook.xlsx.writeBuffer()
    downloadBlob(new Blob([buffer]), `solicitudes-${getCurrentDateFileName()}.xlsx`)
    showSuccess('Solicitudes exportadas correctamente.')
  }


  async function downloadImportTemplate() {
    clearMessages()

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Sistema de Repuestos Industriales'
    workbook.created = new Date()

    const instructions = workbook.addWorksheet('Instrucciones')
    instructions.columns = [
      { header: 'Sección', key: 'section', width: 24 },
      { header: 'Instrucción', key: 'instruction', width: 100 },
    ]
    instructions.addRows([
      { section: 'Uso', instruction: 'Llena las hojas Clientes y Productos. No borres los encabezados de la fila 1.' },
      { section: 'Clientes', instruction: 'No todos los campos son obligatorios. Si falta empresa, el sistema creará un nombre temporal y mostrará advertencia.' },
      { section: 'Productos', instruction: 'Si falta nombre exacto, usa descripción o referencia. El sistema creará un nombre temporal y mostrará advertencia.' },
      { section: 'Validación', instruction: 'Los errores bloquean la importación. Las advertencias permiten importar, pero deben revisarse.' },
      { section: 'Orden', instruction: 'Importa primero clientes, luego productos. Las solicitudes se agregarán en una etapa posterior.' },
    ])
    instructions.getRow(1).font = { bold: true }

    await addWorksheetWithRows(
      workbook,
      'Clientes',
      [
        { header: 'Empresa', key: 'company_name', width: 35 },
        { header: 'Contacto', key: 'contact_name', width: 30 },
        { header: 'Teléfono', key: 'phone', width: 18 },
        { header: 'Correo', key: 'email', width: 30 },
        { header: 'Dirección', key: 'address', width: 40 },
        { header: 'Ciudad', key: 'city', width: 20 },
        { header: 'País', key: 'country', width: 22 },
        { header: 'Notas', key: 'notes', width: 45 },
        { header: 'Referencia temporal', key: 'reference', width: 30 },
      ],
      [
        {
          company_name: 'Cliente Ejemplo SRL',
          contact_name: 'Juan Pérez',
          phone: '809-000-0000',
          email: 'cliente@correo.com',
          address: 'Dirección ejemplo',
          city: 'Santiago',
          country: 'República Dominicana',
          notes: 'Cliente de ejemplo',
          reference: 'WhatsApp Juan',
        },
        {
          company_name: '',
          contact_name: 'Cliente sin empresa',
          phone: '829-000-0000',
          email: '',
          address: '',
          city: '',
          country: 'República Dominicana',
          notes: 'Ejemplo de datos incompletos permitidos con advertencia',
          reference: 'Pendiente confirmar nombre',
        },
      ]
    )

    await addWorksheetWithRows(
      workbook,
      'Productos',
      [
        { header: 'Producto', key: 'name', width: 35 },
        { header: 'Código interno', key: 'internal_code', width: 20 },
        { header: 'Código fabricante', key: 'manufacturer_code', width: 22 },
        { header: 'Categoría', key: 'category_name', width: 28 },
        { header: 'Subcategoría', key: 'subcategory_name', width: 28 },
        { header: 'Marca', key: 'brand', width: 20 },
        { header: 'Descripción', key: 'description', width: 45 },
        { header: 'Observaciones', key: 'observations', width: 45 },
        { header: 'Referencia temporal', key: 'reference', width: 30 },
      ],
      [
        {
          name: 'Bomba de agua para cafetera',
          internal_code: 'CAF-BOM-001',
          manufacturer_code: 'ULKA-EX5',
          category_name: 'Componentes de cafeteras',
          subcategory_name: 'Bombas de agua',
          brand: 'ULKA',
          description: 'Bomba de agua para cafetera espresso',
          observations: 'Ejemplo',
          reference: '',
        },
        {
          name: '',
          internal_code: '',
          manufacturer_code: '',
          category_name: '',
          subcategory_name: '',
          brand: '',
          description: 'Cliente envió foto de una pieza eléctrica pequeña',
          observations: 'Ejemplo de producto incompleto permitido con advertencia',
          reference: 'Foto WhatsApp 1',
        },
      ]
    )

    await addWorksheetWithRows(
      workbook,
      'Solicitudes',
      [
        { header: 'Cliente o referencia', key: 'client_reference', width: 35 },
        { header: 'Producto o referencia', key: 'product_reference', width: 35 },
        { header: 'Cantidad', key: 'quantity', width: 14 },
        { header: 'Fecha', key: 'request_date', width: 16 },
        { header: 'Estado', key: 'status', width: 18 },
        { header: 'Comentarios', key: 'comments', width: 45 },
      ],
      [
        {
          client_reference: 'Cliente Ejemplo SRL',
          product_reference: 'Bomba de agua para cafetera',
          quantity: 1,
          request_date: new Date().toISOString().slice(0, 10),
          status: 'Solicitado',
          comments: 'Esta hoja queda como guía para una próxima etapa.',
        },
      ]
    )

    await addWorksheetWithRows(
      workbook,
      'Listas',
      [
        { header: 'Estados sugeridos', key: 'status', width: 20 },
        { header: 'Categorías sugeridas', key: 'category', width: 35 },
      ],
      [
        { status: 'Solicitado', category: 'Componentes de cafeteras' },
        { status: 'Cotizado', category: 'Repuestos industriales' },
        { status: 'Comprado', category: 'Piezas eléctricas' },
        { status: 'Entregado', category: 'Piezas mecánicas' },
        { status: 'Pendiente', category: 'Sensores' },
        { status: 'Cancelado', category: 'Motores' },
      ]
    )

    const buffer = await workbook.xlsx.writeBuffer()
    downloadBlob(new Blob([buffer]), `plantilla-importacion-repuestos-${getCurrentDateFileName()}.xlsx`)
    showSuccess('Plantilla descargada correctamente.')
  }

  async function handleImportFileChange(event) {
    const file = event.target.files?.[0]

    if (!file) return

    clearMessages()
    setImportLoading(true)
    setImportFileName(file.name)
    setImportPreviewRows([])

    try {
      const workbook = new ExcelJS.Workbook()
      const buffer = await file.arrayBuffer()
      await workbook.xlsx.load(buffer)

      const worksheet = getWorksheetByImportType(workbook, importType)

      if (!worksheet) {
        setErrorMessage('No se encontró una hoja válida dentro del Excel.')
        return
      }

      const rows = readWorksheetRows(worksheet)

      if (rows.length === 0) {
        setErrorMessage('El archivo no tiene filas para importar.')
        return
      }

      const candidates = rows.map((row) => {
        if (importType === 'clients') return buildClientImportCandidate(row)
        return buildProductImportCandidate(row)
      })

      setImportPreviewRows(candidates)

      const totalErrors = candidates.reduce((total, row) => total + row.errors.length, 0)
      const totalWarnings = candidates.reduce((total, row) => total + row.warnings.length, 0)

      if (totalErrors > 0) {
        setErrorMessage(`Se encontraron ${totalErrors} errores. Corrige el Excel antes de importar.`)
      } else if (totalWarnings > 0) {
        showSuccess(`Archivo leído con ${totalWarnings} advertencias. Puedes revisar y confirmar importación.`)
      } else {
        showSuccess('Archivo leído correctamente. Puedes confirmar la importación.')
      }
    } catch (error) {
      setErrorMessage(`No se pudo leer el Excel: ${error.message}`)
    } finally {
      setImportLoading(false)
      event.target.value = ''
    }
  }

  async function confirmImport() {
    clearMessages()

    if (importPreviewRows.length === 0) {
      setErrorMessage('Primero debes seleccionar un archivo para importar.')
      return
    }

    const invalidRows = importPreviewRows.filter((row) => !row.valid)

    if (invalidRows.length > 0) {
      setErrorMessage('No puedes importar mientras existan errores. Corrige el archivo y vuelve a cargarlo.')
      return
    }

    const confirmed = window.confirm(
      `¿Confirmas importar ${importPreviewRows.length} registros? Revisa las advertencias antes de continuar.`
    )

    if (!confirmed) return

    setImportLoading(true)

    try {
      if (importType === 'clients') {
        const payload = importPreviewRows.map((row) => row.payload)
        const { error } = await supabase.from('clients').insert(payload)

        if (error) throw new Error(error.message)

        await loadClients()
        await loadDashboard()
        showSuccess(`${payload.length} clientes importados correctamente.`)
      } else {
        const payload = []

        for (const row of importPreviewRows) {
          const categoryId = await getOrCreateCategory(row.payload.category_name || '')
          const subcategoryId =
            categoryId && row.payload.subcategory_name
              ? await getOrCreateSubcategory(row.payload.subcategory_name, categoryId)
              : null

          payload.push({
            name: row.payload.name,
            internal_code: row.payload.internal_code,
            manufacturer_code: row.payload.manufacturer_code,
            category_id: categoryId,
            subcategory_id: subcategoryId,
            brand: row.payload.brand,
            description: row.payload.description,
            observations: row.payload.observations,
          })
        }

        const { error } = await supabase.from('products').insert(payload)

        if (error) throw new Error(error.message)

        await loadProducts()
        await loadDashboard()
        showSuccess(`${payload.length} productos importados correctamente.`)
      }

      setImportPreviewRows([])
      setImportFileName('')
    } catch (error) {
      setErrorMessage(`No se pudo importar: ${error.message}`)
    } finally {
      setImportLoading(false)
    }
  }

  function clearImportPreview() {
    setImportPreviewRows([])
    setImportFileName('')
    clearMessages()
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
          isMobile={isMobile}
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
          isMobile={isMobile}
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
  isMobile={isMobile}
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
          isMobile={isMobile}
        />
      )
    }

    if (activePage === 'reports') {
      return (
        <ReportsPage
          clients={clients}
          products={products}
          requests={requests}
          errorMessage={errorMessage}
          successMessage={successMessage}
          exportGeneralExcel={exportGeneralExcel}
          exportGeneralPdf={exportGeneralPdf}
          exportClientsExcel={exportClientsExcel}
          exportProductsExcel={exportProductsExcel}
          exportRequestsExcel={exportRequestsExcel}
          isMobile={isMobile}
        />
      )
    }

    if (activePage === 'import-export') {
      return (
        <ImportExportPage
          clients={clients}
          products={products}
          requests={requests}
          importType={importType}
          setImportType={setImportType}
          importFileName={importFileName}
          importPreviewRows={importPreviewRows}
          importLoading={importLoading}
          downloadImportTemplate={downloadImportTemplate}
          handleImportFileChange={handleImportFileChange}
          confirmImport={confirmImport}
          clearImportPreview={clearImportPreview}
          errorMessage={errorMessage}
          successMessage={successMessage}
          exportGeneralExcel={exportGeneralExcel}
          exportGeneralPdf={exportGeneralPdf}
          exportClientsExcel={exportClientsExcel}
          exportProductsExcel={exportProductsExcel}
          exportRequestsExcel={exportRequestsExcel}
          isMobile={isMobile}
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
    <div style={{ ...styles.app, ...(isMobile ? styles.appMobile : {}) }}>
      <aside style={{ ...styles.sidebar, ...(isMobile ? styles.sidebarMobile : {}) }}>
        <div style={{ ...styles.brand, ...(isMobile ? styles.brandMobile : {}) }}>
          <div style={styles.brandIcon}>SR</div>
          <div>
            <h1 style={styles.brandTitle}>Repuestos</h1>
            <p style={styles.brandSubtitle}>Sistema de solicitudes</p>
          </div>
        </div>

        <nav style={{ ...styles.nav, ...(isMobile ? styles.navMobile : {}) }}>
          {menuItems.map((item) => (
            <button
              key={item.id}
              style={{
                ...styles.navButton,
                ...(isMobile ? styles.navButtonMobile : {}),
                ...(activePage === item.id ? styles.navButtonActive : {}),
              }}
              onClick={() => handleChangePage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div style={{ ...styles.mainArea, ...(isMobile ? styles.mainAreaMobile : {}) }}>
        <header style={{ ...styles.topbar, ...(isMobile ? styles.topbarMobile : {}) }}>
          <div>
            <h2 style={{ ...styles.pageTitle, ...(isMobile ? styles.pageTitleMobile : {}) }}>
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

        <main style={{ ...styles.content, ...(isMobile ? styles.contentMobile : {}) }}>{renderPage()}</main>
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
  isMobile,
}) {
  return (
    <div>
      <Messages errorMessage={errorMessage} successMessage={successMessage} />

      <section style={{ ...styles.cardsGrid, ...(isMobile ? styles.cardsGridMobile : {}) }}>
        <StatCard title="Clientes" value={stats.clients} />
        <StatCard title="Productos" value={stats.products} />
        <StatCard title="Solicitudes" value={stats.requests} />
      </section>

      <section style={{ ...styles.dashboardGrid, ...(isMobile ? styles.dashboardGridMobile : {}) }}>
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
  isMobile,
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
        <div style={{ ...styles.sectionHeader, ...(isMobile ? styles.sectionHeaderMobile : {}) }}>
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

            <div style={{ ...styles.formGrid, ...(isMobile ? styles.formGridMobile : {}) }}>
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

            <div style={{ ...styles.formActions, ...(isMobile ? styles.formActionsMobile : {}) }}>
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
  isMobile,
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
        <div style={{ ...styles.sectionHeader, ...(isMobile ? styles.sectionHeaderMobile : {}) }}>
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

            <div style={{ ...styles.formGrid, ...(isMobile ? styles.formGridMobile : {}) }}>
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

            <div style={{ ...styles.formActions, ...(isMobile ? styles.formActionsMobile : {}) }}>
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
  isMobile,
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
        <div style={{ ...styles.sectionHeader, ...(isMobile ? styles.sectionHeaderMobile : {}) }}>
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

        <div style={{ ...styles.filtersGrid, ...(isMobile ? styles.filtersGridMobile : {}) }}>
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

            <div style={{ ...styles.formGrid, ...(isMobile ? styles.formGridMobile : {}) }}>
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

            <div style={{ ...styles.formActions, ...(isMobile ? styles.formActionsMobile : {}) }}>
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


function ReportsPage({
  clients,
  products,
  requests,
  errorMessage,
  successMessage,
  exportGeneralExcel,
  exportGeneralPdf,
  exportClientsExcel,
  exportProductsExcel,
  exportRequestsExcel,
  isMobile,
}) {
  const summary = useMemo(
    () => buildReportSummary({ clients, products, requests }),
    [clients, products, requests]
  )

  return (
    <div>
      <Messages errorMessage={errorMessage} successMessage={successMessage} />

      <section style={styles.panel}>
        <div style={{ ...styles.sectionHeader, ...(isMobile ? styles.sectionHeaderMobile : {}) }}>
          <div>
            <h3 style={styles.panelTitle}>Reportes</h3>
            <p style={styles.emptyText}>
              Revisa la demanda, clientes más activos y productos más solicitados.
            </p>
          </div>

          <div style={{ ...styles.reportActions, ...(isMobile ? styles.reportActionsMobile : {}) }}>
            <button style={styles.primaryButtonSmall} onClick={exportGeneralExcel}>
              Excel general
            </button>
            <button style={styles.secondaryButton} onClick={exportGeneralPdf}>
              PDF general
            </button>
          </div>
        </div>

        <div style={{ ...styles.cardsGrid, ...(isMobile ? styles.cardsGridMobile : {}) }}>
          <StatCard title="Clientes" value={summary.totalClients} />
          <StatCard title="Productos" value={summary.totalProducts} />
          <StatCard title="Solicitudes" value={summary.totalRequests} />
        </div>

        <div style={{ ...styles.reportExportGrid, ...(isMobile ? styles.reportExportGridMobile : {}) }}>
          <button style={styles.tableButton} onClick={exportClientsExcel}>Exportar clientes</button>
          <button style={styles.tableButton} onClick={exportProductsExcel}>Exportar productos</button>
          <button style={styles.tableButton} onClick={exportRequestsExcel}>Exportar solicitudes</button>
        </div>
      </section>

      <section style={{ ...styles.dashboardGrid, ...(isMobile ? styles.dashboardGridMobile : {}) }}>
        <ReportList
          title="Productos más solicitados"
          emptyText="No hay productos solicitados todavía."
          rows={summary.topProducts}
          renderRow={(product) => (
            <div key={product.name} style={styles.listItem}>
              <strong>{product.name}</strong>
              <span>{product.brand || 'Sin marca'}</span>
              <small>Solicitudes: {product.totalRequests} · Cantidad: {product.totalQuantity}</small>
            </div>
          )}
        />

        <ReportList
          title="Clientes más activos"
          emptyText="No hay clientes activos todavía."
          rows={summary.topClients}
          renderRow={(client) => (
            <div key={client.name} style={styles.listItem}>
              <strong>{client.name}</strong>
              <span>{client.contact || 'Sin contacto'}</span>
              <small>Solicitudes: {client.totalRequests} · Cantidad: {client.totalQuantity}</small>
            </div>
          )}
        />

        <ReportList
          title="Solicitudes por estado"
          emptyText="No hay estados para mostrar."
          rows={summary.statusSummary}
          renderRow={(status) => (
            <div key={status.status} style={styles.listItem}>
              <strong>{status.status}</strong>
              <small>Total: {status.total}</small>
            </div>
          )}
        />
      </section>

      <section style={styles.panel}>
        <h3 style={styles.panelTitle}>Solicitudes por mes</h3>
        {summary.monthlySummary.length === 0 ? (
          <p style={styles.emptyText}>No hay solicitudes mensuales todavía.</p>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Mes</th>
                  <th style={styles.th}>Total de solicitudes</th>
                </tr>
              </thead>
              <tbody>
                {summary.monthlySummary.map((row) => (
                  <tr key={row.month}>
                    <td style={styles.td}>{row.month}</td>
                    <td style={styles.td}>{row.total}</td>
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

function ImportExportPage({
  clients,
  products,
  requests,
  importType,
  setImportType,
  importFileName,
  importPreviewRows,
  importLoading,
  downloadImportTemplate,
  handleImportFileChange,
  confirmImport,
  clearImportPreview,
  errorMessage,
  successMessage,
  exportGeneralExcel,
  exportGeneralPdf,
  exportClientsExcel,
  exportProductsExcel,
  exportRequestsExcel,
  isMobile,
}) {
  const totalImportErrors = importPreviewRows.reduce((total, row) => total + row.errors.length, 0)
  const totalImportWarnings = importPreviewRows.reduce((total, row) => total + row.warnings.length, 0)

  return (
    <div>
      <Messages errorMessage={errorMessage} successMessage={successMessage} />

      <section style={styles.panel}>
        <div style={{ ...styles.sectionHeader, ...(isMobile ? styles.sectionHeaderMobile : {}) }}>
          <div>
            <h3 style={styles.panelTitle}>Importar datos</h3>
            <p style={styles.emptyText}>
              Descarga la plantilla oficial, llena los datos y sube el Excel. El sistema mostrará errores y advertencias antes de guardar.
            </p>
          </div>

          <button type="button" style={styles.primaryButtonSmall} onClick={downloadImportTemplate}>
            Descargar plantilla
          </button>
        </div>

        <div style={{ ...styles.importControls, ...(isMobile ? styles.importControlsMobile : {}) }}>
          <div>
            <label style={styles.label}>Tipo de importación</label>
            <select
              style={styles.input}
              value={importType}
              onChange={(event) => {
                setImportType(event.target.value)
                clearImportPreview()
              }}
            >
              <option value="clients">Clientes</option>
              <option value="products">Productos</option>
            </select>
          </div>

          <div>
            <label style={styles.label}>Archivo Excel</label>
            <input
              style={styles.input}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImportFileChange}
              disabled={importLoading}
            />
          </div>
        </div>

        {importLoading && <p style={styles.emptyText}>Procesando archivo...</p>}

        {importFileName && (
          <div style={styles.importSummaryBox}>
            <strong>Archivo:</strong> {importFileName}
            <br />
            <strong>Registros detectados:</strong> {importPreviewRows.length}
            <br />
            <strong>Errores:</strong> {totalImportErrors} · <strong>Advertencias:</strong> {totalImportWarnings}
          </div>
        )}

        {importPreviewRows.length > 0 && (
          <div style={styles.importPreviewArea}>
            <div style={{ ...styles.sectionHeader, ...(isMobile ? styles.sectionHeaderMobile : {}) }}>
              <div>
                <h4 style={styles.formTitle}>Vista previa antes de importar</h4>
                <p style={styles.emptyText}>
                  Las advertencias no bloquean. Los errores sí deben corregirse en el Excel.
                </p>
              </div>

              <div style={styles.exportCardActions}>
                <button type="button" style={styles.secondaryButton} onClick={clearImportPreview}>
                  Limpiar
                </button>
                <button
                  type="button"
                  style={styles.primaryButtonSmall}
                  onClick={confirmImport}
                  disabled={importLoading || totalImportErrors > 0}
                >
                  Confirmar importación
                </button>
              </div>
            </div>

            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Fila</th>
                    <th style={styles.th}>Registro</th>
                    <th style={styles.th}>Detalle</th>
                    <th style={styles.th}>Advertencias</th>
                    <th style={styles.th}>Errores</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreviewRows.map((row) => (
                    <tr key={`${row.type}-${row.rowNumber}`}>
                      <td style={styles.td}>{row.rowNumber}</td>
                      <td style={styles.td}>
                        <strong>{row.preview.main}</strong>
                        <small style={styles.smallText}>{row.type === 'client' ? 'Cliente' : 'Producto'}</small>
                      </td>
                      <td style={styles.td}>{row.preview.secondary}</td>
                      <td style={styles.td}>
                        {row.warnings.length === 0 ? (
                          '—'
                        ) : (
                          <ul style={styles.importMessageList}>
                            {row.warnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td style={styles.td}>
                        {row.errors.length === 0 ? (
                          '—'
                        ) : (
                          <ul style={styles.importErrorList}>
                            {row.errors.map((error) => (
                              <li key={error}>{error}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section style={styles.panel}>
        <div style={{ ...styles.sectionHeader, ...(isMobile ? styles.sectionHeaderMobile : {}) }}>
          <div>
            <h3 style={styles.panelTitle}>Exportar datos</h3>
            <p style={styles.emptyText}>
              Descarga reportes y bases de datos en Excel o PDF.
            </p>
          </div>
        </div>

        <div style={{ ...styles.exportCardsGrid, ...(isMobile ? styles.exportCardsGridMobile : {}) }}>
          <ExportCard
            title="Reporte general"
            description={`Incluye ${clients.length} clientes, ${products.length} productos y ${requests.length} solicitudes.`}
            primaryLabel="Descargar Excel"
            secondaryLabel="Descargar PDF"
            onPrimary={exportGeneralExcel}
            onSecondary={exportGeneralPdf}
          />

          <ExportCard
            title="Clientes"
            description="Exporta la base completa de clientes con contacto, teléfono, correo y ciudad."
            primaryLabel="Descargar Excel"
            onPrimary={exportClientsExcel}
          />

          <ExportCard
            title="Productos"
            description="Exporta catálogo de productos con códigos, marca, categoría, descripción e imagen."
            primaryLabel="Descargar Excel"
            onPrimary={exportProductsExcel}
          />

          <ExportCard
            title="Solicitudes"
            description="Exporta el historial de solicitudes con cliente, producto, cantidad, fecha y estado."
            primaryLabel="Descargar Excel"
            onPrimary={exportRequestsExcel}
          />
        </div>
      </section>
    </div>
  )
}

function ReportList({ title, emptyText, rows, renderRow }) {
  return (
    <div style={styles.panel}>
      <h3 style={styles.panelTitle}>{title}</h3>
      {rows.length === 0 ? (
        <p style={styles.emptyText}>{emptyText}</p>
      ) : (
        <div style={styles.list}>{rows.map(renderRow)}</div>
      )}
    </div>
  )
}

function ExportCard({
  title,
  description,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}) {
  return (
    <div style={styles.exportCard}>
      <h4 style={styles.formTitle}>{title}</h4>
      <p style={styles.emptyText}>{description}</p>
      <div style={styles.exportCardActions}>
        <button style={styles.primaryButtonSmall} onClick={onPrimary}>
          {primaryLabel}
        </button>
        {secondaryLabel && (
          <button style={styles.secondaryButton} onClick={onSecondary}>
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  )
}

function PlaceholderPage({ title, description, buttonText, isMobile }) {
  return (
    <section style={styles.panel}>
      <div style={{ ...styles.placeholderHeader, ...(isMobile ? styles.placeholderHeaderMobile : {}) }}>
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

  appMobile: {
    flexDirection: 'column',
  },
  sidebarMobile: {
    width: '100%',
    padding: '0.9rem 1rem',
    gap: '0.9rem',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  brandMobile: {
    justifyContent: 'flex-start',
  },
  navMobile: {
    display: 'flex',
    gap: '0.5rem',
    overflowX: 'auto',
    paddingBottom: '0.25rem',
    WebkitOverflowScrolling: 'touch',
  },
  navButtonMobile: {
    flex: '0 0 auto',
    width: 'auto',
    textAlign: 'center',
    padding: '0.7rem 0.85rem',
    whiteSpace: 'nowrap',
  },
  mainAreaMobile: {
    width: '100%',
  },
  topbarMobile: {
    height: 'auto',
    padding: '0.85rem 1rem',
    alignItems: 'flex-start',
  },
  pageTitleMobile: {
    fontSize: '1.25rem',
  },
  contentMobile: {
    padding: '1rem',
  },
  cardsGridMobile: {
    gridTemplateColumns: '1fr',
  },
  dashboardGridMobile: {
    gridTemplateColumns: '1fr',
  },
  sectionHeaderMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  placeholderHeaderMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  filtersGridMobile: {
    gridTemplateColumns: '1fr',
  },
  formGridMobile: {
    gridTemplateColumns: '1fr',
  },
  formActionsMobile: {
    flexDirection: 'column-reverse',
    alignItems: 'stretch',
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
  reportActions: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
  },
  reportActionsMobile: {
    width: '100%',
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  reportExportGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '0.75rem',
    marginTop: '1rem',
  },
  reportExportGridMobile: {
    gridTemplateColumns: '1fr',
  },
  exportCardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '1rem',
    marginTop: '1rem',
  },
  exportCardsGridMobile: {
    gridTemplateColumns: '1fr',
  },
  exportCard: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '14px',
    padding: '1rem',
    display: 'grid',
    gap: '0.6rem',
  },
  exportCardActions: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
  },
  importControls: {
    display: 'grid',
    gridTemplateColumns: '1fr 2fr',
    gap: '1rem',
    marginTop: '1rem',
  },
  importControlsMobile: {
    gridTemplateColumns: '1fr',
  },
  importSummaryBox: {
    marginTop: '1rem',
    padding: '1rem',
    borderRadius: '12px',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    color: '#111827',
    lineHeight: 1.6,
  },
  importPreviewArea: {
    marginTop: '1rem',
  },
  importMessageList: {
    margin: 0,
    paddingLeft: '1.1rem',
    color: '#92400e',
  },
  importErrorList: {
    margin: 0,
    paddingLeft: '1.1rem',
    color: '#991b1b',
    fontWeight: '700',
  },

}

export default App