'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import type { UserRole } from '../lib/auth/profile';
import { getNavigationForRole } from '../lib/auth/permissions';
import { BrandMark } from './brand-mark';

type AdminSidebarProps = {
    role: UserRole;
    isOpen: boolean;
    onClose: () => void;
};

export function AdminSidebar({ role, isOpen, onClose }: AdminSidebarProps) {
    const pathname = usePathname();
    const navigation = getNavigationForRole(role);

    return (
        <aside
            id="admin-navigation"
            className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col bg-[#071b47] px-4 py-6 text-blue-100 shadow-2xl transition-transform duration-200 ease-out lg:static lg:z-auto lg:h-auto lg:min-h-screen lg:translate-x-0 lg:shadow-none ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
            aria-label="Navigasi utama"
        >
            <div className="flex items-center justify-between px-3">
                <BrandMark inverted />
                <button
                    type="button"
                    onClick={onClose}
                    className="grid h-10 w-10 place-items-center rounded-xl text-blue-100 hover:bg-white/10 hover:text-white lg:hidden"
                    aria-label="Tutup navigasi"
                >
                    <X aria-hidden="true" className="h-5 w-5" />
                </button>
            </div>

            <nav className="mt-10 min-h-0 space-y-5 overflow-y-auto text-sm font-semibold" aria-label="Navigasi utama">
                {navigation.map((section) => (
                        <div key={section.label}>
                            <p className="px-4 text-xs font-bold uppercase tracking-wider text-blue-300">{section.label}</p>
                            <div className="mt-2 space-y-2">
                                {section.items.map((item) => {
                                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                                    const Icon = item.icon;

                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={onClose}
                                            className={`flex items-center gap-3 rounded-xl px-4 py-3 ${isActive ? 'bg-white/12 text-white' : 'text-blue-200 hover:bg-white/8 hover:text-white'}`}
                                        >
                                            <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                                            {item.label}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
            </nav>

            <div className="mt-6 rounded-2xl bg-white/8 p-4">
                <p className="text-xs uppercase tracking-wider text-blue-300">Akses Anda</p>
                <p className="mt-1 font-bold capitalize text-white">{role}</p>
                <p className="mt-2 text-xs leading-5 text-blue-200">
                    {role === 'admin' ? 'Akses penuh untuk seluruh data.' : role === 'staff' ? 'Akses data master dan operasional.' : 'Akses data master, operasional, keuangan, dan analisis.'}
                </p>
            </div>
        </aside>
    );
}
