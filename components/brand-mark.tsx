import Link from 'next/link';

type BrandMarkProps = {
    compact?: boolean;
    href?: string;
    inverted?: boolean;
};

export function BrandMark({ compact = false, href = '/dashboard', inverted = false }: BrandMarkProps) {
    const markSize = compact ? 'h-9 w-9 text-xs' : 'h-10 w-10 text-sm';
    const markColor = inverted ? 'bg-blue-500' : 'bg-blue-600';
    const textColor = inverted ? 'text-white' : 'text-[#0b1f4c]';

    return (
        <Link href={href} className="flex items-center gap-2.5">
            <span className={`grid ${markSize} place-items-center rounded-xl ${markColor} font-bold text-white`}>
                TG
            </span>
            <span className={`text-xl font-bold ${textColor}`}>
                Tech <span className={inverted ? 'text-cyan-300' : 'text-blue-600'}>Gate</span>
            </span>
        </Link>
    );
}
