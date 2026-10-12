import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowRight, CalendarDays, Check, ChevronDown, Clock3, House, MapPin, Minus,
  Package, Plus, Search, ShoppingBag, SlidersHorizontal, Sparkles, Store,
  UtensilsCrossed, X, CircleCheck, CircleDot,
  RefreshCw, ClipboardList, TrendingUp, UsersRound, DollarSign, Bike,
  UserCircle, LogIn, UserPlus, Pencil, HeartPulse,
} from 'lucide-react';
import {
  getGetDashboardSummaryQueryKey,
  getGetFeaturedMenuQueryKey,
  getGetOrderQueryKey,
  getGetReservationAvailabilityQueryKey,
  getListMenuQueryKey,
  getListOrdersQueryKey,
  getListReservationsQueryKey,
  OrderInputOrderType,
  OrderStatusUpdateStatus,
  useCreateOrder,
  useCreateReservation,
  useGetDashboardSummary,
  useGetFeaturedMenu,
  useGetOrder,
  useGetReservationAvailability,
  useListMenu,
  useListOrders,
  useListReservations,
  useUpdateOrderStatus,
  type MenuItem,
  type Order,
  type Reservation,
} from '@workspace/api-client-react';
import {
  Route,
  Switch,
  Link,
  useParams,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

type CartLine = { item: MenuItem; quantity: number; customizations?: string };

const money = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;
const today = new Date().toISOString().slice(0, 10);
const statusLabel = (status: string) => status.replaceAll('_', ' ');
const categories = ['all', 'soups', 'salads', 'mains', 'drinks', 'desserts'];

type AuthUser = { id: string; name: string; email: string; phone?: string | null; role: string };
type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json().catch(() => null) as { error?: string; message?: string; user?: T } | T | null;
  if (!response.ok) {
    const message = body && typeof body === 'object' && ('error' in body || 'message' in body) ? (body.error ?? body.message) : undefined;
    throw new Error(message || `Request failed (${response.status})`);
  }
  return body && typeof body === 'object' && 'user' in body && body.user ? body.user : body as T;
}

function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    try {
      const current = await authRequest<AuthUser>('/api/auth/me');
      setUser(current);
      return current;
    } catch (error) {
      if ((error as { message?: string }).message?.includes('(401)')) setUser(null);
      else setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void refresh(); }, []);
  const logout = async () => {
    await authRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    await queryClient.invalidateQueries();
  };
  return <AuthContext.Provider value={{ user, loading, refresh, logout }}>{children}</AuthContext.Provider>;
}

const isAuthError = (error: unknown) => {
  const status = (error as { status?: number })?.status;
  return status === 401 || status === 403 || String((error as { message?: string })?.message ?? '').match(/HTTP (401|403)/) !== null;
};

function BrandMark() {
  return <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><UtensilsCrossed size={18} strokeWidth={2.5} /></span>;
}

