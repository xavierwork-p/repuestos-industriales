import { demoTables } from './demoSeedData'

const STORAGE_KEY = 'repuestos-industriales-demo-local-changes-v1'
const LOCAL_TABLES = [
  'clients',
  'products',
  'requests',
  'categories',
  'subcategories',
  'request_status_history',
]

const demoFiles = new Map()
const authListeners = new Set()

let signedIn = true

const demoUser = {
  id: 'demo-user',
  email: 'demo@sistema.local',
}

function createDemoSession() {
  return {
    access_token: 'demo-local-session',
    token_type: 'bearer',
    expires_in: 60 * 60 * 24,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    refresh_token: 'demo-local-refresh',
    user: demoUser,
  }
}

function emitAuth(event, session) {
  authListeners.forEach((listener) => listener(event, session))
}

function createEmptyTableChanges() {
  return {
    created: [],
    updated: {},
    deleted: [],
  }
}

function createEmptyChanges() {
  return {
    version: 1,
    tables: Object.fromEntries(
      LOCAL_TABLES.map((table) => [table, createEmptyTableChanges()])
    ),
  }
}

function normalizeChanges(rawChanges) {
  const changes = rawChanges && typeof rawChanges === 'object' ? rawChanges : {}
  const tables = changes.tables && typeof changes.tables === 'object' ? changes.tables : {}

  return {
    version: 1,
    tables: Object.fromEntries(
      LOCAL_TABLES.map((table) => [
        table,
        {
          ...createEmptyTableChanges(),
          ...(tables[table] || {}),
        },
      ])
    ),
  }
}

function readChanges() {
  if (typeof window === 'undefined') return createEmptyChanges()

  try {
    const rawChanges = window.localStorage.getItem(STORAGE_KEY)
    return normalizeChanges(rawChanges ? JSON.parse(rawChanges) : null)
  } catch {
    return createEmptyChanges()
  }
}

function writeChanges(changes) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(changes))
}

export function clearDemoLocalChanges() {
  if (typeof window === 'undefined') return

  window.localStorage.removeItem(STORAGE_KEY)
  window.location.reload()
}

