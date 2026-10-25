import { ChartNoAxesCombined, ClipboardList, LayoutDashboard, Package, Settings, ShoppingCart, Tags, Truck, UserCog, Users, Wallet, Warehouse, type LucideIcon } from 'lucide-react';
import type { UserRole } from './profile';

export type NavigationItem = {
    href: string;
    label: string;
    icon: LucideIcon;
    roles: readonly UserRole[];
};

export type NavigationSection = {
    label: string;
    items: readonly NavigationItem[];
};

const operationalRoles = ['admin', 'staff', 'manager'] as const;
const managementRoles = ['admin', 'manager'] as const;
const adminRoles = ['admin'] as const;

export const navigation: readonly NavigationSection[] = [
    { label: 'MAIN', items: [{ href: '/dashboard', label: 'Beranda', icon: LayoutDashboard, roles: operationalRoles }] },
    {
        label: 'MASTER DATA',
        items: [
            { href: '/products', label: 'Produk', icon: Package, roles: operationalRoles },
            { href: '/categories', label: 'Kategori', icon: Tags, roles: operationalRoles },
            { href: '/suppliers', label: 'Supplier', icon: Truck, roles: operationalRoles },
            { href: '/customers', label: 'Pelanggan', icon: Users, roles: operationalRoles },
        ],
    },
    {
        label: 'OPERASIONAL',
        items: [
            { href: '/inventory', label: 'Inventori', icon: Warehouse, roles: operationalRoles },
            { href: '/sales', label: 'Penjualan', icon: ShoppingCart, roles: operationalRoles },
            { href: '/purchase-orders', label: 'Purchase Order', icon: ClipboardList, roles: operationalRoles },
        ],
    },
    { label: 'KEUANGAN', items: [{ href: '/finance', label: 'Keuangan', icon: Wallet, roles: managementRoles }] },
    { label: 'ANALISIS', items: [{ href: '/reports', label: 'Laporan', icon: ChartNoAxesCombined, roles: managementRoles }] },
    {
        label: 'SISTEM',
        items: [
            { href: '/users', label: 'Pengguna', icon: UserCog, roles: adminRoles },
            { href: '/settings', label: 'Pengaturan', icon: Settings, roles: operationalRoles },
        ],
    },
];

export function getNavigationForRole(role: UserRole): NavigationSection[] {
    return navigation.flatMap((section) => {
        const items = section.items.filter((item) => item.roles.includes(role));

        return items.length > 0 ? [{ ...section, items }] : [];
    });
}

export function canAccessPath(role: UserRole, pathname: string): boolean {
    return navigation.some((section) =>
        section.items.some((item) => item.roles.includes(role) && (pathname === item.href || pathname.startsWith(`${item.href}/`))),
    );
}