function AppShell({ children, cartCount }: { children: ReactNode; cartCount: number }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const isAdmin = location.startsWith('/admin');
  const nav = [
    { href: '/', label: 'Home', icon: House },
    { href: '/menu', label: 'Menu', icon: UtensilsCrossed },
    { href: '/reserve', label: 'Reservations', icon: CalendarDays },
    { href: '/profile', label: 'My Orders', icon: ClipboardList },
    { href: '/login', label: 'Login / Register', icon: UserCircle },
  ];
  return <div className="grain min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
    <header className="sticky top-0 z-40 border-b border-[hsl(var(--border))] bg-[hsl(var(--card)/.96)] shadow-[0_2px_12px_hsl(220_18%_15%/.04)] backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 lg:px-10">
        <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
          <BrandMark />
           <span className="font-display text-[22px] font-semibold tracking-[-.03em]">RestauranGo</span>{isAdmin && <span className="rounded-md bg-[hsl(var(--sidebar))] px-2 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-[hsl(var(--sidebar-foreground))]">Operations</span>}
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
           {nav.map(({ href, label, icon: Icon }) => <Link href={href} key={href} data-testid={`link-nav-${label.toLowerCase()}`} className={`group flex items-center gap-2 text-[13px] font-semibold capitalize tracking-[.01em] transition-colors ${location === href ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}>
            <Icon size={15} /><span>{label}</span>{location === href && <span className="h-1 w-1 rounded-full bg-[hsl(var(--accent))]" />}
          </Link>)}
        </nav>
        <div className="flex items-center gap-2">
            {user ? <button onClick={() => void logout()} className="hidden rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-[12px] font-bold text-[hsl(var(--muted-foreground))] transition hover:bg-[hsl(var(--secondary))] sm:block" data-testid="button-logout">Log out</button> : <Link href="/reserve" className="hidden rounded-lg border border-[hsl(var(--primary)/.3)] px-4 py-2 text-[12px] font-bold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--secondary))] sm:block" data-testid="link-header-reserve">Book a table</Link>}
           <Link href="/checkout" className="relative flex h-10 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-[12px] font-bold text-[hsl(var(--primary-foreground))] transition hover:bg-[hsl(var(--accent))]" data-testid="link-header-cart">
            <ShoppingBag size={16} /><span className="hidden sm:inline">Your order</span>
            {cartCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(var(--sidebar-primary))] px-1 text-[10px] text-[hsl(var(--sidebar-primary-foreground))]" data-testid="text-cart-count">{cartCount}</span>}
          </Link>
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-5 pb-3 md:hidden">
        {nav.map(({ href, label }) => <Link href={href} key={href} data-testid={`link-mobile-${label.toLowerCase()}`} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold ${location === href ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>{label}</Link>)}
      </div>
    </header>
    <main>{children}</main>
     <footer className="mt-20 border-t border-[hsl(var(--border))] bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))]">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-10 sm:flex-row sm:items-center sm:justify-between lg:px-10">
         <div><div className="flex items-center gap-2"><BrandMark /><span className="font-display text-xl">RestauranGo</span></div><p className="mt-2 max-w-xs text-sm text-[hsl(var(--sidebar-foreground)/.68)]">Fresh food, easy ordering, and a table waiting when you arrive.</p></div>
         <div className="text-xs text-[hsl(var(--sidebar-foreground)/.62)]">About · Contact · Privacy · Terms</div>
      </div>
    </footer>
  </div>;
}

function LoadingBlock({ label = 'Setting the table' }: { label?: string }) {
  return <div className="animate-fade space-y-3" data-testid="state-loading"><div className="h-36 animate-pulse rounded-[28px] bg-[hsl(var(--muted))]" /><div className="h-4 w-2/3 animate-pulse rounded bg-[hsl(var(--muted))]" /><div className="h-3 w-1/2 animate-pulse rounded bg-[hsl(var(--muted))]" /><p className="pt-2 font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">{label}…</p></div>;
}

function ErrorBlock({ onRetry }: { onRetry?: () => void }) {
  return <div className="rounded-[28px] border border-[hsl(var(--accent)/.35)] bg-[hsl(var(--accent)/.08)] p-8 text-center" data-testid="state-error"><p className="font-display text-2xl">The kitchen needs a minute.</p><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">We couldn’t load this just now. Try again in a moment.</p>{onRetry && <button onClick={onRetry} className="mt-5 rounded-full bg-[hsl(var(--primary))] px-5 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))]" data-testid="button-retry">Try again</button>}</div>;
}

function EmptyBlock({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-[28px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/.55)] p-10 text-center" data-testid="state-empty"><Sparkles className="mx-auto text-[hsl(var(--accent))]" size={24} /><p className="mt-3 font-display text-2xl">{title}</p><p className="mx-auto mt-2 max-w-sm text-sm text-[hsl(var(--muted-foreground))]">{detail}</p></div>;
}

function ItemArt({ item, large = false }: { item: MenuItem; large?: boolean }) {
  const category = item.category.toLowerCase();
  const colors = category === 'desserts' ? 'from-orange-200 to-rose-100' : category === 'drinks' ? 'from-amber-100 to-orange-200' : 'from-orange-100 to-red-100';
  return <div className={`relative overflow-hidden bg-gradient-to-br ${colors} ${large ? 'h-64' : 'h-44'} w-full`}>
    {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <UtensilsCrossed className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[hsl(var(--primary))]" size={48} />}
    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[hsl(220_18%_15%/.72)] to-transparent" />
    <div className="absolute bottom-4 left-5 max-w-[85%]"><span className="text-[10px] font-bold uppercase tracking-[.14em] text-white/85">{item.category}</span><p className="mt-1 font-display text-2xl leading-tight text-white drop-shadow-sm">{item.name}</p></div>
  </div>;
}

function MenuCard({ item, onAdd }: { item: MenuItem; onAdd: (item: MenuItem) => void }) {
  return <article className="group overflow-hidden rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-warm-sm transition duration-300 hover:translate-y-[-3px] hover:shadow-warm" data-testid={`card-menu-item-${item.id}`}>
    <ItemArt item={item} />
    <div className="p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-[22px] leading-tight">{item.name}</h3><p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[hsl(var(--muted-foreground))]">{item.description}</p></div><span className="font-mono-app whitespace-nowrap text-[13px] font-bold">{money(item.price)}</span></div>
      <div className="mt-4 flex items-center justify-between gap-2"><div className="flex flex-wrap gap-1.5">{item.dietaryTags?.slice(0, 2).map(tag => <span key={tag} className="rounded-full bg-[hsl(var(--secondary))] px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-[hsl(var(--secondary-foreground))]">{tag}</span>)}</div><button onClick={() => onAdd(item)} disabled={!item.isAvailable} className="flex h-9 items-center gap-1.5 rounded-full bg-[hsl(var(--primary))] px-3 text-[11px] font-bold text-[hsl(var(--primary-foreground))] transition hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-40" data-testid={`button-add-${item.id}`}><Plus size={14} /> {item.isAvailable ? 'Add' : 'Sold out'}</button></div>
    </div>
  </article>;
}

function Customizer({ item, onClose, onConfirm }: { item: MenuItem; onClose: () => void; onConfirm: (customizations?: string) => void }) {
  const [notes, setNotes] = useState('');
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[hsl(var(--primary)/.45)] p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" data-testid="dialog-customize">
    <div className="animate-rise w-full max-w-lg overflow-hidden rounded-[30px] bg-[hsl(var(--card))] shadow-2xl"><div className="relative"><ItemArt item={item} large /><button onClick={onClose} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--card)/.85)]" data-testid="button-close-customizer"><X size={17} /></button></div><div className="p-6 sm:p-7"><div className="flex justify-between"><div><h2 className="font-display text-3xl">{item.name}</h2><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{item.calories} calories · {item.allergens?.length ? `Contains ${item.allergens.join(', ')}` : 'No listed allergens'}</p></div><span className="font-mono-app text-sm">{money(item.price)}</span></div><label className="mt-6 block text-xs font-bold uppercase tracking-[.1em]">Kitchen note <span className="font-normal normal-case tracking-normal text-[hsl(var(--muted-foreground))]">(optional)</span><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Keep the herbs bright, please…" rows={3} className="mt-2 w-full resize-none rounded-2xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] p-3 text-sm outline-none transition focus:border-[hsl(var(--accent))]" data-testid="input-customization" /></label><button onClick={() => onConfirm(notes || undefined)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[hsl(var(--primary))] py-3.5 text-sm font-bold text-[hsl(var(--primary-foreground))] transition hover:translate-y-[-1px]" data-testid="button-confirm-add">Add to order <ArrowRight size={16} /></button></div></div>
  </div>;
}

function Home({ addToCart }: { addToCart: (item: MenuItem) => void }) {
  const featured = useGetFeaturedMenu({ query: { queryKey: getGetFeaturedMenuQueryKey() } });
  const items = featured.data ?? [];
  return <div>
    <section className="relative overflow-hidden bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><div className="mx-auto grid min-h-[610px] max-w-7xl items-center gap-10 px-5 py-20 lg:grid-cols-[1.05fr_.95fr] lg:px-10 lg:py-24"><div className="animate-rise"><p className="font-mono-app text-[10px] uppercase tracking-[.24em] text-[hsl(var(--sidebar-primary))]">Comfort food, considered</p><h1 className="mt-5 max-w-xl font-display text-[clamp(4rem,9vw,8rem)] leading-[.84] tracking-[-.065em]">Good food.<br /><span className="serif-italic text-[hsl(var(--sidebar-primary))]">Good feeling.</span></h1><p className="mt-7 max-w-md text-base leading-relaxed text-[hsl(var(--primary-foreground)/.7)]">Seasonal bowls, slow-cooked plates, and the kind of sides you’ll think about tomorrow. Made in small batches from our kitchen in the city.</p><div className="mt-9 flex flex-wrap gap-3"><Link href="/menu" className="flex items-center gap-2 rounded-full bg-[hsl(var(--sidebar-primary))] px-6 py-3.5 text-sm font-bold text-[hsl(var(--sidebar-primary-foreground))] transition hover:translate-y-[-2px]" data-testid="link-hero-menu">Explore the menu <ArrowRight size={17} /></Link><Link href="/reserve" className="rounded-full border border-[hsl(var(--primary-foreground)/.25)] px-6 py-3.5 text-sm font-semibold transition hover:bg-[hsl(var(--primary-foreground)/.08)]" data-testid="link-hero-reserve">Reserve a table</Link></div></div><div className="relative animate-rise delay-2"><div className="absolute -right-4 top-5 h-56 w-56 rounded-full bg-[hsl(var(--accent)/.28)] blur-3xl" /><div className="relative overflow-hidden rounded-[40px] border border-[hsl(var(--primary-foreground)/.18)] bg-[hsl(var(--primary-foreground)/.08)] p-3"><div className="flex aspect-[.88] flex-col justify-between overflow-hidden rounded-[30px] bg-[hsl(var(--sidebar-primary))] p-7 text-[hsl(var(--sidebar-primary-foreground))]"><div className="flex items-center justify-between"><span className="font-mono-app text-[10px] uppercase tracking-[.18em]">Today’s table</span><span className="rounded-full border border-current/20 px-2 py-1 text-[10px]">11—22</span></div><div><p className="font-display text-[clamp(3rem,6vw,5.5rem)] leading-[.85] tracking-[-.06em]">Made<br /><span className="serif-italic">warm.</span></p><div className="mt-6 flex items-end justify-between"><span className="max-w-[180px] text-sm leading-relaxed opacity-75">Thoughtful plates for ordinary days made better.</span><UtensilsCrossed size={50} strokeWidth={1} /></div></div></div></div><div className="absolute -bottom-4 -left-4 rounded-2xl bg-[hsl(var(--card))] px-4 py-3 text-[hsl(var(--foreground))] shadow-warm"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[hsl(var(--accent))]" /><span className="font-mono-app text-[10px] uppercase tracking-[.12em]">Kitchen is open</span></div></div></div></div></section>
    <section className="mx-auto max-w-7xl px-5 py-20 lg:px-10"><div className="flex items-end justify-between gap-5"><div><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-[hsl(var(--accent))]">The good stuff</p><h2 className="mt-2 font-display text-4xl tracking-[-.04em] sm:text-5xl">What’s calling you?</h2></div><Link href="/menu" className="hidden items-center gap-2 text-xs font-bold sm:flex" data-testid="link-featured-all">See full menu <ArrowRight size={15} /></Link></div>{featured.isLoading ? <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><LoadingBlock /><LoadingBlock /><LoadingBlock /></div> : featured.isError ? <div className="mt-8"><ErrorBlock onRetry={() => featured.refetch()} /></div> : items.length === 0 ? <div className="mt-8"><EmptyBlock title="The menu is resting." detail="Check back shortly for the next good thing." /></div> : <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.slice(0, 3).map((item, index) => <div key={item.id} className={`animate-rise delay-${index + 1}`}><MenuCard item={item} onAdd={addToCart} /></div>)}</div>}<Link href="/menu" className="mt-6 flex items-center justify-center gap-2 rounded-full border border-[hsl(var(--border))] px-5 py-3 text-xs font-bold sm:hidden" data-testid="link-featured-mobile">See the full menu <ArrowRight size={15} /></Link></section>
    <section className="border-y border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.45)]"><div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 lg:grid-cols-[.7fr_1.3fr] lg:px-10"><div><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-[hsl(var(--accent))]">Your kind of evening</p><h2 className="mt-3 max-w-md font-display text-4xl leading-[.95] tracking-[-.04em] sm:text-5xl">Stay for a while, or take the feeling with you.</h2></div><div className="grid gap-3 sm:grid-cols-2"><Link href="/reserve" className="group rounded-[24px] bg-[hsl(var(--card))] p-6 shadow-warm-sm transition hover:translate-y-[-3px]" data-testid="card-home-reserve"><CalendarDays className="text-[hsl(var(--accent))]" size={23} /><h3 className="mt-9 font-display text-2xl">Make it a night</h3><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Pick a table, bring your people, let us handle the rest.</p><ArrowRight className="mt-6 transition group-hover:translate-x-1" size={18} /></Link><Link href="/menu" className="group rounded-[24px] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] shadow-warm-sm transition hover:translate-y-[-3px]" data-testid="card-home-order"><ShoppingBag className="text-[hsl(var(--sidebar-primary))]" size={23} /><h3 className="mt-9 font-display text-2xl">Bring it home</h3><p className="mt-2 text-sm text-[hsl(var(--primary-foreground)/.65)]">Order ahead for a pickup that’s ready when you are.</p><ArrowRight className="mt-6 transition group-hover:translate-x-1" size={18} /></Link></div></div></section>
  </div>;
}

function CustomerHome({ addToCart }: { addToCart: (item: MenuItem) => void }) {
  const featured = useGetFeaturedMenu({ query: { queryKey: getGetFeaturedMenuQueryKey() } });
  const items = featured.data ?? [];
  const hero = items[0];
  const categoryCards = [
    { label: 'Soups', icon: 'bowl', category: 'soups' },
    { label: 'Salads', icon: 'leaf', category: 'salads' },
    { label: 'Mains', icon: 'plate', category: 'mains' },
    { label: 'Desserts', icon: 'cake', category: 'sweets' },
  ];
  return <div>
    <section className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-8 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:px-10 lg:py-12">
        <div className="animate-rise">
          <span className="inline-flex items-center rounded-full bg-[hsl(var(--secondary))] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.12em] text-[hsl(var(--primary))]">Fresh from our kitchen</span>
          <h1 className="mt-5 max-w-xl font-display text-5xl leading-[1.06] tracking-[-.045em] text-[hsl(var(--foreground))] sm:text-6xl">Taste. Order.<br /><span className="text-[hsl(var(--primary))]">Enjoy.</span></h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-[hsl(var(--muted-foreground))]">Delicious food delivered to your table. Browse today’s menu, choose what sounds good, and we’ll take care of the rest.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/menu" className="flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-5 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))] shadow-warm-sm transition hover:bg-[hsl(var(--accent))]" data-testid="link-hero-menu">Explore menu <ArrowRight size={16} /></Link>
            <Link href="/reserve" className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-3 text-sm font-bold transition hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]" data-testid="link-hero-reserve">Reserve a table</Link>
          </div>
        </div>
        <div className="relative min-h-[280px] overflow-hidden rounded-2xl bg-[hsl(var(--muted))] shadow-warm lg:min-h-[380px]">
          {hero?.imageUrl ? <img src={hero.imageUrl} alt={hero.name} className="absolute inset-0 h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><UtensilsCrossed size={56} className="text-[hsl(var(--primary))]" /></div>}
          <div className="absolute inset-0 bg-gradient-to-t from-[hsl(220_18%_15%/.72)] via-transparent to-transparent" />
          <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between text-white"><div><p className="text-xs font-semibold uppercase tracking-[.12em] text-white/75">Popular today</p><p className="mt-1 font-display text-2xl">{hero?.name ?? 'Something delicious'}</p></div>{hero && <button onClick={() => addToCart(hero)} disabled={!hero.isAvailable} className="rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-bold disabled:opacity-50" data-testid="button-hero-add">Add to order</button>}</div>
        </div>
      </div>
    </section>
    <section className="mx-auto max-w-7xl px-5 py-12 lg:px-10">
      <div className="text-center"><p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Why RestauranGo?</p><h2 className="mt-2 font-display text-3xl tracking-[-.03em] sm:text-4xl">A better way to enjoy your meal</h2></div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[{ icon: UtensilsCrossed, title: 'Fresh food', detail: 'Quality ingredients, generous portions, made to order.' }, { icon: HeartPulse, title: 'Nutrition info', detail: 'Know what is on your plate before you take a bite.' }, { icon: CalendarDays, title: 'Easy booking', detail: 'Find a table that fits your plans in just a few clicks.' }].map(({ icon: Icon, title, detail }) => <div key={title} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 text-center shadow-warm-sm"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Icon size={20} /></span><h3 className="mt-4 font-display text-xl">{title}</h3><p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{detail}</p></div>)}
      </div>
    </section>
    <section className="bg-[hsl(var(--secondary)/.55)] py-12">
      <div className="mx-auto max-w-7xl px-5 lg:px-10"><div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Browse by craving</p><h2 className="mt-2 font-display text-3xl tracking-[-.03em]">Popular categories</h2></div><Link href="/menu" className="hidden text-sm font-bold text-[hsl(var(--primary))] sm:block" data-testid="link-home-all-categories">View all</Link></div><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{categoryCards.map(({ label, category, icon }) => <Link href={`/menu?category=${category}`} key={label} className="group rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 text-center shadow-warm-sm transition hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/.4)]" data-testid={`link-category-${category}`}><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><UtensilsCrossed size={25} /></div><p className="mt-3 text-sm font-bold">{label}</p><span className="mt-1 block text-[11px] text-[hsl(var(--muted-foreground))]">Explore {icon}</span></Link>)}</div></div>
    </section>
    <section className="mx-auto max-w-7xl px-5 py-12 lg:px-10"><div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Made for you</p><h2 className="mt-2 font-display text-3xl tracking-[-.03em]">Popular right now</h2></div><Link href="/menu" className="text-sm font-bold text-[hsl(var(--primary))]" data-testid="link-home-menu">See the menu <ArrowRight className="ml-1 inline" size={14} /></Link></div>{featured.isLoading ? <div className="mt-6 grid gap-4 sm:grid-cols-3"><LoadingBlock /><LoadingBlock /><LoadingBlock /></div> : featured.isError ? <div className="mt-6"><ErrorBlock onRetry={() => featured.refetch()} /></div> : <div className="mt-6 grid gap-4 sm:grid-cols-3">{items.slice(0, 3).map(item => <MenuCard key={item.id} item={item} onAdd={addToCart} />)}</div>}</section>
  </div>;
}

function MenuPage({ addToCart }: { addToCart: (item: MenuItem, customizations?: string) => void }) {
  const [location] = useLocation();
  const [search, setSearch] = useState('');
  const initialCategory = new URLSearchParams(location.split('?')[1] ?? '').get('category') ?? 'all';
  const [category, setCategory] = useState(initialCategory);
  const [dietary, setDietary] = useState('all');
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const params = useMemo(() => ({ search: search || undefined, category: category === 'all' ? undefined : category, dietaryTag: dietary === 'all' ? undefined : dietary }), [search, category, dietary]);
  const menu = useListMenu(params, { query: { queryKey: getListMenuQueryKey(params) } });
  const items = menu.data ?? [];
  return <div className="mx-auto max-w-7xl px-5 py-12 lg:px-10 lg:py-20">
    <div className="flex flex-col justify-between gap-6 border-b border-[hsl(var(--border))] pb-10 md:flex-row md:items-end"><div><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-[hsl(var(--accent))]">From our kitchen</p><h1 className="mt-3 font-display text-6xl tracking-[-.06em] sm:text-7xl">The menu<span className="text-[hsl(var(--accent))]">.</span></h1><p className="mt-4 max-w-lg text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Good ingredients, generous portions, nothing fussy. Build a meal that feels like you.</p></div><div className="font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Updated for the season · {items.length || '—'} plates</div></div>
    <div className="sticky top-[72px] z-30 -mx-5 mt-7 border-y border-[hsl(var(--border)/.7)] bg-[hsl(var(--background)/.94)] px-5 py-4 backdrop-blur-xl lg:mx-0 lg:rounded-2xl lg:border lg:px-4"><div className="flex flex-col gap-3 lg:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search a dish, ingredient, mood…" className="h-11 w-full rounded-full border border-[hsl(var(--input))] bg-[hsl(var(--card))] pl-10 pr-4 text-sm outline-none focus:border-[hsl(var(--accent))]" data-testid="input-menu-search" /></label><div className="flex items-center gap-2 overflow-x-auto">{categories.map(cat => <button key={cat} onClick={() => setCategory(cat)} className={`whitespace-nowrap rounded-full px-4 py-2.5 text-[11px] font-bold capitalize transition ${category === cat ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`} data-testid={`button-category-${cat}`}>{cat}</button>)}</div><label className="relative flex items-center lg:w-44"><SlidersHorizontal className="pointer-events-none absolute left-3 text-[hsl(var(--muted-foreground))]" size={14} /><select value={dietary} onChange={e => setDietary(e.target.value)} className="h-11 w-full appearance-none rounded-full border border-[hsl(var(--input))] bg-[hsl(var(--card))] pl-9 pr-8 text-xs font-semibold outline-none" data-testid="select-dietary"><option value="all">All dietary</option><option value="vegetarian">Vegetarian</option><option value="vegan">Vegan</option><option value="gluten-free">Gluten-free</option></select><ChevronDown className="pointer-events-none absolute right-3" size={14} /></label></div></div>
    <div className="mt-10">{menu.isLoading ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><LoadingBlock /><LoadingBlock /><LoadingBlock /></div> : menu.isError ? <ErrorBlock onRetry={() => menu.refetch()} /> : items.length === 0 ? <EmptyBlock title="Nothing on this plate." detail="Try another search or loosen the filters to see more of the kitchen." /> : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((item, index) => <div key={item.id} className={`animate-rise delay-${Math.min(index % 4 + 1, 4)}`}><MenuCard item={item} onAdd={setSelected} /></div>)}</div>}</div>
    {selected && <Customizer item={selected} onClose={() => setSelected(null)} onConfirm={customizations => { addToCart(selected, customizations); setSelected(null); }} />}
  </div>;
}

function CheckoutPage({ cart, updateCart, clearCart }: { cart: CartLine[]; updateCart: (id: string, delta: number) => void; clearCart: () => void }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup');
  const [address, setAddress] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const createOrder = useCreateOrder();
  const recentOrders = useListOrders(undefined, { query: { enabled: Boolean(user), queryKey: getListOrdersQueryKey() } });
  const total = cart.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const submit = () => {
    if (!user || cart.length === 0 || (orderType === 'delivery' && !address.trim())) return;
    createOrder.mutate({ data: { orderType: orderType === 'pickup' ? OrderInputOrderType.pickup : OrderInputOrderType.delivery, address: orderType === 'delivery' ? address.trim() : undefined, items: cart.map(line => ({ menuItemId: line.item.id, quantity: line.quantity, customizations: line.customizations })) } as never }, { onSuccess: order => { clearCart(); setLocation(`/track/${order.id}`); } });
  };
  if (submitted) return <div className="mx-auto flex min-h-[68vh] max-w-2xl flex-col items-center justify-center px-5 py-20 text-center"><div className="flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><CircleCheck size={42} /></div><p className="mt-7 font-mono-app text-[10px] uppercase tracking-[.2em] text-[hsl(var(--accent))]">Order received</p><h1 className="mt-3 font-display text-6xl tracking-[-.06em]">We’re on it.</h1><p className="mt-4 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Your order is in the kitchen. We’ll keep you posted as it moves from our hands to yours.</p><Link href="/menu" className="mt-8 rounded-full bg-[hsl(var(--primary))] px-6 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))]" data-testid="link-order-more">Order something else</Link></div>;
  if (!user) return <div className="mx-auto max-w-2xl px-5 py-20 text-center"><EmptyBlock title="Sign in before checkout." detail="Your account keeps orders and tracking tied to you." /><Link href="/login" className="mt-6 inline-flex rounded-full bg-[hsl(var(--primary))] px-6 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))]" data-testid="link-checkout-login">Sign in to continue</Link></div>;
  return <div className="mx-auto max-w-7xl px-5 py-12 lg:px-10 lg:py-20"><div className="max-w-xl"><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-[hsl(var(--accent))]">Almost there</p><h1 className="mt-3 font-display text-6xl tracking-[-.06em]">Your order<span className="text-[hsl(var(--accent))]">.</span></h1></div>{cart.length === 0 ? <div className="mt-12 max-w-xl"><EmptyBlock title="Your bag is waiting." detail="Find a dish that sounds like tonight and it’ll be here." /><Link href="/menu" className="mx-auto mt-6 flex w-fit items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-6 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))]" data-testid="link-checkout-menu">Browse the menu <ArrowRight size={16} /></Link>{recentOrders.data?.[0] && <p className="mt-7 text-center text-xs text-[hsl(var(--muted-foreground))]" data-testid="text-recent-order">Last time: {statusLabel(recentOrders.data[0].status)} order · {money(recentOrders.data[0].totalAmount)}</p>}</div> : <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_390px]"><div className="space-y-4"><div className="rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-7"><div className="flex items-center justify-between"><h2 className="font-display text-2xl">Choose your handoff</h2><Package className="text-[hsl(var(--accent))]" size={20} /></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><button onClick={() => setOrderType('pickup')} className={`rounded-2xl border p-4 text-left transition ${orderType === 'pickup' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--secondary)/.55)]' : 'border-[hsl(var(--border))]'}`} data-testid="button-order-pickup"><Store size={18} /><p className="mt-3 text-sm font-bold">Pickup</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Ready in about 25 minutes</p></button><button onClick={() => setOrderType('delivery')} className={`rounded-2xl border p-4 text-left transition ${orderType === 'delivery' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--secondary)/.55)]' : 'border-[hsl(var(--border))]'}`} data-testid="button-order-delivery"><Bike size={18} /><p className="mt-3 text-sm font-bold">Delivery</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">To your door in about 45 minutes</p></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><p className="text-xs font-bold uppercase tracking-[.1em] sm:col-span-2">Ordering as <span className="font-normal normal-case tracking-normal text-[hsl(var(--muted-foreground))]">{user.name} · {user.email}</span></p>{orderType === 'delivery' && <label className="text-xs font-bold uppercase tracking-[.1em] sm:col-span-2">Delivery address<input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, number, apartment…" className="mt-2 h-11 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm font-normal normal-case tracking-normal outline-none focus:border-[hsl(var(--accent))]" data-testid="input-delivery-address" /></label>}</div></div><div className="rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-7"><div className="flex items-center justify-between"><h2 className="font-display text-2xl">On your table</h2><span className="font-mono-app text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">{cart.reduce((s, l) => s + l.quantity, 0)} items</span></div><div className="mt-5 divide-y divide-[hsl(var(--border))]">{cart.map(line => <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0" key={`${line.item.id}-${line.customizations}`}><div className="min-w-0"><p className="font-semibold">{line.item.name}</p>{line.customizations && <p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">{line.customizations}</p>}<p className="mt-1 font-mono-app text-xs">{money(line.item.price * line.quantity)}</p></div><div className="flex items-center gap-2 rounded-full bg-[hsl(var(--muted))] p-1"><button onClick={() => updateCart(line.item.id, -1)} className="flex h-7 w-7 items-center justify-center rounded-full" data-testid={`button-decrease-${line.item.id}`}><Minus size={13} /></button><span className="w-4 text-center text-xs font-bold">{line.quantity}</span><button onClick={() => updateCart(line.item.id, 1)} className="flex h-7 w-7 items-center justify-center rounded-full" data-testid={`button-increase-${line.item.id}`}><Plus size={13} /></button></div></div>)}</div></div></div><aside className="h-fit rounded-[28px] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] shadow-warm lg:sticky lg:top-28"><p className="font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--sidebar-primary))]">Kitchen ticket</p><div className="mt-7 flex items-end justify-between border-b border-[hsl(var(--primary-foreground)/.18)] pb-5"><span className="text-sm text-[hsl(var(--primary-foreground)/.65)]">Subtotal</span><span className="font-mono-app text-lg">{money(total)}</span></div><div className="flex items-center justify-between py-4 text-sm"><span className="text-[hsl(var(--primary-foreground)/.65)]">{orderType === 'delivery' ? 'Delivery' : 'Pickup'}</span><span>{orderType === 'delivery' ? 'Included' : 'Free'}</span></div><div className="flex items-end justify-between border-t border-[hsl(var(--primary-foreground)/.18)] pt-5"><span className="font-display text-2xl">Total</span><span className="font-mono-app text-2xl text-[hsl(var(--sidebar-primary))]">{money(total)}</span></div><button onClick={submit} disabled={createOrder.isPending || (orderType === 'delivery' && !address.trim())} className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-[hsl(var(--sidebar-primary))] py-3.5 text-sm font-bold text-[hsl(var(--sidebar-primary-foreground))] disabled:cursor-not-allowed disabled:opacity-45" data-testid="button-place-order">{createOrder.isPending ? 'Sending to kitchen…' : 'Place order'} <ArrowRight size={16} /></button>{createOrder.isError && <p className="mt-3 text-center text-xs text-[hsl(var(--sidebar-primary))]">Couldn’t place that order. Please try again.</p>}</aside></div>}</div>;
}

function TrackPage() {
  const { id } = useParams<{ id: string }>();
  const order = useGetOrder(id ?? '', { query: { enabled: Boolean(id), queryKey: getGetOrderQueryKey(id ?? ''), refetchInterval: 15000 } });
  const current = order.data;
  const stages = ['placed', 'confirmed', 'preparing', current?.orderType === 'delivery' ? 'out_for_delivery' : 'ready', 'completed'];
  const activeIndex = current ? Math.max(0, stages.indexOf(current.status)) : 0;
  return <div className="mx-auto max-w-4xl px-5 py-12 lg:px-10 lg:py-20"><div className="flex items-end justify-between gap-5"><div><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-[hsl(var(--accent))]">Live from the kitchen</p><h1 className="mt-3 font-display text-6xl tracking-[-.06em]">Order <span className="text-[hsl(var(--accent))]">#{id?.slice(-5).toUpperCase()}</span></h1></div><button onClick={() => order.refetch()} className="flex items-center gap-2 rounded-full border border-[hsl(var(--border))] px-4 py-2 text-xs font-bold" data-testid="button-refresh-order"><RefreshCw size={14} className={order.isFetching ? 'animate-spin' : ''} /> Refresh</button></div>{order.isLoading ? <div className="mt-10"><LoadingBlock label="Finding your ticket" /></div> : order.isError || !current ? <div className="mt-10"><ErrorBlock onRetry={() => order.refetch()} /></div> : <div className="mt-10 grid gap-7 lg:grid-cols-[1fr_310px]"><section className="rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:p-8"><div className="flex items-center justify-between"><div><p className="font-mono-app text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Current status</p><h2 className="mt-2 font-display text-4xl capitalize">{statusLabel(current.status)}</h2></div><div className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">{current.status === 'completed' ? <Check /> : <Clock3 />}</div></div><div className="mt-10 space-y-0">{stages.map((stage, index) => <div className="relative flex gap-4" key={stage}><div className="flex w-7 flex-col items-center">{index < stages.length - 1 && <span className={`absolute top-7 h-full w-px ${index < activeIndex ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--border))]'}`} />}{index <= activeIndex ? <CircleCheck className="relative z-10 bg-[hsl(var(--card))] text-[hsl(var(--accent))]" size={22} /> : <CircleDot className="relative z-10 bg-[hsl(var(--card))] text-[hsl(var(--border))]" size={22} />}</div><div className="pb-8"><p className={`font-semibold capitalize ${index <= activeIndex ? '' : 'text-[hsl(var(--muted-foreground))]'}`}>{statusLabel(stage)}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{index === activeIndex ? 'We’ll keep this page up to date.' : index < activeIndex ? 'Done and dusted.' : 'Coming up next.'}</p></div></div>)}</div></section><aside className="h-fit rounded-[28px] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))]"><p className="font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--sidebar-primary))]">Your order</p><div className="mt-6 space-y-4">{current.items.map(item => <div key={`${item.menuItemId}-${item.name}`} className="flex justify-between gap-3 text-sm"><span><span className="mr-2 text-[hsl(var(--sidebar-primary))]">{item.quantity}×</span>{item.name}</span><span className="font-mono-app text-xs">{money(item.itemPrice * item.quantity)}</span></div>)}</div><div className="mt-6 flex items-end justify-between border-t border-[hsl(var(--primary-foreground)/.18)] pt-5"><span className="text-[hsl(var(--primary-foreground)/.65)]">Total</span><span className="font-mono-app text-xl text-[hsl(var(--sidebar-primary))]">{money(current.totalAmount)}</span></div><div className="mt-6 flex gap-2 text-xs text-[hsl(var(--primary-foreground)/.65)]"><MapPin size={15} />{current.orderType === 'delivery' ? current.address : 'Pickup at RestauranGo'}</div></aside></div>}</div>;
}

