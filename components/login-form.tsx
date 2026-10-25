'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase/client';

export function LoginForm() {
    const router = useRouter();
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setErrorMessage(null);

        const formData = new FormData(event.currentTarget);

        try {
            const supabase = createClient();
            const { error } = await supabase.auth.signInWithPassword({
                email: String(formData.get('email')),
                password: String(formData.get('password')),
            });

            if (error) {
                setErrorMessage('Email atau kata sandi tidak sesuai.');

                return;
            }

            router.replace('/dashboard');
            router.refresh();
        } catch {
            setErrorMessage('Email atau kata sandi tidak sesuai.');
        }
    }

    return (
        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div>
                <label className="mb-2 block text-sm font-bold text-slate-700" htmlFor="email">
                    Email
                </label>
                <input
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                />
                {errorMessage && <p className="mt-2 text-sm text-red-600">{errorMessage}</p>}
            </div>
            <div>
                <label className="mb-2 block text-sm font-bold text-slate-700" htmlFor="password">
                    Kata sandi
                </label>
                <input
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    id="password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
                <input className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" name="remember" type="checkbox" />
                Ingat saya
            </label>
            <button className="w-full rounded-xl bg-blue-600 px-5 py-3.5 font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700" type="submit">
                Masuk ke Panel →
            </button>
        </form>
    );
}
