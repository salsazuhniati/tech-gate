import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnvironment } from './environment';

function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
    from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));

    return to;
}

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request });
    const { url, publishableKey } = getSupabaseEnvironment();
    const supabase = createServerClient(url, publishableKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                supabaseResponse = NextResponse.next({ request });
                cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
            },
        },
    });

    const { data: claimsResult } = await supabase.auth.getClaims();
    const claims = claimsResult?.claims;
    const hasSession = typeof claims?.sub === 'string';
    const { pathname } = request.nextUrl;

    const isAdminPath = ['/dashboard', '/products', '/categories', '/suppliers', '/customers', '/inventory', '/sales', '/purchase-orders', '/finance', '/reports', '/users', '/settings'].some(
        (path) => pathname === path || pathname.startsWith(`${path}/`),
    );

    if (!hasSession && isAdminPath) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = '/login';
        return copyCookies(supabaseResponse, NextResponse.redirect(loginUrl));
    }

    if (hasSession && pathname === '/login') {
        const dashboardUrl = request.nextUrl.clone();
        dashboardUrl.pathname = '/dashboard';
        return copyCookies(supabaseResponse, NextResponse.redirect(dashboardUrl));
    }

    return supabaseResponse;
}