function ReservePage() {
  const { user } = useAuth();
  const [date, setDate] = useState(today);
  const [partySize, setPartySize] = useState(2);
  const [time, setTime] = useState('');
  const [confirmed, setConfirmed] = useState<Reservation | null>(null);
  const availability = useGetReservationAvailability({ date, partySize }, { query: { queryKey: getGetReservationAvailabilityQueryKey({ date, partySize }) } });
  const reservations = useListReservations({ query: { enabled: Boolean(user), queryKey: getListReservationsQueryKey() } });
  const create = useCreateReservation();
  const submit = () => { if (!user || !time) return; create.mutate({ data: { date, time, partySize } as never }, { onSuccess: reservation => { setConfirmed(reservation); reservations.refetch(); } }); };
  if (!user) return <div className="mx-auto max-w-2xl px-5 py-20 text-center"><EmptyBlock title="Sign in to reserve a table." detail="Your account keeps reservations attached to you." /><Link href="/login" className="mt-6 inline-flex rounded-full bg-[hsl(var(--primary))] px-6 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))]" data-testid="link-reservation-login">Sign in to continue</Link></div>;
  return <div className="mx-auto max-w-7xl px-5 py-12 lg:px-10 lg:py-20"><div className="max-w-2xl"><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-[hsl(var(--accent))]">Pull up a chair</p><h1 className="mt-3 font-display text-6xl leading-[.92] tracking-[-.06em] sm:text-7xl">A table with<br /><span className="serif-italic text-[hsl(var(--accent))]">your name on it.</span></h1><p className="mt-5 max-w-lg text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">Tell us when you’re coming. We’ll have the room, the candles, and something good to eat ready for you.</p></div><div className="mt-12 grid gap-8 lg:grid-cols-[1fr_380px]"><section className="rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:p-8"><div className="grid gap-5 sm:grid-cols-2"><label className="text-xs font-bold uppercase tracking-[.1em]">Date<input type="date" min={today} value={date} onChange={e => { setDate(e.target.value); setTime(''); }} className="mt-2 h-12 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm font-normal normal-case tracking-normal" data-testid="input-reservation-date" /></label><label className="text-xs font-bold uppercase tracking-[.1em]">Party size<select value={partySize} onChange={e => { setPartySize(Number(e.target.value)); setTime(''); }} className="mt-2 h-12 w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm font-normal normal-case tracking-normal" data-testid="select-party-size">{[1,2,3,4,5,6,7,8,9,10,11,12].map(size => <option key={size} value={size}>{size} {size === 1 ? 'guest' : 'guests'}</option>)}</select></label><p className="text-xs font-bold uppercase tracking-[.1em] sm:col-span-2">Reservation under <span className="font-normal normal-case tracking-normal text-[hsl(var(--muted-foreground))]">{user.name} · {user.email}</span></p></div><div className="mt-8 border-t border-[hsl(var(--border))] pt-7"><div className="flex items-center justify-between"><div><h2 className="font-display text-2xl">Find your time</h2><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Available tables for {partySize} {partySize === 1 ? 'guest' : 'guests'}</p></div><Clock3 className="text-[hsl(var(--accent))]" size={20} /></div>{availability.isLoading ? <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5"><div className="h-11 animate-pulse rounded-xl bg-[hsl(var(--muted))]" /><div className="h-11 animate-pulse rounded-xl bg-[hsl(var(--muted))]" /><div className="h-11 animate-pulse rounded-xl bg-[hsl(var(--muted))]" /></div> : availability.isError ? <div className="mt-5"><ErrorBlock onRetry={() => availability.refetch()} /></div> : availability.data?.slots?.length ? <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5">{availability.data.slots.map(slot => <button key={slot} onClick={() => setTime(slot)} className={`rounded-xl border py-3 text-xs font-bold transition ${time === slot ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--border))] hover:border-[hsl(var(--foreground))]'}`} data-testid={`button-slot-${slot.replace(':','')}`}>{slot}</button>)}</div> : <p className="mt-5 rounded-2xl bg-[hsl(var(--muted))] p-4 text-sm text-[hsl(var(--muted-foreground))]">No tables at this size yet. Try another day.</p>}</div><button onClick={submit} disabled={create.isPending || !time} className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-[hsl(var(--primary))] py-3.5 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-45" data-testid="button-confirm-reservation">{create.isPending ? 'Saving your table…' : 'Reserve this table'} <ArrowRight size={16} /></button>{create.isError && <p className="mt-3 text-center text-xs text-[hsl(var(--accent))]">That table slipped away. Please choose another time.</p>}</section><aside className="space-y-5">{confirmed && <div className="animate-rise rounded-[26px] bg-[hsl(var(--secondary))] p-6" data-testid="status-reservation-confirmed"><CircleCheck className="text-[hsl(var(--primary))]" /><p className="mt-4 font-display text-2xl">You’re on the list.</p><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{confirmed.date} · {confirmed.time} · table for {confirmed.partySize}</p></div>}<div className="rounded-[26px] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))]"><p className="font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--sidebar-primary))]">Your recent tables</p>{reservations.isLoading ? <div className="mt-6 space-y-3"><div className="h-5 animate-pulse rounded bg-white/10" /><div className="h-5 animate-pulse rounded bg-white/10" /></div> : reservations.data?.length ? <div className="mt-5 divide-y divide-[hsl(var(--primary-foreground)/.16)]">{reservations.data.slice(0, 4).map(res => <div key={res.id} className="py-4 first:pt-0 last:pb-0"><div className="flex justify-between gap-3"><span className="text-sm font-semibold">{res.date}</span><span className="font-mono-app text-xs text-[hsl(var(--sidebar-primary))]">{res.time}</span></div><p className="mt-1 text-xs capitalize text-[hsl(var(--primary-foreground)/.6)]">{res.partySize} guests · {res.status}</p></div>)}</div> : <p className="mt-5 text-sm text-[hsl(var(--primary-foreground)/.62)]">Your next good evening starts here.</p>}</div></aside></div></div>;
}

