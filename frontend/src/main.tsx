import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './views.css'

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
type FoodItem = { id: string; name: string; priceCentavos: number; availableOrderQty: number; isArchived: boolean }
type Order = { id: string; createdAt: string; totalCentavos: number; lines: { itemName: string; unitPriceCentavos: number; quantity: number }[] }
type FormValues = { name: string; price: string; inventory: string }
const emptyForm: FormValues = { name: '', price: '', inventory: '' }
const pesos = (centavos: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(centavos / 100)

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options })
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message ?? Object.values(body?.errors ?? {})?.flat()[0] ?? 'Something went wrong.') }
  return response.status === 204 ? undefined as T : response.json()
}

function App() {
  const [items, setItems] = useState<FoodItem[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [cart, setCart] = useState<Record<string, number>>({})
  const [form, setForm] = useState<FormValues>(emptyForm)
  const [editing, setEditing] = useState<FoodItem | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<'customer' | 'admin'>('customer')

  const refresh = async () => { const [menu, history] = await Promise.all([request<FoodItem[]>('/api/food-items?includeArchived=true'), request<Order[]>('/api/orders')]); setItems(menu); setOrders(history) }
  useEffect(() => { refresh().catch(error => setMessage(error.message)) }, [])
  const activeItems = items.filter(item => !item.isArchived)
  const total = useMemo(() => activeItems.reduce((sum, item) => sum + item.priceCentavos * (cart[item.id] ?? 0), 0), [activeItems, cart])

  const changeQuantity = (item: FoodItem, delta: number) => setCart(current => ({ ...current, [item.id]: Math.max(0, Math.min(item.availableOrderQty, (current[item.id] ?? 0) + delta)) }))
  const saveItem = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const payload = { name: form.name, priceCentavos: Math.round(Number(form.price) * 100), availableOrderQty: Number(form.inventory) }
      await request(editing ? `/api/food-items/${editing.id}` : '/api/food-items', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) })
      setForm(emptyForm); setEditing(null); await refresh(); setMessage('Menu saved.')
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }
  const archive = async (item: FoodItem) => { if (!confirm(`Archive ${item.name}? It will remain in order history.`)) return; try { await request(`/api/food-items/${item.id}`, { method: 'DELETE' }); setCart(current => ({ ...current, [item.id]: 0 })); await refresh(); setMessage('Item archived.') } catch (error) { setMessage((error as Error).message) } }
  const checkout = async () => {
    const lines = Object.entries(cart).filter(([, quantity]) => quantity > 0).map(([foodItemId, quantity]) => ({ foodItemId, quantity }))
    if (!lines.length) { setMessage('Add at least one item to the order.'); return }
    setBusy(true); setMessage('')
    try { await request('/api/orders', { method: 'POST', body: JSON.stringify({ items: lines }) }); setCart({}); await refresh(); setMessage('Order recorded and inventory updated.') } catch (error) { setMessage((error as Error).message); await refresh() } finally { setBusy(false) }
  }
  const beginEdit = (item: FoodItem) => { setEditing(item); setForm({ name: item.name, price: (item.priceCentavos / 100).toFixed(2), inventory: String(item.availableOrderQty) }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const switchView = (nextView: 'customer' | 'admin') => { setView(nextView); setMessage('') }

  return <main>
    <header><div><p className="eyebrow">KARENDERYA</p><h1>{view === 'customer' ? 'What would you like?' : 'Admin dashboard'}</h1><p className="subtle">{view === 'customer' ? 'Choose your dishes and place an order.' : 'Add dishes, manage inventory, and review orders.'}</p></div>{view === 'customer' && <div className="total"><span>Current order</span><strong>{pesos(total)}</strong></div>}</header>
    <nav className="view-switcher" aria-label="Application view"><button className={view === 'customer' ? 'selected' : 'secondary'} onClick={() => switchView('customer')}>Customer order</button><button className={view === 'admin' ? 'selected' : 'secondary'} onClick={() => switchView('admin')}>Admin</button></nav>
    {message && <div className="message" role="status">{message}</div>}
    {view === 'customer' ? <section className="panel customer-order"><h2>Take an order</h2>{activeItems.length === 0 ? <p>No dishes are available.</p> : <div className="menu">{activeItems.map(item => <article className="menu-item" key={item.id}><div><h3>{item.name}</h3><p>{pesos(item.priceCentavos)} · {item.availableOrderQty} left</p></div><div className="stepper"><button aria-label={`Remove ${item.name}`} onClick={() => changeQuantity(item, -1)}>−</button><strong>{cart[item.id] ?? 0}</strong><button aria-label={`Add ${item.name}`} disabled={item.availableOrderQty === 0 || (cart[item.id] ?? 0) >= item.availableOrderQty} onClick={() => changeQuantity(item, 1)}>+</button></div></article>)}</div>}<button className="checkout" disabled={busy || total === 0} onClick={checkout}>Place order · {pesos(total)}</button></section> : <>
      <section className="management panel"><div><h2>{editing ? 'Edit menu item' : 'Add menu item'}</h2><p className="subtle">Archived dishes are kept in past orders but cannot be ordered again.</p></div><form onSubmit={saveItem}><input required placeholder="Dish name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /><input required min="0.01" step="0.01" type="number" placeholder="Price (₱)" value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} /><input required min="0" step="1" type="number" placeholder="Stock" value={form.inventory} onChange={event => setForm({ ...form, inventory: event.target.value })} /><button disabled={busy}>{editing ? 'Update item' : 'Add item'}</button>{editing && <button type="button" className="secondary" onClick={() => { setEditing(null); setForm(emptyForm) }}>Cancel</button>}</form></section>
      <section className="panel"><h2>Menu management</h2><div className="compact-list">{items.map(item => <article key={item.id} className={item.isArchived ? 'archived' : ''}><div><strong>{item.name}</strong><small>{pesos(item.priceCentavos)} · {item.availableOrderQty} in stock {item.isArchived && '· archived'}</small></div><div>{!item.isArchived && <><button className="text" onClick={() => beginEdit(item)}>Edit</button><button className="text danger" onClick={() => archive(item)}>Archive</button></>}</div></article>)}</div></section>
      <section className="panel history"><h2>Previous orders</h2>{orders.length === 0 ? <p className="subtle">No orders yet.</p> : orders.map(order => <article key={order.id}><div><strong>{new Date(order.createdAt).toLocaleString('en-PH')}</strong><p>{order.lines.map(line => `${line.quantity}× ${line.itemName}`).join(', ')}</p></div><strong>{pesos(order.totalCentavos)}</strong></article>)}</section>
    </>}
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
