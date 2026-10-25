export default function DashboardLoading() {
    return (
        <div aria-live="polite" aria-busy="true">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-3">
                    <div className="h-4 w-32 animate-pulse rounded bg-blue-100" />
                    <div className="h-9 w-64 animate-pulse rounded bg-slate-100" />
                    <div className="h-5 w-80 animate-pulse rounded bg-slate-100" />
                </div>
                <div className="h-11 w-36 animate-pulse rounded-xl bg-blue-100" />
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, index) => (
                    <div key={index} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
                        <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                        <div className="mt-4 h-9 w-32 animate-pulse rounded bg-slate-100" />
                        <div className="mt-4 h-6 w-28 animate-pulse rounded-full bg-slate-100" />
                    </div>
                ))}
            </div>
        </div>
    );
}