function LoginPage() {
  const [, setLocation] = useLocation();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice('');
    setPending(true);
    try {
      await authRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) });
      await refresh();
      setLocation('/profile');
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setPending(false);
    }
  };
  return <div className="mx-auto flex min-h-[72vh] max-w-5xl items-center justify-center px-5 py-12 lg:px-10">
    <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-warm lg:grid-cols-[.9fr_1.1fr]">
      <div className="hidden bg-[hsl(var(--sidebar))] p-10 text-[hsl(var(--sidebar-foreground))] lg:block"><BrandMark /><p className="mt-16 text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--sidebar-primary))]">Welcome back</p><h1 className="mt-3 font-display text-4xl leading-tight">Good food is<br />closer than you think.</h1><p className="mt-5 max-w-xs text-sm leading-relaxed text-[hsl(var(--sidebar-foreground)/.68)]">Save your favorite orders, keep track of your tables, and make your next visit easy.</p></div>
      <form onSubmit={submit} className="p-6 sm:p-10" data-testid="form-login">
        <div className="flex items-center gap-2 lg:hidden"><BrandMark /><span className="font-display text-lg">RestauranGo</span></div>
        <p className="mt-8 text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Your account</p><h1 className="mt-2 font-display text-3xl">Welcome back</h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Sign in to see your orders and reservations.</p>
         <label className="mt-7 block text-sm font-semibold">Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="mt-2 h-12 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--primary))]" data-testid="input-login-email" /></label>
         <label className="mt-4 block text-sm font-semibold">Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" className="mt-2 h-12 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--primary))]" data-testid="input-login-password" /></label>
         <button type="submit" disabled={pending} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] text-sm font-bold text-[hsl(var(--primary-foreground))] transition hover:bg-[hsl(var(--accent))] disabled:opacity-50" data-testid="button-login"><LogIn size={17} /> {pending ? 'Signing in…' : 'Log in'}</button>
         {notice && <p className="mt-4 rounded-lg bg-[hsl(var(--secondary))] p-3 text-xs leading-relaxed text-[hsl(var(--secondary-foreground))]" data-testid="status-login-error">{notice}</p>}
        <p className="mt-7 text-center text-sm text-[hsl(var(--muted-foreground))]">Don't have an account? <Link href="/register" className="font-bold text-[hsl(var(--primary))]" data-testid="link-register">Register</Link></p>
      </form>
    </div>
  </div>;
}

