'use client';

import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { BrandMark } from './brand-mark';
import type { UserRole } from '../lib/auth/profile';
import { LogoutButton } from './logout-button';

const pageTitles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/products': 'Monitoring Produk',
    '/categories': 'Kategori',
    '/suppliers': 'Supplier',
    '/customers': 'Pelanggan',
    '/inventory': 'Inventori',
    '/sales': 'Penjualan',
    '/purchase-orders': 'Purchase Order',
    '/finance': 'Keuangan',
    '/reports': 'Laporan',
    '/users': 'Pengguna',
    '/settings': 'Pengaturan',
};

type AdminHeaderProps = {
    userName: string;
    role: UserRole;
    isMenuOpen: boolean;
    onMenuOpen: () => void;
};

export function AdminHeader({ userName, role, isMenuOpen, onMenuOpen }: AdminHeaderProps) {
    const pathname = usePathname();
    const title = pageTitles[pathname] ?? (pathname.startsWith('/products/') ? 'Monitoring Produk' : 'Dashboard');

    return (
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 sm:px-8">
            <div className="flex items-center gap-3 lg:hidden">
                <button
                    type="button"
                    onClick={onMenuOpen}
                    className="grid h-10 w-10 place-items-center rounded-xl text-[#0b2254] hover:bg-slate-100"
                    aria-label="Buka navigasi"
                    aria-controls="admin-navigation"
                    aria-expanded={isMenuOpen}
                >
                    <Menu aria-hidden="true" className="h-6 w-6" />
                </button>
                <BrandMark compact />
            </div>
            <div className="hidden text-sm text-slate-500 lg:block">
                Admin Panel <span className="mx-2 text-slate-300">/</span>{' '}
                <span className="font-semibold text-[#0b2254]">{title}</span>
            </div>
            <div className="flex items-center gap-3">
                <div className="hidden text-right sm:block">
                    <p className="text-sm font-bold text-[#0b2254]">{userName}</p>
                    <p className="text-xs capitalize text-slate-500">{role}</p>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-blue-100 font-bold text-blue-700">{userName.charAt(0).toUpperCase()}</span>
                <LogoutButton />
            </div>
        </header>
    );
}
