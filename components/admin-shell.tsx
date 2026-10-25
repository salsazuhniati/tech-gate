import { AdminHeader } from './admin-header';
import { AdminSidebar } from './admin-sidebar';
import type { UserRole } from '../lib/auth/profile';

type AdminShellProps = Readonly<{
    children: React.ReactNode;
    userName: string;
    role: UserRole;
}>;

export function AdminShell({ children, userName, role }: AdminShellProps) {
    return (
        <div className="flex min-h-screen bg-[#f7faff] text-slate-800">
            <AdminSidebar role={role} />
            <div className="min-w-0 flex-1">
                <AdminHeader userName={userName} role={role} />
                <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">{children}</main>
            </div>
        </div>
    );
}