function RegisterPage() {
  const [, setLocation] = useLocation();
  const { refresh } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) { setNotice('Passwords do not match.'); return; }
    setNotice('');
    setPending(true);
    try {
      await authRequest('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, password }) });
      await refresh();
      setLocation('/profile');
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setPending(false);
    }
  };
  return <div className="mx-auto flex min-h-[72vh] max-w-5xl items-center justify-center px-5 py-12 lg:px-10">
    <form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-warm sm:p-10" data-testid="form-register">
      <div className="flex items-center gap-2"><BrandMark /><span className="font-display text-lg">RestauranGo</span></div><p className="mt-8 text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Join RestauranGo</p><h1 className="mt-2 font-display text-3xl">Create your account</h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Keep your details ready for the next delicious decision.</p>
       <div className="mt-7 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold sm:col-span-2">Full name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required placeholder="Your name" className="mt-2 h-12 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--primary))]" data-testid="input-register-name" /></label><label className="text-sm font-semibold">Email<input value={email} onChange={e => setEmail(e.target.value)} required type="email" autoComplete="email" placeholder="you@example.com" className="mt-2 h-12 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--primary))]" data-testid="input-register-email" /></label><label className="text-sm font-semibold">Phone<input value={phone} onChange={e => setPhone(e.target.value)} type="tel" autoComplete="tel" placeholder="+91 98765 43210" className="mt-2 h-12 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--primary))]" data-testid="input-register-phone" /></label><label className="text-sm font-semibold">Password<input value={password} onChange={e => setPassword(e.target.value)} required type="password" autoComplete="new-password" placeholder="Create a password" className="mt-2 h-12 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--primary))]" data-testid="input-register-password" /></label><label className="text-sm font-semibold">Confirm password<input value={confirm} onChange={e => setConfirm(e.target.value)} required type="password" autoComplete="new-password" placeholder="Repeat password" className="mt-2 h-12 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--primary))]" data-testid="input-register-confirm" /></label></div>
       <button type="submit" disabled={pending} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] text-sm font-bold text-[hsl(var(--primary-foreground))] transition hover:bg-[hsl(var(--accent))] disabled:opacity-50" data-testid="button-register"><UserPlus size={17} /> {pending ? 'Creating account…' : 'Create account'}</button>{notice && <p className="mt-4 rounded-lg bg-[hsl(var(--secondary))] p-3 text-xs leading-relaxed text-[hsl(var(--secondary-foreground))]" data-testid="status-register-error">{notice}</p>}<p className="mt-7 text-center text-sm text-[hsl(var(--muted-foreground))]">Already have an account? <Link href="/login" className="font-bold text-[hsl(var(--primary))]" data-testid="link-login">Log in</Link></p>
    </form>
  </div>;
}