function createId(table) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `demo-${table}-${crypto.randomUUID()}`
  }

  return `demo-${table}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function sameId(left, right) {
  return String(left) === String(right)
}

function toId(value) {
  return value === null || value === undefined ? '' : String(value)
}

function nowIso() {
  return new Date().toISOString()
}

function prepareInsertedRecord(table, payload) {
  const timestamp = nowIso()

  return {
    ...payload,
    id: payload.id || createId(table),
    created_at: payload.created_at || timestamp,
    updated_at: payload.updated_at || timestamp,
  }
}

async function getRemoteTable(table) {
  return {
    data: structuredClone(demoTables[table] || []),
    error: null,
  }
}

async function getBaseRows(table) {
  const { data, error } = await getRemoteTable(table)

  if (error) return { data: null, error }

  const changes = readChanges()
  const tableChanges = changes.tables[table] || createEmptyTableChanges()
  const deletedIds = new Set(tableChanges.deleted.map(toId))

  const remoteRows = (data || [])
    .filter((row) => !deletedIds.has(toId(row.id)))
    .map((row) => ({
      ...row,
      ...(tableChanges.updated[toId(row.id)] || {}),
    }))

  return {
    data: [...tableChanges.created, ...remoteRows],
    error: null,
  }
}

function byId(rows) {
  return new Map(rows.map((row) => [toId(row.id), row]))
}

async function getProductsRows() {
  const [productsResult, categoriesResult, subcategoriesResult] = await Promise.all([
    getBaseRows('products'),
    getBaseRows('categories'),
    getBaseRows('subcategories'),
  ])

  const firstError =
    productsResult.error || categoriesResult.error || subcategoriesResult.error

  if (firstError) return { data: null, error: firstError }

  const categoryMap = byId(categoriesResult.data || [])
  const subcategoryMap = byId(subcategoriesResult.data || [])

  return {
    data: (productsResult.data || []).map((product) => ({
      ...product,
      categories:
        (product.category_id ? categoryMap.get(toId(product.category_id)) || null : null) ||
        product.categories ||
        null,
      subcategories:
        (product.subcategory_id
          ? subcategoryMap.get(toId(product.subcategory_id)) || null
          : null) ||
        product.subcategories ||
        null,
    })),
    error: null,
  }
}

async function getRequestDetailsRows() {
  const [requestsResult, clientsResult, productsResult, statusesResult] =
    await Promise.all([
      getBaseRows('requests'),
      getBaseRows('clients'),
      getProductsRows(),
      getBaseRows('request_statuses'),
    ])

  const firstError =
    requestsResult.error ||
    clientsResult.error ||
    productsResult.error ||
    statusesResult.error

  if (firstError) return { data: null, error: firstError }

  const clientMap = byId(clientsResult.data || [])
  const productMap = byId(productsResult.data || [])
  const statusMap = byId(statusesResult.data || [])

  return {
    data: (requestsResult.data || []).map((request) => {
      const client = clientMap.get(toId(request.client_id))
      const product = productMap.get(toId(request.product_id))
      const status = statusMap.get(toId(request.status_id))

      return {
        ...request,
        company_name: client?.company_name || request.company_name || '',
        contact_name: client?.contact_name || request.contact_name || '',
        phone: client?.phone || request.phone || '',
        email: client?.email || request.email || '',
        city: client?.city || request.city || '',
        country: client?.country || request.country || '',
        product_name: product?.name || request.product_name || '',
        internal_code: product?.internal_code || request.internal_code || '',
        manufacturer_code:
          product?.manufacturer_code || request.manufacturer_code || '',
        brand: product?.brand || request.brand || '',
        category_name:
          product?.categories?.name || product?.category_name || request.category_name || '',
        subcategory_name:
          product?.subcategories?.name ||
          product?.subcategory_name ||
          request.subcategory_name ||
          '',
        status_name: status?.name || request.status_name || '',
      }
    }),
    error: null,
  }
}

function buildTopProducts(requests) {
  const productMap = new Map()

  requests.forEach((request) => {
    const productId = toId(request.product_id || request.product_name)
    if (!productId) return

    const current = productMap.get(productId) || {
      product_id: request.product_id,
      product_name: request.product_name || 'Producto sin nombre',
      brand: request.brand || '',
      total_requests: 0,
      total_quantity: 0,
    }

    current.total_requests += 1
    current.total_quantity += Number(request.quantity || 0)
    productMap.set(productId, current)
  })

  return Array.from(productMap.values()).sort(
    (left, right) => right.total_requests - left.total_requests
  )
}

function buildTopClients(requests) {
  const clientMap = new Map()

  requests.forEach((request) => {
    const clientId = toId(request.client_id || request.company_name)
    if (!clientId) return

    const current = clientMap.get(clientId) || {
      client_id: request.client_id,
      company_name: request.company_name || 'Cliente sin nombre',
      contact_name: request.contact_name || '',
      total_requests: 0,
      total_quantity: 0,
    }

    current.total_requests += 1
    current.total_quantity += Number(request.quantity || 0)
    clientMap.set(clientId, current)
  })

  return Array.from(clientMap.values()).sort(
    (left, right) => right.total_requests - left.total_requests
  )
}

async function getRowsForTable(table) {
  if (table === 'products') return getProductsRows()

  if (table === 'request_details') return getRequestDetailsRows()

  if (table === 'top_requested_products') {
    const requestDetailsResult = await getRequestDetailsRows()
    if (requestDetailsResult.error) return requestDetailsResult

    return {
      data: buildTopProducts(requestDetailsResult.data || []),
      error: null,
    }
  }

  if (table === 'top_clients') {
    const requestDetailsResult = await getRequestDetailsRows()
    if (requestDetailsResult.error) return requestDetailsResult

    return {
      data: buildTopClients(requestDetailsResult.data || []),
      error: null,
    }
  }

  return getBaseRows(table)
}

function applyFilters(rows, filters) {
  return rows.filter((row) =>
    filters.every((filter) => {
      const value = row[filter.column]

      if (filter.type === 'eq') return sameId(value, filter.value)

      if (filter.type === 'ilike') {
        const text = String(value || '').toLowerCase()
        const pattern = String(filter.value || '').toLowerCase()

        if (pattern.includes('%')) {
          return text.includes(pattern.replaceAll('%', ''))
        }

        return text === pattern
      }

      return true
    })
  )
}

function applyOrdering(rows, orders) {
  return [...rows].sort((left, right) => {
    for (const order of orders) {
      const leftValue = left[order.column] ?? ''
      const rightValue = right[order.column] ?? ''
      const result = String(leftValue).localeCompare(String(rightValue), undefined, {
        numeric: true,
      })

      if (result !== 0) return order.ascending ? result : -result
    }

    return 0
  })
}

class DemoQueryBuilder {
  constructor(table) {
    this.table = table
    this.operation = ''
    this.payload = null
    this.filters = []
    this.orders = []
    this.limitCount = null
    this.singleMode = ''
    this.selectColumns = '*'
    this.selectOptions = {}
    this.returning = false
  }

  select(columns = '*', options = {}) {
    if (!this.operation) {
      this.operation = 'select'
    } else {
      this.returning = true
    }

    this.selectColumns = columns
    this.selectOptions = options || {}
    return this
  }

  insert(payload) {
    this.operation = 'insert'
    this.payload = payload
    return this
  }

  update(payload) {
    this.operation = 'update'
    this.payload = payload
    return this
  }

  delete() {
    this.operation = 'delete'
    return this
  }

  eq(column, value) {
    this.filters.push({ type: 'eq', column, value })
    return this
  }

  ilike(column, value) {
    this.filters.push({ type: 'ilike', column, value })
    return this
  }

  order(column, options = {}) {
    this.orders.push({
      column,
      ascending: options.ascending !== false,
    })
    return this
  }

  limit(count) {
    this.limitCount = count
    return this
  }

  maybeSingle() {
    this.singleMode = 'maybe'
    return this
  }

  single() {
    this.singleMode = 'single'
    return this
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject)
  }

  async execute() {
    try {
      if (!this.operation || this.operation === 'select') return this.executeSelect()
      if (this.operation === 'insert') return this.executeInsert()
      if (this.operation === 'update') return this.executeUpdate()
      if (this.operation === 'delete') return this.executeDelete()

      return { data: null, error: null, count: null }
    } catch (error) {
      return {
        data: null,
        error: { message: error.message || 'No se pudo aplicar el cambio demo.' },
        count: null,
      }
    }
  }

  async executeSelect() {
    const { data, error } = await getRowsForTable(this.table)
    if (error) return { data: null, error, count: null }

    let rows = applyFilters(data || [], this.filters)
    const count = this.selectOptions.count ? rows.length : null

    if (this.selectOptions.head) {
      return { data: null, error: null, count }
    }

    if (this.orders.length > 0) rows = applyOrdering(rows, this.orders)
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount)

    if (this.singleMode === 'single') {
      return { data: rows[0] || null, error: null, count }
    }

    if (this.singleMode === 'maybe') {
      return { data: rows[0] || null, error: null, count }
    }

    return { data: rows, error: null, count }
  }

  async executeInsert() {
    if (!LOCAL_TABLES.includes(this.table)) {
      return { data: null, error: null, count: null }
    }

    const payloadRows = Array.isArray(this.payload) ? this.payload : [this.payload]
    const insertedRows = payloadRows.map((payload) =>
      prepareInsertedRecord(this.table, payload || {})
    )

    const changes = readChanges()
    changes.tables[this.table].created = [
      ...insertedRows,
      ...changes.tables[this.table].created,
    ]
    writeChanges(changes)

    return this.mutationResult(insertedRows)
  }

  async executeUpdate() {
    if (!LOCAL_TABLES.includes(this.table)) {
      return { data: null, error: null, count: null }
    }

    const rowsResult = await getRowsForTable(this.table)
    if (rowsResult.error) return { data: null, error: rowsResult.error, count: null }

    const targets = applyFilters(rowsResult.data || [], this.filters)
    const changes = readChanges()
    const tableChanges = changes.tables[this.table]

    const updatedRows = targets.map((row) => ({
      ...row,
      ...(this.payload || {}),
    }))

    updatedRows.forEach((row) => {
      const createdIndex = tableChanges.created.findIndex((createdRow) =>
        sameId(createdRow.id, row.id)
      )

      if (createdIndex >= 0) {
        tableChanges.created[createdIndex] = row
      } else {
        const id = toId(row.id)
        tableChanges.updated[id] = {
          ...(tableChanges.updated[id] || {}),
          ...(this.payload || {}),
        }
      }
    })

    writeChanges(changes)

    return this.mutationResult(updatedRows)
  }

  async executeDelete() {
    if (!LOCAL_TABLES.includes(this.table)) {
      return { data: null, error: null, count: null }
    }

    const rowsResult = await getRowsForTable(this.table)
    if (rowsResult.error) return { data: null, error: rowsResult.error, count: null }

    const targets = applyFilters(rowsResult.data || [], this.filters)
    const changes = readChanges()
    const tableChanges = changes.tables[this.table]
    const targetIds = new Set(targets.map((row) => toId(row.id)))

    tableChanges.created = tableChanges.created.filter(
      (row) => !targetIds.has(toId(row.id))
    )

    targets.forEach((row) => {
      const id = toId(row.id)
      delete tableChanges.updated[id]

      if (!id.startsWith(`demo-${this.table}-`)) {
        tableChanges.deleted = Array.from(new Set([...tableChanges.deleted, id]))
      }
    })

    writeChanges(changes)

    return this.mutationResult(targets)
  }

  mutationResult(rows) {
    if (this.singleMode === 'single') {
      return { data: rows[0] || null, error: null, count: null }
    }

    if (this.returning || this.singleMode === 'maybe') {
      return { data: rows, error: null, count: null }
    }

    return { data: null, error: null, count: null }
  }
}

function createDemoStorageBucket() {
  return {
    async upload(filePath, file) {
      if (typeof URL !== 'undefined' && file) {
        demoFiles.set(filePath, URL.createObjectURL(file))
      }

      return {
        data: { path: filePath },
        error: null,
      }
    },
    getPublicUrl(filePath) {
      return {
        data: {
          publicUrl: demoFiles.get(filePath) || '',
        },
      }
    },
  }
}

export const supabase = {
  from(table) {
    return new DemoQueryBuilder(table)
  },
  storage: {
    from() {
      return createDemoStorageBucket()
    },
  },
  auth: {
    async getSession() {
      return {
        data: {
          session: signedIn ? createDemoSession() : null,
        },
        error: null,
      }
    },
    onAuthStateChange(callback) {
      authListeners.add(callback)

      queueMicrotask(() => {
        callback(signedIn ? 'SIGNED_IN' : 'SIGNED_OUT', signedIn ? createDemoSession() : null)
      })

      return {
        data: {
          subscription: {
            unsubscribe() {
              authListeners.delete(callback)
            },
          },
        },
      }
    },
    async signInWithPassword() {
      signedIn = true
      const session = createDemoSession()
      emitAuth('SIGNED_IN', session)

      return {
        data: {
          session,
          user: demoUser,
        },
        error: null,
      }
    },
    async signOut() {
      signedIn = false
      emitAuth('SIGNED_OUT', null)

      return {
        error: null,
      }
    },
  },
}
