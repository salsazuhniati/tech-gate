'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { UserRole } from '../lib/auth/profile';
import { getNavigationForRole } from '../lib/auth/permissions';
import { BrandMark } from './brand-mark';

type AdminSidebarProps = {
    role: UserRole;
};

export function AdminSidebar({ role }: AdminSidebarProps) {
    const pathname = usePathname();
    const navigation = getNavigationForRole(role);

    return (
        <aside className="hidden w-64 shrink-0 flex-col bg-[#071b47] px-4 py-6 text-blue-100 lg:flex">
            <div className="px-3">
                <BrandMark inverted />
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