function ProfilePage() {
  const { user, loading, logout } = useAuth();
  const orders = useListOrders(undefined, { query: { enabled: Boolean(user), queryKey: getListOrdersQueryKey() } });
  const reservations = useListReservations({ query: { enabled: Boolean(user), queryKey: getListReservationsQueryKey() } });
  if (loading) return <div className="mx-auto max-w-2xl px-5 py-20"><LoadingBlock label="Checking your account" /></div>;
  if (!user) return <div className="mx-auto max-w-2xl px-5 py-20 text-center"><EmptyBlock title="Sign in to see your account." detail="Orders and reservations belong to your RestauranGo account." /><Link href="/login" className="mt-6 inline-flex rounded-full bg-[hsl(var(--primary))] px-6 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))]" data-testid="link-profile-login">Sign in</Link></div>;
  return <div className="mx-auto max-w-6xl px-5 py-10 lg:px-10 lg:py-14">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Your RestauranGo</p><h1 className="mt-2 font-display text-4xl tracking-[-.03em]">My profile</h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Orders and reservations in one place.</p></div><button onClick={() => void logout()} className="w-fit rounded-full bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--secondary-foreground))]" data-testid="button-profile-logout">Log out</button></div>
    <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
      <section className="h-fit rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-warm-sm"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-lg font-bold text-[hsl(var(--primary))]">{user.name.slice(0, 1).toUpperCase()}</div><div className="mt-5"><p className="font-display text-xl" data-testid="text-profile-name">{user.name}</p><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]" data-testid="text-profile-email">{user.email}</p>{user.phone && <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]" data-testid="text-profile-phone">{user.phone}</p>}<p className="mt-3 text-xs font-semibold uppercase tracking-[.12em] text-[hsl(var(--primary))]">{user.role}</p></div></section>
      <div className="space-y-6"><section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-warm-sm"><div className="flex items-center justify-between"><h2 className="font-display text-2xl">My orders</h2><Link href="/menu" className="text-xs font-bold text-[hsl(var(--primary))]" data-testid="link-profile-order">Order again</Link></div>{orders.isLoading ? <div className="mt-5"><LoadingBlock label="Finding your orders" /></div> : orders.isError ? <div className="mt-5"><ErrorBlock onRetry={() => orders.refetch()} /></div> : orders.data?.length ? <div className="mt-4 divide-y divide-[hsl(var(--border))]">{orders.data.slice(0, 6).map(order => <div key={order.id} className="flex flex-col gap-3 py-4 first:pt-1 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-profile-order-${order.id}`}><div><p className="text-sm font-bold">#{order.id.slice(-5).toUpperCase()} <span className="ml-2 rounded-full bg-[hsl(var(--secondary))] px-2 py-1 text-[10px] capitalize text-[hsl(var(--secondary-foreground))]">{statusLabel(order.status)}</span></p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{order.items.reduce((sum, item) => sum + item.quantity, 0)} items · {new Date(order.createdAt).toLocaleDateString('en-IN')}</p></div><div className="flex items-center justify-between gap-5"><span className="font-semibold">{money(order.totalAmount)}</span><Link href={`/track/${order.id}`} className="rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-bold text-[hsl(var(--primary))]" data-testid={`link-track-order-${order.id}`}>Track</Link></div></div>)}</div> : <EmptyBlock title="No orders yet." detail="Your next favorite meal is waiting in the menu." />}</section>
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-warm-sm"><h2 className="font-display text-2xl">My reservations</h2>{reservations.isLoading ? <div className="mt-5"><LoadingBlock label="Finding your tables" /></div> : reservations.data?.length ? <div className="mt-4 divide-y divide-[hsl(var(--border))]">{reservations.data.slice(0, 5).map(res => <div key={res.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-1" data-testid={`row-profile-reservation-${res.id}`}><div><p className="text-sm font-bold">{res.date} · {res.time}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{res.partySize} {res.partySize === 1 ? 'guest' : 'guests'} · {res.tableLabel || 'Table pending'}</p></div><span className="rounded-full bg-[hsl(var(--secondary))] px-2.5 py-1 text-[10px] font-bold capitalize text-[hsl(var(--secondary-foreground))]">{res.status}</span></div>)}</div> : <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">No reservations yet. <Link href="/reserve" className="font-bold text-[hsl(var(--primary))]" data-testid="link-profile-reserve">Reserve a table</Link></p>}</section></div>
    </div>
  </div>;
}

function AdminPage() {
  const summary = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const orders = useListOrders(undefined, { query: { queryKey: getListOrdersQueryKey() } });
  const reservations = useListReservations({ query: { queryKey: getListReservationsQueryKey() } });
  const updateStatus = useUpdateOrderStatus();
  const [activeTab, setActiveTab] = useState<'orders' | 'reservations'>('orders');
  const changeStatus = (order: Order, status: string) => updateStatus.mutate({ id: order.id, data: { status: status as typeof OrderStatusUpdateStatus[keyof typeof OrderStatusUpdateStatus] } }, { onSuccess: () => { orders.refetch(); summary.refetch(); } });
  const dashboard = summary.data;
  return <div className="mx-auto max-w-7xl px-5 py-10 lg:px-10 lg:py-16"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="font-mono-app text-[10px] uppercase tracking-[.2em] text-[hsl(var(--accent))]">Back of house</p><h1 className="mt-3 font-display text-6xl tracking-[-.06em]">Good morning<span className="text-[hsl(var(--accent))]">.</span></h1><p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">The room at a glance. Stay close to what’s moving.</p></div><button onClick={() => { summary.refetch(); orders.refetch(); reservations.refetch(); }} className="flex w-fit items-center gap-2 rounded-full border border-[hsl(var(--border))] px-4 py-2 text-xs font-bold" data-testid="button-refresh-admin"><RefreshCw size={14} /> Refresh board</button></div><div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[{label:'Today’s revenue',value:dashboard ? money(dashboard.todayRevenue) : '—',icon:DollarSign},{label:'Open orders',value:dashboard?.openOrders ?? '—',icon:ClipboardList},{label:'Tables today',value:dashboard?.reservationsToday ?? '—',icon:UsersRound},{label:'Top plate',value:dashboard?.popularItems?.[0]?.name ?? '—',icon:TrendingUp}].map(({label,value,icon:Icon}, i) => <div className={`animate-rise delay-${i + 1} rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5`} key={label} data-testid={`metric-${label.toLowerCase().replaceAll(' ','-').replace('’','')}`}><div className="flex items-center justify-between"><span className="text-xs text-[hsl(var(--muted-foreground))]">{label}</span><Icon size={17} className="text-[hsl(var(--accent))]" /></div><p className="mt-6 truncate font-display text-3xl">{value}</p></div>)}</div><div className="mt-10 grid gap-8 lg:grid-cols-[1fr_310px]"><section><div className="flex gap-6 border-b border-[hsl(var(--border))]"><button onClick={() => setActiveTab('orders')} className={`border-b-2 pb-3 text-sm font-bold ${activeTab === 'orders' ? 'border-[hsl(var(--accent))]' : 'border-transparent text-[hsl(var(--muted-foreground))]'}`} data-testid="button-admin-orders">Live orders</button><button onClick={() => setActiveTab('reservations')} className={`border-b-2 pb-3 text-sm font-bold ${activeTab === 'reservations' ? 'border-[hsl(var(--accent))]' : 'border-transparent text-[hsl(var(--muted-foreground))]'}`} data-testid="button-admin-reservations">Reservations</button></div>{activeTab === 'orders' ? <div className="mt-4 space-y-3">{orders.isLoading ? <LoadingBlock label="Loading tickets" /> : orders.isError ? <ErrorBlock onRetry={() => orders.refetch()} /> : orders.data?.length ? orders.data.map(order => <div key={order.id} className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:p-5" data-testid={`row-order-${order.id}`}><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono-app text-xs font-bold">#{order.id.slice(-5).toUpperCase()}</span><span className="rounded-full bg-[hsl(var(--secondary))] px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em]">{statusLabel(order.status)}</span></div><p className="mt-2 text-sm font-semibold">{order.customerName} <span className="font-normal text-[hsl(var(--muted-foreground))]">· {order.items.reduce((sum, item) => sum + item.quantity, 0)} items · {order.orderType}</span></p></div><div className="flex items-center gap-3"><span className="font-mono-app text-sm">{money(order.totalAmount)}</span><select value={order.status} onChange={e => changeStatus(order, e.target.value)} className="h-9 rounded-full border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 text-xs font-semibold" data-testid={`select-status-${order.id}`}>{Object.values(OrderStatusUpdateStatus).map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></div></div></div>) : <EmptyBlock title="No open tickets." detail="A peaceful kitchen is a good kitchen." />}</div> : <div className="mt-4 space-y-3">{reservations.isLoading ? <LoadingBlock label="Loading tables" /> : reservations.isError ? <ErrorBlock onRetry={() => reservations.refetch()} /> : reservations.data?.length ? reservations.data.map(res => <div key={res.id} className="flex flex-col gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-reservation-${res.id}`}><div><p className="font-semibold">{res.guestName} <span className="font-normal text-[hsl(var(--muted-foreground))]">· {res.partySize} guests</span></p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{res.date} at {res.time} · {res.tableLabel || 'Table pending'}</p></div><span className="w-fit rounded-full bg-[hsl(var(--secondary))] px-3 py-1.5 text-[10px] font-bold capitalize">{res.status}</span></div>) : <EmptyBlock title="No reservations yet." detail="The first table of the day is still yours." />}</div>}</section><aside className="space-y-5"><div className="rounded-[25px] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))]"><div className="flex items-center justify-between"><p className="font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--sidebar-primary))]">Menu pulse</p><TrendingUp size={17} className="text-[hsl(var(--sidebar-primary))]" /></div>{dashboard?.popularItems?.length ? <div className="mt-6 space-y-4">{dashboard.popularItems.slice(0, 5).map((item, index) => <div key={item.name}><div className="flex justify-between text-xs"><span>{index + 1}. {item.name}</span><span className="font-mono-app text-[hsl(var(--sidebar-primary))]">{item.orders}</span></div><div className="mt-2 h-1.5 rounded-full bg-white/10"><div className="h-1.5 rounded-full bg-[hsl(var(--sidebar-primary))]" style={{ width: `${Math.min(100, (item.orders / Math.max(1, dashboard.popularItems[0].orders)) * 100)}%` }} /></div></div>)}</div> : <p className="mt-5 text-sm text-white/60">No plate data yet.</p>}</div><div className="rounded-[25px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"><p className="font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">Status mix</p>{dashboard?.statusBreakdown?.length ? <div className="mt-5 space-y-3">{dashboard.statusBreakdown.map(item => <div key={item.status} className="flex items-center justify-between text-xs"><span className="capitalize text-[hsl(var(--muted-foreground))]">{statusLabel(item.status)}</span><span className="font-mono-app font-bold">{item.count}</span></div>)}</div> : <p className="mt-5 text-sm text-[hsl(var(--muted-foreground))]">Loading the day’s shape.</p>}</div></aside></div></div>;
}

