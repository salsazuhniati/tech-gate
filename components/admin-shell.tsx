'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AdminHeader } from './admin-header';
import { AdminSidebar } from './admin-sidebar';
import type { UserRole } from '../lib/auth/profile';

type AdminShellProps = Readonly<{
    children: React.ReactNode;
    userName: string;
    role: UserRole;
}>;

export function AdminShell({ children, userName, role }: AdminShellProps) {
    const [isNavigationOpen, setIsNavigationOpen] = useState(false);
    const pathname = usePathname();

    useEffect(() => {
        setIsNavigationOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (!isNavigationOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsNavigationOpen(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isNavigationOpen]);

    return (
        <div className="flex min-h-screen bg-[#f7faff] text-slate-800">
            {isNavigationOpen && (
                <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default bg-slate-950/40 lg:hidden"
                    aria-label="Tutup navigasi"
                    onClick={() => setIsNavigationOpen(false)}
                />
            )}
            <AdminSidebar role={role} isOpen={isNavigationOpen} onClose={() => setIsNavigationOpen(false)} />
            <div className="min-w-0 flex-1">
                <AdminHeader userName={userName} role={role} isMenuOpen={isNavigationOpen} onMenuOpen={() => setIsNavigationOpen(true)} />
                <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">{children}</main>
            </div>
        </div>
    );
}