function Router({ cart, addToCart, updateCart, clearCart }: { cart: CartLine[]; addToCart: (item: MenuItem, customizations?: string) => void; updateCart: (id: string, delta: number) => void; clearCart: () => void }) {
  return <RoutedErrorBoundary><Switch><Route path="/"><CustomerHome addToCart={item => addToCart(item)} /></Route><Route path="/login"><LoginPage /></Route><Route path="/register"><RegisterPage /></Route><Route path="/menu"><MenuPage addToCart={addToCart} /></Route><Route path="/checkout"><CheckoutPage cart={cart} updateCart={updateCart} clearCart={clearCart} /></Route><Route path="/track/:id"><TrackPage /></Route><Route path="/reserve"><ReservePage /></Route><Route path="/profile"><ProfilePage /></Route><Route path="/admin"><AdminPage /></Route><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      const stored = localStorage.getItem('restaurango-cart');
      return stored ? JSON.parse(stored) as CartLine[] : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem('restaurango-cart', JSON.stringify(cart));
  }, [cart]);
  const addToCart = (item: MenuItem, customizations?: string) => {
    setCart(current => {
      const index = current.findIndex(line => line.item.id === item.id && line.customizations === customizations);
      if (index < 0) return [...current, { item, quantity: 1, customizations }];
      return current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: line.quantity + 1 } : line);
    });
  };
  const updateCart = (id: string, delta: number) => {
    setCart(current => current.flatMap(line => line.item.id === id ? (line.quantity + delta > 0 ? [{ ...line, quantity: line.quantity + delta }] : []) : [line]));
  };
  const clearCart = () => setCart([]);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthProvider>
            <AppShell cartCount={cart.reduce((sum, line) => sum + line.quantity, 0)}>
              <Router cart={cart} addToCart={addToCart} updateCart={updateCart} clearCart={clearCart} />
            </AppShell>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
